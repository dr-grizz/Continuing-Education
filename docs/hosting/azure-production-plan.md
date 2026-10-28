# Separate Azure App Service + PostgreSQL deployment plan

Status: Planning — documentation only; not approved, validated or deployed.
Prepared October 27, 2026 against `main` commit `684a85d`; amended October 28 for the [explicit beta profile](../adr/0014-hosted-beta-profile.md). Recheck the source before execution.

## 1. Handoff and authorization

Prepare a **separate paid Linux App Service deployment using Azure Database for PostgreSQL Flexible Server**. The owner will provision/select the target hosting environment. The target app's `DATABASE_URL` is expected to exist already. This document authorizes no cloud writes, new paid resources, database migrations or application behavior changes by itself. A future agent should present concrete target IDs, configuration changes and migration effects before executing the next authorized deployment.

The current application supports an explicit hosted beta on paid infrastructure, while retaining prototype behavior: real Stripe charges, guest provisioning and real Canvas enrollment are not enabled. First deploy the current safe application on the new infrastructure; a genuine production service requires the separate application work and acceptance in section 9. Do not bypass guards or rename flags to imply production readiness.

Use this file as the handoff, rather than replacing `.azure/deployment-plan.md`, which belongs to the F1 demo. If a deployment skill requires that exact path, use an isolated future deployment checkout and preserve the existing demo plan; do not overwrite it in the shared source. Only mark this plan validated after collecting actual target-specific evidence.

### Protected demo resources and files

- Keep `cuce-demo`, `rg-continuinged-demo`, the `cuce-demo-free` F1 plan, its Neon database, campus/Stripe rules, runtime secrets and persistent badge keys unchanged.
- Keep `infra/main.bicep`, `infra/demo-subscription.bicep`, `infra/demo.bicepparam.example`, `deploy/azure-demo.env.example`, the existing `.azure/deployment-plan.md` and demo guides as the demo configuration.
- Keep `.github/workflows/ci.yml` and `.github/workflows/azure-demo.yml` unchanged for this preparation. `azure-demo` remains the only deployment branch for that existing pipeline. Do not repoint it, change its identity/permissions or change `AZURE_DEMO_SCHEMA_HASH` for this new environment.
- **Do not create a CD file, new deployment workflow, GitHub environment or federated identity yet.** Plan the initial release as a manual deployment. No new workflow was created by this plan.
- Do not copy demo databases, staff sessions, learner records, Stripe events, issuer keys or tokens into the new environment. Any requested data transfer needs a separate explicit source/target migration plan.

## 2. Inputs the executing agent must resolve

No target-specific Azure inspection was performed during this planning task. Do not infer these values from the demo or a CLI default.

| Input | Required resolution before execution |
| --- | --- |
| Subscription, tenant, resource group, Web App name/resource ID | Owner supplies names; verify the IDs and subscription before every write. Reject any target equal to the protected demo. |
| Region and paid App Service plan | Read the selected resources and actual SKU. Keep the existing selected plan; confirm budget before creating or resizing anything. Recommend a Standard-or-higher tier if staging slots are required. |
| Public hostname | Owner-selected HTTPS origin; determine whether a custom domain is used before OAuth registration. |
| PostgreSQL server/database | Resolve privately from the existing app setting (including a Key Vault reference, if present), then confirm the intended server/database with the owner. Verify Flexible Server, version, authentication, database state, capacity and backups. |
| Application intent | Initial hosted-prototype release versus a later fully operational production service; live operations remain blocked until section 9 is completed. |
| Audience/network | Decide public versus campus-restricted access for this target. Do not inherit demo allowlists automatically. |
| RPO/RTO and availability | Agree backup retention, recovery time, maintenance window and whether database HA is required. One instance is the initial compatibility profile, not an HA claim. |
| Initial administrator | Recommend owner `hye@cedarville.edu` only after confirmation for this separate database; verify the actual Canvas origin and numeric user ID. Never infer a user ID or grant a role based only on an email. |
| Canvas integrations | Confirm account/subaccount 49 is intended here. Staff lookup and course reads are independent opt-ins with corresponding developer-key scopes. |
| Badges | Start disabled until persistent storage and keys are ready; confirm synthetic demo mode versus separately approved real credential configuration. |

