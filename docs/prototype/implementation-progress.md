# Prototype implementation progress

Updated October 7, 2026. This document records the current local prototype, completed tasks, verification evidence, and remaining work. Checked items mean implemented for the prototype; they do not imply production readiness. Unchecked items are proposed work, not authorization to deploy, connect production services, or create GitHub issues.

The prototype now covers the full simulated registration lifecycle: catalog, individual demo learners, approval with expiry, simulated payment at the quoted price, simulated enrollment with failure injection and staff recovery, and a Canvas link after enrollment. Staff sign in as synthetic role-based members (mock sign-in, SSO later), manage offerings, staff and learners, and see a sample enrollment and sales dashboard. The database schema is managed by Prisma migrations with automated migration tests. The dated record at the end of this document gives details of each change.

## Current implementation

| Area         | Current behavior                                                                                                                                                                                                                            | Remaining boundary                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website      | Next.js and Material UI; light and dark themes, phone layouts, sortable and paged staff tables, Figtree font                                                                                                                                | Final institutional design, brand approval of the font, screen-reader and cross-browser review                                                        |
| Database     | PostgreSQL in Docker; Prisma 7.10 schema and eight migrations (`0_baseline` to `7_featured_explore`), with enums, checks and an append-only price-history trigger                                                                           | Production hosting, backup and retention decisions                                                                                                    |
| Learners     | One learner per normalized email; registrations persist; private saved courses and followed pathways; Support can deactivate and reactivate access                                                                                          | Mock sign-in does not prove email ownership; no real authentication                                                                                   |
| Registration | Enrollment windows, approvals that expire (default 7 days), repeat requests after a decline or lapse, quoted prices                                                                                                                         | Production capacity, tax and refund policies                                                                                                          |
| Payments     | Explicit simulated payment command and synthetic orders                                                                                                                                                                                     | No Stripe connection or real financial transaction                                                                                                    |
| Enrollment   | Worker simulates identity preparation and Canvas enrollment, with injected delays and failures, bounded retries and an exceptions queue                                                                                                     | No university identity or Canvas connection; Canvas links are placeholders                                                                            |
| Staff        | Role-based mock sign-in (seven roles, seven demo members on `cuce.test`); offering create, edit, publish and unpublish; curated collections and pathways; approvals; exceptions; activity; Learners, Staff and Roles tabs; sample dashboard | Staff SSO and MFA are a later add-on ([ADR 0004](../adr/0004-staff-roles-mock-sign-in.md)); sales figures are simulated; completion data needs Canvas |
| Automation   | REST API under `/api/v1`, OpenAPI, scoped local tokens, idempotent commands and operation status                                                                                                                                            | Production service accounts, OAuth and outbound notifications                                                                                         |

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
- [x] Create and update the database ERD.
- [x] Record M0 decisions in a [decision register](../decision-register.md) and ADRs 0001–0004, including the decision not to use Canvas Catalog.
- [x] Add the requested features (dashboards, sales pages, pathways, collections, memberships, coupons, bulk enrollment, user exports) to the plan with decisions F1–F11.

### Database and migrations

- [x] Adopt Prisma with a baseline that reproduces legacy migrations 001–007 and adopts existing databases without data loss.
- [x] Provide one migration command with an advisory lock, a guarded adoption path and a draft command using a disposable shadow database.
- [x] Convert status and type columns to PostgreSQL enums in place.
- [x] Move API, worker and auth queries to Prisma, keeping locking SQL raw within the same transaction.
- [x] Add nine migration tests on disposable databases (fresh, repeat, adoption, catch-up, refusal, concurrency, drift, failure recovery).

### Catalog and interface

