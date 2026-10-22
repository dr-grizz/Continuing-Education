# Continuing Education next steps

Updated October 21, 2026. **Next workstream: Canvas course mapping**, as requested. The [Canvas mapping plan](canvas-mapping-plan.md) records the implemented course connector and visibility controls, plus remaining existing-offering linking and mapping-health work. Verified learner grades/progress follow after identity linking and real authentication. The reliability and shared-review work below remains necessary before a pilot. Keep the existing first-release scope; memberships, bulk purchasing, coupons and bundles remain deferred unless the sponsor changes it.

## Current checkpoint

- The prototype is merged into `main` through PR #16 at `dd67f93`. The merged local `prototype-checkpoint` and `canvas-sync` branches have been removed.
- Implemented: course browsing and Explore; collections, pathways and saved courses; approvals and enrollment windows; role-based mock staff access; Stripe sandbox Checkout and signed webhooks; refund requests for external Finance; full-refund access reversal and repeat purchases; rich-text sales pages with uploads and video embeds.
- Prisma manages 23 migration directories, `000_baseline` through `022_offering_visibility`. The local data and migration history must be preserved.
- Identity preparation and Canvas enrollment are simulated. Learner sign-in now supports existing CU accounts through identity-only Canvas OAuth, with a separate local mock mode; live learner acceptance remains pending; [Canvas staff OAuth](canvas-staff-auth.md) passed a live local staff login on October 13. MFA assurance and remaining live authentication cases still require verification. Mock staff access remains available only in mock mode. The [course connector](canvas-courses.md) now reuses staff OAuth with opt-in API read scopes, encrypted staff grants, nested subaccounts, and on-demand previews with explicit selected-course sync. The October 14 live preview read 123 published courses from subaccount 49 and descendants without saving course details to the portal database. Selected-course sync now creates unpublished offering drafts with stable mappings, duplicate protection, preservation of staff edits and required-information warnings. Listed/unlisted visibility is implemented locally (T01); live mapping health checks remain next. The sales dashboard still lacks authoritative refund/reconciliation reporting, and completion reporting needs Canvas.
- Both PR #16 [checks against main](https://github.com/dr-grizz/Continuing-Education/actions/runs/38627513779) and the [prototype branch checks](https://github.com/dr-grizz/Continuing-Education/actions/runs/38627285404) passed, including format, typecheck, build, migrations, mocked Canvas authentication/course tests, API integration and automated accessibility checks. A manual screen-reader session is still pending.
- This plan is the proposed work queue, not an issued set of tickets or a deployment approval. PRs #15 and #16 are merged; no new issue creation is included.

The October 15 demo uses only web and API. Normal simulated fulfillment completes on payment; delayed retries and expiry resume on authenticated requests. Canvas discovery is on demand, scheduled previews are deferred, and missed Stripe notifications use the manual Transactions recovery action. [ADR 0008](adr/0008-request-driven-demo.md) supersedes the earlier worker-based demo arrangement; future real provisioning can use an on-demand durable runner. Hosting preparation remains pending.

Current priority amendment, October 21: prepare a restricted Azure demo and support existing-CU-account learner login through Canvas OAuth (including staff as learners), as implemented in [ADR 0009](adr/0009-canvas-learner-login.md). Guest pre-account login and Cedarville guest provisioning after payment remain future work; no new provider is required for the current login path. Verify live learner login and accessibility before hosting.

## 1. Finish Canvas mapping and portal visibility

Keep the existing one-default-offering-per-Canvas-course boundary. Keep course discovery read-only; schedules remain deferred; creating drafts still requires explicit selection. Use a new feature branch from `main` for the next implementation slice.

### Completed: offering display images

- [x] Use the Canvas course card image for offerings imported from Canvas. If no image is available or the image cannot load, use a Cedarville University Continuing Education (CU CE) branded fallback image instead of the current category photo. Keep offering cover images separate from images in sales-page content.

**Implemented:** discovery requests `include[]=course_image` on each page and imports the HTTPS image URL into existing source metadata. Offering cards use the Canvas image or the existing CU CE white logo on a navy background; a failed image falls back automatically. Images load without OAuth headers or server-side remote image optimization. Existing imports need Refresh from Canvas followed by Refresh source details. Import/provider tests and 10 list/grid keyboard/axe checks passed across the configured browser/theme projects; manual screen-reader review remains pending.

