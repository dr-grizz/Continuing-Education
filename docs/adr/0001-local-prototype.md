# ADR 0001: Local API-first prototype

Status: accepted for local prototyping only, October 1, 2026. Staff sign-in, Stripe sandbox payments and read-only Canvas access were subsequently amended by ADRs 0004, 0005 and 0007; the original limitations below describe the initial baseline. Data access and migrations superseded by [ADR 0002](0002-prisma-orm.md) on October 6, 2026.

Use Next.js/React, MIT-licensed Material UI components, a NestJS REST API with OpenAPI documentation, PostgreSQL in Docker Compose, and a separate database-backed worker. Keep source in this repository under `src/`. Pin dependency versions and commit the lockfile.

Use plain parameterized PostgreSQL queries and an initial versioned SQL migration rather than introducing an ORM before the domain contracts stabilize. Store queued operation state transactionally; use row locking for seat allocation, unique constraints and actor-scoped idempotency keys. Worker stages commit atomically and can resume after restart. Seed only synthetic offerings.

Local prototype bearer tokens represent learner, staff and read-only automation scopes. Learner requests may select an existing database learner with `X-Prototype-Learner-Id`; omitting it retains the legacy sample learner for direct API demos. Mock email sign-in creates or retrieves a learner and sets an HTTP-only browser cookie for the web proxy. This selects demo records and is not proof of identity. The website has a deliberately open demo role proxy; this is not authentication. Bind services to loopback and reject production mode on the API/worker. SSO, identity matching, Stripe, Canvas, outbound webhooks, production RBAC and lifecycle actions remain unimplemented. Token generation is local and ignored by Git.

Simulated payment is explicitly under `/prototype/`; simulated identity and enrollment outcomes are audit-labeled. Published sample offerings do not claim live Canvas/Stripe validation. This prototype demonstrates workflow/UI/API behavior, not production release readiness.