Resource preparation is **modify existing**, not create-from-template. Inspect the target app/plan, PostgreSQL, VNet/subnets/private DNS and optional Key Vault/monitoring resources. Record IDs, ownership, region and capabilities. New-resource counts are zero for the initial existing-resource deployment; any missing dependency or proposed paid addition requires an updated inventory, quota/capacity validation and owner confirmation. No quota or cost validation is claimed here.

## 3. Target architecture and constraints

```text
Users / Canvas OAuth / Stripe sandbox
                  |
        HTTPS on the NEW Web App
                  |
       Next.js on platform PORT
                  |
    NestJS on 127.0.0.1:3051
       |                    |
Azure PostgreSQL      Embedded credentials
(portal + credentials)      |
                     Persistent issuer files
                     + bundled Python renderer
```

Use the existing minimal Linux/amd64 Node 24 release, with Next standalone output and the compiled API. `node scripts/start-demo.mjs` currently supervises both processes; its name does not restrict it to F1, but its hosted demo/beta safeguards remain mandatory. The script starts no listener on 4178 and performs no migrations. Keep its current heap limits initially; measure total RSS/native/Python memory before tuning.

Start with **one application instance and no automatic scale-out**. Temporary Canvas previews and some credential sessions remain process-local; key/fingerprint initialization and concurrent restart behavior need explicit review before overlapping writers or multiple replicas. PostgreSQL transactions alone do not prove the whole application safe for scale-out. Paid Always On does not add a background fulfillment worker.

Prefer App Service VNet integration with database private connectivity and working private DNS when supported by the selected resources. If public database connectivity is the approved initial route, use narrowly reviewed firewall rules for the target app's outbound addresses and the migration runner. Do not use a broad Allow Azure services rule as a shortcut. Test DNS, TCP, TLS and SQL from the actual app container and migration environment separately.

Preserve the app's existing connection string. Azure PostgreSQL may use direct port 5432 or enabled PgBouncer on 6432; a `-pooler` hostname is a Neon convention, not a requirement. Verify actual pooling support/configuration before changing ports. The current app has a five-connection `pg` pool per API instance. Database credentials in the existing URL are supported; merely enabling managed identity does **not** implement PostgreSQL token acquisition/refresh in this application.

## 4. Complete target settings checklist

This is a **planned target settings inventory**, not a filled dotenv file or instruction to alter the running demo. Target-specific values/secrets are intentionally absent. The executing agent must privately export a rollback copy, compute a proposed patch, preserve all unrelated settings, and read back the persisted result without displaying secrets. App settings edits restart App Service. Never apply a full settings replacement generated from the demo template or from incomplete CLI output.

Use the separate [beta environment example](../../deploy/azure-beta.env.example) as a patch checklist. It deliberately has no `DATABASE_URL` assignment and selects `HOSTED_BETA=true`, `HOSTED_DEMO=false`, `PROTOTYPE_MODE=true` and Canvas-only sign-in. The local beta profile and packaged-runtime checks were added October 28; actual target Azure validation remains pending.

### App Service resource configuration (not environment variables)

| Setting | Planned target / action |
| --- | --- |
| OS/runtime | Linux, built-in `NODE\|24-lts`; verify availability and installed Node 24 at deployment time. Do not confuse the Node image with the bundled Python renderer. |
| Startup command | `node scripts/start-demo.mjs`, with the deployed release as working directory. |
| Paid plan/instance count | Preserve confirmed target paid plan; one active instance initially. Never move the F1 app onto this plan. |
| Always On | Enable on the selected supported paid plan. |
| HTTPS and TLS | HTTPS Only, minimum TLS 1.2 or stronger supported policy for main and SCM endpoints. Configure/verify custom-domain certificate and DNS if selected. |
| Health check | `/healthz` initially. It checks web-to-API liveness, **not** database readiness; add a separate restricted DB/credential readiness probe before a real production launch. |
| Publishing/access | Disable FTP and SCM basic publishing; use authenticated Azure CLI/Entra deployment. Explicitly review main-site access rules and SCM rules independently. |
| Built-in authentication | Do not enable an outer Easy Auth login gate by accident; Canvas OAuth is app-managed. Any approved outer gate must preserve exact OAuth callbacks and signed webhook reachability. |
| Slots | Optional later, supported SKU required. Define environment-sticky settings and distinct staging DB/keys/OAuth/webhook configuration before creating or swapping a slot. Do not clone production secrets blindly. |
| Monitoring | Enable bounded/redacted application logs, metrics and owner-selected alerts. Do not assume App Insights SDK instrumentation exists just because a connection string is present. |

