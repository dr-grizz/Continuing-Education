import { NextRequest, NextResponse } from "next/server";

export const staffCookie = "ce-staff-session";
export const flowCookie = "ce-canvas-flow";
// The __Host- prefix prevents sibling subdomains from shadowing HTTPS cookies.
export const authCookieName = (name: string, secure: boolean) =>
  secure ? `__Host-${name}` : name;
export type StaffAuthInfo = {
  mode: "mock" | "canvas";
  configured: boolean;
  secureCookies: boolean;
  portalOrigin: string | null;
};
export const staffBackend = (
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
  mockId?: string,
) =>
  fetch(`${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STAFF_API_TOKEN}`,
      ...(sessionToken ? { "X-Staff-Session": sessionToken } : {}),
      ...(mockId ? { "X-Prototype-Staff-Id": mockId } : {}),
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
export async function staffAuthInfo(): Promise<StaffAuthInfo> {
  const response = await staffBackend("auth/staff/config");
  if (!response.ok) throw new Error("Staff authentication unavailable.");
  return response.json();
}
export function sameOrigin(request: NextRequest, expected: string | null) {
  return Boolean(
    expected &&
    request.headers.get("origin") === expected &&
    request.headers.get("sec-fetch-site") !== "cross-site",
  );
}
export function secureResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export function cookieOptions(secure: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}
export function clearCookie(
  response: NextResponse,
  name: string,
  secure: boolean,
) {
  response.cookies.set(name, "", cookieOptions(secure, 0));
}
