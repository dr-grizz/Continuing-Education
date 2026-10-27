# Azure F1 + Neon demo template

Prepared October 23, 2026. **Current state, October 26:** the public demo is deployed at https://cuce-demo.azurewebsites.net on the East US F1 plan, connected to Neon. The browser password gateway is removed (`DEMO_ACCESS_GATE=none`); Canvas OAuth is required for learner actions and staff access. Real learner and administrator sign-in were verified. The sole hosted staff member is `hye@cedarville.edu`. Course photos are public, and Stripe uses test keys with a dedicated hosted webhook. Real charges and Canvas enrollment remain disabled. Deployment from `azure-demo` is automated after CI; see [continuous deployment](azure-demo-cd.md). See [ADR 0012](../adr/0012-public-demo-canvas-oauth.md). Manual screen-reader review remains pending.

The next release template uses Node 24 to match the current main branch. The previously deployed demo was built on Node 22; pushes to `azure-demo` now build and deploy the Node 24 runtime after CI passes. Badge-service hosting remains a separate configuration and is not added to the minimal demo runtime.

## What is included

- `infra/main.bicep`: a Linux App Service **F1** plan and Node 24 Web App. HTTPS only; FTP and SCM basic publishing credentials disabled. It never falls back to a paid plan. No Azure database, registry, Key Vault or paid monitoring resource.
- `deploy/azure-demo.env.example`: runtime setting names and placeholders. Secrets stay in App Service settings, never in source control or the release archive.
- `infra/demo.bicepparam.example`: parameters read sensitive values from the operator's environment. Copy it to the ignored `artifacts/demo.bicepparam` before editing.
- `.github/workflows/ci.yml`: builds, verifies and deploys successful `azure-demo` pushes through branch-bound OIDC; see [setup and rollback](azure-demo-cd.md).
- `.github/workflows/azure-demo.yml`: manually builds a Linux/Node 24 ZIP artifact. It has read-only repository permission, receives no cloud secrets and **does not deploy or migrate**.
- `npm start`: checks the hosted-demo settings, starts the compiled API on `127.0.0.1:3051`, waits for its liveness endpoint and then starts Next.js on `0.0.0.0:$PORT` (8080 if unset). Either child failing stops both. SIGTERM/SIGINT stop both. Heap limits are 256 MB for API and 384 MB for web; native allocations still count toward the host's RAM limit.
- `npm run package:demo`: combines Next.js standalone output with the traced compiled API dependencies in ignored `artifacts/azure-demo`. It omits `.env`, source, tests and build caches, and refuses packages above 600 MiB. Build/package on Ubuntu for Azure; a macOS package is for local verification only.

The website and API share one instance. There is no worker, polling scheduler or startup migration. Temporary encrypted Canvas previews can disappear on restart; reread the preview. Durable records and uploaded demo images remain in PostgreSQL.

## Demo access and identities

The current public demo uses `DEMO_ACCESS_GATE=none`. This mode refuses to start unless both authentication modes are `canvas`. Anonymous visitors can browse course pages and photos; registration and payment require a verified learner session, and staff actions require an explicitly linked staff identity and roles.

For a separate gated demonstration, set `DEMO_ACCESS_GATE=basic` (the compatibility default), a username and a unique password of at least 24 printable characters. Missing or invalid hosted settings fail closed. Use different strong values for all three broker tokens. HTTPS Only must remain enabled.

**Preserve the existing account decision:** the template selects `STAFF_AUTH_MODE=canvas` and `LEARNER_AUTH_MODE=canvas`, using the existing shared Canvas OAuth client and callback. Set `CANVAS_BASE_URL`, client ID/secret and the exact `https://<actual-hostname>/api/auth/canvas/callback` URI in both Canvas and App Service. Staff identities must already be explicitly linked to portal staff records. Do not infer access or roles from learner login or email. See [staff OAuth](../canvas-staff-auth.md) and [learner OAuth](../canvas-learner-auth.md). Guest provisioning remains simulated/deferred.