- [x] Build catalog, course detail, My learning, sign-in and staff screens with standard Material UI components.
- [x] Add list/grid switching, course photos, search, multi-select topic, type and sort filters kept in the URL, and a course spotlight.
- [x] Use the official Cedarville Continuing Education logo and a free font similar to the university's.
- [x] Distinguish Scheduled courses with dates from Self-paced courses that show Start anytime.
- [x] Add light and dark themes, phone layouts, loading placeholders and brief confirmations.
- [x] Add sortable, searchable, paged staff tables with card layouts on phones.
- [x] Add staff-curated collections and pathways: a catalog Collection filter, public collection and pathway pages, and "Part of" links on course pages.
- [x] Let learners save courses privately and follow pathways, both shown in My learning; neither registers or charges.
- [x] Open the catalog on an Explore tab (staff-picked courses, pathways and collections with automatic fill), beside Courses, Collections and Pathways tabs; group My learning into Enrolled courses and Registrations.

### Learners and registration

- [x] Implement mock sign-in accepting any email and nonempty password; keep passwords out of requests and storage.
- [x] Create or retrieve a learner by normalized email; isolate each learner's registrations, payments and operations.
- [x] Implement registration, temporary seat reservations, approval requests and staff decisions.
- [x] Enforce enrollment windows and approval expiry; allow repeat requests after a decline or lapse.
- [x] Record the price quoted at reservation and charge it at payment.
- [x] Show an **Open course in Canvas** link only after enrollment completes.
- [x] Let Support deactivate and reactivate learner access with a reason and audit.

### API and simulated fulfillment

- [x] Provide REST endpoints, interactive OpenAPI documentation and a saved specification.
- [x] Enforce token scopes, selected-learner ownership and role-based staff scopes.
- [x] Use actor-scoped idempotency keys and protect final-seat allocation with transactions and locks.
- [x] Run worker stages for simulated identity and enrollment; expire reservations and lapsed approvals with audit.
- [x] Simulate delayed, temporary and permanent failures with bounded retries and a staff exceptions queue.
- [x] Let staff retry provisioning or record a manual enrollment, with a required reason and audit history.

### Staff

- [x] Create, edit (reason required once published), publish and unpublish offerings, with append-only price history.
- [x] Add role-based mock staff sign-in, permission-aware actions, and Staff and Roles management tabs.
- [x] Add a Learners tab with details, activity and account access.
- [x] Add the Content editor role (view-only until sales pages exist).
- [x] Add a sample dashboard: enrollment KPIs, a trend chart and an offering table for all staff, simulated sales for Finance, and a completion placeholder.

### Accessibility and verification

- [x] Add accessibility to the standing repository review/test checklist.
- [x] Improve contrast, focus visibility, labels, landmarks, image alternatives and a skip link.
- [x] Keep busy buttons focusable, move focus to the next action, and announce background changes politely.
- [x] Move focus to error summaries, including after server failures.
- [x] Check affected workflows from the keyboard, at phone width and in dark mode after each change.
- [x] Maintain 20 API integration groups covering scopes, concurrency, idempotency, policies, failures, roles, learners, the dashboard, collections and pathways, and Explore.
- [x] Run axe scans (WCAG 2.2 A and AA) of 28 pages, tabs and dialogs in light, dark and phone layouts, and run every check in CI on each pull request.

## Recommended next prototype tasks

Complete these using synthetic data and local services before moving to external integrations.

1. [x] Add CI for format, type checks, build, migration tests and integration tests with an isolated database. Added October 7, 2026.
2. [ ] Add automated accessibility scans (axe) for the key pages and dialogs, then a manual screen-reader review of sign-in, registration, status changes, staff forms, dialogs and tables. The scans were added October 7, 2026; the screen-reader review is still pending.
3. [x] Build staff-curated collections, private saved courses and pathway browsing (decisions F3 and F4). Built October 7, 2026, on the recommended F3 answer and proposed F4 assumptions.
4. [ ] Add automated checks for reservation expiry and renewal and for worker restart. A manual crash/restart drill passed on October 5 and 6, 2026.
5. [ ] Test zoom, forced colors, error announcements and cross-browser behavior; record unresolved findings before accepting the UI baseline.
6. [ ] Improve the learner profile if needed; email is the only identity attribute and there is no profile screen.

