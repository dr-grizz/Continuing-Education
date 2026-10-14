import { createHash } from "node:crypto";

export function courseReadsEnabled(env = process.env) {
  const value = env.CANVAS_COURSES_ENABLED || "false";
  if (!["true", "false"].includes(value))
    throw new Error("CANVAS_COURSES_ENABLED must be true or false.");
  return value === "true";
}
export function includeSubaccounts(env = process.env) {
  const value = env.CANVAS_COURSES_INCLUDE_SUBACCOUNTS || "false";
  if (!["true", "false"].includes(value))
    throw new Error(
      "CANVAS_COURSES_INCLUDE_SUBACCOUNTS must be true or false.",
    );
  return value === "true";
}
export function courseScopes(_env = process.env) {
  return [
    "url:GET|/api/v1/accounts/:id",
    "url:GET|/api/v1/accounts/:account_id/courses",
    "url:GET|/api/v1/courses/:id",
  ];
}
export function tokenEncryptionKey(env = process.env) {
  const encoded = env.CANVAS_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error(
      "CANVAS_TOKEN_ENCRYPTION_KEY must be 32 random bytes in base64.",
    );
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new Error("Invalid CANVAS_TOKEN_ENCRYPTION_KEY.");
  return key;
}
export function courseConnectionConfig(env = process.env) {
  if (!courseReadsEnabled(env) || env.STAFF_AUTH_MODE !== "canvas")
    throw new Error("Canvas course reads are disabled.");
  const accountId = env.CANVAS_COURSES_SUBACCOUNT_ID?.trim() || "";
  if (!/^[1-9][0-9]{0,19}$/.test(accountId))
    throw new Error(
      "CANVAS_COURSES_SUBACCOUNT_ID must be a positive Canvas account ID.",
    );
  const nested = includeSubaccounts(env);
  return { accountId, nested };
}
export function courseFingerprint(
  authFingerprint: string,
  accountId: string,
  nested: boolean,
) {
  return createHash("sha256")
    .update(JSON.stringify([authFingerprint, accountId, nested]))
    .digest("hex");
}
