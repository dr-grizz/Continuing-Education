import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
import { CanvasCourseClient } from "../src/server/canvas-course-client";
async function main() {
  const original = process.env.DATABASE_URL!,
    base = new URL(original),
    database = `ce_alertstest_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  const directory = mkdtempSync(join(tmpdir(), "ce-alert-test-"));
  let db: Pool | undefined,
    child: ChildProcess | undefined,
    created = false,
    localPrisma: any,
    localPool: any;
  let checks = 0;
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
    const members = (
      await db.query(
        "SELECT id,roles::text[] roles FROM staff_members WHERE active",
      )
    ).rows;
    const manager = members.find((s) => s.roles.includes("catalog_manager")),
      reader = members.find(
        (s) => s.roles.length === 1 && s.roles[0] === "approver",
      );
    assert.ok(manager && reader);
    const a = (
      await db.query(
        "INSERT INTO learners(email,display_name) VALUES('alert-a@example.test','Alert Learner A') RETURNING id",
      )
    ).rows[0].id;
    const b = (
      await db.query(
        "INSERT INTO learners(email,display_name) VALUES('alert-b@example.test','Alert Learner B') RETURNING id",
      )
    ).rows[0].id;
    const offerings = (
      await db.query("SELECT id FROM offerings ORDER BY id LIMIT 2")
    ).rows;
    const offering = offerings[0].id;
    await db.query(
      "INSERT INTO entitlements(learner_id,offering_id,status) VALUES($1,$3,'enrolled'),($2,$3,'enrolled')",
      [a, b, offering],
    );
    writeFileSync(
      join(directory, "links.json"),
      JSON.stringify({ [a]: "demo-alex" }),
    );
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as any).port;
    await new Promise<void>((r) => listener.close(() => r()));
    const origin = `http://127.0.0.1:${port}`;
    // Seed genuine signed badge/certificate records inside the disposable workspace.
    const { BadgeStore } = require("../badge-service/core.mjs"),
      { defaultDesign, saveDraft } = require("../badge-service/designs.mjs"),
      { PublishingCatalog } = require("../badge-service/publishing.mjs"),
      { ManualAwards } = require("../badge-service/manual-awards.mjs"),
      {
        Certificates,
        defaultCertificate,
      } = require("../badge-service/certificates.mjs"),
      { LearnerAwards } = require("../badge-service/learners.mjs");
    const config = JSON.parse(
      readFileSync(resolve("badge-service/config.example.json"), "utf8"),
    );
    const store = await BadgeStore.open(directory, config, origin, "demo", db);
    const catalog = new PublishingCatalog(store),
      awards = new LearnerAwards([{ id: "workspace", directory }], origin, db),
      certificates = new Certificates(store, awards, config.learners),
      manual = new ManualAwards(store, catalog, config.learners, certificates);
    const date = (days: number) =>
      new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const draft = await saveDraft(store.db, {
        ...defaultDesign,
        expirationDate: date(5),
      }),
      version = await catalog.approve(draft.id, 1, "test");
    const template = await certificates.save(
      {
        name: "Alert certificate",
        design: { ...defaultCertificate, expirationDate: date(3) },
      },
      "test",
    );
    const batch = await manual.preview(
      {
        method: "manual",
        versionId: version.id,
        learner: "demo-alex",
        reason: "Test verification complete.",
        certificateTemplateId: template.id,
        recipientName: "Alert Learner A",
      },
      "test",
    );
    const issued = await manual.commit(batch.id, "test", true);
    assert.equal(issued.counts.issued, 1);
    await store.close();
    const token = randomUUID(),
      learnerToken = randomUUID();
    const launch = () =>
      spawn(
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
            BADGE_LEARNER_MAP_FILE: join(directory, "links.json"),
            BADGE_CONFIG: "",
            CANVAS_ALERTS_ENABLED: "false",
            ALERTS_WORKER_ENABLED: "false",
          },
          stdio: "pipe",
        },
      );
    child = launch();
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
    async function request(
      path: string,
      body?: unknown,
      who = manager.id,
      key = randomUUID(),
      learner = false,
    ) {
      const response = await fetch(origin + "/api/v1/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${learner ? learnerToken : token}`,
          "Idempotency-Key": key,
          ...(learner
            ? { "X-Prototype-Learner-Id": who }
            : { "X-Prototype-Staff-Id": who }),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    const ruleBody = (kind: string, extra: any = {}) => ({
      name: "Test " + kind,
      kind,
      offeringId: kind === "credential_expiration" ? null : offering,
      cohortId: null,
      learnerId: null,
      days: 14,
      threshold: 70,
      enabled: true,
      version: 0,
      ...extra,
    });
    check(
      (await request("staff/alerts", undefined, a, randomUUID(), true)).status,
      403,
      "Learners cannot read staff alerts",
    );
    check(
      (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification"),
          reader.id,
        )
      ).status,
      403,
      "Readers cannot configure rules",
    );
    check(
      (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification", { days: 0 }),
        )
      ).status,
      400,
      "Reject invalid threshold window",
    );
    check(
      (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification", { learnerId: randomUUID() }),
        )
      ).status,
      400,
      "Reject unknown learner",
    );
    const plan = (
      await request("staff/progress/plans", {
        offeringId: offering,
        previousRevision: 0,
        steps: [
          { title: "Required step", required: true },
          { title: "Optional step", required: false },
        ],
      })
    ).data;
    const pa = (
      await request(`staff/progress/plans/${plan.id}/participants`, {
        learnerId: a,
      })
    ).data;
    const pb = (
      await request(`staff/progress/plans/${plan.id}/participants`, {
        learnerId: b,
      })
    ).data;
    await db.query(
      "UPDATE progress_participants SET assigned_at=now()-interval '21 days' WHERE id=$1",
      [pa.id],
    );
    const steps = (
      await db.query(
        "SELECT * FROM progress_steps WHERE plan_id=$1 ORDER BY position",
        [plan.id],
      )
    ).rows;
    const done = (
      await request(`staff/progress/participants/${pb.id}/evidence`, {
        stepId: steps[0].id,
        state: "completed",
        note: "Verified the required test work.",
        reference: "",
        previousEventId: null,
      })
    ).data;
    const key = randomUUID(),
      stalled = (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification"),
          manager.id,
          key,
        )
      ).data;
    check(
      (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification"),
          manager.id,
          key,
        )
      ).data.id,
      stalled.id,
      "Rule creation is idempotent",
    );
    const completion = (
      await request("staff/alerts/rules", ruleBody("completion", { days: 30 }))
    ).data;
    const expiry = (
      await request(
        "staff/alerts/rules",
        ruleBody("credential_expiration", { days: 7 }),
      )
    ).data;
    let dashboard = (await request("staff/alerts")).data;
    check(
      dashboard.alerts.filter((x: any) => x.kind === "stalled_verification")
        .length,
      1,
      "Stalled verification uses assignment age",
    );
    check(
      dashboard.alerts.filter((x: any) => x.kind === "completion").length,
      1,
      "Required completion ignores optional step",
    );
    check(
      dashboard.alerts.filter((x: any) => x.kind === "credential_expiration")
        .length,
      2,
      "Independent signed badge and certificate expiration",
    );
    check(
      (await request("staff/alerts", undefined, reader.id)).data.rules.some(
        (r: any) => r.id === expiry.id,
      ),
      false,
      "Credential alerts require credential authority",
    );
    check(
      (
        await request(
          `staff/alerts/rules/${expiry.id}`,
          ruleBody("completion", { offeringId: null, version: 1 }),
        )
      ).status,
      400,
      "Condition changes cannot expose historical credential alerts to another source scope",
    );
    writeFileSync(join(directory, "links.json"), "invalid-json");
    const unavailable = (await request("staff/alerts")).data;
    check(
      unavailable.alerts.filter(
        (x: any) => x.rule_id === expiry.id && x.state === "open",
      ).length,
      2,
      "Unreadable account-link source retains expiration alerts",
    );
    check(
      unavailable.alerts
        .filter((x: any) => x.rule_id === expiry.id)
        .every((x: any) => x.source_unavailable),
      true,
      "Retained credential alerts are marked unavailable",
    );
    writeFileSync(
      join(directory, "links.json"),
      JSON.stringify({ [a]: "demo-alex" }),
    );
    const stalledAlert = dashboard.alerts.find(
      (x: any) => x.rule_id === stalled.id,
    );
    check(
      (await request("staff/alerts")).data.alerts.length,
      4,
      "Repeated checks do not duplicate alerts",
    );
    const actionKey = randomUUID();
    const actionBody = {
      action: "acknowledge",
      version: stalledAlert.version,
      days: 7,
      note: "Assigned staff follow-up.",
    };
    check(
      (
        await request(
          `staff/alerts/${stalledAlert.id}/action`,
          actionBody,
          reader.id,
        )
      ).status,
      403,
      "Readers cannot act",
    );
    const acknowledged = await request(
      `staff/alerts/${stalledAlert.id}/action`,
      actionBody,
      manager.id,
      actionKey,
    );
    check(acknowledged.status, 200, "Acknowledge alert");
    check(
      (
        await request(
          `staff/alerts/${stalledAlert.id}/action`,
          actionBody,
          manager.id,
          actionKey,
        )
      ).data.version,
      acknowledged.data.version,
      "Action retry is idempotent",
    );
    check(
      (await request(`staff/alerts/${stalledAlert.id}/action`, actionBody))
        .status,
      409,
      "Stale action is rejected",
    );
    const snoozed = (
      await request(`staff/alerts/${stalledAlert.id}/action`, {
        ...actionBody,
        action: "snooze",
        version: acknowledged.data.version,
      })
    ).data;
    check(snoozed.state, "snoozed", "Snooze persists");
    await db.query(
      "UPDATE learner_alerts SET snoozed_until=now()-interval '1 minute' WHERE id=$1",
      [stalledAlert.id],
    );
    dashboard = (await request("staff/alerts")).data;
    const reopened = dashboard.alerts.find(
      (x: any) => x.id === stalledAlert.id,
    );
    check(reopened.state, "open", "Snooze ends on scheduled evaluation");
    await request(`staff/alerts/${stalledAlert.id}/action`, {
      ...actionBody,
      action: "resolve",
      version: reopened.version,
    });
    check(
      (await request("staff/alerts")).data.alerts.find(
        (x: any) => x.id === stalledAlert.id,
      ).state,
      "resolved",
      "Manual resolution suppresses unchanged condition",
    );
    const history = (await request(`staff/alerts/${stalledAlert.id}/history`))
      .data;
    check(
      history.filter((x: any) => x.action === "detected").length,
      1,
      "One detection in append-only history",
    );
    await assert.rejects(
      () =>
        db!.query(
          "UPDATE learner_alert_history SET note='tamper' WHERE alert_id=$1",
          [stalledAlert.id],
        ),
      /append-only/,
    );
    checks++;
    await request(`staff/progress/participants/${pa.id}/evidence`, {
      stepId: steps[1].id,
      state: "completed",
      note: "Optional work was verified only.",
      reference: "",
      previousEventId: null,
    });
    check(
      (await request("staff/alerts")).data.alerts.find(
        (x: any) => x.id === stalledAlert.id,
      ).state,
      "resolved",
      "Optional evidence cannot reopen or reset required verification",
    );
    const correction = await request(
      `staff/progress/participants/${pb.id}/evidence`,
      {
        stepId: steps[0].id,
        state: "in_progress",
        note: "Correction: required work needs revision.",
        reference: "",
        previousEventId: done.id,
      },
    );
    check(correction.status, 200, "Completion correction recorded");
    check(
      (await request("staff/alerts")).data.alerts.find(
        (x: any) => x.rule_id === completion.id,
      ).state,
      "resolved",
      "Completion alert follows correction",
    );
    await request(`staff/progress/participants/${pb.id}/evidence`, {
      stepId: steps[0].id,
      state: "completed",
      note: "The revised work is now verified.",
      reference: "",
      previousEventId: correction.data.id,
    });
    check(
      (await request("staff/alerts")).data.alerts.filter(
        (x: any) => x.rule_id === completion.id && x.state === "open",
      ).length,
      1,
      "New completion episode gets one alert",
    );
    const cohort = (
      await request("staff/progress/cohorts", {
        planId: plan.id,
        name: "Alert cohort",
      })
    ).data;
    await request(`staff/progress/cohorts/${cohort.id}/members`, {
      learnerId: a,
      active: true,
    });
    check(
      (
        await request(
          "staff/alerts/rules",
          ruleBody("stalled_verification", {
            cohortId: cohort.id,
            offeringId: offerings[1].id,
          }),
        )
      ).status,
      400,
      "Reject mixed cohort and offering scope",
    );
    const cohortRule = (
      await request(
        "staff/alerts/rules",
        ruleBody("stalled_verification", { cohortId: cohort.id }),
      )
    ).data;
    check(
      (await request("staff/alerts")).data.alerts.filter(
        (x: any) => x.rule_id === cohortRule.id && x.state === "open",
      ).length,
      1,
      "Cohort rule uses current active members only",
    );
    await request(`staff/progress/cohorts/${cohort.id}/members`, {
      learnerId: a,
      active: false,
    });
    check(
      (await request("staff/alerts")).data.alerts.find(
        (x: any) => x.rule_id === cohortRule.id,
      ).state,
      "resolved",
      "Removing cohort membership clears its scoped alert without deleting history",
    );
    const edit = await request(
      `staff/alerts/rules/${stalled.id}`,
      ruleBody("stalled_verification", { version: 1, enabled: false }),
    );
    check(edit.status, 200, "Pause rule with revision");
    check(
      (
        await request(
          `staff/alerts/rules/${stalled.id}`,
          ruleBody("stalled_verification", { version: 1 }),
        )
      ).status,
      409,
      "Stale rule revision rejected",
    );
    const inactivity = (
        await request(
          "staff/alerts/rules",
          ruleBody("canvas_inactivity", { days: 7 }),
        )
      ).data,
      performance = (
        await request("staff/alerts/rules", ruleBody("canvas_performance"))
      ).data;
    check(
      (
        await request(
          `staff/alerts/rules/${inactivity.id}/sync`,
          { version: 1 },
          reader.id,
        )
      ).status,
      403,
      "Canvas sync requires manager and Canvas scope",
    );
    check(
      (
        await request(`staff/alerts/rules/${inactivity.id}/sync`, {
          version: 1,
        })
      ).status,
      403,
      "Mock login cannot initiate live Canvas reads",
    );
    dashboard = (await request("staff/alerts")).data;
    check(
      dashboard.alerts.some((x: any) => x.kind.startsWith("canvas_")),
      false,
      "Unavailable Canvas data creates no inactivity/performance accusation",
    );
    check(
      !!dashboard.rules.find((r: any) => r.id === inactivity.id).source_warning,
      true,
      "Configuration failure is visible",
    );
    check(
      (
        await request(`staff/alerts/rules/${inactivity.id}/sync`, {
          version: 1,
          canvasSnapshot: [],
        })
      ).status,
      400,
      "Browser-provided Canvas observations are rejected",
    );
    // Exercise the real scheduled reader/evaluator with a mocked provider and bound identities.
    Object.assign(process.env, {
      CANVAS_ALERTS_ENABLED: "true",
      CANVAS_COURSES_ENABLED: "true",
      STAFF_AUTH_MODE: "canvas",
      CANVAS_BASE_URL: "https://canvas.example.test",
      CANVAS_COURSES_SUBACCOUNT_ID: "10",
      CANVAS_STAFF_CLIENT_ID: "test",
      CANVAS_STAFF_CLIENT_SECRET: "test-only",
      CANVAS_STAFF_REDIRECT_URI:
        "http://127.0.0.1:3050/api/auth/canvas/callback",
      CANVAS_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
    });
    await db.query(
      "UPDATE learners SET auth_provider='canvas:https://canvas.example.test',external_subject='123' WHERE id=$1",
      [a],
    );
    await db.query(
      "INSERT INTO canvas_offering_mappings(installation_url,course_id,offering_id,source) VALUES('https://canvas.example.test','42',$1,'{}')",
      [offering],
    );
    const { LearnerAlertsService } = require("../src/server/learner-alerts"),
      domain = require("../src/domain/prisma");
    localPrisma = domain.prisma;
    localPool = require("../src/domain/db").db;
    const configSso =
      require("../src/server/staff-auth-config").canvasStaffConfig();
    const {
      sealCanvasTokens,
      grantBinding,
    } = require("../src/server/canvas-tokens");
    await localPrisma.staff_members.update({
      where: { id: manager.id },
      data: { auth_provider: configSso.provider, external_subject: "456" },
    });
    await localPrisma.staff_canvas_grants.create({
      data: {
        staff_id: manager.id,
        provider: configSso.provider,
        subject: "456",
        configuration_hash: configSso.fingerprint,
        encrypted_tokens: sealCanvasTokens(
          {
            accessToken: "test-provider-token",
            refreshToken: "test-refresh-token",
          },
          grantBinding(
            manager.id,
            configSso.provider,
            "456",
            configSso.fingerprint,
          ),
        ),
        expires_at: new Date(Date.now() + 3600000),
      },
    });
    const service = new LearnerAlertsService(
      {},
      { accessToken: async () => "test-provider-token" },
    );
    let grade: number | null = 52,
      activity = new Date(Date.now() - 10 * 86400000).toISOString(),
      fail = false;
    service.request = async (url: URL) => {
      check(
        url.origin,
        "https://canvas.example.test",
        "No arbitrary provider origin",
      );
      if (fail) return new Response("Unavailable", { status: 403 });
      return Response.json([
        {
          id: 1,
          course_id: 42,
          user_id: 123,
          type: "StudentEnrollment",
          enrollment_state: "active",
          last_activity_at: activity,
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          grades: { current_score: grade },
        },
      ]);
    };
    service.credentialReader = async () => ({
      records: [],
      warning: "Test reader intentionally unavailable",
    });
    await db.query(
      "UPDATE learner_alert_rules SET next_sync_at=now(),sync_started_at=NULL WHERE kind LIKE 'canvas_%'",
    );
    await service.tick();
    let active = (
      await db.query(
        "SELECT * FROM learner_alerts a JOIN learner_alert_rules r ON r.id=a.rule_id WHERE r.kind LIKE 'canvas_%' AND a.state='open'",
      )
    ).rows;
    check(active.length, 2, "Scheduled checks detect inactivity and low score");
    await service.tick();
    check(
      (
        await db.query(
          "SELECT count(*)::int n FROM learner_alerts a JOIN learner_alert_rules r ON r.id=a.rule_id WHERE r.kind LIKE 'canvas_%' AND a.state='open'",
        )
      ).rows[0].n,
      2,
      "Scheduled repeats preserve duplicate protection",
    );
    grade = null;
    activity = new Date().toISOString();
    await db.query(
      "UPDATE learner_alert_rules SET next_sync_at=now() WHERE kind LIKE 'canvas_%'",
    );
    await service.tick();
    check(
      (
        await db.query("SELECT state FROM learner_alerts WHERE rule_id=$1", [
          inactivity.id,
        ])
      ).rows[0].state,
      "resolved",
      "Fresh recorded activity clears inactivity",
    );
    check(
      (
        await db.query("SELECT state FROM learner_alerts WHERE rule_id=$1", [
          performance.id,
        ])
      ).rows[0].state,
      "open",
      "Unavailable grade preserves previous alert rather than treating it as zero or recovery",
    );
    fail = true;
    await db.query(
      "UPDATE learner_alert_rules SET next_sync_at=now() WHERE kind LIKE 'canvas_%'",
    );
    await service.tick();
    check(
      (
        await db.query(
          "SELECT sync_error IS NOT NULL bad,canvas_snapshot IS NOT NULL retained FROM learner_alert_rules WHERE id=$1",
          [performance.id],
        )
      ).rows[0],
      { bad: true, retained: true },
      "Failed read retains snapshot and marks unavailable",
    );
    // Reuse the secure pagination client: hostile next links cannot receive credentials.
    let calls = 0;
    const secure = new CanvasCourseClient(
      "https://canvas.example.test",
      "Test",
      async () => "private-test",
      AbortSignal.timeout(5000),
      async () => {
        calls++;
        return new Response("[]", {
          headers: {
            Link: '<https://hostile.example/api/v1/courses/42/enrollments>; rel="next"',
          },
        });
      },
    );
    await assert.rejects(() => secure.alertEnrollments("42"));
    check(
      calls,
      1,
      "Cross-origin pagination is rejected before a second request",
    );
    const missing = new CanvasCourseClient(
      "https://canvas.example.test",
      "Test",
      async () => "private-test",
      AbortSignal.timeout(5000),
      async () =>
        Response.json([
          {
            id: 1,
            course_id: 42,
            user_id: 123,
            type: "StudentEnrollment",
            enrollment_state: "active",
            created_at: new Date().toISOString(),
            grades: { current_score: null },
          },
        ]),
    );
    const missingRow = (await missing.alertEnrollments("42"))[0];
    check(
      missingRow.activityKnown,
      false,
      "Absent last-activity field is unknown, not never-started",
    );
    check(missingRow.score, null, "Null grade remains unknown");
    const conflicts = new CanvasCourseClient(
      "https://canvas.example.test",
      "Test",
      async () => "private-test",
      AbortSignal.timeout(5000),
      async () =>
        Response.json(
          [40, 50].map((score) => ({
            id: score,
            course_id: 42,
            user_id: 123,
            type: "StudentEnrollment",
            enrollment_state: "active",
            last_activity_at: null,
            created_at: new Date().toISOString(),
            grades: { current_score: score },
          })),
        ),
    );
    check(
      (await conflicts.alertEnrollments("42"))[0].score,
      null,
      "Conflicting section scores remain unknown",
    );
    const future = new CanvasCourseClient(
      "https://canvas.example.test",
      "Test",
      async () => "private-test",
      AbortSignal.timeout(5000),
      async () =>
        Response.json([
          {
            course_id: 42,
            user_id: 123,
            type: "StudentEnrollment",
            enrollment_state: "active",
            last_activity_at: new Date(Date.now() + 86400000).toISOString(),
          },
        ]),
    );
    await assert.rejects(() => future.alertEnrollments("42"));
    checks++;
    await db.query(
      "UPDATE learner_alert_rules SET sync_error=NULL,canvas_snapshot=jsonb_set(canvas_snapshot,'{observedAt}',to_jsonb((now()-interval '25 hours')::text)) WHERE id=$1",
      [performance.id],
    );
    await service.evaluate();
    check(
      (
        await db.query("SELECT state FROM learner_alerts WHERE rule_id=$1", [
          performance.id,
        ])
      ).rows[0].state,
      "open",
      "Stale snapshots do not establish recovery",
    );
    check(
      !!(
        await db.query(
          "SELECT source_warning FROM learner_alert_rules WHERE id=$1",
          [performance.id],
        )
      ).rows[0].source_warning,
      true,
      "Stale snapshot warning persists",
    );
    await db.query("UPDATE staff_members SET active=false WHERE id=$1", [
      manager.id,
    ]);
    await service.evaluate();
    check(
      (
        await db.query(
          "SELECT evaluation_error FROM learner_alert_rules WHERE id=$1",
          [performance.id],
        )
      ).rows[0].evaluation_error.startsWith("The rule owner"),
      true,
      "Deactivated rule owners stop monitoring",
    );
    await db.query("UPDATE staff_members SET active=true WHERE id=$1", [
      manager.id,
    ]);
    await db.query(
      "UPDATE learner_alert_rules SET evaluated_at=NULL WHERE id=$1",
      [completion.id],
    );
    service.running = true;
    await service.scheduledTick();
    service.running = false;
    check(
      !!(
        await db.query(
          "SELECT evaluated_at FROM learner_alert_rules WHERE id=$1",
          [completion.id],
        )
      ).rows[0].evaluated_at,
      true,
      "Local checks continue while a Canvas read is in flight",
    );
    const beforeRestart = (await request("staff/alerts")).data.alerts
      .map((x: any) => x.id)
      .sort();
    child.kill("SIGTERM");
    await new Promise<void>((r) => child!.once("exit", () => r()));
    child = launch();
    let restarted = false;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          restarted = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    check(restarted, true, "API restarted with durable alerts");
    const afterRestart = (await request("staff/alerts")).data.alerts
      .map((x: any) => x.id)
      .sort();
    check(
      afterRestart,
      beforeRestart,
      "Alert identities survive API restart without duplicate detection",
    );
    console.log(
      `PASS: ${checks} learner alert checks (real PostgreSQL/API, signed credentials, scheduled evaluator, mocked Canvas provider).`,
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
