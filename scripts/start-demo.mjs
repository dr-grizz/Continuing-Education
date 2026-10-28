import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  assertPrototypeRuntime,
  assertHostedDatabase,
} = require("../dist/src/domain/hosted-demo.js");

// No cloud operations or schema changes on process restart. Migrate explicitly
// before deployment with the direct database URL, then start this release.
if (!assertPrototypeRuntime())
  throw new Error("npm start requires HOSTED_DEMO=true or HOSTED_BETA=true.");
assertHostedDatabase(process.env.DATABASE_URL);
const apiPort = Number(process.env.API_PORT || "3051");
const port = Number(process.env.PORT || "8080");
if (
  ![port, apiPort].every(
    (value) => Number.isInteger(value) && value > 0 && value <= 65535,
  ) ||
  port === apiPort
)
  throw new Error("PORT and API_PORT must be valid, distinct TCP ports.");
const apiUrl = `http://127.0.0.1:${apiPort}`;
if (process.env.API_URL && process.env.API_URL !== apiUrl)
  throw new Error(
    "The combined demo API_URL must match its loopback API_PORT.",
  );
const env = {
  ...process.env,
  NODE_ENV: "production",
  API_URL: apiUrl,
  PORT: String(port),
  HOSTNAME: "0.0.0.0",
};
// Hosted credential keys must survive ZIP replacement and process restarts.
const badgesEnabled = env.BADGES_ENABLED === "true";
env.BADGES_ENABLED = badgesEnabled ? "true" : "false";
if (badgesEnabled) {
  if (!env.BADGE_DATA_DIR)
    throw new Error(
      "Set BADGE_DATA_DIR to a private persistent directory outside the release.",
    );
  const selected = path.resolve(env.BADGE_DATA_DIR);
  mkdirSync(selected, { recursive: true, mode: 0o700 });
  const data = realpathSync(selected);
  const release = realpathSync(process.cwd());
  if (data === release || data.startsWith(`${release}${path.sep}`))
    throw new Error(
      "BADGE_DATA_DIR must be outside the deployed release directory.",
    );
  Object.assign(env, {
    BADGE_DATA_DIR: data,
    BADGE_LEARNER_MAP_FILE:
      env.BADGE_LEARNER_MAP_FILE || path.join(data, "portal-learners.json"),
    CERTIFICATE_PYTHON: path.resolve("python/bin/python3"),
  });
  // The existing API owns the credential handler; no standalone listener.
  delete env.BADGE_SERVICE_URL;
  if (!existsSync(env.CERTIFICATE_PYTHON))
    throw new Error("The packaged certificate Python runtime is missing.");
}
const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 8000);
  timer.unref();
}
function launch(args) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  children.add(child);
  child.on("error", () => stop(1));
  child.on("exit", () => {
    children.delete(child);
    if (!stopping) stop(1);
  });
  return child;
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
launch(["--max-old-space-size=256", "dist/src/server/main.js"]);
let ready = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try {
    const response = await fetch(`${env.API_URL}/api/v1/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* Wait for the API before exposing the web listener. */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) stop(1);
else if (!stopping)
  launch([
    "--max-old-space-size=384",
    existsSync("src/web/server.js")
      ? "src/web/server.js"
      : "src/web/.next/standalone/src/web/server.js",
  ]);
