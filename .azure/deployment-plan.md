# Azure F1 + Neon demo deployment

Status: Deployed and smoke-tested through continuous deployment, October 27, 2026.

## Scope

One Linux Azure App Service F1 plan runs the compiled web and API processes. Neon PostgreSQL is external and uses TLS. No paid fallback or real Canvas provisioning is enabled. The owner authorized CD from azure-demo on October 27; CI gates a minimal runtime deployment to the existing Web App.

## Configuration and deployment

- Use [the environment reference](../deploy/README.md) and [hosting guide](../docs/hosting/azure-f1-neon.md).
- Keep subscription/account details, runtime secrets, database backups, deployment output and release ZIPs in private ignored storage. The detailed operator journal is local-only.
- Public demo mode requires Canvas OAuth for learners and staff; registration/payment requires a verified learner session and staff operations require explicit roles.
- Build the minimal Linux/amd64 runtime outside Azure. The verified release was approximately 31 MiB compressed / 80 MiB unpacked; it excludes source, development tools, dotenv files and build caches.
- Apply reviewed migrations explicitly through a direct database connection, after backup. The app uses the pooled connection and never migrates at startup.
- Configure Stripe test keys and the dedicated hosted webhook secret. Live keys/events are rejected. Canvas enrollment remains simulated.

## Verification

- Formatting, type checking, hosting boundary tests, staff and learner OAuth integration checks passed.
- The isolated Linux production package passed startup, database and access-boundary checks before deployment.
- Hosted catalog and five course photos load without a browser password gateway. Anonymous staff access and mock sign-in are refused. Same-origin write protection remains enabled.
- Real Canvas learner and linked administrator OAuth completed in the browser. The hosted staff roster contains only the owner-approved administrator; synthetic seed staff were removed after a private full backup. Local fixtures and historical migrations were preserved.
- Stripe sandbox Checkout completed; the signed webhook persisted one paid order and an enrolled demo entitlement. No real charge or Canvas enrollment occurred.
- Hosted catalog and learner/staff sign-in screens reported no axe A/AA violations. Keyboard skip navigation and 320 px catalog reflow passed. Manual screen-reader review remains pending.
- Final cloud readback confirmed F1/Free, HTTPS Only and Running/Normal. Free-tier quota/cold-start limits still apply.

## Rollback and limits

Retain the previous known-good release and database backup privately. Code rollback does not undo database changes; restore into a separate database and verify before deliberately switching connections. The manual release-build workflow remains unprivileged. The CI deployment job uses branch-bound managed-identity OIDC, app-scoped Website Contributor and plan-scoped Reader; runtime secrets remain in Azure. See [the historical local verification record](../docs/hosting/azure-f1-verification.md) for the earlier gated-package checks.


## 7. Validation Proof — continuous deployment

Azure-validate checks completed October 27: `actionlint .github/workflows/ci.yml`, Node 24 `npm run build`, `npm run typecheck`, `npm run format:check`, `npm run test:hosting`, and `npm run test:security` passed. Logs: ignored `artifacts/cd-validation.log` and `artifacts/cd-build-validation.log`. Authenticated `az rest` readback of the existing SCM package metadata passed. The Node 24 Linux runtime is checked before first release. This release changes CI and packaging metadata only; no infrastructure template deployment or database migration is planned. The existing F1 target, East US region and subscription are owner-confirmed. `az bicep build --file infra/main.bicep --outfile artifacts/cd-preflight-infra.json` passed October 27. Live readback confirmed F1, Node 22 before the release's Node 24 selection, remote builds disabled, unchanged campus Deny rules and independent authenticated SCM access. The managed identity has only Website Contributor on the app and Reader on its plan; its issuer/subject/audience were re-fetched. All 24 hosted migration file checksums matched the checkout through read-only SQL before setting the schema approval variable. No live database writes were made.

The pipeline must pass all backend and browser CI checks, produce and verify the actual Linux package, and validate the schema hash before the privileged job. Node 24 runtime selection and ZIP upload occur only in that job. Post-deployment proof includes startup tracking and authenticated release revision readback; public health and Canvas checks require an allowed campus network.


## 8. First CD deployment proof

