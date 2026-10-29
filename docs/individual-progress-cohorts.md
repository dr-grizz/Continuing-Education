# Individual progress and learner cohort reporting

This first reporting release adds **Progress and cohorts** under Admin → Learners and **Completion progress** in My learning. Completion is based on documented staff verification; it is independent of enrollment, payment, saved courses and pathway follows. No automatic Canvas completion sync, prerequisite gates, automatic badge awards, collaborative group credit, due dates or external reporting are introduced.

## Staff workflow

1. Sign in as a Course manager or Staff administrator and open **Progress and cohorts**.
2. Choose **Define requirements**, select a course and enter one required step per line. There must be 1–50 distinct steps. Saving creates a new immutable requirements version; existing assignments keep their old version.
3. Choose the report for that version and assign a learner, or create a named cohort tied to that version and add its learners. Assigning tracking does not register, enroll or charge the learner.
4. Open a learner's progress, select a step and choose **Record evidence**. Select the verified status, enter a 10–1,000 character evidence/correction note, and optionally enter an evidence reference. Notes and references are visible to that learner; do not put private staff-only notes there.
5. Refresh reports as needed. An unverified requirement is **Awaiting verification**, not evidence that work has not started. **Not started (verified)** requires an explicit staff record.
6. Record a new event to correct evidence; original events remain in history. Concurrent stale updates are rejected and the user's note is retained for review. Close the dialog and refresh before retrying a rejected correction.

All active staff with `reports:read` can view reports, consistent with the current portal report permissions. Only Course managers and Staff administrators receive the new `progress:manage` scope. Learners can read only their own assigned progress and cannot submit completion evidence.

## Progress and cohorts

- Percentage = completed **required** steps / assigned required steps, rounded down. Every plan must include a required step; optional steps, if configured through the API, never change the required percentage or overall state.
- Overall status: all required steps complete → Completed; some required work complete/in progress → In progress; otherwise missing required verification → Awaiting verification; otherwise Not started (verified).
- A cohort is an explicit named membership list tied to one requirements version, distinct from a catalog collection and from a scheduled offering. The matrix and status totals derive from its active members' individual records.
- A learner can be in several cohorts for the same requirements version; each cohort uses the same canonical individual evidence. Removing a membership does not remove progress. Re-adding the learner restores their membership and retains evidence.
- Deactivated learners remain identifiable in staff reports but cannot receive new evidence or new tracking assignments. Existing history is preserved. A learner's session must still be active to view My learning.
- Assigning a different requirements version is explicit and starts a separate tracking record; it does not copy evidence, revoke prior completion, or silently rewrite an old cohort.
- Plans and evidence persist in PostgreSQL. Times on the screen show when staff recorded the evidence, not an independently retrieved Canvas completion time. There is no time-based expiry policy in this phase.

## Storage and API

Prisma migration `025_individual_progress_cohorts` adds `progress_plans`, `progress_steps`, `progress_participants`, `progress_evidence`, `progress_cohorts`, and `progress_cohort_members`. Existing portal records are unchanged. Composite foreign keys prevent evidence/memberships from crossing requirements versions; database triggers reject edits/deletions of published requirements and evidence. A local backup was saved before applying the additive migration in `backups/pre-progress-cohorts.dump` (ignored by Git).

Reads: `GET /api/v1/me/progress`, `GET /api/v1/staff/progress`, plan/cohort `.../:id/report`, participant `.../:id/history`.
Writes: `POST /api/v1/staff/progress/plans`, `/cohorts`, `/plans/:id/participants`, `/cohorts/:id/members`, `/participants/:id/evidence`.

Writes require current staff authority and an actor-scoped `Idempotency-Key`; browser requests use the existing authenticated portal proxy. Evidence writes also require the previous event ID (`null` for the first event), preventing a stale correction from overwriting a concurrent verification. Requirement revisions compare the previous revision while holding the offering lock. Audit events record the responsible authenticated staff actor.

Run `npm run db:migrate` after updating this source; `npm run dev` remains the startup command. `npm run test:progress` runs the actual HTTP API against a disposable PostgreSQL database and cleans it up without changing the local portal's records.
