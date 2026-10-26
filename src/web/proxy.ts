import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hostedDemoConfig } from "../domain/hosted-demo";
import { limitHostedRequest } from "./server/request-limits";

// Optional audience gate. Public demos require verified Canvas identities.
// Signed Stripe webhooks are exempt from browser-origin checks.
export function proxy(request: NextRequest) {
  let demo;
  try {
    demo = hostedDemoConfig();
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
