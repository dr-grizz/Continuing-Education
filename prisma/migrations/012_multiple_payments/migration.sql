-- Learners can register and pay again after a refund (October 8, 2026): a registration
-- may have several orders and enrollment jobs over time; the latest is current.
BEGIN;

-- The baseline created these as UNIQUE constraints, so drop the constraints
-- (Prisma's draft used DROP INDEX, which fails on a constraint-backed index).
ALTER TABLE "operations" DROP CONSTRAINT "operations_entitlement_id_key";

ALTER TABLE "orders" DROP CONSTRAINT "orders_entitlement_id_key";

-- CreateIndex
CREATE INDEX "operations_entitlement_id_idx" ON "operations"("entitlement_id");

-- CreateIndex
CREATE INDEX "orders_entitlement_id_idx" ON "orders"("entitlement_id");

COMMIT;
