# ADR 0011: Gated Azure F1 demo with external PostgreSQL

Accepted for template preparation October 23, 2026. The owner selected Azure Web App Free plus free PostgreSQL, then limited this task to a template and deferred cloud context. This amends ADR 0008's local-only runtime restriction for an explicit gated demo; production service approval remains separate.

- Target one Linux App Service F1 using built-in Node 22 and external Neon PostgreSQL. The prior Container Apps/registry/database plan remains a historical alternative. Do not silently provision a paid replacement if F1 is unavailable.
- Build the compiled web/API release outside F1; supervise both processes together, with API loopback-only. No continuously running worker or startup migrations. Apply reviewed migrations explicitly over a direct PostgreSQL connection before deployment.
- `HOSTED_DEMO=true`, `PROTOTYPE_MODE=true`, an HTTPS `WEB_URL`, distinct strong broker tokens and a strong outer access password are required. Hosted PostgreSQL requires TLS. Retain refusal of production without this explicit opt-in and refusal of Stripe live keys/events.
- Gate the entire website, broker, static assets, media and API reference. Exempt only a read-only process liveness endpoint and the exact POST webhook route whose signature the internal API verifies. Require same-origin browser writes because Basic credentials are ambient browser credentials.
- Preserve ADR 0009's verified existing-account Canvas learner OAuth and independent staff OAuth/roles in the deployment template. The outer gate is an audience restriction, not a replacement identity provider. Mock mode remains available only for deliberate synthetic demonstrations; anyone admitted can impersonate mock users.
- Keep synthetic learner/payment/enrollment data, manual Canvas reads and simulated provisioning. No live enrollment or guest account creation is authorized by hosting.
- Current UI image storage remains the prototype database table, subject to the free storage limit; ADR 0006's object-storage recommendation remains a production requirement.

Cloud permissions, policy, quotas, real TLS connectivity, F1 memory/disk capacity, live OAuth/Stripe and hosted accessibility review must be verified after actual account settings are available. A successful local build is not a verified cloud deployment.
