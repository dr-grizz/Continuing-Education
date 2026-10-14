import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  clearCookie,
  cookieOptions,
  flowCookie,
  sameOrigin,
  secureResponse,
  staffAuthInfo,
  staffBackend,
  staffCookie,
} from "../../../server/staff-auth";
const mockCookie = "ce-demo-staff";
const disabled = () =>
  NextResponse.json({ message: "Prototype is disabled." }, { status: 503 });
const unreachable = () =>
  secureResponse(
    NextResponse.json(
      { message: "Staff sign-in is unavailable. Try again." },
      { status: 503 },
    ),
  );

export async function GET(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true") return disabled();
  try {
    const auth = await staffAuthInfo();
    if (request.nextUrl.searchParams.has("directory")) {
      if (auth.mode !== "mock")
        return secureResponse(
          NextResponse.json(
            { message: "Mock staff sign-in is disabled." },
            { status: 403 },
          ),
        );
      const upstream = await staffBackend("prototype/staff-directory");
      return secureResponse(
        NextResponse.json(await upstream.json(), { status: upstream.status }),
      );
    }
    const token = request.cookies.get(
      auth.mode === "canvas"
        ? authCookieName(staffCookie, auth.secureCookies)
        : mockCookie,
    )?.value;
    if (!token || !auth.configured)
      return secureResponse(NextResponse.json({ member: null, auth }));
    const upstream = await staffBackend(
      "staff/me",
      {},
      auth.mode === "canvas" ? token : undefined,
      auth.mode === "mock" ? token : undefined,
    );
    if (upstream.status === 401 || upstream.status === 403) {
      const response = secureResponse(
        NextResponse.json({ member: null, auth }),
      );
      clearCookie(
        response,
        auth.mode === "canvas"
          ? authCookieName(staffCookie, auth.secureCookies)
          : mockCookie,
        auth.secureCookies,
      );
      return response;
    }
    return secureResponse(
      NextResponse.json(
        upstream.ok
          ? { member: await upstream.json(), auth }
          : { message: "Unable to load the staff session." },
        { status: upstream.status },
      ),
    );
  } catch {
    return unreachable();
  }
}
export async function POST(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true") return disabled();
  try {
    const auth = await staffAuthInfo();
    if (auth.mode !== "mock")
      return secureResponse(
        NextResponse.json(
          { message: "Use Canvas to sign in." },
          { status: 403 },
        ),
      );
    const body = await request.json();
    const upstream = await staffBackend("prototype/staff-sessions", {
      method: "POST",
      body: JSON.stringify({ email: body?.email }),
    });
    const data = await upstream.json();
    const response = secureResponse(
      NextResponse.json(data, { status: upstream.status }),
    );
    if (upstream.ok)
      response.cookies.set(mockCookie, data.id, cookieOptions(false, 28800));
    return response;
  } catch {
    return unreachable();
  }
}
export async function DELETE(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true") return disabled();
  try {
    const auth = await staffAuthInfo();
    if (auth.mode === "canvas") {
      if (!sameOrigin(request, auth.portalOrigin))
        return secureResponse(
          NextResponse.json(
            { message: "Same-origin request required." },
            { status: 403 },
          ),
        );
      const upstream = await staffBackend(
        "auth/staff/logout",
        { method: "POST" },
        request.cookies.get(authCookieName(staffCookie, auth.secureCookies))
          ?.value,
      );
      if (!upstream.ok) return unreachable();
    }
    const response = secureResponse(NextResponse.json({ member: null }));
    clearCookie(
      response,
      authCookieName(staffCookie, auth.secureCookies),
      auth.secureCookies,
    );
    clearCookie(
      response,
      authCookieName(flowCookie, auth.secureCookies),
      auth.secureCookies,
    );
    clearCookie(response, mockCookie, false);
    return response;
  } catch {
    return unreachable();
  }
}
