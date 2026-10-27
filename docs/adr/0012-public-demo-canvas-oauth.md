# ADR 0012: Public demo with Canvas OAuth and Stripe sandbox

Accepted October 26, 2026 at the owner's request. CI/CD was initially deferred; the owner authorized branch-bound OIDC deployment on October 27 (see [deployment design](../hosting/azure-demo-cd.md)). This amends ADR 0011's audience password gate for the current hosted demo.

- `DEMO_ACCESS_GATE=none` removes the browser Basic prompt. This mode refuses to start unless both staff and learner authentication explicitly use Canvas OAuth. Strong internal broker tokens, HTTPS, same-origin browser writes and the private API remain required. The default remains `basic` for older/local gated configurations.
- Anonymous visitors can browse the catalog and load course photos. Learner registration/payment requires the independent verified Canvas learner session; staff access requires an explicitly linked Canvas identity and current roles. No mock-auth fallback or automatic staff role assignment from email is allowed.
- The hosted roster contains only the owner-approved `hye@cedarville.edu` administrator, using the already verified local Canvas-origin/user-ID binding. Six synthetic seed staff were removed from the hosted database after a private full backup. Local development fixtures and historical migrations are preserved.
- Azure terminates HTTPS before forwarding to Next.js. OAuth routes accept the configured public origin with an exact matching Host and HTTPS forwarded protocol; arbitrary forwarded-host values are not trusted. State, browser nonce, Secure cookies and callback replay protections are unchanged.
- Use the existing test-mode Stripe account and a dedicated hosted signed webhook. Real charges, guest provisioning and Canvas enrollment remain disabled/simulated. Never copy the local Stripe CLI webhook secret to the host.
- Preserve the minimum prebuilt Linux release: no source/dev tools/secrets/caches on F1 and no remote compilation. No paid hosting upgrade is authorized.