- [x] Allow course managers to upload a portal-only display image or explicitly select the CU CE fallback in offering Details. Preserve image choices and every other staff-owned offering field during Canvas source refreshes; returning to the Canvas image is an explicit choice. Image saves are independent, version-checked, audited and atomic.

### A. Add listed and unlisted visibility

Implemented locally October 21, 2026 as T01. See [offering visibility](offering-visibility.md), [ADR 0010](adr/0010-independent-offering-visibility.md) and [verification](testing/offering-visibility-verification.md). The following requirements describe the implemented behavior; manual screen-reader acceptance remains pending.

- Keep publication and listing as separate persisted values. Preserve existing publication states and give existing offerings the listed preference so their current behavior does not change. New imports remain unpublished drafts.
- Expose Published/listed and Published/unlisted in offering Settings. Retain the listing preference when an offering is unpublished and republished. Keep sales-page publication separate.
- Enforce listing rules in the API for browse/search, Explore, collections, pathways, related-course responses and public counts. Unlisted offerings remain accessible and registrable through their direct URL, subject to the existing eligibility rules; an unlisted URL is shareable, not private authorization.
- Preserve My learning records and entitlement-based access for existing paid learners when publication/listing changes. Never alter Canvas publication.
- Update the API contract, implementation plan, domain terms and affected diagrams alongside the implementation. Use an additive migration.

**Done when:** all four states (draft, published/listed, published/unlisted, unpublished) behave consistently across public endpoints and direct links; staff preview still works; republishing preserves listing choice; existing paid access remains intact. Verify API behavior, migration compatibility, keyboard use and automated accessibility checks.

### B. Add mapping availability checks

Published-only discovery cannot explain why a previously mapped course disappears. Check mapped course IDs directly using the existing staff OAuth authorization and validate the configured account boundary.

- Record the last successful verification, observed Canvas publication/account state, and a sanitized reason when verification fails. Distinguish an observed source change from a timeout or an authorization failure; 403/404 does not prove deletion.
- Show mapping status and a recheck action beside imported courses and on offering pages. On-demand checks refresh status without creating offerings or overwriting staff fields; schedule support can follow later.
- Agree a freshness/retry policy before enabling registration/payment gates. Confirmed source unavailability or movement outside the allowed account boundary should stop new purchases; an inconclusive check must not silently mark a course deleted. Define what happens to existing reservations and Checkout sessions when the status changes.
- Preserve the last good source details, portal publication, order history and existing learner records. Recovery should clear the operational block after successful verification without silently publishing an offering.

**Done when:** mocked tests cover unpublication, out-of-scope movement, 403/404, timeout, revoked grants, recovery and a status change during Checkout. Staff can understand why new purchases are blocked and how to recheck. No history is deleted and no learner is charged after a known eligibility failure.

### C. Review existing-offering conflicts and run a small pilot

- Inspect Imported courses and current mappings before selecting pilot courses; the October 14 count of 123 courses is a historical preview, not a current import count.
- Add an explicit reviewed action to attach an unmapped Canvas course to an existing offering. Show both records and require confirmation; never infer matches from course titles. Reject conflicting mappings and preserve existing offering content.
- Keep remapping offerings with fulfilled enrollments and additional offering variants deferred until fulfillment records preserve original course/section IDs.
- Validate three representative mappings, reusing existing imported drafts where appropriate: initial import, repeat import, edited portal fields, visibility transitions, manual preview, and recovery after lost authorization. Record exact IDs and results before considering a wider import. Do not change live Canvas publication to exercise failures; use mocked provider tests for those cases.

**Done when:** each selected course has exactly one intended offering, repeat imports preserve staff changes, deferred schedules execute no reads, and staff can locate and resolve a mapping conflict. Scheduled-read implementation is deferred. Expanding beyond the pilot requires a reviewed selection.

### D. Real learner login, Canvas account matching and post-payment creation

