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

## Standalone badge preview

The hosted demo can opt in to `BADGES_ENABLED=true` together with `BADGE_DEMO_PREVIEW=true`. The existing supervisor starts the standalone badge adapter on loopback 4178 before exposing the website; it does not embed badge operations into NestJS. Only the existing authenticated portal broker can access staff operations. The release includes the traced adapter and a portable Python 3.12 runtime with pinned ReportLab/Pillow and fonts. Nothing is installed or compiled on F1.

The launcher creates a new private local temporary SQLite directory on each start, uses only the packaged fictional demo configuration and fresh signing keys, and ignores historical learner/source directories. Preview badge drafts, awards, keys and sharing links can disappear or become invalid after a restart or redeployment. They are not real credentials. The persistent Neon portal database is unchanged. Real Canvas eligibility and automatic learner links are not enabled by this preview.

Packaged verification runs with badges disabled and with this preview enabled, including an actual PDF from the relocated Python runtime. Hosted preview permits one PDF renderer at a time to bound memory. The combined API/web/badge heaps are capped at 256/384/128 MiB; native memory and Python still count toward F1's limit. Confirm hosted memory and restart behavior before relying on the preview. Disable `BADGES_ENABLED` to return to portal-only operation.

The standalone preview was enabled on October 27 after [CI/CD run 40537873525](https://github.com/dr-grizz/Continuing-Education/actions/runs/40537873525) passed. A synthetic PDF was rendered successfully inside the actual Azure app container; portal health and unauthenticated badge access checks passed. This release is 282 MiB unpacked on Linux. The existing F1 plan and campus restrictions are preserved.

Open [Badge Designer](https://cuce-demo.azurewebsites.net/staff/badges), [Award Badges](https://cuce-demo.azurewebsites.net/staff/badge-awards), [Certificates](https://cuce-demo.azurewebsites.net/staff/certificates), or [Issuance Register](https://cuce-demo.azurewebsites.net/staff/badge-issuances). Canvas staff sign-in and `badges:manage` are required. This preview has no real learner badge mappings and does not preserve drafts/awards across restarts.
