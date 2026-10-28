import { strict as assert } from "node:assert";
import { NextRequest } from "next/server";
import { isPortalRequest, portalOrigin } from "../src/web/server/staff-auth";
import { proxy } from "../src/web/proxy";
import { POST } from "../src/web/app/api/webhooks/stripe/route";
import {
  assertPrototypeRuntime,
  assertHostedDatabase,
  hostedDemoConfig,
} from "../src/domain/hosted-demo";

async function main() {
  const original = { ...process.env };
  const fetchOriginal = global.fetch;
  try {
    delete process.env.WEBSITE_SITE_NAME;
    delete process.env.HOSTED_DEMO;
    assert.equal(proxy(new NextRequest("http://localhost/")).status, 200);
    assert.throws(() =>
      assertPrototypeRuntime({
        NODE_ENV: "production",
        PROTOTYPE_MODE: "true",
      }),
    );
    Object.assign(process.env, {
      HOSTED_DEMO: "true",
      PROTOTYPE_MODE: "true",
      NODE_ENV: "production",
      WEB_URL: "https://demo.example.test",
      DEMO_ACCESS_USERNAME: "demo",
      DEMO_ACCESS_PASSWORD: "a".repeat(48),
      LEARNER_API_TOKEN: "b".repeat(48),
      STAFF_API_TOKEN: "c".repeat(48),
      AUTOMATION_API_TOKEN: "d".repeat(48),
      STRIPE_SECRET_KEY: "",
      API_URL: "http://127.0.0.1:3051",
    });
    const auth = `Basic ${Buffer.from(`demo:${process.env.DEMO_ACCESS_PASSWORD}`).toString("base64")}`;
    const request = (
      path: string,
      method = "GET",
      headers: Record<string, string> = {},
    ) =>
      new NextRequest(`https://demo.example.test${path}`, { method, headers });
    assert.ok(assertPrototypeRuntime());
    assert.throws(() =>
      hostedDemoConfig({ ...process.env, DEMO_ACCESS_PASSWORD: "short" }),
    );
    assert.throws(() =>
      hostedDemoConfig({
        ...process.env,
        DEMO_ACCESS_PASSWORD: "REPLACE_WITH_RANDOM_PASSWORD",
      }),
    );
    assert.throws(() =>
      hostedDemoConfig({ ...process.env, PROTOTYPE_MODE: "false" }),
    );
    assert.throws(() =>
      hostedDemoConfig({ ...process.env, WEB_URL: "http://demo.example.test" }),
    );
    assert.throws(() =>
      hostedDemoConfig({
        ...process.env,
        STRIPE_SECRET_KEY: "sk_live_example",
      }),
    );
    assert.throws(() =>
      hostedDemoConfig({
        ...process.env,
        STAFF_API_TOKEN: process.env.LEARNER_API_TOKEN,
      }),
    );
    assert.throws(() => assertHostedDatabase("postgresql://localhost/db"));
    assert.throws(() =>
      assertHostedDatabase("postgresql://localhost/db?sslmode=disable"),
    );
    assertHostedDatabase("postgresql://db.example.test/db?sslmode=verify-full");
    for (const path of [
      "/",
      "/staff",
      "/api/staff-session",
      "/api/demo-session",
      "/api/offerings",
      "/api/docs",
      "/media/private",
      "/api/badges/public/skills/onet/arbitrary",
      "/credential-tools/issuer.html",
      "/api/badges/admin/skills/catalog",
      "/healthz/extra",
      "/api/webhooks/stripe/extra",
    ])
      assert.equal(proxy(request(path)).status, 401, path);
    for (const path of [
      "/skills",
      "/credential-tools/skills.html",
      "/credential-tools/skills-ui.js",
      "/credential-tools/skills-explorer.js",
      "/credential-tools/skills.css",
      "/credential-tools/awards.css",
      "/credential-tools/issuer.css",
      "/credential-tools/portal-theme.css",
      "/credential-tools/portal-frame.js",
      "/credential-tools/onet-in-it.svg",
      "/api/badges/public/skills/catalog",
      "/api/badges/public/skills/onet/status",
      "/_next/static/test.js",
    ])
      assert.equal(proxy(request(path)).status, 200, path);
    for (const path of [
      "/api/badges/public/skills/search",
      "/api/badges/public/skills/occupations",
      "/api/badges/public/skills/onet/search",
      "/api/badges/public/skills/onet/outlook",
    ]) {
      assert.equal(proxy(request(path, "POST")).status, 403, path);
      assert.equal(
        proxy(request(path, "POST", { origin: "https://attacker.test" }))
          .status,
        403,
        path,
      );
      assert.equal(
        proxy(request(path, "POST", { origin: process.env.WEB_URL! })).status,
        200,
        path,
      );
    }
    assert.equal(
      proxy(request("/", "GET", { authorization: "Basic wrong" })).status,
      401,
    );
    assert.equal(
      proxy(request("/", "GET", { authorization: auth })).status,
      200,
    );
    assert.equal(
      proxy(request("/api/demo-session", "POST", { authorization: auth }))
        .status,
      403,
    );
    assert.equal(
      proxy(
        request("/api/demo-session", "POST", {
          authorization: auth,
          origin: "https://attacker.test",
        }),
      ).status,
      403,
    );
    assert.equal(
      proxy(
        request("/api/demo-session", "POST", {
          authorization: auth,
          origin: process.env.WEB_URL!,
          "sec-fetch-site": "cross-site",
        }),
      ).status,
      403,
    );
    assert.equal(
      proxy(
        request("/api/demo-session", "POST", {
          authorization: auth,
          origin: process.env.WEB_URL!,
        }),
      ).status,
      200,
    );
    assert.equal(proxy(request("/healthz")).status, 200);
    assert.equal(proxy(request("/healthz", "POST")).status, 401);
    assert.equal(proxy(request("/api/webhooks/stripe", "POST")).status, 200);
    assert.equal(proxy(request("/api/webhooks/stripe")).status, 401);
    Object.assign(process.env, {
      DEMO_ACCESS_GATE: "none",
      STAFF_AUTH_MODE: "canvas",
      LEARNER_AUTH_MODE: "canvas",
    });
    assert.equal(proxy(request("/")).status, 200);
    assert.equal(
      proxy(request("/course-images/data-analysis-hd.jpg")).status,
      200,
    );
    assert.equal(proxy(request("/")).headers.get("www-authenticate"), null);
    assert.equal(proxy(request("/api/demo-session", "POST")).status, 403);
    assert.throws(() =>
      hostedDemoConfig({ ...process.env, LEARNER_AUTH_MODE: "mock" }),
    );
    assert.throws(() =>
      hostedDemoConfig({ ...process.env, STAFF_AUTH_MODE: "mock" }),
    );
    const internal = new NextRequest(
      "http://0.0.0.0:8080/api/auth/canvas/start",
      { headers: { host: "demo.example.test", "x-forwarded-proto": "https" } },
    );
    assert.equal(portalOrigin(internal), "https://demo.example.test");
    assert.equal(isPortalRequest(internal, "https://demo.example.test"), true);
    assert.equal(
      isPortalRequest(
        new NextRequest("http://0.0.0.0:8080/", {
          headers: {
            host: "attacker.test",
            "x-forwarded-host": "demo.example.test",
            "x-forwarded-proto": "https",
          },
        }),
        "https://demo.example.test",
      ),
      false,
    );
    assert.equal(
      isPortalRequest(
        new NextRequest("http://0.0.0.0:8080/", {
          headers: { host: "demo.example.test", "x-forwarded-proto": "http" },
        }),
        "https://demo.example.test",
      ),
      false,
    );
    delete process.env.DEMO_ACCESS_GATE;
    Object.assign(process.env, {
      STAFF_AUTH_MODE: "mock",
      LEARNER_AUTH_MODE: "mock",
    });
    delete process.env.DEMO_ACCESS_PASSWORD;
    assert.equal(proxy(request("/")).status, 503);
    delete process.env.HOSTED_DEMO;
    process.env.WEBSITE_SITE_NAME = "azure-demo";
    assert.equal(proxy(request("/")).status, 503);
    console.log(
      "PASS hosted runtime, fail-closed gate, all-path protection and CSRF boundaries",
    );

    process.env.PROTOTYPE_MODE = "true";
    const body = '{ "signed": "keep  exact bytes" }\n';
    global.fetch = async (input, init) => {
      assert.equal(
        String(input),
        "http://127.0.0.1:3051/api/v1/webhooks/stripe",
      );
      assert.equal(Buffer.from(init!.body as Uint8Array).toString(), body);
      assert.equal(
        (init!.headers as Record<string, string>)["Stripe-Signature"],
        "test-signature",
      );
      assert.equal(
        (init!.headers as Record<string, string>).Authorization,
        undefined,
      );
      return new Response('{"received":true}', { status: 200 });
    };
    assert.equal(
      (
        await POST(
          new NextRequest("https://demo.example.test/api/webhooks/stripe", {
            method: "POST",
            body,
            headers: { "stripe-signature": "test-signature" },
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await POST(
          new NextRequest("https://demo.example.test/api/webhooks/stripe", {
            method: "POST",
            body,
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await POST(
          new NextRequest("https://demo.example.test/api/webhooks/stripe", {
            method: "POST",
            body: "x".repeat(1024 * 1024 + 1),
            headers: { "stripe-signature": "bad" },
          }),
        )
      ).status,
      413,
    );
    global.fetch = async () => {
      throw new Error("offline");
    };
    assert.equal(
      (
        await POST(
          new NextRequest("https://demo.example.test/api/webhooks/stripe", {
            method: "POST",
            body,
            headers: { "stripe-signature": "bad" },
          }),
        )
      ).status,
      503,
    );
    console.log(
      "PASS signed webhook byte preservation, missing signature and upstream failure",
    );
  } finally {
    process.env = original;
    global.fetch = fetchOriginal;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
