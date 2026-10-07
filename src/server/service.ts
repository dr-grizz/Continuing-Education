import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  Prisma,
  type entitlements,
  type offerings,
  type SimulatedOutcome,
  type StaffRole,
} from "../generated/prisma/client";
import { DEMO_LEARNER } from "../domain/db";
import {
  offeringColumns,
  prisma,
  sql,
  transaction,
  Tx,
} from "../domain/prisma";
import {
  roleDescriptions,
  roleLabels,
  scopeDescriptions,
  scopesFor,
  staffRoles,
} from "./roles";
import {
  LearnerAccessDto,
  StaffMemberDto,
  StaffUpdateDto,
  OfferingDto,
  OfferingEditDto,
  OfferingSettingsDto,
  ProvisioningOutcome,
  QueryDto,
} from "./dto";
import { Principal } from "./auth";

// Scheduled courses close enrollment a staff-set number of days after they start.
const enrollmentWindow = `CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'YYYY-MM-DD') END AS enrollment_closes_on,
  CASE WHEN o.course_type='cohort' THEN to_char(o.start_date+o.enrollment_close_days,'Mon FMDD, YYYY') END AS enrollment_closes_label,
  (o.course_type<>'cohort' OR current_date<=o.start_date+o.enrollment_close_days) AS enrollment_open`;
const scheduleText = `to_char(o.start_date,'YYYY-MM-DD') AS start_date, to_char(o.end_date,'YYYY-MM-DD') AS end_date`;
const listing = `SELECT ${offeringColumns("o")},${enrollmentWindow},${scheduleText},
  (o.capacity - (SELECT count(*) FROM entitlements e WHERE e.offering_id=o.id AND
    (e.status IN ('provisioning','enrolled','exception') OR (e.status='reserved' AND e.reserved_until>now()))))::integer AS seats_available
  FROM offerings o`;
// Registrations that still depend on the offering's current terms.
const activeRegistrations = `(SELECT count(*) FROM entitlements a WHERE a.offering_id=o.id AND
  (a.status IN ('awaiting_approval','approved','provisioning','enrolled','exception') OR (a.status='reserved' AND a.reserved_until>now())))::integer`;
const seatsInUse = `(SELECT count(*) FROM entitlements s WHERE s.offering_id=o.id AND
  (s.status IN ('provisioning','enrolled','exception') OR (s.status='reserved' AND s.reserved_until>now())))::integer`;

// Row shapes for raw queries, derived from the Prisma models.
type ScheduleText = { start_date: string | null; end_date: string | null };
type EnrollmentWindow = {
  enrollment_closes_on: string | null;
  enrollment_closes_label: string | null;
  enrollment_open: boolean;
};
export type OfferingListing = Omit<offerings, "start_date" | "end_date"> &
  ScheduleText &
  EnrollmentWindow & {
    seats_available: number;
    active_registrations?: number;
    seats_in_use?: number;
  };
export type LearningRow = entitlements &
  ScheduleText &
  EnrollmentWindow &
  Pick<
    offerings,
    | "title"
    | "category"
    | "format"
    | "course_type"
    | "price_cents"
    | "approval_required"
    | "published"
    | "canvas_course_url"
  > & {
    operation_id: string | null;
    stage: string | null;
    operation_status: string | null;
    attempts: number | null;
  };

export async function audit(
  tx: Tx,
  actor: string,
  action: string,
  id: string | null,
  details: Prisma.InputJsonObject = {},
) {
  await tx.audit_events.create({
    data: { actor, action, object_id: id, details },
  });
}
function validateSchedule(data: OfferingDto) {
  if (data.courseType === "cohort") {
    if (
      !data.startDate ||
      !data.endDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)
    )
      throw new BadRequestException(
        "Cohort courses require YYYY-MM-DD start and end dates.",
      );
    if (data.endDate < data.startDate)
      throw new BadRequestException("End date must follow start date.");
  } else if (data.startDate != null || data.endDate != null) {
    throw new BadRequestException(
      "Learn-on-your-own courses start anytime; omit cohort dates.",
    );
  }
}
const staffSelect = {
  id: true,
  email: true,
  display_name: true,
  roles: true,
  active: true,
  version: true,
} as const;
// Prisma date columns take a Date; YYYY-MM-DD parses as UTC midnight, preserving the day.
const toDate = (value?: string | null) => (value ? new Date(value) : null);
// Command responses are stored as JSON, exactly as JSON.stringify renders them.
const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

