import { db } from "../domain/db";
import { audit } from "../server/service";
let stopped = false;
async function tick() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(
      "SELECT * FROM operations WHERE status IN ('pending','running') AND next_run<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (job.rowCount) {
      const op = job.rows[0];
      const current = await client.query(
        "SELECT status FROM entitlements WHERE id=$1 FOR UPDATE",
        [op.entitlement_id],
      );
      if (current.rows[0]?.status !== "provisioning") {
        await client.query(
          "UPDATE operations SET status='failed',error='Registration is no longer eligible' WHERE id=$1",
          [op.id],
        );
      } else if (op.stage === "identity") {
        await client.query(
          "UPDATE operations SET status='running',stage='canvas',next_run=now()+interval '3 seconds' WHERE id=$1",
          [op.id],
        );
        await audit(
          client,
          "prototype-worker",
          "prototype.identity_simulated",
          op.entitlement_id,
        );
      } else {
        await client.query(
          "UPDATE entitlements SET status='enrolled' WHERE id=$1",
          [op.entitlement_id],
        );
        await client.query(
          "UPDATE operations SET status='succeeded',stage='complete' WHERE id=$1",
          [op.id],
        );
        await audit(
          client,
          "prototype-worker",
          "prototype.enrollment_simulated",
          op.entitlement_id,
        );
      }
    }
    const expired = await client.query(
      "UPDATE entitlements SET status='expired' WHERE status='reserved' AND reserved_until<=now() RETURNING id",
    );
    for (const row of expired.rows)
      await audit(client, "prototype-worker", "seat.expired", row.id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Worker retry:",
      error instanceof Error ? error.message : "unknown error",
    );
  } finally {
    client.release();
  }
}
async function main() {
  console.log(
    "Local worker running. Identity and Canvas outcomes are SIMULATED.",
  );
  while (!stopped) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.end();
}
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
