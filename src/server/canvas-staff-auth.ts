import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../domain/prisma";
import { canvasStaffConfig, staffAuthMode } from "./staff-auth-config";
import { scopesFor } from "./roles";
import { enforceCanvasLoginLimit } from "./canvas-login-limits";
import {
  grantBinding,
  parseCanvasTokens,
  sealCanvasTokens,
} from "./canvas-tokens";

export const secretDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = /^[A-Za-z0-9_-]{43}$/;
const freshSecret = () => randomBytes(32).toString("base64url");

function config() {
  if (staffAuthMode() !== "canvas")
    throw new ForbiddenException("Canvas staff sign-in is disabled.");
  try {
    return canvasStaffConfig();
  } catch {
    throw new ServiceUnavailableException(
      "Canvas staff sign-in is not configured.",
    );
  }
}
export function canvasSubject(value: unknown): string {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0))
    throw new BadRequestException("Invalid Canvas identity response.");
  if (!(
    (typeof value === "string" || typeof value === "number") &&
    /^[1-9][0-9]{0,19}$/.test(String(value))
  ))
    throw new BadRequestException("Invalid Canvas identity response.");
  return String(value);
}

@Injectable()
export class CanvasStaffAuthService {
  // Injectable request function makes the provider boundary testable without
  // credentials, a public callback, or any network request to Canvas.
  request: typeof fetch = (...args) => fetch(...args);

  async begin(browserNonce: string) {
    const settings = config();
    if (!opaque.test(browserNonce))
      throw new BadRequestException("Invalid sign-in request.");
    const state = freshSecret();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.staff_oauth_states.deleteMany({
      where: { expires_at: { lte: new Date() } },
    });
    await prisma.staff_oauth_states.create({
      data: {
        state_hash: secretDigest(state),
        browser_hash: secretDigest(browserNonce),
        configuration_hash: settings.fingerprint,
        expires_at: expiresAt,
      },
    });
    const authorization = new URL(settings.authorizationUrl);
    authorization.search = new URLSearchParams({
      client_id: settings.clientId,
      response_type: "code",
      scope: settings.scopes.join(" "),
      redirect_uri: settings.redirectUri,
      state,
      ...(settings.forceLogin ? { force_login: "1" } : {}),
    }).toString();
    return {
      authorizationUrl: authorization.href,
      expiresAt,
      secureCookies: settings.secureCookies,
    };
  }

