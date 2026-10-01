# Prototype implementation progress

Updated October 1, 2026. This document records the current local prototype, completed tasks, verification evidence, and remaining work. Checked items mean implemented for the prototype; they do not imply production readiness. Unchecked items are proposed work, not authorization to deploy, connect production services, or create GitHub issues.

The portal now supports database-backed catalog browsing, individual demo learners, registration and approval, simulated payment, and simulated enrollment. The recommended next step is to complete and verify the registration experience across both Scheduled and Self-paced courses, including approval decisions, expired reservations, and failure states.

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

1. [ ] Verify the complete registration flow for Scheduled and Self-paced courses, with and without approval, using separate learner accounts.
2. [ ] Review learner messages and actions for pending approval, declined requests, no seats, expired reservations, renewed reservations and duplicate registration.
3. [ ] Exercise simulated payment through completed enrollment after the individual-user change; verify that other learners cannot see its operation or course record.
4. [ ] Add controlled simulation of delayed or failed provisioning and a staff recovery interface with reason and audit history.
5. [ ] Add meaningful integration checks for reservation expiry/renewal and worker interruption/restart; the worker is durable by design, but a crash/restart drill is still pending.
6. [ ] Decide and implement course launch behavior for the prototype. The current enrolled state explicitly says a live link will appear after Canvas is connected.
7. [ ] Expand staff offering management beyond create/publish, including reviewed editing, unpublishing and validation/error states.
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
| Database structure | [Mermaid ERD](database-erd.mmd) |
| API contract | [OpenAPI specification](../openapi.json) |
| Architecture and boundaries | [Local prototype ADR](../adr/0001-local-prototype.md) |
| UI asset attribution | [Image credits](image-credits.md) and [logo source](../../src/web/public/brand/SOURCE.txt) |

## Latest implementation record

October 1, 2026: added migration `003_demo_users.sql`, normalized learner lookup, the web demo-session endpoint and cookie, selected-learner API context, persistent individual registrations, staff requester emails, and the Self-paced registration fix. Updated the ERD, API documentation, domain context, architecture decision and README. Added integration tests and saved the current My learning screenshot.

October 1, 2026: created this progress checklist and linked it from the README. Earlier work completed the local application foundation, catalog layout/filter/image/spotlight iterations, Cedarville branding, initial accessibility fixes, course types, workflow diagrams and simulated registration/fulfillment.

For future updates, check a task only after its implementation and relevant verification are complete, add evidence and any remaining limitations, and retain the distinction between prototype behavior and production readiness. GitHub issue creation requires an explicit user request.