### Core runtime and database

| Variable | Planned value / preservation rule |
| --- | --- |
| `DATABASE_URL` | **Already configured on the target app: preserve verbatim.** Do not put a placeholder, Neon URL, local URL, password or Key Vault secret value in tracked files. Verify privately that it reaches the intended Azure database with certificate validation and permitted credentials. If invalid/missing, stop and report; do not silently replace it. |
| `NODE_ENV` | `production` for the optimized runtime. |
| `HOSTED_BETA` | `true` for this separate beta deployment; requires Canvas-only authentication, HTTPS, broker tokens and the retained simulation safeguards. |
| `HOSTED_DEMO` | `false` or absent on beta. Demo and beta cannot both be enabled. Keep the existing demo's value unchanged. |
| `PROTOTYPE_MODE` | `true`; current code refuses the alternate mode. A production hosting SKU does not remove this limitation. |
| `WEB_URL` | Exact new public HTTPS origin, no path/query/trailing-slash ambiguity. Never use `cuce-demo.azurewebsites.net`. |
| `API_PORT` | `3051`. |
| `API_URL` | `http://127.0.0.1:3051`; must match `API_PORT`. API remains loopback-only. |
| `PORT` | Respect App Service's injected runtime value; launcher defaults to 8080 if absent. Do not hard-code a competing port or expose the API publicly. |
| `DEMO_ACCESS_GATE` | `none` for app-managed Canvas sign-in; requires both authentication modes below to be `canvas`. Campus restrictions, if chosen, are separate Azure rules. |
| `DEMO_ACCESS_USERNAME`, `DEMO_ACCESS_PASSWORD` | Omit for `none`. Only an explicitly selected `basic` profile needs a username and strong random password; never copy the demo audience password. |
| `LEARNER_API_TOKEN`, `STAFF_API_TOKEN`, `AUTOMATION_API_TOKEN` | Three distinct fresh secrets, at least 32 characters each. Generate privately for this environment; preserve existing valid target tokens unless rotating deliberately. Never reuse demo tokens. |
| `NEXT_TELEMETRY_DISABLED` | `1` at build/runtime. |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false`; upload only the prebuilt verified release. |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE` | Verify `/home` persistence for the selected Linux hosting configuration; enable persistent App Service storage where applicable. Prove key survival after restart and ZIP replacement, rather than relying on the setting alone. |
| `WEBSITE_RUN_FROM_PACKAGE`, `ENABLE_ORYX_BUILD` | Inspect existing values and compatibility with the chosen ZIP deployment. Do not introduce a conflicting run-from-package/remote-build mode; any necessary change belongs in the reviewed patch. |

`MIGRATION_DATABASE_URL` is **operator-only**, not an App Service setting. Use a separately supplied secure direct/session connection to the same Azure database on port 5432, with the necessary DDL rights and certificate validation. Never run session-advisory-lock migrations through transaction-pooling port 6432. Keep runtime roles least-privileged; assess whether current key/workspace initialization requires writes on startup. Do not assume runtime credentials can perform migrations.

