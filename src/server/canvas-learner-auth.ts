import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { prisma } from "../domain/prisma";
import { canvasSubject, secretDigest } from "./canvas-staff-auth";
import { canvasLearnerConfig, learnerAuthMode } from "./learner-auth-config";

const opaque = /^[A-Za-z0-9_-]{43}$/;
const fresh = () => randomBytes(32).toString("base64url");
export const learnerState = /^learner\.[A-Za-z0-9_-]{43}$/;
export function learnerReturnTo(value: unknown) {
  return typeof value === "string" &&
    (value === "/learning" ||
      /^\/courses\/[0-9a-f-]{36}$/.test(value) ||
      /^\/collections\/[a-z0-9]+(-[a-z0-9]+)*$/.test(value))
    ? value
    : "/learning";
}
function config() {
  if (learnerAuthMode() !== "canvas")
    throw new ForbiddenException("Canvas learner sign-in is disabled.");
  try {
    return canvasLearnerConfig();
  } catch {
    throw new ServiceUnavailableException(
      "Canvas learner sign-in is not configured.",
    );
  }
}

@Injectable()
export class CanvasLearnerAuthService {
  request: typeof fetch = (...args) => fetch(...args);

  async begin(browserNonce: string, returnTo?: string) {
    const settings = config();
    if (!opaque.test(browserNonce))
      throw new BadRequestException("Invalid sign-in request.");
    const state = `learner.${fresh()}`;
    await prisma.learner_oauth_states.deleteMany({
      where: { expires_at: { lte: new Date() } },
    });
    await prisma.learner_oauth_states.create({
      data: {
        state_hash: secretDigest(state),
        browser_hash: secretDigest(browserNonce),
        configuration_hash: settings.fingerprint,
        return_to: learnerReturnTo(returnTo),
        expires_at: new Date(Date.now() + 10 * 60_000),
      },
    });
    const authorization = new URL(settings.authorizationUrl);
    authorization.search = new URLSearchParams({
      client_id: settings.clientId,
      response_type: "code",
      scope: "/auth/userinfo",
      redirect_uri: settings.redirectUri,
      state,
      ...(settings.forceLogin ? { force_login: "1" } : {}),
    }).toString();
    return { authorizationUrl: authorization.href };
  }

  async complete(input: {
    state: string;
    browserNonce: string;
    code?: string;
    error?: string;
    previousSession?: string;
  }) {
    const settings = config();
    if (!learnerState.test(input.state) || !opaque.test(input.browserNonce))
      throw new UnauthorizedException(
        "Sign-in could not be verified. Try again.",
      );
    // Delete and return atomically: even concurrent callbacks consume this state once.
    const states = await prisma.$queryRaw<{ return_to: string }[]>`
      DELETE FROM learner_oauth_states WHERE state_hash=${secretDigest(input.state)}
        AND browser_hash=${secretDigest(input.browserNonce)} AND configuration_hash=${settings.fingerprint}
        AND expires_at > now() RETURNING return_to`;
    if (states.length !== 1)
      throw new UnauthorizedException(
        "Sign-in expired or could not be verified.",
      );
    if (input.error)
      throw new UnauthorizedException(
        "Canvas sign-in was cancelled or denied.",
      );
    if (!input.code || input.code.length > 2048)
      throw new BadRequestException("Canvas did not provide a valid code.");
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
      if (!response.ok) throw new Error("Provider exchange failed");
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        "Unable to complete Canvas sign-in. Try again.",
      );
    }
    if (payload?.access_token !== null || payload?.refresh_token)
      throw new BadRequestException(
        "Canvas did not return an identity-only response.",
      );
    const subject = canvasSubject(payload?.user?.id);
    const name =
      typeof payload.user.name === "string"
        ? payload.user.name.trim().slice(0, 200)
        : "";
    const token = fresh();
    const expiresAt = new Date(
      Date.now() + settings.sessionHours * 60 * 60_000,
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${settings.provider}), hashtext(${subject}))`;
      // No email matching: OAuth userinfo supplies ID/name, not verified email.
      const learner = await tx.learners.upsert({
        where: {
          auth_provider_external_subject: {
            auth_provider: settings.provider,
            external_subject: subject,
          },
        },
        create: {
          auth_provider: settings.provider,
          external_subject: subject,
          display_name: name || "CU learner",
        },
        update: {},
      });
      if (!learner.active)
        throw new ForbiddenException(
          "This learner account is deactivated. Contact the program office.",
        );
      await tx.learner_sessions.deleteMany({
        where: { expires_at: { lte: new Date() } },
      });
      if (input.previousSession && opaque.test(input.previousSession))
        await tx.learner_sessions.deleteMany({
          where: { token_hash: secretDigest(input.previousSession) },
        });
      await tx.learner_sessions.create({
        data: {
          token_hash: secretDigest(token),
          learner_id: learner.id,
          auth_provider: settings.provider,
          external_subject: subject,
          expires_at: expiresAt,
        },
      });
      await tx.audit_events.create({
        data: {
          actor: `learner:${learner.id}`,
          action: "learner.signed_in",
          details: { provider: settings.provider },
        },
      });
    });
    return { token, expiresAt, returnTo: learnerReturnTo(states[0].return_to) };
  }

  async principal(token: unknown) {
    const settings = config();
    if (typeof token !== "string" || !opaque.test(token))
      throw new UnauthorizedException("Learner sign-in required.");
    const session = await prisma.learner_sessions.findUnique({
      where: { token_hash: secretDigest(token) },
      include: { learners: true },
    });
    if (
      !session ||
      session.expires_at <= new Date() ||
      !session.learners.active ||
      session.auth_provider !== settings.provider ||
      session.learners.auth_provider !== session.auth_provider ||
      session.learners.external_subject !== session.external_subject
    )
      throw new UnauthorizedException(
        "Learner session expired or no longer authorized.",
      );
    return {
      actor: `learner:${session.learner_id}`,
      learnerId: session.learner_id,
      scopes: ["learner"],
    };
  }

  async logout(token: unknown) {
    if (typeof token !== "string" || !opaque.test(token)) return;
    await prisma.$transaction(async (tx) => {
      const session = await tx.learner_sessions.findUnique({
        where: { token_hash: secretDigest(token) },
      });
      if (!session) return;
      const deleted = await tx.learner_sessions.deleteMany({
        where: { token_hash: session.token_hash },
      });
      if (deleted.count)
        await tx.audit_events.create({
          data: {
            actor: `learner:${session.learner_id}`,
            action: "learner.signed_out",
            details: {},
          },
        });
    });
  }
}
