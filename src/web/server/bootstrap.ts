import { NextRequest, NextResponse } from "next/server";
import { setupStage, SetupStageError } from "../../server/setup-diagnostics";
import { databaseDiagnostic } from "../../server/database-errors";
import type { BootstrapService } from "../../server/bootstrap-service";
import { SetupError, bootstrapConfig } from "../../server/bootstrap-auth";
import { isPortalRequest, cookieOptions, secureResponse } from "./staff-auth";
import { readRequestBody } from "./request-body";

export const setupCookie = "__Host-ce-bootstrap-session";
export const setupFlowCookie = "__Host-ce-bootstrap-flow";
let service: Promise<BootstrapService> | undefined;
export async function bootstrapService() {
  bootstrapConfig();
  service ??= setupStage("runtime_load", async () => {
    const [pg, server] = await Promise.all([
      import("pg"),
      import("../../server/bootstrap-service"),
    ]);
    return new server.BootstrapService(
      new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 10000,
      }),
    );
  }).catch((error) => {
    service = undefined;
    throw error;
  });
  return service;
}
export function checkSetupOrigin(request: NextRequest, write = false) {
  const config = bootstrapConfig();
  if (
    !isPortalRequest(request, config.origin) ||
    (request.headers.get("sec-fetch-site") === "cross-site" && write) ||
    (write && request.headers.get("origin") !== config.origin)
  )
    throw new SetupError(
      403,
      "Open setup on the configured app and use its controls.",
    );
  return config;
}
export const setupToken = (request: NextRequest) =>
  request.cookies.get(setupCookie)?.value || "";
export function setupJson(data: unknown, status = 200) {
  return secureResponse(NextResponse.json(data, { status }));
}
export function setupFailure(error: unknown, diagnosticsAuthorized = false) {
  const diagnostic =
    error instanceof SetupError ? undefined : databaseDiagnostic(error);
  const response = setupJson(
    {
      ...(diagnosticsAuthorized ? { diagnosticsAuthorized: true } : {}),
      message:
        error instanceof SetupError
          ? error.message
          : diagnostic?.message ||
            "Setup is temporarily unavailable. Ask the administrator to check private configuration and migration readiness.",
      ...(error instanceof SetupStageError
        ? { code: error.code, stage: error.stage, reason: error.reason }
        : diagnostic
          ? { code: diagnostic.code }
          : {}),
    },
    error instanceof SetupError ? error.status : 503,
  );
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
export async function setupBody(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new SetupError(415, "Send a JSON request.");
  try {
    return JSON.parse(
      (await readRequestBody(request, 16 * 1024, 5000)).toString("utf8"),
    );
  } catch {
    throw new SetupError(400, "The setup request is invalid or too large.");
  }
}
export function setupCookieOptions(seconds: number) {
  return cookieOptions(true, seconds);
}

export async function completeBootstrapCanvas(request: NextRequest) {
  let success = false;
  try {
    const config = checkSetupOrigin(request);
    await (
      await bootstrapService()
    ).finishCanvas(
      new URL(request.nextUrl.pathname + request.nextUrl.search, config.origin),
      request.cookies.get(setupFlowCookie)?.value || "",
      setupToken(request),
    );
    success = true;
  } catch {
    /* Provider errors, codes and credentials never reach the response. */
  }
  const response = secureResponse(
    NextResponse.redirect(
      new URL(
        success ? "/setup" : "/setup?error=canvas",
        process.env.WEB_URL || request.nextUrl.origin,
      ),
      303,
    ),
  );
  response.cookies.set(setupFlowCookie, "", setupCookieOptions(0));
  return response;
}
