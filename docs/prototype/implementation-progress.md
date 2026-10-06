# Prototype implementation progress

Updated October 1, 2026. This document records the current local prototype, completed tasks, verification evidence, and remaining work. Checked items mean implemented for the prototype; they do not imply production readiness. Unchecked items are proposed work, not authorization to deploy, connect production services, or create GitHub issues.

The portal now supports database-backed catalog browsing, individual demo learners, registration and approval, simulated payment, and simulated enrollment. The registration flow has been verified end to end for Scheduled and Self-paced courses, with and without approval, using separate learners. The recommended next step is controlled simulation of failed provisioning with a staff recovery interface.

## Current implementation

| Area | Current behavior | Remaining boundary |
| --- | --- | --- |
| Website | Next.js and React with standard Material UI components | Final institutional design and content review |
| Database | PostgreSQL in Docker with persistent storage and three versioned migrations | Production schema, hosting, backup and retention decisions |
| Learners | One learner per normalized email; registrations persist across sign-ins | Mock sign-in does not prove email ownership; no real authentication |
| Payments | Explicit simulated payment command and synthetic order records | No Stripe connection or real financial transaction |
| Enrollment | Database worker simulates identity preparation and Canvas enrollment | No university identity or Canvas connection; no live course launch link |
| Automation | REST API, OpenAPI, local learner/staff/read-only tokens and operation status | Production service accounts, OAuth and outbound notifications |
| Staff | Draft creation, publication, approval decisions and audit summary | Demo staff access is open; production roles and SSO are pending |

Local website: `http://127.0.0.1:3000/`. API documentation: `http://localhost:3001/api/docs`. PostgreSQL uses loopback port `5433`. Setup instructions are in the [README](../../README.md).

## Completed tasks

### Planning and foundation

- [x] Create the repository implementation plan from the supplied planning document and repository guidelines.
- [x] Document API-first architecture using Next.js, Material UI, NestJS, PostgreSQL and a separate worker.
- [x] Create ten Mermaid sequence diagrams; separate portal workflows 1–9 from project migration and cutover 10.
- [x] Record domain terms and the local prototype architecture decision.
- [x] Pin dependencies and provide local setup, database migration and development commands.
- [x] Run PostgreSQL in Docker with persistent storage; preserve existing data when migrations are repeated.
- [x] Seed synthetic course offerings rather than rely on a static frontend mock catalog.
- [x] Create and update the database ERD, including learners and their entitlement relationship.

### Catalog and interface

- [x] Build catalog, course detail, My learning, sign-in and staff screens with standard Material UI components.
- [x] Add list/grid switching and retain the chosen layout in the browser.
- [x] Add large course photos in grid view and small thumbnails in list view.
- [x] Replace blurry course images with higher-resolution local assets and adjust image sizing.
- [x] Add course search and move topics to a top filter to provide more space for courses.
- [x] Support multiple topic selections, combined with course search.
- [x] Replace the initial featured banner with a single-course spotlight and manual navigation.
- [x] Use the official Cedarville Continuing Education logo and record its source.
- [x] Distinguish Scheduled courses with dates from Self-paced courses that show Start anytime.
- [x] Apply schedule rules consistently to catalog cards, spotlight, course detail, learner records and staff creation.

### Learners and registration

- [x] Implement mock sign-in and sign-out accepting any email and any nonempty password.
- [x] Keep passwords out of API requests and persistent storage.
- [x] Create or retrieve a PostgreSQL learner by normalized email; capitalization does not create duplicate users.
- [x] Replace the former shared learner session with an HTTP-only cookie selecting the demo learner.
- [x] Show only the selected learner's registrations in My learning and preserve them after sign-out.
- [x] Preserve earlier shared sample registrations on a legacy learner without assigning them to a new email.
- [x] Require sign-in for learner workflows through the web proxy.
- [x] Implement registration, temporary seat reservations and approval requests.
- [x] Support staff approval/decline decisions and subsequent approved seat reservation.
- [x] Show the requester's email in the staff approval queue.
- [x] Validate Scheduled dates in the API/database and omit dates for Self-paced courses.
- [x] Fix the null-end-date check that incorrectly closed Self-paced registration.

### API and simulated fulfillment

