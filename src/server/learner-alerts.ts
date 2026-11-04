import {
  BadRequestException,
  ConflictException,
  Controller,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Body,
  Get,
  Post,
  Req,
  Param,
  Headers,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import {
  IsString,
  IsIn,
  IsInt,
  IsBoolean,
  IsUUID,
  Min,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { createHash } from "node:crypto";
import {
  alertKinds,
  AlertKind,
  AlertCandidate,
  DAY_MS,
  CanvasAlertSession,
} from "../domain/learner-alerts";
import { prisma, sql, transaction, Tx } from "../domain/prisma";
import { Principal, PrototypeGuard, requireScope } from "./auth";
import { PortalService, audit } from "./service";
import { CanvasCoursesService } from "./canvas-courses";
import { CanvasCourseClient } from "./canvas-course-client";
import { canvasStaffConfig, staffAuthMode } from "./staff-auth-config";
import { grantBinding, openCanvasTokens } from "./canvas-tokens";
import { scopesFor } from "./roles";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class AlertRuleDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(alertKinds) kind!: AlertKind;
  @ValidateIf((o) => o.offeringId !== null) @IsUUID() offeringId!:
    string | null;
  @ValidateIf((o) => o.cohortId !== null) @IsUUID() cohortId!: string | null;
  @ValidateIf((o) => o.learnerId !== null) @IsUUID() learnerId!: string | null;
  @IsInt() @Min(1) @Max(365) days!: number;
  @IsInt() @Min(0) @Max(100) threshold!: number;
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) version!: number;
}
export class AlertActionDto {
  @IsIn(["acknowledge", "snooze", "resolve", "reopen"]) action!: string;
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(1) @Max(30) days: number = 7;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
export class AlertSyncDto {
  @IsInt() @Min(1) version!: number;
}
type Rule = any;
type Credential = {
  key: string;
  learnerId: string;
  title: string;
  validUntil: string | null;
  kind: string;
  sourceId: string;
  badgeId: string;
  signatureValid: boolean;
  revoked: boolean;
};
type Result = {
  candidates: AlertCandidate[];
  unknown: Set<string>;
  warning: string | null;
  authoritative: boolean;
};
@Injectable()
export class LearnerAlertsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly portal: PortalService,
    private readonly canvas: CanvasCoursesService,
  ) {}
  credentialReader:
    (() => Promise<{ records: Credential[]; warning: string | null }>) | null =
    null;
  request: typeof fetch = (...args) => fetch(...args);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  lastWorkerError: string | null = null;
  onModuleInit() {
    if (process.env.ALERTS_WORKER_ENABLED === "false") return;
    this.timer = setInterval(() => void this.scheduledTick(), 60000);
    this.timer.unref();
  }
  private async scheduledTick() {
    // Provider reads may be slow; they must not hold up local minute checks.
    const local = this.evaluate().catch(() => {
      this.lastWorkerError =
        "Local alert checks could not complete. Refresh and check the portal server.";
    });
    await Promise.allSettled([local, this.tick()]);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async canvasSession(p: Principal): Promise<CanvasAlertSession> {
    const mode = staffAuthMode();
    const member = p.staffId
      ? await prisma.staff_members.findUnique({ where: { id: p.staffId } })
      : null;
    const result: CanvasAlertSession = {
      mode,
      staffId: p.staffId ?? null,
      staffName: member?.display_name ?? "Staff member",
      status: "reconnect",
      connected: false,
      canSync: false,
      message:
        "Sign in again through Canvas to authorize activity and grade reads for this account.",
    };
    const unavailable = (
      status: CanvasAlertSession["status"],
      message: string,
    ) => ({ ...result, status, message });
    if (mode !== "canvas")
      return unavailable(
        "mock",
        "Local preview login is active. Live Canvas alerts require university SSO through Canvas; no Canvas activity is read under a demo identity.",
      );
    if (
      !member?.active ||
      !p.scopes.includes("canvas:read") ||
      !scopesFor(member.roles).includes("canvas:read")
    )
      return unavailable(
        "forbidden",
        "Your portal role does not allow Canvas alert data.",
      );
    if (
      process.env.CANVAS_ALERTS_ENABLED !== "true" ||
      process.env.CANVAS_COURSES_ENABLED !== "true"
    )
      return unavailable(
        "disabled",
        "Canvas alert reads are not enabled for this portal. Local progress and credential alerts still follow portal permissions.",
      );
    let config: ReturnType<typeof canvasStaffConfig>;
    try {
      config = canvasStaffConfig();
    } catch {
      return unavailable(
        "unconfigured",
        "Canvas authorization is not configured. A portal administrator must finish the existing Canvas connection setup.",
      );
    }
    if (member.auth_provider !== config.provider || !member.external_subject)
      return unavailable(
        "reconnect",
        "This staff account needs its verified Canvas identity linked before university sign-in can supply alert data.",
      );
    const grant = await prisma.staff_canvas_grants.findUnique({
      where: { staff_id: member.id },
    });
    if (
      !grant ||
      grant.provider !== config.provider ||
      grant.subject !== member.external_subject ||
      grant.configuration_hash !== config.fingerprint
    )
      return result;
    try {
      openCanvasTokens(
        grant.encrypted_tokens,
        grantBinding(
          member.id,
          grant.provider,
          grant.subject,
          grant.configuration_hash,
        ),
      );
    } catch {
      return unavailable(
        "reconnect",
        "Saved Canvas authorization is unavailable. Sign in again through Canvas; existing alert history is retained.",
      );
    }
    return {
      ...result,
      status: "connected",
      connected: true,
      canSync:
        p.scopes.includes("canvas:sync") &&
        p.scopes.includes("alerts:manage") &&
        scopesFor(member.roles).includes("canvas:sync") &&
        scopesFor(member.roles).includes("alerts:manage"),
      message:
        "Canvas alerts use your university sign-in and saved Canvas authorization. Only your Canvas rules and their observations are displayed; Canvas controls which course activity and grades your account can read.",
    };
  }
  private async ownerSession(id: string) {
    const member = await prisma.staff_members.findUnique({ where: { id } });
    return this.canvasSession({
      actor: `staff:${id}`,
      staffId: id,
      scopes: member?.active ? scopesFor(member.roles) : [],
    });
  }
  private visible(principal: Principal, kind: string) {
    return kind === "credential_expiration"
      ? principal.scopes.includes("badges:manage")
      : kind.startsWith("canvas_")
        ? principal.scopes.includes("canvas:read")
        : true;
  }
  private async rule(id: string) {
    const [r] = await sql<Rule>(
      prisma,
      "SELECT * FROM learner_alert_rules WHERE id=$1::uuid",
      id,
    );
    if (!r) throw new NotFoundException("Alert rule not found.");
    return r;
  }
  private permitted(p: Principal, r: Rule) {
    if (!this.visible(p, r.kind))
      throw new ForbiddenException(
        "You do not have access to this alert source.",
      );
    if (
      r.kind.startsWith("canvas_") &&
      r.owner_id !== undefined &&
      r.owner_id !== p.staffId
    )
      throw new ForbiddenException(
        "Canvas alert rules and history belong to the staff account that authorized them. Create a rule under your own university sign-in.",
      );
  }
  async save(p: Principal, key: string, body: AlertRuleDto, id?: string) {
    if (!body.name.trim())
      throw new BadRequestException("Name the alert rule.");
    this.permitted(p, body);
    let offeringId = body.offeringId;
    if (body.cohortId) {
      const [c] = await sql<any>(
        prisma,
        "SELECT p.offering_id FROM progress_cohorts c JOIN progress_plans p ON p.id=c.plan_id WHERE c.id=$1::uuid",
        body.cohortId,
      );
      if (!c) throw new BadRequestException("Cohort not found.");
      if (body.kind !== "credential_expiration") {
        if (offeringId && offeringId !== c.offering_id)
          throw new BadRequestException(
            "The cohort belongs to a different offering.",
          );
        offeringId = c.offering_id;
      }
    }
    if (
      offeringId &&
      !(await prisma.offerings.findUnique({ where: { id: offeringId } }))
    )
      throw new BadRequestException("Offering not found.");
    if (
      body.learnerId &&
      !(await prisma.learners.findFirst({
        where: { id: body.learnerId, active: true },
      }))
    )
      throw new BadRequestException("Active learner not found.");
    if (body.kind === "credential_expiration" && offeringId)
      throw new BadRequestException(
        "Credential rules use all learners, a cohort, or one learner; badges do not have an implicit offering association.",
      );
    if (body.kind.startsWith("canvas_") && !offeringId)
      throw new BadRequestException(
        "Choose an offering or cohort for a Canvas rule.",
      );
    return this.portal.command(
      p,
      key,
      { action: "alerts.rule", id, ...body },
      async (tx) => {
        let row;
        if (id) {
          const [old] = await sql<any>(
            tx,
            "SELECT * FROM learner_alert_rules WHERE id=$1::uuid FOR UPDATE",
            id,
          );
          if (!old) throw new NotFoundException("Alert rule not found.");
          this.permitted(p, old);
          if (old.kind !== body.kind)
            throw new BadRequestException(
              "Create a separate rule to change its condition type; historical source permissions are preserved.",
            );
          if (old.version !== body.version)
            throw new ConflictException("Rule changed. Refresh before saving.");
          const oldAlerts = await sql<any>(
            tx,
            "UPDATE learner_alerts SET state='resolved',resolution_kind='rule_changed',snoozed_until=NULL,updated_at=now(),version=version+1 WHERE rule_id=$1::uuid AND state<>'resolved' RETURNING id",
            id,
          );
          for (const a of oldAlerts)
            await this.history(
              tx,
              a.id,
              "resolved",
              p.actor,
              "Rule revised or paused.",
            );
          [row] = await sql<any>(
            tx,
            `UPDATE learner_alert_rules SET name=$2,kind=$3,offering_id=$4::uuid,cohort_id=$5::uuid,learner_id=$6::uuid,days=$7,threshold=$8,enabled=$9,version=version+1,owner_id=$10::uuid,updated_at=now(),evaluated_at=NULL,evaluation_error=NULL,source_warning=NULL,canvas_snapshot=NULL,sync_error=NULL,sync_succeeded_at=NULL,sync_started_at=NULL,next_sync_at=now() WHERE id=$1::uuid RETURNING *`,
            id,
            body.name.trim(),
            body.kind,
            offeringId,
            body.cohortId,
            body.learnerId,
            body.days,
            body.threshold,
            body.enabled,
            p.staffId,
          );
        } else {
          if (body.version !== 0)
            throw new ConflictException("New rules start at version zero.");
          [row] = await sql<any>(
            tx,
            `INSERT INTO learner_alert_rules(name,kind,offering_id,cohort_id,learner_id,days,threshold,enabled,owner_id) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid) RETURNING *`,
            body.name.trim(),
            body.kind,
            offeringId,
            body.cohortId,
            body.learnerId,
            body.days,
            body.threshold,
            body.enabled,
            p.staffId,
          );
        }
        await audit(tx, p.actor, "alerts.rule_saved", row.id, {
          kind: row.kind,
          version: row.version,
          enabled: row.enabled,
        });
        return row;
      },
    );
  }
  async dashboard(p: Principal) {
    // Local checks also run on refresh; Canvas reads require an explicit authorized sync or the worker.
    await this.evaluate();
    const allRules = await sql<any>(
      prisma,
      "SELECT id,name,kind,offering_id,cohort_id,learner_id,days,threshold,enabled,version,owner_id,created_at,evaluated_at,evaluation_error,source_warning,sync_succeeded_at,sync_checked_at,sync_error,canvas_snapshot->>'configuration' canvas_configuration FROM learner_alert_rules ORDER BY created_at DESC",
    );
    const canvasSession = await this.canvasSession(p);
    const visibleRules = allRules.filter(
      (r) =>
        this.visible(p, r.kind) &&
        (!r.kind.startsWith("canvas_") || r.owner_id === p.staffId),
    );
    // A valid portal login is not by itself permission to expose someone else's API observations.
    const fingerprint = canvasSession.connected
      ? canvasStaffConfig().fingerprint
      : null;
    const ids = visibleRules
      .filter(
        (r) =>
          !r.kind.startsWith("canvas_") ||
          (canvasSession.connected && r.canvas_configuration === fingerprint),
      )
      .map((r) => r.id);
    const rules = visibleRules.map(({ canvas_configuration, ...rule }) => rule);
    const alerts = await sql<any>(
      prisma,
      `SELECT a.*,r.name rule_name,r.kind,coalesce(l.display_name,l.email,'Learner') learner_name,
   (r.evaluation_error IS NOT NULL OR (r.kind='credential_expiration' AND r.source_warning IS NOT NULL) OR (r.kind LIKE 'canvas_%' AND (r.sync_error IS NOT NULL OR r.sync_succeeded_at IS NULL OR r.sync_succeeded_at<now()-interval '24 hours' OR r.source_warning IS NOT NULL))) source_unavailable
   FROM learner_alerts a JOIN learner_alert_rules r ON r.id=a.rule_id JOIN learners l ON l.id=a.learner_id WHERE a.rule_id=ANY($1::uuid[]) ORDER BY (a.state='open') DESC,a.detected_at DESC LIMIT 501`,
      ids,
    );
    const counts = await sql<any>(
      prisma,
      "SELECT state,count(*)::int count FROM learner_alerts WHERE rule_id=ANY($1::uuid[]) GROUP BY state",
      ids,
    );
    const [offerings, cohorts, learners] = await Promise.all([
      prisma.offerings.findMany({
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      sql<any>(
        prisma,
        "SELECT c.id,c.name,p.offering_id FROM progress_cohorts c JOIN progress_plans p ON p.id=c.plan_id ORDER BY c.name",
      ),
      sql<any>(
        prisma,
        "SELECT id,coalesce(display_name,email,'Learner') name FROM learners WHERE active ORDER BY display_name,email,id",
      ),
    ]);
    return {
      rules,
      canvasSession,
      alerts: alerts.slice(0, 500),
      limited: alerts.length > 500,
      counts: Object.fromEntries(counts.map((r) => [r.state, r.count])),
      checkedAt: new Date().toISOString(),
      canvasEnabled: process.env.CANVAS_ALERTS_ENABLED === "true",
      workerEnabled: process.env.ALERTS_WORKER_ENABLED !== "false",
      lastWorkerError: this.lastWorkerError,
      options: { offerings, cohorts, learners },
    };
  }
  private async history(
    tx: Tx,
    id: string,
    action: string,
    actor: string,
    note: string,
  ) {
    await sql(
      tx,
      "INSERT INTO learner_alert_history(alert_id,action,actor,note) VALUES($1::uuid,$2,$3,$4)",
      id,
      action,
      actor,
      note,
    );
  }
  async act(p: Principal, key: string, id: string, b: AlertActionDto) {
    if (b.note.trim().length < 3)
      throw new BadRequestException("Add a short action note.");
    return this.portal.command(
      p,
      key,
      { action: "alerts.action", id, body: b },
      async (tx) => {
        const [a] = await sql<any>(
          tx,
          "SELECT a.*,r.kind,r.owner_id FROM learner_alerts a JOIN learner_alert_rules r ON r.id=a.rule_id WHERE a.id=$1::uuid FOR UPDATE OF a",
          id,
        );
        if (!a) throw new NotFoundException("Alert not found.");
        this.permitted(p, a);
        if (
          a.kind.startsWith("canvas_") &&
          !(await this.canvasSession(p)).connected
        )
          throw new ForbiddenException(
            "Reconnect your Canvas authorization before managing Canvas alerts.",
          );
        if (a.version !== b.version)
          throw new ConflictException(
            "Alert changed. Refresh before taking action.",
          );
        if (b.action !== "resolve") {
          const [r] = await sql<any>(
            tx,
            "SELECT enabled,version FROM learner_alert_rules WHERE id=$1::uuid",
            a.rule_id,
          );
          if (!r.enabled || r.version !== a.rule_version)
            throw new ConflictException(
              "This rule revision is no longer active.",
            );
        }
        const state = {
          acknowledge: "acknowledged",
          snooze: "snoozed",
          resolve: "resolved",
          reopen: "open",
        }[b.action];
        const [row] = await sql<any>(
          tx,
          "UPDATE learner_alerts SET state=$2,snoozed_until=CASE WHEN $2='snoozed' THEN now()+make_interval(days=>$3) ELSE NULL END,resolution_kind=CASE WHEN $2='resolved' THEN 'manual' ELSE NULL END,updated_at=now(),version=version+1 WHERE id=$1::uuid RETURNING *",
          id,
          state,
          b.days,
        );
        await this.history(tx, id, b.action, p.actor, b.note.trim());
        await audit(tx, p.actor, "alerts.action", id, { action: b.action });
        return row;
      },
    );
  }
  async alertHistory(p: Principal, id: string) {
    const [a] = await sql<any>(
      prisma,
      "SELECT r.kind,r.owner_id FROM learner_alerts a JOIN learner_alert_rules r ON r.id=a.rule_id WHERE a.id=$1::uuid",
      id,
    );
    if (!a) throw new NotFoundException("Alert not found.");
    this.permitted(p, a);
    if (
      a.kind.startsWith("canvas_") &&
      !(await this.canvasSession(p)).connected
    )
      throw new ForbiddenException(
        "Reconnect your Canvas authorization before viewing Canvas alert history.",
      );
    return sql(
      prisma,
      "SELECT h.action,coalesce(s.display_name,CASE WHEN h.actor='alerts-worker' THEN 'Scheduled check' ELSE h.actor END) actor,h.actor actor_key,h.note,h.at FROM learner_alert_history h LEFT JOIN staff_members s ON s.id::text=regexp_replace(h.actor,'^(staff|portal):','') WHERE h.alert_id=$1::uuid ORDER BY h.at,h.id",
      id,
    );
  }
  private async progress(r: Rule): Promise<Result> {
    const rows = await sql<any>(
      prisma,
      `SELECT a.id,a.learner_id,a.assigned_at,o.title,p.offering_id,
   bool_and(e.state IS NOT DISTINCT FROM 'completed') complete,max(e.recorded_at) last_recorded,
   array_agg(coalesce(e.id::text,'unverified') ORDER BY s.position) events
   FROM progress_participants a JOIN learners l ON l.id=a.learner_id AND l.active
   JOIN progress_plans p ON p.id=a.plan_id JOIN offerings o ON o.id=p.offering_id JOIN progress_steps s ON s.plan_id=p.id AND s.required
   LEFT JOIN LATERAL(SELECT * FROM progress_evidence x WHERE x.participant_id=a.id AND x.step_id=s.id ORDER BY sequence DESC LIMIT 1) e ON true
   WHERE ($1::uuid IS NULL OR p.offering_id=$1::uuid) AND ($2::uuid IS NULL OR a.learner_id=$2::uuid)
   AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m WHERE m.participant_id=a.id AND m.cohort_id=$3::uuid AND m.active))
   GROUP BY a.id,o.title,p.offering_id`,
      r.offering_id,
      r.learner_id,
      r.cohort_id,
    );
    const candidates: AlertCandidate[] = [];
    const now = Date.now();
    for (const row of rows) {
      const observed = new Date(
        row.last_recorded ?? row.assigned_at,
      ).toISOString();
      const age = (now - Date.parse(observed)) / DAY_MS;
      if (
        r.kind === "completion"
          ? row.complete && age >= 0 && age <= r.days
          : !row.complete && age >= r.days
      )
        candidates.push({
          key: row.id + ":" + hash(row.events),
          subject: row.id,
          learnerId: row.learner_id,
          title:
            r.kind === "completion"
              ? "Completion verified"
              : "Verification needs review",
          message:
            r.kind === "completion"
              ? `All required steps for ${row.title} are verified complete.`
              : `No required-step verification update for ${row.title} in ${Math.floor(age)} days. This is not evidence of student inactivity.`,
          observedAt: observed,
          evidence: {
            source: "staff_verification",
            offeringId: row.offering_id,
            participantId: row.id,
            lastVerificationAt: row.last_recorded ?? null,
            assignedAt: row.assigned_at,
          },
        });
    }
    return {
      candidates,
      unknown: new Set(),
      warning: null,
      authoritative: true,
    };
  }
  private async expiration(r: Rule): Promise<Result> {
    if (!this.credentialReader)
      return {
        candidates: [],
        unknown: new Set(),
        warning: "Credential service is unavailable.",
        authoritative: false,
      };
    const data = await this.credentialReader();
    if (data.warning)
      return {
        candidates: [],
        unknown: new Set(),
        warning: data.warning,
        authoritative: false,
      };
    let members: Set<string> | null = null;
    if (r.cohort_id) {
      const ids = await sql<any>(
        prisma,
        "SELECT p.learner_id FROM progress_cohort_members m JOIN progress_participants p ON p.id=m.participant_id WHERE m.cohort_id=$1::uuid AND m.active",
        r.cohort_id,
      );
      members = new Set(ids.map((x) => x.learner_id));
    }
    const now = Date.now();
    return {
      candidates: data.records
        .filter(
          (x) =>
            x.signatureValid &&
            !x.revoked &&
            x.validUntil &&
            Date.parse(x.validUntil) > now &&
            Date.parse(x.validUntil) <= now + r.days * DAY_MS &&
            (!r.learner_id || x.learnerId === r.learner_id) &&
            (!members || members.has(x.learnerId)),
        )
        .map((x) => ({
          key: x.key + ":" + x.validUntil,
          subject: x.key,
          learnerId: x.learnerId,
          title: `${x.kind === "certificate" ? "Certificate" : "Badge"} expires soon`,
          message: `${x.title} is valid through ${x.validUntil!.slice(0, 10)} (UTC).`,
          observedAt: new Date().toISOString(),
          evidence: {
            source: "signed_credential",
            credentialKind: x.kind,
            sourceId: x.sourceId,
            badgeId: x.badgeId,
            validUntil: x.validUntil,
          },
        })),
      unknown: new Set(),
      warning: null,
      authoritative: true,
    };
  }
  private async canvasScope(r: Rule) {
    const [mapping] = await sql<any>(
      prisma,
      "SELECT * FROM canvas_offering_mappings WHERE offering_id=$1::uuid",
      r.offering_id,
    );
    if (!mapping)
      throw new BadRequestException(
        "The offering needs an explicit Canvas course mapping.",
      );
    const people = await sql<any>(
      prisma,
      `SELECT DISTINCT l.id,l.auth_provider,l.external_subject FROM learners l JOIN entitlements e ON e.learner_id=l.id AND e.offering_id=$1::uuid AND e.status='enrolled' WHERE l.active AND ($2::uuid IS NULL OR l.id=$2::uuid) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM progress_cohort_members m JOIN progress_participants p ON p.id=m.participant_id WHERE m.cohort_id=$3::uuid AND m.active AND p.learner_id=l.id)) ORDER BY l.id`,
      r.offering_id,
      r.learner_id,
      r.cohort_id,
    );
    return {
      mapping,
      people,
      binding: hash([
        r.owner_id,
        mapping.installation_url,
        mapping.course_id,
        people.map((p) => [p.id, p.auth_provider, p.external_subject]),
      ]),
    };
  }
  async sync(p: Principal, id: string, version: number, key: string) {
    const r = await this.rule(id);
    this.permitted(p, r);
    if (!r.kind.startsWith("canvas_"))
      throw new BadRequestException("This rule does not use Canvas.");
    if (!r.enabled || r.version !== version)
      throw new ConflictException("Rule changed or paused. Refresh first.");
    const session = await this.canvasSession(p);
    if (!session.connected || !session.canSync)
      throw new ForbiddenException(session.message);
    // Sync never adopts or borrows another staff member's authorization.
    await this.portal.command(
      p,
      key,
      { action: "alerts.canvas_sync", id, version },
      async (tx) => {
        const [current] = await sql<Rule>(
          tx,
          "SELECT * FROM learner_alert_rules WHERE id=$1::uuid FOR UPDATE",
          id,
        );
        if (!current || !current.enabled || current.version !== version)
          throw new ConflictException("Rule changed or paused. Refresh first.");
        this.permitted(p, current);
        await audit(tx, p.actor, "alerts.canvas_sync_requested", id);
      },
    );
    await this.syncRule(r, true);
    await this.evaluate();
    return { checked: true };
  }
  private async syncRule(r: Rule, force = false) {
    const claimed = await sql<any>(
      prisma,
      `UPDATE learner_alert_rules SET sync_started_at=now(),next_sync_at=now()+interval '1 hour' WHERE id=$1::uuid AND version=$2 AND enabled AND (($3 AND (sync_checked_at IS NULL OR sync_checked_at<now()-interval '1 minute')) OR (NOT $3 AND next_sync_at<=now()) OR sync_started_at<now()-interval '3 minutes') AND (sync_started_at IS NULL OR sync_started_at<now()-interval '3 minutes') RETURNING id`,
      r.id,
      r.version,
      force,
    );
    if (!claimed.length) return;
    try {
      if (process.env.CANVAS_ALERTS_ENABLED !== "true")
        throw new Error("disabled");
      const session = await this.ownerSession(r.owner_id);
      if (!session.connected || !session.canSync)
        throw new Error("authorization");
      const config = canvasStaffConfig();
      const origin = new URL(config.tokenUrl).origin;
      const scope = await this.canvasScope(r);
      if (scope.mapping.installation_url !== origin) throw new Error("binding");
      const client = new CanvasCourseClient(
        origin,
        config.userAgent,
        (refresh) => this.canvas.accessToken(r.owner_id, refresh),
        AbortSignal.timeout(90000),
        this.request,
      );
      const enrollments = await client.alertEnrollments(
        scope.mapping.course_id,
      );
      const rows = scope.people.map((p) => {
        const e =
          p.auth_provider === `canvas:${origin}` && p.external_subject
            ? enrollments.find((e) => e.userId === p.external_subject)
            : null;
        return {
          learnerId: p.id,
          ...(e
            ? {
                lastActivityAt: e.lastActivityAt,
                activityKnown: e.activityKnown,
                score: e.score,
                startedAt: e.startedAt,
              }
            : { unavailable: true }),
        };
      });
      const snapshot = {
        binding: scope.binding,
        configuration: config.fingerprint,
        observedAt: new Date().toISOString(),
        rows,
      };
      await sql(
        prisma,
        "UPDATE learner_alert_rules SET canvas_snapshot=$3::jsonb,sync_succeeded_at=now(),sync_checked_at=now(),sync_error=NULL,sync_started_at=NULL WHERE id=$1::uuid AND version=$2",
        r.id,
        r.version,
        JSON.stringify(snapshot),
      );
    } catch {
      const message =
        process.env.CANVAS_ALERTS_ENABLED !== "true"
          ? "Canvas activity reads are not enabled. Configure Canvas access and sign in with the required scope."
          : "Canvas data unavailable. Check the course mapping, your university login, and enrollment/grade read permissions; then retry.";
      await sql(
        prisma,
        "UPDATE learner_alert_rules SET sync_checked_at=now(),sync_error=$3,sync_started_at=NULL WHERE id=$1::uuid AND version=$2",
        r.id,
        r.version,
        message,
      );
    }
  }
  private async canvasResult(r: Rule): Promise<Result> {
    const session = await this.ownerSession(r.owner_id);
    if (!session.connected || !session.canSync)
      return {
        candidates: [],
        unknown: new Set(),
        warning: session.message,
        authoritative: false,
      };
    const scope = await this.canvasScope(r);
    const snap = r.canvas_snapshot;
    let configFingerprint: string | null = null;
    try {
      configFingerprint = canvasStaffConfig().fingerprint;
    } catch {}
    if (
      process.env.CANVAS_ALERTS_ENABLED !== "true" ||
      r.sync_error ||
      !snap ||
      snap.binding !== scope.binding ||
      snap.configuration !== configFingerprint ||
      Date.now() - Date.parse(snap.observedAt) > DAY_MS
    )
      return {
        candidates: [],
        unknown: new Set(),
        warning:
          r.sync_error ||
          "Canvas data unavailable or stale. Sync a current authorized snapshot.",
        authoritative: false,
      };
    const candidates: AlertCandidate[] = [],
      unknown = new Set<string>();
    const now = Date.now();
    for (const person of scope.people) {
      const row = snap.rows.find((x: any) => x.learnerId === person.id);
      if (!row || row.unavailable) {
        unknown.add(person.id);
        continue;
      }
      if (r.kind === "canvas_inactivity") {
        if (!row.activityKnown || (!row.lastActivityAt && !row.startedAt)) {
          unknown.add(person.id);
          continue;
        }
        const observed = row.lastActivityAt ?? row.startedAt;
        const age = (now - Date.parse(observed)) / DAY_MS;
        if (age >= r.days)
          candidates.push({
            key:
              person.id + ":" + (row.lastActivityAt ?? "none:" + row.startedAt),
            subject: person.id,
            learnerId: person.id,
            title: "Canvas activity needs review",
            message: row.lastActivityAt
              ? `No recorded Canvas course activity for ${Math.floor(age)} days.`
              : `No Canvas activity recorded within ${Math.floor(age)} days of the enrollment start.`,
            observedAt: observed,
            evidence: {
              source: "canvas",
              lastActivityAt: row.lastActivityAt,
              syncedAt: snap.observedAt,
              offeringId: r.offering_id,
            },
          });
      } else {
        if (row.score === null || row.score === undefined) {
          unknown.add(person.id);
          continue;
        }
        if (row.score < r.threshold)
          candidates.push({
            key: person.id + ":" + row.score,
            subject: person.id,
            learnerId: person.id,
            title: "Canvas score needs review",
            message: `Current Canvas course score ${row.score}% is below the ${r.threshold}% rule threshold.`,
            observedAt: snap.observedAt,
            evidence: {
              source: "canvas",
              score: row.score,
              threshold: r.threshold,
              syncedAt: snap.observedAt,
              offeringId: r.offering_id,
            },
          });
      }
    }
    return {
      candidates,
      unknown,
      warning: !scope.people.length
        ? "No active enrolled portal learners match this scope."
        : unknown.size
          ? `${unknown.size} linked enrollment(s) have unavailable activity or grade data; no inactivity or zero-score assumption was made.`
          : null,
      authoritative: true,
    };
  }
  async evaluate() {
    // Serializes across API instances. Provider network calls happen outside this transaction.
    return transaction(async (tx) => {
      const [locked] = await sql<any>(
        tx,
        "SELECT pg_try_advisory_xact_lock(21001104) locked",
      );
      if (!locked.locked) return;
      const rules = await sql<any>(
        tx,
        "SELECT r.* FROM learner_alert_rules r JOIN staff_members s ON s.id=r.owner_id WHERE r.enabled ORDER BY r.created_at FOR UPDATE OF r",
      );
      const wake = await sql<any>(
        tx,
        "UPDATE learner_alerts SET state='open',snoozed_until=NULL,version=version+1,updated_at=now() WHERE state='snoozed' AND snoozed_until<=now() RETURNING id",
      );
      for (const a of wake)
        await this.history(
          tx,
          a.id,
          "reopened",
          "alerts-worker",
          "Snooze ended.",
        );
      for (const r of rules) {
        try {
          const owner = await tx.staff_members.findUnique({
            where: { id: r.owner_id },
          });
          if (
            !owner?.active ||
            !scopesFor(owner.roles).includes("alerts:manage")
          ) {
            await sql(
              tx,
              "UPDATE learner_alert_rules SET evaluated_at=now(),evaluation_error='The rule owner is no longer authorized. The owner must restore their authorization; another manager can create a rule under their own login.' WHERE id=$1::uuid",
              r.id,
            );
            continue;
          }
          const result =
            r.kind === "credential_expiration"
              ? await this.expiration(r)
              : r.kind.startsWith("canvas_")
                ? await this.canvasResult(r)
                : await this.progress(r);
          if (result.authoritative) {
            const keys = new Set(result.candidates.map((c) => c.key));
            const current = await sql<any>(
              tx,
              "SELECT * FROM learner_alerts WHERE rule_id=$1::uuid AND rule_version=$2 FOR UPDATE",
              r.id,
              r.version,
            );
            for (const c of result.candidates) {
              const existing = current.find((a) => a.episode_key === c.key);
              if (!existing) {
                const [a] = await sql<any>(
                  tx,
                  "INSERT INTO learner_alerts(rule_id,rule_version,episode_key,subject_key,learner_id,title,message,evidence,observed_at) VALUES($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8::jsonb,$9::timestamptz) ON CONFLICT DO NOTHING RETURNING id",
                  r.id,
                  r.version,
                  c.key,
                  c.subject,
                  c.learnerId,
                  c.title,
                  c.message,
                  JSON.stringify(c.evidence),
                  c.observedAt,
                );
                if (a)
                  await this.history(
                    tx,
                    a.id,
                    "detected",
                    "alerts-worker",
                    c.message,
                  );
              } else if (
                existing.state === "resolved" &&
                existing.resolution_kind === "cleared"
              ) {
                await sql(
                  tx,
                  "UPDATE learner_alerts SET state='open',resolution_kind=NULL,version=version+1,updated_at=now(),detected_at=now() WHERE id=$1::uuid",
                  existing.id,
                );
                await this.history(
                  tx,
                  existing.id,
                  "reopened",
                  "alerts-worker",
                  "The condition returned.",
                );
              }
            }
            for (const a of current) {
              if (
                !keys.has(a.episode_key) &&
                !result.unknown.has(a.subject_key) &&
                a.resolution_kind !== "cleared"
              ) {
                await sql(
                  tx,
                  "UPDATE learner_alerts SET state='resolved',resolution_kind='cleared',snoozed_until=NULL,updated_at=now(),version=version+1 WHERE id=$1::uuid",
                  a.id,
                );
                await this.history(
                  tx,
                  a.id,
                  "resolved",
                  "alerts-worker",
                  "The source no longer meets this rule or is outside its scope/window.",
                );
              }
            }
          }
          await sql(
            tx,
            "UPDATE learner_alert_rules SET evaluated_at=now(),evaluation_error=NULL,source_warning=$2 WHERE id=$1::uuid",
            r.id,
            result.warning,
          );
        } catch {
          await sql(
            tx,
            "UPDATE learner_alert_rules SET evaluated_at=now(),evaluation_error='Alert source unavailable. Refresh or check configuration; existing alerts were retained.' WHERE id=$1::uuid",
            r.id,
          );
        }
      }
    });
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const rules = await sql<any>(
        prisma,
        "SELECT * FROM learner_alert_rules WHERE enabled AND kind LIKE 'canvas_%' AND (next_sync_at<=now() OR sync_started_at<now()-interval '3 minutes') ORDER BY next_sync_at LIMIT 5",
      );
      for (const r of rules) {
        const owner = await prisma.staff_members.findUnique({
          where: { id: r.owner_id },
        });
        if (
          owner?.active &&
          scopesFor(owner.roles).includes("alerts:manage") &&
          scopesFor(owner.roles).includes("canvas:sync")
        )
          await this.syncRule(r);
      }
      await this.evaluate();
      this.lastWorkerError = null;
    } catch {
      this.lastWorkerError =
        "Scheduled alert checks could not complete. Refresh and check the API/database service.";
      new Logger("LearnerAlerts").warn(this.lastWorkerError);
    } finally {
      this.running = false;
    }
  }
}
@Controller("api/v1/staff/alerts")
@UseGuards(PrototypeGuard)
export class LearnerAlertsController {
  constructor(private readonly alerts: LearnerAlertsService) {}
  @Get() dashboard(@Req() req: any) {
    requireScope(req, "reports:read");
    return this.alerts.dashboard(req.principal);
  }
  @Post("rules") @HttpCode(200) create(
    @Req() req: any,
    @Headers("idempotency-key") key: string,
    @Body() body: AlertRuleDto,
  ) {
    requireScope(req, "alerts:manage");
    return this.alerts.save(req.principal, key, body);
  }
  @Post("rules/:id") @HttpCode(200) edit(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: AlertRuleDto,
  ) {
    requireScope(req, "alerts:manage");
    return this.alerts.save(req.principal, key, body, id);
  }
  @Post("rules/:id/sync") @HttpCode(200) sync(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AlertSyncDto,
    @Headers("idempotency-key") key: string,
  ) {
    requireScope(req, "alerts:manage");
    requireScope(req, "canvas:sync");
    return this.alerts.sync(req.principal, id, body.version, key);
  }
  @Post(":id/action") @HttpCode(200) action(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: AlertActionDto,
  ) {
    requireScope(req, "alerts:manage");
    return this.alerts.act(req.principal, key, id, body);
  }
  @Get(":id/history") history(
    @Req() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    requireScope(req, "reports:read");
    return this.alerts.alertHistory(req.principal, id);
  }
}
