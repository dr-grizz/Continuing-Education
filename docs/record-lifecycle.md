# Archive, restore and deletion

Implemented locally November 12, 2026. Active records have **Archive** in the **Action** column (or the action area on phone cards). Select the archived list to find **Restore** and **Delete**. Delete requires prior archive and a confirmation; protected records explain why deletion is unavailable. Existing permission scopes, audit actors, idempotency and version checks apply.

| Screen / records | Archive and restore | Permanent deletion |
| --- | --- | --- |
| Offerings | Unpublish and clear Explore placement; restore without publishing | Only unused, never-published, non-Canvas offerings without registration/progress/credential history or collection membership |
| Collections / pathways | Unpublish, clear Explore placement, preserve membership/order and follows; restore a draft | Remove group/membership/follows only; individual offerings and learner records stay |
| Canvas courses | Saved portal inventory only; active/archive filter before pagination | Local tombstone keeps an entry hidden on refresh; Canvas, offerings and enrollments are never changed |
| Progress requirements | Hide from new assignment/cohort choices; existing reports and evidence stay | Only archived, unused final revisions without participants, cohorts or later revisions; evidence remains append-only |
| Cohorts | Hide from new membership changes; individual progress and history stay | Only cohorts without membership history |
| Learners | Block portal sign-in, revoke portal sessions; restore deactivated, then reactivate separately | Blocked by registration/progress history, credential links or awards; legacy sample learner stays protected |
| Staff | Deactivate, end sessions, disconnect Canvas authorization; restore inactive | Own account, last active administrator, linked identities and staff/credential/Canvas activity are protected |
| Roles | Action column explains that these are protected built-in permission definitions | System roles cannot be archived or deleted; staff role assignments remain editable |
| Badge designs | Hide from active designer/approval choices; approved versions and awards stay | Only drafts without approved versions |
| Badge versions | Disable version and its earning rules; restore approved with rules inactive | Blocked by earning rules or issued badges |
| Badge earning rules | Disable, then restore inactive for explicit reactivation | Blocked by issued badges |
| Issued badges | Hide from active staff management only; learner access/sharing/verification stay | Permanent credential history: archive or use the separate revocation workflow |
| Certificate templates | Hide from new template choices; signed certificate snapshots stay | Blocked by issued snapshots using the template |
| Issued certificates | Hide from active staff management only; signed content and downloads stay | Permanent credential history; cannot be deleted |

Credential workspaces now include native management tables above their existing editors. Active editor choices exclude archived records; learner/public downloads and verification remain available. Financial transactions, immutable evidence, audit events and historical activity are retained rather than given destructive management controls.

Canvas previews remain temporary until explicitly saved/imported. Their Action cell explains that a saved portal entry is needed before archive controls apply. No Canvas write API was introduced.

## Storage and local rollout

Migrations `029_collection_archive` and `030_learner_offering_archive` store publication/account constraints. Migration `031_management_archives` adds shared management state, and `032_unused_progress_delete` permits deletion only of archived unused final requirement revisions while preserving assigned snapshots and evidence. Backups were taken before local migrations; no hosted deployment or live database migration was performed.

## Verification

- Server/web TypeScript checks, the compiled API and production Next.js build, and patch formatting checks passed. The updated portal and API health endpoints both returned HTTP 200.
- `npm run test:lifecycle` verifies offerings, learners and both collection kinds with synthetic records.
- `npm run test:managed-records` passed in a disposable database: every added record type, archive/restore/deletion, protected roles/issued credentials, self-account protection, stale versions, retry idempotency, retained progress reports, disabled earning rules and HTTP role denial; the database is removed afterward.
- The existing portal API suite and lifecycle suite passed; Stripe webhook checks were skipped because no webhook secret is configured. Read-only requests through the actual authenticated badge designer, publishing, certificate and issuance catalogs returned HTTP 200.
- The complete badge/certificate suite passed: 76 service tests, 120 portal broker checks (including archive visibility and retained learner PDF access), and embedded PostgreSQL/API persistence checks.
- Existing isolated progress and Canvas integration suites passed, including immutable evidence, learner isolation, cohort history, read-only Canvas access, source import/retry behavior and preserved staff edits.
- Thirty-four distinct targeted desktop/phone browser checks passed across focused runs (26 shared-management/collection checks and eight existing Learner/Offering checks). These cover Action cells, archive-first behavior, archived filters, confirmation dialogs, focus and automated axe scans. Credential-editor internals are covered by existing workflows; the new table/dialog tests use a synthetic embedded editor to isolate management behavior.
- Manual screen-reader acceptance remains unverified; automated scans and keyboard checks do not establish WCAG certification.

Implementation sources: `src/server/managed-records.ts`, `src/server/service.ts`, `src/server/progress.ts`, `src/server/canvas-courses.ts`, `src/web/server/badges.ts`, `src/web/components/managed-records.tsx`, and `src/web/components/record-lifecycle.tsx`.
