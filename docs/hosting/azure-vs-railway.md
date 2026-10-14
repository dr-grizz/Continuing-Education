# Hosting plan: Azure or Railway

For the portal lead and university IT (decision **A3**, hosting provider). Drafted October 8, 2026. Prices are list prices for US East, checked that day: Azure from its public retail price API, Railway from its pricing page. Both change; confirm in each provider's calculator before committing.

## Summary

|                                | Azure (Container Apps + PostgreSQL Flexible Server)                                                                     | Railway (Pro)                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Best for                       | A production service the university owns, with real learner data and payments                                           | A shared demo or pilot environment, set up in an afternoon                                                                                 |
| Setup                          | 1–3 days, mostly decisions (subscription, networking, sign-in, logging); needs someone with Azure access                | Hours: connect the GitHub repository, add Postgres, set variables                                                                          |
| Maintenance                    | More to understand (resource groups, roles, logs, cost alerts); database patching is managed                            | Very little; you own Postgres version upgrades and off-site backups                                                                        |
| CI/CD                          | GitHub Actions you write (build image, run migrations, deploy); revisions allow safe rollouts                           | Built in: deploys on push, waits for CI, pull request environments                                                                         |
| Cost, one environment          | About **$45–55/month** (small, no high availability); about **$320+** with zone-redundant database                      | About **$20/month** (the plan fee covers the usage)                                                                                        |
| Reliability                    | Financially backed SLAs: Container Apps 99.95%, PostgreSQL 99.9% (99.99% with zone-redundant HA); point-in-time restore | Contractual SLA only on Enterprise; Pro support usually within 72 hours with no SLO; snapshot backups restore only inside the same project |
| Sign-in gate for the prototype | Built in (App Service Authentication, "Easy Auth"): Google, Microsoft or any OpenID provider, no code                   | None built in; add a gate to the website or put an access proxy in front                                                                   |
| Procurement and data review    | Depends on whether the university already has an Azure agreement and subscription                                       | New vendor: security review (SOC 2 Type II report from Railway's Trust Center) and a payment method                                        |

**Recommendation:**

- **Now (prototype, synthetic data):** Railway, if a shared demo is needed soon. Before it goes online, the website must be behind a sign-in gate, because mock staff sign-in lets anyone act as an administrator.
- **Production (real learners, live Stripe):** Azure, if university IT will provide and own the subscription. The SLAs, managed database, point-in-time restore and built-in sign-in gate match what production needs. If IT won't own Azure, ask them which cloud they do support before choosing Railway for production. The university's email runs on Google Workspace, so Google Cloud (Cloud Run and Cloud SQL) is worth one question to IT too.

The portal developer is not university IT. Whichever provider is chosen, **IT or the department should own the account**, with the developer given deploy access only, and secrets kept in the provider's secret settings.

## What both plans need first (app readiness)

The prototype runs with development commands on one computer. Before hosting it anywhere:

1. **Production start commands.** The API and worker run through `ts-node`; `npm run build` already compiles them, so add `start:api` and `start:worker` scripts that run the compiled files with `node`.
2. **A Dockerfile** (one image with three commands, for website, API and worker). Railway can build without one, but a Dockerfile keeps both plans identical and makes local testing realistic.
3. **Configurable addresses.** The API listens on `127.0.0.1:3051` in code; containers need `0.0.0.0` and a `PORT` variable. `API_URL` points the website at the API over the provider's private network.
4. **Stripe webhook route.** The website's API proxy does not forward the `Stripe-Signature` header or the raw body. Add a website route that passes `/api/webhooks/stripe` through unchanged, so the API can stay private. That route must also be left out of any sign-in gate.
5. **A sign-in gate for the prototype.** Mock sign-in has no passwords. Every hosted environment needs a gate in front of the website until real authentication (decision A4) exists.
6. **Database TLS.** Use `sslmode=require` in `DATABASE_URL`. Migrations run with `npm run db:migrate` before each release.
7. **Small fixes.** The footer and staff "API documentation" links point to `localhost:3051`; hide them or point them at the hosted docs. Keep `PROTOTYPE_MODE=true` and synthetic data until production is approved.

Estimated effort: 1–2 days, the same for both plans.

## Plan A: Azure

**Architecture.** One resource group per environment (staging, production):

| Resource                                 | Purpose                                                    | Size to start                                                                         |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Container Apps environment (Consumption) | Runs the three apps                                        | Shared by the apps                                                                    |
| Container app `web`                      | Website; the only public endpoint, with Easy Auth          | 0.5 vCPU, 1 GiB, 1–3 replicas                                                         |
| Container app `api`                      | API; internal ingress only                                 | 0.25 vCPU, 0.5 GiB, 1–2 replicas                                                      |
| Container app `worker`                   | Background jobs; no ingress                                | 0.25 vCPU, 0.5 GiB, 1 replica (the worker uses `SKIP LOCKED`, so more are safe)       |
| Container Apps job `migrate`             | Runs `npm run db:migrate` before each rollout              | Runs on demand                                                                        |
| PostgreSQL Flexible Server 18            | Database                                                   | Burstable B1ms, 32 GiB; General Purpose D2ds_v5 with zone-redundant HA for production |
| Container Registry (Basic)               | Stores images                                              | —                                                                                     |
| Key Vault                                | Stripe keys, webhook secret, API tokens, database password | —                                                                                     |
| Log Analytics workspace                  | Logs and alerts                                            | Set a daily cap                                                                       |

**Setup steps**

1. IT creates a subscription or resource group and grants the developer Contributor on it (or a narrower custom role).
2. Write the infrastructure as code (Bicep) in the repository, so environments are reproducible and reviewable.
3. Create the database with private access or firewall rules, and Microsoft Entra or password authentication.
4. Configure Easy Auth on `web` with Google (the university's Workspace accounts) or Microsoft, restricted to the people who should see the prototype, and exclude the Stripe webhook path.
5. Add the custom domain and its managed certificate. Register the Stripe webhook endpoint at that address.
6. Set budgets and alerts: monthly cost, failed requests, worker restarts, database CPU and storage.

**CI/CD (GitHub Actions)**

- Keep the existing CI job for pull requests.
- On merge to `main`: build the image and push it to the registry. Sign in to Azure with OpenID Connect (federated credentials, no stored password). Then run the `migrate` job, and update `web`, `api` and `worker` to the new image.
- Use revisions: deploy the new revision with no traffic, run a smoke test, then switch traffic. Rolling back is switching back.
- Staging deploys automatically; production deploys after approval (a GitHub environment with required reviewers).
- Pull request preview environments are possible but take custom work; staging is enough at first.

**Maintenance**

- Microsoft patches PostgreSQL minor versions in a maintenance window you choose; major upgrades are in place, when you decide.
- Monthly: review costs, alerts and Container Apps base image updates (rebuild the image to pick up Node security fixes).
- Rotate the Stripe key, webhook secret and API tokens on a schedule, in Key Vault.

**Cost (US East, per month)**

| Item                                                  | Small         | Hardened production                           |
| ----------------------------------------------------- | ------------- | --------------------------------------------- |
| Container Apps (1 vCPU, 2 GiB always on, mostly idle) | ~$25          | ~$50 (two replicas of web and API)            |
| PostgreSQL compute                                    | $12.41 (B1ms) | ~$260 (D2ds_v5, zone-redundant HA doubles it) |
| PostgreSQL storage (32 GiB at $0.115)                 | $3.68         | $7.36                                         |
| Container Registry Basic                              | ~$5           | ~$5                                           |
| Logs, Key Vault                                       | ~$0–10        | ~$10–20                                       |
| **Total**                                             | **~$45–55**   | **~$330–350**                                 |

Staging can be cheaper: let `web` and `api` scale to zero and stop the database when idle (Flexible Server restarts itself after 7 days stopped). Rates used: Container Apps $0.000024 per active vCPU-second, $0.000003 idle, $0.000003 per GiB-second, with a monthly free grant of 180,000 vCPU-seconds and 360,000 GiB-seconds; PostgreSQL B1ms $0.017/hour, D2ds_v5 $0.178/hour. Burstable servers cannot use high availability.

**Reliability**

- SLAs with service credits: Container Apps 99.95%; PostgreSQL 99.9% without HA, 99.95% same-zone HA, 99.99% zone-redundant HA.
- Automatic backups with point-in-time restore (7 days by default, up to 35); geo-redundant backup is an option.
- Revisions give zero-downtime deploys and instant rollback.

## Plan B: Railway

**Architecture.** One project with `staging` and `production` environments:

| Service                  | Purpose                                             | Notes                             |
| ------------------------ | --------------------------------------------------- | --------------------------------- |
| `web`                    | Website; the only public domain                     | Start command `npm run start:web` |
| `api`                    | API on the private network (`api.railway.internal`) | No public domain                  |
| `worker`                 | Background jobs                                     | No public domain                  |
| `postgres`               | Railway's Postgres template, with a volume          | Enable scheduled backups          |
| `backup` (optional cron) | Nightly `pg_dump` to storage outside Railway        | Covers off-site recovery          |

**Setup steps**

1. Create a Pro workspace (owned by the department, not a personal account) and invite the developer.
2. Connect the GitHub repository; create the three services from it with their start commands, plus Postgres.
3. Set variables per environment, using Railway's references for `DATABASE_URL` and `API_URL`; mark secrets as sealed.
4. Choose the US East region. Add the custom domain to `web` and register the Stripe webhook endpoint.
5. Add the sign-in gate (see readiness step 5). Railway has no built-in one: either check a shared password or Google sign-in in the website itself, or put an access proxy such as Cloudflare Access in front.
6. Turn on volume backups (daily, weekly) and a nightly off-site `pg_dump`.

**CI/CD**

- Built in: each service deploys when `main` changes, after GitHub checks pass ("Wait for CI").
- Set `npm run db:migrate` as the API's pre-deploy command, so migrations run before the new version starts.
- Pull request environments: each pull request can get its own temporary copy of the project, removed when it closes. Use synthetic data only.
- Configuration can live in `railway.json` in the repository. Rollback is redeploying an earlier deployment from the dashboard.

**Maintenance**

- Railway patches the platform. The Postgres service is a container image on a volume: major version upgrades are your job, and backups restore only into the same project and environment.
- Monthly: check usage, deploy logs (kept 30 days on Pro) and the off-site backup.

**Cost (per month)**

| Item                                                                                                                               | Estimate                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Pro workspace fee (includes $20 of usage, unlimited seats)                                                                         | $20                                |
| Usage: about 1.1 GB memory in use at $10/GB, about 0.1 vCPU average at $20/vCPU, 1 GB volume at $0.15/GB, light egress at $0.05/GB | ~$13 (covered by the included $20) |
| Staging and pull request environments                                                                                              | ~$5–15 extra                       |
| **Total**                                                                                                                          | **~$20–35**                        |

Railway bills the memory and CPU actually used, per second, so idle services cost little. A highly available Postgres cluster, more replicas, or Enterprise (contractual SLA, SSO, audit logs) raise the cost; Enterprise pricing is custom, with an annual commitment.

**Reliability**

- No contractual SLA on Pro. Railway publishes availability targets, and contractual SLAs come with Enterprise agreements. Pro support usually answers within 72 hours.
- Volume backups: daily (kept 6 days), weekly (27 days), monthly (89 days); point-in-time recovery is available. Restores stay inside the same project and environment, and there is no built-in cross-region copy, hence the off-site dump.
- Regions in the US: US West (Oregon, the default) and US East (Virginia).

## Side by side

| Topic                          | Azure                                                             | Railway                                                                  |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Who can set it up              | Someone with an Azure subscription, usually IT                    | The developer, with a department-owned workspace                         |
| Time to first deploy           | 1–3 days after the readiness work                                 | Hours after the readiness work                                           |
| Infrastructure as code         | Bicep, in the repository                                          | `railway.json` (service settings only)                                   |
| Deploys                        | GitHub Actions you maintain                                       | Automatic from GitHub                                                    |
| Preview environments           | Custom work                                                       | Built in                                                                 |
| Migrations                     | Container Apps job before rollout                                 | Pre-deploy command                                                       |
| Rollback                       | Switch revision traffic                                           | Redeploy an earlier deployment                                           |
| Database                       | Managed: patching, PITR up to 35 days, HA options                 | Container with a volume; snapshots and PITR; upgrades are yours          |
| Private API                    | Internal ingress                                                  | Private network                                                          |
| Sign-in gate                   | Easy Auth, no code                                                | Build it or add a proxy                                                  |
| Logs and monitoring            | Log Analytics, alerts, Application Insights                       | Built-in logs (30 days on Pro), basic metrics; external tools for alerts |
| SLA                            | 99.95% apps, 99.9–99.99% database                                 | Enterprise only                                                          |
| Compliance evidence            | Microsoft compliance offerings, university agreement if any       | SOC 2 Type II and SOC 3 reports from the Trust Center                    |
| Monthly cost (one environment) | ~$45–55 small, ~$330–350 hardened                                 | ~$20–35                                                                  |
| Lock-in                        | Moderate (Container Apps and Bicep; the containers move anywhere) | Low (the same containers and a `pg_dump` move anywhere)                  |

## Questions for IT

1. Does the university have an Azure (or Google Cloud) agreement and a subscription this portal can use, and who would own it?
2. What review does a new hosting vendor need (security questionnaire, SOC 2 report, data agreement), and how long does it take?
3. Which sign-in should gate the prototype: Google Workspace accounts, or something else?
4. Are there rules for where learner data is stored (US regions only), backup retention and restore testing?
5. Who receives alerts and is on call if the portal is down?
6. Who registers the domain (for example a `cedarville.edu` subdomain) and its DNS records?

## Sources

- Azure prices: Azure retail prices API (`prices.azure.com`), US East, October 8, 2026.
- [Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/) (free grants)
- [Azure SLA for Container Apps](https://www.azure.cn/en-us/support/sla/container-apps/v1_0/)
- [Azure PostgreSQL Flexible Server: create a server](https://docs.azure.cn/en-us/postgresql/flexible-server/quickstart-create-server) (SLA by HA option) and [high availability](https://docs.azure.cn/en-us/postgresql/high-availability/concepts-high-availability)
- [Azure PostgreSQL supported versions](https://docs.azure.cn/en-us/postgresql/flexible-server/concepts-supported-versions) (PostgreSQL 18)
- [Railway pricing](https://railway.com/pricing)
- [Railway backups](https://docs.railway.com/reference/backups) and [Postgres backups and restores](https://docs.railway.com/guides/postgres-backups-restores)
- [Railway support](https://docs.railway.com/reference/support), [regions](https://docs.railway.com/reference/regions) and [compliance](https://docs.railway.com/enterprise/compliance)
