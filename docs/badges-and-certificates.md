# Badges and certificates in the CU Portal

The portal is the existing Next.js/Material UI application in this branch. The optional `badge-service/` directory contains the self-hosted pilot, with the same badge design/image uploads, publication and Canvas rules, manual/CSV awards, certificate header/centered logo/signature upload, frozen PDFs, issuance register, learner downloads and sharing. The WordPress plugin is retained only as legacy source; WordPress is not required. [ADR 0008](adr/0008-badges-and-certificates.md) records the integration boundaries.

The [interface requirements](prototype/ui-specification.md#badging-and-certificate-interfaces) specify each screen and its expected behavior.

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

Node.js 24+ is required for the optional badge service's SQLite runtime. Keep the existing portal database setup and migration workflow. In the repository root:

```sh
npm ci
npm run setup
npm run badges:setup
python3 -m venv badge-service/.certificate-venv
badge-service/.certificate-venv/bin/python -m pip install -r badge-service/certificate-renderer/requirements.txt
```

In the ignored root `.env` and web `src/web/.env.local`, configure:

```dotenv
BADGES_ENABLED=true
BADGE_SERVICE_URL=http://127.0.0.1:4178
BADGE_PORT=4178
BADGE_DATA_DIR=badge-service/data
BADGE_LEARNER_MAP_FILE=badge-service/data/portal-learners.json
```

Set `CERTIFICATE_PYTHON` in the root `.env` to the absolute path of the certificate virtual environment's Python. Start `npm run dev:badges` in a separate terminal, alongside the normal portal `npm run dev`. The badge listener binds only to loopback. The first start generates random private service tokens/signing keys; the integrated portal has no issuer-key prompt. For an already-existing web `.env.local`, add the settings explicitly: setup preserves existing files. Changes to environment files require restarting the affected processes. With `BADGES_ENABLED=false`, badge endpoints fail closed without affecting catalog/payment workflows.

## Link a learner explicitly

An active portal learner UUID must be approved against a learner ID in the badge service's configuration. Use the local operator command after starting the service:

```sh
npm run badges:link-learner -- <portal-learner-uuid> <approved-badge-learner-id>
```

This command checks the active portal record and approved badge config, refuses conflicting or duplicate identity links, and saves a private file atomically. It does not issue a badge. For a synthetic demo only, link a test-domain portal account to `demo-alex` or `demo-jordan`. A mapping is not derived from an email address, Canvas URL, query parameter, browser body or display name. Unlinked learners see a support message. Learner access follows the portal's configured authentication mode: the mock learner cookie in local demo mode, or the verified opaque Canvas learner session (including secure `__Host-` cookies). Every request checks the current learner with the API before resolving the approved badge account link. Staff sessions, stale demo cookies in Canvas mode, revoked sessions and missing links cannot authorize learner access; an email address is not required.

## Preserve the existing pilot

Source integration is not a data migration. Do not put the original SQLite databases, signing keys, service tokens, private configuration, PDFs or real learner records in Git. Before attaching existing data, stop its writer, make a consistent backup, preserve the complete signing identity and certificate snapshots, and check credential signatures and counts after restoration. Review the portal learner links individually. The new source includes no historical records and does not overwrite the original running pilot.

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