- [x] Provide REST endpoints for catalog, learner profile, registration, learning records, operations and staff actions.
- [x] Publish interactive API documentation and save the OpenAPI specification in the repository.
- [x] Enforce prototype token scopes and selected-learner ownership checks for learning, payment and operation access.
- [x] Use actor-scoped idempotency keys for workflow commands.
- [x] Protect final-seat allocation with database transactions and locking.
- [x] Record synthetic orders and queue durable simulated enrollment operations.
- [x] Implement worker stages for simulated identity preparation and simulated enrollment, with automatic learner status updates.
- [x] Expire timed-out prototype reservations and record audit events.
- [x] Provide staff reconciliation counts and recent audit activity.
- [x] Keep API/worker outside production mode and bind local services to loopback.

### Accessibility and verification

- [x] Add accessibility to the standing repository review/test checklist.
- [x] Improve text contrast, placeholders, form boundaries and visible keyboard focus.
- [x] Add a functioning skip link and descriptive course-link names; correct price heading markup.
- [x] Check topic selection and spotlight navigation by keyboard, including focus return and selected states.
- [x] Check labels, landmarks, image alternatives and spotlight control sizes.
- [x] Verify affected catalog, sign-in and My learning layouts at narrow screen widths.
- [x] Add integration tests for scopes, validation, publication conflicts, seat concurrency, idempotent payment and approval gating.
- [x] Add tests for normalized user lookup, learner isolation, cross-user payment rejection, session restoration and sign-out.
- [x] Record implementation status and remaining tasks in this document.

## Recommended next prototype tasks

Complete these using synthetic data and local services before moving to external integrations.

1. [x] Verify the complete registration flow for Scheduled and Self-paced courses, with and without approval, using separate learner accounts.
2. [x] Review learner messages and actions for pending approval, declined requests, no seats, expired reservations, renewed reservations and duplicate registration. Declined → request again → pending → approved was reviewed in the browser as the affected learner on October 6, 2026.
3. [x] Exercise simulated payment through completed enrollment after the individual-user change; verify that other learners cannot see its operation or course record.
4. [x] Add controlled simulation of delayed or failed provisioning and a staff recovery interface with reason and audit history.
5. [ ] Add meaningful integration checks for reservation expiry/renewal and worker interruption/restart. A manual crash/restart drill passed on October 5, 2026; automated expiry/renewal and restart checks are still pending.
6. [x] Decide and implement course launch behavior for the prototype. Decided October 6, 2026: an **Open course in Canvas** link appears once enrollment completes (placeholder URLs for samples).
7. [x] Expand staff offering management beyond create/publish, including reviewed editing, unpublishing and validation/error states. Completed October 6, 2026: one offering form for create and edit, reason-gated published edits, unpublishing, append-only price history and quoted prices.
8. [ ] Improve user/profile presentation if needed; email is currently the only sign-in identity attribute, with no profile editing screen.
9. [ ] Add automated accessibility scanning and manual screen-reader review for sign-in, registration, status changes, staff forms, dialogs and tables.
10. [ ] Test zoom, forced colors, error announcements and cross-browser behavior; record unresolved findings before accepting the UI baseline.
11. [ ] Add CI for type checks, build and integration checks with isolated test services, and review the current uncommitted implementation for a repository checkpoint.

## Integration and production tasks

These depend on approved contracts and policies in the [implementation plan](../implementation-plan.md). Prototype simulations do not complete these tasks.

### Identity and access

- [ ] Choose and implement real learner authentication, email ownership verification and approved university identity linking.
- [ ] Implement staff SSO/MFA and scoped roles; replace open demo staff access.
- [ ] Define production API/service-account authorization and remove demo learner selection.
- [ ] Agree on the IT identity contract, sponsorship boundaries, activation, expiry and reinstatement rules.
- [ ] Connect approved identity test services with ambiguity handling, bounded retries and owned exceptions.

### Payments and learning access

- [ ] Confirm capacity, enrollment windows, approval expiry, access duration, tax and refund policies.
- [ ] Separate reusable course products from offerings where needed; add validated Canvas mappings and immutable price history.
- [ ] Integrate Stripe test Checkout, durable session mappings and signed webhooks.
- [ ] Test expired, abandoned, failed, duplicate and out-of-order payment events, including reconciliation before seat release.
- [ ] Connect isolated Canvas services, verify authoritative enrollments and provide course launch links.
- [ ] Add order/access notices and approved activation messaging responsibilities.