  async complete(input: {
    state: string;
    browserNonce: string;
    code?: string;
    error?: string;
    previousSession?: string;
  }) {
    const settings = config();
    if (!opaque.test(input.state) || !opaque.test(input.browserNonce))
      throw new UnauthorizedException(
        "Sign-in expired or could not be verified. Try again.",
      );
    // Consume once, before exchanging the code. A replay or concurrent callback
    // cannot establish a second session, even if Canvas is slow/unavailable.
    const consumed = await prisma.staff_oauth_states.deleteMany({
      where: {
        state_hash: secretDigest(input.state),
        browser_hash: secretDigest(input.browserNonce),
        configuration_hash: settings.fingerprint,
        expires_at: { gt: new Date() },
      },
    });
    if (consumed.count !== 1)
      throw new UnauthorizedException(
        "Sign-in expired or could not be verified. Try again.",
      );
    if (input.error)
      throw new UnauthorizedException(
        "Canvas sign-in was cancelled or denied.",
      );
    if (!input.code || input.code.length > 2048)
      throw new BadRequestException(
        "Canvas did not provide a valid sign-in code.",
      );
    let payload: any;
    try {
      const response = await this.request(settings.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": settings.userAgent,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri,
          code: input.code,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Provider refused exchange");
      payload = await response.json();
    } catch {
      // Never forward provider response bodies: they can contain credentials.
      throw new ServiceUnavailableException(
        "Unable to complete Canvas sign-in. Try again.",
      );
    }
    if (
      !settings.apiReads &&
      (payload?.access_token !== null || payload?.refresh_token)
    )
      throw new BadRequestException(
        "Canvas did not return an identity-only response.",
      );
    const subject = canvasSubject(payload?.user?.id);
    enforceCanvasLoginLimit(settings.provider, subject);
    const apiGrant = settings.apiReads ? parseCanvasTokens(payload) : null;
    if (
      settings.apiReads &&
      payload.scope !== undefined &&
      (typeof payload.scope !== "string" ||
        settings.scopes.some(
          (scope) => !payload.scope.split(" ").includes(scope),
        ))
    )
      throw new BadRequestException(
        "Canvas did not grant the required course-read scopes.",
      );
    const token = freshSecret();
    const expiresAt = new Date(
      Date.now() + settings.sessionHours * 60 * 60_000,
    );
    await prisma.$transaction(async (tx) => {
      const member = await tx.staff_members.findUnique({
        where: {
          auth_provider_external_subject: {
            auth_provider: settings.provider,
            external_subject: subject,
          },
        },
      });
      if (!member?.active)
        throw new ForbiddenException(
          "This Canvas account is not authorized for the staff portal.",
        );
      if (
        apiGrant &&
        (scopesFor(member.roles).includes("canvas:read") ||
          scopesFor(member.roles).includes("staff:manage"))
      ) {
        const data = {
          provider: settings.provider,
          subject,
          configuration_hash: settings.fingerprint,
          encrypted_tokens: sealCanvasTokens(
            apiGrant.tokens,
            grantBinding(
              member.id,
              settings.provider,
              subject,
              settings.fingerprint,
            ),
          ),
          expires_at: apiGrant.expiresAt,
          updated_at: new Date(),
        };
        await tx.staff_canvas_grants.upsert({
          where: { staff_id: member.id },
          create: { staff_id: member.id, ...data },
          update: data,
        });
      }
      await tx.staff_sessions.deleteMany({
        where: { expires_at: { lte: new Date() } },
      });
      if (input.previousSession && opaque.test(input.previousSession))
        await tx.staff_sessions.deleteMany({
          where: { token_hash: secretDigest(input.previousSession) },
        });
      await tx.staff_sessions.create({
        data: {
          token_hash: secretDigest(token),
          staff_id: member.id,
          auth_provider: settings.provider,
          external_subject: subject,
          expires_at: expiresAt,
        },
      });
      await tx.audit_events.create({
        data: {
          actor: `staff:${member.id}`,
          action: "staff.signed_in",
          details: { provider: settings.provider },
        },
      });
    });
    // This result is for the trusted web backend only. The browser gets a cookie,
    // never a Canvas token JSON response. API grants stay encrypted on the server.
    return { token, expiresAt, secureCookies: settings.secureCookies };
  }

  async principal(token: unknown) {
    const settings = config();
    if (typeof token !== "string" || !opaque.test(token))
      throw new UnauthorizedException("Staff sign-in required.");
    const session = await prisma.staff_sessions.findUnique({
      where: { token_hash: secretDigest(token) },
      include: { staff_members: true },
    });
    const member = session?.staff_members;
    if (
      !session ||
      session.expires_at <= new Date() ||
      !member?.active ||
      session.auth_provider !== settings.provider ||
      member.auth_provider !== session.auth_provider ||
      member.external_subject !== session.external_subject
    )
      throw new UnauthorizedException(
        "Staff session expired or no longer authorized.",
      );
    return {
      actor: `staff:${member.id}`,
      staffId: member.id,
      scopes: scopesFor(member.roles),
    };
  }

  async logout(token: unknown) {
    if (typeof token !== "string" || !opaque.test(token)) return;
    await prisma.$transaction(async (tx) => {
      const session = await tx.staff_sessions.findUnique({
        where: { token_hash: secretDigest(token) },
      });
      if (!session) return;
      const deleted = await tx.staff_sessions.deleteMany({
        where: { token_hash: session.token_hash },
      });
      if (!deleted.count) return;
      await tx.audit_events.create({
        data: {
          actor: `staff:${session.staff_id}`,
          action: "staff.signed_out",
          details: {},
        },
      });
    });
  }
}