For an isolated synthetic demonstration without Canvas, both modes can explicitly be set to `mock` behind the gate. Anyone admitted to that demo can impersonate its mock identities, including staff. Mock selection must never be mistaken for verified authentication. Do not import real learner or payment data.

In optional Basic mode, every page, API broker, media route, API reference and static asset is gated, with two narrow exceptions:

- `GET`/`HEAD /healthz`: process liveness only; no database queries or job advancement. Returns 503 if the API is unavailable. It does not prove database connectivity.
- `POST /api/webhooks/stripe`: forwards the raw body and Stripe signature to the internal API. Missing/invalid signatures are rejected; live events are refused. No broker credentials are forwarded. Other methods and other webhook paths are gated.

Hosted browser writes require an `Origin` matching `WEB_URL`; cross-site requests are refused even with the gate credentials. Mock cookies are Secure when hosted. The API stays bound to loopback and must never receive its own public port/ingress rule. API reference links use the gated `/api/docs` OpenAPI JSON endpoint.

## Neon database

1. Create a separate Neon Free project/branch for this demo. Select a region close to the eventual Azure region. Keep the existing local database unchanged.
2. Copy the **pooled** connection URL into App Service's `DATABASE_URL`. Preserve the provider's connection parameters and use `sslmode=verify-full` (or `require`). Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. Copy the **direct/unpooled** connection URL into the migration operator's `MIGRATION_DATABASE_URL`. The migration wrapper holds a session-level advisory lock, which is incompatible with transaction pooling. The runtime host does not need this secret.
4. Back up an existing demo database before migration with `pg_dump` using the direct URL. Restore into a separate disposable database to prove recovery. Never restore over a database you want to preserve.
5. With the release's source checkout, dependencies and hosted environment loaded securely, run `npm run db:migrate`. This is the existing migration authority; it applies reviewed migrations and seeds synthetic data only for a new empty database. Do not use `db push`, `migrate dev` or reset against a shared database. Stop if migration fails; do not deploy that release.

Neon compute sleeps when inactive, so initial database requests can take longer. The application's pool has at most five connections with a 15-second connection timeout. Check the live free-plan storage/compute/transfer quotas before a demo; free allowances can change. Keep automatic paid upgrades disabled if $0 is a firm requirement.

## Reproducing Azure setup and deployment

These commands describe how to reproduce the existing deployment in a separate environment. Install Azure CLI/Bicep, confirm the department-owned subscription and verify institutional policy allows external Neon and the selected region. Check Linux F1 availability; if unavailable, stop and choose another region rather than upgrading automatically.

```sh
az login
az account set --subscription <subscription-id>
az bicep build --file infra/main.bicep
az group create --name <demo-resource-group> --location <approved-region>
mkdir -p artifacts
cp infra/demo.bicepparam.example artifacts/demo.bicepparam
```

Fill the nonsecret names in the ignored parameter file and load the named `CE_DEMO_*` variables through your secret manager/private terminal; never paste secret values into chat, shell history or committed files. Use the expected Azure hostname to register the callback, then verify the actual `webUrl` output before enabling Canvas login. The template derives `WEB_URL` from Azure's actual default hostname, which may include a generated suffix.

```sh
az deployment group what-if --resource-group <demo-resource-group> --template-file infra/main.bicep --parameters artifacts/demo.bicepparam
az deployment group create --resource-group <demo-resource-group> --template-file infra/main.bicep --parameters artifacts/demo.bicepparam
```

Review the preview: only an F1 App Service plan, Web App and configuration/publishing policies should appear. No RBAC role assignments are created by this template; the operator needs the institution-approved resource and deployment permissions.

