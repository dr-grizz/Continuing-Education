import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  filterCanvasCourses,
  parseCanvasCourseFilters,
} from "../domain/canvas-course-filters";
import { missingOfferingInfo } from "../domain/offering-readiness";
import { canvasCourseDay } from "../domain/canvas-course-filters";
import { createHash, randomUUID } from "node:crypto";
import { prisma, sql, transaction, Tx } from "../domain/prisma";
import { Principal } from "./auth";
import {
  courseConnectionConfig,
  courseFingerprint,
  courseReadsEnabled,
} from "./canvas-course-config";
import {
  CanvasCourse,
  CanvasCourseClient,
  CanvasReadError,
} from "./canvas-course-client";
import { canvasStaffConfig } from "./staff-auth-config";
import {
  grantBinding,
  openCanvasTokens,
  parseCanvasTokens,
  sealCanvasTokens,
} from "./canvas-tokens";
import { scopesFor } from "./roles";
import { audit } from "./service";
import {
  expireCoursePreviews,
  PREVIEW_TTL_MS,
  readCoursePreview,
  removeCoursePreview,
  writeCoursePreview,
} from "./canvas-course-previews";

type SyncedCourse = CanvasCourse & {
  synced_at?: string;
  source_observed_at?: string;
  source_run_id?: string;
};
function sameCourse(a: CanvasCourse, b: CanvasCourse) {
  return (
    [
      "id",
      "account_id",
      "name",
      "course_code",
      "workflow_state",
      "start_at",
      "end_at",
      "url",
    ] as const
  ).every((key) => a[key] === b[key]);
}
function savedRevision(snapshot: { run_id: string; courses: unknown } | null) {
  return createHash("sha256")
    .update(JSON.stringify([snapshot?.run_id ?? null, snapshot?.courses ?? []]))
    .digest("hex");
}
function settings() {
  try {
    const auth = canvasStaffConfig();
    const connection = courseConnectionConfig();
    return {
      ...auth,
      ...connection,
      origin: new URL(auth.tokenUrl).origin,
      hash: courseFingerprint(
        auth.fingerprint,
        connection.accountId,
        connection.nested,
      ),
    };
  } catch {
    throw new ServiceUnavailableException(
      "Canvas course reads are not configured. Set the course-read settings on the server.",
    );
  }
}
async function lock(tx: Tx) {
  await sql(
    tx,
    "SELECT 1 FROM (SELECT pg_advisory_xact_lock(21001018)) AS locked",
  );
}
@Injectable()
export class CanvasCoursesService {
  request: typeof fetch = (...args) => fetch(...args);