@Injectable()
export class PortalService {
  async demoUser(email: string) {
    const normalized = email.trim().toLowerCase();
    // Matching where/create/update values let Prisma use a native ON CONFLICT upsert.
    const learner = await prisma.learners.upsert({
      where: { email: normalized },
      create: { email: normalized },
      update: { email: normalized },
      select: { id: true, email: true, created_at: true, active: true },
    });
    if (!learner.active)
      throw new ForbiddenException(
        "This learner account is deactivated. Contact the program office.",
      );
    const { active, ...profile } = learner;
    return profile;
  }
  async me(principal: Principal) {
    const learner = await prisma.learners.findUnique({
      where: { id: principal.learnerId },
      select: { id: true, email: true, created_at: true },
    });
    if (!learner) throw new NotFoundException("Demo learner not found.");
    return learner;
  }
  async list(query: QueryDto, staff = false) {
    // Staff also see how many registrations and seats depend on each offering.
    const select = staff
      ? listing.replace(
          "FROM offerings o",
          `,${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use FROM offerings o`,
        )
      : listing;
    return sql<OfferingListing>(
      prisma,
      `${select} WHERE ($1 OR o.published) AND ($2='' OR o.title ILIKE $2 OR o.summary ILIKE $2) AND ($3='' OR o.category=$3) ORDER BY o.start_date,o.title LIMIT 100`,
      staff,
      query.search ? `%${query.search}%` : "",
      query.category || "",
    );
  }
  async detail(id: string) {
    const [offering] = await sql<OfferingListing>(
      prisma,
      `${listing} WHERE o.id=$1::uuid AND o.published`,
      id,
    );
    if (!offering) throw new NotFoundException("Offering not found.");
    return offering;
  }
  async command(
    principal: Principal,
    key: string,
    input: unknown,
    action: (tx: Tx) => Promise<unknown>,
  ) {
    if (!key || key.length > 160)
      throw new BadRequestException(
        "Provide an Idempotency-Key header of 1–160 characters.",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return transaction(async (tx) => {
      // Serializes retries of the same actor-scoped key within this transaction.
      await sql(
        tx,
        "SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended($1,0))) l",
        `${principal.actor}:${key}`,
      );
      const previous = await tx.commands.findUnique({
        where: { actor_key: { actor: principal.actor, key } },
      });
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException(
            "Idempotency key was already used for a different command.",
          );
        return previous.response;
      }
      const response = await action(tx);
      await tx.commands.create({
        data: {
          actor: principal.actor,
          key,
          fingerprint,
          response: asJson(response),
        },
      });
      return response;
    });
  }
  async reserve(tx: Tx, offering: { id: string; capacity: number }) {
    const [occupied] = await sql<{ count: number }>(
      tx,
      `SELECT count(*)::integer AS count FROM entitlements WHERE offering_id=$1::uuid AND (status IN ('provisioning','enrolled','exception') OR (status='reserved' AND reserved_until>now()))`,
      offering.id,
    );
    if (occupied.count >= offering.capacity)
      throw new ConflictException("This offering has no available seats.");
  }
  async register(principal: Principal, key: string, offeringId: string) {
    return this.command(
      principal,
      key,
      { action: "register", offeringId },
      async (tx) => {
        // Row lock on the offering serializes final-seat allocation.
        const [offering] = await sql<offerings & EnrollmentWindow>(
          tx,
          `SELECT o.*,${enrollmentWindow} FROM offerings o WHERE o.id=$1::uuid AND o.published FOR UPDATE`,
          offeringId,
        );
        if (!offering) throw new NotFoundException("Offering not available.");
        const row = await tx.entitlements.findUnique({
          where: {
            learner_id_offering_id: {
              learner_id: principal.learnerId as string,
              offering_id: offeringId,
            },
          },
        });
        const now = Date.now();
        const reservationCurrent =
          row?.status === "reserved" &&
          Boolean(row.reserved_until) &&
          (row.reserved_until as Date).getTime() > now;
        // In-progress registrations are returned unchanged, even after enrollment closes.
        if (
          row &&
          (reservationCurrent ||
            [
              "awaiting_approval",
              "provisioning",
              "enrolled",
              "exception",
            ].includes(row.status))
        )
          return row;
        if (!offering.enrollment_open)
          throw new ConflictException(
            `Enrollment closed on ${offering.enrollment_closes_label}.`,
          );
        // A still-valid approval allows reserving again; declined or lapsed approvals need a new request.
        const approvalValid =
          !!row &&
          ["approved", "expired", "reserved"].includes(row.status) &&
          !!row.approval_expires_at &&
          row.approval_expires_at.getTime() > now;
        const needsApproval = offering.approval_required && !approvalValid;
        if (!needsApproval) await this.reserve(tx, offering);
        const status = needsApproval ? "awaiting_approval" : "reserved";
        const [result] = await sql<entitlements>(
          tx,
          `INSERT INTO entitlements(learner_id,offering_id,status,reserved_until,quoted_price_cents) VALUES ($1::uuid,$2::uuid,$3::entitlement_status,CASE WHEN $3::entitlement_status='reserved' THEN now()+interval '30 minutes' ELSE NULL END,
          CASE WHEN $3::entitlement_status='reserved' THEN $4::integer END)
        ON CONFLICT(learner_id,offering_id) DO UPDATE SET status=EXCLUDED.status,reserved_until=EXCLUDED.reserved_until,
          quoted_price_cents=coalesce(EXCLUDED.quoted_price_cents,entitlements.quoted_price_cents),
          approval_expires_at=CASE WHEN EXCLUDED.status='awaiting_approval' THEN NULL ELSE entitlements.approval_expires_at END
        RETURNING *`,
          principal.learnerId,
          offeringId,
          status,
          offering.price_cents,
        );
        await audit(
          tx,
          principal.actor,
          needsApproval
            ? row
              ? "approval.requested_again"
              : "approval.requested"
            : "seat.reserved",
          result.id,
        );
        return result;
      },
    );
  }
  async payment(principal: Principal, key: string, entitlementId: string) {
    return this.command(
      principal,
      key,
      { action: "simulate-payment", entitlementId },
      async (tx) => {
        const [row] = await sql<
          entitlements & { amount_cents: number; published: boolean }
        >(
          tx,
          "SELECT e.*,coalesce(e.quoted_price_cents,o.price_cents) AS amount_cents,o.published FROM entitlements e JOIN offerings o ON o.id=e.offering_id WHERE e.id=$1::uuid AND e.learner_id=$2::uuid FOR UPDATE OF e",
          entitlementId,
          principal.learnerId,
        );
        if (!row) throw new NotFoundException("Registration not found.");
        const existing = await tx.operations.findUnique({
          where: { entitlement_id: entitlementId },
        });
        if (existing) return existing;
        if (
          row.status !== "reserved" ||
          !row.reserved_until ||
          new Date(row.reserved_until).getTime() <= Date.now()
        )
          throw new ConflictException(
            "A current seat reservation is required.",
          );
        // Unpublishing stops new payments; already-paid registrations continue.
        if (!row.published)
          throw new ConflictException(
            "This course is no longer open for registration.",
          );
        await tx.orders.create({
          data: {
            entitlement_id: entitlementId,
            amount_cents: row.amount_cents,
          },
        });
        await tx.entitlements.update({
          where: { id: entitlementId },
          data: { status: "provisioning", reserved_until: null },
        });
        const setting = await tx.prototype_settings.findUnique({
          where: { key: "provisioning_outcome" },
        });
        const op = await tx.operations.create({
          data: {
            entitlement_id: entitlementId,
            // Set only through the validated simulation command; the enum column rejects anything else.
            simulated_outcome: (setting?.value ?? "normal") as SimulatedOutcome,
          },
        });
        await audit(
          tx,
          principal.actor,
          "prototype.payment_simulated",
          entitlementId,
        );
        return op;
      },
    );
  }
  async learning(principal: Principal) {
    return sql<LearningRow>(
      prisma,
      `SELECT e.*,o.title,o.category,o.format,o.course_type,o.price_cents,o.approval_required,${scheduleText},
      ${enrollmentWindow},o.published,CASE WHEN e.status='enrolled' THEN o.canvas_course_url END AS canvas_course_url,
      p.id AS operation_id,p.stage,p.status AS operation_status,p.attempts FROM entitlements e JOIN offerings o ON o.id=e.offering_id LEFT JOIN operations p ON p.entitlement_id=e.id WHERE e.learner_id=$1::uuid ORDER BY e.created_at DESC`,
      principal.learnerId,
    );
  }
  async operation(id: string, principal: Principal) {
    // Learners may read only their own operations; automation reads any.
    const operation = await prisma.operations.findFirst({
      where: {
        id,
        ...(principal.learnerId
          ? { entitlements: { learner_id: principal.learnerId } }
          : {}),
      },
    });
    if (!operation) throw new NotFoundException("Operation not found.");
    return operation;
  }
  async approvals() {
    const requests = await prisma.entitlements.findMany({
      where: { status: "awaiting_approval" },
      include: {
        offerings: { select: { title: true, approval_valid_days: true } },
        learners: { select: { email: true } },
      },
      orderBy: { created_at: "asc" },
    });
    return requests.map(({ offerings: offering, learners, ...request }) => ({
      ...request,
      title: offering.title,
      approval_valid_days: offering.approval_valid_days,
      learner_email: learners.email,
    }));
  }
  async decide(
    principal: Principal,
    key: string,
    id: string,
    decision: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "decision", id, decision },
      async (tx) => {
        // Approvals stay valid for the offering's staff-set number of days.
        const [row] = await sql<entitlements>(
          tx,
          `UPDATE entitlements e SET status=$2::entitlement_status,
            approval_expires_at=CASE WHEN $2::entitlement_status='approved' THEN now()+make_interval(days => o.approval_valid_days) END
          FROM offerings o WHERE e.id=$1::uuid AND e.status='awaiting_approval' AND o.id=e.offering_id RETURNING e.*`,
          id,
          decision,
        );
        if (!row)
          throw new ConflictException("Request is not awaiting approval.");
        await audit(tx, principal.actor, `approval.${decision}`, id);
        return row;
      },
    );
  }
  async create(principal: Principal, key: string, data: OfferingDto) {
    validateSchedule(data);
    return this.command(
      principal,
      key,
      { action: "create", data },
      async (tx) => {
        const offering = await tx.offerings.create({
          data: {
            title: data.title,
            category: data.category,
            summary: data.summary,
            description: data.description,
            format: data.format,
            start_date: toDate(data.startDate),
            end_date: toDate(data.endDate),
            capacity: data.capacity,
            price_cents: data.priceCents,
            approval_required: data.approvalRequired,
            course_type: data.courseType,
            approval_valid_days: data.approvalValidDays ?? 7,
            enrollment_close_days: data.enrollmentCloseDays ?? 7,
            canvas_course_url: data.canvasCourseUrl || null,
          },
        });
        await tx.offering_prices.create({
          data: {
            offering_id: offering.id,
            price_cents: data.priceCents,
            actor: principal.actor,
            reason: "Initial price",
          },
        });
        await audit(tx, principal.actor, "offering.created", offering.id);
        return offering;
      },
    );
  }
  async updateSettings(
    principal: Principal,
    key: string,
    id: string,
    data: OfferingSettingsDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "settings", id, data },
      async (tx) => {
        const [before] = await sql<
          Pick<
            offerings,
            | "approval_valid_days"
            | "enrollment_close_days"
            | "canvas_course_url"
          >
        >(
          tx,
          "SELECT approval_valid_days,enrollment_close_days,canvas_course_url FROM offerings WHERE id=$1::uuid AND version=$2 FOR UPDATE",
          id,
          data.version,
        );
        if (!before)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        const after = {
          approval_valid_days: data.approvalValidDays,
          enrollment_close_days: data.enrollmentCloseDays,
          canvas_course_url: data.canvasCourseUrl || null,
        };
        const offering = await tx.offerings.update({
          where: { id },
          data: { ...after, version: { increment: 1 } },
        });
        // Changed periods apply to future approvals; existing approvals keep their expiry.
        await audit(tx, principal.actor, "offering.settings_changed", id, {
          before,
          after,
        });
        return offering;
      },
    );
  }
  async edit(
    principal: Principal,
    key: string,
    id: string,
    data: OfferingEditDto,
  ) {
    validateSchedule(data);
    const { version, reason, ...fields } = data;
    return this.command(
      principal,
      key,
      { action: "edit", id, data },
      async (tx) => {
        const [before] = await sql<
          Omit<offerings, "start_date" | "end_date"> &
            ScheduleText & {
              active_registrations: number;
              seats_in_use: number;
            }
        >(
          tx,
          `SELECT ${offeringColumns("o")},${scheduleText},
            ${activeRegistrations} AS active_registrations,${seatsInUse} AS seats_in_use
          FROM offerings o WHERE o.id=$1::uuid AND o.version=$2 FOR UPDATE`,
          id,
          version,
        );
        if (!before)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        // Offerings that are or were published change only with an audited
        // reason and protected terms, because learners may depend on them.
        const protectedTerms = before.published || before.unpublished_at;
        if (protectedTerms) {
          if (!reason || reason.trim().length < 10)
            throw new BadRequestException(
              "Give a reason of at least 10 characters to change a published offering.",
            );
          if (fields.courseType !== before.course_type)
            throw new BadRequestException(
              "Course type cannot change after publishing.",
            );
          if (fields.approvalRequired !== before.approval_required)
            throw new BadRequestException(
              "The approval requirement cannot change after publishing.",
            );
        }
        if (
          before.active_registrations > 0 &&
          ((fields.startDate ?? null) !== before.start_date ||
            (fields.endDate ?? null) !== before.end_date)
        )
          throw new ConflictException(
            "Dates cannot change while learners are registered.",
          );
        if (fields.capacity < before.seats_in_use)
          throw new ConflictException(
            `Capacity cannot be lower than the ${before.seats_in_use} seats in use.`,
          );
        const after = {
          title: fields.title,
          category: fields.category,
          summary: fields.summary,
          description: fields.description,
          format: fields.format,
          course_type: fields.courseType,
          start_date: fields.startDate ?? null,
          end_date: fields.endDate ?? null,
          capacity: fields.capacity,
          price_cents: fields.priceCents,
          approval_required: fields.approvalRequired,
          approval_valid_days:
            fields.approvalValidDays ?? before.approval_valid_days,
          enrollment_close_days:
            fields.enrollmentCloseDays ?? before.enrollment_close_days,
          canvas_course_url: fields.canvasCourseUrl || null,
        };
        const previous = before as Record<string, unknown>;
        const changes = Object.fromEntries(
          Object.entries(after)
            .filter(([field, value]) => previous[field] !== value)
            .map(([field, value]) => [
              field,
              { before: previous[field] ?? null, after: value },
            ]),
        );
        if (!Object.keys(changes).length)
          throw new BadRequestException("No changes to save.");
        const offering = await tx.offerings.update({
          where: { id },
          data: {
            ...after,
            start_date: toDate(after.start_date),
            end_date: toDate(after.end_date),
            version: { increment: 1 },
          },
        });
        if (changes.price_cents)
          await tx.offering_prices.create({
            data: {
              offering_id: id,
              price_cents: after.price_cents,
              actor: principal.actor,
              reason: reason?.trim() || null,
            },
          });
        await audit(tx, principal.actor, "offering.edited", id, {
          reason: reason?.trim() || null,
          published: before.published,
          unpublished: Boolean(before.unpublished_at),
          changes: changes as Prisma.InputJsonObject,
        });
        return offering;
      },
    );
  }
  async unpublish(
    principal: Principal,
    key: string,
    id: string,
    version: number,
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: "unpublish", id, version, reason },
      async (tx) => {
        const [offering] = await sql<
          offerings & { active_registrations: number }
        >(
          tx,
          `UPDATE offerings o SET published=false,unpublished_at=now(),version=version+1 WHERE o.id=$1::uuid AND o.version=$2 AND o.published
          RETURNING o.*,${activeRegistrations} AS active_registrations`,
          id,
          version,
        );
        if (!offering)
          throw new ConflictException(
            "Offering changed, is not published, or does not exist. Refresh and retry.",
          );
        await audit(tx, principal.actor, "offering.unpublished", id, {
          reason,
          active_registrations: offering.active_registrations,
        });
        return offering;
      },
    );
  }
  async prices(id: string) {
    return prisma.offering_prices.findMany({
      where: { offering_id: id },
      orderBy: { id: "desc" },
      select: {
        price_cents: true,
        effective_at: true,
        actor: true,
        reason: true,
      },
    });
  }
  async publish(
    principal: Principal,
    key: string,
    id: string,
    version: number,
  ) {
    return this.command(
      principal,
      key,
      { action: "publish", id, version },
      async (tx) => {
        // Version check guards against publishing a stale draft.
        const updated = await tx.offerings.updateMany({
          where: { id, version },
          data: {
            published: true,
            unpublished_at: null,
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "Offering changed or does not exist. Refresh and retry.",
          );
        await audit(tx, principal.actor, "prototype.offering_published", id);
        return tx.offerings.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  async simulation() {
    const setting = await prisma.prototype_settings.findUnique({
      where: { key: "provisioning_outcome" },
    });
    return {
      // operations_simulated_outcome_check limits stored values to these outcomes.
      provisioningOutcome: (setting?.value ?? "normal") as ProvisioningOutcome,
      updatedAt: setting?.updated_at ?? null,
    };
  }
  async setSimulation(
    principal: Principal,
    key: string,
    outcome: ProvisioningOutcome,
  ) {
    return this.command(
      principal,
      key,
      { action: "simulation", outcome },
      async (tx) => {
        await tx.prototype_settings.upsert({
          where: { key: "provisioning_outcome" },
          create: { key: "provisioning_outcome", value: outcome },
          update: { value: outcome, updated_at: new Date() },
        });
        await audit(tx, principal.actor, "prototype.simulation_changed", null, {
          provisioningOutcome: outcome,
        });
        return { provisioningOutcome: outcome };
      },
    );
  }
  async exceptions() {
    const rows = await prisma.entitlements.findMany({
      where: { status: "exception" },
      include: {
        offerings: { select: { title: true } },
        learners: { select: { email: true } },
        operations: true,
      },
      orderBy: { operations: { failed_at: "asc" } },
    });
    const history = rows.length
      ? await prisma.audit_events.findMany({
          where: { object_id: { in: rows.map((row) => row.id) } },
          orderBy: { id: "asc" },
          select: {
            object_id: true,
            actor: true,
            action: true,
            details: true,
            created_at: true,
          },
        })
      : [];
    const staffIds = [
      ...new Set(
        history
          .filter((event) => event.actor.startsWith("staff:"))
          .map((event) => event.actor.slice("staff:".length)),
      ),
    ];
    const staffEmails = new Map(
      (
        await prisma.staff_members.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, email: true },
        })
      ).map((member) => [`staff:${member.id}`, member.email]),
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      offering_id: row.offering_id,
      title: row.offerings.title,
      learner_email: row.learners.email,
      operation_id: row.operations?.id ?? null,
      stage: row.operations?.stage ?? null,
      error: row.operations?.error ?? null,
      attempts: row.operations?.attempts ?? 0,
      failed_at: row.operations?.failed_at ?? null,
      simulated_outcome: row.operations?.simulated_outcome ?? null,
      history: history
        .filter((event) => event.object_id === row.id)
        .map(({ object_id, ...event }) => ({
          ...event,
          actor_email: staffEmails.get(event.actor) ?? null,
        })),
    }));
  }
  // Staff recovery for registrations whose simulated provisioning exhausted its retries.
  async recover(
    principal: Principal,
    key: string,
    id: string,
    action: "retry" | "resolve",
    reason: string,
  ) {
    return this.command(
      principal,
      key,
      { action: `exception.${action}`, id, reason },
      async (tx) => {
        const [found] = await sql<{ id: string; stage: string }>(
          tx,
          "SELECT e.id,p.stage FROM entitlements e JOIN operations p ON p.entitlement_id=e.id WHERE e.id=$1::uuid AND e.status='exception' FOR UPDATE OF e,p",
          id,
        );
        if (!found)
          throw new ConflictException("Registration is not awaiting recovery.");
        if (action === "retry") {
          // Retrying assumes the cause was fixed, so the simulation resumes normally.
          await tx.entitlements.update({
            where: { id },
            data: { status: "provisioning" },
          });
          await tx.operations.update({
            where: { entitlement_id: id },
            data: {
              status: "pending",
              attempts: 0,
              error: null,
              failed_at: null,
              simulated_outcome: "normal",
              next_run: new Date(),
            },
          });
        } else {
          await tx.entitlements.update({
            where: { id },
            data: { status: "enrolled" },
          });
          await tx.operations.update({
            where: { entitlement_id: id },
            data: { status: "succeeded", stage: "manual", next_run: null },
          });
        }
        await audit(
          tx,
          principal.actor,
          action === "retry"
            ? "exception.retry_requested"
            : "exception.resolved_manually",
          id,
          { reason, stage: found.stage },
        );
        return tx.entitlements.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  // Mock staff sign-in (ADR 0004): any active member may be selected without a password.
  // An SSO add-on replaces this lookup with a verified provider identity.
  async staffSession(email: string) {
    const member = await prisma.staff_members.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: staffSelect,
    });
    if (!member?.active)
      throw new NotFoundException("No active staff member with that email.");
    return member;
  }
  async staffDirectory() {
    return prisma.staff_members.findMany({
      where: { active: true },
      select: { id: true, email: true, display_name: true, roles: true },
      orderBy: { display_name: "asc" },
    });
  }
  async staffMe(principal: Principal) {
    const member = await prisma.staff_members.findUniqueOrThrow({
      where: { id: principal.staffId },
      select: staffSelect,
    });
    return { ...member, scopes: scopesFor(member.roles) };
  }
  async roleCatalog() {
    const members = await prisma.staff_members.findMany({
      select: {
        id: true,
        display_name: true,
        email: true,
        roles: true,
        active: true,
      },
    });
    return staffRoles.map((role) => ({
      role,
      label: roleLabels[role],
      description: roleDescriptions[role],
      scopes: scopesFor([role]).map((scope) => ({
        scope,
        description: scopeDescriptions[scope] ?? scope,
      })),
      members: members
        .filter((member) => member.roles.includes(role))
        .map(({ roles, ...member }) => member),
    }));
  }
  async staffMembers() {
    return prisma.staff_members.findMany({
      select: { ...staffSelect, auth_provider: true, created_at: true },
      orderBy: [{ active: "desc" }, { display_name: "asc" }],
    });
  }
  async createStaff(principal: Principal, key: string, data: StaffMemberDto) {
    return this.command(
      principal,
      key,
      { action: "staff.create", data },
      async (tx) => {
        const email = data.email.trim().toLowerCase();
        if (await tx.staff_members.findUnique({ where: { email } }))
          throw new ConflictException("A staff member with that email exists.");
        const member = await tx.staff_members.create({
          data: {
            email,
            display_name: data.displayName.trim(),
            roles: data.roles,
          },
          select: staffSelect,
        });
        await audit(tx, principal.actor, "staff.created", member.id, {
          roles: member.roles,
        });
        return member;
      },
    );
  }
  async updateStaff(
    principal: Principal,
    key: string,
    id: string,
    data: StaffUpdateDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "staff.update", id, data },
      async (tx) => {
        // Serialize role changes so two admins cannot remove each other concurrently.
        await sql(
          tx,
          "SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('staff-admins',0))) l",
        );
        const before = await tx.staff_members.findFirst({
          where: { id, version: data.version },
          select: staffSelect,
        });
        if (!before)
          throw new ConflictException(
            "Staff member changed or does not exist. Refresh and retry.",
          );
        const roles = data.roles as StaffRole[];
        const remainsAdmin = data.active && roles.includes("staff_admin");
        if (before.roles.includes("staff_admin") && !remainsAdmin) {
          const otherAdmins = await tx.staff_members.count({
            where: {
              id: { not: id },
              active: true,
              roles: { has: "staff_admin" },
            },
          });
          if (!otherAdmins)
            throw new ConflictException(
              "At least one active staff administrator is required.",
            );
        }
        const member = await tx.staff_members.update({
          where: { id },
          data: {
            display_name: data.displayName.trim(),
            roles,
            active: data.active,
            version: { increment: 1 },
          },
          select: staffSelect,
        });
        await audit(tx, principal.actor, "staff.updated", id, {
          before: {
            display_name: before.display_name,
            roles: before.roles,
            active: before.active,
          },
          after: {
            display_name: member.display_name,
            roles: member.roles,
            active: member.active,
          },
        });
        return member;
      },
    );
  }
  // Staff learner management: list, details and account access (support role).
  async staffLearners(search?: string) {
    const term = search?.trim() ? `%${search.trim()}%` : "";
    return sql<{
      id: string;
      email: string | null;
      created_at: Date;
      active: boolean;
      deactivated_at: Date | null;
      version: number;
      registrations: number;
      enrolled: number;
      in_progress: number;
      last_activity: Date | null;
    }>(
      prisma,
      `SELECT l.id,l.email,l.created_at,l.active,l.deactivated_at,l.version,
        count(e.id)::integer AS registrations,
        count(e.id) FILTER (WHERE e.status='enrolled')::integer AS enrolled,
        count(e.id) FILTER (WHERE e.status IN ('awaiting_approval','approved','reserved','provisioning','exception'))::integer AS in_progress,
        (SELECT max(a.created_at) FROM audit_events a WHERE a.actor='demo-learner:'||l.id::text
          OR a.object_id IN (SELECT x.id FROM entitlements x WHERE x.learner_id=l.id)) AS last_activity
      FROM learners l LEFT JOIN entitlements e ON e.learner_id=l.id
      WHERE ($1='' OR l.email ILIKE $1)
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT 500`,
      term,
    );
  }
  async staffLearner(id: string) {
    const learner = await prisma.learners.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        created_at: true,
        active: true,
        deactivated_at: true,
        version: true,
        entitlements: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            status: true,
            created_at: true,
            quoted_price_cents: true,
            reserved_until: true,
            approval_expires_at: true,
            offerings: { select: { id: true, title: true, price_cents: true } },
            orders: { select: { amount_cents: true, created_at: true } },
            operations: {
              select: { status: true, stage: true, attempts: true },
            },
          },
        },
      },
    });
    if (!learner) throw new NotFoundException("Learner not found.");
    const registrationIds = learner.entitlements.map((e) => e.id);
    const activity = await prisma.audit_events.findMany({
      where: {
        OR: [
          { actor: `demo-learner:${id}` },
          { object_id: { in: [id, ...registrationIds] } },
        ],
      },
      orderBy: { id: "desc" },
      take: 50,
      select: {
        actor: true,
        action: true,
        object_id: true,
        details: true,
        created_at: true,
      },
    });
    const titles = new Map(
      learner.entitlements.map((e) => [e.id, e.offerings.title]),
    );
    const { entitlements, ...profile } = learner;
    return {
      ...profile,
      legacy: id === DEMO_LEARNER,
      registrations: entitlements.map(
        ({ offerings: offering, orders, operations, ...e }) => ({
          ...e,
          offering_id: offering.id,
          title: offering.title,
          price_cents: offering.price_cents,
          paid_cents: orders?.amount_cents ?? null,
          paid_at: orders?.created_at ?? null,
          operation_status: operations?.status ?? null,
          operation_stage: operations?.stage ?? null,
        }),
      ),
      activity: activity.map((event) => ({
        ...event,
        offering_title: event.object_id
          ? (titles.get(event.object_id) ?? null)
          : null,
      })),
    };
  }
  async setLearnerAccess(
    principal: Principal,
    key: string,
    id: string,
    data: LearnerAccessDto,
  ) {
    return this.command(
      principal,
      key,
      { action: "learner.access", id, data },
      async (tx) => {
        if (id === DEMO_LEARNER)
          throw new ConflictException(
            "The legacy sample learner cannot be deactivated; direct API demos rely on it.",
          );
        const updated = await tx.learners.updateMany({
          where: { id, version: data.version, active: !data.active },
          data: {
            active: data.active,
            deactivated_at: data.active ? null : new Date(),
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException(
            "Learner changed or is already in that state. Refresh and retry.",
          );
        await audit(
          tx,
          principal.actor,
          data.active ? "learner.reactivated" : "learner.deactivated",
          id,
          { reason: data.reason.trim() },
        );
        return tx.learners.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            email: true,
            active: true,
            deactivated_at: true,
            version: true,
          },
        });
      },
    );
  }
  async report() {
    const [
      simulated_orders,
      simulated_enrollments,
      pending_operations,
      open_exceptions,
    ] = await Promise.all([
      prisma.orders.count(),
      prisma.entitlements.count({ where: { status: "enrolled" } }),
      prisma.operations.count({
        where: { status: { in: ["pending", "running"] } },
      }),
      prisma.entitlements.count({ where: { status: "exception" } }),
    ]);
    // Resolve learner actors and affected records to readable labels for the staff log.
    const audit = await sql<{
      actor: string;
      action: string;
      object_id: string | null;
      created_at: Date;
      actor_email: string | null;
      offering_title: string | null;
      subject_email: string | null;
    }>(
      prisma,
      `SELECT a.actor,a.action,a.object_id,a.created_at,
        CASE WHEN a.actor LIKE 'demo-learner:%' THEN coalesce(actor_learner.email,'Legacy demo learner')
          WHEN a.actor LIKE 'staff:%' THEN actor_staff.email END AS actor_email,
        coalesce(o.title,eo.title) AS offering_title,
        coalesce(subject_learner.email,subject_staff.email) AS subject_email
      FROM audit_events a
      LEFT JOIN learners actor_learner ON a.actor='demo-learner:'||actor_learner.id::text
      LEFT JOIN staff_members actor_staff ON a.actor='staff:'||actor_staff.id::text
      LEFT JOIN staff_members subject_staff ON subject_staff.id=a.object_id
      LEFT JOIN offerings o ON o.id=a.object_id
      LEFT JOIN entitlements e ON e.id=a.object_id
      LEFT JOIN offerings eo ON eo.id=e.offering_id
      LEFT JOIN learners subject_learner ON subject_learner.id=e.learner_id
      ORDER BY a.id DESC LIMIT 200`,
    );
    return {
      simulated_orders,
      simulated_enrollments,
      pending_operations,
      open_exceptions,
      audit,
    };
  }
}
