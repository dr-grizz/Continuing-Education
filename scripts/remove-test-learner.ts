import "dotenv/config";
import { Pool } from "pg";
// Removes synthetic test learners and everything they created: registrations,
// orders, jobs, audit entries and idempotency records (saved courses and
// pathway follows cascade). Only reserved test domains are accepted, so real
// learners cannot be removed by mistake.
// Usage: npm run db:remove-test-learner -- sr-review@example.test [more...]
const testDomain = /@([a-z0-9-]+\.)*(test|example\.(com|org|net|edu))$/;
export async function removeTestLearners(emails: string[]) {
  const invalid = emails.filter((email) => !testDomain.test(email));
  if (invalid.length)
    throw new Error(`Not a reserved test address: ${invalid.join(", ")}`);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await db.query("BEGIN");
    const learners = (
      await db.query("SELECT id FROM learners WHERE email=ANY($1::text[])", [
        emails.map((email) => email.trim().toLowerCase()),
      ])
    ).rows.map((row) => row.id as string);
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
    await db.query("DELETE FROM learners WHERE id=ANY($1::uuid[])", [learners]);
    await db.query("COMMIT");
    return learners.length;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
if (require.main === module) {
  const emails = process.argv.slice(2);
  if (!emails.length) {
    console.error("Usage: npm run db:remove-test-learner -- <email> [...]");
    process.exit(1);
  }
  removeTestLearners(emails)
    .then((count) => console.log(`Removed ${count} test learner(s).`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
