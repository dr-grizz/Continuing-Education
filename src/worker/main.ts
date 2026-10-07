import type { operations } from "../generated/prisma/client";
import { db } from "../domain/db";
import { prisma, sql, transaction, Tx } from "../domain/prisma";
import { audit, PortalService } from "../server/service";
const portal = new PortalService();
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
// One worker step in one transaction: claim at most one due job, then expire stale
// reservations and lapsed approvals. Claiming uses FOR UPDATE SKIP LOCKED so several
// workers never process the same job.
async function step(tx: Tx) {
  const [op] = await sql<operations>(
    tx,
    "SELECT * FROM operations WHERE status IN ('pending','running') AND next_run<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
  );
  if (op) {
    const [current] = await sql<{ status: string }>(
      tx,
      "SELECT status FROM entitlements WHERE id=$1::uuid FOR UPDATE",
      op.entitlement_id,
    );
    if (current?.status !== "provisioning") {
      await sql(
        tx,
        "UPDATE operations SET status='failed',error='Registration is no longer eligible' WHERE id=$1::uuid",
        op.id,
      );
    } else if (
      op.simulated_outcome === "delayed" &&
      op.stage === "identity" &&
      !op.delay_applied
    ) {
      await sql(
        tx,
        "UPDATE operations SET status='running',delay_applied=true,next_run=now()+interval '20 seconds' WHERE id=$1::uuid",
        op.id,
      );
      await audit(
        tx,
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
        await sql(
          tx,
          "UPDATE operations SET status='running',attempts=$2,error=$3,next_run=now()+make_interval(secs => $4) WHERE id=$1::uuid",
          op.id,
          attempt,
          reason,
          attempt * 3,
        );
        await audit(
          tx,
          "prototype-worker",
          "prototype.provisioning_retry_scheduled",
          op.entitlement_id,
          { stage: op.stage, attempt, reason },
        );
      } else {
        // Retries exhausted: hand the registration to the staff exception queue.
        await sql(
          tx,
          "UPDATE operations SET status='failed',attempts=$2,error=$3,failed_at=now(),next_run=NULL WHERE id=$1::uuid",
          op.id,
          attempt,
          reason,
        );
        await sql(
          tx,
          "UPDATE entitlements SET status='exception' WHERE id=$1::uuid",
          op.entitlement_id,
        );
        await audit(
          tx,
          "prototype-worker",
          "prototype.provisioning_failed",
          op.entitlement_id,
          { stage: op.stage, attempts: attempt, reason },
        );
      }
    } else if (op.stage === "identity") {
      await sql(
        tx,
        "UPDATE operations SET status='running',stage='canvas',attempts=0,error=NULL,next_run=now()+interval '3 seconds' WHERE id=$1::uuid",
        op.id,
      );
      await audit(
        tx,
        "prototype-worker",
        "prototype.identity_simulated",
        op.entitlement_id,
      );
    } else {
      await sql(
        tx,
        "UPDATE entitlements SET status='enrolled' WHERE id=$1::uuid",
        op.entitlement_id,
      );
      await sql(
        tx,
        "UPDATE operations SET status='succeeded',stage='complete',error=NULL WHERE id=$1::uuid",
        op.id,
      );
      await audit(
        tx,
        "prototype-worker",
        "prototype.enrollment_simulated",
        op.entitlement_id,
      );
    }
  }
  const expired = await sql<{ id: string }>(
    tx,
    // A seat is not released while a Stripe Checkout session for it is still
    // unresolved (reconciliation decides), unless it is a day past expiry.
    `UPDATE entitlements e SET status='expired' WHERE e.status='reserved' AND e.reserved_until<=now()
       AND NOT EXISTS (SELECT 1 FROM checkout_sessions c WHERE c.entitlement_id=e.id AND c.status='open' AND c.expires_at>now()-interval '1 day')
     RETURNING e.id AS id`,
  );
  for (const row of expired)
    await audit(tx, "prototype-worker", "seat.expired", row.id);
  const lapsed = await sql<{ id: string }>(
    tx,
    "UPDATE entitlements SET status='approval_expired' WHERE status='approved' AND approval_expires_at<=now() RETURNING id",
  );
  for (const row of lapsed)
    await audit(tx, "prototype-worker", "approval.expired", row.id);
}
let lastReconciled = 0;
async function tick() {
  try {
    await transaction(step);
  } catch (error) {
    // The transaction rolled back; the job stays due and is retried next tick.
    console.error(
      "Worker retry:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  // Every 30 seconds, ask Stripe about Checkout sessions that expired without
  // a webhook, so a missed notification neither loses a payment nor holds a seat.
  if (Date.now() - lastReconciled >= 30_000) {
    lastReconciled = Date.now();
    try {
      await portal.reconcileCheckouts();
    } catch (error) {
      console.error(
        "Stripe reconciliation retry:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
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
  await prisma.$disconnect();
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
