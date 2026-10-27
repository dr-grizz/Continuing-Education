import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  throw new Error("npm start requires HOSTED_DEMO=true.");
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
const badgePreview = env.BADGES_ENABLED === "true";
let badgeDirectory;
if (badgePreview) {
  if (env.BADGE_DEMO_PREVIEW !== "true")
    throw new Error(
      "Hosted badges require explicit disposable demo preview mode.",
    );
  const badgePort = Number(env.BADGE_PORT || "4178");
  if (
    !Number.isInteger(badgePort) ||
    badgePort < 1 ||
    badgePort > 65535 ||
    [port, apiPort].includes(badgePort)
  )
    throw new Error(
      "BADGE_PORT must be valid and distinct from web/API ports.",
    );
  badgeDirectory = await mkdtemp(
    path.join(
      process.platform === "linux" ? "/tmp" : tmpdir(),
      `cuce-badge-preview-${process.pid}-`,
    ),
  );
  Object.assign(env, {
    BADGE_PORT: String(badgePort),
    BADGE_SERVICE_URL: `http://127.0.0.1:${badgePort}`,
    BADGE_DATA_DIR: badgeDirectory,
    BADGE_LEARNER_MAP_FILE: path.join(badgeDirectory, "portal-learners.json"),
    BADGE_CONFIG: path.resolve("badge-service/config.example.json"),
    BADGE_DEMO: "true",
    CERTIFICATE_PYTHON: path.resolve("python/bin/python3"),
  });
  if (!existsSync(env.CERTIFICATE_PYTHON))
    throw new Error("The packaged certificate Python runtime is missing.");
}
const children = new Set();
process.on("exit", () => {
  // Preview records are never a persistence contract or a historical store.
  if (badgeDirectory) rmSync(badgeDirectory, { recursive: true, force: true });
});
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
if (badgePreview) {
  launch(["--max-old-space-size=128", "badge-service/server.mjs"]);
  let badgeReady = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
      if (
        (
          await fetch(`${env.BADGE_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        badgeReady = true;
        break;
      }
    } catch {
      /* Wait until the private badge listener and store are ready. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!badgeReady) stop(1);
}
if (!stopping) launch(["--max-old-space-size=256", "dist/src/server/main.js"]);
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
