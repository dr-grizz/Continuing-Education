import { NextRequest, NextResponse } from "next/server";
import { completeLearnerLogin } from "../../../../../server/learner-auth";
import { completeBootstrapCanvas } from "../../../../../server/bootstrap";
import {
  authCookieName,
  isPortalRequest,
  portalOrigin,
  clearCookie,
  cookieOptions,
  flowCookie,
  secureResponse,
  staffAuthInfo,
  staffBackend,
  staffCookie,
} from "../../../../../server/staff-auth";

export async function GET(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  // Purpose is bound to a separate single-use state record and browser nonce.
  // Neither flow can consume the other's state or create the other's session.
  if (request.nextUrl.searchParams.get("state")?.startsWith("bootstrap."))
    return completeBootstrapCanvas(request);
  if (request.nextUrl.searchParams.get("state")?.startsWith("learner."))
    return completeLearnerLogin(request);
  let origin = portalOrigin(request);
  let secure = true;
  const redirect = (error?: string) => {
    const response = secureResponse(
      NextResponse.redirect(
        new URL(error ? `/staff?authError=${error}` : "/staff", origin),
        303,
      ),
    );
    clearCookie(response, authCookieName(flowCookie, secure), secure);
    return response;
  };
  try {
    const info = await staffAuthInfo();
    secure = info.secureCookies;
    if (info.mode !== "canvas" || !info.configured || !info.portalOrigin)
      return redirect("configuration");
    origin = info.portalOrigin;
    const params = request.nextUrl.searchParams;
    const browserNonce = request.cookies.get(
      authCookieName(flowCookie, secure),
    )?.value;
    if (
      !isPortalRequest(request, origin) ||
      !browserNonce ||
      !params.get("state") ||
      ["state", "code", "error"].some((name) => params.getAll(name).length > 1)
    )
      return redirect("invalid");
    const upstream = await staffBackend("auth/staff/canvas/callback", {
      method: "POST",
      body: JSON.stringify({
        state: params.get("state"),
        browserNonce,
        ...(params.has("code") ? { code: params.get("code") } : {}),
        ...(params.has("error") ? { error: params.get("error") } : {}),
        ...(request.cookies.get(authCookieName(staffCookie, secure))?.value
          ? {
              previousSession: request.cookies.get(
                authCookieName(staffCookie, secure),
              )!.value,
            }
          : {}),
      }),
    });
    if (!upstream.ok)
      return redirect(
        upstream.status === 429
          ? "rate_limited"
          : upstream.status === 403
            ? "unauthorized"
            : upstream.status === 503
              ? "unavailable"
              : params.has("error")
                ? "denied"
                : "invalid",
      );
    const data = await upstream.json();
    const response = redirect();
    response.cookies.set(
      authCookieName(staffCookie, secure),
      data.token,
      cookieOptions(
        secure,
        Math.max(
          0,
          Math.floor((Date.parse(data.expiresAt) - Date.now()) / 1000),
        ),
      ),
    );
    clearCookie(response, "ce-demo-staff", false);
    return response;
  } catch {
    return redirect("unavailable");
  }
}
