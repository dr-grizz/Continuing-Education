import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/** Bounded, process-local windows for the single-instance demo, not a shared store. */
export class RequestLimiter {
  private windows = new Map<string, { count: number; expires: number }>();
  constructor(private readonly capacity = 4096) {}
  consume(key: string, limit: number, now = Date.now(), windowMs = 60_000) {
    let row = this.windows.get(key);
    if (!row || row.expires <= now) {
      for (const [id, item] of this.windows)
        if (item.expires <= now) this.windows.delete(id);
      if (this.windows.size >= this.capacity) return 60;
      row = { count: 0, expires: now + windowMs };
      this.windows.set(key, row);
    }
    if (row.count >= limit)
      return Math.max(1, Math.ceil((row.expires - now) / 1000));
    row.count++;
    return 0;
  }
}

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
  retry = limiter.consume(
    `${group}:peer:${digest(requestPeer(request))}`,
    oauth ? 20 : 120,
  );
  if (retry) return retry;
  const session =
    request.cookies.get("__Host-ce-learner-session")?.value ||
    request.cookies.get("__Host-ce-staff-session")?.value;
  if (session) {
    const expensive = /\/(checkout|canvas\/courses|reconcile)(\/|$)/.test(
      request.nextUrl.pathname,
    );
    return limiter.consume(
      `${expensive ? "expensive" : group}:session:${digest(session)}`,
      expensive ? 10 : 60,
    );
  }
  return 0;
}