- [ ] **Implement real learner login.** Replace mock learner sign-in with an approved authentication workflow covering first sign-in, verified email ownership, returning users, secure sessions, logout, recovery and deactivated accounts. Support the agreed institutional SSO and external-learner route; determine that route with IT Identity before implementation. Keep staff Canvas OAuth and portal role authorization intact.
- [ ] **Find and implement a reliable email-to-Canvas account mapping.** Investigate the institution's supported Canvas account lookup and SIS/identity-directory mapping. Use the authenticated learner's verified email to find candidates, verify an exact unique match through the approved identity contract, and persist the Canvas installation and numeric user ID against the portal learner. Handle aliases, changed emails, multiple matches and previously linked accounts explicitly. Do not use a typed email, a fuzzy search result, or a failed lookup as proof of identity or proof that no account exists.
- [ ] **Create a missing Canvas user after confirmed payment.** Reuse an existing verified Canvas account whenever possible. When an authoritative lookup confirms there is no account and the learner is eligible, enqueue durable account provisioning only after the server verifies payment through a signed webhook or reconciliation. Determine whether creation must go through institutional/Courtesy identity provisioning and SIS, or an approved Canvas user-creation API; keep this decision explicit. Establish the required scoped authorization separately from the existing read-only course connection.
- [ ] **Prevent duplicate accounts and recover safely.** Serialize provisioning per learner/Canvas installation, look up again immediately before creation, and reconcile an uncertain creation response before retrying. Duplicate payment events, repeat purchases and worker restarts must reuse the same account. Store the verified Canvas user ID before enrollment, show account/enrollment preparation status, and route ambiguity or failures to Support without asking the learner to pay again. Recheck entitlement validity before provisioning; never delete a shared Canvas account when refunding one purchase.

**Done when:** tests cover real login/session ownership, existing and missing accounts, ambiguous matches, lookup failures, concurrent/duplicate payment delivery, interrupted creation, recovery and refunds during provisioning. One paid test learner with no account receives exactly one verified account and the intended enrollment; an existing learner's account is reused. Login and identity contracts must be agreed before enabling this workflow against live systems.

### E. Add grades/progress after verified learner identity

Real learner authentication and an approved institutional-to-Canvas identity link must precede access to real learning records. Persist verified user, course/section and enrollment IDs; email can support reviewed identity linking but is not sufficient authority to retrieve grades.

Start with one agreed measure (for example, a learner-visible current grade or module completion) and add only its required read scopes. Define unavailable versus zero, retrieval timestamps, refresh behavior, learner ownership and Canvas visibility rules before expanding to other measures or certificates. The existing staff OAuth connection remains the course-discovery authorization; do not assume it grants access to every learner's records.

**Done when:** an authenticated learner sees only their verified learning record, cross-learner access is rejected server-side, and stale, hidden or missing records are displayed accurately. Real enrollment/provisioning still follows the identity and Canvas contracts in steps 4–5 below.

## 2. Verify payment and request-driven recovery

After the Canvas mapping workstream, the manual checkout reconciler exists in `src/server/service.ts`; the remaining task is to verify and harden it. Existing integration checks already cover signed payment/refund events, duplicate payment delivery, final-seat concurrency, and holding a seat while Checkout is unresolved.

Add focused automated tests using an isolated database and a controllable Stripe adapter:

- A missed webhook with a paid session produces one order and one enrollment operation. Repeated reconciliation and a later webhook produce no duplicates.
- An expired unpaid session releases its seat; a timeout or uncertain response preserves it. Exercise the current one-day fallback explicitly and obtain Finance/Program Operations agreement on its behavior before a pilot.
- An error on one session does not prevent other sessions from being reconciled. Recovery is bounded and leaves actionable evidence for staff.
- Reservation expiry and renewal preserve quoted prices and approval rules; renewal fails if another learner takes the final seat.
- Restarting the API during either stage resumes durable work on the next authenticated request without duplicate fulfillment. A full refund during provisioning stops access preparation, including after restart.
- Out-of-order events preserve the current purchase after refund and re-registration.

Also exercise interrupted Checkout creation. The service currently makes Stripe calls inside a database transaction with a 20-second timeout. Verify recovery when Stripe creates a session but the transaction fails before saving it; retain the operation key and find the external result before attempting another purchase. Change the transaction boundary if the test exposes unrecoverable state.

