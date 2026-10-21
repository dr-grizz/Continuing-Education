import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  sameOrigin,
  staffAuthInfo,
  staffCookie,
} from "../../../server/staff-auth";
import { learnerAuthInfo, learnerCookie } from "../../../server/learner-auth";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  const { path } = await context.params;
  // Broker routes issue sessions and must never be exposed by this generic proxy.
  if (
    path[0]?.toLowerCase() === "auth" ||
    path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))
  )
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  const role = request.headers.get("x-prototype-role") || "learner";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token =
    role === "staff"
      ? process.env.STAFF_API_TOKEN
      : process.env.LEARNER_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  // Staff calls use the configured session mode; current portal roles decide access.
  const staffId = request.cookies.get("ce-demo-staff")?.value;
  if (role === "staff") {
    try {
      const auth = await staffAuthInfo();
      if (auth.mode === "canvas") {
        const session = request.cookies.get(
          authCookieName(staffCookie, auth.secureCookies),
        )?.value;
        if (!session)
          return NextResponse.json(
            { message: "Staff sign-in required." },
            { status: 401 },
          );
        if (request.method !== "GET" && !sameOrigin(request, auth.portalOrigin))
          return NextResponse.json(
            { message: "Same-origin request required." },
            { status: 403 },
          );
        headers["X-Staff-Session"] = session;
      } else {
        if (!staffId)
          return NextResponse.json(
            { message: "Staff sign-in required." },
            { status: 401 },
          );
        headers["X-Prototype-Staff-Id"] = staffId!;
      }
    } catch {
      return NextResponse.json(
        { message: "Staff authentication unavailable." },
        { status: 503 },
      );
    }
  }
  const learnerId = request.cookies.get("ce-demo-learner")?.value;
  let learnerAuthenticated = Boolean(learnerId);
  if (role !== "staff") {
    try {
      const auth = await learnerAuthInfo();
      if (auth.mode === "canvas") {
        const session = request.cookies.get(
          authCookieName(learnerCookie, auth.secureCookies),
        )?.value;
        learnerAuthenticated = Boolean(session);
        if (session) {
          if (
            request.method !== "GET" &&
            !sameOrigin(request, auth.portalOrigin)
          )
            return NextResponse.json(
              { message: "Same-origin request required." },
              { status: 403 },
            );
          headers["X-Learner-Session"] = session;
        }
      } else if (learnerId) headers["X-Prototype-Learner-Id"] = learnerId;
    } catch {
      return NextResponse.json(
        { message: "Learner authentication unavailable." },
        { status: 503 },
      );
    }
  }
  if (
    role !== "staff" &&
    !learnerAuthenticated &&
    (path[0] === "me" ||
      path[0] === "registrations" ||
      path[0] === "operations" ||
      path[0] === "prototype")
  )
    return NextResponse.json(
      { message: "Sign in to continue." },
      { status: 401 },
    );
  const key = request.headers.get("idempotency-key");
  if (key) headers["Idempotency-Key"] = key;
  try {
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: request.method === "GET" ? undefined : await request.text(),
        cache: "no-store",
        redirect: "error",
        // A manual Canvas preview runs within this request, with a bounded
        // 120-second provider budget. Other API calls retain a short timeout.
        signal: AbortSignal.timeout(
          ["staff/canvas/courses", "staff/transactions/reconcile"].includes(
            path.join("/"),
          )
            ? 135_000
            : 10_000,
        ),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The local API is unavailable. Start it with npm run dev." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
