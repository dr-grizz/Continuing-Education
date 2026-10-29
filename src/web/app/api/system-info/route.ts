import { NextRequest, NextResponse } from "next/server";
import {
  setupDiagnosticsCookie,
  assertSetupDiagnostics,
} from "../../../../server/bootstrap-auth";
import { SetupStageError } from "../../../../server/setup-diagnostics";
import { assertBootstrapSession } from "../../../../server/bootstrap-auth";
import {
  authCookieName,
  staffCookie,
  staffBackend,
  staffAuthInfo,
  secureResponse,
} from "../../../server/staff-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  secureResponse(NextResponse.json(data, { status }));
export async function GET(request: NextRequest) {
  if (process.env.PROTOTYPE_MODE !== "true")
    return reply({ message: "System information is unavailable." }, 503);
  let authorized = false,
    verificationUnavailable = false;
  try {
    assertSetupDiagnostics(request.cookies.get(setupDiagnosticsCookie)?.value);
    authorized = true;
  } catch {}
  const setupToken = request.cookies.get("__Host-ce-bootstrap-session")?.value;
  if (!authorized && setupToken) {
    try {
      // Lazy load setup code so a setup module failure cannot break staff diagnostics.
      const { bootstrapService } = await import("../../../server/bootstrap");
      assertBootstrapSession(setupToken);
      const service = await bootstrapService();
      await service.transaction((client) =>
        service.session(client, setupToken),
      );
      authorized = true;
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== 401 && status !== 403) verificationUnavailable = true;
      // Fall back to independent normal staff authorization.
    }
  }
  if (!authorized) {
    const candidate =
      request.cookies.get("__Host-ce-staff-session")?.value ||
      request.cookies.get("ce-staff-session")?.value ||
      request.cookies.get("ce-demo-staff")?.value;
    if (candidate) {
      try {
        const auth = await staffAuthInfo();
        const token = request.cookies.get(
          auth.mode === "canvas"
            ? authCookieName(staffCookie, auth.secureCookies)
            : "ce-demo-staff",
        )?.value;
        if (token && auth.configured) {
          const result = await staffBackend(
            "staff/me",
            {},
            auth.mode === "canvas" ? token : undefined,
            auth.mode === "mock" ? token : undefined,
          );
          if (result.ok) {
            const member = await result.json();
            if (
              !member.active ||
              !Array.isArray(member.roles) ||
              !member.roles.includes("staff_admin")
            )
              return reply(
                { message: "Staff administrator access is required." },
                403,
              );
            authorized = true;
          } else if (result.status !== 401 && result.status !== 403)
            verificationUnavailable = true;
        }
      } catch {
        verificationUnavailable = true;
      }
    }
  }
  if (!authorized)
    return reply(
      {
        message: verificationUnavailable
          ? "Administrator access could not be verified. Check API and database availability."
          : "Sign in as a staff administrator or verify your setup key, then refresh this page.",
      },
      verificationUnavailable ? 503 : 401,
    );
  try {
    const { emptySystemInfo, readSystemInfo } =
      await import("../../../../server/system-info");
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 5000,
      });
      try {
        return reply(await readSystemInfo(pool));
      } finally {
        await pool.end();
      }
    } catch (error) {
      const report = emptySystemInfo();
      const failure = new SetupStageError("runtime_load", error);
      report.database.error = { code: failure.code, message: failure.message };
      return reply(report);
    }
  } catch {
    return reply(
      {
        message:
          "Diagnostic access was verified, but the system report could not be loaded. [SYSTEM_INFO_RUNTIME_LOAD_FAILED]",
      },
      503,
    );
  }
}
