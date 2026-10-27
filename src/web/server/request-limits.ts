import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

import { RequestLimiter } from "../../domain/request-limiter";
export { RequestLimiter } from "../../domain/request-limiter";

const limiter = new RequestLimiter();
export function requestPeer(request: NextRequest) {
  // Only Azure's appended rightmost address is trusted. Never use a caller's
  // leftmost X-Forwarded-For or arbitrary forwarding headers outside Azure.
  const last = process.env.WEBSITE_SITE_NAME
    ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    : undefined;
  const ip = last?.startsWith("[")
    ? last.slice(1, last.indexOf("]"))
    : last?.replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  return ip && isIP(ip) ? ip : "unattributed";
}

export function limitHostedRequest(request: NextRequest) {
  const oauth = /^\/api\/auth\/(learner\/)?canvas\/start$/.test(
    request.nextUrl.pathname,
  );
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!oauth && !mutation) return 0;
  const group = oauth ? "oauth" : "write";
  // This shared ceiling cannot be bypassed by rotating cookies or client IPs.
  let retry = limiter.consume(`global:${group}`, oauth ? 120 : 240);
  if (retry) return retry;
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  if (oauth) return 0; // Canvas identity is unknown until the verified callback.
  retry = limiter.consume(`${group}:peer:${digest(requestPeer(request))}`, 120);
  if (retry) return retry;
  const session =
    request.cookies.get("__Host-ce-learner-session")?.value ||
    request.cookies.get("__Host-ce-staff-session")?.value;
  if (session) {
    const expensive =
      /\/(checkout|canvas\/courses|reconcile|staff-lookup)(\/|$)/.test(
        request.nextUrl.pathname,
      );
    return limiter.consume(
      `${expensive ? "expensive" : group}:session:${digest(session)}`,
      expensive ? 10 : 60,
    );
  }
  return 0;
}
