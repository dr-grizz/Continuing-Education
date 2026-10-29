import {
  BadRequestException,
  ConflictException,
  Controller,
  Injectable,
  NotFoundException,
  Body,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { prisma, sql, type Tx } from "../domain/prisma";
import { PrototypeGuard, requireScope } from "./auth";
import { PortalService, audit } from "./service";
import { type Principal } from "./auth";
export class ProgressStepDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsBoolean() required!: boolean;
}
export class ProgressPlanDto {
  @IsUUID() offeringId!: string;
  @IsInt() @Min(0) previousRevision!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProgressStepDto)
  steps!: ProgressStepDto[];
}
export class ProgressCohortDto {
  @IsUUID() planId!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}
export class ProgressMemberDto {
  @IsUUID() learnerId!: string;
  @IsBoolean() active!: boolean;
}
export class ProgressAssignDto {
  @IsUUID() learnerId!: string;
}
export class ProgressEvidenceDto {
  @IsUUID() stepId!: string;
  @IsIn(["not_started", "in_progress", "completed"]) state!: string;
  @IsString() @MinLength(10) @MaxLength(1000) note!: string;
  @IsString() @MaxLength(500) reference: string = "";
  @ValidateIf((o) => o.previousEventId !== null) @IsUUID() previousEventId!:
    string | null;
}
@Injectable()
export class ProgressService {
  constructor(private readonly portal: PortalService) {}
  async catalog() {
    const [plans, cohorts, learners] = await Promise.all([
      sql<any>(
        prisma,
        `SELECT p.*,o.title,(SELECT count(*)::integer FROM progress_participants a WHERE a.plan_id=p.id) participants,
    (SELECT jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'required',s.required) ORDER BY s.position) FROM progress_steps s WHERE s.plan_id=p.id) steps
    FROM progress_plans p JOIN offerings o ON o.id=p.offering_id ORDER BY o.title,p.revision DESC`,
      ),
      sql<any>(
        prisma,
        `SELECT c.*,o.title,p.revision,(SELECT count(*)::integer FROM progress_cohort_members m WHERE m.cohort_id=c.id AND m.active) members FROM progress_cohorts c JOIN progress_plans p ON p.id=c.plan_id JOIN offerings o ON o.id=p.offering_id ORDER BY c.name,c.created_at`,
      ),
      prisma.learners.findMany({
        where: { active: true },
        select: { id: true, email: true, display_name: true },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return { plans, cohorts, learners };
  }
  createPlan(principal: Principal, key: string, body: ProgressPlanDto) {
    const titles = body.steps.map((s) => s.title.trim());
    if (
      titles.some((t) => !t) ||
      new Set(titles.map((t) => t.toLowerCase())).size !== titles.length ||
      !body.steps.some((s) => s.required)
    )
      throw new BadRequestException(
        "Use distinct step titles and at least one required step.",
      );
    return this.portal.command(
      principal,
      key,
      { action: "progress.plan", ...body },
      async (tx) => {
        const [offering] = await sql<any>(
          tx,
          "SELECT id FROM offerings WHERE id=$1::uuid FOR UPDATE",
          body.offeringId,
        );
        if (!offering) throw new NotFoundException("Offering not found.");
        const [latest] = await sql<any>(
          tx,
          "SELECT coalesce(max(revision),0)::integer AS revision FROM progress_plans WHERE offering_id=$1::uuid",
          body.offeringId,
        );
        if (latest.revision !== body.previousRevision)
          throw new ConflictException(
            "Requirements changed. Refresh before creating a revision.",
          );
        const [plan] = await sql<any>(
          tx,
          "INSERT INTO progress_plans(offering_id,revision,created_by) VALUES($1::uuid,$2,$3) RETURNING *",
          body.offeringId,
          latest.revision + 1,
          principal.actor,
        );
        for (const [i, step] of body.steps.entries())
          await sql(
            tx,
            "INSERT INTO progress_steps(plan_id,title,position,required) VALUES($1::uuid,$2,$3,$4)",
            plan.id,
            step.title.trim(),
            i + 1,
            step.required,
          );
        await audit(tx, principal.actor, "progress.plan_created", plan.id, {
          offeringId: body.offeringId,
          revision: plan.revision,
        });
        return plan;
      },
    );
  }
  createCohort(principal: Principal, key: string, body: ProgressCohortDto) {
    if (!body.name.trim()) throw new BadRequestException("Name the cohort.");
    return this.portal.command(
      principal,
      key,
      { action: "progress.cohort", ...body },
      async (tx) => {
        await this.plan(tx, body.planId);
        const [row] = await sql<any>(
          tx,
          "INSERT INTO progress_cohorts(name,plan_id,created_by) VALUES($1,$2::uuid,$3) RETURNING *",
          body.name.trim(),
          body.planId,
          principal.actor,
        );
        await audit(tx, principal.actor, "progress.cohort_created", row.id, {
          name: row.name,
          planId: row.plan_id,
        });
        return row;
      },
    );
  }
  async plan(tx: Tx | typeof prisma, id: string) {
    const [plan] = await sql<any>(
      tx,
      "SELECT p.*,o.title FROM progress_plans p JOIN offerings o ON o.id=p.offering_id WHERE p.id=$1::uuid",
      id,
    );
    if (!plan) throw new NotFoundException("Progress plan not found.");
    return plan;
  }
  async assign(
    tx: Tx,
    principal: Principal,
    planId: string,
    learnerId: string,
  ) {
    await this.plan(tx, planId);
    if (
      !(await tx.learners.findFirst({ where: { id: learnerId, active: true } }))
    )
      throw new NotFoundException("Active learner not found.");
    const [row] = await sql<any>(
      tx,
      `INSERT INTO progress_participants(plan_id,learner_id,assigned_by) VALUES($1::uuid,$2::uuid,$3)
    ON CONFLICT(plan_id,learner_id) DO UPDATE SET learner_id=excluded.learner_id RETURNING *`,
      planId,
      learnerId,
      principal.actor,
    );
    return row;
  }
  addParticipant(
    principal: Principal,
    key: string,
    planId: string,
    body: ProgressAssignDto,
  ) {
    return this.portal.command(
      principal,
      key,
      { action: "progress.assign", planId, ...body },
      async (tx) => {
        const row = await this.assign(tx, principal, planId, body.learnerId);
        await audit(tx, principal.actor, "progress.assigned", row.id, {
          planId,
          learnerId: body.learnerId,
        });
        return row;
      },
    );
  }
  member(
    principal: Principal,
    key: string,
    cohortId: string,
    body: ProgressMemberDto,
  ) {
    return this.portal.command(
      principal,
      key,
      { action: "progress.member", cohortId, ...body },
      async (tx) => {
        const [cohort] = await sql<any>(
          tx,
          "SELECT * FROM progress_cohorts WHERE id=$1::uuid FOR UPDATE",
          cohortId,
        );
        if (!cohort) throw new NotFoundException("Cohort not found.");
        let participant;
        if (body.active)
          participant = await this.assign(
            tx,
            principal,
            cohort.plan_id,
            body.learnerId,
          );
        else
          [participant] = await sql<any>(
            tx,
            "SELECT * FROM progress_participants WHERE plan_id=$1::uuid AND learner_id=$2::uuid",
            cohort.plan_id,
            body.learnerId,
          );
        if (!participant) throw new NotFoundException("Participant not found.");
        await sql(
          tx,
          `INSERT INTO progress_cohort_members(cohort_id,participant_id,plan_id,active,changed_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5)
    ON CONFLICT(cohort_id,participant_id) DO UPDATE SET active=excluded.active,changed_at=now(),changed_by=excluded.changed_by`,
          cohortId,
          participant.id,
          cohort.plan_id,
          body.active,
          principal.actor,
        );
        await audit(
          tx,
          principal.actor,
          "progress.membership_changed",
          cohortId,
          { learnerId: body.learnerId, active: body.active },
        );
        return { participantId: participant.id, active: body.active };
      },
    );
  }
  evidence(
    principal: Principal,
    key: string,
    id: string,
    body: ProgressEvidenceDto,
  ) {
    if (body.note.trim().length < 10)
      throw new BadRequestException(
        "Record an evidence or correction note of at least 10 characters.",
      );
    return this.portal.command(
      principal,
      key,
      { action: "progress.evidence", id, ...body },
      async (tx) => {
        const [participant] = await sql<any>(
          tx,
          "SELECT p.* FROM progress_participants p JOIN learners l ON l.id=p.learner_id WHERE p.id=$1::uuid AND l.active FOR UPDATE OF p",
          id,
        );
        if (!participant)
          throw new NotFoundException("Active participant not found.");
        const [step] = await sql(
          tx,
          "SELECT id FROM progress_steps WHERE id=$1::uuid AND plan_id=$2::uuid",
          body.stepId,
          participant.plan_id,
        );
        if (!step)
          throw new BadRequestException(
            "Step does not belong to this participant's requirements.",
          );
        const [latest] = await sql<any>(
          tx,
          "SELECT id FROM progress_evidence WHERE participant_id=$1::uuid AND step_id=$2::uuid ORDER BY sequence DESC LIMIT 1",
          id,
          body.stepId,
        );
        if ((latest?.id ?? null) !== body.previousEventId)
          throw new ConflictException(
            "Evidence changed. Refresh before recording a correction.",
          );
        const [event] = await sql<any>(
          tx,
          `INSERT INTO progress_evidence(participant_id,plan_id,step_id,state,note,reference,recorded_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) RETURNING id,recorded_at`,
          id,
          participant.plan_id,
          body.stepId,
          body.state,
          body.note.trim(),
          body.reference.trim(),
          principal.actor,
        );
        await audit(tx, principal.actor, "progress.evidence_recorded", id, {
          eventId: event.id,
          stepId: body.stepId,
          state: body.state,
          previousEventId: body.previousEventId,
        });
        return event;
      },
    );
  }
  async report(planId: string, cohortId?: string, learnerId?: string) {
    const plan = await this.plan(prisma, planId);
    const steps = await sql<any>(
      prisma,
      "SELECT id,title,required,position FROM progress_steps WHERE plan_id=$1::uuid ORDER BY position",
      planId,
    );
    const rows = await sql<any>(
      prisma,
      `SELECT p.id,p.learner_id,l.email,l.display_name,l.active,p.assigned_at,s.id step_id,
   e.id event_id,e.state,e.note,e.reference,e.recorded_at
   FROM progress_participants p JOIN learners l ON l.id=p.learner_id JOIN progress_steps s ON s.plan_id=p.plan_id
   LEFT JOIN LATERAL(SELECT * FROM progress_evidence x WHERE x.participant_id=p.id AND x.step_id=s.id ORDER BY sequence DESC LIMIT 1) e ON true
   WHERE p.plan_id=$1::uuid AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m WHERE m.participant_id=p.id AND m.cohort_id=$2::uuid AND m.active))
   AND ($3::uuid IS NULL OR p.learner_id=$3::uuid) ORDER BY l.display_name,l.email,p.id,s.position`,
      planId,
      cohortId ?? null,
      learnerId ?? null,
    );
    const members = new Map<string, any>();
    for (const row of rows) {
      if (!members.has(row.id))
        members.set(row.id, {
          id: row.id,
          learnerId: row.learner_id,
          name: row.display_name || row.email || "Learner",
          active: row.active,
          steps: [],
        });
      members.get(row.id).steps.push({
        ...steps.find((s) => s.id === row.step_id),
        eventId: row.event_id,
        state: row.state || "awaiting_verification",
        note: row.note || "",
        reference: row.reference || "",
        recordedAt: row.recorded_at,
        source: row.event_id ? "staff_verification" : null,
      });
    }
    const participants = [...members.values()].map((p) => {
      const required = p.steps.filter((s: any) => s.required),
        completed = required.filter((s: any) => s.state === "completed").length;
      return {
        ...p,
        completed,
        required: required.length,
        percent: required.length
          ? Math.floor((completed / required.length) * 100)
          : 0,
        state:
          required.length && completed === required.length
            ? "completed"
            : required.some(
                  (s: any) =>
                    s.state === "in_progress" || s.state === "completed",
                )
              ? "in_progress"
              : required.some((s: any) => s.state === "awaiting_verification")
                ? "awaiting_verification"
                : "not_started",
      };
    });
    return {
      plan: {
        id: plan.id,
        title: plan.title,
        revision: plan.revision,
        offeringId: plan.offering_id,
      },
      steps,
      participants,
      summary: {
        learners: participants.length,
        completed: participants.filter((p) => p.state === "completed").length,
        inProgress: participants.filter((p) => p.state === "in_progress")
          .length,
        awaitingVerification: participants.filter(
          (p) => p.state === "awaiting_verification",
        ).length,
        notStarted: participants.filter((p) => p.state === "not_started")
          .length,
      },
    };
  }
  async cohortReport(id: string) {
    const [cohort] = await sql<any>(
      prisma,
      "SELECT * FROM progress_cohorts WHERE id=$1::uuid",
      id,
    );
    if (!cohort) throw new NotFoundException("Cohort not found.");
    return {
      ...(await this.report(cohort.plan_id, id)),
      cohort: { id, name: cohort.name },
    };
  }
  async mine(principal: Principal) {
    const plans = await sql<any>(
      prisma,
      "SELECT plan_id FROM progress_participants WHERE learner_id=$1::uuid ORDER BY assigned_at DESC",
      principal.learnerId,
    );
    return Promise.all(
      plans.map(async (p) => {
        const report = await this.report(
          p.plan_id,
          undefined,
          principal.learnerId,
        );
        const { name, learnerId, active, ...progress } = report.participants[0];
        return { plan: report.plan, progress };
      }),
    );
  }
  async history(id: string) {
    return sql(
      prisma,
      `SELECT e.id,e.state,e.note,e.reference,e.recorded_at,e.recorded_by,s.title FROM progress_evidence e JOIN progress_steps s ON s.id=e.step_id WHERE e.participant_id=$1::uuid ORDER BY e.sequence DESC`,
      id,
    );
  }
}
@Controller("api/v1")
@UseGuards(PrototypeGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}
  @Get("me/progress") mine(@Req() req: any) {
    requireScope(req, "learner");
    return this.progress.mine(req.principal);
  }
  @Get("staff/progress") catalog(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.progress.catalog();
  }
  @Get("staff/progress/plans/:id/report") report(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "reports:read");
    return this.progress.report(id);
  }
  @Get("staff/progress/cohorts/:id/report") cohort(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "reports:read");
    return this.progress.cohortReport(id);
  }
  @Get("staff/progress/participants/:id/history") history(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "reports:read");
    return this.progress.history(id);
  }
  @Post("staff/progress/plans") @HttpCode(200) plan(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() body: ProgressPlanDto,
  ) {
    requireScope(req, "progress:manage");
    return this.progress.createPlan(req.principal, key, body);
  }
  @Post("staff/progress/cohorts") @HttpCode(200) createCohort(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() body: ProgressCohortDto,
  ) {
    requireScope(req, "progress:manage");
    return this.progress.createCohort(req.principal, key, body);
  }
  @Post("staff/progress/plans/:id/participants") @HttpCode(200) assign(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ProgressAssignDto,
  ) {
    requireScope(req, "progress:manage");
    return this.progress.addParticipant(req.principal, key, id, body);
  }
  @Post("staff/progress/cohorts/:id/members") @HttpCode(200) member(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ProgressMemberDto,
  ) {
    requireScope(req, "progress:manage");
    return this.progress.member(req.principal, key, id, body);
  }
  @Post("staff/progress/participants/:id/evidence") @HttpCode(200) evidence(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ProgressEvidenceDto,
  ) {
    requireScope(req, "progress:manage");
    return this.progress.evidence(req.principal, key, id, body);
  }
}
