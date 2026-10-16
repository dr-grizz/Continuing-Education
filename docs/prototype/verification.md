# Local prototype verification

This is a historical verification record. For current expected behavior, repeatable steps and new run results, use the [systematic test cases](../testing/use-cases.md) and [test run record](../testing/test-run-template.md).

October 1, 2026. All checks use synthetic data and local services.

- TypeScript checks and optimized Next.js build pass.
- API/PostgreSQL integration checks cover bearer authentication, denied scopes, request validation, draft creation/publication, stale-version rejection, concurrent allocation of the final seat, duplicate payment commands, approval-gated payment and operation ownership.
- Browser review confirms catalog/course detail rendering, saved registration, simulated payment, asynchronous progression to demo enrollment, staff table/form and retained form values after validation failure.
- Mobile catalog checked at 390 × 844; content width matches viewport with no horizontal overflow. Desktop viewport restored after review.
- Catalog list/grid toggle verified in the browser: one-column list, two-column desktop grid, shared search results and layout persistence after reload. Grid preview: `catalog-grid.jpg`.
- PostgreSQL uses a dedicated named Docker volume and loopback port 5433. API and website bind to loopback. Environment files are ignored.

Not verified/implemented: production SSO, real Stripe events, university identity service, Canvas access, outbound webhooks, refund/transfer/lifecycle workflows, comprehensive screen-reader review or production release criteria.

Catalog preview: `catalog.jpg`. The synthetic demo learner has a simulated Practical Data Analysis enrollment from browser verification; no external records were changed.

Course types (October 1, 2026): migration 002 adds cohort/self-paced types and conditional schedule constraints. API integration tests cover both types and invalid schedules. Catalog, spotlight, learner records and course detail show Start anytime for self-paced courses. Staff creation shows required labeled dates only for cohorts; Cancel restores focus to New offering. Type checks pass; real screen-reader testing remains outstanding.

Mock sign-in/out (October 1, 2026): arbitrary demo credentials accepted via keyboard submission; return to My learning, persisted email on reload, and sign-out verified in browser. Labels, visible keyboard focus, and 320px reflow checked. Password stays only in component memory and is cleared on submit; This initial check preceded database-backed users (see below). No real screen-reader session performed.

Database-backed demo users (October 1, 2026): migration 003 creates learners with unique normalized emails, backfills existing learner IDs without reassigning their registrations, and adds the entitlement learner foreign key. Re-running migrations is safe. API and web-session integration tests pass: concurrent/case-insensitive user lookup, separate learning lists, denied cross-user payments, learner selection validation, HTTP-only cookie restoration/sign-out, and signed-out web workflow rejection. Staff approvals identify the requester by email. Fixed a null-end-date check that incorrectly closed self-paced registration.

Browser checks: portal-demo-a@example.com registered Practical Data Analysis; reload preserved the session and registration. portal-demo-b@example.com had an empty learning list. Returning with upper-case A email restored its original registration. Keyboard submission and sign-out worked; accessible labels and a visible 3px focus outline were checked. My learning fits a 320px viewport without horizontal overflow. Desktop viewport restored. Preview: database-backed-learning.jpg. Automated accessibility scan and a real screen-reader session were not performed. Passwords remain outside API payloads/storage; mocked identity does not prove ownership of an email. The browser is left on A's My learning page with its synthetic reservation.
