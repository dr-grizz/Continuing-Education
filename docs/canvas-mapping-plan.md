# Canvas course connection and mapping plan

Updated October 14, 2026. The course connector now uses the existing staff OAuth client and callback, implemented entirely in the TypeScript backend. No local skill, Python runtime or separate OAuth application is deployed with the portal. The course-read feature is opt-in. See [setup and verification](canvas-courses.md).

## Implemented: connect and preview

- **Admin → Canvas courses** shows connection status, the selected subaccount, saved/unsaved preview and run history status, automatic preview loading, Refresh from Canvas in the filter toolbar, Create offering draft / Refresh source details row actions and Import selected. The on-page course table includes start/end dates, title/date/publish-status filters across the full list, and configurable pagination (25 rows by default). Schedule settings and staff session details are collapsed initially and expand using labelled buttons.
- When `CANVAS_COURSES_ENABLED=true`, the existing staff login requests course-read scopes rather than identity-only `/auth/userinfo`. Previously signed-in staff must authorize again. The verified Canvas installation/user ID still identifies an existing, active portal staff record; OAuth does not assign portal roles or admit unknown users.
- API access/refresh tokens are encrypted per staff identity with a separately configured key. They never appear in browser responses, browser storage, command lines or logs. Refreshes are serialized and retain the existing refresh token when Canvas omits a replacement.
- Manual reads use the initiating staff member's authorization. Scheduled reads use an explicitly selected staff owner and continue after portal sign-out. An owner must remain active, linked and authorized. A revoked or insufficient authorization pauses the schedule; staff can disconnect their own saved authorization independently of their portal session.
- The Node.js worker runs durable jobs outside enrollment transactions. Requests deduplicate, leases fence abandoned workers, and interrupted jobs recover with a bounded attempt count.
- Discovery fully paginates published courses, enforces the configured account boundary, and optionally includes descendants. Each HTTP request carries `CANVAS_USER_AGENT`, a timeout and the staff access token. Redirects and cross-origin pagination are refused. Transient errors are bounded; provider error bodies are not exposed.
- A complete successful scan creates a private encrypted preview outside the portal database, with a 30-minute expiry. Staff review its paginated course list and sync selected rows, merging by course ID while preserving other synced courses. The Imported courses tab shows the saved inventory independently of the temporary preview. Scheduled reads use the same review gate. Failed pages, suspicious empty results, stale saves and invalid pagination preserve the last saved snapshot. Nested courses are included by validating account ancestry using the existing three read scopes.
- Migration `017_canvas_course_connector` adds encrypted grants, the schedule, durable runs and complete source snapshots. It does not change existing offerings, prices, visibility, orders or learner records.

Explicit selected-course sync now creates incomplete unpublished offering drafts with stable mappings. Independent listed/unlisted visibility is the next implementation slice. Canvas course, enrollment and grade writes are excluded. Learner identity and enrollment remain simulated in the local prototype.

## Authorization

Canvas permissions determine what each staff authorization can read. OAuth endpoint scopes are an additional limit; they do not grant account access. The configured subaccount allowlist is enforced independently by the connector.

| Portal role             | Course connector permissions                                  |
| ----------------------- | ------------------------------------------------------------- |
| Course manager          | Read preview and sync selected courses using own Canvas authorization |
| IT/Canvas administrator | Read preview, own selected-course sync, manage schedule               |
| Staff administrator     | Read preview, own selected-course sync, manage schedule               |

Other roles have no connector permissions. Existing role identifiers and permission keys stay compatible with the current database/API. Course publication still requires the existing offering-management permission; being a Staff administrator alone does not grant it.

## Implemented: selected-course drafts and protected mappings

Migration `018_canvas_offering_drafts` adds one default mapping per installation URL/course ID, a unique offering target, saved source metadata and incomplete imported drafts. The first explicit row/batch sync creates a draft; retries/concurrent syncs reuse it. Later syncs preserve every offering field and publication state. Existing manual course links stop the batch for review; mapped links cannot be accidentally changed. Source changes never overwrite price, capacity, sales text, staff dates, registrations or order history.

Drafts copy source title/link/valid dates, leave unknown required values unset and show warnings in the course table, Offerings and offering pages. Price, capacity and course type have no sample defaults. Publishing and registration/payment are blocked until required information is complete. Details require all required fields to save; Settings save independently. Existing permissions are retained for now. Read-only discovery/schedules never create offerings automatically.

## Next mapping work

1. Test three representative mappings before a wider reviewed import. Record IDs and recovery information. The live 123-course inventory has only been previewed; no live import has been submitted by this implementation run.
2. Add an explicit reviewed workflow to link a conflicting existing offering, source exclusions and any deliberately requested additional offering variants. Never infer identity from titles or remap implicitly.
3. Add separate portal publication and listed/unlisted visibility, preserving current published/unpublished state and listing preference when republishing.
4. Recheck previously mapped course IDs. Published-only discovery cannot distinguish unpublication, movement, deletion or loss of permission. Treat 403/404 as unavailable/unknown, flag stale mappings and gate new registrations/payments without deleting history or silently changing portal publication.
5. Defer remapping offerings with fulfilled enrollments until fulfillment snapshots preserve original course/section IDs; remapping must not redirect historical learner access or grades.

## Independent portal visibility

| Portal state       | Course browsing, search, Explore, collections, pathways | Direct portal link                          | New registrations         |
| ------------------ | ------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| Draft              | Hidden                                                  | Staff preview only                          | Closed                    |
| Published/listed   | Visible                                                 | Available                                   | Normal eligibility checks |
| Published/unlisted | Hidden                                                  | Available                                   | Same eligibility checks   |
| Unpublished        | Hidden                                                  | Unavailable publicly; staff preview remains | Closed                    |

Apply these rules server-side to every discovery response, not only to UI controls. Unlisted links are shareable and do not provide invitation-only authorization. Existing paid learners retain their My learning records and entitlement-based access. Publishing sales-page text remains separate from publishing the offering. Portal changes never publish or unpublish Canvas courses.

## Later: grades and progress

Require real learner authentication and a verified institutional/Canvas identity link before enabling real learning records. Store the Canvas user, course/section and verified enrollment IDs for the entitlement. Never match grades using a typed name or email.

Read only the records belonging to that learner. Add grade/progress scopes deliberately, cache snapshots with retrieval timestamps, distinguish missing data from zero, and honor Canvas learner visibility and grade-posting rules. Requirement completion is not equivalent to page views, enrollment conclusion or certificate eligibility. Academic completion/certificates need the separate policy decision.

## Acceptance and release boundaries

For the connector, verify real subaccount permissions and developer-key scopes, complete pagination and IDs/counts, opt-in descendants, automatic refresh/revocation, overlapping triggers, worker restart, last-good-preview retention, schedule ownership and disconnection. The mocked provider tests cannot prove institutional permissions or MFA enforcement.

For mapping, verify idempotent import, explicit existing-offering choices, staff edit preservation, all four visibility states across every public endpoint and preservation of existing paid access. Use additive migrations with backup/apply/verify; never edit an applied migration. Run provider/API/migration checks, typecheck/build, browser scans, keyboard workflows and manual screen-reader review. No deployment, production payments, enrollment writes or issue-tracker changes are authorized by this plan.