### Support and operations

- [ ] Implement refunds, withdrawals, disputes and recoverable course transfers under approved policies.
- [ ] Implement Courtesy lifecycle rules and notices through IT-controlled operations; exclude existing CedarNet identities.
- [ ] Replace simulated reconciliation with authoritative payment, identity and Canvas evidence.
- [ ] Add support exception ownership, scoped recovery actions, dashboards and alerts.
- [ ] Test backup/restore, secret rotation, deployment, retention and rollback procedures.
- [ ] Complete accessibility, security, privacy, Finance and operational acceptance gates before a closed pilot.

## Project migration and cutover tasks

This is a separate project workstream, conditional on replacing an existing course platform. It is not a portal feature, and no live content migration or cutover was performed in this prototype work.

- [x] Define migration and cutover and document their sequence separately from portal workflows.
- [ ] Confirm the source platform, course inventory, staffing and scope with Program Operations.
- [ ] Decide how to transfer or preserve active enrollments, historical records, grades and certificates.
- [ ] Migrate a representative course to Canvas and complete course-owner content, access and record QA.
- [ ] Prepare active-learner continuity, notices, support and rollback procedures.
- [ ] Obtain cutover approval before redirecting learners; retire the source only after continuity and retention gates pass.

## Verification evidence

The latest functional change passed `npm run typecheck`, `npm test`, formatting checks and `git diff --check`. The database migration was run twice successfully. An optimized build passed earlier in prototype development; it was not rerun after the latest individual-user change.

Browser verification used two synthetic emails: the first registered Practical Data Analysis and retained it after reload; the second had an empty learning list. Returning with different capitalization restored the first user's registration. Keyboard submission/sign-out and a visible focus outline were checked, and My learning fit a 320px viewport without horizontal overflow. These checks do not establish real authentication security.

Automated accessibility scanning and a real screen-reader session remain outstanding. No real payments, university identity changes, Canvas enrollments or production deployment were performed. No new GitHub issues were created for this work.

| Evidence | Location |
| --- | --- |
| Overall behavior and test record | [Verification notes](verification.md) |
| Detailed initial accessibility review | [Accessibility check](accessibility-check.txt) |
| Current learner view | [Database-backed My learning screenshot](database-backed-learning.jpg) |
| Catalog terminology | [Scheduled and Self-paced screenshot](catalog-scheduled-self-paced.jpg) |
| Spotlight design | [Featured course screenshot](catalog-course-spotlight.jpg) |
| UI baseline | [UI specification](ui-specification.md) |
| Database structure | [Mermaid ERD](database-erd.mmd) |
| API contract | [OpenAPI specification](../openapi.json) |
| Architecture and boundaries | [Local prototype ADR](../adr/0001-local-prototype.md) |
| UI asset attribution | [Image credits](image-credits.md) and [logo source](../../src/web/public/brand/SOURCE.txt) |

## Latest implementation record

