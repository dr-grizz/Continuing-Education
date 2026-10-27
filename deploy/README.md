# Azure demo environment variables

[azure-demo.env.example](azure-demo.env.example) lists the settings for the Azure F1 demo. It is a template, not the live configuration. Azure reads the actual values from **App Service → Environment variables**. Copying or editing this example does not update Azure.

Lines beginning with `#` are comments and are not loaded. Replace placeholders privately before applying settings. Keep passwords, tokens, connection strings and secret keys out of Git, chat and deployment ZIPs.

## Application and access

| Variable | Purpose and expected value | Secret? |
| --- | --- | --- |
| `NODE_ENV` | `production` runs the optimized production build. It does not turn this prototype into a production service. | No |
| `HOSTED_DEMO` | `true` enables the hosted-demo configuration checks, including HTTPS, broker tokens and test-only Stripe keys. | No |
| `PROTOTYPE_MODE` | Must remain `true` for this demo. Canvas provisioning and enrollment remain simulated. | No |
| `WEB_URL` | Public HTTPS origin, without a path or query. Current demo: `https://cuce-demo.azurewebsites.net`. Used for redirects and same-origin checks. | No |
| `DEMO_ACCESS_GATE` | `none` removes the browser Basic-auth prompt and requires Canvas authentication for both identity modes. `basic` enables the shared audience password gate; it is also the compatibility default when omitted. | No |
| `DEMO_ACCESS_USERNAME` | Shared audience username, used only with `DEMO_ACCESS_GATE=basic`. Ignored in public mode. | No |
| `DEMO_ACCESS_PASSWORD` | Shared audience password, used only with `basic`. Requires at least 24 printable characters; use a random value. Ignored in public mode. | Yes |
| `LEARNER_API_TOKEN` | Authenticates internal learner requests between the website and backend. Learner identity is checked separately through the learner session. | Yes |
| `STAFF_API_TOKEN` | Authenticates internal staff requests. Staff sessions and assigned roles are checked separately. Possessing a Canvas account does not grant staff access. | Yes |
| `AUTOMATION_API_TOKEN` | Protects backend automation operations. Required by hosted configuration even when no external automation is configured. | Yes |
| `API_URL` | Internal backend address: `http://127.0.0.1:3051`. Both processes run inside the same Web App; this is not a public endpoint. | No |

Generate a **different** random value for each broker token, with at least 32 characters. The following command generates one value; run it separately for each token or optional gate password and save the result privately:

```sh
openssl rand -hex 32
```

## PostgreSQL

| Variable | Purpose and expected value | Secret? |
| --- | --- | --- |
| `DATABASE_URL` | Neon's **pooled** PostgreSQL connection URL for the running app. Includes the database username, password, endpoint and database name. Preserve provider parameters and use TLS; the example uses `sslmode=verify-full`. | Yes |
| `MIGRATION_DATABASE_URL` | Neon's **direct/unpooled** connection URL, used by the migration operator. Keep it in the operator's private environment, not App Service. Migrations use a session-level advisory lock, which requires a direct connection. | Yes |

Use the separate demo database. Do not substitute a local development or unrelated production database. Deployment does not automatically run migrations.

## Canvas login and course access

| Variable | Purpose and expected value | Secret? |
| --- | --- | --- |
| `STAFF_AUTH_MODE` | `canvas` enables Canvas OAuth staff login. The Canvas identity must already be explicitly linked to an active staff record with assigned roles. | No |
| `LEARNER_AUTH_MODE` | `canvas` enables Canvas OAuth learner login before registration and payment. Both auth modes must be `canvas` when the audience gate is `none`; mock fallback is refused. | No |
| `CANVAS_BASE_URL` | Canvas HTTPS origin. Current demo: `https://cedarville.instructure.com`. Do not include a course path. | No |
| `CANVAS_STAFF_CLIENT_ID` | Canvas OAuth developer-key ID. Despite the variable name, the shared client also supports learner login. | No |
| `CANVAS_STAFF_CLIENT_SECRET` | Secret belonging to that Canvas developer key. | Yes |
| `CANVAS_STAFF_REDIRECT_URI` | Shared OAuth callback. Current demo: `https://cuce-demo.azurewebsites.net/api/auth/canvas/callback`. It must exactly match an allowed redirect URL on the Canvas developer key. | No |
| `CANVAS_COURSES_ENABLED` | `false` disables Canvas course-reading/import features. **Canvas OAuth login still works.** Enabling course reads requires the appropriate developer-key scopes and token encryption configuration; it does not enable real enrollment. | No |
| `CANVAS_STAFF_LOOKUP_ACCOUNT_ID` | Optional Canvas account ID for staff email searches. Requires the account-users API scope on the developer key and directory permission in the signed-in administrator’s Canvas account. Leave unset for manual ID entry. | No |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | Encrypts retained Canvas tokens for course reading and staff directory lookup. Required when either feature is enabled; optional for login-only mode. Must be 32 random bytes encoded as Base64. | Yes |

Generate the encryption key privately with:

```sh
openssl rand -base64 32
```

An existing Canvas session in the same browser profile usually avoids another password prompt. Users still begin the portal's OAuth flow and may need to authorize the app. Canvas and portal sessions are separate.

## Stripe sandbox

Both Stripe entries are commented out in the template. Omit both for simulated payments, or configure both for sandbox Checkout.

| Variable | Purpose and expected value | Secret? |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe test-mode API key (`sk_test_…`, or an appropriately permitted `rk_test_…`). Hosted demos reject live secret keys. | Yes |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) for the hosted webhook at `https://cuce-demo.azurewebsites.net/api/webhooks/stripe`. Use that endpoint's secret, not the local Stripe CLI secret. | Yes |

Configure the hosted test webhook for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `charge.refunded`. The signed webhook confirms payment; returning from Checkout alone does not. Sandbox payments do not charge real money, and Canvas enrollment remains simulated.

## Build and platform

| Variable | Purpose and expected value | Secret? |
| --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED` | `1` disables Next.js telemetry. | No |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` tells Azure to use the prebuilt release without compiling on F1. Build and package the minimal Linux runtime before uploading it. Not needed for local verification. | No |

See the [Azure F1 + Neon guide](../docs/hosting/azure-f1-neon.md) for deployment, verification and rollback instructions. These settings do not configure campus IP restrictions; those are separate Azure networking rules.

## Hosted credentials

Set `BADGES_ENABLED=true` only after migration `024_integrated_credentials` is applied and verified. Also set `BADGE_DATA_DIR` to a private persistent absolute directory outside the release, such as `/home/data/cuce-credentials`. Keys, service tokens and learner mappings must survive deployment and be backed up with PostgreSQL. The web/API launcher supplies the bundled Python path and API transport; no 4178 listener or `BADGE_SERVICE_URL` is needed. `BADGES_ENABLED=false` keeps the portal available without initializing credentials. See [CD and storage checks](../docs/hosting/azure-demo-cd.md#integrated-credential-runtime).
