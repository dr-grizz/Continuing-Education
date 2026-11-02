import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  assertPrototypeRuntime,
  assertHostedDatabase,
} from "../src/domain/hosted-demo";
import { Pool } from "pg";
import { applyLegacyMigrations, legacyMigrations } from "./legacy-migrations";
// Single migration authority (issue #2). Adopts a database built by legacy migrations
// 001-007 by recording the Prisma baseline as applied (never replaying it), then
// applies reviewed Prisma migrations with `prisma migrate deploy`.
const BASELINE = "000_baseline";
// Same advisory lock key as the legacy runner, so old and new runners never overlap.
const LOCK = 21001001;
const prismaCli = require.resolve("prisma/build/index.js");

function prisma(args: string[], databaseUrl: string, quiet: boolean) {
  // PRISMA_CONFIG_PATH lets tests point at a disposable migrations directory.
  const config = process.env.PRISMA_CONFIG_PATH;
  execFileSync(
    process.execPath,
    [prismaCli, ...args, ...(config ? ["--config", config] : [])],
    {
      stdio: quiet ? "pipe" : "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
}

export async function migrate(
  databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  { quiet = false, verifyHistory = false } = {},
) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.HOSTED_DEMO === "true"
  ) {
    assertPrototypeRuntime();
    assertHostedDatabase(databaseUrl);
    if (new URL(databaseUrl!).hostname.includes("-pooler"))
      throw new Error(
        "Migrations require a direct, unpooled database connection.",
      );
  }
  if (!databaseUrl) throw new Error("Run npm run setup first.");
  const log = (message: string) => !quiet && console.log(message);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK]);
    const state = (
      await client.query(`SELECT
        to_regclass('public.schema_migrations') IS NOT NULL AS legacy,
        to_regclass('public._prisma_migrations') IS NOT NULL AS prisma,
        to_regclass('public.offerings') IS NOT NULL AS tables`)
    ).rows[0];
    // Migrations were renumbered with three digits (October 7, 2026) because
    // Prisma applies them in alphabetical order, where "10_x" sorts before
    // "1_x". Rename history recorded under the old names before deploying.
    if (state.prisma) {
      if (verifyHistory) {
        const history = await client.query(
          "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations",
        );
        for (const row of history.rows) {
          if (row.rolled_back_at) continue;
          if (!row.finished_at)
            throw new Error(
              "Unresolved failed migration; administrator review is required.",
            );
          const name = String(row.migration_name).replace(
            /^(\d{1,2})_/,
            (_, number: string) => number.padStart(3, "0") + "_",
          );
          if (!/^\d{3}_[a-z0-9_]+$/.test(name))
            throw new Error(
              "Unrecognized migration history; administrator review is required.",
            );
          const checksum = createHash("sha256")
            .update(
              readFileSync(
                path.resolve("prisma/migrations", name, "migration.sql"),
              ),
            )
            .digest("hex");
          if (checksum !== row.checksum)
            throw new Error(
              "Migration checksum mismatch; administrator review is required.",
            );
        }
      }
      const renamed = await client.query(
        `UPDATE _prisma_migrations
           SET migration_name = lpad(split_part(migration_name, '_', 1), 3, '0') || substr(migration_name, position('_' in migration_name))
         WHERE migration_name ~ '^[0-9]{1,2}_'`,
      );
      if (renamed.rowCount)
        log(
          `Renamed ${renamed.rowCount} migration records to three-digit names.`,
        );
    }
    const baselined =
      state.prisma &&
      (
        await client.query(
          "SELECT 1 FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
          [BASELINE],
        )
      ).rowCount === 1;
    if (!baselined && state.legacy) {
      // Existing legacy database: catch up to 007, verify, then record the baseline.
      const caughtUp = await applyLegacyMigrations(client);
      if (caughtUp.length)
        log(`Applied legacy migrations ${caughtUp.join(", ")}.`);
      const versions = (
        await client.query("SELECT version FROM schema_migrations")
      ).rows.map((row) => row.version);
      const missing = legacyMigrations
        .map(([version]) => version)
        .filter((version) => !versions.includes(version));
      if (missing.length)
        throw new Error(`Legacy migrations missing: ${missing.join(", ")}.`);
      prisma(["migrate", "resolve", "--applied", BASELINE], databaseUrl, quiet);
      log("Existing database adopted: baseline recorded, not replayed.");
    } else if (!baselined && state.tables) {
      throw new Error(
        "Database has application tables but no migration history. Stop and investigate; do not baseline blindly.",
      );
    }
    prisma(["migrate", "deploy"], databaseUrl, quiet);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [LOCK])
      .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (require.main === module)
  migrate().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
