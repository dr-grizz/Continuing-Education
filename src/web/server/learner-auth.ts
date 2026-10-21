import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  clearCookie,
  cookieOptions,
  secureResponse,
} from "./staff-auth";
export const learnerCookie = "ce-learner-session";
export const learnerFlowCookie = "ce-learner-flow";
export type LearnerAuthInfo = {
  mode: "mock" | "canvas";
  configured: boolean;
  secureCookies: boolean;
  portalOrigin: string | null;
};
export const learnerBackend = (
  path: string,
  init: RequestInit = {},
  token?: string,
) =>
  fetch(`${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
      ...(token ? { "X-Learner-Session": token } : {}),
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
export async function learnerAuthInfo(): Promise<LearnerAuthInfo> {
  const response = await learnerBackend("auth/learner/config");
  if (!response.ok) throw new Error("Learner authentication unavailable.");
  return response.json();
}

export async function completeLearnerLogin(request: NextRequest) {
  let origin = request.nextUrl.origin,
    secure = true;
  const redirect = (error?: string, destination = "/learning") => {
    const response = secureResponse(
      NextResponse.redirect(
        new URL(error ? `/sign-in?authError=${error}` : destination, origin),
        303,
      ),
    );
    clearCookie(response, authCookieName(learnerFlowCookie, secure), secure);
    return response;
  };
  try {
    const info = await learnerAuthInfo();
    secure = info.secureCookies;
    if (info.mode !== "canvas" || !info.configured || !info.portalOrigin)
      return redirect("configuration");
    origin = info.portalOrigin;
    const params = request.nextUrl.searchParams;
    const browserNonce = request.cookies.get(
      authCookieName(learnerFlowCookie, secure),
    )?.value;
    if (
      request.nextUrl.origin !== origin ||
      !browserNonce ||
      !params.get("state") ||
      ["state", "code", "error"].some((name) => params.getAll(name).length > 1)
    )
      return redirect("invalid");
    const upstream = await learnerBackend("auth/learner/canvas/callback", {
      method: "POST",
      body: JSON.stringify({
        state: params.get("state"),
        browserNonce,
        ...(params.has("code") ? { code: params.get("code") } : {}),
        ...(params.has("error") ? { error: params.get("error") } : {}),
        previousSession: request.cookies.get(
          authCookieName(learnerCookie, secure),
        )?.value,
      }),
    });
    if (!upstream.ok)
      return redirect(
        upstream.status === 403
          ? "unauthorized"
          : upstream.status === 503
            ? "unavailable"
            : params.has("error")
              ? "denied"
              : "invalid",
      );
    const data = await upstream.json();
    // Only accept application-owned return destinations, even from the API.
    const destination =
      typeof data.returnTo === "string" &&
      (data.returnTo === "/learning" ||
        /^\/courses\/[0-9a-f-]{36}$/.test(data.returnTo) ||
        /^\/collections\/[a-z0-9]+(-[a-z0-9]+)*$/.test(data.returnTo))
        ? data.returnTo
        : "/learning";
    const response = redirect(undefined, destination);
    response.cookies.set(
      authCookieName(learnerCookie, secure),
      data.token,
      cookieOptions(
        secure,
        Math.max(
          0,
          Math.floor((Date.parse(data.expiresAt) - Date.now()) / 1000),
        ),
      ),
    );
    clearCookie(response, "ce-demo-learner", false);
    return response;
  } catch {
    return redirect("unavailable");
  }
}
