import "reflect-metadata";
import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";
import {
  Controller,
  Post,
  Body,
  Param,
  Headers as RequestHeaders,
  Get,
  Module,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NextRequest } from "next/server";
import { StaffCanvasLinkDto } from "../src/server/dto";
import { migrate } from "../scripts/db-migrate";
import {
  canvasStaffConfig,
  staffAuthInfo,
} from "../src/server/staff-auth-config";

// Only this disposable database is mutated. The provider is mocked at the
// server's HTTP boundary; no credentials or Canvas network requests are needed.
const base = new URL(process.env.DATABASE_URL!);
const name = `ce_authtest_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({
  connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
    .href,
});
const originalEnv = { ...process.env };
const nonce = () => randomBytes(32).toString("base64url");
let created = false;
let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
let prisma: typeof import("../src/domain/prisma").prisma | undefined;
let pool: typeof import("../src/domain/db").db | undefined;
const realFetch = global.fetch;

async function main() {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  process.env.DATABASE_URL = Object.assign(new URL(base), {
    pathname: `/${name}`,
  }).href;
  process.env.PROTOTYPE_MODE = "true";
  process.env.STAFF_AUTH_MODE = "canvas";
  process.env.CANVAS_COURSES_ENABLED = "false";
  process.env.CANVAS_BASE_URL = "https://canvas.example.test";
  process.env.CANVAS_STAFF_CLIENT_ID = "test-client";
  process.env.CANVAS_STAFF_CLIENT_SECRET = "test-only-secret";
  process.env.CANVAS_STAFF_REDIRECT_URI =
    "http://localhost:3050/api/auth/canvas/callback";
  process.env.STAFF_SESSION_HOURS = "8";
  process.env.CANVAS_STAFF_FORCE_LOGIN = "true";
  process.env.CANVAS_USER_AGENT = "Cedarville-CE-Auth-Tests/1.0";
  delete process.env.CANVAS_STAFF_AUTHORIZE_URL;
  delete process.env.CANVAS_STAFF_TOKEN_URL;
  await migrate(process.env.DATABASE_URL, { quiet: true });
  prisma = (await import("../src/domain/prisma")).prisma;
  pool = (await import("../src/domain/db")).db;
  const { CanvasStaffAuthService, secretDigest } =
    await import("../src/server/canvas-staff-auth");
  const { StaffAuthController, StaffBrokerGuard } =
    await import("../src/server/staff-auth-controller");
  const { PrototypeGuard, requireScope } = await import("../src/server/auth");
  const { PortalService } = await import("../src/server/service");
  const auth = new CanvasStaffAuthService();
  let providerId = 42;
  let providerCalls = 0;
  auth.request = async (url, init) => {
    providerCalls++;
    assert.equal(url, "https://canvas.example.test/login/oauth2/token");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("User-Agent"),
      "Cedarville-CE-Auth-Tests/1.0",
    );
    const body = new URLSearchParams(init?.body as URLSearchParams);
    assert.equal(body.get("client_secret"), "test-only-secret");
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(
      body.get("redirect_uri"),
      process.env.CANVAS_STAFF_REDIRECT_URI,
    );
    return Response.json({
      access_token: null,
      token_type: "Bearer",
      user: { id: providerId, name: "Provider name does not assign access" },
    });
  };
  const member = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "admin@cuce.test" },
  });
  await prisma.staff_members.update({
    where: { id: member.id },
    data: {
      auth_provider: "canvas:https://canvas.example.test",
      external_subject: "42",
    },
  });
  const portal = new PortalService();
  // The administrative linking tool operates only on an existing approved
  // record, is idempotent, and refuses replacement or duplicate identity links.
  const link = (email: string, subject: string) =>
    execFileSync(
      process.execPath,
      [
        path.resolve("node_modules/ts-node/dist/bin.js"),
        "-P",
        "tsconfig.server.json",
        "scripts/link-canvas-staff.ts",
        "--email",
        email,
        "--canvas-user-id",
        subject,
      ],
      { env: process.env, stdio: "pipe" },
    );
  const catalogBefore = await prisma.staff_members.findUniqueOrThrow({
    where: { email: "catalog@cuce.test" },
  });
  link(catalogBefore.email, "10000");
  const catalog = await prisma.staff_members.findUniqueOrThrow({
    where: { id: catalogBefore.id },
  });
  assert.deepEqual(catalog.roles, catalogBefore.roles);
  assert.equal(catalog.version, catalogBefore.version + 1);
  link(catalog.email, "10000");
  assert.equal(
    (
      await prisma.staff_members.findUniqueOrThrow({
        where: { id: catalog.id },
      })
    ).version,
    catalog.version,
  );
  assert.throws(() => link(catalog.email, "10001"));
  assert.throws(() => link("support@cuce.test", "10000"));
  assert.throws(() => link("unknown@example.test", "10000"));
  const linkPrisma = prisma;
  const linkTarget = await linkPrisma.staff_members.create({
    data: {
      email: "link-ui@example.test",
      display_name: "Canvas link test",
      roles: ["approver"],
    },
  });
  const linkingAdmin = {
    actor: `staff:${member.id}`,
    staffId: member.id,
    scopes: ["staff:manage"],
  };
  const linkData = {
    version: linkTarget.version,
    canvasUserId: "20001",
    identityVerified: true,
  };
  await assert.rejects(
    portal.linkStaffCanvas(
      { actor: "learner:test", scopes: ["learner"] },
      randomUUID(),
      linkTarget.id,
      linkData,
    ),
    /administrator/,
  );
  await assert.rejects(
    portal.linkStaffCanvas(linkingAdmin, randomUUID(), linkTarget.id, {
      ...linkData,
      identityVerified: false,
    }),
    /Verify/,
  );
  await assert.rejects(
    portal.linkStaffCanvas(linkingAdmin, randomUUID(), linkTarget.id, {
      ...linkData,
      canvasUserId: "person@example.test",
    }),
    /Verify/,
  );
  const oldToken = nonce();
  await linkPrisma.staff_sessions.create({
    data: {
      token_hash: secretDigest(oldToken),
      staff_id: linkTarget.id,
      auth_provider: "mock",
      external_subject: "pending",
      expires_at: new Date(Date.now() + 60000),
    },
  });
  const linkKey = randomUUID();
  await portal.linkStaffCanvas(linkingAdmin, linkKey, linkTarget.id, linkData);
  await portal.linkStaffCanvas(linkingAdmin, linkKey, linkTarget.id, linkData);
  const linked = await linkPrisma.staff_members.findUniqueOrThrow({
    where: { id: linkTarget.id },
  });
  assert.deepEqual(linked.roles, linkTarget.roles);
  assert.equal(linked.version, linkTarget.version + 1);
  assert.equal(linked.external_subject, "20001");
  assert.equal(linked.auth_provider, "canvas:https://canvas.example.test");
  assert.equal(
    await linkPrisma.staff_sessions.count({
      where: { staff_id: linkTarget.id },
    }),
    0,
  );
  assert.equal(
    await linkPrisma.audit_events.count({
      where: {
        action: "staff.canvas_identity_linked",
        object_id: linkTarget.id,
      },
    }),
    1,
  );
  await assert.rejects(
    portal.linkStaffCanvas(linkingAdmin, randomUUID(), linkTarget.id, {
      ...linkData,
      version: linked.version,
      canvasUserId: "20002",
    }),
    /different identity/,
  );
  await assert.rejects(
    portal.linkStaffCanvas(linkingAdmin, randomUUID(), linkTarget.id, linkData),
    /changed/,
  );
  const duplicates = await Promise.all(
    [1, 2].map((n) =>
      linkPrisma.staff_members.create({
        data: {
          email: `link-race-${n}@example.test`,
          display_name: `Link race ${n}`,
          roles: ["support"],
        },
      }),
    ),
  );
  const attempts = await Promise.allSettled(
    duplicates.map((target) =>
      portal.linkStaffCanvas(linkingAdmin, randomUUID(), target.id, {
        version: target.version,
        canvasUserId: "20003",
        identityVerified: true,
      }),
    ),
  );
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  assert.equal(
    await linkPrisma.staff_members.count({
      where: { external_subject: "20003" },
    }),
    1,
  );
  const inactive = await linkPrisma.staff_members.create({
    data: {
      email: "link-inactive@example.test",
      display_name: "Inactive link",
      roles: ["support"],
      active: false,
    },
  });
  await assert.rejects(
    portal.linkStaffCanvas(linkingAdmin, randomUUID(), inactive.id, {
      version: inactive.version,
      canvasUserId: "20004",
      identityVerified: true,
    }),
    /Reactivate/,
  );
  const httpTarget = await linkPrisma.staff_members.create({
    data: {
      email: "link-http@example.test",
      display_name: "HTTP link",
      roles: ["support"],
    },
  });
  @Controller("api/v1")
  @UseGuards(PrototypeGuard)
  class TestStaffController {
    @Post("staff/members/:id/canvas-link") link(
      @Req() req: any,
      @RequestHeaders("idempotency-key") key: string,
      @Param("id") id: string,
      @Body() data: StaffCanvasLinkDto,
    ) {
      requireScope(req, "staff:manage");
      return portal.linkStaffCanvas(req.principal, key, id, data);
    }
    @Get("staff/me") me(@Req() req: any) {
      requireScope(req, "staff:read");
      return portal.staffMe(req.principal);
    }
  }
  @Module({
    controllers: [StaffAuthController, TestStaffController],
    providers: [
      StaffBrokerGuard,
      PrototypeGuard,
      { provide: CanvasStaffAuthService, useValue: auth },
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
  process.env.API_URL = await app.getUrl();
  const backend = (
    path: string,
    body?: object,
    extra?: Record<string, string>,
  ) =>
    realFetch(`${process.env.API_URL}/api/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${process.env.STAFF_API_TOKEN}`,
        "Content-Type": "application/json",
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const stateFor = async (browserNonce: string) =>
    new URL((await auth.begin(browserNonce)).authorizationUrl).searchParams.get(
      "state",
    )!;
  const complete = async () => {
    const browserNonce = nonce();
    return auth.complete({
      state: await stateFor(browserNonce),
      browserNonce,
      code: "valid-code",
    });
  };

  // Configuration cannot redirect credentials to a different host or accept
  // insecure nonlocal callbacks. Missing credentials never enable mock access.
  assert.throws(() =>
    canvasStaffConfig({
      ...process.env,
      CANVAS_STAFF_TOKEN_URL: "https://other.example.test/token",
    }),
  );
  assert.throws(() =>
    canvasStaffConfig({
      ...process.env,
      CANVAS_STAFF_REDIRECT_URI:
        "http://portal.example.test/api/auth/canvas/callback",
    }),
  );
  assert.throws(() =>
    canvasStaffConfig({ ...process.env, STAFF_SESSION_HOURS: "999" }),
  );
  assert.equal(
    canvasStaffConfig({ ...process.env, CANVAS_USER_AGENT: "" }).userAgent,
    "Cedarville-CE-Portal/0.1.0",
  );
  assert.throws(() =>
    canvasStaffConfig({ ...process.env, CANVAS_USER_AGENT: "bad\r\nheader" }),
  );
  process.env.CANVAS_STAFF_CLIENT_SECRET = "";
  assert.deepEqual(staffAuthInfo(), {
    mode: "canvas",
    configured: false,
    secureCookies: true,
    portalOrigin: null,
  });
  await assert.rejects(auth.begin(nonce()));
  process.env.CANVAS_STAFF_CLIENT_SECRET = "test-only-secret";

  const browserNonce = nonce();
  const start = await auth.begin(browserNonce);
  const authorize = new URL(start.authorizationUrl);
  assert.equal(authorize.searchParams.get("scope"), "/auth/userinfo");
  assert.equal(authorize.searchParams.get("force_login"), "1");
  assert.ok(!start.authorizationUrl.includes("secret"));
  const state = authorize.searchParams.get("state")!;
  assert.ok(
    await prisma.staff_oauth_states.findUnique({
      where: { state_hash: secretDigest(state) },
    }),
  );
  await assert.rejects(
    auth.complete({ state, browserNonce: nonce(), code: "code" }),
  );
  assert.equal(providerCalls, 0);
  const issued = await auth.complete({ state, browserNonce, code: "code" });
  assert.equal((await auth.principal(issued.token)).staffId, member.id);

  assert.equal(
    await prisma.staff_sessions.count({ where: { token_hash: issued.token } }),
    0,
  );
  assert.equal(
    await prisma.staff_sessions.count({
      where: { token_hash: secretDigest(issued.token) },
    }),
    1,
  );
  await assert.rejects(auth.complete({ state, browserNonce, code: "code" }));
  assert.equal(providerCalls, 1);
  const httpLink = (body: object, session = issued.token) =>
    backend(`staff/members/${httpTarget.id}/canvas-link`, body, {
      "X-Staff-Session": session,
      "Idempotency-Key": randomUUID(),
    });
  const httpLinkData = {
    version: httpTarget.version,
    canvasUserId: "20005",
    identityVerified: true,
  };
  assert.equal(
    (await httpLink({ ...httpLinkData, identityVerified: false })).status,
    400,
  );
  assert.equal(
    (
      await httpLink({
        ...httpLinkData,
        auth_provider: "canvas:https://attacker.test",
      })
    ).status,
    400,
  );
  assert.equal((await httpLink(httpLinkData, "invalid")).status, 401);
  assert.equal((await httpLink(httpLinkData)).status, 201);
  providerId = 20005;
  assert.equal(
    (await auth.principal((await complete()).token)).staffId,
    httpTarget.id,
  );
  assert.equal(
    (
      await httpLink(
        { ...httpLinkData, version: 2, canvasUserId: "20006" },
        (await complete()).token,
      )
    ).status,
    403,
  );
  providerId = 42;

  const racingNonce = nonce();
  const racingState = await stateFor(racingNonce);
  const racing = await Promise.allSettled(
    [0, 1].map(() =>
      auth.complete({
        state: racingState,
        browserNonce: racingNonce,
        code: "racing",
      }),
    ),
  );
  assert.equal(
    racing.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const replacementNonce = nonce();
  const replacement = await auth.complete({
    state: await stateFor(replacementNonce),
    browserNonce: replacementNonce,
    code: "replacement",
    previousSession: issued.token,
  });
  await assert.rejects(auth.principal(issued.token));
  await Promise.all([
    auth.logout(replacement.token),
    auth.logout(replacement.token),
  ]);
  await assert.rejects(auth.principal(replacement.token));
  // Keep a separate session for the current-role/deactivation checks below.
  const roleSession = await complete();
  await assert.rejects(auth.principal(member.id));
  await assert.rejects(auth.principal(nonce()));

  const expiredNonce = nonce();
  const expiredState = await stateFor(expiredNonce);
  await prisma.staff_oauth_states.update({
    where: { state_hash: secretDigest(expiredState) },
    data: { expires_at: new Date(0) },
  });
  await assert.rejects(
    auth.complete({
      state: expiredState,
      browserNonce: expiredNonce,
      code: "code",
    }),
  );
  const changedNonce = nonce();
  const changedState = await stateFor(changedNonce);
  process.env.CANVAS_STAFF_CLIENT_ID = "changed";
  await assert.rejects(
    auth.complete({
      state: changedState,
      browserNonce: changedNonce,
      code: "code",
    }),
  );
  process.env.CANVAS_STAFF_CLIENT_ID = "test-client";
  const cancelledNonce = nonce();
  const cancelledState = await stateFor(cancelledNonce);
  await assert.rejects(
    auth.complete({
      state: cancelledState,
      browserNonce: cancelledNonce,
      error: "access_denied",
    }),
  );
  await assert.rejects(
    auth.complete({
      state: cancelledState,
      browserNonce: cancelledNonce,
      code: "code",
    }),
  );

  const count = await prisma.staff_sessions.count();
  providerId = 999;
  await assert.rejects(complete(), /not authorized/);
  assert.equal(await prisma.staff_sessions.count(), count);
  providerId = 42;
  await prisma.staff_members.update({
    where: { id: member.id },
    data: { active: false },
  });
  await assert.rejects(complete(), /not authorized/);
  await assert.rejects(auth.principal(roleSession.token));
  await prisma.staff_members.update({
    where: { id: member.id },
    data: { active: true, roles: ["support"] },
  });
  assert.ok(
    !(await auth.principal(roleSession.token)).scopes.includes("staff:manage"),
  );
  await prisma.staff_members.update({
    where: { id: member.id },
    data: { external_subject: "43" },
  });
  await assert.rejects(auth.principal(roleSession.token));
  await prisma.staff_members.update({
    where: { id: member.id },
    data: { external_subject: "42", roles: member.roles },
  });
  await prisma.staff_sessions.update({
    where: { token_hash: secretDigest(roleSession.token) },
    data: { expires_at: new Date(0) },
  });
  await assert.rejects(auth.principal(roleSession.token));
  const validProvider = auth.request;
  auth.request = async () =>
    Response.json({ access_token: "unwanted-api-token", user: { id: 42 } });
  await assert.rejects(complete(), /identity-only/);
  auth.request = async () =>
    Response.json({ access_token: null, user: { id: 1.5 } });
  await assert.rejects(complete(), /Invalid Canvas identity/);
  auth.request = async () =>
    new Response("sensitive provider error", { status: 500 });
  await assert.rejects(
    complete(),
    (error: any) =>
      !error.message.includes("sensitive") && error.getStatus() === 503,
  );
  auth.request = validProvider;

  // Trusted broker API + guard: headers cannot choose a staff identity in Canvas mode.
  assert.equal(
    (await realFetch(`${process.env.API_URL}/api/v1/auth/staff/config`)).status,
    401,
  );
  assert.equal(
    (
      await backend("staff/me", undefined, {
        "X-Prototype-Staff-Id": member.id,
      })
    ).status,
    401,
  );
  assert.equal(
    (await backend("auth/staff/canvas/start", { browserNonce: "bad" })).status,
    400,
  );
  await assert.rejects(portal.staffDirectory());
  await assert.rejects(portal.staffSession(member.email));

  // Exercise the real Next handlers against the in-process API. Browser responses
  // get opaque HTTP-only cookies, never a JSON bearer token or Canvas credentials.
  const startRoute = await import("../src/web/app/api/auth/canvas/start/route");
  const callbackRoute =
    await import("../src/web/app/api/auth/canvas/callback/route");
  const sessionRoute = await import("../src/web/app/api/staff-session/route");
  const proxyRoute = await import("../src/web/app/api/[...path]/route");
  const req = (
    path: string,
    init: ConstructorParameters<typeof NextRequest>[1] = {},
  ) => new NextRequest(`http://localhost:3050${path}`, init);
  const login = await startRoute.GET(req("/api/auth/canvas/start"));
  assert.equal(login.status, 303);
  const loginLocation = new URL(login.headers.get("location")!);
  const binding = login.cookies.get("ce-canvas-flow")!.value;
  assert.ok(login.headers.get("set-cookie")!.includes("HttpOnly"));
  const callback = await callbackRoute.GET(
    req(
      `/api/auth/canvas/callback?code=valid&state=${loginLocation.searchParams.get("state")}`,
      { headers: { cookie: `ce-canvas-flow=${binding}` } },
    ),
  );
  assert.equal(callback.headers.get("location"), "http://localhost:3050/staff");
  const session = callback.cookies.get("ce-staff-session")!.value;
  assert.equal(await callback.text(), "");
  assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
  assert.equal(callback.headers.get("cache-control"), "no-store");
  assert.ok(callback.headers.get("set-cookie")!.includes("SameSite=lax"));
  const cookies = { cookie: `ce-staff-session=${session}` };
  const current = await sessionRoute.GET(
    req("/api/staff-session", { headers: cookies }),
  );
  assert.equal((await current.json()).member.id, member.id);
  assert.equal(
    (
      await sessionRoute.POST(
        req("/api/staff-session", {
          method: "POST",
          body: JSON.stringify({ email: member.email }),
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await sessionRoute.GET(req("/api/staff-session?directory=1"))).status,
    403,
  );
  const fake = await sessionRoute.GET(
    req("/api/staff-session", {
      headers: { cookie: `ce-demo-staff=${member.id}` },
    }),
  );
  assert.equal((await fake.json()).member, null);
  const proxyHeaders = { ...cookies, "x-prototype-role": "staff" };
  assert.equal(
    (
      await proxyRoute.GET(req("/api/staff/me", { headers: proxyHeaders }), {
        params: Promise.resolve({ path: ["staff", "me"] }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await proxyRoute.POST(
        req("/api/staff/me", { method: "POST", headers: proxyHeaders }),
        { params: Promise.resolve({ path: ["staff", "me"] }) },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxyRoute.GET(req("/api/auth/staff/config"), {
        params: Promise.resolve({ path: ["auth", "staff", "config"] }),
      })
    ).status,
    404,
  );
  for (const path of [
    ["AUTH", "staff", "canvas", "callback"],
    ["prototype", "..", "auth", "staff", "config"],
    ["auth/staff", "config"],
  ]) {
    assert.equal(
      (
        await proxyRoute.GET(req("/api/check", { headers: proxyHeaders }), {
          params: Promise.resolve({ path }),
        })
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await sessionRoute.DELETE(
        req("/api/staff-session", {
          method: "DELETE",
          headers: { ...cookies, origin: "https://attacker.example.test" },
        }),
      )
    ).status,
    403,
  );
  const missingBinding = await callbackRoute.GET(
    req(`/api/auth/canvas/callback?code=valid&state=${nonce()}`),
  );
  assert.ok(
    missingBinding.headers.get("location")!.endsWith("authError=invalid"),
  );
  const signedOut = await sessionRoute.DELETE(
    req("/api/staff-session", {
      method: "DELETE",
      headers: { ...cookies, origin: "http://localhost:3050" },
    }),
  );
  assert.equal(signedOut.status, 200);
  await assert.rejects(auth.principal(session));
  assert.ok(
    await prisma.audit_events.count({ where: { action: "staff.signed_out" } }),
  );
  providerId = 10000;
  const deactivateSession = await complete();
  const adminPrincipal = {
    actor: `staff:${member.id}`,
    staffId: member.id,
    scopes: ["staff:manage"],
  };
  await portal.updateStaff(adminPrincipal, randomUUID(), catalog.id, {
    version: catalog.version,
    displayName: catalog.display_name,
    roles: catalog.roles,
    active: false,
  });
  assert.equal(
    await prisma.staff_sessions.count({ where: { staff_id: catalog.id } }),
    0,
  );
  await assert.rejects(auth.principal(deactivateSession.token));
  await portal.updateStaff(adminPrincipal, randomUUID(), catalog.id, {
    version: (
      await prisma.staff_members.findUniqueOrThrow({
        where: { id: catalog.id },
      })
    ).version,
    displayName: catalog.display_name,
    roles: catalog.roles,
    active: true,
  });
  await assert.rejects(auth.principal(deactivateSession.token));
  providerId = 42;
  process.env.CANVAS_STAFF_REDIRECT_URI =
    "https://portal.example.test/api/auth/canvas/callback";
  const secure = await startRoute.GET(
    new NextRequest("https://portal.example.test/api/auth/canvas/start"),
  );
  assert.ok(secure.headers.get("set-cookie")!.includes("Secure"));
  assert.ok(secure.cookies.get("__Host-ce-canvas-flow"));
  process.env.CANVAS_STAFF_CLIENT_SECRET = "";
  const disabled = await sessionRoute.GET(req("/api/staff-session"));
  assert.equal((await disabled.json()).auth.configured, false);
  console.log(
    "Canvas auth checks passed: configuration, identity-only exchange, state/replay, access/roles, session expiry/revocation, broker guard, browser cookies, CSRF and mock bypass.",
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
    await prisma?.$disconnect();
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
    process.env = originalEnv;
  });
