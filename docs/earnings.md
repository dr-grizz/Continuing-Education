# Earnings dashboard

Open **Admin → Finance → Earnings** (`/staff/earnings`). Existing `reports:sales` permission is required; transaction-read access alone does not grant this report. The report uses existing `reports:sales`; manual ledger entry separately requires `payments:record` (staff administrators), introduced with migration `031_manual_payments`. No provider call or SSO change is introduced.

Choose dates, **Payment source**, and optionally an offering, then **Apply filters**. **Refresh** repeats the applied query. Stripe sandbox is the default; simulated payments require an explicit source selection. **Manual records** is a third, separate source for staff-entered external receipts and linked refunds; it does not verify money with a provider. Sources are never added together. Stripe and simulation remain prototype/test sources. A missing payment history produces honest zero/empty views; no illustration data is inserted into the local ledger.

The report uses 1–366 complete **UTC** days, ending before today, with an immediately preceding equal-length comparison. From/Through are inclusive calendar labels; the underlying upper bound is the following midnight. Daily gross-receipt bars cover up to 31 days, then seven-day buckets, with a possibly shorter final bucket. Every bucket is present, including zero days. The applied period, source, and offering are displayed separately from the editable controls.

## Financial definitions

| Measure                       | Definition                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gross receipts                | Sum of recorded `orders.amount_cents` for paid orders created in the selected period, source, and offering; for Manual records, sum of `manual_payments.amount_cents` by `paid_on`. This is the portal's payment-recording time, not a bank settlement timestamp. |
| Paid orders                   | Stripe orders require `payment_status=paid`; simulations accept stored `paid` or `simulated_paid` statuses. Unconfirmed order statuses are excluded and counted separately. Free/zero-amount paid orders count.                                                   |
| Payers                        | Distinct learner IDs on selected paid orders. Deactivated learners remain in financial history; no learner contact information is returned.                                                                                                                       |
| Average payment               | Gross receipts divided by paid orders, including zero-amount payments. No payments gives an unavailable average.                                                                                                                                                  |
| Confirmed refunds to date     | Current cumulative `orders.refunded_cents` against the selected paid-order cohort, including refunds recorded after the selected period. This is **not refunds issued during the selected period**.                                                               |
| Receipts after refunds        | Gross receipts less those current cumulative refunds. Processor fees and operating costs have not been deducted; this is **not profit or a payout total**.                                                                                                        |
| Refund share                  | Current refunded amount divided by gross receipts for the selected paid-order cohort. A zero gross amount gives an unavailable percentage.                                                                                                                        |
| Full/partial refund counts    | Paid orders with a positive refunded amount equal to / less than their recorded amount. Fully refunded orders remain part of original gross receipts and payment counts.                                                                                          |
| Outstanding refund requests   | Current open requests against the selected paid orders, capped at each order's remaining unrefunded amount. Fully refunded orders do not add a remaining request amount. Requests are not subtracted from receipts until confirmed.                               |
| First-time / returning payers | Mutually exclusive distinct payer groups. A returning payer has any earlier paid order before the period began, in any portal offering but the same payment source. Multiple current-period orders do not make a first-time payer count in both groups.           |
| Offering earnings             | The same selected payments grouped by offering. Uses paid prices, even if current prices, publication, enrollment, or learner access have changed. Payers can overlap across offering rows and must not be summed as unique people.                               |

Amounts are summed in integer cents; an unsafe numeric range is rejected rather than silently rounded. Display and CSV use decimal USD with two decimal places. Selected orders, refund snapshots, comparison, source exclusion counts, and checkout outcomes are read in one repeatable-read transaction. Current source data can change when refreshed; this is not a frozen historical financial statement.

## Charts and drill-down

- **Receipts over time:** gross receipts only, with keyboard-selectable bars and an exact-value table. Zero buckets have no visible bar. Refunds are not plotted by issue date because the complete event ledger is unavailable.
- **Receipt allocation:** a stacked amount bar splits gross receipts into current retained and refunded amounts. The two amounts reconcile to gross receipts.
- **Offering earnings:** select gross receipts, receipts after refunds, confirmed refunds to date, or paid orders. Zero-based bars share one scale and show exact values. Expand the totals table; long charts have **Show all**.
- **Payer mix:** first-time versus returning distinct payers for the selected scope.
- **Checkout outcomes:** mutually exclusive current statuses for Stripe sessions created in the selected period: confirmed paid order; completed without a paid order; open/unreconciled; or expired without a paid order. A matching paid order takes precedence over session status. Confirmation rate is matched paid orders divided by selected sessions, including payments recorded later than the selected period. A completed session without an order is not revenue; expired/unconfirmed sessions are not card-decline counts. Simulation has no Checkout metrics.

**Export earnings CSV** exports the full filtered aggregates, exact definitions, source, dates, currency, and limitations. It includes no payer names, emails, payment identifiers, card information, or refund reasons. Spreadsheet-formula prefixes are neutralized. Charts may show an initial six offering rows; tables and export retain all selected rows. Users with `payments:read` can open the existing transaction/refund-request workspace from this dashboard, but this report issues no refunds and performs no reconciliation.

## Limits and source authority

The payment and refund model is documented in [ADR 0005](adr/0005-stripe-hosted-checkout.md) and implemented in `src/server/service.ts`. For Stripe, the order, rather than a browser return URL or enrollment status, is payment authority. Manual records use staff-entered evidence and remain independent of access or enrollment; see [manual payments and refunds](manual-payments.md). The prototype accepts test-mode Stripe events only; this report uses stored PostgreSQL records and makes no Stripe requests.

Fees, expenses, taxes, payout/settlement amounts, profit, individual card declines, and complete refund-by-issue-date cash flow are not available in this schema. The dashboard does not estimate them. Historical snapshots of current refund/request states are unavailable; the after-refund amount may change even when its original payment period stays fixed.

API: `GET /api/v1/staff/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&provider=stripe|simulated|manual&offeringId=UUID`, guarded by `reports:sales` and existing staff authentication. Unknown query fields, invalid dates/providers, and unknown offerings are rejected.

Validation: [earnings verification](testing/earnings-verification.md); decision: [ADR 0022](adr/0022-earnings-dashboard.md).

## Manual records

Manual receipts use their external payment's UTC calendar date, with recording time retained separately. The report still covers complete days: today's manual payment appears in the ledger immediately and enters report totals tomorrow (UTC). Refunds entered later reduce their original payment cohort's retained amount; their effective refund date does not move them into a different receipt cohort. Manual records have no Checkout sessions, unresolved payment exclusions, or refund-request workflow. Payer comparisons and offering totals use the same manual source throughout. Aggregate CSV includes the applied Manual records label and no learner contacts, payment references, or free-text notes.
