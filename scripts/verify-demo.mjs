import "dotenv/config";
import { strict as assert } from "node:assert";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { checkReleaseLinks } from "./release-links.mjs";
const require = createRequire(import.meta.url);
const Stripe = require("stripe");
const stripe = new Stripe("sk_test_local_verification");
const directory = await mkdtemp(path.join(tmpdir(), "ce-demo-runtime-"));
let child;
let badgeData;
let container;
let httpsServer;
let browser;
let logs = "";
const random = () => randomBytes(32).toString("hex");
const url = "http://127.0.0.1:3350";
const runtimeScript =
  process.env.CUCE_VERIFY_START_SCRIPT || "scripts/start-demo.mjs";
const password = random();
const webhookSecret = `whsec_${random()}`;
const badges = process.argv.includes("--badges");
const authorization = `Basic ${Buffer.from(`demo:${password}`).toString("base64")}`;
const env = {
  ...process.env,
  HOSTED_DEMO: "true",
  HOSTED_BETA: "false",
  DEMO_ACCESS_GATE: "basic",
  PROTOTYPE_MODE: "true",
  MIGRATE_ON_START: "false",
  NODE_ENV: "production",
  WEB_URL: "https://localhost:3352",
  DEMO_ACCESS_USERNAME: "demo",
  DEMO_ACCESS_PASSWORD: password,
  LEARNER_API_TOKEN: random(),
  STAFF_API_TOKEN: random(),
  AUTOMATION_API_TOKEN: random(),
  DATABASE_URL: "",
  API_URL: "http://127.0.0.1:3351",
  API_PORT: "3351",
  PORT: "3350",
  STAFF_AUTH_MODE: "mock",
  LEARNER_AUTH_MODE: "mock",
  CANVAS_COURSES_ENABLED: "false",
  BADGES_ENABLED: badges ? "true" : "false",
  BADGE_DEMO_PREVIEW: badges ? "true" : "false",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  NEXT_TELEMETRY_DISABLED: "1",
};
async function waitForReady() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Runtime exited early: ${logs}`);
    try {
      if ((await fetch(`${url}/healthz`)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Runtime readiness timed out: ${logs}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}
function assertSecurityHeaders(response) {
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'self'/,
  );
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
}
try {
  // The clean /tmp directory has no fallback access to the repo's node_modules.
  await cp(
    process.env.CUCE_RELEASE_DIRECTORY || "artifacts/azure-demo",
    directory,
    { recursive: true, verbatimSymlinks: true },
  );
  await checkReleaseLinks(directory);
  // A separate throwaway TLS PostgreSQL instance exercises the hosted guard,
  // compiled Prisma runtime and migrations without touching the local database.
  const certDirectory = path.join(directory, "test-certs");
  await mkdir(certDirectory);
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      path.join(certDirectory, "server.key"),
      "-out",
      path.join(certDirectory, "server.crt"),
    ],
    { stdio: "pipe" },
  );
  container = `ce-demo-runtime-${random().slice(0, 12)}`;
  const dbPassword = random();
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "-p",
      "127.0.0.1::5432",
      "-e",
      `POSTGRES_PASSWORD=${dbPassword}`,
      "-e",
      "POSTGRES_USER=portal",
      "-e",
      "POSTGRES_DB=ce_hosting_test",
      "-v",
      `${certDirectory}:/certs:ro`,
      "postgres:18.6-bookworm",
      "bash",
      "-c",
      "cp /certs/server.key /tmp/server.key && chown postgres /tmp/server.key && chmod 600 /tmp/server.key && exec /usr/local/bin/docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/tmp/server.key",
    ],
    { stdio: "pipe" },
  );
  const mapping = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0].NetworkSettings.Ports["5432/tcp"][0].HostPort;
  for (let i = 0; i < 60; i++) {
    try {
      execFileSync(
        "docker",
        [
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "portal",
          "-d",
          "ce_hosting_test",
        ],
        { stdio: "pipe" },
      );
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const database = new URL(
    `postgresql://portal:${dbPassword}@127.0.0.1:${mapping}/ce_hosting_test`,
  );
  database.searchParams.set("sslmode", "verify-full");
  database.searchParams.set(
    "sslrootcert",
    path.join(certDirectory, "server.crt"),
  );
  // Prisma Migrate uses sslcert for the CA certificate; pg uses sslrootcert.
  database.searchParams.set("sslcert", path.join(certDirectory, "server.crt"));
  env.DATABASE_URL = database.href;
  env.MIGRATION_DATABASE_URL = database.href;
  execFileSync("npm", ["run", "db:migrate"], { env, stdio: "pipe" });
  execFileSync(
    process.execPath,
    [
      "-e",
      'const {db}=require("./dist/src/domain/db.js"); db.query("SELECT 1").then(()=>db.end()).catch(()=>process.exit(1));',
    ],
    { cwd: directory, stdio: "pipe", env },
  );
  console.log(
    "PASS isolated TLS PostgreSQL migration and packaged compiled Prisma/pg query",
  );
  if (badges) {
    badgeData = await mkdtemp(path.join(tmpdir(), "ce-packaged-credentials-"));
    env.BADGE_DATA_DIR = badgeData;
    delete env.BADGE_SERVICE_URL;
    const alias = path.join(badgeData, "release-alias");
    await symlink(directory, alias, "dir");
    for (const unsafe of [directory, alias]) {
      const rejected = spawnSync(process.execPath, [runtimeScript], {
        cwd: directory,
        env: { ...env, BADGE_DATA_DIR: unsafe },
        encoding: "utf8",
        timeout: 5000,
      });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /outside the deployed release directory/);
    }
    await unlink(alias);
  }
  const startRuntime = async () => {
    child = spawn(process.execPath, [runtimeScript], {
      cwd: directory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => (logs += chunk));
    child.stderr.on("data", (chunk) => (logs += chunk));
    await waitForReady();
  };
  await startRuntime();
  if (!badges)
    assert.equal(
      (await fetch(`${env.API_URL}/api/credentials/health`)).status,
      404,
    );
  if (badges) {
    const badgeOrigin = `${env.API_URL}/api/credentials`;
    const health = await fetch(`${badgeOrigin}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).demo, true);
    const data = env.BADGE_DATA_DIR;
    const token = (
      await readFile(path.join(data, "portal-award-token"), "utf8")
    ).trim();
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-CU-Staff-Id": "portal:00000000-0000-4000-8000-000000000901",
      "Content-Type": "application/json",
    };
    assert.equal(
      (
        await fetch(`${badgeOrigin}/api/portal-admin/certificates/catalog`, {
          headers,
        })
      ).status,
      200,
    );
    const { defaultCertificate } =
      await import("../badge-service/certificates.mjs");
    const pdf = await fetch(
      `${badgeOrigin}/api/portal-admin/certificates/preview`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          design: defaultCertificate,
          recipientName: "Synthetic Preview Learner",
        }),
      },
    );
    assert.equal(pdf.status, 200, await pdf.clone().text());
    const result = await pdf.json();
    assert.equal(
      Buffer.from(result.data, "base64").subarray(0, 5).toString(),
      "%PDF-",
    );
    assert.equal(
      (await fetch(`${badgeOrigin}/api/portal-admin/catalog`)).status,
      401,
    );
    const { defaultDesign } = await import("../badge-service/designs.mjs");
    const saved = await fetch(
      `${badgeOrigin}/api/portal-admin/designer/drafts`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          design: { ...defaultDesign, title: "Packaged restart verification" },
        }),
      },
    );
    assert.equal(saved.status, 201);
    const draft = await saved.json();
    const keyBefore = await readFile(
      path.join(data, "issuer-private.pem"),
      "utf8",
    );
    await stop();
    await startRuntime();
    const listing = await fetch(
      `${badgeOrigin}/api/portal-admin/designer/drafts`,
      { headers },
    );
    assert.equal(listing.status, 200);
    assert.ok(
      (await listing.json()).drafts.some((item) => item.id === draft.id),
    );
    assert.equal(
      await readFile(path.join(data, "issuer-private.pem"), "utf8"),
      keyBefore,
    );
    const processList = execFileSync("ps", ["-axo", "pid,ppid,rss,command"], {
      encoding: "utf8",
    });
    const direct = processList
      .split("\n")
      .filter((line) => Number(line.trim().split(/\s+/)[1]) === child.pid);
    assert.equal(direct.length, 2);
    assert.ok(
      !direct.some((line) => line.includes("badge-service/server.mjs")),
    );
    console.log(
      "PASS packaged embedded credentials: PostgreSQL, protected adapter and real portable-Python PDF rendering",
    );
  }
  for (const route of [
    "/",
    "/staff",
    "/api/docs",
    "/api/staff-session",
    "/media/not-a-real-file",
  ]) {
    const denied = await fetch(`${url}${route}`);
    assert.equal(denied.status, 401, route);
    assertSecurityHeaders(denied);
    assert.match(denied.headers.get("cache-control"), /no-store/);
  }
  assert.equal(
    (await fetch(url, { headers: { authorization: "Basic wrong" } })).status,
    401,
  );
  const page = await fetch(url, { headers: { authorization } });
  assert.equal(page.status, 200);
  assert.ok(
    page.headers
      .get("content-security-policy")
      ?.includes("frame-ancestors 'self'"),
  );
  assert.equal(page.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    page.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  const embedded = await fetch(`${url}/credential-tools/issuer.html`, {
    headers: { authorization },
  });
  assert.equal(embedded.status, 200);
  assert.ok(
    embedded.headers
      .get("content-security-policy")
      ?.includes("default-src 'self'"),
  );
  // Exercise the compiled production proxy, not only its unit-test import.
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await fetch(`${url}/api/auth/canvas/start`, {
      headers: { authorization },
      redirect: "manual",
    });
    assert.notEqual(response.status, 429);
  }
  const throttled = await fetch(`${url}/api/auth/canvas/start`, {
    headers: { authorization },
    redirect: "manual",
  });
  assert.equal(throttled.status, 429);
  assertSecurityHeaders(throttled);
  assert.ok(Number(throttled.headers.get("retry-after")) > 0);
  const html = await page.text();
  const asset = html.match(
    /(?:src|href)="([^\"]*\/_next\/static\/[^\"]+)"/,
  )?.[1];
  assert.ok(asset, "home page includes a real static asset");
  // Shared Next assets must load without credentials for the free /skills area.
  // Sensitive pages and APIs above still require the audience gate.
  assert.equal(
    (await fetch(new URL(asset.replaceAll("&amp;", "&"), url))).status,
    200,
  );
  assert.equal(
    (
      await fetch(new URL(asset.replaceAll("&amp;", "&"), url), {
        headers: { authorization },
      })
    ).status,
    200,
  );
  for (const route of [
    "/skills",
    "/credential-tools/skills.html",
    "/credential-tools/skills-ui.js",
    "/credential-tools/skills-explorer.js",
    "/credential-tools/skills.css",
    "/credential-tools/onet-in-it.svg",
    "/credential-tools/awards.css",
    "/credential-tools/portal-theme.css",
    "/credential-tools/portal-frame.js",
  ])
    assert.equal((await fetch(`${url}${route}`)).status, 200, route);
  for (const route of [
    "/api/badges/public/skills/search",
    "/api/badges/public/skills/occupations",
    "/api/badges/public/skills/onet/search",
    "/api/badges/public/skills/onet/outlook",
  ])
    assert.equal(
      (
        await fetch(`${url}${route}`, {
          method: "POST",
          headers: {
            origin: "https://outside.example.test",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
      route,
    );
  for (const route of [
    "/credential-tools/issuer.html",
    "/api/badges/admin/skills/catalog",
  ])
    assert.equal((await fetch(`${url}${route}`)).status, 401, route);
  const docs = await fetch(`${url}/api/docs`, { headers: { authorization } });
  assert.equal(docs.status, 200);
  assert.ok((await docs.json()).openapi);
  assert.equal(
    (
      await fetch(`${url}/api/demo-session`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const session = await fetch(`${url}/api/demo-session`, {
    headers: { authorization },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).auth.mode, "mock");
  assert.equal(
    (await fetch(`${url}/api/webhooks/stripe`, { method: "POST", body: "{}" }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(`${url}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": "invalid" },
        body: "{}",
      })
    ).status,
    400,
  );
  const catalog = await fetch(`${url}/api/offerings`, {
    headers: { authorization },
  });
  assert.equal(catalog.status, 200);
  const login = await fetch(`${url}/api/demo-session`, {
    method: "POST",
    headers: {
      authorization,
      origin: env.WEB_URL,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "hosting-smoke@example.test" }),
  });
  assert.equal(login.status, 201);
  assert.match(login.headers.get("set-cookie"), /Secure/i);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const me = await fetch(`${url}/api/me`, {
    headers: { authorization, cookie },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, "hosting-smoke@example.test");
  const testPayload = JSON.stringify({
    id: "evt_packaged_smoke_test",
    type: "test.event",
    livemode: false,
    data: { object: {} },
  });
  const testSignature = stripe.webhooks.generateTestHeaderString({
    payload: testPayload,
    secret: webhookSecret,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const event = await fetch(`${url}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "stripe-signature": testSignature },
      body: testPayload,
    });
    assert.equal(event.status, 200);
    if (attempt) assert.equal((await event.json()).duplicate, true);
  }
  // A correctly signed live event reaches the signature verifier and is then
  // refused before any database access. Whitespace proves raw-byte forwarding.
  const payload =
    '{ "id": "evt_local_verification", "type": "test.event", "livemode": true, "data": {"object": {}} }\n';
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  const live = await fetch(`${url}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
  assert.equal(live.status, 400);
  assert.match(await live.text(), /Live Stripe events/);
  console.log(
    "PASS isolated packaged runtime: readiness, gate, real static assets, API reference, broker config, CSRF, signed bytes and live-event refusal",
  );
  if (process.argv.includes("--browser")) {
    // Terminate TLS locally to exercise Secure cookies and same-origin writes.
    httpsServer = https.createServer(
      {
        key: await readFile(path.join(certDirectory, "server.key")),
        cert: await readFile(path.join(certDirectory, "server.crt")),
      },
      (request, response) => {
        const upstream = http.request(
          `${url}${request.url}`,
          { method: request.method, headers: request.headers },
          (result) => {
            response.writeHead(result.statusCode, result.headers);
            result.pipe(response);
          },
        );
        upstream.on("error", () => {
          response.writeHead(503);
          response.end();
        });
        request.pipe(upstream);
      },
    );
    await new Promise((resolve) =>
      httpsServer.listen(3352, "127.0.0.1", resolve),
    );
    const { chromium, expect } = require("@playwright/test");
    const AxeBuilder = require("@axe-core/playwright").default;
    browser = await chromium.launch();
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      httpCredentials: { username: "demo", password },
    });
    const page = await context.newPage();
    await page.goto(env.WEB_URL);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await expect(footer).toContainText(`Version ${version}`);
    const revision = process.env.RELEASE_SHA || process.env.GITHUB_SHA || "";
    if (/^[a-f0-9]{7,64}$/i.test(revision))
      await expect(footer).toContainText(revision.slice(0, 7));
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Prototype API documentation" }),
    ).toHaveAttribute("href", "/api/docs");
    await footer.screenshot({ path: "artifacts/footer-desktop.png" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      results.violations.map((item) => item.id),
      [],
    );
    await page.goto(`${env.WEB_URL}/sign-in?authError=rate_limited`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Wait a minute",
    );
    const signInScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      signInScan.violations.map((item) => item.id),
      [],
    );
    await page.goto(env.WEB_URL);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(footer.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
    await footer.screenshot({ path: "artifacts/footer-mobile.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await browser.close();
    browser = undefined;
    await new Promise((resolve) => httpsServer.close(resolve));
    httpsServer = undefined;
    console.log(
      "PASS HTTPS browser: gate credentials, keyboard skip navigation, API reference link, catalog axe scan and 320px reflow (screen reader not reviewed)",
    );
  }
  // Verify the separate beta opt-in against the compiled proxy and API too.
  // Only the authorization redirect is exercised; no Canvas requests are sent.
  await stop();
  Object.assign(env, {
    HOSTED_DEMO: "false",
    HOSTED_BETA: "true",
    DEMO_ACCESS_GATE: "none",
    STAFF_AUTH_MODE: "canvas",
    LEARNER_AUTH_MODE: "canvas",
    CANVAS_BASE_URL: "https://canvas.example.test",
    CANVAS_STAFF_CLIENT_ID: "packaged-beta-test",
    CANVAS_STAFF_CLIENT_SECRET: random(),
    CANVAS_STAFF_REDIRECT_URI: `${env.WEB_URL}/api/auth/canvas/callback`,
    CANVAS_STAFF_LOOKUP_ACCOUNT_ID: "",
    BOOTSTRAP_ENABLED: "true",
    BOOTSTRAP_KEY: random(),
    BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + 60 * 60_000).toISOString(),
    AUTH_SECRET: random(),
  });
  delete env.CANVAS_STAFF_AUTHORIZE_URL;
  delete env.CANVAS_STAFF_TOKEN_URL;
  const startupMigrations = runtimeScript === "scripts/start-production.mjs";
  let migrationSnapshot;
  const databaseSnapshot = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          `
    const {Pool}=require('pg');
    const pool=new Pool({connectionString:process.env.DATABASE_URL});
    (async()=>{
      const history=(await pool.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;
      const offerings=(await pool.query('SELECT id,title FROM offerings ORDER BY id')).rows;
      console.log(JSON.stringify({history,offerings}));
    })().catch(()=>process.exitCode=1).finally(()=>pool.end());
  `,
        ],
        {
          cwd: directory,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    );
  if (startupMigrations) {
    execFileSync(
      "docker",
      ["exec", container, "createdb", "-U", "portal", "ce_startup_test"],
      { stdio: "pipe" },
    );
    const fresh = new URL(env.DATABASE_URL);
    fresh.pathname = "/ce_startup_test";
    env.DATABASE_URL = fresh.href;
    delete env.MIGRATION_DATABASE_URL;
    env.MIGRATE_ON_START = "true";
    for (const override of [
      { HOSTED_DEMO: "true" },
      {
        DATABASE_URL: new URL(
          "postgresql://rejected:rejected@" +
            fresh.host +
            fresh.pathname +
            fresh.search,
        ).href,
      },
    ]) {
      const rejected = spawnSync(process.execPath, [runtimeScript], {
        cwd: directory,
        env: { ...env, ...override },
        encoding: "utf8",
        timeout: 25000,
      });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /Beta database migration failed/);
      assert.ok(!rejected.stderr.includes(fresh.href));
    }
    console.log(
      "PASS startup migration rejects invalid profile and database credentials before service startup",
    );
  }
  await startRuntime();
  if (startupMigrations) {
    migrationSnapshot = databaseSnapshot();
    const committed = (
      await readdir(path.join(directory, "prisma/migrations"))
    ).filter((name) => /^\d{3}_/.test(name));
    assert.equal(migrationSnapshot.history.length, committed.length);
    assert.ok(
      migrationSnapshot.history.every(
        (row) => row.finished_at && !row.rolled_back_at,
      ),
    );
    assert.equal(migrationSnapshot.offerings.length, 6);
    await stop();
    await startRuntime();
    assert.deepEqual(databaseSnapshot(), migrationSnapshot);
    console.log(
      "PASS clean release initializes fresh PostgreSQL before API/web startup; restart preserves migration history and sample data",
    );
  }
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  const setupPage = await fetch(`${url}/setup`);
  assert.equal(setupPage.status, 200);
  assert.match(setupPage.headers.get("cache-control"), /no-store/);
  const setupHeaders = {
    host: new URL(env.WEB_URL).host,
    "x-forwarded-proto": "https",
    origin: env.WEB_URL,
    "content-type": "application/json",
  };
  const setupRequest = (
    method,
    body = "",
    cookie = "",
    requestPath = "/api/bootstrap",
  ) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        `${url}${requestPath}`,
        { method, headers: { ...setupHeaders, ...(cookie ? { cookie } : {}) } },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
                headers: new Headers(
                  Object.entries(response.headers)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [
                      key,
                      Array.isArray(value) ? value.join(", ") : value,
                    ]),
                ),
              }),
            ),
          );
        },
      );
      request.on("error", reject);
      request.end(body);
    });
  assert.equal((await setupRequest("GET")).status, 200);
  assert.equal(
    (
      await setupRequest(
        "POST",
        JSON.stringify({ action: "start", key: "invalid" }),
      )
    ).status,
    403,
  );
  const setupStart = await setupRequest(
    "POST",
    JSON.stringify({ action: "start", key: env.BOOTSTRAP_KEY }),
  );
  assert.equal(setupStart.status, 200);
  assert.deepEqual(await setupStart.json(), {
    ok: true,
    diagnosticsAuthorized: true,
  });
  assert.match(
    setupStart.headers.get("set-cookie"),
    /__Host-ce-bootstrap-session=/,
  );
  assert.match(setupStart.headers.get("set-cookie"), /HttpOnly/);
  assert.match(setupStart.headers.get("set-cookie"), /Secure/);
  const setupSession = setupStart.headers
    .get("set-cookie")
    .match(/__Host-ce-bootstrap-session=[^;]+/)[0];
  assert.equal(
    (await setupRequest("GET", "", "", "/api/system-info")).status,
    401,
  );
  const infoResponse = await setupRequest(
    "GET",
    "",
    setupSession,
    "/api/system-info",
  );
  assert.equal(infoResponse.status, 200);
  assert.match(infoResponse.headers.get("cache-control"), /no-store/);
  const systemReport = await infoResponse.json();
  assert.equal(systemReport.database.state, "current");
  assert.ok(
    systemReport.database.migrations.some(
      (row) => row.name === "026_bootstrap_key" && row.state === "applied",
    ),
  );
  assert.ok(!JSON.stringify(systemReport).includes(env.DATABASE_URL));
  assert.ok(!JSON.stringify(systemReport).includes(env.BOOTSTRAP_KEY));
  const infoPage = await fetch(`${url}/system-info`);
  assert.equal(infoPage.status, 200);
  assert.match(infoPage.headers.get("cache-control"), /no-store/);
  console.log(
    "PASS packaged System Info authorizes setup session, rejects anonymous access, and reports database migrations without secrets",
  );
  const fakeSetup = await setupRequest(
    "GET",
    "",
    `__Host-ce-bootstrap-session=${random()}`,
  );
  assert.equal(fakeSetup.status, 401);
  console.log(
    "PASS standalone setup page/private headers, key-only authorization, secure session cookie and forged-session rejection",
  );
  await stop();
  env.BOOTSTRAP_ENABLED = "false";
  await startRuntime();
  const disabledSetup = await setupRequest("GET");
  assert.equal(disabledSetup.status, 403);
  assert.match(
    (await disabledSetup.json()).message,
    /unavailable|expired|closed/i,
  );
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  console.log(
    "PASS packaged disabled setup responds with private JSON 403 instead of an internal server error",
  );
  const betaPage = await fetch(url);
  assert.equal(betaPage.status, 200);
  assertSecurityHeaders(betaPage);
  assert.equal(betaPage.headers.get("www-authenticate"), null);
  for (const route of [
    "/staff",
    "/learning",
    "/settings",
    "/sign-in",
    "/api/me",
    "/api/staff-session",
  ]) {
    const privatePage = await fetch(`${url}${route}`);
    assert.equal(privatePage.status, route === "/api/me" ? 401 : 200, route);
    assertSecurityHeaders(privatePage);
    assert.match(privatePage.headers.get("cache-control"), /no-store/, route);
  }
  for (const route of [
    "/?tab=courses&q=securitytest",
    "/collections/data-informed-leader",
    "/courses/10000000-0000-4000-8000-000000000001",
    "/api/health",
    "/api/offerings?search=Data",
  ]) {
    const flagged = await fetch(`${url}${route}`);
    assert.ok(
      [200, 401, 404].includes(flagged.status),
      `${route}: ${flagged.status}`,
    );
    assertSecurityHeaders(flagged);
  }
  const cachedAsset = await fetch(new URL(asset.replaceAll("&amp;", "&"), url));
  assert.equal(cachedAsset.status, 200);
  assertSecurityHeaders(cachedAsset);
  assert.match(cachedAsset.headers.get("cache-control"), /public.*immutable/);
  assert.doesNotMatch(cachedAsset.headers.get("cache-control"), /no-store/);
  const betaSession = await fetch(`${url}/api/staff-session`);
  assert.equal(betaSession.status, 200);
  assert.equal((await betaSession.json()).auth.mode, "canvas");
  for (const route of ["/api/staff-session", "/api/demo-session"]) {
    const impersonate = await fetch(`${url}${route}`, {
      method: "POST",
      headers: { origin: env.WEB_URL, "content-type": "application/json" },
      body: JSON.stringify({ email: "hosting-smoke@example.test" }),
    });
    assert.equal(impersonate.status, 403, route);
  }
  for (const route of [
    "/api/auth/canvas/start",
    "/api/auth/learner/canvas/start",
  ]) {
    // Use the raw HTTP client so the synthetic reverse-proxy Host is retained.
    const redirect = await new Promise((resolve, reject) => {
      http
        .get(
          `${url}${route}`,
          {
            headers: {
              host: new URL(env.WEB_URL).host,
              "x-forwarded-proto": "https",
            },
          },
          (response) => {
            response.resume();
            resolve({
              status: response.statusCode,
              headers: new Headers(
                Object.entries(response.headers)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
              ),
            });
          },
        )
        .on("error", reject);
    });
    assert.equal(redirect.status, 303, route);
    assertSecurityHeaders(redirect);
    assert.match(redirect.headers.get("cache-control"), /no-store/);
    assert.equal(redirect.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      new URL(redirect.headers.get("location")).origin,
      env.CANVAS_BASE_URL,
    );
    assert.match(redirect.headers.get("set-cookie"), /__Host-/);
    assert.match(redirect.headers.get("set-cookie"), /Secure/);
  }
  assert.equal(
    (
      await fetch(`${url}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    ).status,
    400,
  );
  console.log(
    "PASS packaged beta: independent startup, Canvas-only identities, HTTPS OAuth redirects/Secure cookies, private learner access and live-event refusal",
  );
  console.log(
    "PASS packaged security headers on pages/API/errors/OAuth, private no-store and immutable public asset caching",
  );
  execFileSync(
    process.execPath,
    [
      "-e",
      `
    const {Pool}=require('pg');const {protectSetting}=require('./dist/src/domain/application-settings.js');
    const pool=new Pool({connectionString:process.env.DATABASE_URL});
    pool.query("INSERT INTO application_settings(name,encrypted_value,updated_by) VALUES($1,$2,$3)",['CANVAS_STAFF_CLIENT_ID',protectSetting('999999','setting:CANVAS_STAFF_CLIENT_ID'),'synthetic-smoke']).catch(()=>process.exitCode=1).finally(()=>pool.end());
  `,
    ],
    { cwd: directory, env, stdio: "pipe" },
  );
  let refreshedClient = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const response = await fetch(
      `${env.API_URL}/api/v1/auth/staff/canvas/start`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.STAFF_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          browserNonce: randomBytes(32).toString("base64url"),
        }),
      },
    );
    if (
      response.ok &&
      new URL((await response.json()).authorizationUrl).searchParams.get(
        "client_id",
      ) === "999999"
    ) {
      refreshedClient = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(refreshedClient, true);
  console.log(
    "PASS encrypted saved settings refresh in the running API without exposing secrets or restarting services",
  );
  // Exercise the real compiled setup route with an unavailable database. The
  // web-only child bypasses app startup solely in this isolated smoke test.
  const faultWeb = spawn(
    process.execPath,
    [path.join(directory, "src/web/server.js")],
    {
      cwd: directory,
      stdio: "ignore",
      env: {
        ...env,
        PORT: "3353",
        HOSTNAME: "127.0.0.1",
        BOOTSTRAP_ENABLED: "true",
        DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/not_used",
      },
    },
  );
  try {
    let faultReady = false;
    for (let i = 0; i < 80; i++) {
      if (faultWeb.exitCode !== null)
        throw new Error("Fault-test web process exited before readiness.");
      try {
        if ((await fetch("http://127.0.0.1:3353/api/health")).ok) {
          faultReady = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(faultReady);
    const faultRequest = (body, requestPath = "/api/bootstrap", cookie = "") =>
      new Promise((resolve, reject) => {
        const request = http.request(
          "http://127.0.0.1:3353" + requestPath,
          {
            method: body ? "POST" : "GET",
            headers: { ...setupHeaders, ...(cookie ? { cookie } : {}) },
          },
          (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () =>
              resolve({
                status: response.statusCode,
                cookies: response.headers["set-cookie"],
                body: JSON.parse(Buffer.concat(chunks).toString()),
              }),
            );
          },
        );
        request.on("error", reject);
        request.end(body ? JSON.stringify(body) : undefined);
      });
    assert.equal((await faultRequest()).status, 200);
    assert.equal(
      (await faultRequest({ action: "start", key: "wrong" })).status,
      403,
    );
    const failure = await faultRequest({
      action: "start",
      key: env.BOOTSTRAP_KEY,
    });
    assert.equal(failure.status, 503);
    assert.equal(failure.body.stage, "database_connect");
    assert.equal(failure.body.diagnosticsAuthorized, true);
    const diagnosticCookie = failure.cookies
      .find((value) => value.startsWith("__Host-ce-setup-diagnostics="))
      .split(";")[0];
    const diagnosticReport = await faultRequest(
      undefined,
      "/api/system-info",
      diagnosticCookie,
    );
    assert.equal(diagnosticReport.status, 200);
    assert.equal(diagnosticReport.body.database.state, "unavailable");
    assert.equal(
      diagnosticReport.body.database.error.code,
      "DB_CONNECTION_FAILED",
    );
    assert.equal(failure.body.code, "DB_CONNECTION_FAILED");
    assert.ok(!JSON.stringify(failure.body).includes("postgresql://"));
    console.log(
      "PASS compiled setup keeps the key form available with the database down and reports a safe post-key database_connect failure",
    );
  } finally {
    if (faultWeb.exitCode === null) {
      const exited = once(faultWeb, "exit");
      faultWeb.kill("SIGTERM");
      await exited;
    }
  }
  const processes = execFileSync("ps", ["-axo", "pid,ppid,rss,command"], {
    encoding: "utf8",
  });
  const children = processes
    .split("\n")
    .filter((line) => Number(line.trim().split(/\s+/)[1]) === child.pid);
  let rss = 0;
  for (const line of children) rss += Number(line.trim().split(/\s+/)[2]);
  console.log(
    `Local API${badges ? " with credentials" : ""} + web RSS after smoke requests: ${Math.ceil(rss / 1024)} MiB (platform overhead and peak load not included).`,
  );
  const api = children.find((line) => line.includes("dist/src/server/main.js"));
  assert.ok(api);
  const exited = once(child, "exit");
  process.kill(Number(api.trim().split(/\s+/)[0]), "SIGTERM");
  assert.equal((await exited)[0], 1);
  await assert.rejects(fetch(`${url}/healthz`));
  console.log("PASS API child failure stops web and supervisor");
} finally {
  if (browser) await browser.close();
  if (httpsServer) await new Promise((resolve) => httpsServer.close(resolve));
  await stop();
  if (container)
    execFileSync("docker", ["rm", "--force", "--volumes", container], {
      stdio: "pipe",
    });
  await rm(directory, { recursive: true, force: true });
  if (badgeData) await rm(badgeData, { recursive: true, force: true });
}
