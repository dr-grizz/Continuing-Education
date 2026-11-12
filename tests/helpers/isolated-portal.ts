import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { Pool } from "pg";
import { migrate } from "../../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./close-pool";

// Own both the database and HTTP server; never borrow a developer's running API.
export async function withIsolatedPortal(
  run: (apiUrl: string) => Promise<void>,
) {
  const originalEnv = { ...process.env };
  const base = new URL(process.env.DATABASE_URL!);
  const database = `ce_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  let created = false;
  let child: ChildProcess | undefined;
  let logs = "";
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(base), { pathname: `/${database}` }).href;
    await migrate(url, { quiet: true });
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    Object.assign(process.env, {
      DATABASE_URL: url,
      API_PORT: String(port),
      API_URL: origin,
      PROTOTYPE_MODE: "true",
      HOSTED_DEMO: "false",
      HOSTED_BETA: "false",
      STAFF_AUTH_MODE: "mock",
      LEARNER_AUTH_MODE: "mock",
      STAFF_API_TOKEN: randomUUID(),
      LEARNER_API_TOKEN: randomUUID(),
      AUTOMATION_API_TOKEN: randomUUID(),
      BADGES_ENABLED: "false",
      CANVAS_COURSES_ENABLED: "false",
      STRIPE_SECRET_KEY: "",
      ONET_API_KEY: "",
      CERTIFICATE_EMAIL_ENABLED: "false",
    });
    child = spawn(
      process.execPath,
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "src/server/main.ts",
      ],
      { env: process.env, stdio: "pipe" },
    );
    child.stdout?.on("data", (data) => {
      logs += data;
    });
    child.stderr?.on("data", (data) => {
      logs += data;
    });
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error("Test API exited: " + logs);
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Test API did not become ready: " + logs);
    await run(origin);
  } finally {
    if (child && child.exitCode === null) {
      const running = child;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => running.kill("SIGKILL"), 10_000);
        running.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        running.kill("SIGTERM");
      });
    }
    for (const name of Object.keys(process.env))
      if (!(name in originalEnv)) delete process.env[name];
    Object.assign(process.env, originalEnv);
    try {
      if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    } finally {
      await endPoolAndWaitForClients(admin);
    }
  }
}