TLS must validate the server certificate and hostname using current Azure trust guidance; do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized:false`. If the preserved `DATABASE_URL` lacks the parameters required by `assertHostedDatabase`, present the minimal correction for approval rather than applying it silently. Preserve percent-encoded credentials and provider-specific parameters.

### Canvas authentication and optional staff integrations

| Variable | Planned value / action |
| --- | --- |
| `STAFF_AUTH_MODE`, `LEARNER_AUTH_MODE` | Both `canvas`; no hosted mock fallback. |
| `CANVAS_BASE_URL` | Confirm intended installation, normally `https://cedarville.instructure.com`. |
| `CANVAS_STAFF_CLIENT_ID`, `CANVAS_STAFF_CLIENT_SECRET` | Confirm an approved OAuth developer key for this environment; preferably separate from the demo. Preserve valid target secrets; never copy from local/demo settings implicitly. The learner flow currently uses this same registered client with identity-only scopes. |
| `CANVAS_STAFF_REDIRECT_URI` | `https://<new-public-host>/api/auth/canvas/callback`. Add this exact URL to the chosen Canvas key while retaining existing demo and localhost callbacks if that key is shared. |
| `CANVAS_STAFF_AUTHORIZE_URL`, `CANVAS_STAFF_TOKEN_URL` | Omit normally; defaults derive from Canvas (`/login/oauth2/auth`, `/login/oauth2/token`). Overrides must use the same configured Canvas origin. |
| `STAFF_SESSION_HOURS`, `LEARNER_SESSION_HOURS` | Explicit `8` each initially; supported range 1–24. Confirm policy before changing. |
| `CANVAS_STAFF_FORCE_LOGIN` | `false` initially to permit existing institutional SSO; Canvas login still must complete the app callback/session creation. |
| `CANVAS_USER_AGENT` | A printable identifying value such as `Cedarville-CE-Portal/0.1.0`; add approved operational contact information if desired. |
| `CANVAS_COURSES_ENABLED` | `false` until the owner confirms course reads and the developer key/user permissions pass validation; then explicitly enable. |
| `CANVAS_COURSES_SUBACCOUNT_ID` | `49` only after confirming the intended scope for this environment. Required when course reads are enabled. |
| `CANVAS_COURSES_INCLUDE_SUBACCOUNTS` | `false` initially; widening scope requires explicit review. |
| `CANVAS_STAFF_LOOKUP_ACCOUNT_ID` | `49` after confirming directory lookup is wanted and permitted; otherwise omit. This feature is separate from course reads. |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | Required when course reads or staff lookup are enabled: 32 random bytes encoded in canonical base64. Generate separately for this environment, retain securely and back up; rotating it can make stored grants unreadable. |
| `CANVAS_COURSES_PREVIEW_DIRECTORY` | Private temporary directory, e.g. `/tmp/cuce-course-previews`. These encrypted previews may expire/disappear and are recreated through a new staff preview; never store them in public assets. |

Portal role and Canvas account/subaccount permission are separate checks. A learner cannot acquire staff privileges by changing browser parameters. Directory/course scopes belong only to the staff OAuth path. Enabling those scopes may require existing staff to reauthorize. An email in the staff list alone does not bind the correct Canvas installation/user ID.

### Stripe and credentials

| Variable | Planned value / action |
| --- | --- |
| `STRIPE_SECRET_KEY` | Omit for simulated payments, or provide this environment's approved `sk_test_…`/`rk_test_…` for sandbox Checkout. Current code rejects live keys. |
| `STRIPE_WEBHOOK_SECRET` | Required with sandbox Checkout: dedicated secret for the new HTTPS `/api/webhooks/stripe` endpoint. Never reuse the demo/local Stripe CLI secret. Verify event selection and test mode against the current handler. |
| `BADGES_ENABLED` | Explicit `false` until schema, storage, keys and renderer are validated; then `true` if requested. |
| `BADGE_DATA_DIR` | Stable canonical private persistent absolute path such as `/home/data/cuce-credentials`, separate from deployed release and any demo mount. It identifies the signing workspace. Never delete/recreate it on deployment or bypass a fingerprint/key mismatch. |
| `BADGE_LEARNER_MAP_FILE` | `/home/data/cuce-credentials/portal-learners.json` when badges are enabled. Explicit reviewed mappings only; no email matching or automatic import. |
| `BADGE_DEMO` | Explicit `true` for initial synthetic badge validation. `false` requires separately reviewed real credential configuration/identity/evidence rules; it does not enable live portal fulfillment. |
| `BADGE_CONFIG` | Omit for fictional built-in demo configuration. A later real configuration must be a reviewed private file at a persistent absolute path outside the release, with matching issuer identity/fingerprint and backups. |
| `BADGE_DEMO_PREVIEW` | `true` initially if badges enabled, retaining the single-PDF concurrency limit. It no longer means disposable SQLite storage. |
| `CERTIFICATE_PYTHON` | Supplied by launcher as the release's `python/bin/python3`; package the compatible Linux runtime, ReportLab/Pillow and fonts. Do not point at a developer machine or assume platform Python is installed. |
| `BADGE_SERVICE_URL` | Omit; the integrated launcher removes the override and uses the existing API. No separate 4178 service. |

