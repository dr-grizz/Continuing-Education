import { isHostedRuntime } from "../domain/hosted-demo";
import { createHash } from "node:crypto";
import {
  courseReadsEnabled,
  courseScopes,
  tokenEncryptionKey,
} from "./canvas-course-config";

export function staffAuthMode(env = process.env): "mock" | "canvas" {
  const mode = env.STAFF_AUTH_MODE || "mock";
  if (mode !== "mock" && mode !== "canvas")
    throw new Error("STAFF_AUTH_MODE must be mock or canvas.");
  return mode;
}

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Canvas staff sign-in.`);
  return value;
}

function url(value: string, name: string, localCallback = false) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    (parsed.protocol !== "https:" &&
      !(localCallback && loopback && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  )
    throw new Error(
      `${name} must use HTTPS without credentials, query or fragment (HTTP callback allowed only on loopback).`,
    );
  return parsed;
}

export function canvasStaffOrigin(env = process.env) {
  const base = url(required(env, "CANVAS_BASE_URL"), "CANVAS_BASE_URL");
  if (base.pathname !== "/")
    throw new Error("CANVAS_BASE_URL must contain only the Canvas origin.");
  return base.origin;
}
export function staffLookupAccountId(env = process.env) {
  const account = env.CANVAS_STAFF_LOOKUP_ACCOUNT_ID?.trim();
  if (!account) return null;
  if (!/^[1-9][0-9]{0,19}$/.test(account))
    throw new Error("Invalid Canvas staff lookup account ID.");
  return account;
}
export function canvasStaffConfig(env = process.env) {
  const base = new URL(canvasStaffOrigin(env));
  const clientId = required(env, "CANVAS_STAFF_CLIENT_ID");
  const clientSecret = required(env, "CANVAS_STAFF_CLIENT_SECRET");
  const redirect = url(
    required(env, "CANVAS_STAFF_REDIRECT_URI"),
    "CANVAS_STAFF_REDIRECT_URI",
    true,
  );
  if (redirect.pathname !== "/api/auth/canvas/callback")
    throw new Error(
      "CANVAS_STAFF_REDIRECT_URI must use /api/auth/canvas/callback.",
    );
  const endpoint = (name: string, path: string) => {
    const result = url(env[name]?.trim() || new URL(path, base).href, name);
    if (result.origin !== base.origin)
      throw new Error(`${name} must use the configured Canvas origin.`);
    return result.href;
  };
  const authorizationUrl = endpoint(
    "CANVAS_STAFF_AUTHORIZE_URL",
    "/login/oauth2/auth",
  );
  const tokenUrl = endpoint("CANVAS_STAFF_TOKEN_URL", "/login/oauth2/token");
  const hours = Number(env.STAFF_SESSION_HOURS || "8");
  if (!Number.isInteger(hours) || hours < 1 || hours > 24)
    throw new Error("STAFF_SESSION_HOURS must be an integer from 1 to 24.");
  const forceLogin = env.CANVAS_STAFF_FORCE_LOGIN || "false";
  if (!["true", "false"].includes(forceLogin))
    throw new Error("CANVAS_STAFF_FORCE_LOGIN must be true or false.");
  const userAgent =
    env.CANVAS_USER_AGENT?.trim() || "Cedarville-CE-Portal/0.1.0";
  if (!/^[\x20-\x7e]{1,256}$/.test(userAgent))
    throw new Error(
      "CANVAS_USER_AGENT must contain 1 to 256 printable ASCII characters.",
    );
  const courseReads = courseReadsEnabled(env);
  const lookupAccountId = staffLookupAccountId(env);
  const apiReads = courseReads || Boolean(lookupAccountId);
  if (apiReads) tokenEncryptionKey(env);
  const scopes = apiReads
    ? [
        ...(courseReads ? courseScopes(env) : []),
        ...(lookupAccountId
          ? ["url:GET|/api/v1/accounts/:account_id/users"]
          : []),
      ]
    : ["/auth/userinfo"];
  return {
    provider: `canvas:${base.origin}`,
    clientId,
    clientSecret,
    authorizationUrl,
    tokenUrl,
    userAgent,
    redirectUri: redirect.href,
    portalOrigin: redirect.origin,
    secureCookies: redirect.protocol === "https:",
    sessionHours: hours,
    forceLogin: forceLogin === "true",
    courseReads,
    apiReads,
    lookupAccountId,
    scopes,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          base.origin,
          clientId,
          authorizationUrl,
          tokenUrl,
          redirect.href,
          scopes,
        ]),
      )
      .digest("hex"),
  };
}

export function staffAuthInfo() {
  const mode = staffAuthMode();
  if (mode === "mock")
    return {
      mode,
      configured: true,
      secureCookies: isHostedRuntime(),
      portalOrigin: isHostedRuntime()
        ? new URL(process.env.WEB_URL!).origin
        : null,
    };
  try {
    const config = canvasStaffConfig();
    return {
      mode,
      configured: true,
      secureCookies: config.secureCookies,
      portalOrigin: config.portalOrigin,
    };
  } catch {
    // The sign-in screen must work before credentials are supplied. Never expose
    // secret values or fall back to mock sign-in when Canvas is selected.
    return { mode, configured: false, secureCookies: true, portalOrigin: null };
  }
}
