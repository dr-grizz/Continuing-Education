import { readFile } from "node:fs/promises";
import { readRequestBody, RequestBodyError } from "./request-body";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  staffAuthInfo,
  staffBackend,
  staffCookie,
} from "./staff-auth";

import { learnerAuthInfo, learnerCookie } from "./learner-auth";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const award = `[a-z0-9-]+/${uuid}`;
const root = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.cwd().endsWith(`${path.sep}web`) ? "../.." : ".",
  );
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export class BadgeAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Explicit route inventory: never turn this into an arbitrary authenticated proxy.
export function badgeRoute(method: string, route: string) {
  const get = method === "GET";
  if (get && new RegExp(`^public/${award}$`).test(route)) return "public";
  if (
    get &&
    (route === "me/badges" ||
      new RegExp(`^me/badges/${award}/(download|certificate)$`).test(route))
  )
    return "learner";
  if (
    !get &&
    method === "POST" &&
    new RegExp(`^me/badges/${award}/sharing$`).test(route)
  )
    return "learner";
  if (
    get &&
    /^(admin\/(session|catalog|issuances|awards\/(catalog|history|template\.csv)|certificates\/catalog)|designer\/drafts)$/.test(
      route,
    )
  )
    return "staff";
  if (
    get &&
    (new RegExp(`^admin/issuances/${award}/download$`).test(route) ||
      new RegExp(`^admin/certificates/pdf/${award}$`).test(route) ||
      new RegExp(`^admin/awards/${uuid}(/report\\.csv)?$`).test(route))
  )
    return "staff";
  if (
    method === "POST" &&
    (/^admin\/(versions\/approve|mappings|awards\/preview|certificates\/(templates|preview|create))$/.test(
      route,
    ) ||
      new RegExp(
        `^admin/(versions/${uuid}/archive|mappings/${uuid}/(activate|check|issue)|awards/${uuid}/commit)$`,
      ).test(route) ||
      new RegExp(`^designer/drafts(/${uuid})?$`).test(route))
  )
    return "staff";
  throw new BadgeAccessError(404, "Badge route not found.");
}

async function staffIdentity(request: NextRequest) {
  const auth = await staffAuthInfo();
  const cookie = request.cookies.get(
    auth.mode === "canvas"
      ? authCookieName(staffCookie, auth.secureCookies)
      : "ce-demo-staff",
  )?.value;
  if (!auth.configured || !cookie)
    throw new BadgeAccessError(401, "Staff sign-in required.");
  const response = await staffBackend(
    "staff/me",
    {},
    auth.mode === "canvas" ? cookie : undefined,
    auth.mode === "mock" ? cookie : undefined,
  );
  if (!response.ok)
    throw new BadgeAccessError(
      response.status === 401 || response.status === 403
        ? response.status
        : 503,
      "Staff sign-in could not be verified.",
    );
  const member = await response.json();
  if (
    !member.active ||
    !new RegExp(`^${uuid}$`).test(member.id) ||
    !member.scopes?.includes("badges:manage")
  )
    throw new BadgeAccessError(403, "Badge management permission is required.");
  return `portal:${member.id}`;
}

