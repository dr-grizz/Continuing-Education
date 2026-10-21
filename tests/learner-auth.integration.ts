import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  Controller,
  Get,
  Module,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NextRequest } from "next/server";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";

const savedEnv = { ...process.env },
  realFetch = global.fetch;
const base = new URL(process.env.DATABASE_URL!);
const database = `ce_learnerauth_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
const nonce = () => randomBytes(32).toString("base64url");
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
    LEARNER_AUTH_MODE: "canvas",
    STAFF_AUTH_MODE: "canvas",
    CANVAS_COURSES_ENABLED: "false",
    CANVAS_BASE_URL: "https://canvas.example.test",
    CANVAS_STAFF_CLIENT_ID: "learner-test",
    CANVAS_STAFF_CLIENT_SECRET: "test-only-secret",
    CANVAS_STAFF_REDIRECT_URI: "http://localhost:3050/api/auth/canvas/callback",
    LEARNER_API_TOKEN: "learner-test-broker",
    STAFF_API_TOKEN: "staff-test-broker",
  });
  delete process.env.CANVAS_STAFF_AUTHORIZE_URL;
  delete process.env.CANVAS_STAFF_TOKEN_URL;
  // Reproduce CI's cleanup boundary with two real idle connections. end() alone
  // can resolve before their remove events; dropping with FORCE then kills them.
  const probe = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });
  const probeClients = await Promise.all([probe.connect(), probe.connect()]);
  let removed = 0;
  probe.on("remove", () => removed++);
  probeClients.forEach((connection) => connection.release());
  await endPoolAndWaitForClients(probe);
  assert.equal(removed, 2);
  await migrate(process.env.DATABASE_URL, { quiet: true });
  client = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const prisma = client;
  const { CanvasLearnerAuthService } =
    await import("../src/server/canvas-learner-auth");
  const { CanvasStaffAuthService, secretDigest } =
    await import("../src/server/canvas-staff-auth");
  const { LearnerAuthController, LearnerBrokerGuard } =
    await import("../src/server/learner-auth-controller");
  const { PrototypeGuard, requireScope } = await import("../src/server/auth");
  const { PortalService } = await import("../src/server/service");
  const auth = new CanvasLearnerAuthService(),
    staff = new CanvasStaffAuthService(),
    portal = new PortalService();
  let subject = 42,
    calls = 0,
    badPayload = false,
    networkFailure = false;
  auth.request = async (url, init) => {
    calls++;
    assert.equal(url, "https://canvas.example.test/login/oauth2/token");
    assert.equal(init?.redirect, "error");
    assert.ok(new Headers(init?.headers).get("User-Agent"));
    const body = new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(body.get("client_secret"), "test-only-secret");
    assert.equal(
      body.get("redirect_uri"),
      process.env.CANVAS_STAFF_REDIRECT_URI,
    );
    if (networkFailure) throw new Error("provider secret must not escape");
    return Response.json({
      access_token: badPayload ? "unexpected-grant" : null,
      user: {
        id: subject,
        name: "Test CU learner",
        email: "untrusted@example.test",
      },
    });
  };
  staff.request = auth.request;
  @Controller("learner-test")
  @UseGuards(PrototypeGuard)
  class Protected {
    @Get("me") me(@Req() req: any) {
      return portal.me(req.principal);
    }
    @Get("staff") staff(@Req() req: any) {
      requireScope(req, "staff:write");
      return { ok: true };
    }
  }
  @Module({
    controllers: [LearnerAuthController, Protected],
    providers: [
      LearnerBrokerGuard,
      PrototypeGuard,
      { provide: CanvasLearnerAuthService, useValue: auth },
      { provide: CanvasStaffAuthService, useValue: staff },
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
  const api = await app.getUrl();
  const request = (path: string, headers: Record<string, string> = {}) =>
    realFetch(`${api}/learner-test/${path}`, {
      headers: { Authorization: "Bearer learner-test-broker", ...headers },
    });
  const begin = async (returnTo = "/learning") => {
    const browserNonce = nonce();
    const url = new URL(
      (await auth.begin(browserNonce, returnTo)).authorizationUrl,
    );
    assert.equal(url.searchParams.get("scope"), "/auth/userinfo");
    assert.equal(
      url.searchParams.get("redirect_uri"),
      process.env.CANVAS_STAFF_REDIRECT_URI,
    );
    return {
      state: url.searchParams.get("state")!,
      browserNonce,
      code: "test-code",
    };
  };
  const login = async () => auth.complete(await begin());

  assert.equal((await request("me")).status, 401); // No legacy default learner.
  assert.equal(
    (
      await request("me", {
        "X-Prototype-Learner-Id": "00000000-0000-4000-8000-000000000001",
      })
    ).status,
    401,
  );
  assert.equal(
    (await realFetch(`${api}/api/v1/auth/learner/config`)).status,
    401,
  );
  const original = await prisma.learners.create({
    data: { email: "untrusted@example.test" },
  });
  // Staff course-read configuration must never broaden learner consent or
  // require a staff token-encryption key for identity-only learner login.
  process.env.CANVAS_COURSES_ENABLED = "true";
  const flow = await begin("https://evil.test/");
  const before = calls;
  await assert.rejects(auth.complete({ ...flow, browserNonce: nonce() }));
  assert.equal(calls, before);
  const result = await auth.complete(flow);
  assert.equal(result.returnTo, "/learning");
  await assert.rejects(auth.complete(flow));
  const identity = await auth.principal(result.token);
  assert.notEqual(identity.learnerId, original.id);
  const learner = await prisma.learners.findUniqueOrThrow({
    where: { id: identity.learnerId },
  });
  assert.equal(learner.email, null);
  assert.equal(learner.external_subject, "42");
  assert.equal(learner.display_name, "Test CU learner");
  const staffView = await portal.staffLearner(identity.learnerId);
  assert.equal(staffView.display_name, "Test CU learner");
  assert.equal(staffView.legacy, false);
  assert.ok(
    (await portal.staffLearners("Test CU learner")).some(
      (row) => row.id === identity.learnerId,
    ),
  );
  assert.deepEqual(identity.scopes, ["learner"]);
  assert.equal(await prisma.staff_canvas_grants.count(), 0);
  assert.equal(
    await prisma.learner_sessions.count({
      where: { token_hash: secretDigest(result.token) },
    }),
    1,
  );
  assert.equal(
    (await request("me", { "X-Learner-Session": result.token })).status,
    200,
  );
  assert.equal(
    (await request("staff", { "X-Learner-Session": result.token })).status,
    403,
  );
  await assert.rejects(portal.demoUser("other@example.test"));
  assert.equal(
    (
      await request("me", {
        "X-Learner-Session": result.token,
        "X-Prototype-Learner-Id": original.id,
      })
    ).status,
    401,
  );
  const second = await login();
  assert.equal(
    (await auth.principal(second.token)).learnerId,
    identity.learnerId,
  );
  const replaced = await auth.complete({
    ...(await begin()),
    previousSession: second.token,
  });
  await assert.rejects(auth.principal(second.token));
  assert.equal(
    (await auth.principal(replaced.token)).learnerId,
    identity.learnerId,
  );

  subject = 88;
  const concurrent = await Promise.all([login(), login()]);
  assert.equal(
    (await auth.principal(concurrent[0].token)).learnerId,
    (await auth.principal(concurrent[1].token)).learnerId,
  );
  assert.equal(
    await prisma.learners.count({ where: { external_subject: "88" } }),
    1,
  );
  const otherLearner = await auth.principal(concurrent[0].token);
  const offering = await prisma.offerings.create({
    data: {
      title: "OAuth registration test",
      category: "Technology",
      summary: "Synthetic learner authentication workflow",
      description:
        "Synthetic course used only in the disposable test database.",
      format: "Online",
      course_type: "self_paced",
      capacity: 10,
      price_cents: 1000,
      published: true,
      outcomes: ["Check registration ownership"],
    },
  });
  await portal.register(identity, randomUUID(), offering.id);
  const entitlement = await prisma.entitlements.findUniqueOrThrow({
    where: {
      learner_id_offering_id: {
        learner_id: identity.learnerId,
        offering_id: offering.id,
      },
    },
  });
  await assert.rejects(
    portal.payment(otherLearner, randomUUID(), entitlement.id),
  );
  const paymentKey = randomUUID();
  await portal.payment(identity, paymentKey, entitlement.id);
  await portal.payment(identity, paymentKey, entitlement.id);
  assert.equal(
    await prisma.orders.count({ where: { entitlement_id: entitlement.id } }),
    1,
  );
  const operation = await prisma.operations.findFirstOrThrow({
    where: { entitlement_id: entitlement.id },
  });
  await assert.rejects(portal.operation(operation.id, otherLearner));
  assert.equal(
    (await portal.operation(operation.id, identity)).id,
    operation.id,
  );
  assert.equal((await portal.learning(identity)).length, 1);
  assert.equal((await portal.learning(otherLearner)).length, 0);
  subject = 42;
  const expired = await begin();
  await prisma.learner_oauth_states.update({
    where: { state_hash: secretDigest(expired.state) },
    data: { expires_at: new Date(0) },
  });
  await assert.rejects(auth.complete(expired));
  const race = await begin();
  assert.equal(
    (
      await Promise.allSettled([auth.complete(race), auth.complete(race)])
    ).filter((r) => r.status === "fulfilled").length,
    1,
  );
  const denied = await begin();
  await assert.rejects(auth.complete({ ...denied, error: "access_denied" }));
  await assert.rejects(auth.complete(denied));
  badPayload = true;
  await assert.rejects(auth.complete(await begin()));
  badPayload = false;
  networkFailure = true;
  await assert.rejects(
    auth.complete(await begin()),
    (error) =>
      error instanceof Error && !error.message.includes("provider secret"),
  );
  networkFailure = false;
  const staffMember = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "admin@cuce.test" },
  });
  process.env.CANVAS_COURSES_ENABLED = "false";
  await prisma.staff_members.update({
    where: { id: staffMember.id },
    data: { auth_provider: learner.auth_provider, external_subject: "42" },
  });
  const staffNonce = nonce();
  const staffState = new URL(
    (await staff.begin(staffNonce)).authorizationUrl,
  ).searchParams.get("state")!;
  await assert.rejects(
    auth.complete({
      state: staffState,
      browserNonce: staffNonce,
      code: "test",
    }),
  );
  const staffSession = await staff.complete({
    state: staffState,
    browserNonce: staffNonce,
    code: "test",
  });
  const learnerFlow = await begin();
  await assert.rejects(staff.complete(learnerFlow));
  const learnerSession = await auth.complete(learnerFlow);
  await auth.logout(learnerSession.token);
  await assert.rejects(auth.principal(learnerSession.token));
  assert.equal(
    (await staff.principal(staffSession.token)).staffId,
    staffMember.id,
  );

  // Exercise the actual shared Next callback, cookies, logout and API proxy.
  process.env.API_URL = api;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url === `${api}/api/v1/me`)
      return realFetch(`${api}/learner-test/me`, init);
    return realFetch(input, init);
  };
  const startRoute =
    await import("../src/web/app/api/auth/learner/canvas/start/route");
  const callbackRoute =
    await import("../src/web/app/api/auth/canvas/callback/route");
  const sessionRoute = await import("../src/web/app/api/demo-session/route");
  const proxy = await import("../src/web/app/api/[...path]/route");
  const start = await startRoute.GET(
    new NextRequest(
      "http://localhost:3050/api/auth/learner/canvas/start?returnTo=%2Fcollections%2Ftest-pathway",
    ),
  );
  assert.equal(start.status, 303);
  const url = new URL(start.headers.get("location")!);
  const cookie = start.cookies.get("ce-learner-flow")!.value;
  const duplicate = await callbackRoute.GET(
    new NextRequest(
      `http://localhost:3050/api/auth/canvas/callback?code=test&state=${url.searchParams.get("state")}&state=other`,
      {
        headers: { cookie: `ce-learner-flow=${cookie}` },
      },
    ),
  );
  assert.equal(
    duplicate.headers.get("location"),
    "http://localhost:3050/sign-in?authError=invalid",
  );
  const callback = await callbackRoute.GET(
    new NextRequest(
      `http://localhost:3050/api/auth/canvas/callback?code=test&state=${url.searchParams.get("state")}`,
      {
        headers: {
          cookie: `ce-learner-flow=${cookie}; ce-staff-session=${staffSession.token}`,
        },
      },
    ),
  );
  assert.equal(callback.status, 303);
  assert.equal(
    callback.headers.get("location"),
    "http://localhost:3050/collections/test-pathway",
  );
  const sessionCookie = callback.cookies.get("ce-learner-session")!;
  assert.ok(sessionCookie.httpOnly);
  assert.equal(sessionCookie.sameSite, "lax");
  assert.equal(callback.cookies.get("ce-staff-session"), undefined);
  const cookieHeader = `ce-learner-session=${sessionCookie.value}`;
  const me = await sessionRoute.GET(
    new NextRequest("http://localhost:3050/api/demo-session", {
      headers: { cookie: cookieHeader },
    }),
  );
  assert.equal(me.status, 200);
  assert.equal((await me.json()).id, identity.learnerId);
  assert.equal(
    (
      await sessionRoute.POST(
        new NextRequest("http://localhost:3050/api/demo-session", {
          method: "POST",
          body: JSON.stringify({ email: "any@example.test" }),
        }),
      )
    ).status,
    403,
  );
  const forged = await proxy.GET(
    new NextRequest("http://localhost:3050/api/me", {
      headers: { cookie: `ce-demo-learner=${original.id}` },
    }),
    { params: Promise.resolve({ path: ["me"] }) },
  );
  assert.equal(forged.status, 401);
  const mutation = await proxy.POST(
    new NextRequest("http://localhost:3050/api/registrations", {
      method: "POST",
      headers: { cookie: cookieHeader, origin: "https://evil.test" },
    }),
    { params: Promise.resolve({ path: ["registrations"] }) },
  );
  assert.equal(mutation.status, 403);
  assert.equal(
    (
      await sessionRoute.DELETE(
        new NextRequest("http://localhost:3050/api/demo-session", {
          method: "DELETE",
          headers: { cookie: cookieHeader, origin: "https://evil.test" },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await sessionRoute.DELETE(
        new NextRequest("http://localhost:3050/api/demo-session", {
          method: "DELETE",
          headers: { cookie: cookieHeader, origin: "http://localhost:3050" },
        }),
      )
    ).status,
    200,
  );
  await assert.rejects(auth.principal(sessionCookie.value));
  const oldCookie = await sessionRoute.GET(
    new NextRequest("http://localhost:3050/api/demo-session", {
      headers: { cookie: cookieHeader },
    }),
  );
  assert.equal((await oldCookie.json()).id, null);
  await prisma.learners.update({
    where: { id: identity.learnerId },
    data: { active: false, deactivated_at: new Date() },
  });
  await assert.rejects(auth.principal(result.token));
  await assert.rejects(login());
  await prisma.learners.update({
    where: { id: identity.learnerId },
    data: { active: true, deactivated_at: null },
  });
  await prisma.learner_sessions.update({
    where: { token_hash: secretDigest(result.token) },
    data: { expires_at: new Date(0) },
  });
  await assert.rejects(auth.principal(result.token));
  process.env.CANVAS_STAFF_REDIRECT_URI =
    "https://portal.example.test/api/auth/canvas/callback";
  const secureStart = await startRoute.GET(
    new NextRequest(
      "https://portal.example.test/api/auth/learner/canvas/start",
    ),
  );
  const secureFlowCookie = secureStart.cookies.get("__Host-ce-learner-flow")!;
  assert.equal(secureFlowCookie.secure, true);
  const secureState = new URL(
    secureStart.headers.get("location")!,
  ).searchParams.get("state");
  const secureCallback = await callbackRoute.GET(
    new NextRequest(
      `https://portal.example.test/api/auth/canvas/callback?code=test&state=${secureState}`,
      {
        headers: { cookie: `__Host-ce-learner-flow=${secureFlowCookie.value}` },
      },
    ),
  );
  const secureSession = secureCallback.cookies.get(
    "__Host-ce-learner-session",
  )!;
  assert.equal(secureSession.secure, true);
  assert.equal(secureSession.httpOnly, true);
  assert.equal(secureSession.path, "/");
  assert.equal(
    (
      await startRoute.GET(
        new NextRequest(
          "https://wrong.example.test/api/auth/learner/canvas/start",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await startRoute.GET(
        new NextRequest(
          "https://portal.example.test/api/auth/learner/canvas/start",
          { headers: { "sec-fetch-site": "cross-site" } },
        ),
      )
    ).status,
    403,
  );
  console.log(
    "PASS learner OAuth: identity, concurrent/replayed state, role separation, session rotation/revocation, deactivation, shared callback, cookie/proxy and CSRF boundaries (isolated DB; mocked Canvas).",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    global.fetch = realFetch;
    await app?.close();
    await client?.$disconnect();
    if (pool) await endPoolAndWaitForClients(pool);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
    process.env = savedEnv;
  });
