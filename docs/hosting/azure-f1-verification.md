# Azure F1 template verification — October 23, 2026

Branch: `azure-demo`. Local verification only; no Azure/Neon resources were created and no existing database was changed. Disposable migration/test databases and a separate TLS PostgreSQL container were used and cleaned up.

## Passed

- `npm run format:check`, `npm run typecheck`, `npm run build`.
- `npm run test:hosting`: runtime opt-in, strong/placeholder settings, HTTPS/TLS requirements, gate coverage including static/media/broker paths, cross-origin write refusal, webhook byte preservation, missing signatures, body limit and upstream failure.
- `npm run test:migrations`: fresh/adopted databases, idempotence, history preservation, drift, concurrent migration locking and failure/recovery behavior.
- `npm run test:auth`, `npm run test:learner-auth`: mocked Canvas provider, independent role/session boundaries and browser broker behavior against isolated databases.
- `npm run test:demo`: atomic simulated payments, duplicate protection, manual reconciliation and persisted retry recovery without a worker.
- Bicep CLI `0.48.1`: `build infra/main.bicep` succeeded. Static review confirmed F1 is hard-coded; no paid resources or RBAC assignments are declared. This is compilation, not Azure resource validation.
- `npm run package:demo`: runtime payload **61 MiB** by summed file sizes on macOS, under its 600 MiB safety budget. Dotenv files and build caches are excluded. Linux packaging must be performed by the provided workflow.
- `npm run verify:demo -- --browser`: copied the package outside the repository so it could not borrow repository dependencies; migrated a throwaway PostgreSQL database with TLS certificate validation; started the actual compiled API and standalone Next.js processes in hosted production mode. Verified the liveness endpoint, Basic gate/wrong credentials, gated real static files, API reference, mock session/secure cookie, database-backed catalog and learner identity, CSRF rejection, invalid signatures, signed test-event persistence/deduplication, correctly signed live-event refusal and API-failure shutdown of the web/supervisor.
- Chromium over local HTTPS: authenticated page load, keyboard skip-navigation focus, same-origin API-reference link, zero reported catalog axe WCAG A/AA violations and no page overflow at 320 px.

The API and web child processes used **399 MiB combined RSS** after the final smoke test on this Mac. This excludes the supervisor, Azure/platform overhead and peak/concurrent load; it is not an F1 capacity guarantee.

## Remaining checks

- Azure subscription/ownership, roles, institutional policy, region/F1 quota, Bicep resource validation and what-if preview are deferred until the owner supplies context. Azure CLI was unavailable locally; standalone Bicep was used for compilation.
- The manual GitHub Actions workflow is prepared but has not run remotely. It compiles Bicep, builds the Linux release, verifies it using a disposable TLS database and Chromium, then uploads a ZIP. It has no deployment credentials.
- Real Neon pooled/direct connections, free-plan quotas, Azure cold-start/CPU/disk/peak-memory behavior and actual external HTTPS deployment remain unverified.
- Live Canvas SSO/MFA/callbacks and Stripe sandbox delivery/Checkout returns need configured services and an actual host.
- The Node file tracer reports 27 probes for optional dependencies/current NestJS export-map alternatives; the full warnings are in ignored `artifacts/azure-demo-trace-warnings.log`. The isolated packaged runtime passes. Repeat that verification on Linux in the release workflow.
- Accessibility checks were scoped to the affected links/catalog and gated loading path. The native Basic prompt and affected hosted workflows still need manual screen-reader review; no WCAG certification or full hosted accessibility review is claimed.