  private async authorizedStaff(staffId: string) {
    const config = settings();
    const member = await prisma.staff_members.findUnique({
      where: { id: staffId },
    });
    if (
      !member?.active ||
      member.auth_provider !== config.provider ||
      !member.external_subject ||
      !scopesFor(member.roles).includes("canvas:sync")
    )
      throw new ForbiddenException(
        "An active, authorized Canvas-linked staff account is required.",
      );
    return { config, member };
  }
  async accessToken(staffId: string, forceRefresh = false) {
    const { config, member } = await this.authorizedStaff(staffId);
    const result = await transaction(async (tx) => {
      await sql(
        tx,
        "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext($1))) AS locked",
        `canvas-token:${staffId}`,
      );
      // A row lock also serializes this refresh with a new OAuth login.
      await sql(
        tx,
        "SELECT staff_id FROM staff_canvas_grants WHERE staff_id=$1::uuid FOR UPDATE",
        staffId,
      );
      const grant = await tx.staff_canvas_grants.findUnique({
        where: { staff_id: staffId },
      });
      if (
        !grant ||
        grant.provider !== config.provider ||
        grant.subject !== member.external_subject ||
        grant.configuration_hash !== config.fingerprint
      )
        throw new CanvasReadError("authorization");
      const binding = grantBinding(
        staffId,
        grant.provider,
        grant.subject,
        grant.configuration_hash,
      );
      const tokens = openCanvasTokens(grant.encrypted_tokens, binding);
      if (!forceRefresh && grant.expires_at.getTime() > Date.now() + 60_000)
        return tokens.accessToken;
      let response: Response;
      try {
        response = await this.request(config.tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": config.userAgent,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            refresh_token: tokens.refreshToken,
          }),
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        throw new CanvasReadError("unavailable");
      }
      if ([400, 401].includes(response.status)) {
        await tx.staff_canvas_grants.delete({ where: { staff_id: staffId } });
        await audit(
          tx,
          `staff:${staffId}`,
          "canvas.authorization_expired",
          staffId,
        );
        return null;
      }
      if (!response.ok) throw new CanvasReadError("unavailable");
      let payload: any;
      try {
        payload = await response.json();
      } catch {
        throw new CanvasReadError("invalid");
      }
      const refreshed = parseCanvasTokens(payload, tokens.refreshToken);
      await tx.staff_canvas_grants.update({
        where: { staff_id: staffId },
        data: {
          encrypted_tokens: sealCanvasTokens(refreshed.tokens, binding),
          expires_at: refreshed.expiresAt,
          updated_at: new Date(),
        },
      });
      return refreshed.tokens.accessToken;
    });
    if (!result) throw new CanvasReadError("authorization");
    return result;
  }

  async view(
    principal: Principal,
    page = 1,
    query: Record<string, unknown> = {},
  ) {
    if (
      query.view !== undefined &&
      !["preview", "synced"].includes(String(query.view))
    )
      throw new BadRequestException("Invalid course view.");
    let filters;
    try {
      filters = parseCanvasCourseFilters(query);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const pageSize = Number(query.pageSize ?? 100);
    if (![10, 25, 50, 100].includes(pageSize))
      throw new BadRequestException("Invalid page size.");
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new BadRequestException("Invalid page.");
    let config: ReturnType<typeof settings> | undefined;
    try {
      config = settings();
    } catch {}
    const schedule = await prisma.canvas_course_schedule.findUnique({
      where: { id: "default" },
    });
    const owner = schedule?.owner_staff_id
      ? await prisma.staff_members.findUnique({
          where: { id: schedule.owner_staff_id },
          select: { display_name: true, active: true },
        })
      : null;
    const grant = principal.staffId
      ? await prisma.staff_canvas_grants.findUnique({
          where: { staff_id: principal.staffId },
          select: { provider: true, subject: true, configuration_hash: true },
        })
      : null;
    const member = principal.staffId
      ? await prisma.staff_members.findUnique({
          where: { id: principal.staffId },
        })
      : null;
    const snapshot = config
      ? await prisma.canvas_course_snapshots.findUnique({
          where: { configuration_hash: config.hash },
        })
      : null;
    const latest = config
      ? await prisma.canvas_course_runs.findFirst({
          where: { configuration_hash: config.hash },
          orderBy: { created_at: "desc" },
        })
      : null;
    const connected = Boolean(
      config &&
      grant &&
      member?.active &&
      grant.provider === config.provider &&
      grant.subject === member.external_subject &&
      grant.configuration_hash === config.fingerprint,
    );
    const ownRead =
      config && connected
        ? await prisma.canvas_course_runs.findFirst({
            where: {
              configuration_hash: config.hash,
              staff_id: principal.staffId!,
              status: "succeeded",
              lease: { not: null },
            },
            orderBy: { finished_at: "desc" },
          })
        : null;
    const preview =
      ownRead && config
        ? await readCoursePreview(
            ownRead.id,
            ownRead.lease!,
            principal.staffId!,
            config.hash,
          )
        : null;
    const savedCourses =
      (snapshot?.courses as SyncedCourse[] | undefined) || [];
    const savedById = new Map(
      savedCourses.map((course) => [course.id, course]),
    );
    const courses =
      query.view === "synced"
        ? savedCourses
        : query.view === "preview"
          ? preview?.courses || []
          : preview?.courses || savedCourses;
    const mappings = config
      ? await prisma.canvas_offering_mappings.findMany({
          where: {
            installation_url: config.origin,
            course_id: { in: courses.map((course) => course.id) },
          },
          include: { offering: true },
        })
      : [];
    const mappingById = new Map(
      mappings.map((mapping) => [mapping.course_id, mapping]),
    );
    const annotated = courses.map((course) => {
      const saved = savedById.get(course.id);
      const mapping = mappingById.get(course.id);
      return {
        ...course,
        offering_id: mapping?.offering_id || null,
        offering_title: mapping?.offering.title || null,
        offering_missing_fields: mapping
          ? missingOfferingInfo(mapping.offering)
          : [],
        sync_status: saved
          ? sameCourse(saved, course)
            ? "synced"
            : "changes"
          : "not_synced",
        synced_at:
          saved?.synced_at ||
          (saved ? snapshot!.observed_at.toISOString() : null),
      };
    });
    const filteredCourses = filterCanvasCourses(annotated, filters);
    let enabled = false;
    try {
      enabled = courseReadsEnabled();
    } catch {}
    return {
      enabled,
      configured: Boolean(config),
      connected,
      subaccount_id: config?.accountId || null,
      include_subaccounts: config?.nested || false,
      last_success_at: snapshot?.observed_at || null,
      saved_run_id: snapshot?.run_id || null,
      saved_revision: savedRevision(snapshot),
      synced_total: savedCourses.length,
      preview: preview
        ? {
            run_id: preview.runId,
            expires_at: preview.expiresAt,
            observed_at: preview.observedAt,
            total: preview.courses.length,
          }
        : null,
      preview_expired: Boolean(
        ownRead && !preview && ownRead.id !== snapshot?.run_id,
      ),
      source:
        query.view === "synced"
          ? "saved"
          : preview || query.view === "preview"
            ? "preview"
            : "saved",
      latest_run: latest ? this.publicRun(latest) : null,
      schedule: {
        enabled: schedule?.enabled || false,
        interval_minutes: schedule?.interval_minutes || 60,
        next_run_at: schedule?.next_run_at || null,
        owner_name: owner?.display_name || null,
        owner_active: owner?.active || false,
        version: schedule?.version || 0,
      },
      courses: filteredCourses.slice((page - 1) * pageSize, page * pageSize),
      total: filteredCourses.length,
      source_total: courses?.length || 0,
      page,
      page_size: pageSize,
    };
  }
  private publicRun(run: {
    id: string;
    status: string;
    trigger: string;
    created_at: Date;
    finished_at: Date | null;
    course_count: number;
    error: string | null;
  }) {
    return {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      created_at: run.created_at,
      finished_at: run.finished_at,
      course_count: run.course_count,
      error: run.error,
    };
  }
  async runStatus(id: string) {
    const config = settings();
    const run = await prisma.canvas_course_runs.findFirst({
      where: { id, configuration_hash: config.hash },
    });
    if (!run) throw new NotFoundException("Course read not found.");
    return this.publicRun(run);
  }
  async savePreview(
    principal: Principal,
    id: string,
    previousSavedRunId: string | null,
  ) {
    const { config } = await this.authorizedStaff(principal.staffId!);
    const run = await prisma.canvas_course_runs.findFirst({
      where: {
        id,
        staff_id: principal.staffId!,
        configuration_hash: config.hash,
        status: "succeeded",
      },
    });
    if (!run) throw new NotFoundException("Course preview not found.");
    const saved = await prisma.canvas_course_snapshots.findUnique({
      where: { configuration_hash: config.hash },
    });
    if (saved?.run_id === run.id)
      return { saved: true, run_id: run.id, course_count: run.course_count };
    const preview = run.lease
      ? await readCoursePreview(
          run.id,
          run.lease,
          principal.staffId!,
          config.hash,
        )
      : null;
    if (!preview)
      throw new ConflictException(
        "This preview expired or is unavailable. Preview the courses again before saving.",
      );
    const result = await transaction(async (tx) => {
      await lock(tx);
      await sql(
        tx,
        "SELECT id FROM staff_members WHERE id=$1::uuid FOR SHARE",
        principal.staffId!,
      );
      const member = await tx.staff_members.findUnique({
        where: { id: principal.staffId! },
      });
      const grant = await tx.staff_canvas_grants.findUnique({
        where: { staff_id: principal.staffId! },
      });
      if (
        !member?.active ||
        !scopesFor(member.roles).includes("canvas:sync") ||
        member.auth_provider !== config.provider ||
        !grant ||
        grant.provider !== config.provider ||
        grant.subject !== member.external_subject ||
        grant.configuration_hash !== config.fingerprint
      )
        throw new ForbiddenException(
          "Your Canvas authorization is no longer available.",
        );
      const current = await tx.canvas_course_snapshots.findUnique({
        where: { configuration_hash: config.hash },
      });
      if (current?.run_id === run.id)
        return { saved: true, run_id: run.id, course_count: run.course_count };
      if (
        (current?.run_id || null) !== previousSavedRunId ||
        (current && current.observed_at > new Date(preview.observedAt))
      )
        throw new ConflictException(
          "Saved courses changed. Refresh and review the latest preview before saving.",
        );
      const newest = await tx.canvas_course_runs.findFirst({
        where: {
          configuration_hash: config.hash,
          staff_id: principal.staffId!,
          status: "succeeded",
        },
        orderBy: { finished_at: "desc" },
      });
      if (newest?.id !== run.id || Date.parse(preview.expiresAt) <= Date.now())
        throw new ConflictException(
          "A newer preview exists or this preview expired. Refresh before saving.",
        );
      const snapshot = {
        run_id: run.id,
        observed_at: new Date(preview.observedAt),
        courses: preview.courses,
      };
      await tx.canvas_course_snapshots.upsert({
        where: { configuration_hash: config.hash },
        create: { configuration_hash: config.hash, ...snapshot },
        update: snapshot,
      });
      await audit(tx, principal.actor, "canvas.preview_saved", run.id, {
        course_count: preview.courses.length,
      });
      return {
        saved: true,
        run_id: run.id,
        course_count: preview.courses.length,
      };
    });
    await removeCoursePreview(run.id, run.lease!);
    return result;
  }
  async syncCourses(
    principal: Principal,
    id: string,
    courseIds: string[],
    revision: string,
  ) {
    const { config } = await this.authorizedStaff(principal.staffId!);
    const run = await prisma.canvas_course_runs.findFirst({
      where: {
        id,
        staff_id: principal.staffId!,
        configuration_hash: config.hash,
        status: "succeeded",
      },
    });
    if (!run) throw new NotFoundException("Course preview not found.");
    const preview = run.lease
      ? await readCoursePreview(
          run.id,
          run.lease,
          principal.staffId!,
          config.hash,
        )
      : null;
    if (!preview)
      throw new ConflictException(
        "This preview expired or is unavailable. Preview the courses again before syncing.",
      );
    const byId = new Map(preview.courses.map((course) => [course.id, course]));
    if (
      !courseIds.length ||
      new Set(courseIds).size !== courseIds.length ||
      courseIds.some((courseId) => !byId.has(courseId))
    )
      throw new BadRequestException("Select valid courses from this preview.");
    return transaction(async (tx) => {
      await lock(tx);
      await sql(
        tx,
        "SELECT id FROM staff_members WHERE id=$1::uuid FOR SHARE",
        principal.staffId!,
      );
      const member = await tx.staff_members.findUnique({
        where: { id: principal.staffId! },
      });
      const grant = await tx.staff_canvas_grants.findUnique({
        where: { staff_id: principal.staffId! },
      });
      if (
        !member?.active ||
        !scopesFor(member.roles).includes("canvas:sync") ||
        member.auth_provider !== config.provider ||
        !grant ||
        grant.provider !== config.provider ||
        grant.subject !== member.external_subject ||
        grant.configuration_hash !== config.fingerprint
      )
        throw new ForbiddenException(
          "Your Canvas authorization is no longer available.",
        );
      const newest = await tx.canvas_course_runs.findFirst({
        where: {
          configuration_hash: config.hash,
          staff_id: principal.staffId!,
          status: "succeeded",
        },
        orderBy: { finished_at: "desc" },
      });
      if (newest?.id !== run.id || Date.parse(preview.expiresAt) <= Date.now())
        throw new ConflictException(
          "A newer preview exists or this preview expired. Refresh before syncing.",
        );
      const current = await tx.canvas_course_snapshots.findUnique({
        where: { configuration_hash: config.hash },
      });
      const currentCourses =
        (current?.courses as SyncedCourse[] | undefined) || [];
      const merged = new Map(
        currentCourses.map((course) => [course.id, course]),
      );
      const existingMappings = await tx.canvas_offering_mappings.findMany({
        where: {
          installation_url: config.origin,
          course_id: { in: courseIds },
        },
      });
      const mappedIds = new Set(
        existingMappings.map((mapping) => mapping.course_id),
      );
      // Repeating an already-applied selection is safe, even after the response was lost.
      if (
        courseIds.every((courseId) => {
          const saved = merged.get(courseId);
          return (
            saved &&
            mappedIds.has(courseId) &&
            sameCourse(saved, byId.get(courseId)!)
          );
        })
      )
        return {
          synced: true,
          course_count: courseIds.length,
          synced_total: currentCourses.length,
          created_count: 0,
          existing_count: courseIds.length,
        };
      if (savedRevision(current) !== revision)
        throw new ConflictException(
          "Synced courses changed. Refresh, review and select the courses again.",
        );
      for (const courseId of courseIds) {
        const saved = merged.get(courseId);
        if (
          saved &&
          Date.parse(
            saved.source_observed_at || current!.observed_at.toISOString(),
          ) > Date.parse(preview.observedAt)
        )
          throw new ConflictException(
            "A selected course has newer synced details. Preview the courses again.",
          );
      }
      let createdCount = 0;
      const possibleDuplicates = await tx.offerings.findMany({
        where: { canvas_course_url: { not: null } },
        select: { id: true, title: true, canvas_course_url: true },
      });
      for (const courseId of courseIds) {
        const source = byId.get(courseId)!;
        if (!mappedIds.has(courseId)) {
          const duplicate = possibleDuplicates.find((offering) => {
            try {
              const url = new URL(offering.canvas_course_url!);
              return (
                url.origin === config.origin &&
                url.pathname.replace(/\/$/, "") === `/courses/${courseId}`
              );
            } catch {
              return false;
            }
          });
          if (duplicate)
            throw new ConflictException(
              `Canvas course ${courseId} already has an offering: ${duplicate.title} (${duplicate.id}). Review the existing offering before importing; no duplicate was created.`,
            );
          let start = canvasCourseDay(source.start_at),
            end = canvasCourseDay(source.end_at);
          // Retain invalid source dates in the mapping, but require staff to set a valid schedule.
          if (start && end && end < start) start = end = null;
          const offering = await tx.offerings.create({
            data: {
              title: source.name,
              category: "",
              summary: "",
              description: "",
              format: "",
              price_cents: null,
              capacity: null,
              course_type: null,
              start_date: start ? new Date(start) : null,
              end_date: end ? new Date(end) : null,
              canvas_course_url: source.url,
              imported_from_canvas: true,
              published: false,
            },
          });
          await tx.canvas_offering_mappings.create({
            data: {
              installation_url: config.origin,
              course_id: courseId,
              offering_id: offering.id,
              source,
            },
          });
          await audit(
            tx,
            principal.actor,
            "offering.imported_from_canvas",
            offering.id,
            { course_id: courseId, installation_url: config.origin },
          );
          createdCount++;
        } else {
          // Offering fields belong to staff after creation. Refresh only the source metadata.
          await tx.canvas_offering_mappings.update({
            where: {
              installation_url_course_id: {
                installation_url: config.origin,
                course_id: courseId,
              },
            },
            data: { source, updated_at: new Date() },
          });
        }
      }
      const now = new Date();
      for (const courseId of courseIds)
        merged.set(courseId, {
          ...byId.get(courseId)!,
          synced_at: now.toISOString(),
          source_observed_at: preview.observedAt,
          source_run_id: run.id,
        });
      const snapshot = {
        run_id: run.id,
        observed_at: now,
        courses: [...merged.values()],
      };
      await tx.canvas_course_snapshots.upsert({
        where: { configuration_hash: config.hash },
        create: { configuration_hash: config.hash, ...snapshot },
        update: snapshot,
      });
      await audit(tx, principal.actor, "canvas.courses_synced", run.id, {
        course_ids: courseIds,
        course_count: courseIds.length,
      });
      return {
        synced: true,
        course_count: courseIds.length,
        synced_total: merged.size,
        created_count: createdCount,
        existing_count: courseIds.length - createdCount,
      };
    });
  }
  async enqueue(staffId: string, key: string, trigger = "manual") {
    const { config, member } = await this.authorizedStaff(staffId);
    const grant = await prisma.staff_canvas_grants.findUnique({
      where: { staff_id: staffId },
    });
    if (
      !grant ||
      grant.configuration_hash !== config.fingerprint ||
      grant.subject !== member.external_subject ||
      grant.provider !== config.provider
    )
      throw new ConflictException(
        "Sign in with Canvas again to authorize course reads.",
      );
    return transaction(async (tx) => {
      await lock(tx);
      const replay = await tx.canvas_course_runs.findUnique({
        where: {
          staff_id_request_key: { staff_id: staffId, request_key: key },
        },
      });
      if (replay) {
        if (replay.configuration_hash !== config.hash)
          throw new ConflictException(
            "This request key belongs to a different course connection.",
          );
        return this.publicRun(replay);
      }
      const running = await tx.canvas_course_runs.findFirst({
        where: { status: { in: ["pending", "running"] } },
        orderBy: { created_at: "asc" },
      });
      if (running) {
        if (
          running.staff_id === staffId &&
          running.configuration_hash === config.hash
        )
          return this.publicRun(running);
        throw new ConflictException(
          "Another course read is already queued or running. Try again after it finishes.",
        );
      }
      const run = await tx.canvas_course_runs.create({
        data: {
          staff_id: staffId,
          request_key: key,
          trigger,
          configuration_hash: config.hash,
        },
      });
      await audit(
        tx,
        trigger === "scheduled"
          ? `canvas-schedule:${staffId}`
          : `staff:${staffId}`,
        "canvas.courses_queued",
        run.id,
        { trigger },
      );
      return this.publicRun(run);
    });
  }
  async setSchedule(
    principal: Principal,
    input: { enabled: boolean; intervalMinutes: number; version: number },
  ) {
    if (input.enabled) {
      const { config, member } = await this.authorizedStaff(principal.staffId!);
      const grant = await prisma.staff_canvas_grants.findUnique({
        where: { staff_id: principal.staffId! },
      });
      if (
        !grant ||
        grant.configuration_hash !== config.fingerprint ||
        grant.provider !== config.provider ||
        grant.subject !== member.external_subject
      )
        throw new ConflictException(
          "Sign in with Canvas again before enabling scheduled reads.",
        );
      const preview = await prisma.canvas_course_snapshots.findUnique({
        where: { configuration_hash: config.hash },
      });
      if (!preview)
        throw new ConflictException(
          "Save a reviewed course preview before enabling scheduled reads.",
        );
    }
    return transaction(async (tx) => {
      await lock(tx);
      const current = await tx.canvas_course_schedule.findUnique({
        where: { id: "default" },
      });
      if ((current?.version || 0) !== input.version)
        throw new ConflictException("Schedule changed. Refresh and try again.");
      const data = {
        enabled: input.enabled,
        interval_minutes: input.intervalMinutes,
        owner_staff_id: input.enabled
          ? principal.staffId!
          : current?.owner_staff_id || null,
        next_run_at: input.enabled
          ? new Date(Date.now() + input.intervalMinutes * 60_000)
          : null,
        version: input.version + 1,
      };
      await tx.canvas_course_schedule.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
      await audit(tx, principal.actor, "canvas.schedule_changed", null, {
        enabled: input.enabled,
        interval_minutes: input.intervalMinutes,
      });
      return { saved: true };
    });
  }
  async disconnect(principal: Principal) {
    await transaction(async (tx) => {
      await lock(tx);
      await tx.staff_canvas_grants.deleteMany({
        where: { staff_id: principal.staffId! },
      });
      await tx.canvas_course_schedule.updateMany({
        where: { owner_staff_id: principal.staffId! },
        data: { enabled: false, next_run_at: null, version: { increment: 1 } },
      });
      await tx.canvas_course_runs.updateMany({
        where: {
          staff_id: principal.staffId!,
          status: { in: ["pending", "running"] },
        },
        data: {
          status: "failed",
          error: "Canvas authorization disconnected.",
          finished_at: new Date(),
          lease: null,
          lease_expires_at: null,
        },
      });
      await audit(
        tx,
        principal.actor,
        "canvas.authorization_disconnected",
        principal.staffId!,
      );
    });
    return { disconnected: true };
  }
  async workerStep() {
    await expireCoursePreviews();
    // Disabled installations perform no connector database or Canvas work.
    let config: ReturnType<typeof settings>;
    try {
      config = settings();
    } catch {
      return;
    }
    const schedule = await prisma.canvas_course_schedule.findUnique({
      where: { id: "default" },
    });
    if (
      schedule?.enabled &&
      schedule.owner_staff_id &&
      schedule.next_run_at &&
      schedule.next_run_at <= new Date()
    ) {
      try {
        const { member } = await this.authorizedStaff(schedule.owner_staff_id);
        const grant = await prisma.staff_canvas_grants.findUnique({
          where: { staff_id: schedule.owner_staff_id },
        });
        if (
          !grant ||
          grant.configuration_hash !== config.fingerprint ||
          grant.subject !== member.external_subject
        )
          throw new CanvasReadError("authorization");
        if (!scopesFor(member.roles).includes("canvas:manage"))
          throw new ForbiddenException();
        await this.enqueue(
          schedule.owner_staff_id,
          `scheduled:${schedule.next_run_at.toISOString()}`,
          "scheduled",
        );
        await prisma.canvas_course_schedule.updateMany({
          where: {
            id: "default",
            version: schedule.version,
            next_run_at: schedule.next_run_at,
          },
          data: {
            next_run_at: new Date(
              Date.now() + schedule.interval_minutes * 60_000,
            ),
          },
        });
      } catch (error) {
        if (!(error instanceof ConflictException)) {
          await prisma.canvas_course_schedule.updateMany({
            where: { id: "default", version: schedule.version },
            data: {
              enabled: false,
              next_run_at: null,
              version: { increment: 1 },
            },
          });
        }
      }
    }
    const run = await transaction(async (tx) => {
      await lock(tx);
      // Fence abandoned attempts. Two crashed attempts require an explicit retry.
      await tx.canvas_course_runs.updateMany({
        where: {
          status: "running",
          lease_expires_at: { lte: new Date() },
          attempts: { gte: 2 },
        },
        data: {
          status: "failed",
          error: "Course read interrupted twice. Use Preview courses to retry.",
          finished_at: new Date(),
          lease: null,
        },
      });
      const active = await tx.canvas_course_runs.findFirst({
        where: { status: "running", lease_expires_at: { gt: new Date() } },
      });
      if (active) return null;
      const next = await tx.canvas_course_runs.findFirst({
        where: {
          OR: [
            { status: "pending" },
            {
              status: "running",
              lease_expires_at: { lte: new Date() },
              attempts: { lt: 2 },
            },
          ],
        },
        orderBy: { created_at: "asc" },
      });
      if (!next) return null;
      return tx.canvas_course_runs.update({
        where: { id: next.id },
        data: {
          status: "running",
          attempts: { increment: 1 },
          lease: randomUUID(),
          lease_expires_at: new Date(Date.now() + 180_000),
        },
      });
    });
    if (!run) return;
    try {
      if (run.configuration_hash !== config.hash)
        throw new CanvasReadError("invalid");
      if (run.trigger === "scheduled") {
        const owner = await this.authorizedStaff(run.staff_id);
        const currentSchedule = await prisma.canvas_course_schedule.findUnique({
          where: { id: "default" },
        });
        if (
          !currentSchedule?.enabled ||
          currentSchedule.owner_staff_id !== run.staff_id ||
          !scopesFor(owner.member.roles).includes("canvas:manage")
        )
          throw new CanvasReadError("authorization");
      }
      const client = new CanvasCourseClient(
        config.origin,
        config.userAgent,
        (force) => this.accessToken(run.staff_id, force),
        AbortSignal.timeout(120_000),
        this.request,
      );
      const courses = await client.discover(config.accountId, config.nested);
      const current = await this.authorizedStaff(run.staff_id);
      if (current.config.hash !== run.configuration_hash)
        throw new CanvasReadError("invalid");
      const observedAt = new Date();
      await writeCoursePreview(
        {
          runId: run.id,
          staffId: run.staff_id,
          configurationHash: config.hash,
          observedAt: observedAt.toISOString(),
          expiresAt: new Date(
            observedAt.getTime() + PREVIEW_TTL_MS,
          ).toISOString(),
          courses,
        },
        run.lease!,
      );
      const committed = await transaction(async (tx) => {
        await lock(tx);
        await sql(
          tx,
          "SELECT id FROM staff_members WHERE id=$1::uuid FOR SHARE",
          run.staff_id,
        );
        const member = await tx.staff_members.findUnique({
          where: { id: run.staff_id },
        });
        const grant = await tx.staff_canvas_grants.findUnique({
          where: { staff_id: run.staff_id },
        });
        if (
          !member?.active ||
          member.auth_provider !== config.provider ||
          !scopesFor(member.roles).includes("canvas:sync") ||
          !grant ||
          grant.configuration_hash !== config.fingerprint ||
          grant.subject !== member.external_subject
        )
          throw new CanvasReadError("authorization");
        if (run.trigger === "scheduled") {
          const currentSchedule = await tx.canvas_course_schedule.findUnique({
            where: { id: "default" },
          });
          if (
            !currentSchedule?.enabled ||
            currentSchedule.owner_staff_id !== run.staff_id ||
            !scopesFor(member.roles).includes("canvas:manage")
          )
            throw new CanvasReadError("authorization");
        }
        const valid = await tx.canvas_course_runs.updateMany({
          where: {
            id: run.id,
            lease: run.lease,
            status: "running",
            lease_expires_at: { gt: new Date() },
          },
          data: {
            status: "succeeded",
            course_count: courses.length,
            finished_at: new Date(),
            lease_expires_at: null,
          },
        });
        if (!valid.count) return false;
        const previous = await tx.canvas_course_snapshots.findUnique({
          where: { configuration_hash: config.hash },
        });
        const previousRead = await tx.canvas_course_runs.findFirst({
          where: {
            configuration_hash: config.hash,
            status: "succeeded",
            id: { not: run.id },
            course_count: { gt: 0 },
          },
        });
        if (
          !courses.length &&
          ((Array.isArray(previous?.courses) && previous.courses.length) ||
            previousRead)
        )
          throw new CanvasReadError("invalid");
        await audit(
          tx,
          `staff:${run.staff_id}`,
          "canvas.preview_ready",
          run.id,
          { course_count: courses.length, trigger: run.trigger },
        );
        return true;
      });
      if (!committed) await removeCoursePreview(run.id, run.lease!);
    } catch (error) {
      await removeCoursePreview(run.id, run.lease!);
      const message =
        error instanceof CanvasReadError
          ? error.message
          : "Canvas course read failed. Check authorization and connection settings, then retry. The previous preview was retained.";
      await transaction(async (tx) => {
        await lock(tx);
        const updated = await tx.canvas_course_runs.updateMany({
          where: { id: run.id, lease: run.lease, status: "running" },
          data: {
            status: "failed",
            error: message,
            finished_at: new Date(),
            lease: null,
            lease_expires_at: null,
          },
        });
        if (updated.count)
          await audit(
            tx,
            `staff:${run.staff_id}`,
            "canvas.courses_failed",
            run.id,
            { message },
          );
        if (
          error instanceof CanvasReadError &&
          ["authorization", "permission"].includes(error.code)
        ) {
          await tx.canvas_course_schedule.updateMany({
            where: { owner_staff_id: run.staff_id, enabled: true },
            data: {
              enabled: false,
              next_run_at: null,
              version: { increment: 1 },
            },
          });
        }
      });
    }
  }
}
