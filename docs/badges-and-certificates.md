# Badges and certificates in the CU Portal

Badges run inside the existing NestJS API process, using its PostgreSQL pool and database. The editors remain in the native Next.js/Material UI staff workspace. There is no separate badge listener or SQLite store in the running application. The `badge-service/` directory now contains credential domain code and editor assets, not an independently started service. [ADR 0011](adr/0011-integrated-postgres-credentials.md) supersedes the storage/startup boundaries of ADR 0008.

The [interface requirements](prototype/ui-specification.md#badging-and-certificate-interfaces) specify each screen and its expected behavior.

[Certificate email](certificate-email.md) adds individual/cohort previews, attachments and private links, delivery history, duplicate protection and optional automatic delivery. It requires migration `026_certificate_email`; live sending stays disabled until a provider and the requested sender `continuinged@cedarville.edu` are configured and authorized.

[QR/claim-code distribution](credential-distribution.md) supports badge-only, certificate-only and paired delivery to the same linked learner, plus local sample records and claim history.

## Routes and authority

| Portal route | Function | Required authority |
| --- | --- | --- |
| `/staff/badges` | Badge designer, custom artwork and metadata | `badges:manage` |
| `/staff/badge-publishing` | Publish immutable versions and verify course mappings | `badges:manage` |
| `/staff/badge-awards` | Manual awards and previewed CSV batches | `badges:manage` |
| `/staff/certificates` | Templates, images, PDF previews and certificate issuance | `badges:manage` |
| `/staff/badge-issuances` | Award details, evidence, history and certificate downloads | `badges:manage` |
| `/badges` | Current learner's earned badges, certificates, exports and sharing | Active learner session and approved identity link |
| `/verify/badges/:source/:id` | Safe public verification | Credential must have sharing enabled |

Course managers and staff administrators have `badges:manage`; Approver, Support, IT/Canvas administrator and Content editor alone do not. The existing portal sign-in remains the authority, including configured Canvas staff OAuth. The pilot's local issuer key is not used by the portal. Private reader/award tokens remain on the server, read from the ignored badge data directory. Staff activity is attributed to `portal:<staff-uuid>`. The register attaches each certificate to its award row, not a separate issuance row.

## Local setup

Use the normal portal setup and migrations. Root `npm ci` installs the badge workspace dependencies as well. Certificate PDFs additionally need Python 3.10+:

```sh
npm ci
npm run setup
python3 -m venv badge-service/.certificate-venv
badge-service/.certificate-venv/bin/python -m pip install -r badge-service/certificate-renderer/requirements.txt
npm run db:up
npm run db:migrate
npm run dev
```

Set `CERTIFICATE_PYTHON` in the ignored root `.env` to the absolute path of that virtual environment's Python. The portal's `DATABASE_URL` is the only database setting. No `BADGE_PORT`, `BADGE_SERVICE_URL` or separate start command is needed; remove legacy `BADGE_SERVICE_URL` entries from both environment files. The web broker defaults to the API's private `/api/credentials` path. The API mounts it before body parsing and shares its existing PostgreSQL pool. `BADGES_ENABLED=false` can explicitly disable the web interface; badges are available by default.

`BADGE_DATA_DIR` defaults to `badge-service/data`. It still holds private issuer keys, server tokens and the approved learner-link file, not an active SQLite database. Preserve this directory alongside database backups: it identifies the signing workspace, and its original keys are required to verify existing awards. Startup refuses a missing or mismatched issuer key. Environment changes require restarting `npm run dev`.

## Link a learner explicitly

An active portal learner UUID must be approved against a learner ID in the badge service's configuration. Use the local operator command after starting the service:

```sh
npm run badges:link-learner -- <portal-learner-uuid> <approved-badge-learner-id>
```

This command checks the active portal record and approved badge config, refuses conflicting or duplicate identity links, and saves a private file atomically. It does not issue a badge. For a synthetic demo only, link a test-domain portal account to `demo-alex` or `demo-jordan`. A mapping is not derived from an email address, Canvas URL, query parameter, browser body or display name. Unlinked learners see a support message. Learner access follows the portal's configured authentication mode: the mock learner cookie in local demo mode, or the verified opaque Canvas learner session (including secure `__Host-` cookies). Every request checks the current learner with the API before resolving the approved badge account link. Staff sessions, stale demo cookies in Canvas mode, revoked sessions and missing links cannot authorize learner access; an email address is not required.

## Preserve the existing pilot

Existing SQLite stores are never silently replaced by an empty PostgreSQL workspace. Stop the old badge writer and the portal, preserve the complete private directory and make a portal database backup, then run:

```sh
npm run db:migrate
npm run badges:import-sqlite -- /absolute/path/to/the/private/badge-directory
```

Use the same directory as `BADGE_DATA_DIR`; use the source's approved `BADGE_CONFIG` and mode. The importer makes a consistent private SQLite backup, verifies badge/certificate signatures, copies data transactionally, checks row counts and exact signed bytes, and refuses an already-existing destination workspace. It preserves the original SQLite file, issuer key, award IDs, sharing/revocation states, designs, rules and certificate snapshots. Global PostgreSQL audit sequence IDs are reassigned in original order. The old configuration fingerprint is retained as `legacy_configuration`, while future configuration checks use the integrated API origin. A failed validation/import leaves no partial workspace. Historical signed URLs/payloads remain byte-for-byte unchanged; importing them does not redirect an old published URL automatically. No historical database outside the configured directory is imported automatically.

The portal offering-to-Canvas mapping and the badge earning rule are distinct. A badge mapping needs an approved version, verified Canvas course/assessment/module IDs, threshold and configured learner identities. The integration neither enables real Canvas credentials nor runs automatic completion polling. The original pilot's Canvas guardrails remain in force. This is still the CU pilot credential format; the included Open Badges 3.0 work is an unsigned model and validator, not certified production issuance.

## Maintenance and verification

Run `npm run badges:build` after changing any pilot UI file. This regenerates the six documents/assets under `src/web/public/credential-tools/`; `npm run build` includes this step. Portal-specific theme/frame files are maintained directly there. Editors preserve their own artwork colors while portal surfaces follow the MUI palette, including dark mode; certificate logos remain centered and headers left-aligned.

```sh
npm run format:check
npm run typecheck
npm run build
CERTIFICATE_PYTHON=/absolute/path/to/python npm run test:badges
npm run test:a11y -- --project=light --grep 'credential integration'
```

Certificate tests also require `pypdf==6.10.0` in that Python environment. The 46 pilot tests exercise signing, duplicate/retry behavior, ownership, publication/mapping drift, manual/CSV atomicity, Open Badges model validation and PDF geometry. `tests/badges.integration.ts` separately exercises the real service and Next broker against an explicitly mocked identity-provider boundary, including staff/learner separation, current-role checks, Canvas-mode fail-closed behavior, CSRF, actor spoofing, learner isolation, sharing removal and certificate downloads. Automated scans are not a screen-reader review or WCAG certification. Current validation evidence is recorded in [the integration review](prototype/badges-integration-review.md).
