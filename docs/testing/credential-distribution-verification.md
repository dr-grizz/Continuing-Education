# Credential distribution verification

Verified locally October 28, 2026 on `codex/individual-progress-cohorts`. Results apply to this local checkout and prototype database, not a remote deployment or GitHub CI run.

## Implemented and demonstrated

- QR PNGs and typed claim codes for an earned badge, its attached certificate, or both, available from the certificate and award workspaces.
- Explicit same-recipient/same-accomplishment pairing in the award form and the two seeded sample accomplishments. Existing badge/certificate signed snapshots and duplicate-award protections remain intact.
- Authenticated, explicitly linked learner redemption, 1–30-day expiry, revocation, persistent attempt limits, safe repeated redemption, and claim history. Wrong-account and unavailable claims reveal no recipient or award information.
- Private derived code material, hash-only PostgreSQL storage, local QR generation, fragment removal and POST-only code exchange. A changed private key or inactive/withdrawn credential makes the distribution unavailable.
- The exact claim-page path added to the existing mock and Canvas sign-in return allowlists. The pending code survives sign-in in tab-local session storage and is cleared after success.

## Validation

| Check | Result |
| --- | --- |
| `npm run test:badges` | 67 domain tests passed on disposable PostgreSQL, including seven new distribution tests: independently decode generated QR PNGs using jsQR; verify all three packages; enforce ownership, immutable content, persisted attempt limits, expiry/revocation and safe concurrent retries; detect changed code keys; verify idempotent paired demo seeding and preservation of unrelated identity links. |
| Portal broker integration | 97 checks passed using real credential service/PDF code and a mocked identity-provider boundary, including new staff/learner scope separation, CSRF, forged recipient/actor rejection, paired claiming, repeat claiming, code revocation and retained credential downloads. |
| Embedded API integration | Actual NestJS API startup, authorization, PostgreSQL persistence and restart checks passed. |
| `npm run test:learner-auth` | Mocked Canvas OAuth identity/state/session/callback/cookie/CSRF checks passed; exact claim return path accepted while external and query-bearing destinations are refused. |
| `npm run test:migrations` | Fresh/adopted/repeated/concurrent/refused/failed/recovery paths passed; 1040-element structural comparison and Prisma schema no-drift check passed. |
| New claim browser suite | 12 Chromium cases passed across light, dark and phone layouts: staff paired distribution, QR download and confirmed revocation; missing identity link; code retention through sign-in; paired credential downloads; unavailable claims without information disclosure. Includes keyboard/focus checks, axe WCAG A/AA scans and 320px reflow. |
| Existing credential/email regression suite | 17 light-layout cases passed covering the new claims, previous certificate email workflows, all credential workspaces, learner states, keyboard/unsaved-design behavior and 320px reflow. |
| `npm run build` | Server compilation, asset generation and Next.js production build passed. |
| Types, formatting, JavaScript syntax, `git diff --check` | Passed. |
| Real local demo read-back | Verified two paired sample accomplishments, three active distributions, independent decoding of all three actual QR images, explicit account links, correct learner ownership and actual PDF responses. Codes were left unclaimed for the user's demo. Email sending remained disabled. |

Migration `027_credential_claims` was applied after an ignored private PostgreSQL backup at `backups/pre-credential-claims.dump`. Matching Prisma models were generated without replacing unrelated schema documentation. Both the root workspace lockfile and the credential package's standalone lockfile were synchronized with the QR dependencies.

The local fixture command was run after the disposable-database tests passed. It created Alex Morgan (Demo), `ce-qr-alex@example.test`, and Jordan Rivera (Demo), `ce-qr-jordan@example.test`, each with one fictional badge and its attached certificate. Three active sample distributions cover combined delivery and separate badge/certificate delivery. The command was repeated safely while configuring the previously absent API-side `WEB_URL=http://localhost:3050`; existing badge/certificate identities and unrelated private learner links were preserved. No Canvas or email-provider call was made.

The API and website were restarted on ports 3051 and 3050. Existing email sending is still disabled; this addition does not provision an email provider, certify Open Badges issuance, or deploy the portal. No commit or push was performed.

## Remaining boundaries

Manual screen-reader review and Firefox/WebKit checks were not performed for this new flow. Browser tests use synthetic/intercepted responses; the separate domain, broker, API and actual local read-back checks verify persistence, signing/ownership and PDF integration. Physical-phone scanning was not tested: current links point to localhost, so phone access requires a reachable HTTPS deployment. Claiming is recipient-specific delivery of an existing accomplishment, not an open eligibility/award campaign. The inherited deployment audience gate still applies.

Operator instructions and demo sign-ins: [Credential distribution](../credential-distribution.md). Design: [ADR 0016](../adr/0016-recipient-bound-credential-claims.md).
