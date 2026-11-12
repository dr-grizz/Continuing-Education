# ADR 0014: Explicit hosted beta profile

Accepted October 28, 2026 at the owner's request to allow a separate production-beta deployment. Extends ADRs 0011 (Azure F1), 0012 (Canvas-authenticated public demo) and 0011 (integrated PostgreSQL credentials) without changing the existing demo environment or authorizing live financial/Canvas provisioning behavior.

- `HOSTED_BETA=true` explicitly enables the current application on the separate paid Azure App Service environment. `HOSTED_DEMO` must be false or absent; conflicting profiles and malformed beta values fail closed. `NODE_ENV=production` alone still does not permit hosting.
- Beta requires `PROTOTYPE_MODE=true`, `DEMO_ACCESS_GATE=none`, Canvas authentication for both staff and learners, an HTTPS public origin, distinct strong internal broker tokens and TLS PostgreSQL. It cannot enable mock identity selection behind a Basic-auth audience gate.
- Demo and beta share secure-cookie/forwarded-origin handling, same-origin writes, account-based Canvas sign-in quotas and backend role/identity checks. Learner OAuth remains identity-only; staff scopes require the user's Canvas permission and explicit app roles.
- Stripe keys/events remain test-only. Guest provisioning, real Canvas enrollment and lifecycle automation remain simulated/unimplemented. Real badge configuration and identity links still require their separate explicit setup; beta hosting alone does not approve real credential issuance.
- Keep one app instance initially, the minimal prebuilt Linux Node 24/Python release, explicit database migrations before deployment and persistent credential files outside the release. Do not migrate on startup or infer scale-out readiness.
- Preserve the target app's existing `DATABASE_URL`; never copy the demo URL/secrets or change the F1/Neon setup. The separate beta template is a patch checklist, not a full app-settings replacement. No new CD workflow is introduced.

This is a beta hosting contract, not full production-service acceptance. The [deployment handoff](../hosting/azure-production-plan.md) retains the outstanding live-operations, recovery, availability and accessibility gates. Target resource names and actual Azure validation remain pending.