`LAN_HOST` is for local development; omit. `WEBSITE_SITE_NAME`, `HOSTNAME` and platform metadata are platform/launcher managed, not credentials to copy. Do not invent environment variables for database HA, backup retention, network rules or monitoring; configure those resources explicitly. The settings above cover the current runtime; re-scan environment usage if source changes before execution.

## 5. Database preparation and initial data

1. Privately resolve the existing `DATABASE_URL`, including Key Vault access if used; verify database/server identity and distinguish the runtime role from the migration role. Never print the URL. Test TLS, authentication and a bounded `SELECT 1` from the app container without exposing credentials.
2. Inspect version, existing tables, completed/failed migrations, checksums and row counts read-only. Stop on an unrelated database, checksum drift, failed migration or application tables without trustworthy history. Do not baseline blindly.
3. Verify automated backups/retention and an actual recoverable restore point. Create a private full `pg_dump --format=custom` using compatible PostgreSQL tools and the direct connection. List the archive and restore it into an isolated disposable database; compare schema/counts. Backup/restoration of issuer files and the encryption key is separate from PostgreSQL backup.
4. Review every pending migration from the selected release. Current source has 25 directories (`000` through `024_integrated_credentials`); do not assume the target has the demo's existing 24/25 records. On an empty database the baseline and later migrations insert synthetic offerings/learners/staff. Preview those effects before execution.
5. Apply the repository authority `npm run db:migrate` under Node 24, with `MIGRATION_DATABASE_URL` supplied privately. It serializes migrations and invokes Prisma deploy. Never use `migrate reset`, `db push`, a general setup/seed command or startup migrations against the target. Do not edit already-applied SQL to remove seed records.
6. Run `npm run db:migrate:status` with `DATABASE_URL` temporarily bound **in the operator process only** to the direct URL; verify every persisted completed migration name and SHA-256 against the release files. Check expected tables/triggers and original row-count changes against reviewed SQL. Migration 024 should add 11 credential tables without changing existing portal rows.
7. Before enabling public access, inventory synthetic staff/catalog content and prepare a narrow bootstrap/cleanup transaction with exact IDs/counts and rollback. Create/confirm only the owner-approved administrator with a verified Canvas binding and roles; disable/remove unwanted synthetic accounts as reviewed. On an existing populated DB, preserve legitimate staff, learners, orders and catalog data. No blanket deletion or automatic promotion by email.
8. Store target-specific migration proof privately with the release revision. Do not use the demo's GitHub schema approval variable as proof or change it for this target. If schema approval automation is added later it must have separate production identity and state.

## 6. Ordered implementation tasks for the next agent

Each phase has an exit gate. Keep this document's status accurate and save secret-bearing evidence in ignored private storage, never in commits or CI artifacts.

