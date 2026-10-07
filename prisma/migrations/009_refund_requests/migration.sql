-- Staff refund requests (Finance refunds in Stripe) and refunded amounts on orders.
BEGIN;

-- CreateEnum
CREATE TYPE "refund_request_status" AS ENUM ('requested', 'refunded', 'cancelled');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refunded_at" TIMESTAMPTZ(6),
ADD COLUMN     "refunded_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "refund_request_status" NOT NULL DEFAULT 'requested',
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" TEXT,
    "resolution_note" TEXT,
    "stripe_refund_id" TEXT,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_requests_order_id_idx" ON "refund_requests"("order_id");

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Checks
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_check" CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents);
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_reason_check" CHECK (length(btrim(reason)) BETWEEN 10 AND 500);
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_amount_check" CHECK (amount_cents > 0);

COMMIT;
