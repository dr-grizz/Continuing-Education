-- Apply "a full refund ends course access" (decision P5, October 7, 2026) to
-- registrations fully refunded before the rule existed, with an audit entry each.
BEGIN;

WITH ended AS (
  UPDATE entitlements e
     SET status = 'refunded', reserved_until = NULL
    FROM orders o
   WHERE o.entitlement_id = e.id
     AND o.refunded_cents >= o.amount_cents
     AND o.amount_cents > 0
     AND e.status <> 'refunded'
  RETURNING e.id
)
INSERT INTO audit_events (actor, action, object_id, details)
SELECT 'migration', 'access.ended', id,
       '{"reason": "full refund (backfill)", "canvas": "Remove the Canvas enrollment manually until Canvas is connected."}'::jsonb
  FROM ended;

UPDATE operations p
   SET status = 'failed', error = 'Refunded: course access ended'
  FROM entitlements e
 WHERE p.entitlement_id = e.id
   AND e.status = 'refunded'
   AND p.status IN ('pending', 'running');

COMMIT;