1. **Confirm target and application intent.** Fill section 2, verify a clean source checkout/revision, and preserve unrelated work. Read `CONTEXT.md`, relevant ADRs, this plan and current startup/package code. Record that this is a new paid environment, not a demo upgrade. Resolve a later production-service ADR before changing prototype safety behavior.
2. **Inventory and compare settings privately.** Read the target app/plan, existing settings/references, database identity, networking and storage. Make a rollback export with restricted local access. Prepare a patch from section 4, preserving `DATABASE_URL` and unrelated settings byte-for-byte. Show secret names and nonsecret changes only; never publish the full Azure CLI settings output. Stop on missing target/database rather than provisioning replacements implicitly.
3. **Prepare isolated deployment artifacts after approval.** If configuration code is needed, add future files under `infra/production/` and `deploy/production/`; do not mutate the F1 templates. Import/reference existing resources carefully, rather than redeclaring or replacing the app/settings. Plan target parameters without embedding the database URL. Do not create any CD workflow. Build on Linux/amd64 Node 24 from lockfiles with synthetic build/test settings, never production DB credentials.
4. **Validate application/release locally.** Run the required backend/auth/security/migration/build checks and full browser matrix before release. The packaged verifier now also restarts into the independent beta profile to check Canvas-only sign-in, secure OAuth flow cookies and continued live-event refusal. Use disposable databases. Build the portable Python runtime and run `npm run package:demo`, `npm run verify:demo` and `npm run verify:demo -- --badges` in an isolated build directory; these existing scripts use `artifacts/azure-demo` as a local output name, not as an Azure target. Add release revision/schema metadata and ZIP contents exactly as the existing verified packaging procedure does. Exclude dotenv files, private config/data/keys and caches. Preserve package/checksums and a known-good rollback artifact.
5. **Prepare target database, identity and storage.** Follow section 5 and the reviewed bootstrap. Provision/reuse the target's persistent private badge directory only after confirming it is not the demo's storage. For new issuer identity generate keys through the application only when ready; for approved existing credentials restore/import the matching identity explicitly. Verify filesystem access restrictions under actual App Service mount semantics, no HTTP serving of private files and backup restoration. Do not assume POSIX mode bits alone enforce isolation on mounted storage.
6. **Apply the reviewed target-only configuration.** Use authenticated CLI patch operations; do not replace the complete settings object. Capture readback and verify no unrelated secret/setting changed and `DATABASE_URL` is unchanged. Configure runtime/startup, Always On, TLS, health/networking and selected feature flags. Coordinate these restarts with the release window; do not enable the new hostname/DNS audience prematurely.
7. **Deploy manually after target validation.** Use a command equivalent to `az webapp deploy --resource-group "$PRODUCTION_RESOURCE_GROUP" --name "$PRODUCTION_WEBAPP_NAME" --src-path "$VERIFIED_ZIP" --type zip --clean true --restart true --track-status true --timeout 600000 --output none`, with explicit confirmed subscription context and guarded target IDs. Validate selected SKU capabilities, not the demo pipeline's hard-coded F1 check. Stop if target names are unfilled or refer to `cuce-demo`. Do not trigger or edit demo CD for this release. Keep private data outside `wwwroot` because clean ZIP replacement removes release files.
8. **Read back and test before opening access.** Verify the published revision through authenticated SCM, Azure startup state and section 7. Add the new Canvas callback/Stripe test endpoint without removing the demo's. Complete real browser sign-in/permissions/lookup and sandbox payment smoke tests using approved test accounts. Start with badges disabled if their separate enablement gates are incomplete.
9. **Record handoff and recoverability.** Save target IDs, release checksum/revision, migration results, sanitized settings diff, backup/restore locations, observed resource use, unresolved gaps and rollback command. Update only this environment's plan/documentation. Report fully qualified site URLs and whether the site is still a hosted prototype. Leave CD deferred.

## 7. Acceptance evidence before release completion

| Check | Required evidence |
| --- | --- |
| Environment isolation | Demo app/plan/database/CD identity/network rules unchanged; no demo secrets copied. Exact new target resource IDs recorded. |
| Settings | Target `DATABASE_URL` preserved; TLS verified; all required settings resolved without placeholders; unrelated settings unchanged. |
| Database | Backup restore tested; persisted migration names/checksums match release; intended bootstrap only; synthetic accounts/content reviewed before public opening. |
| Runtime | Node 24, expected paid SKU, Always On, only web/API supervised, no 4178 listener, correct release metadata. |
| Health/readiness | `/healthz` 200 plus separate app-to-DB query; credential health when enabled. Document that current health does not prove DB readiness or sustained availability. |
| Canvas | Staff and learner OAuth on the new origin; callbacks/state/replay/cookies verified; learner cannot access staff operations; active staff role plus verified Canvas ID; lookup/course scope denied appropriately outside Canvas permission. |
| Payment | If enabled: sandbox Checkout, signed webhook, one expected test order/entitlement, duplicate-event idempotency, and live-mode refusal. No actual charges or Canvas enrollment. |
| Credentials | When enabled: anonymous/private access boundaries, distinct learner ownership, real synthetic PDF rendering, restart and ZIP-replacement persistence of key identity and expected PostgreSQL records; backup restored separately. |
| Accessibility | Automated full browser suite and keyboard/focus/reflow checks for affected workflows; manual screen-reader review documented, with any remaining gaps explicitly disclosed. |
| Operations | Logs redact tokens/PII; owner-confirmed alerts and recovery contacts; measured memory/CPU/PDF concurrency and connection usage on the actual selected plan. No HA claim from single-instance smoke checks. |

