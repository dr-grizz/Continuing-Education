import type { operations } from "../generated/prisma/client";
import { sql, type Tx } from "../domain/prisma";
type Audit = typeof import("./service").audit;

// Bounded, database-only simulation. Requests resume due work; there is no timer.
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
// One transaction claims a due stage. Row locks let concurrent API requests
// resume durable work without processing the same stage twice.
export async function processDemoOperation(
  tx: Tx,
  audit: Audit,
  entitlementId?: string,
) {
  const [op] = await sql<operations>(
    tx,
    "SELECT p.* FROM operations p JOIN entitlements e ON e.id=p.entitlement_id WHERE p.status IN ('pending','running') AND p.next_run<=now() AND ($1::uuid IS NULL OR p.entitlement_id=$1::uuid) ORDER BY p.created_at FOR UPDATE OF e,p SKIP LOCKED LIMIT 1",
    entitlementId ?? null,
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
        "prototype-request",
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
          "prototype-request",
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
          "prototype-request",
          "prototype.provisioning_failed",
          op.entitlement_id,
          { stage: op.stage, attempts: attempt, reason },
        );
      }
    } else if (op.stage === "identity") {
      await sql(
        tx,
        "UPDATE operations SET status='running',stage='canvas',attempts=0,error=NULL,next_run=now() WHERE id=$1::uuid",
        op.id,
      );
      await audit(
        tx,
        "prototype-request",
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
        "prototype-request",
        "prototype.enrollment_simulated",
        op.entitlement_id,
      );
    }
  }
  return Boolean(op);
}
export async function expireDemoReservations(tx: Tx, audit: Audit) {
  const expired = await sql<{ id: string }>(
    tx,
    // A seat is not released while a Stripe Checkout session for it is still
    // unresolved (reconciliation decides), unless it is a day past expiry.
    `UPDATE entitlements e SET status='expired' WHERE e.status='reserved' AND e.reserved_until<=now()
       AND NOT EXISTS (SELECT 1 FROM checkout_sessions c WHERE c.entitlement_id=e.id AND c.status='open' AND c.expires_at>now()-interval '1 day')
     RETURNING e.id AS id`,
  );
  for (const row of expired)
    await audit(tx, "prototype-request", "seat.expired", row.id);
  const lapsed = await sql<{ id: string }>(
    tx,
    "UPDATE entitlements SET status='approval_expired' WHERE status='approved' AND approval_expires_at<=now() RETURNING id",
  );
  for (const row of lapsed)
    await audit(tx, "prototype-request", "approval.expired", row.id);
}
