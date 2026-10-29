import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import {
  SetupError,
  verifyBootstrapKey,
  assertBootstrapSession,
  setupDiagnosticsCookie,
  issueSetupDiagnostics,
  assertSetupDiagnostics,
} from "../../../../server/bootstrap-auth";
import {
  bootstrapService,
  checkSetupOrigin,
  setupToken,
  setupCookie,
  setupFlowCookie,
  setupCookieOptions,
  setupJson,
  setupFailure,
  setupBody,
} from "../../../server/bootstrap";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let diagnosticsAuthorized = false;
  try {
    assertSetupDiagnostics(request.cookies.get(setupDiagnosticsCookie)?.value);
    diagnosticsAuthorized = true;
  } catch {}
  try {
    checkSetupOrigin(request);
    if (!setupToken(request))
      return setupJson({ authenticated: false, diagnosticsAuthorized });
    try {
      assertBootstrapSession(setupToken(request));
      return setupJson({
        authenticated: true,
        diagnosticsAuthorized,
        ...(await (await bootstrapService()).status(setupToken(request))),
      });
    } catch (error) {
      if (error instanceof SetupError && error.status === 403)
        return setupJson(
          {
            authenticated: false,
            diagnosticsAuthorized,
            message: "Your setup session expired. Enter the setup key again.",
          },
          401,
        );
      throw error;
    }
  } catch (error) {
    return setupFailure(error, diagnosticsAuthorized);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkSetupOrigin(request, true);
    const body = await setupBody(request);
    if (body?.action === "start") {
      verifyBootstrapKey(body.key);
      const diagnostics = issueSetupDiagnostics();
      const withDiagnostics = (response: ReturnType<typeof setupJson>) => {
        response.cookies.set(
          setupDiagnosticsCookie,
          diagnostics.token,
          setupCookieOptions(
            Math.max(
              0,
              Math.floor((diagnostics.expiresAt.getTime() - Date.now()) / 1000),
            ),
          ),
        );
        return response;
      };
      try {
        const service = await bootstrapService();
        const signed = await service.signIn(body.key, setupToken(request));
        const response = setupJson({ ok: true, diagnosticsAuthorized: true });
        response.cookies.set(
          setupCookie,
          signed.token,
          setupCookieOptions(
            Math.max(
              0,
              Math.floor((signed.expiresAt.getTime() - Date.now()) / 1000),
            ),
          ),
        );
        response.cookies.set(setupFlowCookie, "", setupCookieOptions(0));
        return withDiagnostics(response);
      } catch (error) {
        return withDiagnostics(setupFailure(error, true));
      }
    }
    if (body?.action === "logout") {
      // Clearing the browser cookie is safe even after its signed proof expires.
      try {
        assertBootstrapSession(setupToken(request));
        await (await bootstrapService()).logout(setupToken(request));
      } catch (error) {
        if (!(error instanceof SetupError)) throw error;
      }
      const response = setupJson({ ok: true });
      response.cookies.set(setupCookie, "", setupCookieOptions(0));
      response.cookies.set(setupDiagnosticsCookie, "", setupCookieOptions(0));
      response.cookies.set(setupFlowCookie, "", setupCookieOptions(0));
      return response;
    }
    assertBootstrapSession(setupToken(request));
    const service = await bootstrapService();
    if (body?.action === "link-canvas") {
      const browser = randomBytes(32).toString("base64url");
      const url = await service.begin(
        browser,
        setupToken(request),
        body.contactEmail,
      );
      const response = setupJson({ authorizationUrl: url });
      response.cookies.set(setupFlowCookie, browser, setupCookieOptions(300));
      return response;
    }
    if (body?.action === "save")
      await service.save(setupToken(request), body.settings);
    else if (body?.action === "add-admin")
      await service.addAdministrator(setupToken(request), body.administrator);
    else if (body?.action === "complete")
      await service.complete(setupToken(request));
    else return setupJson({ message: "Unknown setup action." }, 400);
    const response = setupJson({ ok: true });
    if (body.action === "complete") {
      response.cookies.set(setupCookie, "", setupCookieOptions(0));
      response.cookies.set(setupDiagnosticsCookie, "", setupCookieOptions(0));
      response.cookies.set(setupFlowCookie, "", setupCookieOptions(0));
    }
    return response;
  } catch (error) {
    return setupFailure(error);
  }
}
