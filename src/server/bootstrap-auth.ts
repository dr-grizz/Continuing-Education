import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import { protectSetting } from "../domain/application-settings";
import { RequestLimiter } from "../domain/request-limiter";
const keyPattern = /^[0-9a-f]{64}$/i;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const failedKeyAttempts = new RequestLimiter(1);
type Env = NodeJS.ProcessEnv;
export class SetupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function denied(): never {
  throw new SetupError(
    403,
    "Initial setup is unavailable or access has expired.",
  );
}
export function bootstrapConfig(env: Env = process.env) {
  if (
    env.BOOTSTRAP_ENABLED !== "true" ||
    env.HOSTED_BETA !== "true" ||
    env.HOSTED_DEMO === "true" ||
    env.PROTOTYPE_MODE !== "true"
  )
    denied();
  const key = env.BOOTSTRAP_KEY || "";
  const expires = Date.parse(env.BOOTSTRAP_EXPIRES_AT || "");
  if (
    !keyPattern.test(key) ||
    !Number.isFinite(expires) ||
    expires <= Date.now()
  )
    denied();
  const origin = new URL(env.WEB_URL || "invalid:");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    denied();
  // Verify key availability without persisting or returning any credential.
  protectSetting("check", "configuration-check", env);
  const fingerprint = digest(
    JSON.stringify([
      "bootstrap-key-v2",
      digest(key.toLowerCase()),
      env.AUTH_SECRET,
      origin.origin,
    ]),
  );
  return {
    key,
    expires,
    origin: origin.origin,
    fingerprint,
  };
}

/** Pure configuration/key verification: never opens or queries a database. */
export function verifyBootstrapKey(
  input: unknown,
  env: Env = process.env,
  limiter = failedKeyAttempts,
) {
  const config = bootstrapConfig(env);
  const candidate =
    typeof input === "string" && keyPattern.test(input)
      ? input.toLowerCase()
      : "";
  const valid = timingSafeEqual(
    Buffer.from(digest(candidate), "hex"),
    Buffer.from(digest(config.key.toLowerCase()), "hex"),
  );
  if (!valid) {
    if (limiter.consume("failed-bootstrap-key", 20))
      throw new SetupError(
        429,
        "Too many setup key attempts. Try again in one minute.",
      );
    throw new SetupError(403, "The setup key could not be verified.");
  }
}
const tokenPattern =
  /^b2\.([a-zA-Z0-9_-]{43})\.([0-9]{13})\.([a-zA-Z0-9_-]{43})$/;
const signature = (
  payload: string,
  config: ReturnType<typeof bootstrapConfig>,
  purpose = "setup-session-v2",
) =>
  createHmac("sha256", Buffer.from(config.key, "hex"))
    .update("cuce-" + purpose + ":" + config.fingerprint + ":" + payload)
    .digest("base64url");
export function issueBootstrapSession(expires: Date, env: Env = process.env) {
  const config = bootstrapConfig(env);
  const payload = `b2.${randomBytes(32).toString("base64url")}.${expires.getTime()}`;
  return payload + "." + signature(payload, config);
}
/** Signed proof of prior key verification is checked before any database access. */
export function assertBootstrapSession(
  token: unknown,
  env: Env = process.env,
): asserts token is string {
  const config = bootstrapConfig(env);
  if (typeof token !== "string") denied();
  const parts = token.match(tokenPattern);
  if (
    !parts ||
    Number(parts[2]) <= Date.now() ||
    Number(parts[2]) > config.expires
  )
    denied();
  const payload = token.slice(0, token.lastIndexOf("."));
  if (
    !timingSafeEqual(
      Buffer.from(parts[3]),
      Buffer.from(signature(payload, config)),
    )
  )
    denied();
}

export const setupDiagnosticsCookie = "__Host-ce-setup-diagnostics";
/** Read-only diagnostic capability; it never authorizes setup writes. */
export function issueSetupDiagnostics(env: Env = process.env) {
  const config = bootstrapConfig(env);
  const expiresAt = new Date(
    Math.min(config.expires, Date.now() + 10 * 60_000),
  );
  const payload = `d1.${randomBytes(32).toString("base64url")}.${expiresAt.getTime()}`;
  return {
    token: payload + "." + signature(payload, config, "setup-diagnostics-v1"),
    expiresAt,
  };
}
export function assertSetupDiagnostics(
  token: unknown,
  env: Env = process.env,
): void {
  const config = bootstrapConfig(env);
  if (typeof token !== "string") denied();
  const parts = token.match(
    /^d1\.([a-zA-Z0-9_-]{43})\.([0-9]{13})\.([a-zA-Z0-9_-]{43})$/,
  );
  if (
    !parts ||
    Number(parts[2]) <= Date.now() ||
    Number(parts[2]) > config.expires
  )
    denied();
  const payload = token.slice(0, token.lastIndexOf("."));
  if (
    !timingSafeEqual(
      Buffer.from(parts[3]),
      Buffer.from(signature(payload, config, "setup-diagnostics-v1")),
    )
  )
    denied();
}