**Done when:** the new scenarios run in CI without live credentials or the main local database, and every paid registration ends in one fulfillment operation or an owned exception. Run the sandbox drill separately with synthetic learners when sandbox testing is scheduled.

## 3. Prepare a portable deployment for shared review

Prepare the application before choosing provider-specific infrastructure. Use the existing [hosting comparison](hosting/azure-vs-railway.md) as a discussion draft; recheck pricing and provider capabilities when making the hosting decision.

- Add compiled API start commands and a reproducible container build for web and API.
- Configure listening addresses, ports, internal API URL and public return URL; remove hosted links to localhost.
- Forward the Stripe webhook through a dedicated web route with its exact request bytes and signature header. Keep that route separate from the normal authenticated API proxy.
- Add readiness checks, graceful shutdown and observable queue/reconciliation failures.
- Define prototype versus production environment rules explicitly. The current API guard rejects `NODE_ENV=production`; a hosted prototype needs a deliberate configuration rather than simply removing the guard. Retain synthetic-only data and refusal of live Stripe keys.
- Require an access gate for the whole demo before exposing mock sign-in, and keep the API and database private. Exempt only the signed Stripe webhook from the gate.
- Verify database TLS, migration ordering, backup/restore into a separate database and rollback of application releases. Never reset the existing database volume.
- Decide how hosted images are stored and served, and review the Content Security Policy against the accepted any-HTTPS video policy in ADR 0006.

**Done when:** a local container rehearsal starts web and API, handles the webhook without changing its signature, preserves data across restart, and passes smoke tests and a restore drill. A shared deployment follows the A3 hosting decision and access-gate verification; no production deployment is included in this milestone.

## 4. Resolve integration decisions in parallel

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

## 5. Implement one complete test enrollment

After C1/C2 and the authentication rules are agreed, introduce identity and Canvas adapters behind the existing workflow. Start with contract mocks, then connect approved isolated test services.

Exercise one scheduled offering and one self-paced offering, including an approval-gated case. Authenticate the learner and resolve identity eligibility before payment; handle ambiguous identities without creating an account. After confirmed payment, reuse the verified existing Canvas account or provision a missing account through the approved identity/Canvas workflow, as described in step 1D. Persist Courtesy sponsorship/request IDs where applicable and the resulting Canvas user/enrollment IDs. Reconcile uncertain account-creation and enrollment writes before retrying. Recheck entitlement validity around external calls and compensate when a refund ends access during provisioning.

**Done when:** one paid test order yields one verified enrollment and a working Canvas link; activation/SIS delays remain visible; failures enter a queue with a responsible owner; an existing CedarNet identity is reused without lifecycle changes.

## 6. Complete pilot acceptance and course migration

Before the closed pilot, complete the [manual VoiceOver review](prototype/screen-reader-review.md), including the new rich-text editor, learner status changes and staff dialogs/tables. Record findings and fixes; automated axe results do not complete this gate.

Add authoritative sales/refund reporting, payment-versus-enrollment reconciliation, alerts, support ownership, notification responsibilities and recovery runbooks. Obtain the remaining Security, Finance, accessibility and operational approvals described in the [implementation plan](implementation-plan.md#verification-and-release-gates).

If an existing platform is being replaced, start its inventory and a representative-course migration alongside steps 1–4 once Program Operations confirms scope. Preserve active-learner continuity, historical records and certificates. Course-owner QA and cutover approval precede redirects or retirement.

**Done when:** one low-risk pilot offering is approved for real use, acceptance evidence is complete, and migration/rollback responsibilities are explicit.

## Suggested next change

Canvas course card images with a CU CE fallback are implemented. Independent listed/unlisted visibility (T01) is also implemented locally. Next implement mapping status/manual verification (T02), then reviewed existing-offering linking (T03). Validate three representative mappings before a wider import. Find imported drafts through Imported courses → Open offering or Admin → Offerings; complete required details before publishing. Canvas access stays read-only. Resolve identity contracts alongside this work; grades/progress wait for verified learner identity. Return to payment/recovery tests and portable deployment before a shared pilot.

During those changes, reconcile remaining documentation drift, including ADR 0005's final pending-work paragraph, which still lists implemented refunds/reconciliation. Preserve the dated implementation history, use Course manager in current user-facing text, and update current-state summaries when evidence changes.
