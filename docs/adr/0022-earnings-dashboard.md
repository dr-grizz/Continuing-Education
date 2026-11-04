# ADR 0022: Read-only financial earnings dashboard

Accepted November 4, 2026 after the portal owner clarified that Earnings means financial receipts, payments, refunds, and offering performance.

Add a native **Finance → Earnings** section and aggregate API protected by existing `reports:sales`. Existing transaction and refund-request permissions remain separate and unchanged. There is no payment execution, new provider permission, external telemetry, SSO configuration, or schema change.

One explicit payment source is selected: Stripe sandbox or simulation. Neither represents production earnings, and they are never silently mixed. Paid orders, not entitlement status or current catalog prices, define gross receipts. Historical financial records remain included when a learner is deactivated or a course is unpublished. Monetary sums preserve integer cents and reject unsafe numeric ranges.

Use complete UTC payment-recording periods with an equal preceding comparison. Refund fields are current cumulative amounts per order, so receipts after refunds describe the selected paid-order cohort at the latest read, not refund cash flow during that period or profit. Outstanding requests are capped at the remaining order amount and do not reduce receipts until confirmed. No fees, payouts, expenses, taxes, declines, or missing refund events are invented.

Checkout metrics use sessions created in the period and their current matched paid-order state. They have a separate denominator from period receipts; a payment may be recorded after its Checkout cohort period. Completion without a payment record is not earnings. First-time/returning payers are exclusive groups based on earlier same-source payments across the portal.

Charts, totals tables, and aggregate CSV use the same selected source, date, and offering population, with no exposed payer/contact/payment details. Current financial snapshots read in one repeatable-read transaction. No historical-snapshot or cash-flow qualification is implied.

See [definitions and operator guide](../earnings.md) and [verification](../testing/earnings-verification.md).