async function learnerIdentity(request: NextRequest) {
  const auth = await learnerAuthInfo();
  if (!auth.configured || (auth.mode === "canvas" && !auth.portalOrigin))
    throw new BadgeAccessError(
      503,
      "Learner authentication is not configured.",
    );
  const session = request.cookies.get(
    auth.mode === "canvas"
      ? authCookieName(learnerCookie, auth.secureCookies)
      : "ce-demo-learner",
  )?.value;
  if (
    !session ||
    (auth.mode === "mock" && !new RegExp(`^${uuid}$`).test(session))
  )
    throw new BadgeAccessError(401, "Sign in to view your badges.");
  const response = await fetch(
    `${process.env.API_URL || "http://127.0.0.1:3051"}/api/v1/me`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LEARNER_API_TOKEN}`,
        ...(auth.mode === "canvas"
          ? { "X-Learner-Session": session }
          : { "X-Prototype-Learner-Id": session }),
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new BadgeAccessError(
      response.status === 401 || response.status === 403
        ? response.status
        : 503,
      "Learner sign-in could not be verified.",
    );
  const learner = await response.json();
  const id = learner.id;
  if (
    !new RegExp(`^${uuid}$`).test(id) ||
    (auth.mode === "mock" && id !== session)
  )
    throw new BadgeAccessError(403, "Learner identity does not match.");
  const file =
    process.env.BADGE_LEARNER_MAP_FILE ||
    "badge-service/data/portal-learners.json";
  let links: Record<string, string>;
  try {
    links = JSON.parse(
      await readFile(
        /* turbopackIgnore: true */ path.resolve(
          /* turbopackIgnore: true */ root(),
          file,
        ),
        "utf8",
      ),
    );
  } catch {
    throw new BadgeAccessError(
      403,
      "Your badge account has not been linked. Contact portal support.",
    );
  }
  const linked = Object.hasOwn(links, id) && links[id];
  if (typeof linked !== "string" || !/^[a-zA-Z0-9_@.:-]{1,200}$/.test(linked))
    throw new BadgeAccessError(
      403,
      "Your badge account has not been linked. Contact portal support.",
    );
  return linked;
}

async function jsonBody(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new BadgeAccessError(415, "JSON is required.");
  let body;
  try {
    body = JSON.parse(
      (await readRequestBody(request, 6 * 1024 * 1024)).toString("utf8"),
    );
  } catch (error) {
    if (error instanceof RequestBodyError)
      throw new BadgeAccessError(error.status, error.message);
    throw new BadgeAccessError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadgeAccessError(400, "A JSON object is required.");
  // Identity and actor always come from the verified server session.
  delete body.actor;
  delete body.staffId;
  delete body.recipient;
  return body;
}

export async function badgeProxy(request: NextRequest, segments: string[]) {
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: privateHeaders });
  try {
    if (
      process.env.PROTOTYPE_MODE !== "true" ||
      process.env.BADGES_ENABLED !== "true"
    )
      return fail(503, "Badges are not connected. Contact portal support.");
    const route = segments.join("/");
    const role = badgeRoute(request.method, route);
    if (request.method !== "GET") {
      const expected = process.env.WEB_URL
        ? new URL(process.env.WEB_URL).origin
        : request.nextUrl.origin;
      if (
        request.headers.get("origin") !== expected ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return fail(403, "Same-origin request required.");
    }
    const base = new URL(
      process.env.BADGE_SERVICE_URL || "http://127.0.0.1:4178",
    );
    if (
      !["127.0.0.1", "localhost"].includes(base.hostname) ||
      base.protocol !== "http:" ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      return fail(503, "The local badge connection is misconfigured.");
    const headers: Record<string, string> = {};
    let target: string;
    if (role === "staff") {
      headers["X-CU-Staff-Id"] = await staffIdentity(request);
      target = `/api/portal-admin/${route.replace(/^admin\//, "")}`;
    } else if (role === "learner") {
      const id = await learnerIdentity(request);
      target = `/api/learners/${encodeURIComponent(id)}/${route.slice(3)}`;
    } else target = `/api/${route}`;
    if (role !== "public") {
      const data = path.resolve(
        /* turbopackIgnore: true */ root(),
        process.env.BADGE_DATA_DIR || "badge-service/data",
      );
      const token = await readFile(
        /* turbopackIgnore: true */ path.join(
          /* turbopackIgnore: true */
          data,
          role === "staff" ? "portal-award-token" : "portal-token",
        ),
        "utf8",
      );
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    const body =
      request.method === "POST" ? await jsonBody(request) : undefined;
    if (
      role === "learner" &&
      body &&
      (typeof body.shared !== "boolean" ||
        Object.keys(body).some((key) => key !== "shared"))
    )
      return fail(400, "Choose whether to enable sharing.");
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(new URL(target, base), {
      method: request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    const type = response.headers.get("content-type") || "application/json";
    const responseHeaders = {
      ...privateHeaders,
      "Content-Type": type,
      ...(response.headers.get("content-disposition")
        ? {
            "Content-Disposition": response.headers.get("content-disposition")!,
          }
        : {}),
    };
    if (type.includes("application/json")) {
      const data = await response.json();
      // Shared links use the portal origin, not the private badge listener.
      const rewrite = (item: Record<string, unknown>) => {
        if (
          item.shared &&
          typeof item.sourceId === "string" &&
          typeof item.id === "string"
        )
          item.verificationUrl = `${process.env.WEB_URL ? new URL(process.env.WEB_URL).origin : new URL(request.url).origin}/verify/badges/${item.sourceId}/${item.id}`;
      };
      if (role === "learner") {
        if (Array.isArray(data.badges)) data.badges.forEach(rewrite);
        else rewrite(data);
      }
      return NextResponse.json(data, {
        status: response.status,
        headers: responseHeaders,
      });
    }
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof BadgeAccessError)
      return fail(error.status, error.message);
    return fail(
      503,
      "The badge service is unavailable. Refresh before retrying an award.",
    );
  }
}
