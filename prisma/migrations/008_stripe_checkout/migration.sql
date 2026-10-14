-- Stripe-hosted Checkout (sandbox): provider on orders, Product/Price mapping per
-- offering, Checkout sessions and processed webhook events. Checks are hand-written.
BEGIN;

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('simulated', 'stripe');

-- CreateEnum
CREATE TYPE "checkout_status" AS ENUM ('open', 'complete', 'expired');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "provider" "payment_provider" NOT NULL DEFAULT 'simulated',
ADD COLUMN     "stripe_checkout_session_id" TEXT,
ADD COLUMN     "stripe_payment_intent_id" TEXT;

-- CreateTable
CREATE TABLE "stripe_products" (
    "offering_id" UUID NOT NULL,
    "stripe_product_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_products_pkey" PRIMARY KEY ("offering_id")
);

-- CreateTable
CREATE TABLE "stripe_prices" (
    "stripe_price_id" TEXT NOT NULL,
    "offering_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_prices_pkey" PRIMARY KEY ("stripe_price_id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "entitlement_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "checkout_status" NOT NULL DEFAULT 'open',
    "url" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_products_stripe_product_id_key" ON "stripe_products"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_prices_offering_id_price_cents_key" ON "stripe_prices"("offering_id", "price_cents");

-- CreateIndex
CREATE INDEX "checkout_sessions_entitlement_id_idx" ON "checkout_sessions"("entitlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripe_checkout_session_id_key" ON "orders"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripe_payment_intent_id_key" ON "orders"("stripe_payment_intent_id");

-- AddForeignKey
ALTER TABLE "stripe_products" ADD CONSTRAINT "stripe_products_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stripe_prices" ADD CONSTRAINT "stripe_prices_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Checks
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_amount_check" CHECK (amount_cents >= 0);
ALTER TABLE "stripe_prices" ADD CONSTRAINT "stripe_prices_price_check" CHECK (price_cents >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_stripe_session_check"
  CHECK (provider = 'simulated' OR stripe_checkout_session_id IS NOT NULL);

COMMIT;
