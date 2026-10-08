# How the portal works with Stripe

For the Finance department and IT. Updated October 8, 2026. Technical decision record: [ADR 0005](../adr/0005-stripe-hosted-checkout.md).

## Summary

The Continuing Education portal takes course payments through **Stripe-hosted Checkout**. Learners pay on Stripe's own page, so card details never reach university systems. Stripe tells the portal about payments and refunds through **signed webhook notifications**, and the portal never moves money itself. **Finance issues every refund in the Stripe Dashboard**; staff can only *request* a refund in the portal. Today this runs against a Stripe **sandbox** (test mode) on a developer's computer; going live needs the access listed under [Access needed](#access-needed).

## How a payment works

```mermaid
sequenceDiagram
    actor Learner
    participant Portal
    participant Stripe
    Learner->>Portal: Reserve a seat (held 30 minutes)
    Learner->>Portal: Pay with Stripe
    Portal->>Stripe: Create Product and Price for the course (first time only)
    Portal->>Stripe: Create a Checkout session (31 minutes; the seat hold extends to cover it)
    Portal-->>Learner: Redirect to checkout.stripe.com
    Learner->>Stripe: Pay by card, Apple Pay or Google Pay
    Stripe-->>Learner: Return to the portal (a message only)
    Stripe->>Portal: Signed webhook: checkout.session.completed
    Portal->>Portal: Check amount, currency and reservation; record the order; start enrollment
```

- **Only the webhook counts.** The page Stripe returns the learner to never marks anything paid.
- **Missed notifications:** every 30 seconds the portal asks Stripe about checkout sessions that expired without a notification. Paid ones are recorded; unpaid ones are expired. A seat is not released while its payment is unresolved.
- **One order per payment.** The portal checks the amount and currency against the reservation and records each Stripe event once, so repeated notifications cannot double-record a payment.

## How a refund works

```mermaid
sequenceDiagram
    actor Staff as Support or Finance staff
    participant Portal
    actor Finance as Finance (Stripe Dashboard)
    participant Stripe
    Staff->>Portal: Request refund, with a reason (Staff → Transactions)
    Portal-->>Finance: The request shows as "Refund requested"
    Finance->>Stripe: Refund the full payment in the Stripe Dashboard
    Stripe->>Portal: Signed webhook: charge.refunded
    Portal->>Portal: Record the refund, close the request, end course access, release the seat
```

- **The portal never refunds.** Its Stripe key has no refund permission.
- **Full refunds only** (policy). If a partial refund is made in Stripe anyway, the portal records it and flags it for review; course access is unchanged.
- **A full refund ends course access.** The registration becomes "Refunded, access ended" and the seat is released. Removing the learner from the Canvas course is a manual IT step until Canvas is connected.
- **Learners can register and pay again** after a refund. The new payment is a new order; the refunded one stays in the history.
- **Refunds made directly in Stripe without a portal request** are still recorded and flagged.

## What the portal asks Stripe to do

| Stripe API call | When | Permission the key needs |
| --- | --- | --- |
| Create, read and update **Products** | First payment for a course; renaming follows course edits | Products: Write |
| Create **Prices** | A course's first payment at a given price | Prices: Write |
| Create, read and expire **Checkout Sessions** | A learner selects Pay with Stripe; reconciling missed notifications | Checkout Sessions: Write |
| List **Refunds** for a charge | When a refund arrives, to store the Stripe refund ID (optional; skipped if not permitted) | Refunds: Read |

Nothing else: no refunds, payouts, customers, disputes or account settings.

## What Stripe tells the portal (webhook events)

| Event | What the portal does |
| --- | --- |
| `checkout.session.completed` | Records the paid order and starts enrollment |
| `checkout.session.async_payment_succeeded` | Same (kept for safety; delayed payment methods are not offered) |
| `checkout.session.async_payment_failed` | Stored only |
| `checkout.session.expired` | Marks the session expired; the seat is released when the hold ends |
| `charge.refunded` | Records the refund, closes the request and, for a full refund, ends access |
| `charge.dispute.created` | Stored for reconciliation (dispute handling is not decided yet) |

Every notification must carry a valid Stripe signature for the endpoint's signing secret; unsigned or altered requests are rejected.

## What appears in Stripe

- **Products:** one per course, named after the course, with the portal's offering ID in metadata. A price change creates a new Price.
- **Payments:** the course price in USD, the learner's email (for Stripe receipts), and metadata `entitlement_id` (registration), `offering_id` (course) and `learner_id`, which Finance can use to match Stripe payments to portal records.
- **No tax:** Stripe Tax is off and Checkout shows no tax. The university does not collect tax on these courses.
- **Payment methods:** cards, which include Apple Pay and Google Pay. Bank debits, buy-now-pay-later and Link are not offered.

## Data shared with Stripe

| Data | Why |
| --- | --- |
| Course title and price | Product, Price and the Checkout line item |
| Learner email | Pre-fills Checkout; Stripe receipts |
| Internal IDs (registration, course, learner) | Matching payments to portal records |

The learner enters card details and billing ZIP code on Stripe's page; the portal never sees them.

## Access needed

### For the portal's connection to Stripe

Set up by a Stripe Administrator, or a Developer, for each environment (sandbox now, live later):

1. **A restricted API key** (`rk_test_…` in the sandbox, `rk_live_…` in live), with:

   | Resource | Permission |
   | --- | --- |
   | Checkout Sessions | Write |
   | Products | Write |
   | Prices | Write |
   | Refunds | Read (optional) |
   | Everything else | None |

   The prototype refuses live keys until production is approved. A restricted key limits the damage if it ever leaks; the portal only calls the APIs above.
2. **A webhook endpoint** for the live environment, at the portal's public HTTPS address `…/api/v1/webhooks/stripe`, subscribed to the six events above. Its **signing secret** goes to IT through the university's secret store, never by email or chat. (In the sandbox, a developer uses `stripe listen` instead.)
3. Account settings to confirm: business name and statement descriptor, Checkout branding, customer emails for successful payments and refunds, **Stripe Tax off**, and **Link turned off** for this account if Finance prefers (the portal already hides it).

### For people (Stripe Dashboard roles)

| Who | Suggested Stripe role | Why |
| --- | --- | --- |
| Finance staff who issue refunds | **Refund Analyst** | View and refund payments only; cannot pay out, change settings or see API keys |
| Finance staff who reconcile, report or manage payouts | **Analyst**, or **View Only** if they only read and download reports | Analyst can refund, pay out and export; View Only can view and download financial reports |
| IT or the portal developer setting up keys and webhooks | **Developer** (sandbox); in live, keys created by an Administrator | Developer can manage API keys and webhooks, but also refund and pay out, so limit it to the people who need it |
| Support staff | None | They request refunds in the portal; Finance completes them |

Require two-step authentication for everyone with Dashboard access. Role definitions are Stripe's: [Stripe user roles](https://docs.stripe.com/get-started/account/teams/roles).

## Questions for Finance

1. Who in Finance receives refund requests, and the expected turnaround?
2. Which staff get which Stripe role above?
3. How do Stripe payouts and reports map to university accounts (cost center, GL codes)? The payment metadata above is available for matching.
4. How should disputes (chargebacks) be handled, and does a lost dispute end course access?
5. Should Stripe send payment and refund receipts, and from which business name?
6. Approval to create the live environment's restricted key and webhook endpoint, and who holds the signing secret.

## Going live (later)

- Live restricted key and live webhook endpoint (no `stripe listen`).
- A real end-to-end payment and refund with Finance watching both systems.
- Remove the prototype's simulated payment command.
- Agree on reconciliation reports and the dispute policy.
