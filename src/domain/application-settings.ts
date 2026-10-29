import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { Pool } from "pg";

export const setupSettingNames = [
  "CANVAS_STAFF_CLIENT_ID",
  "CANVAS_STAFF_CLIENT_SECRET",
  "STAFF_SESSION_HOURS",
  "LEARNER_SESSION_HOURS",
  "CANVAS_STAFF_FORCE_LOGIN",
] as const;
export const secretSettingNames = new Set<string>([
  "CANVAS_STAFF_CLIENT_SECRET",
]);
export function protectSetting(
  value: string,
  purpose: string,
  env = process.env,
) {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32 || /^(REPLACE_|CHANGE_ME)/i.test(secret))
    throw new Error("Private settings encryption is not configured.");
  const key = Buffer.from(
    hkdfSync("sha256", secret, env.WEB_URL || "", "cuce-private-setup-v1", 32),
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function revealSetting(
  value: string,
  purpose: string,
  env = process.env,
) {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Private settings encryption is not configured.");
  const key = Buffer.from(
    hkdfSync("sha256", secret, env.WEB_URL || "", "cuce-private-setup-v1", 32),
  );
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function readApplicationSettings(pool: Pool, env = process.env) {
  const result = await pool.query(
    "SELECT name,encrypted_value FROM application_settings",
  );
  const values: Record<string, string> = {};
  for (const row of result.rows) {
    if (!(setupSettingNames as readonly string[]).includes(row.name))
      throw new Error("Unrecognized saved application setting.");
    values[row.name] = revealSetting(
      row.encrypted_value,
      "setting:" + row.name,
      env,
    );
  }
  return values;
}

let fallback: Record<string, string | undefined> | undefined;
let refreshed = 0;
let inFlight: Promise<void> | undefined;
export async function refreshApplicationSettings(pool: Pool, force = false) {
  if (!force && Date.now() - refreshed < 3000) return;
  if (inFlight) return inFlight;
  fallback ??= Object.fromEntries(
    setupSettingNames.map((name) => [name, process.env[name]]),
  );
  inFlight = (async () => {
    const values = await readApplicationSettings(pool);
    for (const name of setupSettingNames) {
      const value = values[name] ?? fallback![name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    refreshed = Date.now();
  })();
  try {
    await inFlight;
  } finally {
    inFlight = undefined;
  }
}
