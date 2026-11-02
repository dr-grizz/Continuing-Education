# Individual progress and cohorts: local verification

Executed October 28, 2026 on local branch `codex/individual-progress-cohorts`, based on `Badges-and-Certificates` at `ab370fa`. These are local results, not a remote CI run or hosted deployment.

| Check | Result |
| --- | --- |
| `npm run test:progress` | Passed against a disposable PostgreSQL database using the actual HTTP API. Covers staff role denial, learner-only reads, individual isolation, empty/invalid requirements, idempotent plan creation, stale requirements revision rejection, no inferred completion from enrollment, explicit assignment, cohort membership, required/optional denominator, shared individual records across cohorts, evidence validation, stale evidence rejection, append-only corrections/history, membership removal preserving individual progress, requirements version preservation, cross-version evidence denial, database immutability and audit events. |
| `npm run test:migrations` | Passed fresh, repeat, adopted, concurrent and failure/recovery cases, row preservation and structural comparisons (902 elements); migrations and Prisma schema have no drift. |
| `npm run typecheck` | Passed server and web checks. |
| `npm run format:check` and `git diff --check` | Passed. |
| `npm run build` | Passed TypeScript compilation and optimized Next.js production build. |
| Focused accessibility and keyboard tests | 15 cases passed: five scenarios in Chromium light, dark and phone layouts. Covers the staff report/evidence dialogs, keyboard activation/focus return, full requirements-revision/cohort/assignment/evidence workflow, read-only/empty/unavailable states, stale-note preservation and 320px reflow, and the learner's own progress/refresh view; includes axe scans. |
| Live local smoke check | The actual signed-in staff workspace at `/staff/progress` loads the new sidebar entry, Define requirements action, cohort action and accurate empty state. Existing private portal data was not populated with synthetic progress definitions during UI tests. |

The browser cases intercept progress responses and do not change the portal's academic records. The backend tests separately exercise authorization, PostgreSQL persistence, aggregation and immutable history. The local portal database was backed up to ignored `backups/pre-progress-cohorts.dump` before the additive migration; no existing course, enrollment or credential record was rewritten.

Manual screen-reader review has not been performed. This is not WCAG certification. Evidence in this release is explicitly staff verification; no automatic Canvas completion reads, prerequisite gates, automatic badges, group-project credit or cross-course pathway completion were implemented. Changes remain local and have not been pushed or deployed.

See [workflow and API](../individual-progress-cohorts.md) and [ADR 0014](../adr/0014-staff-verified-completion-progress.md).

## Checklist guidance follow-up

The Define completion requirements dialog now explains the checklist's purpose, course selection, one verifiable requirement per line, an illustrative three-step checklist, manual verification versus automatic Canvas checks, and the assign → verify → report workflow. The primary action is Create checklist (or Create revised checklist for a course that already has requirements), with a contextual explanation of existing assignments retaining their version. The example is illustrative and is not saved as course data.

Type checking and diff checks passed. The existing requirements-revision → cohort → learner-assignment → evidence browser workflow passed in Chromium desktop and phone layouts, including an axe scan of the expanded instructions. The live dialog was inspected without creating requirements or changing learner records.
