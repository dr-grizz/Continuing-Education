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
