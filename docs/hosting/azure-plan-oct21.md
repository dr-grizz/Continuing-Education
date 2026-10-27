> Archived October 21 requirements draft. Its status and statements describe that checkpoint; see [the current F1/Neon template](azure-f1-neon.md) for the October 23 work.

# Azure demo deployment and verified learner login

Status: Planning — not approved for implementation or deployment.

Updated: October 21, 2026. This is a requirements draft, not a completed or quota-validated deployment plan.

## Workspace analysis

- Mode: MODERNIZE an existing non-Azure application; do not initialize a replacement application.
- Proposed recipe: Azure Developer CLI with Bicep, subject to existing institutional deployment standards.
- Detected components: Next.js/React/MUI in `src/web`, NestJS in `src/server`, Prisma/PostgreSQL in `prisma` and `src/domain`.
- No application Dockerfile, Azure infrastructure or compiled API start command was found.
- `src/domain/db.ts` rejects production mode. Hosted-demo mode needs an explicit reviewed amendment, not a removed safety check.
- Learner sign-in now supports existing-account Canvas OAuth and hashed revocable sessions (ADR 0009). Arbitrary email, UUID selection and the legacy default learner remain mock-only; hosted configuration must explicitly choose Canvas mode.
- The current shell cannot find `az` or `azd`; Azure account, policy and capacity checks have not run.

## Demo requirements

- Classification: restricted proof of concept with synthetic learner/payment/enrollment data.
- Proposed scale: small, single region, one application replica.
- Proposed cost profile: cost-optimized; spending ceiling requires user input.
- Subscription, tenant and location: awaiting user confirmation; no defaults assumed.
- Institutional Azure Policy, region availability and quotas: not checked; infrastructure execution is blocked on confirmed Azure context and tool access.

## Confirmed scope

- Existing Continuing Education portal; modify the existing repository.
- Host a restricted demo on Azure.
- Current login: reuse existing Canvas OAuth for people with a CU account, including staff as learners.
- Future: course registration and payment precede Cedarville guest account creation; guest pre-account login/provisioning details are deferred.
- Keep staff Canvas OAuth and portal role checks separate from learner login.
- Preserve current local data, staff changes and the issue-tracking draft.

## Architecture under review

- One Azure Container App containing the compiled Next.js website and NestJS API.
- External PostgreSQL database dedicated to the demo.
- Azure Container Registry, managed identity, Key Vault and diagnostic logging.
- Existing-account learner Canvas OAuth; separate verified learner sessions, with mock learner selectors rejected in Canvas mode.
- Stripe sandbox and simulated Canvas account provisioning/enrollment only.
- One demo replica; manual Canvas previews; no always-running worker or scheduler.

### Proposed resource inventory

| Resource                                     | Quantity                              | Capacity verification                                        |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Resource group                               | 1                                     | Not performed; requires confirmed subscription               |
| Container Apps environment                   | 1                                     | Not performed; requires confirmed region and subscription    |
| Container App                                | 1                                     | Not performed; requires confirmed region and subscription    |
| Container Registry                           | 1                                     | Not performed; requires confirmed subscription               |
| PostgreSQL Flexible Server and demo database | 1 server, 1 database                  | Not performed; requires confirmed region and subscription    |
| VNet/private database networking and DNS     | As required by selected network model | Not performed; network design depends on subscription policy |
| Key Vault and app managed identity           | 1 each                                | Not performed; requires confirmed subscription               |
| Log Analytics and Application Insights       | 1 each                                | Not performed; requires confirmed subscription               |

No capacity or SKU availability is asserted. Complete the Azure quota checks before presenting a final deployment plan for approval.

## Decisions still required

- No additional learner authentication provider is needed for current existing-CU-account scope. Future guest pre-account login is deferred.
- Azure tenant/subscription, permitted region, resource ownership and budget.
- Demo audience/access gate, public hostname and email sender configuration.

The project owner clarified on October 21 that existing CU accounts should use the existing Canvas OAuth now. This supersedes the proposed email-link/email-code provider choice for current scope. Staff can independently act as learners. Guest account creation after payment remains future work, with no additional details requested now.

Learner identity should use the verified provider issuer/subject binding, with server-side revocable portal sessions. Provision new demo records or explicitly review migration of existing mocked records; do not silently claim historical records based on matching email. Login does not grant Canvas permissions or create Canvas accounts.

## Planned work

1. Record existing-account Canvas OAuth in ADR 0009; defer guest account details. Complete Azure context/capacity checks and obtain approval of the completed hosting plan before hosting implementation.
2. Implement verified learner identity, secure revocable sessions and access checks.
3. Add portable container packaging, startup, migrations, health and shutdown handling.
4. Prepare Azure infrastructure, secrets and hosted OAuth/Stripe configuration.
5. Validate login, authorization, payment return, accessibility and container recovery.
6. Deploy only after Azure validation and confirmed deployment context; record readback.

## Verification gates

- Expired/reused OAuth state and wrong browser nonces rejected; learner identity forgery rejected.
- Logout, expiry and deactivation revoke learner access server-side.
- No automatic linking to existing demo records or Canvas accounts from untrusted email.
- Stripe return preserves login; signed webhook alone confirms payment.
- Staff OAuth, Canvas previews and portal roles continue to work.
- API and database remain private; demo audience restrictions cover protected routes.
- Migrations preserve data; failed migrations prevent startup; recovery is rehearsed.
- UI changes receive keyboard/automated accessibility checks and recorded screen-reader review gaps.

## Existing references

- [Hosting architecture and demo boundaries](../hosting/deployment-plan.md)
- [Request-driven demo](../adr/0008-request-driven-demo.md)
- [Authentication decisions](../decision-register.md)
- [Functional and security cases](../testing/use-cases.md)
- [Microsoft Entra customer sign-up/sign-in methods](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

No infrastructure, authentication implementation or deployment has been created by this plan.
