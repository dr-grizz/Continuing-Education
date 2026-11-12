import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
async function main() {
  const original = process.env.DATABASE_URL!,
    base = new URL(original),
    database = `ce_impact_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  const directory = mkdtempSync(join(tmpdir(), "ce-impact-"));
  let db: Pool | undefined,
    child: ChildProcess | undefined,
    localPrisma: any,
    localPool: any,
    created = false,
    checks = 0;
  const check = (actual: unknown, expected: unknown, label: string) => {
    assert.deepEqual(actual, expected, label);
    checks++;
  };
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(base), { pathname: `/${database}` }).href;
    await migrate(url, { quiet: true });
    db = new Pool({ connectionString: url });
    process.env.DATABASE_URL = url;
    const today = Date.parse(new Date().toISOString().slice(0, 10)),
      DAY = 86400000;
    const stamp = (offset: number) =>
      new Date(today + offset * DAY).toISOString();
    const members = (
      await db.query(
        "SELECT id,roles::text[] roles FROM staff_members WHERE active",
      )
    ).rows;
    const manager = members.find((s) => s.roles.includes("catalog_manager")),
      reader = members.find(
        (s) => s.roles.length === 1 && s.roles[0] === "approver",
      );
    const offer = (
      await db.query("SELECT id FROM offerings ORDER BY id LIMIT 3")
    ).rows.map((r) => r.id);
    assert.equal(offer.length, 3);
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of ids.entries())
      await db.query(
        "INSERT INTO learners(id,email,display_name,active,deactivated_at) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          `impact-${i}@example.test`,
          `Impact learner ${i}`,
          i !== 3,
          i === 3 ? new Date() : null,
        ],
      );
    const reg = async (
      l: number,
      o: number,
      offset: number,
      status = "enrolled",
    ) =>
      db!.query(
        "INSERT INTO entitlements(learner_id,offering_id,status,created_at) VALUES($1,$2,$3,$4)",
        [ids[l], offer[o], status, stamp(offset)],
      );
    await reg(0, 0, -6);
    await reg(1, 0, -4, "awaiting_approval");
    await reg(0, 1, -3);
    await reg(2, 1, -2, "declined");
    await reg(3, 0, -2);
    await reg(0, 2, -10);
    await reg(2, 2, 0);
    const skill = {
      id: "2.A.1.a",
      releaseId: randomUUID(),
      name: "Reading comprehension",
      source: "O*NET",
    };
    await db.query(
      "UPDATE offerings SET skills=$1::jsonb WHERE id=ANY($2::uuid[])",
      [JSON.stringify([skill, skill]), offer.slice(0, 2)],
    );
    const plans = [randomUUID(), randomUUID()],
      steps = [[randomUUID(), randomUUID(), randomUUID()], [randomUUID()]];
    for (const [i, id] of plans.entries()) {
      await db.query(
        "INSERT INTO progress_plans(id,offering_id,revision,created_by,created_at) VALUES($1,$2,1,'test',$3)",
        [id, offer[i], stamp(-12)],
      );
      for (const [j, step] of steps[i].entries())
        await db.query(
          "INSERT INTO progress_steps(id,plan_id,title,position,required) VALUES($1,$2,$3,$4,$5)",
          [step, id, `Step ${j}`, j + 1, j !== 2],
        );
    }
    const participants = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    for (const [i, id] of participants.entries())
      await db.query(
        "INSERT INTO progress_participants(id,plan_id,learner_id,assigned_at,assigned_by) VALUES($1,$2,$3,$4,'test')",
        [id, plans[i === 2 ? 1 : 0], ids[i], stamp(-6 + i)],
      );
    const evidence = async (
      p: number,
      s: number,
      offset: number,
      state = "completed",
    ) =>
      db!.query(
        "INSERT INTO progress_evidence(participant_id,plan_id,step_id,state,note,recorded_at,recorded_by) VALUES($1,$2,$3,$4,'Independently documented test evidence',$5,'test')",
        [participants[p], plans[0], steps[0][s], state, stamp(offset)],
      );
    await evidence(0, 0, -3);
    await evidence(0, 1, -3);
    await evidence(1, 0, -2);
    await evidence(0, 0, 0, "not_started");
    const cohorts = [randomUUID(), randomUUID()];
    for (const [i, id] of cohorts.entries())
      await db.query(
        "INSERT INTO progress_cohorts(id,name,plan_id,created_by) VALUES($1,$2,$3,'test')",
        [id, `Impact cohort ${i}`, plans[0]],
      );
    for (const p of [0, 1])
      await db.query(
        "INSERT INTO progress_cohort_members(cohort_id,participant_id,plan_id,changed_by) VALUES($1,$2,$3,'test')",
        [cohorts[0], participants[p], plans[0]],
      );
    await db.query(
      "INSERT INTO progress_cohort_members(cohort_id,participant_id,plan_id,changed_by) VALUES($1,$2,$3,'test')",
      [cohorts[1], participants[0], plans[0]],
    );
    const { EngagementImpactService } =
        await import("../src/server/engagement-impact"),
      prismaModule = await import("../src/domain/prisma"),
      poolModule = await import("../src/domain/db");
    localPrisma = prismaModule.prisma;
    localPool = poolModule.db;
    const service = new EngagementImpactService();
    const principal = {
      actor: "test",
      staffId: manager.id,
      scopes: ["reports:read", "badges:manage", "canvas:read"],
    };
    const query = { from: stamp(-7).slice(0, 10), to: stamp(-1).slice(0, 10) };
    const record = (
      key: string,
      learner: number,
      kind = "badge",
      extra: any = {},
    ) => ({
      key,
      learnerId: ids[learner],
      kind,
      sourceId: "workspace",
      badgeId: key,
      signatureValid: true,
      revoked: false,
      issuedAt: stamp(-2),
      shared: true,
      ...extra,
    });
    service.credentialReader = async () => ({
      warning: null,
      records: [
        record("a", 0),
        record("certificate-a", 0, "certificate", { badgeId: "a" }),
        record("b", 1),
        record("revoked", 0, "badge", { revoked: true }),
        record("invalid", 0, "badge", { signatureValid: false }),
        record("today", 0, "badge", { issuedAt: stamp(0) }),
      ],
    });
    const data = await service.dashboard(principal, query);
    check(
      data.reach.learners,
      3,
      "Distinct learners exclude inactive people and today's registrations",
    );
    check(
      data.reach.registrations,
      4,
      "One learner in two offerings is two registrations",
    );
    check(
      data.reach.previousRegistrations,
      1,
      "Equal-duration comparison uses preceding window",
    );
    check(data.reach.previousLearners, 1, "Comparison distinct learners");
    check(
      data.reach.returningLearners,
      1,
      "Returning means earlier registration, not multiple current-period registrations",
    );
    check(
      data.reach.enrolled,
      2,
      "Current enrollment status separated from registration count",
    );
    check(
      data.progress.assignments,
      3,
      "Inactive learner assignments excluded",
    );
    check(
      data.progress.completed,
      1,
      "Latest evidence before period end ignores later corrections and optional steps",
    );
    check(
      data.progress.inProgress,
      1,
      "Completed one required step plus missing evidence is in progress",
    );
    check(
      data.progress.awaitingVerification,
      1,
      "Missing evidence is unknown, not not-started",
    );
    check(data.progress.notStarted, 0, "No invented not-started state");
    check(
      data.progress.requiredSteps,
      5,
      "Required-step denominator respects plan versions",
    );
    check(data.progress.verifiedSteps, 3, "Required completions reconcile");
    check(
      data.progress.completionRate,
      100 / 3,
      "Rate is weighted from assignments, not offering averages",
    );
    check(
      data.trend.reduce((n, p) => n + p.registrations, 0),
      4,
      "Zero-filled trend reconciles to registrations",
    );
    check(data.trend.length, 7, "Empty daily buckets retained");
    check(
      data.skills.find((s) => s.id === `${skill.releaseId}:${skill.id}`)
        ?.learners,
      3,
      "Skills deduplicate learners across offerings and duplicate alignments",
    );
    check(
      data.credentials?.badges,
      2,
      "Invalid, revoked and out-of-period credentials excluded",
    );
    check(
      data.credentials?.certificates,
      1,
      "Certificate counts separately from badge",
    );
    check(
      data.credentials?.recipients,
      2,
      "Recipient counted once across credentials",
    );
    check(
      data.credentials?.pairedAccomplishments,
      1,
      "Same accomplishment can contain both credentials without doubling accomplishment",
    );
    check(data.credentials?.excluded, 2, "Excluded credential count disclosed");
    check(
      data.canvas.authorized,
      false,
      "Mock portal authentication does not manufacture Canvas authorization",
    );
    const scoped = await service.dashboard(principal, {
      ...query,
      cohortId: cohorts[0],
    });
    check(
      scoped.filters.offeringId,
      offer[0],
      "Cohort selects its offering boundary",
    );
    check(
      scoped.reach.registrations,
      2,
      "Cohort and offering filters intersect",
    );
    check(scoped.progress.assignments, 2, "Cohort narrows assignment grain");
    check(
      scoped.reach.returningLearners,
      1,
      "Offering-filtered returning learners retain any earlier portal registration",
    );
    check(scoped.cohorts.length, 1, "Only selected cohort compared");
    const restricted = await service.dashboard(
      { ...principal, scopes: ["reports:read"] },
      query,
    );
    check(
      restricted.credentials,
      null,
      "Reporting-only role cannot see credential metrics",
    );
    check(
      restricted.canvas.authorized,
      false,
      "Reporting-only role receives no Canvas authorization details",
    );
    service.credentialReader = async () => ({
      records: [],
      warning: "Credential source unavailable",
    });
    check(
      (await service.dashboard(principal, query)).credentials?.available,
      false,
      "Credential outage is unavailable, not a measured zero",
    );
    for (const invalid of [
      { ...query, to: stamp(0).slice(0, 10) },
      { ...query, from: "2026-02-30" },
      { ...query, offeringId: offer[1], cohortId: cohorts[0] },
      { ...query, from: stamp(-400).slice(0, 10) },
      { ...query, cohortId: randomUUID() },
    ]) {
      await assert.rejects(() => service.dashboard(principal, invalid));
      checks++;
    }
    const empty = await service.dashboard(principal, {
      from: stamp(-100).slice(0, 10),
      to: stamp(-99).slice(0, 10),
    });
    check(
      empty.progress.completionRate,
      null,
      "Empty denominator remains unavailable, not 0%",
    );
    await evidence(1, 0, -1, "not_started");
    await evidence(1, 1, -1, "not_started");
    check(
      (await service.dashboard(principal, query)).progress.notStarted,
      1,
      "Explicit corrected required-step evidence produces not-started, not missing evidence",
    );
    // Exercise the real HTTP guard, validation, DTO transformation and credential reader.
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as any).port;
    await new Promise<void>((r) => listener.close(() => r()));
    const token = randomUUID(),
      learnerToken = randomUUID(),
      origin = `http://127.0.0.1:${port}`;
    child = spawn(
      process.execPath,
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "src/server/main.ts",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          API_PORT: String(port),
          STAFF_API_TOKEN: token,
          LEARNER_API_TOKEN: learnerToken,
          AUTOMATION_API_TOKEN: randomUUID(),
          STAFF_AUTH_MODE: "mock",
          LEARNER_AUTH_MODE: "mock",
          BADGE_DATA_DIR: directory,
          BADGE_CONFIG: "",
          BADGE_LEARNER_MAP_FILE: join(directory, "no-links.json"),
          ALERTS_WORKER_ENABLED: "false",
          CANVAS_ALERTS_ENABLED: "false",
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stdout?.on("data", (s) => (output += s));
    child.stderr?.on("data", (s) => (output += s));
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, output);
    const request = (search = "", who = reader.id, bearer = token) =>
      fetch(`${origin}/api/v1/staff/engagement-impact${search}`, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Prototype-Staff-Id": who,
        },
      });
    const response = await request("?" + new URLSearchParams(query));
    check(response.status, 200, "Authorized report reader gets dashboard");
    const body = await response.json();
    check(
      body.reach.registrations,
      4,
      "API matches reviewed registration population",
    );
    check(
      body.credentials,
      null,
      "API redacts credentials from reporting-only role",
    );
    check(
      (await request("?offeringId=not-a-uuid")).status,
      400,
      "HTTP validator rejects malformed filter",
    );
    check(
      (await request("?unexpected=true")).status,
      400,
      "HTTP validator rejects unknown fields",
    );
    check(
      (await request("", reader.id, learnerToken)).status,
      403,
      "Learner broker cannot read staff analytics",
    );
    check(
      (await request("", randomUUID())).status,
      401,
      "Unknown staff rejected",
    );
    const adminResponse = await request(
      "?" + new URLSearchParams(query),
      manager.id,
    );
    check(adminResponse.status, 200, "Credential-authorized role gets report");
    check(
      (await adminResponse.json()).credentials.available,
      false,
      "Unconfigured explicit learner links report source unavailable",
    );
    console.log(
      `PASS: ${checks} Engagement and Impact checks (real PostgreSQL and API; injected credential aggregation fixtures).`,
    );
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await new Promise<void>((r) => {
        if (child!.exitCode !== null) r();
        else child!.once("exit", () => r());
      });
    }
    if (localPrisma) await localPrisma.$disconnect();
    if (localPool) await endPoolAndWaitForClients(localPool);
    if (db) await endPoolAndWaitForClients(db);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
    rmSync(directory, { recursive: true, force: true });
    process.env.DATABASE_URL = original;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
