# Continuous deployment for the Azure demo

Pushes to `azure-demo` run CI and, after it passes, deploy the minimal Linux/Node 24 ZIP to `cuce-demo`. Other branches, fork pull requests and manual CI checks cannot deploy. The open PR from this repository's `azure-demo` branch skips duplicate CI because its push runs the same checks. The manual **Prepare Azure demo release** workflow remains a build-only option.

The check job builds once, traces the small runtime, verifies it against a disposable TLS PostgreSQL container, and retains the exact ZIP for 14 days. The separate deploy job downloads that artifact from the same run. It verifies the approved migration hash and F1 plan, selects Node 24, uploads through Microsoft Entra authentication, waits for Azure startup tracking, and reads back `release.json` through authenticated SCM to verify the commit. Remote builds stay disabled. No install, compilation, database migration, Canvas enrollment or payment runs on the Web App during deployment.

## Authentication and branch restriction

The free Azure managed identity `github-cuce-demo` has **Website Contributor** on this Web App and **Reader** on its existing F1 plan. It cannot scale the plan. Its federated credential accepts only GitHub's issuer, the Azure token-exchange audience and the exact immutable owner/repository-ID subject `repo:dr-grizz@256593513/Continuing-Education@1393003365:ref:refs/heads/azure-demo`. Pull requests, forks and other branches have different subjects. Only the deployment job requests `id-token: write`; test jobs have read-only repository permission.

Repository variables hold nonsecret configuration:

| Variable | Purpose |
| --- | --- |
| `AZURE_DEMO_CLIENT_ID` | The managed identity's client ID. |
| `AZURE_DEMO_TENANT_ID` | Its Azure tenant. |
| `AZURE_DEMO_SUBSCRIPTION_ID` | Existing demo subscription. |
| `AZURE_DEMO_SCHEMA_HASH` | Operator-approved set of migration file names and checksums. |

There is no client secret or publish profile. Runtime database, Canvas and Stripe credentials remain in App Service settings. SCM basic publishing authentication stays disabled. People who can push to `azure-demo` can deploy executable code with access to the demo's runtime settings, so keep branch write access limited. A repository administrator may add branch protection separately; the configuring account lacks repository administration permission. Protected GitHub environments are not required by this branch-bound OIDC setup.

## Database changes

CD compares `node scripts/demo-schema-hash.mjs` against `AZURE_DEMO_SCHEMA_HASH` before Azure login. A difference stops deployment. The initial approved set was checked read-only against all 24 completed Neon migration checksums on October 27, 2026.

For later schema changes, back up and review the database, apply compatible migrations explicitly through the direct/unpooled connection, verify the persisted migration names and checksums, then update the repository variable using the verified checkout:

```sh
gh variable set AZURE_DEMO_SCHEMA_HASH --body "$(node scripts/demo-schema-hash.mjs)"
```

Then rerun the failed deployment job or push the reviewed revision. Updating the hash is an operator attestation; it does not query or migrate the live database. Never update it just to bypass a failure.

## Verification, concurrency and rollback

Azure-demo runs are serialized and an active deployment is never canceled by a newer push. Only the latest pending run is retained by GitHub concurrency. Other CI branches retain cancellation of superseded runs.

Campus network restrictions stay active. GitHub-hosted runners cannot perform the public browser health check from an off-campus IP. CD verifies Azure's startup result and the published revision through authenticated SCM; run `/healthz`, Canvas staff/learner sign-in and Stripe sandbox checks from an allowed network after the first deployment and before a demonstration. Manual screen-reader review remains separate.

Download the previous successful run's `azure-demo-<commit>` artifact to retain a rollback ZIP. The first CD release also has the previous manual release retained privately. Redeploy a known-good ZIP with the Azure CLI if recovery is needed; do not rerun old database migrations. Artifacts expire after 14 days, so retain important releases privately. Disable this workflow or remove the federated credential to stop future automatic deployments.

OIDC follows [Microsoft's App Service guidance](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions). Azure CLI ZIP deployment supports [Microsoft Entra authentication with basic publishing disabled](https://learn.microsoft.com/en-us/azure/app-service/configure-basic-auth-disable).

This repository uses [GitHub’s immutable OIDC subject format](https://docs.github.com/en/actions/reference/security/oidc). The configured subject was verified against the actual token claims emitted by the first workflow run; a legacy name-only subject is rejected.

## First verified release

The [October 27 run](https://github.com/dr-grizz/Continuing-Education/actions/runs/40529027069) passed CI and deployed commit `a460dd6`. CI took 9 minutes 37 seconds and the successful deployment took 2 minutes 38 seconds. The published revision was verified through SCM. Campus smoke checks returned health/catalog 200, anonymous staff 401 and unsigned Stripe webhook 400. Live readback confirmed F1/Free, Node 24, HTTPS Only and lookup account 49, with campus/Stripe restrictions preserved. Fresh browser OAuth, directory lookup and sandbox Checkout were not repeated as part of this deployment check.

## Integrated credential runtime

Current source runs credentials inside the existing API at `/api/credentials`, using the portal's PostgreSQL pool. The supervisor starts only API and web. It does not launch `badge-service/server.mjs` or a listener on 4178. Explicit `BADGES_ENABLED=false` disables credential initialization and keeps the portal-only path available.

Before enabling hosted credentials, apply and verify migration `024_integrated_credentials` through the existing explicit migration procedure. The schema-hash gate stops deployment until an operator approves that migration set; CD does not apply it. Configure `BADGES_ENABLED=true` and an absolute private persistent key directory such as `BADGE_DATA_DIR=/home/data/cuce-credentials`. The directory must be outside the deployed release, including through symlinks. CD refuses an enabled deployment without this setting, and startup rejects a directory that resolves inside the release. This prevents ZIP replacement from deleting issuer keys and service tokens. Keep the directory at the same canonical path because it identifies the signing workspace. Back it up together with PostgreSQL and approved learner mappings. Restore original keys for existing credentials; never replace them to bypass an identity mismatch.

The launcher supplies the bundled Python executable and resolves credential requests through the API. `BADGE_SERVICE_URL` is not needed for hosted integrated mode. `BADGE_DEMO_PREVIEW=true` may retain the single-PDF concurrency limit, but no longer selects disposable SQLite storage. Demo mode uses the existing fictional configuration by default; live Canvas evidence and learner mappings require separate approved configuration.

Package verification covers badges disabled and enabled, authenticated credential operations, real PDF rendering, draft and issuer-key survival across API/web restarts, rejected release-directory/symlink storage, and exactly two supervised children. No SQLite reader is loaded by the running API; the separate importer remains an explicit operator command. The release contains no private key or stored credential data.

### Earlier standalone preview

The October 27 [preview release](https://github.com/dr-grizz/Continuing-Education/actions/runs/40537873525) used the separate loopback adapter with disposable local SQLite. Its portal health and synthetic certificate probe passed on F1. That running Azure release is unchanged by this startup fix or by a merge into main. Moving it to the integrated runtime requires the schema approval and persistent-key configuration above. The old preview's temporary records are not imported automatically.

Staff tools remain [Badge Designer](https://cuce-demo.azurewebsites.net/staff/badges), [Award Badges](https://cuce-demo.azurewebsites.net/staff/badge-awards), [Certificates](https://cuce-demo.azurewebsites.net/staff/certificates), and [Issuance Register](https://cuce-demo.azurewebsites.net/staff/badge-issuances). Canvas staff sign-in and `badges:manage` are required. Fresh hosted OAuth, a real integrated credential cutover, sustained resource checks and manual screen-reader review remain separate verification steps.
