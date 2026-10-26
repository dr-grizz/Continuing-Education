# Azure F1 + Neon demo deployment

Status: Deployed and smoke-tested, October 26, 2026.

## Scope

One Linux Azure App Service F1 plan runs the compiled web and API processes. Neon PostgreSQL is external and uses TLS. No paid fallback, automatic deployment or real Canvas provisioning is enabled. CI/CD remains deferred.

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

Retain the previous known-good release and database backup privately. Code rollback does not undo database changes; restore into a separate database and verify before deliberately switching connections. The manual release-build workflow has no cloud credentials and has not been exercised remotely. See [the historical local verification record](../docs/hosting/azure-f1-verification.md) for the earlier gated-package checks.
