import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import {
  openCanvasTokens,
  sealCanvasTokens,
} from "../src/server/canvas-tokens";
import {
  readRequestBody,
  RequestBodyError,
} from "../src/web/server/request-body";
import { RequestLimiter, requestPeer } from "../src/web/server/request-limits";
import { proxy } from "../src/web/proxy";
import { enforceCanvasLoginLimit } from "../src/server/canvas-login-limits";
import config from "../src/web/next.config";

async function main() {
  const original = { ...process.env };
  try {
    process.env.CANVAS_TOKEN_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
    const tokens = {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
    };
    const value = sealCanvasTokens(tokens, "owner-a");
    assert.deepEqual(openCanvasTokens(value, "owner-a"), tokens);
    assert.throws(() => openCanvasTokens(value, "owner-b"));
    const [nonce, tag, ciphertext] = value.split(".");
    for (const invalid of [
      `${nonce}.${Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url")}.${ciphertext}`,
      `${nonce}.${tag}.${ciphertext}.extra`,
      `${nonce}.${tag}.${ciphertext}=`,
      `${nonce.slice(1)}.${tag}.${ciphertext}`,
      `${nonce}.${randomBytes(16).toString("base64url")}.${ciphertext}`,
    ])
      assert.throws(() => openCanvasTokens(invalid, "owner-a"));

    const request = (body: string | ReadableStream<Uint8Array>, headers = {}) =>
      new Request("http://localhost/test", {
        method: "POST",
        body,
        headers,
        duplex: "half",
      } as RequestInit);
    assert.equal(
      (await readRequestBody(request("valid"), 5)).toString(),
      "valid",
    );
    const rejects = (status: number) => (error: unknown) =>
      error instanceof RequestBodyError && error.status === status;
    await assert.rejects(
      readRequestBody(request("", { "content-length": "6" }), 5),
      rejects(413),
    );
    let canceled = false;
    await assert.rejects(
      readRequestBody(
        request(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(3));
              c.enqueue(new Uint8Array(3));
            },
            cancel() {
              canceled = true;
            },
          }),
        ),
        5,
      ),
      rejects(413),
    );
    assert.equal(canceled, true);
    await assert.rejects(
      readRequestBody(request(new ReadableStream({})), 5, 10),
      rejects(408),
    );
    // Four stalled reads cannot grow into unbounded concurrent upload buffers.
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const reads = Array.from({ length: 4 }, () =>
      readRequestBody(
        request(
          new ReadableStream({
            start(c) {
              controllers.push(c);
            },
          }),
        ),
        5,
        1000,
      ),
    );
    await assert.rejects(readRequestBody(request("fifth"), 5), rejects(503));
    controllers.forEach((c) => c.close());
    await Promise.all(reads);
    assert.equal(
      (await readRequestBody(request("again"), 5)).toString(),
      "again",
    );

    const limiter = new RequestLimiter(2);
    assert.equal(limiter.consume("a", 1, 0), 0);
    assert.equal(limiter.consume("a", 1, 1), 60);
    assert.equal(limiter.consume("b", 1, 1), 0);
    assert.equal(limiter.consume("c", 1, 1), 60); // full map fails closed
    assert.equal(limiter.consume("c", 1, 60_001), 0); // expired entries reclaimed
    const peerRequest = new NextRequest("https://demo.example.test", {
      headers: { "x-forwarded-for": "1.2.3.4, 192.0.2.10:1234" },
    });
    delete process.env.WEBSITE_SITE_NAME;
    assert.equal(requestPeer(peerRequest), "unattributed");
    Object.assign(process.env, {
      WEBSITE_SITE_NAME: "demo",
      HOSTED_DEMO: "true",
      PROTOTYPE_MODE: "true",
      WEB_URL: "https://demo.example.test",
      DEMO_ACCESS_GATE: "none",
      STAFF_AUTH_MODE: "canvas",
      LEARNER_AUTH_MODE: "canvas",
      LEARNER_API_TOKEN: "a".repeat(48),
      STAFF_API_TOKEN: "b".repeat(48),
      AUTOMATION_API_TOKEN: "c".repeat(48),
      STRIPE_SECRET_KEY: "",
    });
    assert.equal(requestPeer(peerRequest), "192.0.2.10");
    const assertHeaders = (response: Response) => {
      assert.match(
        response.headers.get("content-security-policy")!,
        /frame-ancestors 'self'/,
      );
      assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        response.headers.get("strict-transport-security"),
        "max-age=31536000",
      );
    };
    for (const path of [
      "/",
      "/api/staff-session",
      "/staff",
      "/learning",
      "/settings",
      "/sign-in",
    ]) {
      const response = proxy(
        new NextRequest(`https://demo.example.test${path}`),
      );
      assertHeaders(response);
      if (path !== "/")
        assert.match(
          response.headers.get("cache-control")!,
          /private, no-store/,
        );
    }
    for (const path of [
      "/_next/static/example.js",
      "/course-images/example.jpg",
      "/staffing",
    ]) {
      const response = proxy(
        new NextRequest(`https://demo.example.test${path}`),
      );
      assertHeaders(response);
      assert.equal(response.headers.get("cache-control"), null);
    }
    const editor = proxy(
      new NextRequest("https://demo.example.test/credential-tools/issuer.html"),
    );
    assert.match(
      editor.headers.get("content-security-policy")!,
      /script-src 'self'/,
    );
    assert.equal(editor.headers.get("referrer-policy"), "no-referrer");
    const csrf = proxy(
      new NextRequest("https://demo.example.test/api/staff-session", {
        method: "POST",
      }),
    );
    assert.equal(csrf.status, 403);
    assertHeaders(csrf);
    assert.equal(csrf.headers.get("referrer-policy"), "no-referrer");
    assert.match(csrf.headers.get("cache-control")!, /no-store/);
    process.env.DEMO_ACCESS_GATE = "basic";
    process.env.DEMO_ACCESS_USERNAME = "demo";
    process.env.DEMO_ACCESS_PASSWORD = "e".repeat(48);
    const unauthorized = proxy(new NextRequest("https://demo.example.test/"));
    assert.equal(unauthorized.status, 401);
    assertHeaders(unauthorized);
    process.env.DEMO_ACCESS_GATE = "invalid";
    const unavailable = proxy(new NextRequest("https://demo.example.test/"));
    assert.equal(unavailable.status, 503);
    assertHeaders(unavailable);
    process.env.DEMO_ACCESS_GATE = "none";
    delete process.env.HOSTED_DEMO;
    delete process.env.HOSTED_BETA;
    delete process.env.WEBSITE_SITE_NAME;
    assert.equal(
      proxy(new NextRequest("http://localhost/")).headers.get(
        "strict-transport-security",
      ),
      null,
    );
    process.env.HOSTED_DEMO = "true";
    process.env.WEBSITE_SITE_NAME = "demo";
    for (let i = 0; i < 20; i++)
      assert.equal(
        proxy(
          new NextRequest("https://demo.example.test/api/auth/canvas/start", {
            headers: { "x-forwarded-for": `198.51.100.${i}, 192.0.2.20` },
          }),
        ).status,
        200,
      );
    const limited = proxy(
      new NextRequest("https://demo.example.test/api/auth/canvas/start", {
        headers: { "x-forwarded-for": "203.0.113.5, 192.0.2.20" },
      }),
    );
    assert.equal(
      limited.status,
      200,
      "shared campus IP must not block unrelated Canvas sign-ins",
    );
    for (let i = 0; i < 20; i++)
      enforceCanvasLoginLimit("canvas:https://canvas.example.test", "4242");
    assert.throws(
      () =>
        enforceCanvasLoginLimit("canvas:https://canvas.example.test", "4242"),
      (error: any) => error.getStatus() === 429,
    );
    assert.doesNotThrow(() =>
      enforceCanvasLoginLimit("canvas:https://canvas.example.test", "4243"),
    );
    assert.doesNotThrow(() =>
      enforceCanvasLoginLimit("canvas:https://other.example.test", "4242"),
    );
    delete process.env.HOSTED_DEMO;
    process.env.HOSTED_BETA = "true";
    for (let i = 0; i < 20; i++)
      enforceCanvasLoginLimit(
        "canvas:https://canvas.example.test",
        "beta-user",
      );
    assert.throws(
      () =>
        enforceCanvasLoginLimit(
          "canvas:https://canvas.example.test",
          "beta-user",
        ),
      (error: any) => error.getStatus() === 429,
    );
    assert.doesNotThrow(() =>
      enforceCanvasLoginLimit(
        "canvas:https://canvas.example.test",
        "other-beta-user",
      ),
    );
    delete process.env.HOSTED_BETA;
    process.env.HOSTED_DEMO = "true";
    for (let i = 0; i < 10; i++) {
      const response = proxy(
        new NextRequest(
          "https://demo.example.test/api/registrations/example/checkout",
          {
            method: "POST",
            headers: {
              origin: process.env.WEB_URL!,
              "x-forwarded-for": "192.0.2.30",
              cookie: "__Host-ce-learner-session=synthetic-session",
            },
          },
        ),
      );
      assert.equal(response.status, 200);
    }
    assert.equal(
      proxy(
        new NextRequest(
          "https://demo.example.test/api/registrations/example/checkout",
          {
            method: "POST",
            headers: {
              origin: process.env.WEB_URL!,
              "x-forwarded-for": "192.0.2.30",
              cookie: "__Host-ce-learner-session=synthetic-session",
            },
          },
        ),
      ).status,
      429,
    );
    const rateLimited = proxy(
      new NextRequest(
        "https://demo.example.test/api/registrations/example/checkout",
        {
          method: "POST",
          headers: {
            origin: process.env.WEB_URL!,
            "x-forwarded-for": "192.0.2.30",
            cookie: "__Host-ce-learner-session=synthetic-session",
          },
        },
      ),
    );
    assert.equal(rateLimited.status, 429);
    assertHeaders(rateLimited);
    assert.match(rateLimited.headers.get("cache-control")!, /no-store/);
    let sharedCeilingReached = false;
    for (let i = 1; i <= 121; i++) {
      const response = proxy(
        new NextRequest("https://demo.example.test/api/auth/canvas/start", {
          headers: { "x-forwarded-for": `203.0.113.${i}` },
        }),
      );
      if (response.status === 429) sharedCeilingReached = true;
    }
    assert.equal(
      sharedCeilingReached,
      true,
      "rotating peers cannot bypass the shared ceiling",
    );
    // Payment delivery remains governed by signatures/body limits, not browser quotas.
    assert.equal(
      proxy(
        new NextRequest("https://demo.example.test/api/webhooks/stripe", {
          method: "POST",
        }),
      ).status,
      200,
    );
    const headers = await config.headers!();
    const baseline = headers.find((h) => h.source === "/:path*")!;
    assert.ok(
      baseline.headers.some(
        (h) =>
          h.key === "Content-Security-Policy" &&
          h.value.includes("frame-ancestors 'self'"),
      ),
    );
    assert.ok(
      baseline.headers.some(
        (h) => h.key === "X-Frame-Options" && h.value === "SAMEORIGIN",
      ),
    );
    console.log(
      "PASS truncated/tampered encryption, bounded/slow/concurrent bodies, trusted peer limits, quota recovery, webhook exception and baseline headers",
    );
  } finally {
    process.env = original;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
