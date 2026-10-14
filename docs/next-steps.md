# Continuing Education next steps

Updated October 14, 2026. **Next workstream: Canvas course mapping**, as requested. The [Canvas mapping plan](canvas-mapping-plan.md) records the implemented course connector and the remaining existing-offering linking, mapping-health and visibility work. Verified learner grades/progress follow after identity linking and real authentication. The reliability and shared-review work below remains necessary before a pilot. Keep the existing first-release scope; memberships, bulk purchasing, coupons and bundles remain deferred unless the sponsor changes it.

## Current checkpoint

- The checkout is on `canvas-sync`, branched from `prototype-checkpoint` at `1d461cb`, with the theme, sales-page and refund re-registration pull requests merged.
- Implemented: course browsing and Explore; collections, pathways and saved courses; approvals and enrollment windows; role-based mock staff access; Stripe sandbox Checkout and signed webhooks; refund requests for external Finance; full-refund access reversal and repeat purchases; rich-text sales pages with uploads and video embeds.
- Prisma manages 20 migration directories, `000_baseline` through `019_unlimited_seats`. The local data and migration history must be preserved.
- Identity preparation and Canvas enrollment are simulated. Learner sign-in is mock; [Canvas staff OAuth](canvas-staff-auth.md) passed a live local staff login on October 13. MFA assurance and remaining live authentication cases still require verification. Mock staff access remains available only in mock mode. The [course connector](canvas-courses.md) now reuses staff OAuth with opt-in API read scopes, encrypted staff grants, nested subaccounts, and manual/scheduled previews with explicit selected-course sync. The October 14 live preview read 123 published courses from subaccount 49 and descendants without saving course details to the portal database. Selected-course sync now creates unpublished offering drafts with stable mappings, duplicate protection, preservation of staff edits and required-information warnings. Listed/unlisted visibility and live mapping health checks remain next. The sales dashboard still lacks authoritative refund/reconciliation reporting, and completion reporting needs Canvas.
- [CI for this commit](https://github.com/dr-grizz/Continuing-Education/actions/runs/37841887593) passed format, typecheck, build, migrations, API integration and accessibility checks on October 8. Its accessibility run passed 197 checks across the configured browser/layout projects. A manual screen-reader session is still pending.
- GitHub issues #1 and #2 are closed; there were no open issues or pull requests when checked October 9. This plan is the proposed work queue, not an issued set of tickets or a deployment approval.

## 1. Verify payment and worker recovery

After the Canvas mapping workstream, the checkout reconciler exists in `src/server/service.ts`; the remaining task is to verify and harden it. Existing integration checks already cover signed payment/refund events, duplicate payment delivery, final-seat concurrency, and holding a seat while Checkout is unresolved.

Add focused automated tests using an isolated database and a controllable Stripe adapter:

- A missed webhook with a paid session produces one order and one enrollment operation. Repeated reconciliation and a later webhook produce no duplicates.
- An expired unpaid session releases its seat; a timeout or uncertain response preserves it. Exercise the current one-day fallback explicitly and obtain Finance/Program Operations agreement on its behavior before a pilot.
- An error on one session does not prevent other sessions from being reconciled. Recovery is bounded and leaves actionable evidence for staff.
- Reservation expiry and renewal preserve quoted prices and approval rules; renewal fails if another learner takes the final seat.
- Killing and restarting the worker during either stage resumes durable work without duplicate fulfillment. A full refund during provisioning stops access preparation, including after restart.
- Out-of-order events preserve the current purchase after refund and re-registration.

Also exercise interrupted Checkout creation. The service currently makes Stripe calls inside a database transaction with a 20-second timeout. Verify recovery when Stripe creates a session but the transaction fails before saving it; retain the operation key and find the external result before attempting another purchase. Change the transaction boundary if the test exposes unrecoverable state.

**Done when:** the new scenarios run in CI without live credentials or the main local database, and every paid registration ends in one fulfillment operation or an owned exception. Run the sandbox drill separately with synthetic learners when sandbox testing is scheduled.

## 2. Prepare a portable deployment for shared review

Prepare the application before choosing provider-specific infrastructure. Use the existing [hosting comparison](hosting/azure-vs-railway.md) as a discussion draft; recheck pricing and provider capabilities when making the hosting decision.

- Add compiled API and worker start commands and a reproducible container build for web, API and worker.
- Configure listening addresses, ports, internal API URL and public return URL; remove hosted links to localhost.
- Forward the Stripe webhook through a dedicated web route with its exact request bytes and signature header. Keep that route separate from the normal authenticated API proxy.
- Add readiness checks, graceful shutdown and observable queue/reconciliation failures.
- Define prototype versus production environment rules explicitly. The current API/worker guard rejects `NODE_ENV=production`; a hosted prototype needs a deliberate configuration rather than simply removing the guard. Retain synthetic-only data and refusal of live Stripe keys.
- Require an access gate for the whole demo before exposing mock sign-in, and keep the API and database private. Exempt only the signed Stripe webhook from the gate.
- Verify database TLS, migration ordering, backup/restore into a separate database and rollback of application releases. Never reset the existing database volume.
- Decide how hosted images are stored and served, and review the Content Security Policy against the accepted any-HTTPS video policy in ADR 0006.

**Done when:** a local container rehearsal starts all three services, handles the webhook without changing its signature, preserves data across restart, and passes smoke tests and a restore drill. A shared deployment follows the A3 hosting decision and access-gate verification; no production deployment is included in this milestone.

## 3. Resolve integration decisions in parallel

The [decision register](decision-register.md) identifies owner groups, but critical due dates remain blank. The portal lead should obtain a named accountable person and an agreed date for each dependency below; these dates are not currently commitments.

| Decision                                                | Existing owner group                     | Required output                                                                                                                                | Unlocks                                 |
| ------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A3 hosting                                              | Portal lead, IT                          | Supported provider, institutional account owner, review requirements and operational owner                                                     | Shared environment                      |
| A4 authentication and P9 recovery                       | Security, IT Identity                    | Approved learner authentication, staff SSO/MFA, session and identity-linking rules                                                             | Real sign-in                            |
| C1 identity contract                                    | IT Identity                              | Versioned contract and mock: matching, ambiguity, Courtesy provisioning/status, sponsorship, expiry, disable/reinstate, idempotency and errors | Identity adapter and pre-payment checks |
| C2 Canvas mappings, R3 access removal and R4 SIS timing | Canvas Administration, IT Identity       | Isolated test courses, verified SIS/user/section mapping, removal state and escalation deadlines                                               | Canvas adapter and verified access      |
| P5 disputes and P8 lifecycle                            | Finance, Program Operations, IT Identity | Access rules for dispute outcomes and Courtesy expiry/notices                                                                                  | Reversals and lifecycle                 |
| F10 first-release scope and O2 migration                | Sponsor, Program Operations              | Pilot scope, course/platform inventory and migration staffing                                                                                  | Pilot and parallel migration            |

Age, retention, accessibility acceptance, brand approval and support ownership remain release decisions too. Keep unsettled policies visibly open; do not turn prototype behavior into institutional policy.

**Done when:** the integration contracts have concrete test fixtures and error cases, each dependency has a named owner and agreed date, and the decision register records approvals.

## 4. Implement one complete test enrollment

After C1/C2 and the authentication rules are agreed, introduce identity and Canvas adapters behind the existing workflow. Start with contract mocks, then connect approved isolated test services.

Exercise one scheduled offering and one self-paced offering, including an approval-gated case. Prove identity matching before payment, handle ambiguous identities without creating an account, persist Courtesy sponsorship/request IDs, and look up Canvas users through the approved SIS mapping. Reconcile an uncertain enrollment write before retrying. Recheck entitlement validity around external calls and compensate when a refund ends access during provisioning.

**Done when:** one paid test order yields one verified enrollment and a working Canvas link; activation/SIS delays remain visible; failures enter a queue with a responsible owner; an existing CedarNet identity is reused without lifecycle changes.

## 5. Complete pilot acceptance and course migration

Before the closed pilot, complete the [manual VoiceOver review](prototype/screen-reader-review.md), including the new rich-text editor, learner status changes and staff dialogs/tables. Record findings and fixes; automated axe results do not complete this gate.

Add authoritative sales/refund reporting, payment-versus-enrollment reconciliation, alerts, support ownership, notification responsibilities and recovery runbooks. Obtain the remaining Security, Finance, accessibility and operational approvals described in the [implementation plan](implementation-plan.md#verification-and-release-gates).

If an existing platform is being replaced, start its inventory and a representative-course migration alongside steps 1–3 once Program Operations confirms scope. Preserve active-learner continuity, historical records and certificates. Course-owner QA and cutover approval precede redirects or retirement.

**Done when:** one low-risk pilot offering is approved for real use, acceptance evidence is complete, and migration/rollback responsibilities are explicit.

## Suggested next change

Review the [course preview](canvas-courses.md), then pilot three selected course imports. Explicit Sync now creates unpublished offering drafts; find them through Open offering or Admin → Offerings. Complete required details before publishing. The live read included 123 published courses from subaccount 49 and descendants; this implementation did not import them. Next implement independent listed/unlisted visibility and mapping availability checks, following the [mapping plan](canvas-mapping-plan.md). Canvas access stays read-only. Then return to payment/worker recovery tests and portable deployment while identity and Canvas enrollment contracts progress.

During those changes, reconcile the remaining documentation drift: ADR 0005's final pending-work paragraph still lists implemented refunds/reconciliation, and the domain glossary and portions of the decision register still refer to the removed Finance role. Preserve the dated implementation history, and update current-state summaries when evidence changes.
