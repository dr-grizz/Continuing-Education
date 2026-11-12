import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
async function main() {
  const original = { ...process.env },
    base = new URL(process.env.DATABASE_URL!),
    database = `ce_alerts_sso_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  let created = false,
    app: any,
    prisma: any,
    pool: any,
    checks = 0;
  const check = (actual: unknown, expected: unknown, note: string) => {
    assert.deepEqual(actual, expected, note);
    checks++;
  };
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    Object.assign(process.env, {
      DATABASE_URL: Object.assign(new URL(base), { pathname: `/${database}` })
        .href,
      STAFF_AUTH_MODE: "canvas",
      CANVAS_COURSES_ENABLED: "true",
      CANVAS_ALERTS_ENABLED: "true",
      ALERTS_WORKER_ENABLED: "false",
      CANVAS_BASE_URL: "https://canvas.example.test",
      CANVAS_STAFF_CLIENT_ID: "test-alerts-client",
      CANVAS_STAFF_CLIENT_SECRET: "test-only",
      CANVAS_STAFF_REDIRECT_URI:
        "http://localhost:3050/api/auth/canvas/callback",
      CANVAS_COURSES_SUBACCOUNT_ID: "10",
      CANVAS_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      STAFF_API_TOKEN: randomUUID(),
      LEARNER_API_TOKEN: randomUUID(),
      CANVAS_STAFF_LOOKUP_ACCOUNT_ID: "",
    });
    delete process.env.CANVAS_STAFF_AUTHORIZE_URL;
    delete process.env.CANVAS_STAFF_TOKEN_URL;
    await migrate(process.env.DATABASE_URL, { quiet: true });
    const domain = await import("../src/domain/prisma");
    prisma = domain.prisma;
    pool = (await import("../src/domain/db")).db;
    const { CanvasStaffAuthService } =
        await import("../src/server/canvas-staff-auth"),
      { CanvasCoursesService } = await import("../src/server/canvas-courses"),
      { LearnerAlertsController, LearnerAlertsService } =
        await import("../src/server/learner-alerts"),
      { PrototypeGuard } = await import("../src/server/auth"),
      { PortalService } = await import("../src/server/service"),
      { canvasStaffConfig } = await import("../src/server/staff-auth-config");
    const staffA = await prisma.staff_members.findUniqueOrThrow({
        where: { email: "admin@cuce.test" },
      }),
      staffB = await prisma.staff_members.findUniqueOrThrow({
        where: { email: "catalog@cuce.test" },
      });
    for (const [member, subject] of [
      [staffA, "8001"],
      [staffB, "8002"],
    ] as const)
      await prisma.staff_members.update({
        where: { id: member.id },
        data: {
          auth_provider: "canvas:https://canvas.example.test",
          external_subject: subject,
        },
      });
    const auth = new CanvasStaffAuthService(),
      canvas = new CanvasCoursesService(),
      portal = new PortalService(),
      alerts = new LearnerAlertsService(portal, canvas);
    alerts.credentialReader = async () => ({ records: [], warning: null });
    auth.request = async (url, init) => {
      check(
        String(url),
        "https://canvas.example.test/login/oauth2/token",
        "OAuth exchanges remain at the configured Canvas origin",
      );
      const body = new URLSearchParams(init?.body as URLSearchParams),
        subject = body.get("code")!;
      return Response.json({
        user: { id: Number(subject) },
        access_token: `test-token-${subject}`,
        refresh_token: `test-refresh-${subject}`,
        expires_in: 3600,
        scope: canvasStaffConfig().scopes.join(" "),
      });
    };
    async function login(subject: string) {
      const browserNonce = randomBytes(32).toString("base64url"),
        begin = await auth.begin(browserNonce);
      return auth.complete({
        browserNonce,
        state: new URL(begin.authorizationUrl).searchParams.get("state")!,
        code: subject,
      });
    }
    let sessionA = (await login("8001")).token,
      sessionB = (await login("8002")).token;
    check(
      (await auth.principal(sessionA)).staffId,
      staffA.id,
      "Real OAuth completion resolves the verified staff directory identity",
    );
    @Module({
      controllers: [LearnerAlertsController],
      providers: [
        PrototypeGuard,
        { provide: CanvasStaffAuthService, useValue: auth },
        { provide: LearnerAlertsService, useValue: alerts },
      ],
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(
      path = "",
      body?: unknown,
      session = sessionA,
      extra: Record<string, string> = {},
    ) {
      const response = await fetch(`${origin}/api/v1/staff/alerts${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${process.env.STAFF_API_TOKEN}`,
          "X-Staff-Session": session,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    }
    const learner = await prisma.learners.create({
        data: {
          email: "alerts-sso@example.test",
          display_name: "SSO learner",
          auth_provider: "canvas:https://canvas.example.test",
          external_subject: "123",
        },
      }),
      offering = (
        await prisma.offerings.findFirstOrThrow({ orderBy: { id: "asc" } })
      ).id;
    await prisma.entitlements.create({
      data: {
        learner_id: learner.id,
        offering_id: offering,
        status: "enrolled",
      },
    });
    await prisma.canvas_offering_mappings.create({
      data: {
        offering_id: offering,
        installation_url: "https://canvas.example.test",
        course_id: "42",
        source: {},
      },
    });
    let calls: string[] = [];
    alerts.request = async (url, init) => {
      check(
        new URL(String(url)).origin,
        "https://canvas.example.test",
        "Course observations never leave configured Canvas origin",
      );
      const authorization = new Headers(init?.headers).get("Authorization")!;
      calls.push(authorization);
      return Response.json([
        {
          id: 1,
          user_id: 123,
          course_id: 42,
          type: "StudentEnrollment",
          enrollment_state: "active",
          last_activity_at: new Date().toISOString(),
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          grades: { current_score: authorization.endsWith("8001") ? 40 : 60 },
        },
      ]);
    };
    const payload = {
      name: "My Canvas performance",
      kind: "canvas_performance",
      offeringId: offering,
      cohortId: null,
      learnerId: null,
      days: 14,
      threshold: 70,
      enabled: true,
      version: 0,
    };
    const ruleA = (await request("/rules", payload)).data,
      ruleB = (
        await request(
          "/rules",
          { ...payload, name: "Other login performance" },
          sessionB,
        )
      ).data;
    check(ruleA.owner_id, staffA.id, "Rule owner derives from SSO session");
    check(ruleB.owner_id, staffB.id, "Second login has its own rule ownership");
    check(
      (await request(`/rules/${ruleA.id}/sync`, { version: 1 })).status,
      200,
      "Own rule can read with signed-in authorization",
    );
    check(
      (await request(`/rules/${ruleB.id}/sync`, { version: 1 }, sessionB))
        .status,
      200,
      "Second login uses its independent Canvas grant",
    );
    check(
      calls,
      ["Bearer test-token-8001", "Bearer test-token-8002"],
      "No token borrowing between staff identities",
    );
    let a = (await request()).data,
      b = (await request("", undefined, sessionB)).data;
    check(
      a.canvasSession.status,
      "connected",
      "SSO dashboard reports saved authorization",
    );
    check(
      a.canvasSession.staffId,
      staffA.id,
      "Context identifies the verified session owner",
    );
    check(
      a.rules
        .filter((r: any) => r.kind.startsWith("canvas_"))
        .map((r: any) => r.id),
      [ruleA.id],
      "Own rule metadata only",
    );
    check(
      b.rules.map((r: any) => r.id),
      [ruleB.id],
      "Other staff cannot list another Canvas rule",
    );
    check(
      a.alerts.map((x: any) => x.rule_id),
      [ruleA.id],
      "Alert observations scoped to staff A",
    );
    check(
      b.alerts.map((x: any) => x.rule_id),
      [ruleB.id],
      "Alert observations scoped to staff B",
    );
    check(a.counts, { open: 1 }, "Counts exclude other staff Canvas signals");
    check(
      a.alerts[0].evidence.score,
      40,
      "Own token supplies the displayed score",
    );
    check(b.alerts[0].evidence.score, 60, "Other token remains isolated");
    const alertB = b.alerts[0];
    const before = calls.length;
    check(
      (await request(`/rules/${ruleB.id}/sync`, { version: 1 })).status,
      403,
      "Cannot adopt another staff authorization by sync",
    );
    check(
      (await request(`/rules/${ruleB.id}`, { ...payload, version: 1 })).status,
      403,
      "Cannot take over another staff Canvas rule by editing",
    );
    check(
      (await request(`/${alertB.id}/history`)).status,
      403,
      "History cannot bypass dashboard isolation",
    );
    check(
      (
        await request(`/${alertB.id}/action`, {
          action: "acknowledge",
          version: 1,
          days: 7,
          note: "Unauthorized attempt",
        })
      ).status,
      403,
      "Actions cannot bypass identity isolation",
    );
    check(calls.length, before, "Rejected access performs no Canvas read");
    check(
      (await prisma.learner_alert_rules.findUnique({ where: { id: ruleB.id } }))
        .owner_id,
      staffB.id,
      "Rejected cross-account sync preserves owner",
    );
    check(
      (await request("", undefined, "missing-session")).status,
      401,
      "Missing SSO session rejected",
    );
    check(
      (
        await request("", undefined, sessionA, {
          "X-Prototype-Staff-Id": staffB.id,
        })
      ).status,
      401,
      "Demo identity header cannot impersonate staff in SSO mode",
    );
    check(
      (await request("/rules", { ...payload, owner_id: staffB.id })).status,
      400,
      "Browser cannot supply alert owner",
    );
    check(
      JSON.stringify(a).includes("test-token"),
      false,
      "No provider token is returned to the browser",
    );
    check(
      JSON.stringify(a).includes("encrypted_tokens"),
      false,
      "No encrypted grant is returned to the browser",
    );
    await prisma.staff_canvas_grants.delete({ where: { staff_id: staffA.id } });
    a = (await request()).data;
    check(
      a.canvasSession.status,
      "reconnect",
      "Missing grant requests fresh authorization",
    );
    check(a.rules.length, 1, "Own rule configuration survives grant loss");
    check(
      a.alerts.length,
      0,
      "Saved Canvas observations hidden without current authorization",
    );
    check(a.counts, {}, "Counts cannot leak hidden observations");
    check(
      (await request(`/rules/${ruleA.id}/sync`, { version: 1 })).status,
      403,
      "Grant loss stops manual reads",
    );
    check(
      (
        await request(
          `/${(await prisma.learner_alerts.findFirst({ where: { rule_id: ruleA.id } })).id}/history`,
        )
      ).status,
      403,
      "Grant loss also hides source history",
    );
    check(
      await prisma.learner_alerts.count({ where: { rule_id: ruleA.id } }),
      1,
      "Hidden observations remain durable without being marked recovered",
    );
    sessionA = (await login("8001")).token;
    check(
      (await request()).data.canvasSession.connected,
      true,
      "Fresh SSO restores own current authorization",
    );
    process.env.CANVAS_STAFF_CLIENT_ID = "new-test-client";
    check(
      (await request()).data.canvasSession.status,
      "reconnect",
      "Configuration change invalidates saved API authorization",
    );
    check(
      (await request()).data.alerts.length,
      0,
      "Old configuration cannot expose Canvas observations",
    );
    sessionA = (await login("8001")).token;
    check(
      (await request()).data.alerts.length,
      0,
      "New grant cannot reuse snapshot from a different configuration",
    );
    await prisma.learner_alert_rules.update({
      where: { id: ruleA.id },
      data: { sync_checked_at: null },
    });
    check(
      (await request(`/rules/${ruleA.id}/sync`, { version: 1 })).status,
      200,
      "Fresh authorized read after reconnection succeeds",
    );
    check(
      (await request()).data.alerts.length,
      1,
      "Refreshed own snapshot restores observed alert",
    );
    await prisma.staff_members.update({
      where: { id: staffA.id },
      data: { roles: ["approver"] },
    });
    a = (await request()).data;
    check(
      a.canvasSession.status,
      "forbidden",
      "Current portal roles apply without stale session scopes",
    );
    check(a.rules.length, 0, "Role loss hides Canvas rules");
    check(a.alerts.length, 0, "Role loss hides Canvas signals");
    await prisma.staff_members.update({
      where: { id: staffA.id },
      data: { active: false },
    });
    check(
      (await request()).status,
      401,
      "Deactivated SSO identity cannot read alerts",
    );
    console.log(
      `PASS: ${checks} Canvas SSO alert checks (real OAuth/session/guard, encrypted grants, isolated PostgreSQL; provider HTTP mocked).`,
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (pool) await endPoolAndWaitForClients(pool);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
    process.env = original;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
