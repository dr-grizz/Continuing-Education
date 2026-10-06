import { db } from "../src/domain/db";
import { readFileSync } from "node:fs";
async function main() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(21001001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const [version, file] of [
      ["001", "src/domain/001_initial.sql"],
      ["002", "src/domain/002_course_types.sql"],
      ["003", "src/domain/003_demo_users.sql"],
      ["004", "src/domain/004_provisioning_failures.sql"],
      ["005", "src/domain/005_enrollment_policies.sql"],
      ["006", "src/domain/006_offering_management.sql"],
      ["007", "src/domain/007_unpublished_status.sql"],
    ]) {
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (!exists.rowCount) {
        await client.query(readFileSync(file, "utf8"));
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1)",
          [version],
        );
      }
    }
    await client.query("COMMIT");
    console.log("Schema and non-destructive sample seed ready.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