## Integration and production tasks

These depend on approved contracts and policies in the [implementation plan](../implementation-plan.md). Prototype simulations do not complete these tasks.

### Identity and access

- [ ] Choose and implement real learner authentication, email ownership verification and approved university identity linking.
- [ ] Add staff SSO and MFA to the existing role model, replacing mock staff sign-in.
- [ ] Define production API/service-account authorization and remove demo learner selection.
- [ ] Agree on the IT identity contract, sponsorship boundaries, activation, expiry and reinstatement rules.
- [ ] Connect approved identity test services with ambiguity handling, bounded retries and owned exceptions.

### Payments and learning access

- [ ] Confirm capacity, tax and refund policies.
- [ ] Separate reusable course products from offerings where needed; add validated Canvas mappings.
- [ ] Integrate Stripe test Checkout, durable session mappings and signed webhooks.
- [ ] Test expired, abandoned, failed, duplicate and out-of-order payment events, including reconciliation before seat release.
- [ ] Connect isolated Canvas services, verify authoritative enrollments and replace placeholder course links.
- [ ] Build the completion dashboard from Canvas data (decision F11).
- [ ] Add order/access notices and approved activation messaging responsibilities.

### Support and operations

- [ ] Implement refunds, withdrawals, disputes and recoverable course transfers under approved policies.
- [ ] Implement Courtesy lifecycle rules and notices through IT-controlled operations; exclude existing CedarNet identities.
- [ ] Replace simulated reconciliation and sales figures with authoritative payment, identity and Canvas evidence.
- [ ] Add alerts and production support ownership for exceptions.
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

As of October 7, 2026: `npm run typecheck`, the production build, Prettier, the integration suite (20/20), the migration suite (9/9) and the accessibility scans (84/84) pass. Every migration of the main database was preceded by a backup and checked row for row or by tests. Worker crash drills (`kill -9` during a delayed job) completed each job exactly once.

Browser checks after each change used synthetic learners and demo staff, from the keyboard, at phone width and in dark mode; the dated record lists them. These checks do not establish real authentication security.

A real screen-reader session, forced colors and cross-browser checks remain outstanding. No real payments, university identity changes, Canvas enrollments or production deployment were performed.

| Evidence                              | Location                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Overall behavior and test record      | [Verification notes](verification.md)                                                      |
| Detailed initial accessibility review | [Accessibility check](accessibility-check.txt)                                             |
| Current learner view                  | [Database-backed My learning screenshot](database-backed-learning.jpg)                     |
| Catalog terminology                   | [Scheduled and Self-paced screenshot](catalog-scheduled-self-paced.jpg)                    |
| Spotlight design                      | [Featured course screenshot](catalog-course-spotlight.jpg)                                 |
| UI baseline                           | [UI specification](ui-specification.md)                                                    |
| Database structure                    | [Mermaid ERD](database-erd.mmd) and [Prisma schema](../../prisma/schema.prisma)            |
| API contract                          | [OpenAPI specification](../openapi.json)                                                   |
| Decisions                             | [Decision register](../decision-register.md) and [ADRs](../adr/)                           |
| UI asset attribution                  | [Image credits](image-credits.md) and [logo source](../../src/web/public/brand/SOURCE.txt) |

## Latest implementation record

October 7, 2026: in My learning, the **Available to you** section is renamed **Enrolled courses**, without the description line under the heading.

October 7, 2026: placeholder Canvas links open an explanation instead of a dead page. **Open course in Canvas** checks the offering's Canvas address. Reserved example and test domains (the sample `canvas.example.edu` addresses) open a "Canvas course not connected yet" dialog showing the placeholder; real addresses still open in a new tab. Replacing the address on the offering is all that is needed later. Checked from the keyboard (the dialog opens for the right course; Escape closes it and focus returns to the button), and a new accessibility scan enrolls its synthetic learner through the normal flow and scans the dialog.

