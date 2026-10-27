import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  isPortalRequest,
  portalOrigin,
  cookieOptions,
  flowCookie,
  secureResponse,
  staffAuthInfo,
  staffBackend,
} from "../../../../../server/staff-auth";

export async function GET(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  let origin = portalOrigin(request);
  try {
    const info = await staffAuthInfo();
    if (info.mode !== "canvas" || !info.configured || !info.portalOrigin)
      return secureResponse(
        NextResponse.redirect(
          new URL("/staff?authError=configuration", origin),
          303,
        ),
      );
    origin = info.portalOrigin;
    if (
      !isPortalRequest(request, origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return secureResponse(
        NextResponse.json(
          { message: "Open staff sign-in on the configured portal URL." },
          { status: 403 },
        ),
      );
    const browserNonce = randomBytes(32).toString("base64url");
    const upstream = await staffBackend("auth/staff/canvas/start", {
      method: "POST",
      body: JSON.stringify({ browserNonce }),
    });
    if (!upstream.ok) throw new Error("Sign-in unavailable");
    const data = await upstream.json();
    const response = secureResponse(
      NextResponse.redirect(data.authorizationUrl, 303),
    );
    response.cookies.set(
      authCookieName(flowCookie, info.secureCookies),
      browserNonce,
      cookieOptions(info.secureCookies, 600),
    );
    return response;
  } catch {
    return secureResponse(
      NextResponse.redirect(
        new URL("/staff?authError=unavailable", origin),
        303,
      ),
    );
  }
}
