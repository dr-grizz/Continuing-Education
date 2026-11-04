import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { prisma, sql } from "../domain/prisma";
import {
  EngagementImpact,
  ImpactCredential,
  ImpactRow,
} from "../domain/engagement-impact";
import { Principal, PrototypeGuard, requireScope } from "./auth";
import { staffAuthMode, canvasStaffConfig } from "./staff-auth-config";

const DAY = 86400000;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
export class EngagementImpactQuery {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() offeringId?: string;
  @IsOptional() @IsUUID() cohortId?: string;
}
type Registration = {
  learner_id: string;
  offering_id: string;
  created_at: string;
  status: string;
};
type Assignment = {
  id: string;
  learner_id: string;
  offering_id: string;
  required: number;
  completed: number;
  started: number;
  unknown: number;
};
const state = (p: Assignment) =>
  p.required > 0 && p.completed === p.required
    ? "completed"
    : p.started > 0
      ? "inProgress"
      : p.unknown > 0 || !p.required
        ? "awaitingVerification"
        : "notStarted";
const summarize = (
  id: string,
  title: string,
  registrations: Registration[],
  assignments: Assignment[],
): ImpactRow => {
  const states = {
    completed: 0,
    inProgress: 0,
    awaitingVerification: 0,
    notStarted: 0,
  };
  for (const p of assignments) states[state(p)]++;
  return {
    id,
    title,
    registrations: registrations.length,
    learners: new Set(registrations.map((r) => r.learner_id)).size,
    assignments: assignments.length,
    ...states,
    completionRate: assignments.length
      ? (100 * states.completed) / assignments.length
      : null,
  };
};
@Injectable()
export class EngagementImpactService {
  credentialReader:
    | (() => Promise<{ records: ImpactCredential[]; warning: string | null }>)
    | null = null;
  async dashboard(
    principal: Principal,
    query: EngagementImpactQuery,
  ): Promise<EngagementImpact> {
    const today = Date.parse(date(Date.now()));
    const from = Date.parse(query.from ?? date(today - 30 * DAY));
    const last = Date.parse(query.to ?? date(today - DAY));
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(last) ||
      (query.from && date(from) !== query.from) ||
      (query.to && date(last) !== query.to) ||
      last < from ||
      last >= today ||
      (last - from) / DAY >= 366
    )
      throw new BadRequestException(
        "Choose 1–366 complete UTC days ending before today.",
      );
    const end = last + DAY,
      previous = from - (end - from);
    let canvasConfig: ReturnType<typeof canvasStaffConfig> | null = null;
    if (
      principal.staffId &&
      principal.scopes.includes("canvas:read") &&
      staffAuthMode() === "canvas"
    ) {
      try {
        canvasConfig = canvasStaffConfig();
      } catch {
        /* Local analytics remain available without a configured connector. */
      }
    }
    const data = await prisma.$transaction(
      async (tx) => {
        const offerings = await sql<any>(
          tx,
          "SELECT id,title,skills FROM offerings ORDER BY title,id",
        );
        const cohorts = await sql<any>(
          tx,
          "SELECT c.id,c.name,p.offering_id FROM progress_cohorts c JOIN progress_plans p ON p.id=c.plan_id ORDER BY c.name,c.id",
        );
        if (
          query.offeringId &&
          !offerings.some((o) => o.id === query.offeringId)
        )
          throw new BadRequestException("Offering not found.");
        const cohort = query.cohortId
          ? cohorts.find((c) => c.id === query.cohortId)
          : null;
        if (query.cohortId && !cohort)
          throw new BadRequestException("Cohort not found.");
        if (
          cohort &&
          query.offeringId &&
          cohort.offering_id !== query.offeringId
        )
          throw new BadRequestException(
            "The cohort belongs to another offering.",
          );
        const offeringId = query.offeringId ?? cohort?.offering_id ?? null;
        // Current active cohort membership is used consistently across both windows.
        const members = await sql<any>(
          tx,
          `SELECT m.cohort_id,m.participant_id,p.learner_id FROM progress_cohort_members m JOIN progress_participants p ON p.id=m.participant_id WHERE m.active`,
        );
        const eligible = await sql<any>(
          tx,
          `SELECT l.id FROM learners l WHERE l.active AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m JOIN progress_participants p ON p.id=m.participant_id WHERE p.learner_id=l.id AND m.cohort_id=$1::uuid AND m.active)) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM entitlements e WHERE e.learner_id=l.id AND e.offering_id=$2::uuid AND e.created_at<$3::timestamptz) OR EXISTS(SELECT 1 FROM progress_participants p JOIN progress_plans v ON v.id=p.plan_id WHERE p.learner_id=l.id AND v.offering_id=$2::uuid AND p.assigned_at<$3::timestamptz))`,
          query.cohortId ?? null,
          offeringId,
          new Date(end),
        );
        const registrations = await sql<Registration>(
          tx,
          `SELECT e.learner_id,e.offering_id,e.created_at::text,e.status::text FROM entitlements e JOIN learners l ON l.id=e.learner_id WHERE l.active AND e.created_at<$1::timestamptz AND ($2::uuid IS NULL OR e.offering_id=$2::uuid) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m JOIN progress_participants p ON p.id=m.participant_id WHERE m.cohort_id=$3::uuid AND m.active AND p.learner_id=e.learner_id))`,
          new Date(end),
          offeringId,
          query.cohortId ?? null,
        );
        const priorLearners = await sql<{ learner_id: string }>(
          tx,
          "SELECT DISTINCT learner_id FROM entitlements WHERE created_at < $1::timestamptz",
          new Date(from),
        );
        const assignments = await sql<Assignment>(
          tx,
          `SELECT p.id,p.learner_id,v.offering_id,count(s.id)::integer required,count(s.id) FILTER(WHERE e.state='completed')::integer completed,count(s.id) FILTER(WHERE e.state IN ('completed','in_progress'))::integer started,count(s.id) FILTER(WHERE e.id IS NULL)::integer unknown FROM progress_participants p JOIN progress_plans v ON v.id=p.plan_id JOIN learners l ON l.id=p.learner_id LEFT JOIN progress_steps s ON s.plan_id=p.plan_id AND s.required LEFT JOIN LATERAL(SELECT x.id,x.state FROM progress_evidence x WHERE x.participant_id=p.id AND x.step_id=s.id AND x.recorded_at<$1::timestamptz ORDER BY x.sequence DESC LIMIT 1) e ON true WHERE l.active AND p.assigned_at >= $2::timestamptz AND p.assigned_at<$1::timestamptz AND ($3::uuid IS NULL OR v.offering_id=$3::uuid) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m WHERE m.participant_id=p.id AND m.cohort_id=$4::uuid AND m.active)) GROUP BY p.id,v.offering_id`,
          new Date(end),
          new Date(from),
          offeringId,
          query.cohortId ?? null,
        );
        const claims = principal.scopes.includes("badges:manage")
          ? await sql<any>(
              tx,
              "SELECT DISTINCT source_id,badge_id,claimed_at FROM credential_claims WHERE state='claimed' AND claimed_at IS NOT NULL AND claimed_at::timestamptz < $1::timestamptz",
              new Date(end),
            )
          : [];
        const grants =
          canvasConfig && principal.staffId
            ? await tx.staff_canvas_grants.count({
                where: {
                  staff_id: principal.staffId,
                  provider: canvasConfig.provider,
                  configuration_hash: canvasConfig.fingerprint,
                },
              })
            : 0;
        return {
          offerings,
          cohorts,
          members,
          eligible,
          registrations,
          priorLearners,
          assignments,
          claims,
          offeringId,
          grants,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 20000 },
    );
    const registrations = data.registrations.filter(
      (r) => Date.parse(r.created_at) >= from,
    );
    const previousRegistrations = data.registrations.filter(
      (r) =>
        Date.parse(r.created_at) >= previous && Date.parse(r.created_at) < from,
    );
    const learnerIds = new Set(registrations.map((r) => r.learner_id));
    const oldIds = new Set(data.priorLearners.map((r) => r.learner_id));
    const progress = summarize(
      "all",
      "All assignments",
      registrations,
      data.assignments,
    );
    const rows = data.offerings
      .filter((o) => !data.offeringId || o.id === data.offeringId)
      .map((o) =>
        summarize(
          o.id,
          o.title,
          registrations.filter((r) => r.offering_id === o.id),
          data.assignments.filter((p) => p.offering_id === o.id),
        ),
      );
    const cohorts = data.cohorts
      .filter(
        (c) =>
          (!data.offeringId || c.offering_id === data.offeringId) &&
          (!query.cohortId || c.id === query.cohortId),
      )
      .map((c) => {
        const members = data.members.filter((m) => m.cohort_id === c.id);
        return summarize(
          c.id,
          c.name,
          registrations.filter(
            (r) =>
              r.offering_id === c.offering_id &&
              members.some((m) => m.learner_id === r.learner_id),
          ),
          data.assignments.filter((p) =>
            members.some((m) => m.participant_id === p.id),
          ),
        );
      });
    const skillMap = new Map<
      string,
      {
        id: string;
        name: string;
        offerings: Set<string>;
        learners: Set<string>;
      }
    >();
    for (const offering of data.offerings.filter((o) =>
      rows.some((r) => r.id === o.id),
    ))
      for (const skill of Array.isArray(offering.skills)
        ? offering.skills
        : []) {
        if (!skill.id || !skill.releaseId || !skill.name) continue;
        const id = `${skill.releaseId}:${skill.id}`;
        const item = skillMap.get(id) ?? {
          id,
          name: skill.name,
          offerings: new Set<string>(),
          learners: new Set<string>(),
        };
        item.offerings.add(offering.id);
        for (const r of registrations.filter(
          (r) => r.offering_id === offering.id,
        ))
          item.learners.add(r.learner_id);
        skillMap.set(id, item);
      }
    let credentials: EngagementImpact["credentials"] = null;
    if (principal.scopes.includes("badges:manage")) {
      let source: { records: ImpactCredential[]; warning: string | null };
      try {
        source = this.credentialReader
          ? await this.credentialReader()
          : { records: [], warning: "Credential source is unavailable." };
      } catch {
        source = {
          records: [],
          warning: "Credential source could not be read.",
        };
      }
      const eligible = new Set(data.eligible.map((l) => l.id));
      const scoped = source.records.filter(
        (r) =>
          eligible.has(r.learnerId) &&
          r.issuedAt &&
          Date.parse(r.issuedAt) >= from &&
          Date.parse(r.issuedAt) < end,
      );
      const records = [
        ...new Map(
          scoped
            .filter((r) => r.signatureValid && !r.revoked)
            .map((r) => [r.key, r]),
        ).values(),
      ];
      const badges = records.filter((r) => r.kind === "badge"),
        certificates = records.filter((r) => r.kind === "certificate");
      const pair = (r: ImpactCredential) => `${r.sourceId}:${r.badgeId}`;
      const certificatePairs = new Set(certificates.map(pair));
      const claimedPairs = new Set(
        data.claims.map((c) => `${c.source_id}:${c.badge_id}`),
      );
      credentials = {
        available: !source.warning,
        warning: source.warning,
        badges: badges.length,
        certificates: certificates.length,
        recipients: new Set(records.map((r) => r.learnerId)).size,
        pairedAccomplishments: badges.filter((r) =>
          certificatePairs.has(pair(r)),
        ).length,
        sharedBadges: badges.filter((r) => r.shared).length,
        acknowledgedAwards: new Set(
          records.filter((r) => claimedPairs.has(pair(r))).map(pair),
        ).size,
        excluded: scoped.filter((r) => !r.signatureValid || r.revoked).length,
      };
    }
    const bucketDays = (end - from) / DAY <= 31 ? 1 : 7;
    const trend = [];
    for (let start = from; start < end; start += bucketDays * DAY)
      trend.push({
        date: date(start),
        registrations: registrations.filter(
          (r) =>
            Date.parse(r.created_at) >= start &&
            Date.parse(r.created_at) < Math.min(end, start + bucketDays * DAY),
        ).length,
      });
    return {
      generatedAt: new Date().toISOString(),
      range: {
        from: date(from),
        to: date(last),
        previousFrom: date(previous),
        previousTo: date(from - DAY),
        days: (end - from) / DAY,
      },
      filters: {
        offeringId: data.offeringId,
        cohortId: query.cohortId ?? null,
      },
      options: {
        offerings: data.offerings.map((o) => ({ id: o.id, title: o.title })),
        cohorts: data.cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          offeringId: c.offering_id,
        })),
      },
      reach: {
        learners: learnerIds.size,
        registrations: registrations.length,
        previousLearners: new Set(
          previousRegistrations.map((r) => r.learner_id),
        ).size,
        previousRegistrations: previousRegistrations.length,
        returningLearners: [...learnerIds].filter((id) => oldIds.has(id))
          .length,
        enrolled: registrations.filter((r) => r.status === "enrolled").length,
      },
      progress: {
        assignments: progress.assignments,
        completed: progress.completed,
        inProgress: progress.inProgress,
        awaitingVerification: progress.awaitingVerification,
        notStarted: progress.notStarted,
        completionRate: progress.completionRate,
        learners: new Set(data.assignments.map((p) => p.learner_id)).size,
        requiredSteps: data.assignments.reduce((n, p) => n + p.required, 0),
        verifiedSteps: data.assignments.reduce((n, p) => n + p.completed, 0),
      },
      trend,
      offerings: rows,
      cohorts,
      skills: [...skillMap.values()]
        .map((s) => ({
          id: s.id,
          name: s.name,
          offerings: s.offerings.size,
          learners: s.learners.size,
        }))
        .sort(
          (a, b) => b.learners - a.learners || a.name.localeCompare(b.name),
        ),
      credentials,
      canvas: {
        authorized: data.grants > 0,
        message:
          data.grants > 0
            ? "A matching saved Canvas authorization exists. This dashboard measures portal registrations and staff-verified progress; course activity remains in Alerts."
            : "Canvas activity is unavailable until an approved staff Canvas authorization is connected. No activity or grades are inferred.",
      },
    };
  }
}
@Controller("api/v1/staff/engagement-impact")
@UseGuards(PrototypeGuard)
export class EngagementImpactController {
  constructor(private readonly service: EngagementImpactService) {}
  @Get() dashboard(@Req() req: any, @Query() query: EngagementImpactQuery) {
    requireScope(req, "reports:read");
    return this.service.dashboard(req.principal, query);
  }
}
