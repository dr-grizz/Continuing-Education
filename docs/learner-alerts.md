# Learner alerts

Open **Admin → Learners → Alerts**, then choose **Create alert rule**. Rules produce dashboard notifications only; they do not email students or staff, change grades, verify completion, or issue/revoke credentials.

## Configure a rule

1. Give the rule a descriptive name and choose a condition.
2. Choose all eligible learners, an offering, a cohort, or one learner. A cohort narrows membership to its current active members; combining a learner and cohort requires both to match. Canvas rules require a mapped offering, selected directly or through a cohort. Credential expiration rules use all learners, a cohort, or one learner; they deliberately do not infer an offering-to-badge association.
3. Set a day window or score threshold, leave **Rule enabled** on, and save. Current conditions are checked when the dashboard refreshes. Edit a rule to change its window/scope or pause it; saving a revision resolves the prior revision's alerts and preserves their history. Create a separate rule to change the condition type.

| Condition                      | Meaning                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stalled verification           | Incomplete required steps have no staff evidence update for N days, measured from the latest required-step evidence or the tracking assignment. Optional-step updates do not reset this clock. This is a staff verification gap, not proof of student inactivity. |
| Completion milestone           | All required steps are verified complete and their latest verification falls within the past N days. Optional steps do not affect completion. A correction can clear a milestone; a new completed evidence episode can generate a new one.                        |
| Upcoming credential expiration | A signature-verified, unrevoked badge or certificate expires within N days. Each has its own alert/date; undated and already-expired credentials are excluded. An explicit, active, unambiguous portal-to-badge account link is required.                         |
| Canvas inactivity              | Active course enrollment records show no activity for N days, or explicitly show no recorded activity since enrollment started N days ago. Missing fields, missing enrollment rows, unknown identities, and stale/failed reads are unavailable data.              |
| Canvas performance             | The current Canvas course score is below the configured percentage. This is a course-level current score, not a count of failed assessments or a missing-submission rule. Null/inaccessible grades remain unknown rather than becoming zero.                      |

## Review and follow up

Summary cards count open, acknowledged, snoozed, and resolved records. Filter the queue by status/type or search learner, alert, and rule names. The latest 500 records are displayed with a notice if the list is limited; earlier history remains in PostgreSQL. Each alert identifies its source and the evidence observed when detected.

Choose **Manage alert** to acknowledge, snooze for 1–30 days, resolve, or reopen, with a short staff note. Acknowledgment does not clear the condition. Snoozed alerts reopen when their snooze ends. Manual resolution suppresses the unchanged episode; a subsequent source recovery and recurrence can reopen it. Source conditions no longer matching, inactive learners/memberships, elapsed windows, and rule revisions automatically resolve the appropriate records. Corrections and repeated checks never overwrite the append-only action history or create duplicate records for the same rule revision and episode.

**History** shows detection, staff follow-up, snooze, reopening, and resolution. Stale edits/actions are rejected; a dialog retains its note so staff can review it before retrying. Missing source data retains existing alerts and shows **Data unavailable**, rather than claiming student recovery or new inactivity.

## Scheduling and access

While the API runs, its integrated worker evaluates local rules every minute and reads enabled Canvas rules hourly, up to five due rule reads per tick. No separate service is started. `ALERTS_WORKER_ENABLED=false` disables scheduled checks; authenticated dashboard refreshes still evaluate local data and saved Canvas snapshots. Server downtime pauses checking, and due work resumes after restart. Evaluation uses a PostgreSQL advisory lock; provider reads use per-rule leases and bounded requests outside the evaluation transaction. An interrupted Canvas read becomes eligible for retry after its three-minute lease expires. Snapshot freshness expires after 24 hours; a newer failed read makes the source unavailable immediately.

