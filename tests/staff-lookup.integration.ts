import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { migrate } from "../scripts/db-migrate";
import { canvasStaffConfig } from "../src/server/staff-auth-config";
import { canvasLearnerConfig } from "../src/server/learner-auth-config";

const original = { ...process.env };
const base = new URL(process.env.DATABASE_URL!);
const database = `ce_lookup_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
let created = false;
let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
let client: typeof import("../src/domain/prisma").prisma | undefined;
let pool: typeof import("../src/domain/db").db | undefined;
async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: Object.assign(new URL(base), { pathname: `/${database}` })
      .href,
    PROTOTYPE_MODE: "true",
    NODE_ENV: "test",
    STAFF_AUTH_MODE: "canvas",
    LEARNER_AUTH_MODE: "mock",
    CANVAS_COURSES_ENABLED: "false",
    CANVAS_STAFF_LOOKUP_ACCOUNT_ID: "1",
    CANVAS_BASE_URL: "https://canvas.example.test",
    CANVAS_STAFF_CLIENT_ID: "test-lookup",
    CANVAS_STAFF_CLIENT_SECRET: "test-secret",
    CANVAS_STAFF_REDIRECT_URI: "http://localhost:3050/api/auth/canvas/callback",
    CANVAS_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    STAFF_API_TOKEN: "test-staff-broker",
    LEARNER_API_TOKEN: "test-learner-broker",
  });
  delete process.env.HOSTED_DEMO;
  delete process.env.CANVAS_STAFF_AUTHORIZE_URL;
  delete process.env.CANVAS_STAFF_TOKEN_URL;
  await migrate(process.env.DATABASE_URL, { quiet: true });
  client = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const prisma = client;
  const { CanvasStaffAuthService } =
    await import("../src/server/canvas-staff-auth");
  const { CanvasCoursesService } = await import("../src/server/canvas-courses");
  const { CanvasCoursesController } =
    await import("../src/server/canvas-courses-controller");
  const { PrototypeGuard } = await import("../src/server/auth");
  const auth = new CanvasStaffAuthService(),
    service = new CanvasCoursesService();
  const staff = await prisma.staff_members.update({
    where: { email: "admin@cuce.test" },
    data: {
      auth_provider: "canvas:https://canvas.example.test",
      external_subject: "42",
    },
  });
  const target = await prisma.staff_members.create({
    data: {
      email: "person@example.test",
      display_name: "Intended person",
      roles: ["approver"],
    },
  });
  let subject = 42;
  auth.request = async (_url, init) => {
    const scope = new URLSearchParams(init!.body as URLSearchParams).get(
      "grant_type",
    );
    assert.equal(scope, "authorization_code");
    return Response.json({
      access_token: `access-${subject}`,
      refresh_token: `refresh-${subject}`,
      expires_in: 3600,
      user: { id: subject, name: "Admin" },
    });
  };
  const login = async () => {
    const nonce = randomBytes(32).toString("base64url");
    const start = await auth.begin(nonce);
    const url = new URL(start.authorizationUrl);
    assert.equal(
      url.searchParams.get("scope"),
      "url:GET|/api/v1/accounts/:account_id/users",
    );
    return auth.complete({
      state: url.searchParams.get("state")!,
      browserNonce: nonce,
      code: "mock",
    });
  };
  assert.deepEqual(canvasLearnerConfig().scopes, ["/auth/userinfo"]);
  assert.equal(canvasLearnerConfig().apiReads, false);
  const session = await login(),
    principal = await auth.principal(session.token);
  const grant = await prisma.staff_canvas_grants.findUniqueOrThrow({
    where: { staff_id: staff.id },
  });
  assert.ok(!grant.encrypted_tokens.includes("access-42"));
  let mode = "good",
    requests = 0,
    expectedToken = "access-42";
  service.request = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://canvas.example.test");
    assert.equal(init!.redirect, "error");
    if (url.pathname === "/login/oauth2/token") {
      assert.equal(
        new URLSearchParams(init!.body as URLSearchParams).get("refresh_token"),
        "refresh-42",
      );
      return Response.json({
        access_token: "access-refreshed",
        expires_in: 3600,
      });
    }
    assert.equal(url.pathname, "/api/v1/accounts/1/users");
    assert.equal(url.searchParams.get("search_term"), "person@example.test");
    assert.equal(
      new Headers(init!.headers).get("authorization"),
      `Bearer ${expectedToken}`,
    );
    const exact = {
      id: "12345",
      name: "Canvas Person",
      email: "person@example.test",
      login_id: "person@example.test",
    };
    if (mode === "forbidden")
      return Response.json(
        { secret: "never-echo-provider-secrets" },
        { status: 403 },
      );
    if (mode === "none")
      return Response.json([
        { ...exact, email: "not-person@example.test", login_id: "different" },
      ]);
    if (mode === "ambiguous")
      return Response.json([exact, { ...exact, id: "12346" }]);
    if (mode === "hostile")
      return Response.json([exact], {
        headers: {
          link: '<https://attacker.example.test/api/v1/accounts/1/users?page=2>; rel="next"',
        },
      });
    if (mode === "later" && !url.searchParams.has("page"))
      return Response.json(
        [{ ...exact, email: "wrong@example.test", login_id: "wrong" }],
        {
          headers: {
            link: '<https://canvas.example.test/api/v1/accounts/1/users?page=2>; rel="next"',
          },
        },
      );
    return Response.json([exact]);
  };
  const found = await service.lookupStaff(principal, target.id);
  assert.equal(found.id, "12345");
  assert.equal(found.target_version, target.version);
  assert.ok(!JSON.stringify(found).includes("access-42"));
  assert.equal(
    (await prisma.staff_members.findUniqueOrThrow({ where: { id: target.id } }))
      .external_subject,
    null,
  );
  mode = "later";
  assert.equal((await service.lookupStaff(principal, target.id)).id, "12345");
  mode = "none";
  await assert.rejects(service.lookupStaff(principal, target.id), /No exact/);
  mode = "ambiguous";
  await assert.rejects(
    service.lookupStaff(principal, target.id),
    /More than one/,
  );
  mode = "forbidden";
  await assert.rejects(
    service.lookupStaff(principal, target.id),
    (e: Error) =>
      e.message.includes("does not allow directory") &&
      !e.message.includes("never-echo"),
  );
  mode = "hostile";
  const before = requests;
  await assert.rejects(service.lookupStaff(principal, target.id));
  assert.equal(requests, before + 1);
  mode = "good";
  await assert.rejects(
    service.lookupStaff({ actor: "learner", scopes: ["learner"] }, target.id),
    /administrator/,
  );
  const other = await prisma.staff_members.create({
    data: {
      email: "other@example.test",
      display_name: "Other admin",
      roles: ["staff_admin"],
      auth_provider: staff.auth_provider,
      external_subject: "43",
    },
  });
  subject = 43;
  const otherSession = await login();
  expectedToken = "access-43";
  assert.equal(
    (
      await service.lookupStaff(
        await auth.principal(otherSession.token),
        target.id,
      )
    ).id,
    "12345",
  );
  await prisma.staff_canvas_grants.delete({ where: { staff_id: other.id } });
  const readsBefore = requests;
  await assert.rejects(
    service.lookupStaff(await auth.principal(otherSession.token), target.id),
    /Sign in to Canvas again/,
  );
  assert.equal(
    requests,
    readsBefore,
    "missing grant must not borrow another administrator's authorization",
  );
  await prisma.staff_canvas_grants.update({
    where: { staff_id: staff.id },
    data: { expires_at: new Date(0) },
  });
  expectedToken = "access-refreshed";
  assert.equal((await service.lookupStaff(principal, target.id)).id, "12345");
  @Module({
    controllers: [CanvasCoursesController],
    providers: [
      PrototypeGuard,
      { provide: CanvasStaffAuthService, useValue: auth },
      { provide: CanvasCoursesService, useValue: service },
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
  const apiUrl = await app.getUrl();
  const post = (token?: string, broker = process.env.STAFF_API_TOKEN!) =>
    fetch(`${apiUrl}/api/v1/staff/canvas/staff-lookup/${target.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${broker}`,
        ...(token ? { "X-Staff-Session": token } : {}),
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  assert.equal((await post()).status, 401);
  assert.equal(
    (await post(undefined, process.env.LEARNER_API_TOKEN!)).status,
    403,
  );
  assert.equal((await post(session.token)).status, 200);
  await prisma.staff_members.update({
    where: { id: staff.id },
    data: { roles: ["support"] },
  });
  assert.equal((await post(session.token)).status, 403);
  await prisma.staff_members.update({
    where: { id: staff.id },
    data: { roles: staff.roles },
  });
  process.env.CANVAS_STAFF_LOOKUP_ACCOUNT_ID = "";
  await assert.rejects(
    service.lookupStaff(principal, target.id),
    /not configured/,
  );
  process.env.CANVAS_STAFF_LOOKUP_ACCOUNT_ID = "1";
  await prisma.staff_members.update({
    where: { id: target.id },
    data: { active: false },
  });
  await assert.rejects(
    service.lookupStaff(principal, target.id),
    /active, unlinked/,
  );
  console.log(
    "PASS staff lookup: exact/paginated/ambiguous matches, permission denial, caller-owned encrypted grants/refresh, missing-grant isolation, hostile links, learner scope isolation, inactive targets and authenticated HTTP roles",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await client?.$disconnect();
    await pool?.end();
    if (created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [database],
      );
      await admin.query(`DROP DATABASE ${database}`);
    }
    await admin.end();
    process.env = original;
  });