October 7, 2026: enrolled courses in My learning show no progress steps, and courses with a Canvas link are listed first under Available to you, then ready now, then upcoming. Checked in the browser with a synthetic learner who has three linked and two unlinked enrolled courses.

October 7, 2026: My learning grouped, and For you removed from the catalog (branch `curation`).

- **My learning:** registrations are split into **Available to you** (enrolled courses, ready now first, then upcoming by start date) and **Registrations** (everything in progress, with declined and expired requests last), above Pathways you follow and Saved courses. Followed pathways mark the **Next** course: the first not registered, or whose request expired, lapsed or was declined.
- **Focus:** when the worker enrolls a course, its card moves between groups. If focus was inside it, focus now follows the card to Open course in Canvas instead of dropping to the page.
- **Catalog:** the For you section was removed from Explore. Its pathway next-step moved to My learning, which is now the signed-in landing page.
- **Verification:**
  - In the browser, as a synthetic learner with an enrolled course, a reservation, an approval request and a followed pathway: the grouping and order; the Next chip; and paying from the keyboard, where after the worker enrolled the course the card moved to Available to you with focus on its Canvas link and the change announced.
  - Accessibility scans pass, with the former For you scan replaced by My learning with a followed pathway and a saved course.
  - The walkthrough learner was removed afterwards.

October 7, 2026: global list/grid layout and My learning as the signed-in landing page (branch `curation`).

- **Layout toggle:** List/Grid moved from the Courses results header to the catalog tab row, so it applies to Explore, Courses, Collections and Pathways; it is still remembered in the browser. Collection and pathway cards gained a list layout, with details and the View button in a side column from `sm` up.
- **Landing:**
  - Signing in without a return page now goes to **My learning**, not the catalog.
  - A signed-in learner who opens the bare home page from outside the site is sent to My learning. This happens only on a fresh visit (not a reload or back/forward), at most once per page load. In-site links such as **Courses**, and links to a tab or filter, still open the catalog.
- **Pathway cards:** no longer list their courses; the pathway page shows them in order. The unused course titles were dropped from `GET /collections`.
- **Fix:** a signed-in visit to a tab link such as `/?tab=explore` was redirected to My learning. The page tidies `?tab=explore` to `/` before the session is known, so the check now uses the address the page first loaded with. The accessibility scan of For you caught this.
- **Fix:** sign-in now also returns to collection and pathway pages. Before, **Sign in to follow this pathway** dropped the learner on the home page, because only course pages and My learning were accepted.
- **Verification:** in the browser:
  - list layout on Explore and the Pathways tab
  - form sign-in landing on My learning
  - a fresh visit to `/` redirecting
  - the header Courses link, a `?tab=` link and a reload of `/` all showing the catalog

  Typecheck, the build and the accessibility scans pass; the Explore scan now opens `/?tab=explore`, since `/` redirects signed-in learners.

October 7, 2026: Explore landing tab with a personalized For you section (branch `curation`).

- **Catalog tabs:** the catalog now opens on **Explore**, beside complete **Courses**, **Collections** and **Pathways** tabs. The tab is kept in the URL, and empty tabs are hidden. Counts are hidden on phones so all four tabs fit at 375px. The Collection dropdown filter was removed; older `?collection=` links open the Courses tab with an "In: …" chip and a named Remove button.
- **Explore:** featured courses (up to 5) first, then pathways (up to 3) and collections (up to 3), in the same order on the staff tab, each with "See all" buttons that select the matching tab and move focus to it. The hard-coded three-course spotlight was replaced, and its picks were carried over as the first featured courses.
- **For you (signed-in learners):** the next course that is not registered in each followed pathway ("step N of M"), a note when registrations need action, and up to three saved courses. It uses registration status only; there is no completion data before Canvas.
- **Database:** migration `7_featured_explore` adds `featured_rank` to offerings (1–5) and collections (1–3 per kind), with checks, seeded from the former spotlight and the sample collections. Unpublishing clears it. The main database was backed up first.
- **API:** public `GET /explore` (staff picks in order, then automatic fill: open scheduled courses by soonest start, then the newest self-paced; newest collections and pathways). `GET /staff/explore` (`staff:read`) and `POST /staff/explore` (`catalog:write`, published items only, kind-checked, limits enforced, one audited `explore.updated` change). `GET /collections` now includes topics and the price range.
- **Staff:** an **Explore page** tab with three ordered lists. The ordering editor from the collection dialog was extracted into a shared `OrderedListEditor`. Its add select now stays enabled when full, because disabling it while focused dropped focus to the page; the menu then says "Limit of N reached".
- **Accessibility fixes found during the work:**
  - The scans flagged an inline link distinguished only by color; links inside sentences are now always underlined, including three in states the scans do not reach.
  - The deletable filter chip was replaced with a named button, because MUI chips delete only with Backspace or Delete.
