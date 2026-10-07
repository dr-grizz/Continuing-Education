# ADR 0003: Build a custom portal instead of Canvas Catalog

Status: accepted, October 6, 2026. Resolves the build-versus-buy decision (A1) required by milestone M0.

## Context

The implementation plan kept the custom-portal direction provisional. It removed the source plan's unsupported claim that Canvas Catalog is unmaintained, since Instructure still offers [Canvas Catalog](https://www.instructure.com/canvas/catalog), and it required the fit and cost justification to be documented before major integration work.

The portal must support the hybrid ownership model in the plan:

- **Portal:** catalog, offerings, approvals, orders, entitlements and support queues.
- **Finance:** payments and refunds, through Stripe.
- **IT Identity:** CedarNet and Courtesy accounts.
- **Canvas Administration:** enrollments and learning records.

## Decision

Do not use Canvas Catalog. Continue building the custom portal described in the implementation plan: Next.js and MUI website, NestJS API, PostgreSQL and a durable worker.

Rationale, as decided by the project: Canvas Catalog does not fit the program's requirements.

> **To complete:** the decision owner should list the specific requirements Catalog does not meet, and any cost comparison, so later readers can reassess if Catalog or the requirements change. Requirements the plan depends on, for reference only (not a record of which ones Catalog failed):
> - approval-gated registration with expiring approvals
> - Stripe checkout with quoted prices and seat reconciliation
> - IT-controlled Courtesy identity provisioning and lifecycle
> - verified Canvas enrollment with owned exception handling
> - staff recovery workflows
> - an API for authorized automation

## Consequences

- The project owns building, hosting, securing, accessibility and support for the portal, including the M1–M6 milestones and their production gates.
- Hosting (A3) and authentication (A4) remain open decisions and become more important because no vendor platform supplies them.
- Canvas remains the learning system. Canvas course mapping (C2) and enrollment contracts are still required.
- Revisit this decision if Catalog adds the missing capabilities or the program's requirements narrow, and record any change as a superseding ADR.