October 6, 2026: converted four status and type columns to PostgreSQL enums (issue #2 follow-up).
- **Migration:** `prisma/migrations/1_status_enums` converts `course_type`, `entitlements.status`, `operations.status` and `operations.simulated_outcome` in place, replacing four value-list checks and recreating the schedule rule. Prisma's draft would have dropped and re-added the columns, deleting their data, so the migration was rewritten by hand.
- **Code:** request validation now reads the allowed values from the generated `CourseType` and `SimulatedOutcome` enums, and raw SQL casts parameters written to enum columns.
- **Verification:**
  - Migration tests 9/9: enum types exist, invalid values are rejected, statuses survive adoption, there is no drift, and the structure is identical at 183 elements.
  - On the main database, after a backup, all 10 tables were unchanged row for row and the columns use the enum types.
  - The integration suite passes 14/14, and the catalog and My learning render unchanged.

October 6, 2026: issue #2 Phase 2 (queries and transactions on Prisma), on branch `prisma-adoption`.
- **Single client:** `src/domain/prisma.ts` creates one `PrismaClient` over the existing `pg` pool, keeping the local-only guard. It provides `transaction()` (interactive, maxWait 10 s, timeout 20 s), `sql()` (raw SQL with bound parameters) and `offeringColumns()`, which avoids duplicate date columns in raw selects.
- **Service:**
  - Routine reads and simple writes use the typed client.
  - Locking and computed SQL stays raw inside the same transaction: offering and registration row locks, advisory locks for idempotency, final-seat counts, the registration upsert, approval expiry, the enrollment window and seat counts, and the audit-label joins.
  - The auth guard and API startup check use Prisma. Startup now requires the Prisma baseline.
- **Worker:** each step runs in one transaction, keeping `FOR UPDATE SKIP LOCKED` claiming.
- **Probe findings** from a rolled-back probe transaction: Prisma cannot read `void`, so advisory locks are wrapped, and uncast counts return bigint. All other parameter and result types behaved as they did under `pg`.
- **TypedSQL** was not adopted because it needs a database during generation; raw rows are typed from the generated models instead.
- **Verification:**
  - The integration suite passes 14/14, covering concurrency, idempotent payment/retry, cross-user rejection and worker-driven flows. The migration suite passes 9/9.
  - Worker crash drill: the worker was force-killed (`kill -9`) during a delayed job, and after restart the job completed exactly once (1 order, 1 audit event per step).
  - Browser smoke test: sign-in form, catalog, course page registration, payment to enrolled with the Canvas link, all staff tabs, and price history in the edit dialog.
  - API, worker and auth code no longer query `pg` directly.

October 6, 2026: issue #2 Phase 1 (Prisma migration foundation), on branch `prisma-adoption`.
- **Packages and decision:** pinned Prisma 7.10.0 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), recorded in [ADR 0002](../adr/0002-prisma-orm.md).
- **Schema and baseline:** introspected `prisma/schema.prisma`, keeping snake_case fields. The baseline `prisma/migrations/0_baseline` reproduces legacy migrations 001–007 exactly, including the checks, the price-history trigger and the seed.
- **Commands:** a single migration command `npm run db:migrate` (advisory lock, guarded adoption, `migrate deploy`), plus `db:migrate:status`, `db:migrate:draft` (disposable shadow database) and `db:generate`. The old `scripts/migrate.ts` runner moved to `scripts/legacy-migrations.ts` for history and catch-up.
- **Migration tests:** `npm run test:migrations`, 9 tests on disposable databases:
  - fresh install
  - repeat no-op
  - adoption preserving records
  - fresh/adopted structure identical (187 elements)
  - 001–003 catch-up
  - unknown state refused
  - concurrent runs serialized
  - no drift against `schema.prisma`
  - failed-migration recovery plus a data-preserving schema change

  Finding: Prisma does not wrap migrations in a transaction, so drafted migrations add `BEGIN`/`COMMIT`.
- **Main database adoption:** backed up first (git-ignored `backups/`), then adopted. Every row in all 10 tables matches the backup restored into a disposable database, the structure matches a fresh baseline, and a second run is a no-op.
- **Checks:** the app suite (14/14), typecheck and build pass. Application queries are unchanged until Phase 2.

October 6, 2026 (final): unpublished offerings now have their own status. Migration `007_unpublished_status.sql` adds `offerings.unpublished_at`, which unpublishing sets and publishing clears, backfilled from audit events. Staff see Draft, Published or Unpublished chips and filter options. Unpublished offerings keep the reason requirement and protected terms when edited. The integration suite is extended (14/14 pass), and the browser check covered all three labels, the Unpublished filter and the edit note, using a temporarily unpublished synthetic course that was then republished.

October 6, 2026 (later): completed staff offering management and the offering form.
- **Database:** migration `006_offering_management.sql` adds the append-only `offering_prices` table (a trigger rejects updates; rows are removed only with their offering) and `entitlements.quoted_price_cents`.
- **API:**
  - `POST /offerings/{id}/edit` (version-checked). Drafts change freely. Published offerings need a reason of 10–500 characters, keep their course type and approval requirement, keep their dates while learners are registered, and cannot drop capacity below seats in use. Each edit is audited as `offering.edited` with before/after values. A price change appends a price-history row.
  - `POST /offerings/{id}/unpublish` needs a reason. It hides the offering and stops new registrations and payments; paid enrollments continue. Audited as `offering.unpublished` with the number of affected registrations.
  - `GET /offerings/{id}/prices`.
  - Reservations store the price quoted at reservation time, and payment charges that price. The staff offering list adds `active_registrations` and `seats_in_use`.
