import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hostedRuntimeConfig, isHostedRuntime } from "../domain/hosted-demo";
import { limitHostedRequest } from "./server/request-limits";
import {
  hostedHsts,
  privateResponsePath,
  responseSecurityHeaders,
} from "./server/security-headers";

// Optional audience gate. Public demos require verified Canvas identities.
// Signed Stripe webhooks are exempt from browser-origin checks.
function handleRequest(request: NextRequest) {
  let demo;
  try {
    demo = hostedRuntimeConfig();
    if (!demo && process.env.WEBSITE_SITE_NAME)
      throw new Error("Hosted demo is not configured.");
  } catch {
    return new NextResponse("Demo unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!demo) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (
    (path === "/api/webhooks/stripe" && request.method === "POST") ||
    (path === "/healthz" && ["GET", "HEAD"].includes(request.method))
  )
    return NextResponse.next();
  const expected = `Basic ${Buffer.from(`${demo.username}:${demo.password}`).toString("base64")}`;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (
    demo.gate === "basic" &&
    !timingSafeEqual(
      digest(request.headers.get("authorization") || ""),
      digest(expected),
    )
  )
    return new NextResponse("Demo access requires a username and password.", {
      status: 401,
      headers: {
        "WWW-Authenticate":
          'Basic realm="Continuing Education demo", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  // Protect browser writes in both public OAuth and gated demo modes.
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    (request.headers.get("origin") !== demo.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    return new NextResponse("Same-origin request required.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  const retry = limitHostedRequest(request);
  if (retry)
    return new NextResponse("Too many requests. Try again shortly.", {
      status: 429,
      headers: { "Retry-After": String(retry), "Cache-Control": "no-store" },
    });
  const response = NextResponse.next();
  if (demo.gate === "basic")
    response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

// Apply to every branch, including proxy-generated 401/403/429/503 responses.
export function proxy(request: NextRequest) {
  const response = handleRequest(request);
  const path = request.nextUrl.pathname;
  for (const [key, value] of Object.entries(responseSecurityHeaders(path)))
    response.headers.set(key, value);
  if (isHostedRuntime())
    response.headers.set("Strict-Transport-Security", hostedHsts);
  if (privateResponsePath(path) || response.status >= 400)
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}