Course managers and staff administrators have `alerts:manage` and can configure/follow up. Staff with `reports:read` may inspect local progress alerts/history. Credential alert visibility also requires `badges:manage`; Canvas alert visibility also requires `canvas:read`. An inactive or unauthorized rule owner stops background monitoring under that identity and produces a source warning. Canvas rules belong to the staff account that authorized them; another manager must create a rule under their own login rather than adopt the original authorization. Local progress/credential rules continue to use portal role permissions.

## Enable Canvas reads

Live access is not enabled automatically by this feature. Configure the existing staff Canvas OAuth/course connector, then:

```dotenv
CANVAS_COURSES_ENABLED=true
CANVAS_ALERTS_ENABLED=true
ALERTS_WORKER_ENABLED=true
```

Add `url:GET|/api/v1/courses/:course_id/enrollments` to the Canvas developer key alongside the existing course-read scopes, and sign in again so the encrypted grant includes it. The change in requested scopes changes the configuration fingerprint and invalidates old grants. The staff account needs permission to view the selected course's student enrollments and current grades; the API omits grades the account cannot access. See the official [Canvas enrollments API](https://developerdocs.instructure.com/services/canvas/resources/enrollments).

Use an explicit `canvas_offering_mappings` course mapping and active enrolled portal learners whose verified `auth_provider`/`external_subject` bind them to the same Canvas installation/user ID. Email matching and browser-provided grades/activity cannot establish that identity. Unlinked local/mock learners remain unavailable for Canvas tracking.

**Sync Canvas now** uses the signed-in owner's authorization and records the request. It cannot adopt another staff member's rule or borrow their grant. Manual retries are idempotent and rate-limited to one completed check per minute; scheduled checks reuse that owner's encrypted refreshable OAuth grant. Pagination, redirects, course/installation boundaries, timestamps, and numeric fields are validated; failed/partial provider responses preserve the previous snapshot. Multiple enrollments with conflicting scores leave the score unknown. Current grades and last-activity timestamps are observations, not independently verified learning or completion.

Migration `030_learner_alerts` adds rule configuration, alert instances, and append-only history to PostgreSQL. See [verification](testing/learner-alerts-verification.md) and [ADR 0020](adr/0020-learner-alerts.md).

## University SSO and alerts for your login

The **Alerts for your login** panel identifies the verified staff member and whether the portal is using university SSO through Canvas or local preview login. Canvas alert rule metadata, observations, summary counts, actions, and history are restricted to the rule owner derived from the server-validated SSO session. Even staff administrators cannot use another staff member's Canvas rules; create a rule under your own login. Portal verification, completion and credential alerts retain their existing role-based access rather than being presented as Canvas-owned evidence.

A valid university login alone does not grant course/grade API access. The panel checks the account's active portal permissions and encrypted Canvas grant, bound to the same verified Canvas subject, installation and requested-scope configuration. A missing, unreadable or outdated grant offers **Sign in again through Canvas**; the existing OAuth flow supplies and encrypts the grant. API tokens are never sent to the browser, entered into alert forms, or matched by email. Canvas's own course permissions and available fields constrain each read.

Without current authorization, the portal retains owned rule configuration but omits Canvas observations and their counts from the dashboard, denies history/actions/sync for that source, and retains durable records without claiming recovery. After a configuration change, old-configuration snapshots remain hidden until a fresh authorized read succeeds. Source errors or stale/unknown activity remain unavailable signals, never inactivity or zero scores. A failed dashboard refresh clears its previous displayed data; changing staff identity remounts the workspace.

Local preview login is explicitly labeled and never initiates live Canvas alert reads, even if Canvas environment flags are enabled. Production/hosted use keeps the existing `STAFF_AUTH_MODE=canvas` flow and approved Canvas identity links; this addition does not auto-link staff, grant roles, change the university identity provider, expand a developer key, or switch local authentication configuration. Scheduled monitoring continues with the rule owner's saved refreshable authorization, subject to current account, role and grant checks, rather than whichever administrator happens to view the page.
