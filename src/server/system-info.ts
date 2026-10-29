import type { Pool } from "pg";
import { databaseDiagnostic, type DatabaseDiagnostic } from "./database-errors";
import { systemBuild } from "../generated/system-info";

const criticalTables = [
  "staff_members",
  "staff_sessions",
  "application_settings",
  "bootstrap_control",
  "bootstrap_sessions",
  "bootstrap_oauth_states",
  "bootstrap_key_limits",
] as const;
export type MigrationState =
  "applied" | "pending" | "failed" | "checksum mismatch" | "rolled back";
export type SystemInfo = {
  checkedAt: string;
  application: {
    version: string;
    revision: string;
    localChanges: boolean;
    buildTime: string;
    nodeVersion: string;
    profile: string;
    startupMigrationsEnabled: boolean;
  };
  database: {
    connected: boolean;
    error: DatabaseDiagnostic | null;
    historyPresent: boolean | null;
    state: "current" | "attention required" | "unavailable";
    unknownMigrations: number;
    criticalTables: { name: string; present: boolean }[];
    migrations: {
      name: string;
      state: MigrationState;
      appliedAt: string | null;
    }[];
  };
};
export function emptySystemInfo(env = process.env): SystemInfo {
  const report: SystemInfo = {
    checkedAt: new Date().toISOString(),
    application: {
      version: systemBuild.version,
      revision: systemBuild.revision,
      localChanges: systemBuild.localChanges,
      buildTime: systemBuild.generatedAt,
      nodeVersion: process.version,
      profile:
        env.HOSTED_BETA === "true"
          ? "beta"
          : env.HOSTED_DEMO === "true"
            ? "demo"
            : "local prototype",
      startupMigrationsEnabled: env.MIGRATE_ON_START === "true",
    },
    database: {
      connected: false,
      error: null,
      historyPresent: null,
      state: "unavailable",
      unknownMigrations: 0,
      criticalTables: [],
      migrations: [],
    },
  };
  return report;
}
export async function readSystemInfo(
  pool: Pool,
  env = process.env,
): Promise<SystemInfo> {
  const report = emptySystemInfo(env);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='5s'");
    const tables = await client.query(
      "SELECT name,to_regclass('public.' || name) IS NOT NULL AS present FROM unnest($1::text[]) AS name",
      [["_prisma_migrations", ...criticalTables]],
    );
    report.database.connected = true;
    report.database.historyPresent =
      tables.rows.find((row) => row.name === "_prisma_migrations")?.present ===
      true;
    report.database.criticalTables = criticalTables.map((name) => ({
      name,
      present: tables.rows.find((row) => row.name === name)?.present === true,
    }));
    const rows = report.database.historyPresent
      ? (
          await client.query(
            "SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1000",
          )
        ).rows
      : [];
    report.database.migrations = systemBuild.migrations.map((expected) => {
      const matches = rows.filter(
        (row) => row.migration_name === expected.name,
      );
      const active =
        matches.find((row) => !row.rolled_back_at && !row.finished_at) ||
        matches.find((row) => !row.rolled_back_at);
      let state: MigrationState = "pending";
      if (active)
        state = !active.finished_at
          ? "failed"
          : active.checksum !== expected.checksum
            ? "checksum mismatch"
            : "applied";
      else if (matches.length) state = "rolled back";
      return {
        name: expected.name,
        state,
        appliedAt: active?.finished_at
          ? new Date(active.finished_at).toISOString()
          : null,
      };
    });
    const expectedNames = new Set<string>(
      systemBuild.migrations.map((item) => item.name),
    );
    report.database.unknownMigrations = new Set(
      rows
        .filter(
          (row) =>
            !row.rolled_back_at && !expectedNames.has(row.migration_name),
        )
        .map((row) => row.migration_name),
    ).size;
    if (rows.length === 1000)
      throw new Error("Migration history exceeds diagnostic limit.");
    report.database.state =
      report.database.historyPresent &&
      !report.database.unknownMigrations &&
      report.database.criticalTables.every((table) => table.present) &&
      report.database.migrations.every((row) => row.state === "applied")
        ? "current"
        : "attention required";
    await client.query("COMMIT");
  } catch (error) {
    report.database.error = databaseDiagnostic(error) || {
      code: "DB_CHECK_FAILED",
      message:
        "The database check could not complete. Ask the administrator to check database readiness and runtime logs.",
    };
    if (client) await client.query("ROLLBACK").catch(() => {});
    // Database errors may contain credentials, SQL, hostnames or provider values.
    report.database.state = "unavailable";
    report.database.migrations = [];
    report.database.criticalTables = [];
  } finally {
    client?.release();
  }
  return report;
}
