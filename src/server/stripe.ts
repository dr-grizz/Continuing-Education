import "dotenv/config";
import Stripe from "stripe";
// Stripe sandbox (test mode) only. Checkout needs STRIPE_SECRET_KEY; webhooks
// need STRIPE_WEBHOOK_SECRET (from `stripe listen` or the Dashboard). Without a
// secret key the portal keeps simulated payments. See ADR 0005.
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (secretKey && !/^(sk|rk)_test_/.test(secretKey))
  throw new Error(
    "STRIPE_SECRET_KEY must be a test-mode key (sk_test_ or rk_test_). Live keys are not allowed in the prototype.",
  );
export const stripeEnabled = Boolean(secretKey);
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
/** Where Stripe sends learners back after Checkout. */
export const webUrl = (process.env.WEB_URL || "http://127.0.0.1:3050").replace(
  /\/$/,
  "",
);
// The placeholder key only allows webhook signature checks, which need no API key.
export const stripe = new Stripe(secretKey || "sk_test_not_configured", {
  maxNetworkRetries: 2,
  appInfo: { name: "Continuing Education portal prototype" },
});
/** Stripe requires Checkout sessions to stay open at least 30 minutes. */
export const CHECKOUT_MINUTES = 31;
/** Seats stay held this long after a session expires, for the expiry webhook. */
export const HOLD_GRACE_MINUTES = 5;
