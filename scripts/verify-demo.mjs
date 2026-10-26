import "dotenv/config";
import { strict as assert } from "node:assert";
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
import https from "node:https";
import http from "node:http";
const require = createRequire(import.meta.url);
const Stripe = require("stripe");
const stripe = new Stripe("sk_test_local_verification");
const directory = await mkdtemp(path.join(tmpdir(), "ce-demo-runtime-"));
let child;
let container;
let httpsServer;
let browser;
let logs = "";
const random = () => randomBytes(32).toString("hex");
const url = "http://127.0.0.1:3350";
const password = random();
const webhookSecret = `whsec_${random()}`;
const authorization = `Basic ${Buffer.from(`demo:${password}`).toString("base64")}`;
const env = {
  ...process.env,
  HOSTED_DEMO: "true",
  PROTOTYPE_MODE: "true",
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
try {
  // The clean /tmp directory has no fallback access to the repo's node_modules.
  await cp("artifacts/azure-demo", directory, { recursive: true });
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
  child = spawn(process.execPath, ["scripts/start-demo.mjs"], {
    cwd: directory,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  await waitForReady();
  for (const route of [
    "/",
    "/staff",
    "/api/docs",
    "/api/staff-session",
    "/media/not-a-real-file",
  ])
    assert.equal((await fetch(`${url}${route}`)).status, 401, route);
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
  for (let attempt = 0; attempt < 20; attempt++) {
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
  assert.ok(Number(throttled.headers.get("retry-after")) > 0);
  const html = await page.text();
  const asset = html.match(
    /(?:src|href)="([^\"]*\/_next\/static\/[^\"]+)"/,
  )?.[1];
  assert.ok(asset, "home page includes a real static asset");
  assert.equal(
    (await fetch(new URL(asset.replaceAll("&amp;", "&"), url))).status,
    401,
  );
  assert.equal(
    (
      await fetch(new URL(asset.replaceAll("&amp;", "&"), url), {
        headers: { authorization },
      })
    ).status,
    200,
  );
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
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Prototype API documentation" }),
    ).toHaveAttribute("href", "/api/docs");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      results.violations.map((item) => item.id),
      [],
    );
    await page.setViewportSize({ width: 320, height: 800 });
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
  const processes = execFileSync("ps", ["-axo", "pid,ppid,rss,command"], {
    encoding: "utf8",
  });
  const children = processes
    .split("\n")
    .filter((line) => Number(line.trim().split(/\s+/)[1]) === child.pid);
  let rss = 0;
  for (const line of children) rss += Number(line.trim().split(/\s+/)[2]);
  console.log(
    `Local API + web RSS after smoke requests: ${Math.ceil(rss / 1024)} MiB (platform overhead and peak load not included).`,
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
}
