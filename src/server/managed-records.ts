import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Param,
  Post,
  Req,
  UseGuards,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import { Principal, PrototypeGuard, requireScope } from "./auth";
import { PortalService, audit } from "./service";
import { prisma, sql, Tx } from "../domain/prisma";
import { RecordLifecycleDto } from "./dto";
import { canvasStaffConfig } from "./staff-auth-config";
import {
  courseConnectionConfig,
  courseFingerprint,
} from "./canvas-course-config";
import { roleLabels } from "./roles";
export const managedScopes: Record<string, string> = {
  staff: "staff:manage",
  role: "staff:manage",
  "progress-plan": "progress:manage",
  cohort: "progress:manage",
  "canvas-course": "canvas:sync",
  "badge-draft": "badges:manage",
  "badge-version": "badges:manage",
  "badge-award": "badges:manage",
  "certificate-template": "badges:manage",
  certificate: "badges:manage",
  "badge-mapping": "badges:manage",
};
export type ManagedRow = {
  id: string;
  name: string;
  detail: string;
  version: number;
  archived: boolean;
  protectedReason?: string;
};
function canvasHash() {
  try {
    const auth = canvasStaffConfig(),
      config = courseConnectionConfig();
    return courseFingerprint(auth.fingerprint, config.accountId, config.nested);
  } catch {
    return null;
  }
}
export async function requireUnarchived(tx: Tx, target: string, id: string) {
  await sql(
    tx,
    "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended($1,0))) l",
    `managed:${target}:${id}`,
  );
  const row = await tx.management_archives.findUnique({
    where: { target_id: { target, id } },
  });
  if (row?.archived_at || row?.deleted_at)
    throw new ConflictException(
      "This record is archived. Restore it before making new assignments or changes.",
    );
}
@Injectable()
export class ManagedRecordsService {
  constructor(private readonly portal: PortalService) {}
  async list(target: string): Promise<ManagedRow[]> {
    if (!managedScopes[target])
      throw new NotFoundException("Unknown record type.");
    const archived = await prisma.management_archives.findMany({
      where: { target },
    });
    let rows: {
      id: string;
      name: string;
      detail: string;
      archived?: boolean;
      protectedReason?: string;
    }[] = [];
    const title = (design: string) => {
      try {
        return JSON.parse(design).title || "Untitled badge";
      } catch {
        return "Untitled badge";
      }
    };
    const composite = (workspace: string, id: string) => `${workspace}--${id}`;
    switch (target) {
      case "staff":
        rows = (
          await prisma.staff_members.findMany({
            orderBy: { display_name: "asc" },
          })
        ).map((r) => ({ id: r.id, name: r.display_name, detail: r.email }));
        break;
      case "role":
        rows = Object.entries(roleLabels).map(([id, name]) => ({
          id,
          name,
          detail: "Built-in permission definition",
          protectedReason:
            "System roles cannot be archived or deleted; manage staff role assignments instead.",
        }));
        break;
      case "progress-plan":
        rows = (
          await prisma.progress_plans.findMany({
            include: { offerings: { select: { title: true } } },
            orderBy: { revision: "desc" },
          })
        ).map((r) => ({
          id: r.id,
          name: `${r.offerings.title} · revision ${r.revision}`,
          detail: "Completion requirements",
        }));
        break;
      case "cohort":
        rows = (
          await prisma.progress_cohorts.findMany({
            include: {
              progress_plans: {
                include: { offerings: { select: { title: true } } },
              },
            },
          })
        ).map((r) => ({
          id: r.id,
          name: r.name,
          detail: r.progress_plans.offerings.title,
        }));
        break;
      case "canvas-course": {
        const hash = canvasHash();
        if (!hash) break;
        const snapshot = await prisma.canvas_course_snapshots.findUnique({
          where: { configuration_hash: hash },
        });
        rows = ((snapshot?.courses as any[]) || []).map((r) => ({
          id: `${hash}-${r.id}`,
          name: r.name,
          detail: `Canvas ${r.id} · portal inventory only`,
        }));
        break;
      }
      case "badge-draft":
        rows = (await prisma.credential_badge_drafts.findMany()).map((r) => ({
          id: composite(r.workspace, r.id),
          name: title(r.design),
          detail: `Draft revision ${r.revision}`,
        }));
        break;
      case "badge-version":
        rows = (await prisma.credential_badge_versions.findMany()).map((r) => ({
          id: composite(r.workspace, r.id),
          name: title(r.design_json),
          detail: `Approved revision ${r.draft_revision}`,
          archived: r.status === "archived",
        }));
        break;
      case "badge-mapping":
        rows = (await prisma.credential_course_mappings.findMany()).map(
          (r) => ({
            id: composite(r.workspace, r.id),
            name: `Course rule ${r.id}`,
            detail: r.enabled ? "Active earning rule" : "Inactive earning rule",
          }),
        );
        break;
      case "badge-award":
        rows = (await prisma.credential_badges.findMany()).map((r) => ({
          id: composite(r.workspace, r.id),
          name: `${r.learner} · ${r.course}`,
          detail: `Issued ${r.issued_at}`,
          protectedReason: undefined,
        }));
        break;
      case "certificate-template":
        rows = (await prisma.credential_certificate_templates.findMany()).map(
          (r) => ({
            id: composite(r.workspace, r.id),
            name: r.name,
            detail: `Template revision ${r.revision}`,
          }),
        );
        break;
      case "certificate":
        rows = (await prisma.credential_certificates.findMany()).map((r) => ({
          id: composite(r.workspace, r.id),
          name: `Certificate · ${r.learner}`,
          detail: `Issued ${r.created_at}`,
        }));
        break;
    }
    const byId = new Map(archived.map((r) => [r.id, r]));
    return rows
      .filter((r) => !byId.get(r.id)?.deleted_at)
      .map((r) => ({
        ...r,
        archived: Boolean(byId.get(r.id)?.archived_at) || Boolean(r.archived),
        version: byId.get(r.id)?.version || 1,
      }));
  }
  async change(
    principal: Principal,
    key: string,
    target: string,
    id: string,
    data: RecordLifecycleDto,
  ) {
    if (!managedScopes[target] || !/^[a-zA-Z0-9_-]{1,240}$/.test(id))
      throw new BadRequestException("Invalid record type or identifier.");
    return this.portal.command(
      principal,
      key,
      { action: `managed.${target}.${data.action}`, id, data },
      async (tx) => {
        await sql(
          tx,
          "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended($1,0))) l",
          `managed:${target}:${id}`,
        );
        const current = (await this.list(target)).find((r) => r.id === id);
        if (!current) throw new NotFoundException("Record not found.");
        if (current.version !== data.version)
          throw new ConflictException("Record changed. Refresh and retry.");
        if (current.protectedReason)
          throw new ConflictException(current.protectedReason);
        if (data.reason.trim().length < 10)
          throw new BadRequestException(
            "Give a reason of at least 10 characters.",
          );
        const deleting = data.action === "delete",
          archiving = data.action === "archive";
        if (deleting && !current.archived)
          throw new ConflictException(
            "Archive this record before deleting it.",
          );
        if (!deleting && current.archived === archiving)
          throw new ConflictException("Record is already in that state.");
        const split = id.lastIndexOf("--"),
          workspace = id.slice(0, split),
          localId = id.slice(split + 2);
        const credential = { workspace, id: localId };
        if (target === "staff") {
          // Match the existing staff-management serialization to protect the last administrator.
          await sql(
            tx,
            "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('staff-admins',0))) l",
          );
          const staff = await tx.staff_members.findUniqueOrThrow({
            where: { id },
          });
          if (principal.staffId === id)
            throw new ConflictException(
              "You cannot archive or delete your own staff account.",
            );
          if (
            archiving &&
            staff.active &&
            staff.roles.includes("staff_admin") &&
            (await tx.staff_members.count({
              where: { active: true, roles: { has: "staff_admin" } },
            })) <= 1
          )
            throw new ConflictException(
              "At least one active staff administrator is required.",
            );
          if (deleting) {
            const history = await tx.audit_events.count({
              where: { actor: `staff:${id}` },
            });
            if (
              history ||
              staff.external_subject ||
              (await tx.credential_audit.count({
                where: { actor: { in: [`staff:${id}`, `portal:${id}`] } },
              })) ||
              (await tx.credential_publishing_activity.count({
                where: { actor: { in: [`staff:${id}`, `portal:${id}`] } },
              })) ||
              (await tx.canvas_course_runs.count({ where: { staff_id: id } }))
            )
              throw new ConflictException(
                "This staff member has account links or activity history. Keep the record archived.",
              );
            await tx.staff_sessions.deleteMany({ where: { staff_id: id } });
            await tx.staff_members.delete({ where: { id } });
          } else {
            await tx.staff_members.update({
              where: { id },
              data: { active: false, version: { increment: 1 } },
            });
            await tx.staff_sessions.deleteMany({ where: { staff_id: id } });
            await tx.staff_canvas_grants.deleteMany({
              where: { staff_id: id },
            });
          }
        } else if (target === "progress-plan" && deleting) {
          const plan = await tx.progress_plans.findUniqueOrThrow({
            where: { id },
          });
          if (
            (await tx.progress_participants.count({
              where: { plan_id: id },
            })) ||
            (await tx.progress_cohorts.count({ where: { plan_id: id } })) ||
            (await tx.progress_plans.count({
              where: {
                offering_id: plan.offering_id,
                revision: { gt: plan.revision },
              },
            }))
          )
            throw new ConflictException(
              "Requirements have participants, cohorts or later revisions. Keep them archived.",
            );
          await tx.progress_steps.deleteMany({ where: { plan_id: id } });
          await tx.progress_plans.delete({ where: { id } });
        } else if (target === "cohort" && deleting) {
          if (
            await tx.progress_cohort_members.count({ where: { cohort_id: id } })
          )
            throw new ConflictException(
              "This cohort has membership history. Keep it archived.",
            );
          await tx.progress_cohorts.delete({ where: { id } });
        } else if (target === "badge-draft" && deleting) {
          if (
            await tx.credential_badge_versions.count({
              where: { workspace, draft_id: localId },
            })
          )
            throw new ConflictException(
              "This design has approved revisions. Keep it archived.",
            );
          await tx.credential_badge_drafts.delete({
            where: { workspace_id: credential },
          });
        } else if (target === "badge-version") {
          if (deleting) {
            if (
              (await tx.credential_badges.count({
                where: { workspace, badge_version_id: localId },
              })) ||
              (await tx.credential_course_mappings.count({
                where: { workspace, badge_version_id: localId },
              }))
            )
              throw new ConflictException(
                "This revision has earning rules or issued badges. Keep it archived.",
              );
            await tx.credential_badge_versions.delete({
              where: { workspace_id: credential },
            });
          } else {
            await tx.credential_badge_versions.update({
              where: { workspace_id: credential },
              data: {
                status: archiving ? "archived" : "approved",
                archived_at: archiving ? new Date().toISOString() : null,
              },
            });
            await tx.credential_course_mappings.updateMany({
              where: { workspace, badge_version_id: localId },
              data: { enabled: 0 },
            });
          }
        } else if (target === "badge-mapping") {
          if (deleting) {
            if (
              await tx.credential_badges.count({
                where: { workspace, course_mapping_id: localId },
              })
            )
              throw new ConflictException(
                "This earning rule has issued badges. Keep it archived.",
              );
            await tx.credential_course_mappings.delete({
              where: { workspace_id: credential },
            });
          } else
            await tx.credential_course_mappings.update({
              where: { workspace_id: credential },
              data: { enabled: 0 },
            });
        } else if (target === "certificate-template" && deleting) {
          const used = await sql<{ n: number }>(
            tx,
            "SELECT count(*)::int n FROM credential_certificates WHERE workspace=$1 AND snapshot_json LIKE $2",
            workspace,
            `%${localId}%`,
          );
          if (used[0].n)
            throw new ConflictException(
              "This template is retained in issued certificates. Keep it archived.",
            );
          await tx.credential_certificate_templates.delete({
            where: { workspace_id: credential },
          });
        } else if (
          (target === "certificate" || target === "badge-award") &&
          deleting
        )
          throw new ConflictException(
            "Issued credentials are permanent records. Archive them; use the separate revocation workflow when needed.",
          );
        // Canvas deletions are local tombstones: imports and refreshed source reads cannot erase the user's choice.
        await tx.management_archives.upsert({
          where: { target_id: { target, id } },
          create: {
            target,
            id,
            name: current.name,
            version: 2,
            archived_at: archiving || deleting ? new Date() : null,
            deleted_at: deleting ? new Date() : null,
          },
          update: {
            version: { increment: 1 },
            archived_at: archiving || deleting ? new Date() : null,
            deleted_at: deleting ? new Date() : null,
          },
        });
        await audit(
          tx,
          principal.actor,
          `managed.${target}.${data.action}`,
          null,
          { id, name: current.name, reason: data.reason.trim() },
        );
        return { id, action: data.action };
      },
    );
  }
}
@Controller("api/v1/staff/records")
@UseGuards(PrototypeGuard)
export class ManagedRecordsController {
  constructor(private readonly records: ManagedRecordsService) {}
  @Get("state")
  state(@Req() req: any) {
    requireScope(req, "badges:manage");
    return prisma.management_archives.findMany({
      where: {
        target: {
          in: [
            "badge-draft",
            "badge-version",
            "badge-mapping",
            "badge-award",
            "certificate-template",
            "certificate",
          ],
        },
      },
    });
  }
  @Get(":target")
  @ApiOperation({ summary: "Active and archived staff management records" })
  list(@Req() req: any, @Param("target") target: string) {
    requireScope(req, managedScopes[target] || "invalid:scope");
    return this.records.list(target);
  }
  @Post(":target/:id")
  @HttpCode(200)
  change(
    @Req() req: any,
    @Param("target") target: string,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Body() data: RecordLifecycleDto,
  ) {
    requireScope(req, managedScopes[target] || "invalid:scope");
    return this.records.change(req.principal, key, target, id, data);
  }
}