Validation proof is currently **not collected**. The executing agent must record command/result/timestamp, source revision and target resource ID for each check before changing status to Validated/Deployed. Existing demo proof and CI success cannot substitute for this environment's connectivity and persistence tests.

## 8. Rollback and recovery

Retain the previous target release and sanitized settings manifest plus private full settings export before each change. If the target has no previous release, keep access closed and stop the new app rather than routing users to the demo. Reapply the known-good target configuration/release only after verifying schema compatibility. App rollback does not reverse migrations or newly written records.

For a database problem, stop new writes, preserve the current state, restore to a **separate** server/database, verify counts/signatures/identity mappings and obtain explicit confirmation before deliberately changing the existing `DATABASE_URL`. Never restore an old backup over the live DB or erase new payments/credentials as an automatic rollback. Restore matching badge keys/config/encryption key together with the database as required; do not generate a new signing identity to silence a mismatch. Record approved RPO/RTO and rehearse recovery before real operations.

## 9. Separate gates for a real production service

These are follow-up implementation requirements, not settings changes authorized by this plan:

- Replace/amend the hosted-prototype contract through a reviewed ADR and explicit product acceptance. Beta uses `HOSTED_BETA=true` and retains `PROTOTYPE_MODE=true`, live-key rejection and simulated enrollment as intentional safeguards.
- Implement/test approved real payment/refund/reconciliation behavior and financial audit/idempotency, then configure separate live Stripe keys/webhooks only after code explicitly supports them.
- Implement approved identity/guest provisioning and real Canvas enrollment, failure recovery and lifecycle handling. Current read-only Canvas course integration and role assignment do not provision access.
- Replace prototype database media storage with the agreed production storage design (ADR 0011 references ADR 0006), or document and approve a bounded alternative with privacy/backup/retention controls.
- Resolve process-local state and concurrent initialization before scale-out or overlapping deployment-slot instances. Review runtime/migration DB permissions, secret rotation, persistent issuer backup and ownership, data retention, incident procedures, availability/recovery objectives and load evidence.
- Complete production security/privacy and accessibility acceptance, including manual screen-reader review. No existing prototype test result alone establishes production readiness.

## 10. Sources and document precedence

Current source references: `src/domain/hosted-demo.ts`, `src/domain/db.ts`, `src/server/staff-auth-config.ts`, `src/server/learner-auth-config.ts`, `src/server/canvas-course-config.ts`, `src/server/stripe.ts`, `src/server/main.ts`, `src/web/server/badges.ts`, `scripts/start-demo.mjs`, `scripts/db-migrate.ts`, `scripts/package-demo.mjs`, `scripts/verify-demo.mjs`, `prisma/migrations/` and `docs/adr/0011-integrated-postgres-credentials.md`.

Azure documentation checked October 27, 2026; recheck selected-region/SKU details before execution:

- [App Service settings, runtime configuration and restart behavior](https://learn.microsoft.com/en-us/azure/app-service/configure-common).
- [App Service environment settings](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings).
- [Deployment slots and environment-sticky settings](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots).
- [App Service health checks](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check).
- [Azure PostgreSQL TLS and trusted certificates](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls).
- [Azure PostgreSQL PgBouncer, supported tiers and connection ports](https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer).
- [Private database networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private).
- [PostgreSQL backup and restore](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore).

The older [demo deployment plan](deployment-plan.md) describes historical Container Apps alternatives and startup migrations; do not use it as instructions for this target. The current [F1/Neon guide](azure-f1-neon.md) and [demo CD guide](azure-demo-cd.md) remain authoritative for the **existing demo only**. This separate plan does not supersede or reconfigure them.
