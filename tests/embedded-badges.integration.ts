import "dotenv/config";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { badgeProxy } from "../src/web/server/badges";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
const { defaultDesign } = require("../badge-service/designs.mjs");
async function main() {
  const directory = mkdtempSync(join(tmpdir(), "ce-embedded-badges-"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const reserved = createServer();
  await new Promise<void>((resolve) =>
    reserved.listen(0, "127.0.0.1", resolve),
  );
  const port = (reserved.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserved.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const staff = (
    await pool.query(
      "SELECT id FROM staff_members WHERE active AND 'staff_admin'=ANY(roles) LIMIT 1",
    )
  ).rows[0];
  assert.ok(staff, "Synthetic staff administrator is seeded");
  Object.assign(process.env, {
    API_URL: origin,
    WEB_URL: "http://127.0.0.1:3052",
    BADGE_DATA_DIR: directory,
    BADGES_ENABLED: "true",
    STAFF_AUTH_MODE: "mock",
    LEARNER_AUTH_MODE: "mock",
  });
  delete process.env.BADGE_SERVICE_URL;
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const current = child;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => current.kill("SIGKILL"), 10000);
      current.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      current.kill("SIGTERM");
    });
  };
  const start = async () => {
    child = spawn(
      process.execPath,
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "src/server/main.ts",
      ],
      { env: { ...process.env, API_PORT: String(port) }, stdio: "pipe" },
    );
    // Consume logs without echoing private runtime details.
    child.stdout?.resume();
    child.stderr?.resume();
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null)
        throw new Error("Embedded portal API failed to start");
      try {
        if ((await fetch(`${origin}/api/credentials/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Embedded portal API startup timed out");
  };
  const call = (
    route: string,
    body?: unknown,
    cookie = `ce-demo-staff=${staff.id}`,
  ) =>
    badgeProxy(
      new NextRequest(`http://127.0.0.1:3052/api/badges/${route}`, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: cookie,
          ...(body
            ? {
                "Content-Type": "application/json",
                Origin: "http://127.0.0.1:3052",
              }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      route.split("/"),
    );
  try {
    await start();
    assert.equal((await call("admin/catalog", undefined, "")).status, 401);
    assert.equal(
      (await fetch(`${origin}/api/credentials/api/portal-admin/catalog`))
        .status,
      401,
    );
    assert.equal((await call("admin/catalog")).status, 200);
    const response = await call("designer/drafts", {
      design: {
        ...defaultDesign,
        title: "Embedded PostgreSQL test",
        criteria: "Synthetic integration test",
      },
    });
    assert.equal(response.status, 201);
    const draft = await response.json();
    assert.equal(
      (
        await pool.query(
          "SELECT COUNT(*)::integer AS n FROM credential_badge_drafts WHERE id=$1",
          [draft.id],
        )
      ).rows[0].n,
      1,
    );
    assert.ok(
      (await pool.query("SELECT COUNT(*)::integer AS n FROM offerings")).rows[0]
        .n > 0,
    );
    await stop();
    await start();
    const drafts = await (await call("designer/drafts")).json();
    assert.ok(drafts.drafts.some((d: any) => d.id === draft.id));
    console.log(
      "PASS: badges run inside the real portal API, share its PostgreSQL database, retain staff authorization and persist across API restarts",
    );
  } finally {
    await stop();
    await endPoolAndWaitForClients(pool);
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
