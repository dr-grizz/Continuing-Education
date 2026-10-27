import { canvasStaffConfig } from "./staff-auth-config";

export function learnerAuthMode(env = process.env): "mock" | "canvas" {
  const mode = env.LEARNER_AUTH_MODE || "mock";
  if (mode !== "mock" && mode !== "canvas")
    throw new Error("LEARNER_AUTH_MODE must be mock or canvas.");
  return mode;
}

export function canvasLearnerConfig(env = process.env) {
  // Reuse the registered client/callback, but never request staff API scopes or
  // require the encryption key used for staff course-read grants.
  return canvasStaffConfig({
    ...env,
    CANVAS_COURSES_ENABLED: "false",
    CANVAS_STAFF_LOOKUP_ACCOUNT_ID: "",
    STAFF_SESSION_HOURS: env.LEARNER_SESSION_HOURS || "8",
  });
}

export function learnerAuthInfo() {
  const mode = learnerAuthMode();
  if (mode === "mock")
    return {
      mode,
      configured: true,
      secureCookies: process.env.HOSTED_DEMO === "true",
      portalOrigin:
        process.env.HOSTED_DEMO === "true"
          ? new URL(process.env.WEB_URL!).origin
          : null,
    };
  try {
    const settings = canvasLearnerConfig();
    return {
      mode,
      configured: true,
      secureCookies: settings.secureCookies,
      portalOrigin: settings.portalOrigin,
    };
  } catch {
    return { mode, configured: false, secureCookies: true, portalOrigin: null };
  }
}
