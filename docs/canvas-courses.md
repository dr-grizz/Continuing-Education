# Canvas courses

Implemented October 14, 2026. **Admin → Canvas courses** reads published courses using staff members' existing Canvas OAuth login. The connector runs in the TypeScript backend and worker. Course previews, schedules and selected-course import into offering drafts are implemented. Listed/unlisted visibility controls remain planned.

## Configure the existing OAuth key

Use the existing `CANVAS_STAFF_CLIENT_ID`, secret and `CANVAS_STAFF_REDIRECT_URI`. No new OAuth application or callback is required. Add these enforced scopes to the Canvas developer key:

```text
url:GET|/api/v1/accounts/:id
url:GET|/api/v1/accounts/:account_id/courses
url:GET|/api/v1/courses/:id
```

The same three scopes support nested subaccounts. Canvas account course listings include descendants; the connector verifies each distinct course account’s parent chain through account-details reads. No additional subaccount-list scope is required.

Canvas documents the endpoint scopes in the [Accounts API](https://developerdocs.instructure.com/services/canvas/resources/accounts) and [Courses API](https://developerdocs.instructure.com/services/canvas/resources/courses#method.courses.show). Each staff member also needs Canvas permission to read the configured subaccount; OAuth scopes do not grant that permission. Use only the read scopes above for this feature.

Set in the ignored root `.env` (server and worker only):

```dotenv
STAFF_AUTH_MODE=canvas
CANVAS_BASE_URL=https://cedarville.instructure.com
CANVAS_COURSES_ENABLED=true
CANVAS_COURSES_SUBACCOUNT_ID=REPLACE_WITH_SUBACCOUNT_ID
CANVAS_COURSES_INCLUDE_SUBACCOUNTS=true
```

Run `npm run setup` to generate a missing `CANVAS_TOKEN_ENCRYPTION_KEY` directly in `.env`. It preserves existing credentials and never prints the key. Keep that key stable, backed up securely and separate from database backups; changing it makes previously encrypted grants unreadable until reauthorization. Do not put it in browser code, `NEXT_PUBLIC_` variables, chat or source control.

Back up the local database, apply `npm run db:migrate` (including additive `017_canvas_course_connector`, `018_canvas_offering_drafts` and `019_unlimited_seats`), then restart the API and worker. New deployments also need the existing staff OAuth configuration. No Python packages or local skills are runtime dependencies.

## First read

1. Sign in with Canvas again after enabling course reads. Identity-only authorizations cannot call the API. The request now contains API read scopes and the same callback; the response's verified Canvas user ID still resolves the approved portal staff record. See [Canvas OAuth endpoints](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints).
2. Open **Admin → Canvas courses**. Course managers, IT/Canvas administrators and Staff administrators can preview/read; the latter two can manage schedules.
3. The page immediately loads an existing valid preview. If none exists or it has expired, authorized connected staff automatically queue one fresh read per page visit. An existing pending/running read is followed instead of queuing another. Failed automatic attempts require an explicit retry using **Refresh from Canvas** in the filter toolbar. The API queues a durable run and returns its ID immediately. The worker reads every page; the screen polls until the run finishes. Course details are encrypted in private temporary files, outside the portal database, and expire after 30 minutes. Job/audit metadata and OAuth refreshes still use the database. No portal offerings or Canvas objects are changed.
4. Automatic reads populate the course list below the Canvas connection panel without moving keyboard focus. An explicit **Refresh from Canvas** moves focus to the completed list. The list includes course names, IDs, subaccounts, start/end dates and publish status. The compact Canvas connection panel shows authorization status; **Connection details** expands the selected account, last saved preview, read status, refresh and disconnect controls. **Schedule settings** expands the schedule controls; they are collapsed by default. The staff session panel is compact; **Staff details** expands email, roles and sign-in information. Direct-only mode filters descendant courses; nested mode validates ancestry to the selected account. Concluded published courses remain visible for review. Select individual rows or use the header checkbox to select the current page, then choose **Import selected**. Alternatively, use **Create offering draft** (new courses) or **Refresh source details** (existing mappings) on a row. Selections carry across pages within the same preview; changing tabs, filters or previews clears them. The batch button is disabled with no selection. Syncing saves only the selected IDs from the server-held preview and preserves every other synced course. On the first sync of a course it creates one unpublished offering draft and a stable mapping. Later syncs refresh source metadata while preserving every offering field, version and publication state. An expired preview requires a fresh read. Repeated selections are idempotent, and stale revisions, newer per-course observations or another staff member’s preview cannot overwrite reviewed saved data.
5. After explicitly saving the first preview, an authorized administrator can choose a frequency and select **Enable using my Canvas account**. The schedule identifies its staff owner. Scheduled work retains that authorization after portal sign-out; it does not borrow another person's Canvas permissions for manual reads.

Scheduled runs also produce temporary previews and require explicit row or batch syncing before course details enter the database. The default schedule is paused, with a proposed hourly frequency. Supported intervals are 15–1440 minutes. Multiple workers deduplicate jobs and fence expired leases. Two abandoned attempts require a new preview request. Overlapping requests from the same owner join the active run; a different owner gets a conflict and must wait.

The API and worker must share the same private temporary directory. The local prototype defaults to the operating system’s temporary directory under `ce-course-previews`; `CANVAS_COURSES_PREVIEW_DIRECTORY` can override it server-side. Files use authenticated encryption, staff/run/configuration binding, owner-only filesystem permissions and a 12 MB limit. Expired files are cleaned up by the worker. A restart can retain an unexpired preview if its temporary file survives; a lost file requires a new preview. Separate hosts need a deliberately shared private storage design before deployment.

Automatic loading never syncs or creates portal offerings. A valid preview is reused across visits until expiry; changing filters or tabs does not trigger additional Canvas reads. Missing configuration, missing authorization and insufficient portal permissions do not start automatic reads. The manual refresh button remains available for retries; an initial metadata-load error offers **Retry loading courses**.

## Where imported courses appear

Open **Admin → Canvas courses → Imported courses**. This tab shows all course details saved for the configured Canvas account boundary, even while an unsaved preview is present or after it expires. Course preview rows show **Not imported**, **Imported**, or **Changes available**, plus **Last imported**. The saved tab remains available to staff with course-read permission without their own current Canvas authorization. Rows include **Open offering** links and missing-required-information warnings. The same drafts appear under **Admin → Offerings**. Imported drafts are hidden from learners until staff complete the required fields and publish them.

Selected updates merge by Canvas course ID under the existing database lock. Each saved row carries its sync timestamp, source observation time and source run ID in the existing course JSON; no schema migration is required. A revision hash protects concurrent updates even when several selections come from the same run. Unknown/duplicate/empty IDs are rejected before writes, and only a current authorized owner may sync from a private unexpired preview. Temporary preview files remain available for further selections until expiry. Existing full-snapshot saves remain a compatibility endpoint; the UI uses only selective syncing.

## Course filters

Use **Apply filters** to match course-title keywords (case insensitive, every word must match), an inclusive from/to range for either start date or end date, and Canvas publish status. **Clear filters** restores the full list. Filtering happens before pagination across the entire private preview or saved snapshot. Dates are displayed and compared in America/New_York; absent source dates show **Not set** and are excluded only when that date is filtered. No term dates are invented.

The read boundary still discovers published courses, including concluded courses. The Unpublished filter returns no results while that boundary remains in place; it does not trigger broader Canvas reads. Filters affect only the view. Selections are cleared when filters change, and syncing affects only the selected course IDs. The server never accepts course details from the browser.

API query fields: `title` (up to 200 characters), `startFrom`, `startTo`, `endFrom`, `endTo` (valid YYYY-MM-DD), `status` (`all`, `published`, `concluded`, `unpublished`), and `pageSize` (10, 25, 50 or 100; API default 100). Invalid filters return 400. `view=preview` selects the caller’s temporary preview; `view=synced` selects the saved courses. Omitting view retains the previous automatic preview/saved fallback. `total` is the filtered count; `source_total` is the current list’s full count; `synced_total` is the saved inventory count. `saved_revision` must accompany selective sync requests.

## Failure and disconnect behavior

- A failed page, invalid/cross-origin pagination link, timeout or unexpected empty replacement keeps the last successful preview. Provider response bodies and credentials never appear in run errors. All requests send `CANVAS_USER_AGENT`; redirects are refused and retryable failures are bounded.
- Manual runs use the initiating staff member's own saved grant. The configured HTTPS host and account boundary cannot be changed by a preview request. A local staff session or mock staff selector does not manufacture Canvas API access.
- A staff owner who is deactivated, unlinked or loses the relevant portal permissions cannot continue scheduled reads. A revoked or permission-denied authorization pauses the schedule and needs attention. Canvas-side permissions are also checked by Canvas on each request.
- **Disconnect my authorization** removes that staff member's saved tokens, cancels their outstanding reads and pauses their schedule. It preserves the portal session, saved source snapshot and historical records. Unsaved course details are no longer available through the disconnected authorization and expire automatically. It does not revoke all Canvas/SSO sessions. To remove the authorization from Canvas as well, revoke the app in Canvas and reauthorize when needed.
- Fixed configuration changes can invalidate previous grants/previews. Reauthorize and run a new complete preview after changing OAuth scopes or the selected account boundary. Never copy credentials from another user's tools or sessions.

## Offering draft boundaries

- Only explicit **Create offering draft** (new courses) or **Refresh source details** (existing mappings) or **Import selected** creates drafts. Automatic page loading, refresh and scheduled reads remain previews. Existing `canvas:sync` permissions apply; editing and publishing retain their existing offering permissions.
- One default mapping per Canvas installation URL and numeric course ID is enforced in PostgreSQL. Configuration/account-boundary changes do not create a second mapping. Concurrent syncs and retries reuse the same offering. Titles are never used for matching.
- If a manual offering already links to the same Canvas course, the entire batch stops with the existing offering title/ID. No existing offering is silently adopted or overwritten. Linking existing offerings, remapping and additional variants require a future explicit workflow. Manual create/edit also checks duplicate course links under the same transaction lock. Mapped links cannot be removed or changed.
- New drafts copy the Canvas title, course link and valid start/end calendar dates. Price, capacity and course type are null; topic, summary, description and format are empty. Invalid reversed source dates remain in source metadata and are left unset in the draft. No sample prices, capacities or invented sales text are assigned.
- Warnings appear in the Canvas table, Offerings list and offering page. Publishing is disabled and server/database checks reject incomplete publication. Registration/payment require a published, complete offering. Zero is a valid free price when staff deliberately enter it.
- Complete all Details fields before saving that tab. Settings save independently while Details are incomplete. After creation, all offering fields belong to staff; sync only changes the source snapshot and mapping metadata, even if the source title, dates or publication change. No prices, availability, payment history or existing enrollments are overwritten.
- Canvas publication and portal publication remain independent. Unlisted portal visibility, live mapping availability checks, real enrollment and learner progress remain later work.

## API and verification

All endpoints use the existing versioned staff API, current roles and browser proxy CSRF checks:

| Route                                                   | Permission      | Result                                                                                                              |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/staff/canvas/connection`                   | `canvas:read`   | Safe connection and preview metadata                                                                                |
| `GET /api/v1/staff/canvas/courses?page=1&pageSize=25`   | `canvas:read`   | Caller’s unexpired private preview, otherwise saved courses; 10/25/50/100 rows per page (UI default 25)             |
| `POST /api/v1/staff/canvas/sync`                        | `canvas:sync`   | `202`, queued run; UUID `Idempotency-Key` required                                                                  |
| `GET /api/v1/staff/canvas/sync-runs/{id}`               | `canvas:read`   | Pending/running/succeeded/failed and safe error                                                                     |
| `POST /api/v1/staff/canvas/sync-runs/{id}/save`         | `canvas:sync`   | Save owned preview; `{ previousSavedRunId: UUID or null }` prevents stale replacement                               |
| `POST /api/v1/staff/canvas/sync-runs/{id}/sync-courses` | `canvas:sync`   | Merge `{ courseIds: nonempty unique numeric ID strings, savedRevision: 64-character hash }`; create drafts for unmapped IDs, preserve existing offerings |
| `POST /api/v1/staff/canvas/schedule`                    | `canvas:manage` | Version-checked `{ enabled, intervalMinutes, version }`                                                             |
| `POST /api/v1/staff/canvas/disconnect`                  | `canvas:sync`   | Disconnect the caller's API grant                                                                                   |

`npm run test:canvas` uses a disposable database and mocked provider. It covers the OAuth scope change, encrypted grant binding, API authorization, nested ancestry, pagination/account boundaries, zero saved snapshots before explicit save, preview ownership/expiry/stale-save rejection, idempotent saves, refresh/concurrency, failed/hostile/empty scans, schedule ownership, restarts, revocation and disconnect. Draft tests cover concurrent/repeated imports, protected staff edits and links, conflicting manual offerings, blank required values, independent settings saves, publication/registration gates and price history. The identity-only mode remains covered by `npm run test:auth`. Browser checks cover configuration/reauthorization, read status, retained previews, role controls, scheduling and keyboard operation with axe scans. A live local preview on October 14 read **123 published courses** from subaccount **49**, including nested subaccount courses, using the configured staff OAuth authorization. The saved snapshot table remained empty before and after the read; no live sync action was submitted. This confirms the read/preview path, not a live save or mapping. Manual screen-reader review and institutional MFA assurance remain pending.

Wording: **Create offering draft** imports a new course; **Refresh source details** refreshes an existing mapping. **Import selected** handles either kind of selected row. Its helper text explains that new drafts are created, existing source details are refreshed and staff edits are preserved. **Refresh from Canvas** still reloads the preview. Internal API routes, scopes and status keys remain unchanged.

Seat capacity can be explicitly Unlimited when staff complete a draft. Imported blank capacity does not imply unlimited; its default remains Not set. Canvas refreshes preserve the staff-selected capacity mode.
