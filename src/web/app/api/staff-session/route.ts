import { NextRequest, NextResponse } from "next/server";
// Mock staff sign-in (ADR 0004): choose an active demo staff member, no password.
// An SSO add-on replaces POST with a provider callback that sets the same cookie.
const cookie = "ce-demo-staff";
const api = (path: string, init: RequestInit = {}, staffId?: string) =>
  fetch(`${process.env.API_URL || "http://127.0.0.1:3001"}/api/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STAFF_API_TOKEN}`,
      ...(staffId ? { "X-Prototype-Staff-Id": staffId } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
const disabled = () =>
  NextResponse.json({ message: "Prototype is disabled." }, { status: 503 });
const unreachable = () =>
  NextResponse.json(
    { message: "Unable to reach the local API. Try again." },
    { status: 503 },
  );

// GET: the signed-in staff member, or ?directory=1 for the mock sign-in list.
export async function GET(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true") return disabled();
  try {
    if (request.nextUrl.searchParams.get("directory")) {
      const upstream = await api("prototype/staff-directory");
      return NextResponse.json(await upstream.json(), {
        status: upstream.status,
      });
    }
    const staffId = request.cookies.get(cookie)?.value;
    if (!staffId) return NextResponse.json({ member: null });
    const upstream = await api("staff/me", {}, staffId);
    if (upstream.status === 401) {
      // Deactivated or removed staff lose their session.
      const response = NextResponse.json({ member: null });
      response.cookies.delete(cookie);
      return response;
    }
    const data = await upstream.json();
    return NextResponse.json(upstream.ok ? { member: data } : data, {
      status: upstream.status,
    });
  } catch {
    return unreachable();
  }
}
export async function POST(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true") return disabled();
  try {
    const body = await request.json();
    const upstream = await api("prototype/staff-sessions", {
      method: "POST",
      body: JSON.stringify({ email: body?.email }),
    });
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status });
    if (upstream.ok)
      response.cookies.set(cookie, data.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
    return response;
  } catch {
    return unreachable();
  }
}
export async function DELETE() {
  const response = NextResponse.json({ member: null });
  response.cookies.delete(cookie);
  return response;
}
