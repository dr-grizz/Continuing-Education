# ADR 0005: Stripe-hosted Checkout in the sandbox

Status: accepted, October 7, 2026. Records decisions A7, P3, P4 and part of P5 in the [decision register](../decision-register.md).

## Context

Until now the prototype only simulated payment. The plan assigns payment collection, receipts, refunds and reconciliation to Stripe and Finance. The project has a Stripe **sandbox** (test mode) and wants to exercise real Checkout before the pilot. This is the first time portal data leaves the local machine, so the boundary needs to be explicit.

## Decision

- **Stripe-hosted Checkout.** Learners pay on Stripe's page (`checkout.stripe.com`); card data never reaches portal servers. Embedded Checkout remains a near drop-in alternative if staying on the portal site becomes important.
- **One Stripe Product per offering**, created on first checkout, with a new Price for each amount. The Product name follows offering edits. Mappings are stored in `stripe_products` and `stripe_prices`.
- **Cards and wallets only** (`allowed_payment_method_types: ["card"]`, which includes Apple Pay and Google Pay). Delayed methods such as bank debits are excluded because they outlast the seat hold. Link is hidden (`wallet_options.link.display: "never"`): the first sandbox run showed that it otherwise adds its own bank and buy-now-pay-later options and a "save my information" sign-up.
- **The signed webhook is the only confirmation.** `POST /api/v1/webhooks/stripe` verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` over the raw body. It handles each event ID once (`stripe_events`) and checks the amount, currency and reservation before recording a paid order (`provider = stripe`). It then queues enrollment through the same path as the simulation. The browser return page only shows a message.
- **Missed webhooks.** Every 30 seconds the worker checks open sessions more than a minute past expiry with Stripe: paid ones are recorded exactly as the webhook would (`stripe-reconciliation`), and still-open ones are expired. A seat is never released while one of its sessions is unresolved, unless it is a day past expiry.
- **Seat holds (P3). A reservation holds a seat for 30 minutes. A Checkout session lasts 31 minutes, Stripe's minimum, and extends the hold to its expiry plus 5 minutes. A payment confirmed after the hold lapsed is honored and flagged (`late_after_expiry` in the audit entry).
- **Tax (P4).** The university does not collect tax on these courses. Stripe Tax stays off and Checkout shows no tax.
- **Refunds (P5, in part).** Staff with `refunds:request` (Support, Finance) request a refund in **Staff → Transactions**, with a reason; the Finance department issues it in the Stripe Dashboard. `charge.refunded` records the refunded amount on the order and marks the request refunded; refunds issued without a request are recorded and flagged. The portal never issues refunds, so its key needs no refund permission. Requests are for the full amount. A full refund ends course access: the registration becomes `refunded`, the seat is released, unfinished enrollment jobs stop, and the audit log notes that Canvas removal is manual until Canvas is connected (migration `011` applied this to earlier refunds). Partial refunds are not allowed (decided October 8, 2026); one made in Stripe anyway is recorded and flagged, with access unchanged. Learners can register and pay again after a refund: a registration may have several orders over time (migration `012`), the latest is current, and a late refund of an earlier payment does not end current access. Finance-facing explanation and access checklist: [How the portal works with Stripe](../finance/stripe-integration.md). Dispute events are stored only.
- **Test mode only.** The API refuses to start with anything but an `sk_test_` or `rk_test_` key. Without a key, payments stay simulated, which keeps CI and offline demos working. The simulated payment command remains available in prototype mode and records `provider = simulated`; production removes it.

## Data shared with Stripe

Course title and price (Product and Price), the learner's email for Stripe receipts, and the registration, offering and learner IDs as metadata. Only synthetic learners (`@example.test`) should be used. Removing `STRIPE_SECRET_KEY` from `.env` stops all further calls; data already in the sandbox can be deleted from the Stripe Dashboard.

## Configuration

`.env` (never committed, never pasted into chat):

- `STRIPE_SECRET_KEY`: test secret key, or a restricted key with write access to Checkout Sessions, Products and Prices.
- `STRIPE_WEBHOOK_SECRET`: from `stripe listen --all-snapshot --forward-to http://127.0.0.1:3051/api/v1/webhooks/stripe`, or from a Dashboard webhook endpoint.
- `WEB_URL` (optional): where Stripe returns learners; defaults to `http://127.0.0.1:3050`.

## Consequences

- Integration tests post **signed fake events**: no network, no Stripe account. CI generates its own webhook secret.
- Orders now distinguish `simulated` from `stripe`; sales figures should be labelled accordingly before Finance relies on them.
- Still to build: the refund request queue for Finance, refund and dispute handling once P5's remaining questions are answered, and reconciliation of sessions that expired without a webhook.
