import { NextRequest, NextResponse } from "next/server";
import {
  readRequestBody,
  RequestBodyError,
} from "../../../server/request-body";
import {
  learnerAuthInfo,
  learnerBackend,
  learnerCookie,
} from "../../../server/learner-auth";
import {
  authCookieName,
  clearCookie,
  sameOrigin,
  secureResponse,
} from "../../../server/staff-auth";
const cookie = "ce-demo-learner";
async function session(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  try {
    const auth = await learnerAuthInfo();
    if (auth.mode === "canvas") {
      if (!auth.configured || !auth.portalOrigin)
        return secureResponse(
          NextResponse.json(
            { message: "Learner authentication is not configured.", auth },
            { status: 503 },
          ),
        );
      if (request.method === "POST")
        return secureResponse(
          NextResponse.json(
            { message: "Sign in with your CU account." },
            { status: 403 },
          ),
        );
      const token = request.cookies.get(
        authCookieName(learnerCookie, auth.secureCookies),
      )?.value;
      if (!token)
        return secureResponse(
          NextResponse.json({ id: null, email: null, auth }),
        );
      const upstream = await learnerBackend("me", {}, token);
      if (upstream.status === 401) {
        const response = secureResponse(
          NextResponse.json({ id: null, email: null, auth }),
        );
        clearCookie(
          response,
          authCookieName(learnerCookie, auth.secureCookies),
          auth.secureCookies,
        );
        return response;
      }
      const data = await upstream.json();
      return secureResponse(
        NextResponse.json({ ...data, auth }, { status: upstream.status }),
      );
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
    };
    const id = request.cookies.get(cookie)?.value;
    if (request.method === "GET" && !id)
      return secureResponse(NextResponse.json({ email: null, auth }));
    if (id && request.method === "GET") headers["X-Prototype-Learner-Id"] = id;
    const body =
      request.method === "POST"
        ? JSON.parse(
            (await readRequestBody(request, 16 * 1024)).toString("utf8"),
          )
        : undefined;
    const upstream = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/${body ? "prototype/users" : "me"}`,
      {
        method: body ? "POST" : "GET",
        headers,
        body: body
          ? JSON.stringify({
              email:
                typeof body.email === "string"
                  ? body.email.trim().toLowerCase()
                  : body.email,
            })
          : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await upstream.json();
    const response = secureResponse(
      NextResponse.json({ ...data, auth }, { status: upstream.status }),
    );
    if (upstream.ok && body)
      response.cookies.set(cookie, data.id, {
        httpOnly: true,
        secure: process.env.HOSTED_DEMO === "true",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    if (upstream.status === 401) response.cookies.delete(cookie);
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError)
      return secureResponse(
        NextResponse.json({ message: error.message }, { status: error.status }),
      );
    return NextResponse.json(
      { message: "Unable to reach the local API. Try again." },
      { status: 503 },
    );
  }
}
export const GET = session;
export const POST = session;
export async function DELETE(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return NextResponse.json(
      { message: "Prototype is disabled." },
      { status: 503 },
    );
  try {
    const auth = await learnerAuthInfo();
    if (auth.mode === "canvas") {
      if (!sameOrigin(request, auth.portalOrigin))
        return secureResponse(
          NextResponse.json(
            { message: "Same-origin request required." },
            { status: 403 },
          ),
        );
      const token = request.cookies.get(
        authCookieName(learnerCookie, auth.secureCookies),
      )?.value;
      const upstream = await learnerBackend(
        "auth/learner/logout",
        { method: "POST" },
        token,
      );
      if (!upstream.ok) throw new Error("Logout unavailable");
      const response = secureResponse(
        NextResponse.json({ id: null, email: null, auth }),
      );
      clearCookie(
        response,
        authCookieName(learnerCookie, auth.secureCookies),
        auth.secureCookies,
      );
      response.cookies.delete(cookie);
      return response;
    }
    const response = secureResponse(NextResponse.json({ email: null, auth }));
    response.cookies.delete(cookie);
    return response;
  } catch {
    return secureResponse(
      NextResponse.json(
        { message: "Unable to sign out. Try again." },
        { status: 503 },
      ),
    );
  }
}
