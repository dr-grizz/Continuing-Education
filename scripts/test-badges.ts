import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { migrate } from "./db-migrate";
import { endPoolAndWaitForClients } from "../tests/helpers/close-pool";
// All badge tests run against an isolated database, never the portal's records.
async function main() {
  const original = new URL(process.env.DATABASE_URL!);
  const database = `ce_badgetest_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(original), {
      pathname: "/postgres",
    }).href,
  });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(original), {
      pathname: `/${database}`,
    }).href;
    await migrate(url, { quiet: true });
    for (const args of [
      ["--test", "badge-service/test/*.test.mjs"],
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "tests/badges.integration.ts",
      ],
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "tests/embedded-badges.integration.ts",
      ],
    ]) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, args, {
          stdio: "inherit",
          env: { ...process.env, DATABASE_URL: url },
        });
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Badge checks exited ${code}`)),
        );
      });
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