- **Verification:**
  - Integration suite 20/20. The new group covers the scope check, unpublished and wrong-kind picks, limits, pick order and fill, unpublishing removing a pick, and audit. It restores the site's picks afterwards.
  - Migration tests 9/9 with no drift.
  - Accessibility scans 84/84, adding the Courses, Collections and Pathways tabs, Explore with For you, and the Explore page staff tab.
  - In the browser:
    - Explore signed out and signed in; registering step 1 advanced For you to step 2 and showed the action note.
    - Keyboard tab switching with the URL updated; "See all" focus moving to its tab; a legacy collection link.
    - As the catalog manager: filling featured courses to the limit with focus kept, saving, and the public order. The original picks were restored afterwards.
    - Phone width with no overflow.
  - The walkthrough learner and their registration were removed afterwards.

October 7, 2026: staff-curated collections, pathways and private saved courses (branch `curation`, decisions F3 and F4).

- **Assumptions, recorded as proposed in the decision register:** collections are staff-curated, and learners get a private Saved courses list (the F3 recommendation). Following a pathway is free and registers nothing, and the course order is a recommendation, not a prerequisite (F4). Bundled pricing, certificates and pathway progress are not built; progress waits for Canvas completion data (F11).
- **Database:** migration `6_collections_pathways` adds the `collection_kind` enum, `collections` (slug, title and summary checks; version), ordered `collection_items`, `saved_courses` and `pathway_follows`, all cascading with their parents. It seeds the synthetic Christian Leadership and Technology at Work collections and the Data-Informed Leader pathway from existing sample offerings. The main database was backed up first.
- **API:**
  - Public `GET /collections` and `GET /collections/{slug}` (published collections and published courses only), a `collection` filter on `GET /offerings`, and `collections` on the course detail.
  - Learner `GET`/`POST /me/saved-courses[/{offeringId}]` and `GET`/`POST /me/pathways[/{id}]` (idempotent commands; following checks the kind and publication).
  - Staff `GET /staff/collections` (`staff:read`, with follower counts), and `POST /collections`, `/collections/{id}/edit`, `/publish` and `/unpublish` (`catalog:write`, version-checked, audited). A published collection needs one published course; a pathway needs two.