Run **Prepare Azure demo release** manually in GitHub Actions on the intended branch. Download its artifact and extract the outer GitHub artifact wrapper to obtain `azure-demo.zip`. This inner ZIP is the deployment package; do not upload the wrapper or a ZIP containing a parent folder. Apply migrations using the same checkout/revision before deployment. Retain the prior known-good ZIP and database backup privately.

```sh
az webapp deploy --resource-group <demo-resource-group> --name <app-name> --src-path azure-demo.zip --type zip
```

ZIP deploy uses extracted writable files; remote builds are disabled. No `npm install` or Next compilation runs on F1. The supervisor starts Next.js's standalone server directly. Keep only the current runtime and the privately retained rollback artifact to stay within its small disk allowance. Verify the total deployed disk use before relying on F1. Do not enable Always On, deployment slots or a custom-domain configuration that requires a paid tier.

Stripe is optional. Leave its keys unset for simulated payments. For sandbox Checkout, use test keys and register `https://<actual-hostname>/api/webhooks/stripe` in the Stripe sandbox with the events listed in README. Store that hosted endpoint's signing secret, not the local Stripe CLI secret. Signed webhook delivery confirms payment; the return page is informational. Test the return with the Canvas learner session cookie.

## Local verification

```sh
npm run test:hosting
npm run typecheck
npm run build
npm run package:demo
npx playwright install chromium
npm run verify:demo -- --browser
```

The runtime verification needs Docker and OpenSSL. It copies the release into an isolated temporary directory, creates a throwaway TLS PostgreSQL container, runs migrations against that database, then exercises the actual packaged production processes. It does not change the existing local database. It removes its own container, volume and temporary files afterwards. Ports 3350, 3351 and (for browser checks) 3352 must be free. Without `--browser`, it skips the Chromium/axe checks. Move an existing generated `artifacts/azure-demo` aside before packaging again; packaging refuses to overwrite it.

See [hosted-demo security controls and budgets](demo-security.md) for dependency remediation, throttling, body limits and verification scope.

## Required cloud smoke test

- Confirm the plan SKU is F1 and check for unrelated chargeable resources. Verify the public HTTP URL redirects to HTTPS.
- In public mode, verify the catalog and course photos return 200 without a Basic challenge; anonymous staff APIs return 401 and mock sign-in is refused. In Basic mode, additionally verify the outer gate. `/healthz` should return 200 while the internal API is running.
- Test the catalog and browser navigation, Canvas learner login and sign-out, linked staff login and roles, offering editing, a synthetic registration/payment and recovery after restart. Confirm real Canvas provisioning/enrollment remains disabled.
- Reject cross-origin/missing-Origin writes. Confirm the API cannot be reached publicly. Check the API reference link works.
- If Stripe is enabled, verify valid signed events, duplicate delivery, invalid signatures, rejected live events, and the Checkout return. Missing signatures must return 400 rather than the Basic prompt.
- Inspect process RSS, peak memory, disk, CPU/day and restart logs under a short representative demo. F1 has 1 GB RAM, 1 GB storage and 60 CPU minutes/day; CPU minutes are processing time, not visitor time. Native memory and platform overhead can make the app exceed the limit even with heap caps.
- Open it after an idle interval and rehearse warming the demo before presenting. F1 has no Always On/SLA; quota exhaustion can stop it. A free-tier demo is not a production service.
- Run the README accessibility checks on the hosted workflows, including keyboard and manual screen-reader review. If optional Basic mode is used, test its native browser prompt as well.

If a release fails, redeploy the prior ZIP. Database migrations are forward-only: a code rollback does not undo schema/data changes. Use compatible migrations; if restoration is needed, restore the backup into a separate database and deliberately switch the app's connection URL after verification.

See the [October 23 verification record](azure-f1-verification.md) for completed checks and remaining limits.

## References

- [Azure Linux App Service pricing and F1 limits](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/)
- [Deploy Node.js apps to App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [App Service GitHub Actions](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions)
- [Neon plans](https://neon.com/pricing)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
