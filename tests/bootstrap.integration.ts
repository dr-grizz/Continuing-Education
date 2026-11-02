import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { migrate } from "../scripts/db-migrate";
import {
  BootstrapService,
  bootstrapConfig,
} from "../src/server/bootstrap-service";
import {
  protectSetting,
  revealSetting,
  readApplicationSettings,
  refreshApplicationSettings,
} from "../src/domain/application-settings";

// All writes are confined to one newly-created database; no real provider calls.
const base = new URL(process.env.DATABASE_URL!);
const name = "ce_bootstraptest_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: new URL("/postgres", base).href });
const pool = new Pool({
  connectionString: new URL("/" + name, base).href,
  max: 5,
});
const env: NodeJS.ProcessEnv = {
  HOSTED_BETA: "true",
  HOSTED_DEMO: "false",
  PROTOTYPE_MODE: "true",
  NODE_ENV: "production",
  BOOTSTRAP_ENABLED: "true",
  BOOTSTRAP_KEY: randomBytes(32).toString("hex"),
  BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + 60 * 60_000).toISOString(),
  AUTH_SECRET: randomBytes(32).toString("hex"),
  WEB_URL: "https://setup.example.test",
  DATABASE_URL: new URL("/" + name, base).href,
  CANVAS_BASE_URL: "https://cedarville.instructure.com",
  CANVAS_STAFF_CLIENT_ID: "123456",
  CANVAS_STAFF_CLIENT_SECRET: "synthetic-canvas-secret-original",
  STAFF_SESSION_HOURS: "8",
  LEARNER_SESSION_HOURS: "8",
};
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const service = new BootstrapService(pool, env);
const nonce = () => randomBytes(32).toString("base64url");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
let routePool: Pool | undefined;
let created = false;

