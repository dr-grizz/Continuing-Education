# Badges and certificates integration review

October 15, 2026. Reviewed integration approved by the owner for commit and push to `Badges-and-Certificates`; remote publication remains subject to repository access and branch reconciliation.

## Branch and data preservation

- Repository: `dr-grizz/Continuing-Education`.
- Separate working copy: `continuing-education-integration` within the Teachable to Slate workspace.
- Checked-out branch: `Badges-and-Certificates`, based on local commit `dd67f93af90b1d689c22d9f3cfa4305484a9bed7`.
- The original repository remains clean; its `main` and `Badges-and-Certificates` references both remain at that same commit. The original Badging Pilot was not edited or migrated during integration.
- Remote branch freshness remains unverified: the connected GitHub tools returned 404 for this private repository, and Git HTTPS could not authenticate. The approved integration can be committed locally; restore repository access and fetch the named branch before publishing, reconciling any intervening branch changes. Do not force-push or update `main`.
- Only source, standards fixtures and fictional sample assets are included. Private credentials, identity maps, signing keys, award databases, PDFs, test runtimes and logs are ignored. Two fictional test awards and two certificates exist only in the isolated copy's private runtime.

## Integrated behavior

The native Next.js/MUI portal owns navigation and sessions. Five staff sections expose badge design, publication/course mapping, manual/CSV awards, certificates and the issuance register. Learners use **My badges** for their own awards, downloads and sharing. Public verification is served at the portal origin and only succeeds for explicitly shared credentials. The pilot editors are preserved in same-origin titled documents and matched to the portal theme, rather than rewritten as React forms; the badge service remains a separate loopback process.

Every staff badge request rechecks the portal session, active account and `badges:manage` scope. Course managers and staff administrators have that scope. Every learner request checks the portal learner session and an explicit private UUID-to-badge-account mapping. Missing links fail closed. The API allowlist omits local issuer login, logout, arbitrary service routes and learner impersonation. Tokens remain server-side, writes enforce same-origin JSON, and staff actors are derived from the verified identity. New templates keep centered certificate logos and left-aligned headers; frozen awards and PDFs keep their original content.

## Completed checks

| Check | Result |
| --- | --- |
| Locked dependency installation | Completed for portal and badge service |
| Format check and both TypeScript projects | Passed |
| Full portal build | Passed without warnings |
| Private runtime files in badge API build trace | No tokens, identity map, database or environment files included |
| Original pilot regression suite | 46 tests passed, zero failures |
| Next broker + real badge service, mocked identity-provider boundary | 53 checks passed |
| Actual Next/Nest portal + real badge service, synthetic runtime | 30 checks passed |
| axe scans for five staff pages and signed-out/unlinked learner states | 21 checks passed across light, dark and phone layouts |
| Keyboard traversal, unsaved-design guard, and all five editors at 320px | 3 checks passed, one per layout project |

The [saved live-check report](badges-live-validation.json) records the results. The live checks cover staff role denial/allowance, browser-created draft read-back, immutable publication, trusted actor attribution, saved certificate images/header, PDF preview and owner download, manual and CSV issuance, repeat-commit safety, register certificate attachments, cross-learner denial, query-string spoofing, explicit sharing and withdrawal. The real portal API used the repository's 20 reviewed migrations against an isolated Postgres WASM test database because Docker was stopped; no existing portal database was used. This is functional evidence, not a substitute for PostgreSQL concurrency/migration-suite verification in CI.

Browser verification used the native portal's demo staff sign-in, saved a fictional draft, opened the integrated certificate tools, selected the saved logo/header/signature template and inspected the complete page. Keyboard focus is visibly outlined. Automated contrast findings in the adapter were fixed before the passing scans. The keyboard test verifies header-to-logo Tab order and return, the Stay/Discard unsaved-design dialog, and 320px page/editor reflow for all five workspaces. The register table retains its own horizontal scroll region. All 24 targeted accessibility checks passed.

## Remaining release checks and boundaries

The full original PostgreSQL API/migration, Canvas OAuth/course connector, Firefox/WebKit and forced-colors suites were not rerun locally. A full screen-reader review was not performed. CI has been updated for Node 24, renderer dependencies, badge regression/broker checks and the new page scans. Production deployment, institutional learner sign-in, live Canvas completion automation, historical pilot data migration and certified Open Badges issuance remain outside this source integration. Existing locked portal dependencies were retained; their installation audit reported four high and two critical findings, which require separate dependency review before exposure beyond the local prototype.

The [setup and route guide](../badges-and-certificates.md), [architecture decision](../adr/0008-badges-and-certificates.md), and source changes document the approved integration. The local preview runs at `http://127.0.0.1:3052/staff/certificates`, with synthetic data only. The owner's approval covers committing and pushing this reviewed source only to `Badges-and-Certificates`; it does not authorize changes to `main`.


## October 21, 2026: integration into the current portal

The integration is now applied locally in `/Users/jfrieling/Documents/GitHub/Continuing-Education` on `codex/badges-certificates-integration`, based on `0a547c2fc9ce3e74399858d3b03c8b75767a3833`. Resolved the existing conflicts in `package.json`, `src/server/roles.ts` and `tests/accessibility/pages.spec.ts`, retaining the newer request-driven demo tests and Stripe reconciliation permission alongside the credential features. No commit or push was made, and `main` remains unchanged at `dd67f93af90b1d689c22d9f3cfa4305484a9bed7`.

Credential learner access now follows the configured portal mock or Canvas authentication mode. The broker validates current opaque Canvas learner sessions, secure cookie names and the active API learner identity before resolving the private badge link. The learner page uses the signed-in state instead of requiring email. Added regression coverage for revoked/inactive sessions, unconfigured authentication, stale demo cookies, staff/learner separation and accounts without email.

The mobile issuance table now has a named focusable scroll region and visible focus, with a keyboard scrolling regression check. The [interface specification](ui-specification.md#badging-and-certificate-interfaces) records the staff and learner requirements.

Current verification: final production build, both TypeScript projects and formatting passed; 46 badge-service tests, 63 broker checks, 30 real portal workflow checks and 27 accessibility checks passed. Accessibility covers light, dark and phone layouts, keyboard order, unsaved-change behavior and 320px reflow. A saved fictional badge draft and the certificate template/preview were also inspected through the browser. [The detailed validation record](badges-validation-2026-10-21.json) separates this run from the historical October 15 results above.

Docker was stopped, so functional browser verification used an isolated in-memory Postgres WASM database with the 22 repository SQL migrations applied and their checksums recorded; standard PostgreSQL migration/concurrency coverage was not rerun. Live Canvas OAuth/MFA, Firefox/WebKit, forced-colors and manual screen-reader review remain unverified in this run. The optional service still requires local configuration and approved learner links; no historical pilot data, production completion automation or certified Open Badges issuance was added. Temporary validation servers were stopped.
