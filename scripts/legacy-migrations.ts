import { readFileSync } from "node:fs";
import path from "node:path";
import { PoolClient } from "pg";
// Pre-Prisma SQL migrations (issue #2). Kept as history and to bring an older
// database up to the 001-007 state before it is baselined. Never edit these files.
export const legacyMigrations = [
  ["001", "001_initial.sql"],
  ["002", "002_course_types.sql"],
  ["003", "003_demo_users.sql"],
  ["004", "004_provisioning_failures.sql"],
  ["005", "005_enrollment_policies.sql"],
  ["006", "006_offering_management.sql"],
  ["007", "007_unpublished_status.sql"],
] as const;
const directory = path.resolve(__dirname, "../src/domain");

// Applies any missing legacy migrations in one transaction; returns the versions applied.
export async function applyLegacyMigrations(
  client: PoolClient,
  through = "007",
): Promise<string[]> {
  const applied: string[] = [];
  await client.query("BEGIN");
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const [version, file] of legacyMigrations) {
      if (version > through) break;
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (exists.rowCount) continue;
      await client.query(readFileSync(path.join(directory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [
        version,
      ]);
      applied.push(version);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