async function main() {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  await migrate(env.DATABASE_URL, { quiet: true });
  // Reconstruct the previous setup schema transactionally, then apply only the
  // new migration to prove it preserves closure/deadline/settings and revokes
  // the former Microsoft sessions. Roll back this synthetic upgrade afterward.
  const upgrade = await pool.connect();
  try {
    await upgrade.query("BEGIN");
    await upgrade.query("DROP TABLE bootstrap_key_limits");
    await upgrade.query(
      "ALTER TABLE bootstrap_control ALTER COLUMN owner_tenant SET NOT NULL; ALTER TABLE bootstrap_control ALTER COLUMN owner_object SET NOT NULL",
    );
    const prior = (
      await upgrade.query(
        "INSERT INTO bootstrap_control(id,owner_tenant,owner_object,expires_at,completed_at) VALUES(1,$1,$2,now()+interval '1 hour',now()) RETURNING *",
        [randomUUID(), randomUUID()],
      )
    ).rows[0];
    await upgrade.query(
      "INSERT INTO bootstrap_sessions(token_hash,generation,display_name,email,configuration_hash,authenticated_at,expires_at) VALUES($1,$2,'Prior Microsoft owner','prior@example.test',$3,now(),now()+interval '1 hour')",
      [hash(nonce()), prior.generation, hash(nonce())],
    );
    await upgrade.query(
      "INSERT INTO bootstrap_oauth_states(state_hash,browser_hash,generation,purpose,encrypted_payload,expires_at) VALUES($1,$2,$3,'entra','synthetic',now()+interval '1 minute')",
      [hash(nonce()), hash(nonce()), prior.generation],
    );
    await upgrade.query(
      "INSERT INTO application_settings(name,encrypted_value,updated_by) VALUES('STAFF_SESSION_HOURS',$1,'prior')",
      [protectSetting("6", "setting:STAFF_SESSION_HOURS", env)],
    );
    await upgrade.query(
      readFileSync(
        path.join(
          __dirname,
          "../prisma/migrations/026_bootstrap_key/migration.sql",
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await upgrade.query("SELECT * FROM bootstrap_control")).rows[0],
      prior,
    );
    assert.equal(
      (await upgrade.query("SELECT count(*)::int AS n FROM bootstrap_sessions"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await upgrade.query(
          "SELECT count(*)::int AS n FROM bootstrap_oauth_states",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await readApplicationSettings(upgrade as unknown as Pool, env))
        .STAFF_SESSION_HOURS,
      "6",
    );
  } finally {
    await upgrade.query("ROLLBACK");
    upgrade.release();
  }
  console.log(
    "PASS key migration preserves completed setup, deadline and encrypted settings while revoking Microsoft sessions/flows",
  );
  const config = bootstrapConfig(env);
  let transport: typeof fetch = async () => {
    throw new Error("Unexpected outbound request");
  };
  service.request = (...args) => transport(...args);
  assert.throws(() => bootstrapConfig({ ...env, BOOTSTRAP_ENABLED: "false" }));
  for (const key of [
    "",
    "weak",
    "x".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
  ])
    assert.throws(() => bootstrapConfig({ ...env, BOOTSTRAP_KEY: key }));
  assert.throws(() =>
    bootstrapConfig({
      ...env,
      BOOTSTRAP_EXPIRES_AT: new Date(Date.now() - 1000).toISOString(),
    }),
  );
  assert.throws(() => bootstrapConfig({ ...env, AUTH_SECRET: "weak" }));
  assert.throws(() => bootstrapConfig({ ...env, HOSTED_DEMO: "true" }));
  assert.equal(bootstrapConfig(env).origin, env.WEB_URL);
  // No Microsoft credentials/tenant/object IDs exist in this environment.
  await assert.rejects(service.status(nonce()));
  await assert.rejects(
    service.save(nonce(), { CANVAS_STAFF_CLIENT_ID: "123456" }),
  );
  for (const bad of [
    undefined,
    null,
    123,
    {},
    "",
    "weak",
    nonce(),
    "0".repeat(64),
  ])
    await assert.rejects(service.signIn(bad));
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM bootstrap_sessions"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM bootstrap_control"))
      .rows[0].n,
    0,
  );
  await assert.rejects(
    new BootstrapService(pool, {
      ...env,
      BOOTSTRAP_EXPIRES_AT: new Date(
        Date.now() + 25 * 60 * 60_000,
      ).toISOString(),
    }).signIn(env.BOOTSTRAP_KEY),
  );
  let signed = await service.signIn(env.BOOTSTRAP_KEY);
  assert.notEqual(
    (await pool.query("SELECT token_hash FROM bootstrap_sessions")).rows[0]
      .token_hash,
    signed.token,
  );
  assert.equal(
    (await service.status(signed.token)).owner,
    "Setup key administrator",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM staff_members WHERE email='owner@example.test'",
      )
    ).rows[0].n,
    0,
  );
  assert.ok(
    !JSON.stringify(
      (await pool.query("SELECT * FROM bootstrap_sessions")).rows,
    ).includes(env.BOOTSTRAP_KEY!),
  );
  console.log(
    "PASS key-only setup denies missing/invalid keys and configuration, creates only opaque temporary sessions, and requires no Microsoft identity",
  );
  let databaseTouches = 0;
  const disconnectedPool = {
    connect: async () => {
      databaseTouches++;
      throw new Error("synthetic private database failure");
    },
    query: async () => {
      databaseTouches++;
      throw new Error("synthetic private database failure");
    },
  } as unknown as Pool;
  const disconnected = new BootstrapService(disconnectedPool, env);
  await assert.rejects(
    disconnected.signIn("0".repeat(64)),
    (error: any) => error.status === 403,
  );
  await assert.rejects(disconnected.status(nonce()));
  const tampered =
    signed.token.slice(0, -1) + (signed.token.endsWith("A") ? "B" : "A");
  await assert.rejects(disconnected.status(tampered));
  assert.equal(databaseTouches, 0);
  await assert.rejects(disconnected.signIn(env.BOOTSTRAP_KEY));
  assert.equal(databaseTouches, 1);
  console.log(
    "PASS incorrect keys and forged session proofs never connect to PostgreSQL; a correct key reaches the database check",
  );
  const secret = "synthetic-replacement-canvas-secret";
  await service.save(signed.token, {
    CANVAS_STAFF_CLIENT_ID: "987654",
    CANVAS_STAFF_CLIENT_SECRET: secret,
    STAFF_SESSION_HOURS: "4",
  });
  const settings = await readApplicationSettings(pool, env);
  assert.equal(settings.CANVAS_STAFF_CLIENT_SECRET, secret);
  assert.ok(
    !JSON.stringify(await service.status(signed.token)).includes(secret),
  );
  assert.ok(
    !JSON.stringify(
      (await pool.query("SELECT * FROM application_settings")).rows,
    ).includes(secret),
  );
  assert.ok(
    !JSON.stringify(
      (await pool.query("SELECT details FROM audit_events")).rows,
    ).includes(secret),
  );
  await service.save(signed.token, { CANVAS_STAFF_CLIENT_SECRET: "" });
  assert.equal(
    (await readApplicationSettings(pool, env)).CANVAS_STAFF_CLIENT_SECRET,
    secret,
  );
  await assert.rejects(
    service.save(signed.token, { DATABASE_URL: "postgresql://attacker/db" }),
  );
  await assert.rejects(service.save(signed.token, { AUTH_SECRET: "attacker" }));
  await assert.rejects(
    service.save(signed.token, { STAFF_SESSION_HOURS: "99" }),
  );
  await assert.rejects(service.complete(signed.token));
  const sealed = protectSetting("sensitive", "setting:test", env);
  assert.throws(() => revealSetting(sealed, "setting:other", env));
  assert.throws(() =>
    revealSetting(sealed, "setting:test", { ...env, AUTH_SECRET: nonce() }),
  );
  console.log(
    "PASS settings are encrypted and write-only; secret keep-blank, field allowlist and handoff-before-completion are enforced",
  );
  Object.assign(process.env, env);
  await refreshApplicationSettings(pool, true);
  assert.equal(process.env.CANVAS_STAFF_CLIENT_SECRET, secret);
  const web = await import("../src/web/app/api/bootstrap/route");
  const helper = await import("../src/web/server/bootstrap");
  routePool = (await helper.bootstrapService()).pool;
  const {
    setupDiagnosticsCookie,
    assertSetupDiagnostics,
    assertBootstrapSession: assertFullSession,
  } = await import("../src/server/bootstrap-auth");
  const originalConnect = routePool.connect;
  let preAuthConnections = 0;
  (routePool as any).connect = async () => {
    preAuthConnections++;
    throw Object.assign(
      new Error(
        "synthetic unavailable database containing private connection data",
      ),
      { code: "28P01" },
    );
  };
  const preflightRequest = (body?: unknown, cookie = "") =>
    new NextRequest(config.origin + "/api/bootstrap", {
      method: body ? "POST" : "GET",
      headers: {
        origin: config.origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await web.GET(preflightRequest())).status, 200);
    assert.equal(
      (
        await web.GET(
          preflightRequest(undefined, `${helper.setupCookie}=${nonce()}`),
        )
      ).status,
      401,
    );
    assert.equal(
      (await web.POST(preflightRequest({ action: "start", key: "wrong" })))
        .status,
      403,
    );
    assert.equal(
      (
        await web.POST(
          preflightRequest({
            action: "save",
            settings: { STAFF_SESSION_HOURS: "2" },
          }),
        )
      ).status,
      403,
    );
    const wrong = await web.POST(
      preflightRequest({ action: "start", key: "wrong" }),
    );
    assert.equal(wrong.cookies.get(setupDiagnosticsCookie), undefined);
    assert.equal(preAuthConnections, 0);
    const down = await web.POST(
      preflightRequest({ action: "start", key: env.BOOTSTRAP_KEY }),
    );
    assert.equal(down.status, 503);
    assert.equal(preAuthConnections, 1);
    const downBody = await down.json();
    assert.equal(downBody.code, "DB_AUTHENTICATION_FAILED");
    assert.equal(downBody.diagnosticsAuthorized, true);
    const capability = down.cookies.get(setupDiagnosticsCookie)!.value;
    assertSetupDiagnostics(capability, env);
    assert.throws(() => assertFullSession(capability, env));
    assert.throws(() => assertSetupDiagnostics(signed.token, env));
    assert.throws(() =>
      assertSetupDiagnostics(capability, {
        ...env,
        BOOTSTRAP_KEY: "f".repeat(64),
      }),
    );
    const tamperedCapability =
      capability.slice(0, -1) + (capability.endsWith("A") ? "B" : "A");
    assert.throws(() => assertSetupDiagnostics(tamperedCapability, env));
    assert.throws(() =>
      assertSetupDiagnostics(capability, {
        ...env,
        BOOTSTRAP_ENABLED: "false",
      }),
    );
    const systemRoute = await import("../src/web/app/api/system-info/route");
    const savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://synthetic:synthetic@127.0.0.1:1/not_used";
    try {
      const diagnosticReport = await systemRoute.GET(
        new NextRequest(config.origin + "/api/system-info", {
          headers: { cookie: `${setupDiagnosticsCookie}=${capability}` },
        }),
      );
      assert.equal(diagnosticReport.status, 200);
      const report = await diagnosticReport.json();
      assert.equal(report.database.state, "unavailable");
      assert.equal(report.database.error.code, "DB_CONNECTION_FAILED");
      assert.ok(report.application.revision);
    } finally {
      process.env.DATABASE_URL = savedUrl;
    }
    assert.equal(preAuthConnections, 1);
    const deniedWrite = await web.POST(
      new NextRequest(config.origin + "/api/bootstrap", {
        method: "POST",
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          cookie: `${setupDiagnosticsCookie}=${capability}`,
        },
        body: JSON.stringify({
          action: "add-admin",
          administrator: {
            name: "Denied",
            email: "denied@example.test",
            canvasUserId: "12345",
          },
        }),
      }),
    );
    assert.equal(deniedWrite.status, 403);
    assert.equal(preAuthConnections, 1);
    assert.match(downBody.message, /Database authentication failed/);
    assert.ok(
      !JSON.stringify(downBody).includes("synthetic unavailable database"),
    );
  } finally {
    (routePool as any).connect = originalConnect;
  }
  console.log(
    "PASS setup GET and invalid-key/cookie requests work without database access; post-key database failures return redacted JSON",
  );
  const oldToken = signed.token;
  const loginResponse = await web.POST(
    new NextRequest(config.origin + "/api/bootstrap", {
      method: "POST",
      headers: {
        origin: config.origin,
        "content-type": "application/json",
        cookie: `${helper.setupCookie}=${oldToken}`,
      },
      body: JSON.stringify({ action: "start", key: env.BOOTSTRAP_KEY }),
    }),
  );
  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(loginResponse.headers.get("set-cookie")!, /Secure/i);
  assert.match(loginResponse.headers.get("set-cookie")!, /SameSite=lax/i);
  assert.ok(!(await loginResponse.text()).includes(env.BOOTSTRAP_KEY!));
  await assert.rejects(service.status(oldToken));
  signed = {
    ...signed,
    token: loginResponse.cookies.get(helper.setupCookie)!.value,
  };
  const request = (body: unknown, origin = config.origin) =>
    new NextRequest(config.origin + "/api/bootstrap", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: `${helper.setupCookie}=${signed.token}`,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await web.POST(
        request(
          { action: "save", settings: { STAFF_SESSION_HOURS: "2" } },
          "https://attacker.example.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await web.GET(new NextRequest(config.origin + "/api/bootstrap"))).status,
    200,
  );
  assert.equal(
    (
      await web.POST(
        request(
          { action: "start", key: env.BOOTSTRAP_KEY },
          "https://attacker.example.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await web.POST(request({ action: "start", key: "bad" }))).status,
    403,
  );
  assert.equal(
    (
      await web.POST(
        request({ action: "link-canvas", contactEmail: "invalid" }),
      )
    ).status,
    400,
  );
  const authenticated = await web.GET(
    new NextRequest(config.origin + "/api/bootstrap", {
      headers: { cookie: `${helper.setupCookie}=${signed.token}` },
    }),
  );
  assert.equal(authenticated.status, 200);
  assert.match(authenticated.headers.get("cache-control")!, /no-store/);
  assert.ok(!(await authenticated.text()).includes(secret));
  const { readSystemInfo } = await import("../src/server/system-info");
  const systemRoute = await import("../src/web/app/api/system-info/route");
  const systemRequest = (cookie = "", headers: Record<string, string> = {}) =>
    new NextRequest(config.origin + "/api/system-info", {
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
    });
  assert.equal((await systemRoute.GET(systemRequest())).status, 401);
  assert.equal(
    (
      await systemRoute.GET(
        systemRequest("", {
          "x-prototype-role": "staff",
          "x-prototype-staff-id": randomUUID(),
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (await systemRoute.GET(systemRequest(`${helper.setupCookie}=${nonce()}`)))
      .status,
    401,
  );
  const systemResponse = await systemRoute.GET(
    systemRequest(`${helper.setupCookie}=${signed.token}`),
  );
  assert.equal(systemResponse.status, 200);
  assert.match(systemResponse.headers.get("cache-control")!, /no-store/);
  const healthy = await systemResponse.json();
  assert.equal(healthy.database.state, "current");
  assert.deepEqual(
    healthy.database.migrations.map((row: { name: string }) => row.name).sort(),
    readdirSync(path.join(__dirname, "../prisma/migrations"))
      .filter((name) => /^\d{3}_[a-z0-9_]+$/.test(name))
      .sort(),
  );
  assert.ok(!JSON.stringify(healthy).includes(env.BOOTSTRAP_KEY!));
  assert.ok(!JSON.stringify(healthy).includes(env.DATABASE_URL!));
  const originalMigration = (
    await pool.query(
      "SELECT * FROM _prisma_migrations WHERE migration_name='026_bootstrap_key'",
    )
  ).rows[0];
  try {
    await pool.query(
      "UPDATE _prisma_migrations SET checksum='synthetic-mismatch' WHERE id=$1",
      [originalMigration.id],
    );
    let report = await readSystemInfo(pool, env);
    assert.equal(
      report.database.migrations.find((row) => row.name === "026_bootstrap_key")
        ?.state,
      "checksum mismatch",
    );
    await pool.query(
      "UPDATE _prisma_migrations SET finished_at=NULL WHERE id=$1",
      [originalMigration.id],
    );
    report = await readSystemInfo(pool, env);
    assert.equal(
      report.database.migrations.find((row) => row.name === "026_bootstrap_key")
        ?.state,
      "failed",
    );
    await pool.query(
      "UPDATE _prisma_migrations SET rolled_back_at=now() WHERE id=$1",
      [originalMigration.id],
    );
    report = await readSystemInfo(pool, env);
    assert.equal(
      report.database.migrations.find((row) => row.name === "026_bootstrap_key")
        ?.state,
      "rolled back",
    );
    await pool.query(
      "UPDATE _prisma_migrations SET migration_name='999_synthetic_future' WHERE id=$1",
      [originalMigration.id],
    );
    report = await readSystemInfo(pool, env);
    assert.equal(
      report.database.migrations.find((row) => row.name === "026_bootstrap_key")
        ?.state,
      "pending",
    );
  } finally {
    await pool.query(
      "UPDATE _prisma_migrations SET migration_name=$1,checksum=$2,finished_at=$3,rolled_back_at=$4 WHERE id=$5",
      [
        originalMigration.migration_name,
        originalMigration.checksum,
        originalMigration.finished_at,
        originalMigration.rolled_back_at,
        originalMigration.id,
      ],
    );
  }
  await pool.query(
    "ALTER TABLE bootstrap_key_limits RENAME TO synthetic_missing_key_limits",
  );
  try {
    const report = await readSystemInfo(pool, env);
    assert.equal(report.database.state, "attention required");
    assert.equal(
      report.database.criticalTables.find(
        (table) => table.name === "bootstrap_key_limits",
      )?.present,
      false,
    );
  } finally {
    await pool.query(
      "ALTER TABLE synthetic_missing_key_limits RENAME TO bootstrap_key_limits",
    );
  }
  const failedPool = {
    connect: async () => {
      throw new Error("private-connection-data");
    },
  } as unknown as Pool;
  const failedReport = await readSystemInfo(failedPool, env);
  assert.equal(failedReport.database.state, "unavailable");
  assert.equal(failedReport.database.error?.code, "DB_CHECK_FAILED");
  const { databaseDiagnostic } = await import("../src/server/database-errors");
  for (const code of [
    "28P01",
    "42501",
    "42P01",
    "42703",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "CERT_HAS_EXPIRED",
  ]) {
    const diagnostic = databaseDiagnostic({
      code,
      message: "private-password-and-connection-string",
    });
    assert.ok(diagnostic);
    assert.ok(!JSON.stringify(diagnostic).includes("private-password"));
  }
  assert.equal(
    databaseDiagnostic({ code: "unknown", message: "private-error" }),
    undefined,
  );
  assert.ok(!JSON.stringify(failedReport).includes("private-connection-data"));
  try {
    let adminRole = false;
    global.fetch = async (input) => {
      const path = String(input);
      return path.endsWith("auth/staff/config")
        ? Response.json({
            mode: "canvas",
            configured: true,
            secureCookies: true,
            portalOrigin: config.origin,
          })
        : Response.json({
            active: true,
            roles: adminRole ? ["staff_admin"] : ["support"],
          });
    };
    assert.equal(
      (
        await systemRoute.GET(
          systemRequest("__Host-ce-staff-session=synthetic-staff"),
        )
      ).status,
      403,
    );
    adminRole = true;
    assert.equal(
      (
        await systemRoute.GET(
          systemRequest("__Host-ce-staff-session=synthetic-staff"),
        )
      ).status,
      200,
    );
  } finally {
    global.fetch = originalFetch;
  }
  console.log(
    "PASS System Info rejects anonymous/non-admin users, supports setup and staff administrators, reports actual migration/table problems, and excludes private configuration",
  );
  const { setupStage } = await import("../src/server/setup-diagnostics");
  for (const [stage, error, expectedReason] of [
    [
      "runtime_load",
      Object.assign(new Error("private path and credentials"), {
        code: "MODULE_NOT_FOUND",
      }),
      "dependency_missing",
    ],
    [
      "runtime_load",
      new TypeError("private exported type and connection data"),
      "runtime_type_error",
    ],
    [
      "setup_control",
      Object.assign(new Error("private database table values"), {
        code: "23502",
      }),
      "database_error",
    ],
  ] as const) {
    try {
      await setupStage(stage, async () => {
        throw error;
      });
      assert.fail("Expected staged failure");
    } catch (error) {
      const failure = helper.setupFailure(error);
      assert.equal(failure.status, 503);
      const body = await failure.json();
      assert.equal(body.stage, stage);
      assert.equal(body.reason, expectedReason);
      assert.ok(!JSON.stringify(body).includes("private "));
    }
  }
  const encryptedSetting = (
    await pool.query(
      "SELECT encrypted_value FROM application_settings WHERE name='CANVAS_STAFF_CLIENT_SECRET'",
    )
  ).rows[0].encrypted_value;
  await pool.query(
    "UPDATE application_settings SET encrypted_value='synthetic-corrupt-ciphertext' WHERE name='CANVAS_STAFF_CLIENT_SECRET'",
  );
  try {
    const failure = await web.GET(
      new NextRequest(config.origin + "/api/bootstrap", {
        headers: { cookie: `${helper.setupCookie}=${signed.token}` },
      }),
    );
    assert.equal(failure.status, 503);
    const body = await failure.json();
    assert.equal(body.stage, "settings_decrypt");
    assert.ok(!JSON.stringify(body).includes(encryptedSetting));
  } finally {
    await pool.query(
      "UPDATE application_settings SET encrypted_value=$1 WHERE name='CANVAS_STAFF_CLIENT_SECRET'",
      [encryptedSetting],
    );
  }
  console.log(
    "PASS setup failures identify safe runtime/database/decryption stages without raw provider errors, paths or secrets",
  );
  const expired = new BootstrapService(pool, {
    ...env,
    BOOTSTRAP_ENABLED: "false",
  });
  await assert.rejects(expired.status(signed.token));
  await pool.query(
    "UPDATE bootstrap_sessions SET authenticated_at=now()-interval '15 minutes'",
  );
  await assert.rejects(
    service.save(signed.token, { STAFF_SESSION_HOURS: "2" }),
    /Enter the setup key/,
  );
  await pool.query(
    "UPDATE bootstrap_sessions SET authenticated_at=now(),expires_at=now()-interval '1 second'",
  );
  await assert.rejects(service.status(signed.token));
  await pool.query(
    "UPDATE bootstrap_sessions SET expires_at=now()+interval '10 minutes'",
  );
  console.log(
    "PASS setup API enforces same-origin writes, private responses, immediate disabling, session expiry and recent reauthentication",
  );
  const draftAdmin = {
    name: "Prepared administrator",
    email: "prepared@example.test",
    canvasUserId: "98765",
  };
  await assert.rejects(service.addAdministrator(nonce(), draftAdmin));
  for (const invalid of [
    null,
    {},
    { ...draftAdmin, canvasUserId: "owner@example.test" },
    { ...draftAdmin, email: "invalid" },
    { ...draftAdmin, name: "" },
    { ...draftAdmin, roles: ["staff_admin"] },
    { ...draftAdmin, canvasUserId: 12345 },
  ])
    await assert.rejects(service.addAdministrator(signed.token, invalid));
  assert.equal(
    (
      await web.POST(
        request(
          { action: "add-admin", administrator: draftAdmin },
          "https://attacker.example.test",
        ),
      )
    ).status,
    403,
  );
  const added = await web.POST(
    request({ action: "add-admin", administrator: draftAdmin }),
  );
  assert.equal(added.status, 200);
  let prepared = (
    await pool.query(
      "SELECT *,roles::text[] AS roles FROM staff_members WHERE email=$1",
      [draftAdmin.email],
    )
  ).rows[0];
  assert.deepEqual(prepared.roles, ["staff_admin"]);
  assert.equal(prepared.external_subject, draftAdmin.canvasUserId);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM staff_sessions WHERE staff_id=$1",
        [prepared.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal((await service.status(signed.token)).handoff.verified, false);
  await assert.rejects(service.complete(signed.token));
  await assert.rejects(
    service.addAdministrator(signed.token, {
      ...draftAdmin,
      email: "different@example.test",
    }),
  );
  await assert.rejects(
    service.addAdministrator(signed.token, {
      ...draftAdmin,
      canvasUserId: "54321",
    }),
  );
  await pool.query("UPDATE staff_members SET active=false WHERE id=$1", [
    prepared.id,
  ]);
  await assert.rejects(service.addAdministrator(signed.token, draftAdmin));
  await pool.query(
    "UPDATE staff_members SET active=true,roles=ARRAY['support']::staff_role[] WHERE id=$1",
    [prepared.id],
  );
  await service.addAdministrator(signed.token, draftAdmin);
  prepared = (
    await pool.query(
      "SELECT *,roles::text[] AS roles FROM staff_members WHERE id=$1",
      [prepared.id],
    )
  ).rows[0];
  assert.ok(
    prepared.roles.includes("staff_admin") &&
      prepared.roles.includes("support"),
  );
  await pool.query(
    "UPDATE bootstrap_sessions SET authenticated_at=now()-interval '11 minutes'",
  );
  await assert.rejects(
    service.addAdministrator(signed.token, draftAdmin),
    /Enter the setup key/,
  );
  await pool.query("UPDATE bootstrap_sessions SET authenticated_at=now()");
  console.log(
    "PASS setup can add a Canvas-ID administrator without provider calls; requires fresh key session, validates fields, preserves roles and refuses identity conflicts/inactive accounts",
  );
  const canvasBrowser = nonce();
  const canvasAuthorization = new URL(
    await service.begin(canvasBrowser, signed.token, "owner@example.test"),
  );
  assert.equal(canvasAuthorization.searchParams.get("scope"), "/auth/userinfo");
  const canvasCallback = new URL(config.origin + "/api/auth/canvas/callback");
  canvasCallback.search = new URLSearchParams({
    state: canvasAuthorization.searchParams.get("state")!,
    code: "synthetic-canvas-code",
  }).toString();
  transport = async (input, options) => {
    assert.equal(
      String(input),
      "https://cedarville.instructure.com/login/oauth2/token",
    );
    const body = new URLSearchParams(String(options?.body));
    assert.equal(body.get("client_secret"), secret);
    return Response.json({
      access_token: null,
      user: { id: 12345, name: "Verified Canvas owner" },
    });
  };
  await assert.rejects(
    service.finishCanvas(canvasCallback, nonce(), signed.token),
  );
  await assert.rejects(
    service.finishCanvas(canvasCallback, canvasBrowser, nonce()),
  );
  await service.finishCanvas(canvasCallback, canvasBrowser, signed.token);
  await assert.rejects(
    service.finishCanvas(canvasCallback, canvasBrowser, signed.token),
  );
  const member = (
    await pool.query(
      "SELECT * FROM staff_members WHERE email='owner@example.test'",
    )
  ).rows[0];
  assert.ok(member.roles.includes("staff_admin"));
  assert.equal(member.external_subject, "12345");
  await assert.rejects(service.complete(signed.token));
  // Simulate the existing Canvas login authority recording a verified normal session.
  // Bootstrap code never creates this record itself.
  await pool.query(
    "INSERT INTO staff_sessions(token_hash,staff_id,auth_provider,external_subject,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
    [hash(nonce()), member.id, member.auth_provider, member.external_subject],
  );
  assert.equal((await service.status(signed.token)).handoff.verified, true);
  // A changed key immediately invalidates previous cookies and OAuth flows.
  const rotated = new BootstrapService(pool, {
    ...env,
    BOOTSTRAP_KEY: nonce()
      .padEnd(64, "a")
      .slice(0, 64)
      .replace(/[^0-9a-f]/gi, "a"),
  });
  await assert.rejects(rotated.status(signed.token));
  await pool.query("DELETE FROM bootstrap_key_limits");
  const { verifyBootstrapKey, assertBootstrapSession, issueBootstrapSession } =
    await import("../src/server/bootstrap-auth");
  const { RequestLimiter } = await import("../src/domain/request-limiter");
  const failedLimiter = new RequestLimiter(1);
  for (let i = 0; i < 20; i++)
    assert.throws(
      () => verifyBootstrapKey("0".repeat(64), env, failedLimiter),
      (error: any) => error.status === 403,
    );
  assert.throws(
    () => verifyBootstrapKey("0".repeat(64), env, failedLimiter),
    (error: any) => error.status === 429,
  );
  // A correct key is not blocked by failed guesses; accepted sign-ins still
  // have the existing shared database-backed limit.
  verifyBootstrapKey(env.BOOTSTRAP_KEY, env, failedLimiter);
  for (let i = 0; i < 20; i++) await service.signIn(env.BOOTSTRAP_KEY);
  await assert.rejects(
    new BootstrapService(pool, env).signIn(env.BOOTSTRAP_KEY),
    (error: any) => error.status === 429,
  );
  const limited = await web.POST(
    request({ action: "start", key: env.BOOTSTRAP_KEY }),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  await pool.query(
    "UPDATE bootstrap_key_limits SET window_started_at=now()-interval '61 seconds'",
  );
  console.log(
    "PASS shared key attempt limits survive new service instances; key changes invalidate sessions",
  );
  const second = await service.signIn(env.BOOTSTRAP_KEY);
  const closing = await Promise.allSettled([
    service.complete(signed.token),
    service.complete(second.token),
  ]);
  assert.equal(
    closing.filter((result) => result.status === "fulfilled").length,
    1,
  );
  await assert.rejects(service.status(signed.token));
  await assert.rejects(service.status(second.token));
  await assert.rejects(service.addAdministrator(second.token, draftAdmin));
  await assert.rejects(
    service.save(second.token, { STAFF_SESSION_HOURS: "2" }),
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM bootstrap_sessions"))
      .rows[0].n,
    0,
  );
  const restarted = new BootstrapService(pool, {
    ...env,
    BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  });
  await assert.rejects(restarted.signIn(env.BOOTSTRAP_KEY));
  assert.equal(await restarted.available(second.token), false);
  assert.equal(
    (await web.GET(new NextRequest(config.origin + "/api/bootstrap"))).status,
    200,
  );
  assert.equal(
    (await web.POST(request({ action: "start", key: env.BOOTSTRAP_KEY })))
      .status,
    403,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM staff_members WHERE id=$1",
        [member.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await readApplicationSettings(pool, env)).CANVAS_STAFF_CLIENT_SECRET,
    secret,
  );
  assert.ok(
    !JSON.stringify(
      (await pool.query("SELECT * FROM audit_events")).rows,
    ).includes(env.BOOTSTRAP_KEY!),
  );
  assert.ok(
    !JSON.stringify(
      await service.status(second.token).catch(() => ({})),
    ).includes(env.BOOTSTRAP_KEY!),
  );
  console.log(
    "PASS verified Canvas administrator handoff gates completion; all setup sessions are revoked and closure survives new instances and expiry changes",
  );
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "Unknown error");
    const frame =
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .find((line) => line.includes("tests/bootstrap.integration.ts"))
        : undefined;
    if (frame) console.error(frame);
    console.error(
      "Bootstrap integration failed; provider bodies and private data withheld.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    if (routePool) await routePool.end();
    await pool.end();
    if (created) await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  });