- **UI:**
  - Catalog: a **Collection** filter kept in the URL, with the collection's summary and a link to its page.
  - New `/collections/{slug}` page: pathways list courses in recommended order with **Follow pathway**.
  - Course page: **Save course** and **Part of** links.
  - My learning: **Registrations**, **Pathways you follow** (with each course's registration status) and **Saved courses** sections.
  - Staff: a **Collections** tab with a dialog for type, title, address, summary and ordered courses (keyboard move up/down/remove with focus management and announcements), publish, and an unpublish confirmation. View-only for staff without `catalog:write`.
  - Save and follow buttons use action labels ("Remove from saved courses", "Stop following") rather than `aria-pressed`, so the accessible name says what happens.
- **Verification:**
  - A new integration group (19/19) covers the scope check, slug validation and uniqueness, publish minimums, order, hidden unpublished courses, the catalog filter, private saved lists, follow restrictions, "registers nothing", follower counts, unpublishing and audit actors. Migration tests 9/9 with no drift.
  - Accessibility scans 69/69, adding the filtered catalog, the pathway page, the Collections tab and the New and Edit collection dialogs.
  - In the browser, from the keyboard, as a synthetic learner: the URL-restored filter; following a pathway (focus stays, polite confirmation); saving from a course page; removing the only saved course in My learning (focus moves to the section heading, with an announcement and the empty message).
  - As the catalog manager: the dialog's error summary and links, choosing the type, adding courses, moving a course to the top (focus switches to Move down), removing a course (focus moves to the neighbour), saving a draft, and the server's refusal to publish with one published course.
  - As the approver at 375px: view-only cards with no overflow.
  - The walkthrough pathway and learner were removed afterwards.
- **Not covered:** screen-reader review of the new reorder controls and toggles, and the remaining gaps listed above.

October 7, 2026: continuous integration and automated accessibility scans (branch `ci`).

- **CI:** `.github/workflows/ci.yml` runs on every pull request and on pushes to `main` and `prototype-checkpoint`. It uses a throwaway PostgreSQL 18 service and generated tokens, then runs the format check, typecheck, migrations, migration tests (9), the production build, the integration suite (18) with the API, worker and built website started, and the accessibility scans. It never deploys or connects to external systems.
- **Accessibility scans:** `npm run test:a11y` runs axe through Playwright (pinned `@playwright/test` 1.63.0 and `@axe-core/playwright` 4.13.0) with the WCAG 2.2 A and AA rules. It covers the catalog, sign-in, course detail, My learning, staff sign-in, all eight staff tabs and five staff dialogs (New offering, Edit offering, Unpublish, Learner details, Add staff member), in light, dark and phone layouts: 54 scans.
- **Fixes from the first scan:**
  - In dark mode, red text buttons (Unpublish) had 4.4:1 contrast on the paper surface. The dark theme's error color is now `#f28b82` (6.7:1; 7.3:1 with dark text on filled error buttons).
  - Helper text on disabled fields ("Locked after publishing.") was faded below 4.5:1. It now keeps the secondary text color, because it explains why the field is locked.
- **Verification:** all 54 scans pass against the dev server and against a production build served by `next start`. The integration suite passes 18/18. The workflow will first run on GitHub when this branch's pull request opens.
- **Not covered:** scans see only the page states listed above, not every error state, and catch only part of WCAG. The manual screen-reader review, forced colors, zoom and cross-browser checks are still pending.

October 7, 2026: requested feature additions and the Content editor role (branch `content-editor`).

- **Plan:** a new [Requested feature additions](../implementation-plan.md#requested-feature-additions) section covers:
  - enrollment and sales dashboards
  - customizable sales pages
  - pathways
  - staff-curated collections and private saved courses
  - memberships
  - coupons
  - bulk enrollment
  - user exports

  It also adds screen-inventory rows and milestone placement. Ten decisions (F1–F10) go into the decision register, including the release-placement question for features the first release defers.

- **Dashboards:** the plan now includes a Teachable reporting comparison (sales analytics dashboard, transactions, course reports) and adopts its filters, refund and failed-payment visibility, and CSV exports. It adds a separate **completion dashboard**, built only after the Canvas connection, with decision F11.
- **Sample staff dashboard:** a new default **Dashboard** tab and `GET /staff/dashboard`.
  - Enrollment KPIs, a trend chart and an offering table for all staff.
  - Simulated sales for the new `reports:sales` scope (Finance).
  - A completion placeholder.
  - Charts follow the dataviz method: validated hue, keyboard-readable bars, tooltip and table view.
  - Verification: a new integration group (18/18) covers scope gating, offering and date filters, and invalid ranges. In the browser: keyboard chart reading, the table toggle, the Finance versus Approver views, phone width and dark mode. The average-order formatting was fixed.
- **Content editor role:** migrations `4_content_editor_role` (the enum value, in its own migration) and `5_content_editor_demo` add Cory Content Editor (`content@cuce.test`) and give the demo administrator the role. The reserved `content:write` scope is unused until sales pages exist, so content editors are view-only today.
- **Verification:** the main database was backed up first. Integration suite 17/17, with new assertions for the content editor's exact scopes and a 403 on creating offerings. Migration tests 9/9. A browser check covered the view-only workspace and the Roles tab card.

October 7, 2026: learner management, plus two UI requests (branch `staff-roles`).

- **Database:** migration `3_learner_access` adds `learners.active`, `deactivated_at` (CHECK: set exactly when inactive) and `version`. The main database was backed up before applying it.
- **API:**
  - `GET /staff/learners` (search, registration counts, last activity) and `GET /staff/learners/{id}` (registrations, payments, jobs and recent activity), for any staff member.
  - `POST /staff/learners/{id}/access` (version-checked, reason required, audited as `learner.deactivated` or `learner.reactivated`), which needs the new `learners:manage` scope, granted to Support.
  - Deactivated learners are refused at mock sign-in (403) and on every learner request (401). Existing paid enrollments continue. The legacy sample learner cannot be deactivated.
- **UI:** a new **Learners** tab (search, sort, paging, cards on phones) with a Learner details dialog and the account-access action. The staff sign-in panel is centered. The **Users** tab is renamed **Staff**, with the list headed "Staff members". Audit labels now include the offering, staff and learner events.
- **Verification:**
  - Integration suite 17/17. The new group covers list counts, details, the Support-only access change, reason validation, blocking of deactivated learners, reactivation, stale-state refusal, legacy protection and audit actors.
  - Browser check from the keyboard:
    - the centered sign-in panel
    - the approver's view-only learner details, with focus returning to View
    - as Support, deactivating with reason validation (sign-in refused), then reactivating

    The walkthrough audit entries were removed afterwards.

October 7, 2026: staff roles with mock staff sign-in, plus user and role management UIs ([ADR 0004](../adr/0004-staff-roles-mock-sign-in.md)), on branch `staff-roles`.

- **Database:** migration `2_staff_roles` adds the `staff_role` enum and the `staff_members` table, with an email check, an at-least-one-role check and reserved SSO columns. It seeds six synthetic demo staff.
- **API:**
  - Roles map to scopes in `src/server/roles.ts`.
  - The staff token alone now only runs mock sign-in. Acting requires `X-Prototype-Staff-Id`, and the guard grants that active member's scopes.
  - Audit actors are `staff:<id>`, and the activity log and exception history show the member's email.
  - New endpoints: `staff/me`, `staff/roles`, `staff/members` (list, create, update), `prototype/staff-sessions` and `prototype/staff-directory`.
  - Read endpoints moved to `staff:read`. The simulation needs `prototype:simulate`.
  - The last active staff administrator is protected.
- **UI:** staff sign-in screen, session bar with Switch staff member, permission-aware actions, and the Users and Roles tabs. A server failure now moves focus to the error summary in the staff and offering forms.
- **Verification:**
  - Two new integration groups: role scopes gate catalog, approvals, simulation and staff management, and audit names the member; staff administrators add, promote and deactivate members, and the last administrator is protected. Suite: 16/16. Migration tests: 9/9.
  - Browser check from the keyboard:
    - sign-in, then the approver's view-only offerings, hidden Users tab and Roles tab
    - administrator: Roles → Manage people filtered to Approver
    - add-staff validation summary and a successful add with roles
    - the self-lockout refusal, with the error summary focused

    The walkthrough staff member was removed afterwards.
- **Demo staff domain:** seeded demo staff use the reserved `@cuce.test` domain, for example `approver@cuce.test`. An interim rename to `@cu.edu`, which may be a real institution's domain, was folded back into the unshared `2_staff_roles` seed. The local database was backed up first and its migration history corrected to match.

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
