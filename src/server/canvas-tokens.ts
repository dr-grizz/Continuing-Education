import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { tokenEncryptionKey } from "./canvas-course-config";

export type CanvasTokens = { accessToken: string; refreshToken: string };
function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]{1,8192}$/.test(value);
}
export function parseCanvasTokens(payload: any, fallbackRefresh?: string) {
  const refreshToken = payload?.refresh_token ?? fallbackRefresh;
  if (
    !validToken(payload?.access_token) ||
    !validToken(refreshToken) ||
    !Number.isInteger(payload?.expires_in) ||
    payload.expires_in < 1 ||
    payload.expires_in > 86400
  )
    throw new BadRequestException(
      "Canvas did not return a usable API authorization. Sign in again.",
    );
  return {
    tokens: { accessToken: payload.access_token as string, refreshToken },
    expiresAt: new Date(Date.now() + payload.expires_in * 1000),
  };
}
export function sealCanvasTokens(tokens: CanvasTokens, binding: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), nonce);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}
export function openCanvasTokens(value: string, binding: string): CanvasTokens {
  try {
    const [nonce, tag, encrypted] = value
      .split(".")
      .map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      tokenEncryptionKey(),
      nonce,
    );
    decipher.setAAD(Buffer.from(binding));
    decipher.setAuthTag(tag);
    const result = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        "utf8",
      ),
    );
    if (!validToken(result.accessToken) || !validToken(result.refreshToken))
      throw new Error();
    return result;
  } catch {
    throw new ServiceUnavailableException(
      "Saved Canvas authorization cannot be read. Check the encryption key or sign in again.",
    );
  }
}
export const grantBinding = (
  staffId: string,
  provider: string,
  subject: string,
  fingerprint: string,
) => JSON.stringify([staffId, provider, subject, fingerprint]);
