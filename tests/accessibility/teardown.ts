import "dotenv/config";
import { Pool } from "pg";
// Removes the synthetic learner the scans sign in as, with its registrations
// and records, so local runs leave no test data behind.
export default async function teardown() {
  if (!process.env.DATABASE_URL) return;
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await db.query("BEGIN");
    const learners = (
      await db.query("SELECT id FROM learners WHERE email=$1", [
        "a11y-scan@example.test",
      ])
    ).rows.map((row) => row.id as string);
    if (learners.length) {
      const actors = learners.map((id) => `demo-learner:${id}`);
      const entitlements = (
        await db.query(
          "SELECT id FROM entitlements WHERE learner_id=ANY($1::uuid[])",
          [learners],
        )
      ).rows.map((row) => row.id as string);
      await db.query(
        "DELETE FROM audit_events WHERE object_id=ANY($1::uuid[]) OR actor=ANY($2::text[])",
        [[...entitlements, ...learners], actors],
      );
      for (const table of ["operations", "orders"])
        await db.query(
          `DELETE FROM ${table} WHERE entitlement_id=ANY($1::uuid[])`,
          [entitlements],
        );
      await db.query("DELETE FROM entitlements WHERE id=ANY($1::uuid[])", [
        entitlements,
      ]);
      await db.query("DELETE FROM commands WHERE actor=ANY($1::text[])", [
        actors,
      ]);
      // Saved courses and pathway follows cascade with the learner.
      await db.query("DELETE FROM learners WHERE id=ANY($1::uuid[])", [
        learners,
      ]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
