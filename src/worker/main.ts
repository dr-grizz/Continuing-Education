import { db } from "../domain/db";
import { audit } from "../server/service";
let stopped = false;
type Stage = "identity" | "canvas";
const MAX_ATTEMPTS = 3;
const failureReasons: Record<Stage, string> = {
  identity:
    "Simulated identity failure: no unambiguous university identity could be prepared.",
  canvas: "Simulated Canvas failure: the enrollment request was not confirmed.",
};
// Simulated outcomes are chosen when payment queues the operation.
function simulatedFailure(op: {
  simulated_outcome: string;
  stage: string;
  attempts: number;
}) {
  return (
    (op.simulated_outcome === "identity_failure" && op.stage === "identity") ||
    (op.simulated_outcome === "canvas_failure" && op.stage === "canvas") ||
    // A temporary failure clears on the first automatic retry.
    (op.simulated_outcome === "transient" &&
      op.stage === "identity" &&
      op.attempts === 0)
  );
}
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
      } else if (
        op.simulated_outcome === "delayed" &&
        op.stage === "identity" &&
        !op.delay_applied
      ) {
        await client.query(
          "UPDATE operations SET status='running',delay_applied=true,next_run=now()+interval '20 seconds' WHERE id=$1",
          [op.id],
        );
        await audit(
          client,
          "prototype-worker",
          "prototype.provisioning_delayed",
          op.entitlement_id,
          { stage: op.stage },
        );
      } else if (simulatedFailure(op)) {
        const attempt = op.attempts + 1;
        const reason = failureReasons[op.stage as Stage];
        if (attempt < MAX_ATTEMPTS) {
          // Bounded automatic retry with increasing delay.
          await client.query(
            "UPDATE operations SET status='running',attempts=$2,error=$3,next_run=now()+make_interval(secs => $4) WHERE id=$1",
            [op.id, attempt, reason, attempt * 3],
          );
          await audit(
            client,
            "prototype-worker",
            "prototype.provisioning_retry_scheduled",
            op.entitlement_id,
            { stage: op.stage, attempt, reason },
          );
        } else {
          // Retries exhausted: hand the registration to the staff exception queue.
          await client.query(
            "UPDATE operations SET status='failed',attempts=$2,error=$3,failed_at=now(),next_run=NULL WHERE id=$1",
            [op.id, attempt, reason],
          );
          await client.query(
            "UPDATE entitlements SET status='exception' WHERE id=$1",
            [op.entitlement_id],
          );
          await audit(
            client,
            "prototype-worker",
            "prototype.provisioning_failed",
            op.entitlement_id,
            { stage: op.stage, attempts: attempt, reason },
          );
        }
      } else if (op.stage === "identity") {
        await client.query(
          "UPDATE operations SET status='running',stage='canvas',attempts=0,error=NULL,next_run=now()+interval '3 seconds' WHERE id=$1",
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
          "UPDATE operations SET status='succeeded',stage='complete',error=NULL WHERE id=$1",
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
    const lapsed = await client.query(
      "UPDATE entitlements SET status='approval_expired' WHERE status='approved' AND approval_expires_at<=now() RETURNING id",
    );
    for (const row of lapsed.rows)
      await audit(client, "prototype-worker", "approval.expired", row.id);
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
