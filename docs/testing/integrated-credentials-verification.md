# Integrated PostgreSQL credentials verification

Verified locally October 27, 2026. These are local results, not GitHub CI or Azure deployment evidence.

## Implemented

- Credential request handling is mounted inside the existing NestJS API on `/api/credentials` and uses its PostgreSQL pool. No listener on port 4178 is needed.
- Root workspace installation includes the credential domain dependencies. `npm run dev` starts the combined portal; certificate rendering uses the configured private Python environment.
- Prisma migration `024_integrated_credentials` adds 11 prefixed PostgreSQL tables, workspace-scoped constraints and immutable snapshot triggers. Signed credential/certificate JSON stays byte-preserving text.
- A guarded legacy SQLite importer creates a consistent private backup, validates signatures, preserves signed bytes, copies transactionally and refuses an existing target. The running portal does not load SQLite.
- The original local portal database was backed up before the additive migration to ignored `backups/pre-integrated-credentials.dump`. No historical badge database elsewhere was imported; the active local checkout had no existing badge data directory.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run test:badges` | 48 domain tests passed on disposable PostgreSQL, including concurrent issuance across independent pools, workspace isolation, duplicate protection, atomic CSV/certificate rollback, immutable snapshots, private sharing, ownership, signature verification and guarded SQLite import. |
| Portal broker integration | 63 checks passed using real badge code, PostgreSQL and PDF renderer against a mocked identity-provider boundary. |
| Embedded API integration | Passed against a disposable database: starts the actual NestJS API, checks portal staff authority, writes a badge draft through the broker into the same database as offerings, restarts the API, and reads back the draft. |
| `npm run test:migrations` | Passed fresh/repeated/adopted/concurrent/refused/failed/recovery migration paths, existing-row preservation, 783-element structural comparison and Prisma schema no-drift check. |
| `LEARNER_AUTH_MODE=mock npm run test:demo` | All three payment/reconciliation/durable-demo assertions passed; exit 0. |
| `npm run build` | Passed server compilation and optimized Next.js production build. Network access was required for the existing Google font. |
| `npm run typecheck` | Passed server and web TypeScript checks. |
| `npm run format:check` and `git diff --check` | Passed. |
| Focused Chromium accessibility/keyboard suite | Nine `credential integration` cases passed, including staff workspaces, learner states, keyboard interaction, unsaved state and 320px reflow. These fixtures mock badge responses; embedded API tests separately verify storage and authorization. |
| Live local smoke check | The authenticated staff badge designer loaded with its editor and saved-draft library; the web broker returned 200. Integrated health returned 200, unauthenticated credential admin requests returned 401, and listeners were only the usual portal web/API ports. |

## Boundaries

No manual screen-reader review, live Canvas enrollment, real credential issuance, external pilot data migration, remote CI run or Azure deployment was performed. Existing explicit learner identity linking remains required. Issuer keys, server tokens and learner-link configuration remain private files and must be backed up with PostgreSQL. Historical signed URLs are preserved in legacy payloads; importing does not redirect an old public URL.