- **UI:**
  - One `OfferingForm` for New offering and Edit replaces the inline create dialog and the separate Settings dialog. It has field-level validation, a focused error summary with links, locked-field explanations, a reason field and price history for published offerings.
  - An Unpublish dialog states the impact and needs a reason. Row actions are Edit plus Publish or Unpublish.
  - Learners with an unpaid registration for an unpublished course see "No longer offered" and a note, with no actions and no link. Payment text uses the quoted price.
- **Verification:** two new integration groups (14/14 pass). In the browser, from the keyboard: create validation and save; publish; a published edit with locks, required reason and price change; unpublish validation and confirmation; and the learner view of an unpublished course. Walkthrough data was removed and the temporarily unpublished sample course was republished.

October 6, 2026: implemented four policy decisions (see the implementation plan's Policy decisions).
- **Database:** migration `005_enrollment_policies.sql` adds per-offering `approval_valid_days`, `enrollment_close_days` and `canvas_course_url`, plus `entitlements.approval_expires_at` and the `approval_expired` status. Existing approvals got a fresh validity period, and sample offerings got placeholder `canvas.example.edu` links.
- **API:**
  - Registration enforces the enrollment window, reuses a still-valid approval and lets declined or lapsed learners request again. Registrations already in progress are returned unchanged.
  - Approval sets the expiry, and the worker lapses unused approvals.
  - The new `POST /offerings/{id}/settings` (version-checked, audited) changes the three settings.
  - Catalog and learner responses include `enrollment_closes_on` and `enrollment_open`. The Canvas URL is returned only for enrolled registrations.
- **UI:**
  - Learners see an approval deadline and a **Request approval again** action, and a closed-enrollment message instead of an action once enrollment closes. Enrolled courses show **Open course in Canvas** (new tab, labelled) or a not-yet-mapped note.
  - The course page shows when enrollment closes, the approval period, and a disabled "Enrollment closed" button. Catalog cards get an "Enrollment closed" chip.
  - Staff get the new fields in New offering, a per-offering Settings dialog (field validation, an error summary that takes focus and links to fields, and the calculated closing date), closing dates in the offerings list, and an approval confirmation that states the reservation period.
- **Verification:** three new integration groups (12/12 pass) cover the window, version conflicts and validation, approval period, lapse, repeat requests, changed periods, and the Canvas link appearing only after enrollment. In the browser:
  - Settings dialog error summary and links, save, and focus return.
  - Declined → request again → approved with the 7-day deadline, as learner B.
  - Closed enrollment on the learner card, course page and catalog, by temporarily backdating a synthetic course and then restoring it.
  - Canvas links as learner A.
  Sample offering settings were restored to their defaults afterwards.

October 5, 2026: closed two M1 accessibility gaps and added simulated provisioning failure with staff recovery (M3).
- **Accessibility:** My learning action buttons stay focusable while busy (`aria-disabled`). After an action, focus moves to the next step's button or to the course heading. Background status changes are announced once through a polite live region. Static status, staff and sign-in notices use `role="note"` instead of `role="alert"`.
- **Failure simulation:** migration `004_provisioning_failures.sql` adds `prototype_settings` and per-operation `simulated_outcome`, `attempts`, `delay_applied` and `failed_at`. Staff choose the outcome for new payments: normal, delayed, temporary failure, identity failure or Canvas failure. The worker retries a failed step up to three times with increasing delay, then marks the registration `exception` and records `prototype.provisioning_failed`.
- **Staff recovery:** a new Staff → Exceptions tab offers a review dialog with failure reason and history, plus Retry provisioning or Record manual enrollment. Both require a reason of at least 10 characters, which is audited. New API routes are `GET /exceptions`, `POST /exceptions/{id}/retry`, `POST /exceptions/{id}/resolve` and `GET`/`POST /prototype/simulation`, with a new staff-only `exceptions:resolve` scope. The reconciliation report adds `open_exceptions`.
- **Learner view:** learners see "taking longer than usual" during automatic retries, and a warning with the failed step marked once staff review is needed.
- **Verification:** two new integration groups (9/9 pass) cover identity failure, bounded retries, the queue, scopes, staff retry, Canvas failure with manual resolution, and temporary failure that recovers automatically. In the browser, the full failure → exception → staff retry → enrolled flow was run from the keyboard, with focus checks (focus returns to the queue heading after recovery) and phone and dark-mode layouts. Worker crash drill: the worker was force-killed (`kill -9`) during a delayed job, the job stayed untouched while overdue, and after restart it completed exactly once with no duplicate audit events or orders. OpenAPI snapshot refreshed.

October 2, 2026: replaced the Inter placeholder with Figtree, a free font similar to Proxima Nova (the cedarville.edu font, which requires a paid Adobe Fonts license). It is self-hosted through `next/font`. Brand approval of the substitute is still pending.

October 2, 2026: completed the staff tables. Offerings, approvals and activity now have sortable columns (`aria-sort`, keyboard operable), with a sort select on phones. Approvals and activity gained search. All three tables page at 10, 25 or 50 rows, through a shared `table-view` helper. The activity API now returns the 200 most recent events instead of 50. Recorded the [UI specification](ui-specification.md). Verified: typecheck, Prettier, `npm test`; in the browser, keyboard column sorting in both directions, activity paging, search narrowing back to page 1, and phone layout at 375px with no overflow.

October 2, 2026: modernized the UI baseline. Changes: Inter font, self-hosted by `next/font` (a placeholder until a brand font is approved); light and dark themes that follow the OS setting, with fixed navy brand surfaces; larger corner radius; compact mobile header with an accessible menu; shorter prototype banner on phones; no spotlight image on phones; course-type filter and sort, with search, topics, type and sort kept in the URL; card hover and focus feedback; loading placeholders instead of spinners; brief confirmations after learner and staff actions; course registration panel first on phones and sticky on desktop; staff offering search and status filter; phone card layouts for staff offerings, approvals and activity; readable activity events with learner email and course title (`/reconciliation` audit rows gained `actor_email`, `offering_title` and `subject_email`). Verified: typecheck, Prettier, `npm test`, production build, and computed WCAG contrast for the new dark palette (body text 7.8:1 or higher, input borders 3.97:1). In the browser: light and dark themes, 375px and 1280px layouts with no page overflow, keyboard open/close of the mobile menu with focus return, URL filter restoration, and the confirmation pop-up. Not performed: screen-reader session, forced colors, cross-browser check. `next build` now needs network access to fetch the font on the first build.

October 1, 2026: verified the registration matrix through the web proxy with two synthetic learners: Scheduled and Self-paced courses, each with and without approval, through simulated payment to enrolled. All 32 checks passed, covering learner isolation of records, operations and payment; payment before approval; approve, decline and repeat decisions; duplicate registration; and no seats. Forced expiry confirmed that stale reservations cannot be paid, an expired seat can be renewed when free, renewal fails when another learner holds the seat, and approval carries over after expiry. Fixes: the worker now records a `seat.expired` audit event (earlier expiries were not audited); the course page now reports the learner's actual status (it previously said "registration is saved" to enrolled or declined learners) and moves focus to the next action; My learning shows action errors beside the affected course instead of a page-top error that the next poll cleared. Typecheck, formatting and `npm test` passed; the no-seats error was checked at 320px width. Remaining accessibility gaps: on My learning, keyboard focus drops to the page when an action button is disabled or replaced; every MUI alert uses `role="alert"`, including static status text; no screen-reader session was performed. Approval currently survives reservation expiry; approval-expiry policy is still undecided. Verification created synthetic `verify-*@example.test` learners and two `Verify …` offerings in the local database.

October 1, 2026: added migration `003_demo_users.sql`, normalized learner lookup, the web demo-session endpoint and cookie, selected-learner API context, persistent individual registrations, staff requester emails, and the Self-paced registration fix. Updated the ERD, API documentation, domain context, architecture decision and README. Added integration tests and saved the current My learning screenshot.

October 1, 2026: created this progress checklist and linked it from the README. Earlier work completed the local application foundation, catalog layout/filter/image/spotlight iterations, Cedarville branding, initial accessibility fixes, course types, workflow diagrams and simulated registration/fulfillment.

For future updates, check a task only after its implementation and relevant verification are complete, add evidence and any remaining limitations, and retain the distinction between prototype behavior and production readiness. GitHub issue creation requires an explicit user request.