Run [40529027069](https://github.com/dr-grizz/Continuing-Education/actions/runs/40529027069) succeeded for `a460dd67cc27067997b6a932dae048bc2b191aad`. CI completed in 9 minutes 37 seconds; the successful deploy-only retry took 2 minutes 38 seconds. The first login revealed GitHub's immutable owner/repository-ID subject; the federated credential was corrected to the exact observed subject and read back before retrying, without rerunning CI or rebuilding its artifact.

Published-revision readback passed through authenticated SCM. Live Azure readback confirmed Running, HTTPS Only, Node 24, F1/Free, Always On disabled, the expected startup command and lookup account 49. Campus smoke checks passed: health/catalog 200, anonymous staff 401 and unsigned Stripe webhook 400. The 16 campus/Stripe Allow rules, default Deny and separate SCM restrictions remain intact. The pipeline did not migrate or write hosted database records. Fresh staff/learner OAuth, a real Canvas directory search and a new Stripe sandbox payment were not exercised in this CD smoke test; they need an allowed browser session.


## 9. Standalone CU Badge preview — approved October 27

Status: Preparation. The owner requested CU Badge on the existing Azure demo before API integration. Use the existing F1 app and branch-bound CD; no new paid resource, public listener or Neon schema change. Start the existing badge adapter on loopback 4178 alongside web/API, expose it only through existing authenticated portal brokers, and package its runtime plus a portable Python certificate renderer. Keep demo mode enabled with fictional learners and a fresh temporary local SQLite store, avoiding WAL on the network-backed content directory. Preview badge data/keys may reset on restart; do not import historical data or identities. Existing portal data/settings remain preserved.

Validation must cover disabled and enabled packaged startup, real Linux PDF rendering, no private data in the ZIP, current staff authorization, synthetic-only mappings, memory/size, and post-deployment health/credential routes. The separate embedded API integration plan remains a draft and is not part of this change. Re-fetch runtime/network settings and verify F1 after deployment. User subscription, region and target are already confirmed.


### Badge preview validation proof

Azure-prepare scope is owner-approved. Azure-validate checks: Node 24 build, typecheck, formatting, hosting/security tests, all 47 badge-service tests and 63 broker integration checks passed. Local traced package with portable Python measured 122 MiB and passed isolated TLS database startup, protected badge API and real relocated-Python PDF rendering. Settled API/web/badge RSS was about 493 MiB on the local Mac; this is not a Linux peak-memory guarantee. Workflow lint passed. The branch's Linux CI must repeat package verification with badges disabled and enabled before CD; badges stay disabled in Azure until the capable release is published. No infrastructure template deployment or hosted database write is needed. Historical data sources remain excluded.

Status: Validated for the existing CD pipeline; Linux package proof and cloud preview enablement remain required in azure-deploy.


### Standalone badge preview deployed — October 27

Azure-deploy completed through [run 40537873525](https://github.com/dr-grizz/Continuing-Education/actions/runs/40537873525), revision `96c35b78aed49ceb8714215605150c3204c15ef8`. All 107 browser checks passed in 4.7 minutes; 47 badge-service tests and 63 real-service broker checks passed. Both disabled and enabled Linux package smoke tests passed, including portable-Python PDF output. The actual Linux runtime is 282 MiB unpacked; settled API/web/badge RSS in CI was 407 MiB. The earlier Mac package size is not the Linux release size.

After publication, only `BADGES_ENABLED=true` and `BADGE_DEMO_PREVIEW=true` were added to the existing App Service settings and re-fetched. The actual app container executed a synthetic renderer probe: private badge health reported demo mode and Python produced a valid 22,672-byte PDF. The command's accepted response alone was not treated as proof; the completed JSON result was re-read through authenticated SCM. Portal health returned 200; anonymous badge administration returned 401 and a missing/unshared public credential returned 404. F1/Free, default Deny, all 16 campus/Stripe Allow rules and independent SCM restrictions were re-fetched. Azure reported about 333 MiB MemoryWorkingSet for the sampled minute after the smoke test; sustained/peak use remains unproven.

The operator's browser reached the Canvas Authorize page for CUCE Dev Test. Authorization was not clicked without action-time confirmation. Staff workspace visual inspection remains behind that confirmation. No historical badge data/keys or learner links were imported, no embedded API migration was performed, and the portal's Neon database was not reset or migrated. Preview badge data is disposable on restart. Disable `BADGES_ENABLED` for portal-only rollback.
