# ADR 0023: Manual external payment and refund records

Status: accepted, November 4, 2026.

## Context

The user requested manual payment and refund records alongside the Earnings dashboard. [ADR 0005](0005-stripe-hosted-checkout.md) assigns actual Stripe collection/refunds to the provider and Finance, permits portal refund requests, and restricts partial refunds for that workflow. [ADR 0022](0022-earnings-dashboard.md) introduced read-only source-separated financial reporting. Staff also need to document externally handled payments without pretending that a provider verified them or granting learning access.

## Decision

Add separate append-only PostgreSQL `manual_payments` and `manual_refunds` tables, migration `031_manual_payments`. Link every payment to an existing learner and offering, every refund to its original manual payment. Preserve positive integer USD cents, effective dates, references, explanatory notes, actor and recording timestamps. Keep Stripe orders and the provider enum unchanged. Partial and full manual refunds represent already completed external transactions; this extends recordkeeping without changing ADR 0005's Stripe refund policy.

Use `payments:record` for entry, granted to staff administrators; use existing `payments:read` for history and existing `reports:sales` for financial aggregates. These records do not transfer money, call Stripe, create entitlements, consume seats, change access, grant credentials, or resume paused SSO/Canvas work. A manual refund route cannot update a Stripe order.

Reuse actor-scoped command idempotency and atomic audits. Enforce normalized unique references, serialize refunds on their original payment, and enforce cumulative/date limits and append-only history in the database as well as the service. Do not expose mutations or contact details in aggregate reports/exports.

Add a separate **Manual records** earnings source using the payment's effective UTC date, current cumulative linked refunds, and the existing complete-day filters, offering/payer comparisons and charts. Never combine it with Stripe sandbox or simulation. Today is immediately visible in the ledger and enters the report after the UTC day closes. No Checkout denominator is reported for manual records.

## Consequences

Manual evidence is clearly staff-entered rather than bank verified. Required references reduce accidental duplicate entry; their scope and retry behavior are documented in the [guide](../manual-payments.md). There is no adjustment/void workflow in this addition, no bank reconciliation, and no assertion of production accounting readiness. A genuine refund can be recorded; false refunds must not be used to erase data-entry mistakes. Ledger display is bounded to the latest 250 payments while report aggregates cover all selected records. No external provider, SSO, or enrollment behavior changes.
