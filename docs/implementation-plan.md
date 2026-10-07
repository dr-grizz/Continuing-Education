# Continuing Education Portal: Implementation Plan

Status: proposed implementation baseline, October 1, 2026. Policy and infrastructure decisions remain subject to the owners identified below.

Existing planning tracker: [GitHub issue #1](https://github.com/dr-grizz/Continuing-Education/issues/1). Subsequent local updates, including workflow diagrams and API requirements, have not been synchronized to that issue.

## Recommendation and source

Build an API-first modular portal: Next.js with React/TypeScript and **Material UI** for the website, a NestJS REST API, PostgreSQL, and a durable background worker. The website and authorized automation use the same application services and business rules. Use established library components and Cedarville branding throughout. Deliver a working sandbox registration flow before expanding the feature set.

This plan adapts `course-portal-implementation-plan-v2.md`, supplied from `/Users/hye/Downloads/working_dir/course-portal-planning/`. The supplied document is source material, not authorization to provision identities, charge learners, alter Canvas, or deploy. Preserve its hybrid ownership model while resolving the implementation gaps listed here. The original file remains unchanged.

The repository now contains a local prototype, `CONTEXT.md`, and the prototype architecture decision in `docs/adr/`. Follow its single-context structure: `CONTEXT.md`, `docs/adr/`, and `src/`. GitHub Issues are the repository's planning and specification tracker; this file is the editable repository copy, with local changes published only when authorized. Record accepted architectural decisions as ADRs rather than treating every recommendation here as settled policy.

### Local prototype status

The first prototype implements MUI catalog/search and course details, demo learner registration/status, staff draft creation/publication and approval decisions, and a scoped NestJS API with OpenAPI documentation. PostgreSQL runs in a dedicated persistent Docker Compose service. A separate worker processes durable simulated identity/enrollment operations. See [local setup and limitations](../README.md) and [prototype ADR](adr/0001-local-prototype.md).

Payment, identity and Canvas outcomes are explicitly simulated. Demo role switching is not production authentication. This slice does not complete the full milestone acceptance gates: live mapping validation, SSO/identity proof, Stripe webhooks, refunds, transfers, lifecycle enforcement and production operations remain future work.

### Policy decisions

Decided October 6, 2026, and implemented in the prototype (migration `005_enrollment_policies.sql`). Each value below is a per-offering default that staff can change in **Staff → Offerings → Settings**. Changes are version-checked and audited (`offering.settings_changed`).

| Policy | Decision | Prototype behavior |
| --- | --- | --- |
| Approval validity | An approval lasts one week; staff can change the period | `approval_valid_days` (default 7, range 1–365). Approval sets `approval_expires_at`. Unused approvals lapse to `approval_expired` (worker, audited `approval.expired`). A still-valid approval survives an expired seat reservation. A changed period applies to new approvals only |
| Enrollment window | Scheduled courses close enrollment one week after the start date; staff can change the window | `enrollment_close_days` (default 7, range 0–365). Registration, approval requests and seat renewals are refused after the start date plus that many days. Registrations already in progress are unaffected. Self-paced courses never close |
| Repeat requests | Declined learners may request approval again | Re-registering after a decline (or a lapsed approval) creates a new approval request (audited `approval.requested_again`) |
| Course launch | Learners get a link to the Canvas course once their Canvas account and enrollment exist | `canvas_course_url` (optional HTTPS). Shown as **Open course in Canvas** only after enrollment completes; returned by the API only for enrolled registrations. Sample offerings use `canvas.example.edu` placeholders, and real course mappings await Canvas integration (M4) |

### Known prototype gaps

Recorded October 2, 2026, after the registration-flow verification and UI modernization. The current baseline is described in the [UI specification](prototype/ui-specification.md), and evidence is in the [implementation progress](prototype/implementation-progress.md). These are open items, not accepted behavior. Resolve or explicitly accept each one before the milestone named.

Resolved October 6, 2026: staff offering management now covers editing (drafts freely; published offerings only with an audited reason, with course type and approval requirement locked, dates locked while learners are registered and capacity never below seats in use), unpublishing with a reason, append-only price history with per-reservation quoted prices, and field-level validation with an error summary in the offering form. Unpublished offerings have their own status (`unpublished_at`, migration 007) and keep the published-offering edit rules.

Resolved October 5, 2026: My learning no longer loses keyboard focus (focus moves to the next action or the course heading); static status messages no longer use alert semantics, and background status changes are announced once through a polite live region; simulated provisioning failure, bounded automatic retries, the staff exception queue (retry or manual enrollment, each with an audited reason) and a worker crash/restart drill are in place. Screen-reader confirmation of these changes is still part of the accessibility evidence gap.

| Gap | Current behavior | Needed | Milestone |
| --- | --- | --- | --- |
| Accessibility evidence | Keyboard, focus, contrast and 320–375px reflow are checked. No automated scan, screen-reader session, forced-colors, 200–400% zoom or cross-browser review has been recorded | Complete the README checklist for catalog, sign-in, registration, learner status and staff dialogs/tables; record findings | M1 exit; release gate |
| Pending and declined learner messages | API behavior is verified; the browser view as the affected learner is not | Review both states in the browser as the learner | M2 |
| Catalog and staff paging | The API returns up to 100 offerings and 200 audit events; the catalog has no pagination; staff sorting and paging are client-side within those limits | Server-side search, sort and paging before catalog or audit volume approaches the limits | M2 |
| Brand baseline | Figtree, a free font similar to Proxima Nova (the cedarville.edu font), is used; colors are provisional and copy is unreviewed | Cedarville Marketing to approve Figtree as the substitute or supply a licensed brand font; approve colors, logo use and content | M1 exit |
| Theme control | Light/dark follows the operating system only | Decide whether a manual theme toggle is required | M1 |
| Open staff access | Any browser can reach Staff; the web proxy trusts a client-supplied role header | Staff SSO/MFA and server-side roles (already planned; prototype only) | M1 |
| Exception ownership and alerting | Failed provisioning reaches a staff queue with reason, history, retry and manual-resolution actions, but exceptions have no assigned owner, age target or alert, and the simulation outcome is one shared setting for all demo users | Owner assignment, ageing/SLA indicators and alerts once staff roles exist; per-scenario simulation if concurrent demos need it | M3 |

## Scope and ownership

| System or group | Owns |
| --- | --- |
| Portal / Program Operations | Public catalog, offerings, approvals, orders, entitlements, status and support queues |
| Stripe / Finance | Hosted payment collection, receipts, refunds, disputes and financial reconciliation |
| IT Identity | CedarNet and Courtesy Accounts, SSO/MFA, activation, identity matching, expiry, disablement and retention disposition |
| Canvas Administration | Course/section mappings, SIS user mapping, enrollment permissions and learning records |
| Security / Registrar / Legal | Authentication policy, privacy, retention, age restrictions and accessibility review |

First release: non-credit offerings, self-purchase, one offering per checkout, one-time payments, optional approval, existing or Courtesy identities, verified Canvas enrollment, learner status and staff operations. Separate course products from saleable offerings/cohorts.

Defer subscriptions, group purchasing, bundles, automated transfers and LTI 1.3. Memberships, bulk enrollment and priced pathways or collections are [requested additions](#requested-feature-additions) that overlap these deferrals; they stay out of the first release unless the sponsor moves them (decision register F-series). Staff-assisted transfers still need a documented, auditable procedure before the pilot. Certificates initially link to the approved record system; do not invent a certificate issuer or retention policy.

## Requested feature additions

Requested October 7, 2026. These features extend the portal beyond the first release described above. Each lists its purpose, dependencies, risks and open decisions. Proposed milestones are in [Requested features by milestone](#requested-features-by-milestone), and the open decisions are tracked as F1–F10 in the [decision register](decision-register.md#product-features). None is approved for implementation until its decisions have owners.

| Feature | Summary | Main dependencies | Proposed timing |
| --- | --- | --- | --- |
| Enrollment and sales dashboards | Staff views of enrollment and sales trends | Real orders (M3) and verified enrollments (M4); Finance reconciliation | Enrollment: M4. Sales: M6 |
| Customizable sales pages | Staff-edited marketing pages for offerings, pathways and collections | Brand approval (O4); content and accessibility review | After M2, before the pilot |
| Pathways | Staff-defined sequences of courses that learners follow | Catalog (M2); completion evidence (R2) for progress | Browse and follow: M2+. Progress: M4+ |
| Collections | Staff-curated groupings such as Bible Minor, Christian Leadership and ACSI | Catalog (M2) | M2+ |
| Saved courses | A learner's private favorites or wishlist (recommended instead of learner-created collections) | Learner sign-in (A4) | M2+ |
| Memberships | Monthly or yearly fee for continuing access | Stripe subscriptions; Finance, tax and refund policy; Canvas and Courtesy lifecycle | After the pilot |
| Coupons | Discount codes at checkout | Stripe Checkout (M3); Finance discount policy | M3+ |
| Bulk enrollment | Staff or organizations enroll many learners at once | Identity provisioning at scale (C1, M4); invoicing policy | After M4 |
| User exports | Downloadable learner, registration and order data | Privacy, retention and export policy (P7); staff roles | M5 |

### Enrollment and sales dashboards

- **Enrollment dashboard** (Program Operations):
  - New registrations, approvals pending, seats filled versus capacity, enrolled versus provisioning versus exceptions, by offering, collection, pathway and date range.
  - It can use portal data alone, but "enrolled" must mean verified Canvas enrollment (M4).
- **Sales dashboard** (Finance and Program Operations):
  - Gross sales, refunds, discounts and net, by offering, coupon, membership and period.
  - Figures must reconcile to Stripe, which is the financial source of truth. The dashboard is operational insight, not financial evidence. Label any simulated or test-mode data.
- **Access:** dashboards show aggregates. Drilling down to individual learners follows the user-export rules. Sales figures need a new `reports:sales` scope (for example, Finance and Program Operations); enrollment figures fit the existing `reports:read`.
- **Accessibility:** charts need text alternatives and table views; colour must not be the only signal.

### Customizable sales pages

- **What:** marketing landing pages for an offering, a pathway or a collection. Staff edit them without code changes.
- **Building blocks:** use structured blocks, not free-form HTML, which would be a cross-site scripting risk and an accessibility risk. Blocks include:
  - hero with image and alternative text
  - rich text with limited formatting
  - learning outcomes
  - instructor or partner details
  - testimonials (with consent records)
  - frequently asked questions
  - price and call to action
- **Workflow:** draft, preview, then publish, versioned and audited like offerings. Published pages change only through a reviewed edit.
- **Search and sharing:** stable, readable URLs (slugs), page titles, descriptions and social-sharing images.
- **Ownership:** Marketing approves brand and content. A **Content editor** staff role (added October 7, 2026, with the reserved `content:write` scope) separates page editing from catalog management: content editors cannot change prices, policies or publication.
- **Gates:** each published page passes the accessibility checklist. Prices and dates are pulled from the offering, never typed into page text, so they cannot drift.

### Pathways

- **What:** a staff-defined, ordered sequence of courses, such as Bible Foundations 1 → 2 → 3. Staff create, publish and retire pathways; learners **follow** one to see their progress and the next recommended course.
- **Decisions (F4):**
  - Does following a pathway register or charge for anything, or does each course stay a separate purchase?
  - Are earlier courses prerequisites, or only a recommended order?
  - Can a pathway have a bundled price? If so, it becomes a "bundle", which the first release defers.
  - Does completing a pathway earn a certificate? The plan says not to invent a certificate issuer.
- **Dependencies:** progress needs authoritative completion data (R2), not just enrollment. Pathways that include Scheduled courses must handle cohorts that no longer run.

### Collections

- **What:** staff-curated, published groupings for discovery and marketing, such as **Bible Minor**, **Christian Leadership** and **ACSI**. Unlike pathways, collections have no order or progress. They can appear as catalog filters and landing pages.
- **Recommendation for the open question (F3):**
  - **Collections are created by staff only**, through a reviewed publish workflow like offerings.
  - Learners get a separate, private **Saved courses** list (favorites or wishlist), not learner-created collections. Calling both "collections" would confuse people. Private lists avoid moderation and privacy work.
  - Shareable learner-created lists can be reconsidered later.
- **ACSI:** if a collection reflects a partner or credential, such as ACSI professional development, confirm whether it implies eligibility rules, partner pricing or reporting obligations (F5). If it does, it is more than a display grouping.

### Memberships

- **What:** a monthly or yearly fee that gives continuing access.
- **Decisions (F6):**
  - Access to what: all self-paced courses, a collection, or a library?
  - Price, trials, proration, cancellation and refund rules, and tax.
  - What happens on lapse: a grace period, then removal of Canvas access?
  - How memberships combine with one-time purchases.
- **Implementation:** Stripe Billing subscriptions with signed webhooks. Entitlements become time-bounded while a membership is active. Subscription status changes must be reconciled, as with M3 checkout.
- **Lifecycle impact:** Courtesy account expiry (P8) must treat an active membership as a protected entitlement. A lapsed membership must not disable an identity that other entitlements still need.
- **Scope note:** this reverses the first release's "defer subscriptions" and needs Finance and IT Identity approval before design.

### Coupons

- **Rules:** discount codes with percent or fixed amount, valid dates, total and per-learner limits, applicable offerings or collections, and stacking rules. Implement them as Stripe Coupons and Promotion Codes, mirrored in the portal for audit and reporting.
- **Price consistency:**
  - The quoted price at reservation records any discount, consistent with price quoting.
  - Approval-gated offerings apply coupons only at checkout.
  - A 100% discount still needs a non-payment fulfillment path with Finance-approved records.
- **Governance (F7):** Finance approves who can create coupons and the discount limits. Coupon creation and use are audited, and abuse controls include rate limits and single-use codes.

### Bulk enrollment

- **What:** enroll many learners at once.
  - **Staff-assisted:** upload a CSV of learners for an offering.
  - **Organizational purchase:** an organization buys seats for its people. This is the "group purchasing" the first release defers.
- **Processing:**
  - Validate every row first and show a per-row report before committing: duplicates, approval needs, capacity, eligibility.
  - Process each row idempotently as durable jobs. Report partial success; never apply all-or-nothing silently.
- **Identity:** each learner may need a Courtesy account. Bulk volume makes ambiguous-match handling (C1) and IT rate limits critical.
- **Decisions (F8):** payment by invoice versus card, who may bulk-enroll, seat reservation for organizations, and notification rules.

### User exports

- **What:** CSV exports of learners, registrations, orders and audit activity for staff reporting.
- **Privacy first (F9):**
  - Only roles approved by Security and the Registrar can export, for example through a new `exports:run` scope.
  - Exports carry the minimum fields, with a field selection.
  - Every export is audited (who, what, filters, row count).
  - Files are generated on demand and not stored long term.
  - Retention and handling follow P7 and institutional data policy.
- **Formats:** CSV, with spreadsheet formula injection neutralized. Large exports run as background jobs.

## Interface requirement: established open-source components

Use `@mui/material` and `@mui/icons-material`. Use MUI X **Community** components only when needed for staff grids/date inputs. Material UI is MIT licensed and provides a broad, established component system; MUI X Pro and Premium have commercial licenses. Pin compatible stable versions and retain license notices. See [Material UI repository](https://github.com/mui/material-ui), [component catalog](https://mui.com/material-ui/all-components/) and [MUI X licensing](https://mui.com/x/introduction/licensing/).

This is a deliberate design recommendation: a complete component system reduces custom styling and interaction work for the catalog, registration forms and operational tables. Do not combine competing component libraries or introduce a second styling system without an ADR.

### Visual and interaction conventions

- Begin with documented MUI layout/component patterns. Customize a shared theme using approved Cedarville colors, typography, logo, spacing and restrained surface styles. Obtain brand assets instead of inventing them.
- Use a conventional university course catalog: clear navigation, category/search controls, readable course listings and prominent price, dates, eligibility and enrollment action.
- Use compact tables and filters for staff work. Show operational counts only when they help staff act; no decorative charts or generic dashboard tiles.
- Avoid gradient backgrounds, glass effects, oversized rounded cards, floating decorative shapes, emoji navigation, excessive animation and generated hero illustrations. Use approved course imagery only when it conveys useful information.
- Prefer text labels such as “Request approval,” “Continue to payment,” “Payment received,” and “Open course.” Display the next action, support contact and expected timing beside the status.
- Keep forms short, with visible labels, inline validation and an error summary. Preserve entered data after recoverable errors. Explain approval requirements before sign-in or payment.
- Cover loading, empty, validation, permission-denied and service-failure states. Never show “Enrolled” until Canvas enrollment is verified.
- Use responsive layouts, visible focus, keyboard navigation, accessible names, text plus color for status and reduced-motion support. Meet the source baseline of WCAG 2.1 AA; confirm whether institutional policy requires a newer standard. Library choice alone does not establish compliance.

### Screen inventory and components

| Screen | Required content | Library patterns |
| --- | --- | --- |
| Catalog | Search, categories, availability, prices and dates | AppBar, Container, TextField, Select, List or restrained Card, Pagination |
| Course detail | Outcomes, prerequisites, schedule, price, approval/refund rules | Typography, Stack, Divider, Alert, Button |
| Sign-in and linking | Email code, passkey setup, SSO and recovery | TextField, Button, Alert; authentication-provider flows |
| Registration | Required identity fields, approval status, seat hold | Form controls, Stepper where useful, validation summary |
| Order/access status | Payment and enrollment shown separately, timing, support | Alert, List, progress indicator, actionable links |
| My learning | Offerings, access status, dates, approved record links | List or Table, Chip, Button |
| Staff catalog | Draft/publish, price history, section validation | Table or Community DataGrid, forms, Dialog |
| Approvals/exceptions | Filters, owner, age, evidence and permitted actions | Table or Community DataGrid, Drawer, Dialog, Alert |
| Reconciliation/lifecycle | Unmatched records, proposed changes, audit trail | Table, date inputs, CSV export, confirmation Dialog |
| Dashboards (requested) | Enrollment and sales trends, filters, table alternatives to charts | Cards, Table, date inputs; MUI X Charts (Community) only with an ADR |
| Sales page editor (requested) | Structured blocks, preview, publish, version history | Forms, Dialog, Stepper or Tabs; no free-form HTML |
| Pathways and collections (requested) | Ordered or curated course lists, follow and progress, saved courses | List, Card, Chip, Stepper (pathway progress) |
| Coupons (requested) | Code rules, limits, usage | Table, forms, Dialog |
| Bulk enrollment (requested) | CSV upload, per-row validation report, job progress | File input, Table, Alert, progress indicator |
| Exports (requested) | Dataset and field selection, audit notice, download | Forms, Alert, Button |

Before full UI development, review catalog, course detail, learner status and staff exception screens using realistic sample data at mobile and desktop sizes. Acceptance requires brand consistency, recognizable library patterns and successful keyboard completion of the main tasks.

## Architecture and implementation boundaries

Use one domain context with a modular NestJS API and worker sharing domain services. Next.js provides the React/TypeScript website and public catalog rendering; MUI provides the interface components. These framework choices are proposed for the M0 ADR, subject to IT deployment/support checks. Authentication provider, hosting and job runtime still require short decision spikes; do not build a custom authentication system. PostgreSQL is the recommended transactional store. A database-backed job queue can avoid an additional service initially if it supports durable retries, locking and recovery.

NestJS supports [OpenAPI documentation generation](https://docs.nestjs.com/openapi/introduction) and [API versioning](https://docs.nestjs.com/techniques/versioning). MUI documents its [Next.js integration](https://mui.com/material-ui/integrations/nextjs/). The framework split keeps the automation interface independent of website pages, at the cost of separate web and API runtime processes. Deploy them from one repository and route browser API traffic through the same origin where practical.

```mermaid
flowchart LR
    learner["Learner"] --> web["Portal web application"]
    staff["Program staff"] --> web
    automation["Authorized automation clients"] --> api["NestJS REST API"]
    web --> api
    api --> db[("PostgreSQL: domain records, events and jobs")]
    worker["Durable background worker"] <--> db
    api <-->|"Checkout / signed events"| stripe["Stripe"]
    api <-->|"Validated authentication / identity proof"| identity["IT identity platform"]
    worker <-->|"Matching / sponsored account requests"| identity
    identity -->|"SIS feed"| canvas["Canvas"]
    worker <-->|"Lookup / enrollment / verification"| canvas
    api --> mail["Approved email service"]
    worker --> mail
```

Suggested structure once implementation starts:

```text
CONTEXT.md                 # Glossary, invariants, ownership
docs/adr/                  # Accepted architecture/policy decisions
docs/runbooks/             # Recovery, reconciliation and rollback
src/web/                   # Next.js website, MUI screens and shared theme
src/server/                # NestJS REST API, authorization, integrations
src/domain/                # Offerings, approvals, orders, entitlements
src/worker/                # Durable workflows and lifecycle jobs
tests/                     # Domain, integration and browser checks
```

All privileged actions execute on the server with role and record-level authorization. Browser state, Stripe metadata and email addresses never establish ownership or payment authority by themselves. Public catalog responses exclude learner and identity data.

### API and automation support

API support is a first-release architecture requirement, not a later retrofit. Business actions live in shared application services called by API handlers and workers. The website consumes these contracts; any server-rendering or authentication adapter must preserve the same authorization and business rules. Automation never writes directly to the database or simulates UI clicks.

Use versioned REST/JSON endpoints under `/api/v1`, an exported OpenAPI specification, and interactive API documentation in approved environments. Define request/response schemas, permissions, error codes, pagination/filtering and examples alongside each workflow. Generate a TypeScript client for the website; document Python and command-line examples for future automation. No GraphQL or custom SDK is required initially.

| Automation capability | Proposed API examples | Boundary |
| --- | --- | --- |
| Read catalog and availability | `GET /api/v1/offerings` | Public responses exclude personal data |
| Create/update/publish offerings | `POST /api/v1/offerings`, `PATCH /api/v1/offerings/{id}`, `POST /api/v1/offerings/{id}/publish` | Catalog-management permission; normal validation and audit |
| Read and decide approval requests | `GET /api/v1/approval-requests`, `POST /api/v1/approval-requests/{id}/decision` | Scoped approval authority; preserve any required human review |
| Read orders and access status | `GET /api/v1/orders`, `GET /api/v1/entitlements` | Restricted record visibility; cannot set payment status manually |
| Queue approved operational work | `POST /api/v1/transfers`, `POST /api/v1/exceptions/{id}/retry` | Same policy, capacity, sponsorship and authorization checks as staff UI |
| Check asynchronous outcomes | `GET /api/v1/operations/{id}` | Return pending/running/succeeded/failed and safe error detail |
| Export reconciliation data | `GET /api/v1/reconciliation` | Restricted reporting scope, bounded queries and minimal personal data |

Endpoint names are proposed contracts to finalize before implementation. Provisioning follows a valid paid entitlement; there is no unrestricted enroll-user, disable-account or mark-order-paid endpoint. Finance continues initiating refunds through Stripe in the initial scope; the API can expose permitted refund status and requests without changing that ownership.

Machine clients use dedicated service identities with short-lived tokens, narrowly scoped permissions, revocation and audit attribution. Prefer OAuth 2.0 client credentials through an approved provider; verify provider support in M0. Browser users use approved session/SSO authentication. Define scopes such as `catalog:write`, `approvals:decide`, `orders:read`, `exceptions:retry` and `reports:read`, together with offering/program restrictions. A service identity does not impersonate a learner or bypass fresh-sign-in requirements.

Mutating workflow commands support idempotency keys, with key/request matching and documented retention. Use resource versions or conditional updates to prevent accidental overwrites. Long-running actions return `202 Accepted` with an operation ID and status URL, not a premature success message. Document rate limits, retry guidance and stable error responses. Audit both the calling service and the initiating actor when applicable.

Capture domain events through a transactional outbox from the beginning. Add signed outbound webhooks when automation integrations are introduced, with events such as `offering.published`, `approval.decided`, `order.paid`, `enrollment.verified` and `exception.opened`. Delivery is at least once: include event ID, schema version and timestamp; persist delivery attempts, use bounded retries and support authorized replay. Subscribers deduplicate and can query the API for current state. Minimize webhook personal data and validate configured destinations. Outbound automation notifications are separate from inbound Stripe webhooks.

M1 establishes API documentation, authorization and operation-status conventions. M2–M5 implement workflow endpoints with their corresponding UI. Before pilot release, demonstrate one scoped machine client reading offerings and performing an authorized sandbox action, including denied scopes, duplicate-command retries and asynchronous failure handling. Outbound subscriber management and webhook delivery can follow when needed without redesigning the domain model.

### Domain records and invariants

| Record | Key fields / constraints |
| --- | --- |
| Learner | Internal ID, verified contact address; authentication accounts linked separately |
| Identity link | Durable university ID, type, sponsorship evidence, SIS mapping; unique university identity link |
| Course product / offering | Category, descriptions, price/currency, dates/timezone, capacity, approval rule, Canvas mapping, publication state |
| Approval | Learner/offering, decision, actor, decision time, validity window |
| Seat reservation | Learner/offering, Checkout Session, expiry, reserved/consumed/released state |
| Order / order event | Price snapshot, Stripe identifiers, append-only payment/refund/dispute events; derived current status |
| Entitlement | Learner/offering access justification, lifecycle state and enrollment reference |
| Integration event / job | Unique event and operation keys, attempts, next retry, outcome, correlation ID |
| Audit / exception | Actor, action, object, timestamp, reason, owner and resolution; exclude secrets |

Enforce atomic capacity reservation and one active entitlement per learner/offering. Different Stripe event IDs concerning the same session must still result in one fulfillment. Keep payment, entitlement and identity states separate. A university identity is linked only through an approved proof process, including SSO for an existing identity.

## Corrections and decisions required from v2

| Source assumption or gap | Implementation treatment |
| --- | --- |
| Canvas Catalog is not actively maintained | Remove that unsupported rationale. Instructure currently offers [Canvas Catalog](https://www.instructure.com/canvas/catalog). **Decided October 6, 2026:** Catalog does not fit the program's requirements; build the custom portal ([ADR 0003](adr/0003-custom-portal-not-canvas-catalog.md)). The specific unmet requirements are still to be recorded in the ADR. |
| A 30-minute hold always guarantees a paid seat | Use atomic capacity allocation and Stripe session reconciliation. Disable delayed payment methods for the initial pilot. A later delayed-payment release must retain capacity while processing or define a Finance-approved exception/refund policy. |
| Browser cancellation releases a seat | A return/cancel page is not authoritative. Release only after confirmed expiration/cancellation semantics; reconcile sessions if webhooks are delayed. Stripe supports expiration from 30 minutes to 24 hours and sends an expiration event. See [Stripe inventory guidance](https://docs.stripe.com/payments/checkout/managing-limited-inventory). |
| Email code cannot be used on another device | Bind the code challenge to the requesting browser/session and enforce attempt limits. A code alone does not establish that property. Have Security approve recovery and account-linking behavior. |
| 14-day warning plus 7-day withdrawal grace | These defaults conflict for immediate withdrawal. Obtain an explicit expedited-notice rule or a longer grace period; do not silently implement both. |
| Expiry includes only Enrolled/Completed entitlements | Include paid provisioning obligations in the protection rule so a second purchase awaiting SIS cannot trigger premature disablement. IT must approve the exact state/date calculation. |
| Refund always revokes access | Distinguish full, partial, pending and failed refunds. Finance/Program Operations define which changes revoke access; dispute-open and dispute-lost are separate decisions. Handle reversal while provisioning is still pending. |
| Offering end means Completed | Track entitlement end separately from academic completion or certificate eligibility. Obtain completion evidence from the approved learning record system. |
| Canvas access removal deletes enrollment | Select and test the appropriate enrollment state with Canvas Administration; retain required records and avoid deletion by default. |
| SIS every two hours, eight-hour escalation | Treat these as planning assumptions pending IT verification. Make timings configurable and publish only an approved learner-facing expectation. |

## Portal workflows

Workflows 1–9 describe recurring portal behavior: catalog administration, learner registration and access, and ongoing operations. They include actions performed by learners, staff and connected systems; the portal does not perform every step itself. For example, Finance initiates refunds in Stripe, IT provisions identities, and the portal tracks and coordinates the resulting changes.

These diagrams describe proposed behavior, not live integrations. Solid arrows are requests/actions; dashed arrows are responses or notifications. The Portal includes server-side authorization and domain logic; the Worker performs durable background work. Every staff action requires its authorized role. Policy-dependent branches remain subject to the decisions above. The one-time course migration and launch process appears in the separate project section after these diagrams.

| Workflow | Portal area | Related milestone |
| --- | --- | --- |
| 1. Publish an offering | Catalog administration | M2 |
| 2. Learner sign-in and university identity linking | Learner registration and access | M1, M4 |
| 3. Approval and pre-payment identity checks | Learner registration and access | M2, M3 |
| 4. Checkout, payment confirmation and seat release | Learner registration and access | M3 |
| 5. Courtesy provisioning and Canvas access | Learner registration and access | M4 |
| 6. Refund, withdrawal or dispute | Ongoing operations and support | M5 |
| 7. Staff-assisted transfer | Ongoing operations and support | M5 |
| 8. Courtesy expiry, notices and disablement | Ongoing operations and support | M5 |
| 9. Reconciliation and exception recovery | Ongoing operations and support | M6 |

### Catalog administration

This is normal staff use of the portal, whether publishing a migrated course or a newly created course. It does not move course content into Canvas.

#### 1. Publish an offering

```mermaid
sequenceDiagram
    autonumber
    actor Manager as Catalog manager
    participant Portal
    participant Canvas
    participant Stripe
    participant DB as Portal database
    Manager->>Portal: Save draft offering and Canvas mapping
    Portal->>DB: Save draft and audit change
    Manager->>Portal: Publish offering
    Portal->>Portal: Validate role, content, dates and capacity
    Portal->>Canvas: Verify mapped course and section
    Canvas-->>Portal: Mapping and date constraints
    alt Invalid configuration or unavailable validation
        Portal-->>Manager: Keep draft and show actionable errors
    else Validation passes
        Portal->>Stripe: Create or reuse Product and Price idempotently
        Stripe-->>Portal: Product and Price IDs
        Portal->>DB: Commit published offering and audit event
        Portal-->>Manager: Offering is visible in catalog
    end
    Note over Portal,Stripe: Price changes create a new Price, existing sessions retain their price snapshot
```

### Learner registration and access

These workflows take a learner from portal sign-in through eligibility checks, payment and verified course access. Staff approvals and IT provisioning are part of that recurring journey.

#### 2. Learner sign-in and university identity linking

The authentication provider is selected in M0/M1. A new learner can have a portal account before a university identity exists. Existing CedarNet users use SSO; active Courtesy users transition to approved SSO after activation. Recovery follows Security-approved policy.

```mermaid
sequenceDiagram
    autonumber
    actor Learner
    participant Portal
    participant Auth as Authentication provider
    participant SSO as Cedarville SSO
    participant DB as Portal database
    alt New learner without university identity
        Learner->>Portal: Request email sign-in code
        Portal->>Auth: Start rate-limited browser-bound challenge
        Auth-->>Learner: Send single-use code by email
        Learner->>Portal: Enter code in requesting session
        Portal->>Auth: Verify code, expiry, attempts and session binding
        Auth-->>Portal: Verified portal authentication result
        Portal->>DB: Create or retrieve internal learner record
        Portal-->>Learner: Signed-in session and passkey setup prompt
        opt Learner registers a passkey
            Learner->>Auth: Complete WebAuthn registration
            Auth-->>Portal: Passkey associated with authenticated account
        end
    else Returning passkey learner
        Learner->>Auth: Complete passkey challenge
        Auth-->>Portal: Verified portal authentication result
        Portal-->>Learner: Signed-in session
    else Existing or activated university identity
        Learner->>Portal: Choose Cedarville sign-in
        Portal->>SSO: Begin SSO with state and nonce validation
        Learner->>SSO: Authenticate under IT MFA policy
        SSO-->>Portal: Validated authentication response
        Portal->>DB: Resolve approved subject-to-university-ID mapping
        Portal-->>Learner: Signed-in session
    end
    opt Link a pre-existing portal account to university identity
        Learner->>Portal: Request linking from authenticated portal session
        Portal->>SSO: Require fresh proof of university identity
        SSO-->>Portal: Validated identity proof
        Portal->>DB: Check durable university ID uniqueness
        alt Identity already linked to another learner
            Portal-->>Learner: Stop linking and route to support
        else Link is valid
            Portal->>DB: Atomically link identity with uniqueness enforcement
            Portal-->>Learner: Account link confirmed
        end
    end
    Note over Portal,DB: Email match alone never links a university identity
```

#### 3. Approval and pre-payment identity checks

Approval does not reserve capacity. Checkout must repeat approval validity, enrollment-window and capacity checks. Ambiguous identity results require authorized review before any payment.

```mermaid
sequenceDiagram
    autonumber
    actor Learner
    participant Portal
    participant DB as Portal database
    actor Approver
    participant Identity as IT identity service
    Learner->>Portal: Select offering while signed in
    Portal-->>Learner: Show eligibility, dates, price and approval rules
    alt Approval required
        Learner->>Portal: Submit approval request
        Portal->>DB: Persist request and audit event
        Approver->>Portal: Review request and decide
        Portal->>DB: Save decision and validity window
        Portal-->>Learner: Notify approval or decline
    else No approval required
        Portal-->>Learner: Registration can continue
    end
    Learner->>Portal: Continue registration
    Portal->>DB: Recheck approval and enrollment window
    alt Declined, expired approval or closed enrollment
        Portal-->>Learner: Explain why checkout is unavailable
    else Eligible to continue
        Portal->>Identity: Find identity using approved match data
        Identity-->>Portal: Existing identity, no match or ambiguous result
        alt Ambiguous result or identity service failure
            Portal->>DB: Create owned pre-payment exception
            Portal-->>Learner: Registration needs review, payment is unavailable
        else Existing identity found
            Portal-->>Learner: Require SSO proof and account linking
            Note over Learner,Portal: Complete workflow 2 before workflow 4
        else Verified no-match result
            Portal->>DB: Record resolved match outcome
            Portal-->>Learner: Continue to checkout eligibility checks
        end
    end
```

#### 4. Checkout, payment confirmation and seat release

The pilot uses immediate payment methods. Closing the browser or visiting the cancel page does not release a seat. A delayed or unavailable Stripe response leaves a reservation under reconciliation rather than making it available for resale.

```mermaid
sequenceDiagram
    autonumber
    actor Learner
    participant Portal
    participant DB as Portal database
    participant Stripe
    participant Worker
    Learner->>Portal: Start checkout
    Portal->>DB: Check eligibility and atomically reserve available seat
    alt No capacity or eligibility changed
        Portal-->>Learner: Explain unavailable registration
    else Seat reserved
        Portal->>Stripe: Create Checkout Session with operation key and expiry
        Stripe-->>Portal: Session ID, URL and expiry
        Portal->>DB: Persist session-to-reservation mapping
        Portal-->>Learner: Redirect to hosted Checkout
        Learner->>Stripe: Submit payment or leave checkout
        alt Payment confirmed
            Stripe->>Portal: Signed payment webhook
            Portal->>Portal: Verify signature and event relevance
            Portal->>DB: Atomically persist unique event and processing job
            DB-->>Portal: Durable commit succeeds
            Portal-->>Stripe: Acknowledge delivery
            Worker->>DB: Claim event-processing job
            Worker->>Stripe: Retrieve authoritative payment/session state
            Stripe-->>Worker: Confirm paid session and order details
            Worker->>DB: Idempotently record paid order, consume seat and queue provisioning
            Note over Worker,DB: Duplicate events and replays cannot create a second fulfillment
            Learner->>Portal: Open return page or My learning
            Portal->>DB: Read persisted order and access status
            Portal-->>Learner: Payment received, access preparation status
        else Session expires without payment
            Stripe->>Portal: Signed session-expired webhook
            Portal->>DB: Persist unique event and reconciliation job
            Portal-->>Stripe: Acknowledge after durable commit
            Worker->>Stripe: Verify session is expired and unpaid
            Stripe-->>Worker: Authoritative session state
            Worker->>DB: Release seat idempotently if expired and unpaid
            Portal-->>Learner: Checkout expired, start again if seats remain
        end
    end
    Note over Portal,Worker: Scheduled reconciliation also covers missing webhooks and uncertain session creation
```

#### 5. Courtesy provisioning and Canvas access

Existing university identities skip Courtesy provisioning. Account activation and Canvas enrollment are tracked independently. Retry duration and learner-facing timing require IT approval.

```mermaid
sequenceDiagram
    autonumber
    participant Worker
    participant DB as Portal database
    participant Identity as IT identity service
    participant Canvas
    actor Learner
    Worker->>DB: Claim provisioning job and verify paid entitlement
    alt Proved existing university identity
        Worker->>DB: Retrieve durable linked identity and SIS mapping
    else Verified no-match outcome
        Worker->>Identity: Request Courtesy identity with sponsorship and idempotency key
        Identity-->>Worker: Provisioning request ID
        Worker->>DB: Persist request ID before subsequent processing
        loop Until provisioned, failed or deadline reached
            Worker->>Identity: Query provisioning status
            Identity-->>Worker: Pending, provisioned or failed
        end
        opt Courtesy identity provisioned
            Worker->>DB: Save durable identity ID, approved SIS mapping and sponsorship
            Identity-->>Learner: Send credential activation instructions
            Learner->>Identity: Activate account under IT policy
        end
    end
    alt Identity unavailable or provisioning failed
        Worker->>DB: Record owned exception and current learner status
    else Identity available
        Note over Identity,Canvas: IT SIS feed creates or updates Canvas user independently
        loop Until user found or configured deadline reached
            Worker->>Canvas: Look up user by approved SIS ID mapping
            Canvas-->>Worker: User found or not yet available
        end
        alt Canvas user missing at deadline
            Worker->>DB: Create enrollment exception with owner
        else Canvas user found
            Worker->>DB: Recheck entitlement validity
            alt Entitlement reversed before enrollment
                Worker->>DB: Stop fulfillment and queue any required compensation
            else Entitlement remains valid
                Worker->>Canvas: Find existing enrollment, create only if absent
                Canvas-->>Worker: Enrollment result
                Worker->>Canvas: Verify correct section and enrollment state
                Canvas-->>Worker: Verified enrollment or unresolved failure
                Worker->>DB: Save outcome and recheck entitlement validity
                alt Reversal raced with enrollment
                    Worker->>DB: Queue verified access removal
                else Enrollment verified and activation ready
                    Worker->>DB: Mark access ready and queue notification
                    Worker-->>Learner: Course ready notification and link
                else Activation pending or enrollment unresolved
                    Worker->>DB: Keep distinct pending status or owned exception
                end
            end
        end
    end
```

### Ongoing operations and support

These workflows manage changes and failures after registration. They remain portal operational workflows even when authorized staff or external systems perform some steps. Reconciliation in workflow 9 is ongoing payment/access checking, rather than a project migration check.

#### 6. Refund, withdrawal or dispute

Refund state and course-access state remain separate. A pending, failed or partial refund does not automatically revoke access. Open disputes and lost disputes follow distinct approved rules.

```mermaid
sequenceDiagram
    autonumber
    actor Learner
    actor Staff as Support or Finance
    participant Portal
    participant Stripe
    participant DB as Portal database
    participant Worker
    participant Canvas
    Learner->>Portal: Request refund or withdrawal with fresh sign-in
    Portal->>DB: Save request for authorized staff review
    Staff->>Portal: Review policy and request evidence
    alt Finance authorizes a refund
        Staff->>Stripe: Initiate authorized refund
        Stripe->>Portal: Signed refund event
        Portal->>DB: Durably record event and queue processing
        Portal-->>Stripe: Acknowledge delivery
    else Approved withdrawal without refund
        Staff->>Portal: Record withdrawal with reason
        Portal->>DB: Save audited decision and queue processing
    end
    opt Payment dispute occurs independently
        Stripe->>Portal: Signed dispute-open or dispute-outcome event
        Portal->>DB: Durably record event and queue processing
        Portal-->>Stripe: Acknowledge delivery
    end
    Worker->>DB: Load events, entitlement and approved policy
    Worker->>Worker: Resolve current outcome despite duplicates or event order
    alt Policy preserves course access
        Worker->>DB: Update financial status and audit decision
    else Policy revokes course access
        Worker->>DB: Reverse entitlement and prevent further provisioning
        Worker->>Canvas: Apply approved non-deleting enrollment state if enrollment exists
        Canvas-->>Worker: Access removal result
        Worker->>Canvas: Verify access state
        Canvas-->>Worker: Verified result or unresolved failure
        Worker->>DB: Save result or create owned exception
        Worker->>DB: Recalculate lifecycle eligibility and queue workflow 8
    end
    Worker-->>Learner: Notify actual financial and access outcomes
```

#### 7. Staff-assisted transfer

Transfers require a defined recovery strategy across two Canvas sections. Keep original access until target enrollment is verified; if source removal fails, record temporary overlap as an exception rather than silently declaring success. Finance decides any price adjustment separately.

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Authorized support staff
    participant Portal
    participant DB as Portal database
    participant Worker
    participant Canvas
    actor Learner
    Staff->>Portal: Request transfer with target offering and reason
    Portal->>DB: Validate approval, dates, target capacity and source entitlement
    alt Target is ineligible or full
        Portal-->>Staff: Reject transfer and preserve original access
    else Transfer permitted
        Portal->>DB: Reserve target seat and persist transfer job linked to original order
        Worker->>DB: Claim transfer job and recheck validity
        Worker->>Canvas: Create or reuse target section enrollment
        Canvas-->>Worker: Target enrollment result
        Worker->>Canvas: Verify target enrollment
        Canvas-->>Worker: Verification result
        alt Target verification fails
            Worker->>DB: Record exception, reconcile uncertain writes before releasing target seat
            Portal-->>Staff: Original access retained, recovery required
        else Target verification succeeds
            Worker->>Canvas: End source access using approved enrollment state
            Canvas-->>Worker: Source access result
            Worker->>Canvas: Verify source access ended
            Canvas-->>Worker: Verification result
            alt Source access removal fails
                Worker->>DB: Record incomplete transfer and overlap exception
                Portal-->>Staff: Resolve source access before closing transfer
            else Source access removal succeeds
                Worker->>DB: Finalize source and target entitlements, seats and audit trail
                Worker->>DB: Queue Courtesy expiry recalculation
                Worker-->>Learner: Confirm transfer and target course access
            end
        end
    end
```

#### 8. Courtesy expiry, notices and disablement

Expiry is recalculated after entitlement changes and checked by a scheduled job. Existing CedarNet accounts are excluded. Protection against concurrent purchases must be part of the IT contract, not just a local check performed before a remote request.

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Lifecycle worker
    participant DB as Portal database
    participant Identity as IT identity service
    participant Canvas
    actor Learner
    Worker->>DB: Read identity sponsorship and eligible entitlements
    alt Existing CedarNet identity or no verified portal sponsorship
        Worker->>DB: Audit exclusion from Courtesy lifecycle
    else Portal-sponsored Courtesy identity
        Worker->>Worker: Calculate approved expiry including protected paid provisioning
        Worker->>Identity: Set expiry using idempotent versioned request
        Identity-->>Worker: Confirm expiry or report conflict
        Worker->>DB: Save confirmed result or owned exception
        opt Required notice is due
            Worker-->>Learner: Expiry date, record-download instructions and support contact
            Worker->>DB: Record notice delivery outcome
        end
        opt Confirmed expiry is reached
            Worker->>DB: Lock lifecycle decision and re-read current entitlement version
            Worker->>Identity: Read current account and sponsorship status
            Identity-->>Worker: Current identity status and version
            alt New entitlement, extension, conflict or unmet notice rule
                Worker->>DB: Cancel stale disable decision and recalculate or escalate
            else Disablement remains eligible
                Worker->>Identity: Conditionally disable sponsored account with expected version
                Identity-->>Worker: Confirm disablement or reject stale request
                alt Disablement confirmed
                    Worker->>Canvas: Apply approved expiry access policy
                    Canvas-->>Worker: Access result
                    Worker->>Canvas: Verify required access changes
                    Canvas-->>Worker: Verified state or unresolved failure
                    Worker->>DB: Save lifecycle outcome or access exception
                    Worker-->>Learner: Confirm account expiry and portal record-access options
                else Rejected or outcome uncertain
                    Worker->>DB: Reconcile account state and create exception if needed
                end
            end
        end
    end
    Note over Worker,Identity: New purchases and disablement need an agreed concurrency guard and reinstatement path
    Note over Identity,Canvas: Record retention and eventual disposition remain IT-controlled
```

#### 9. Reconciliation and exception recovery

Reconciliation finds missing or inconsistent outcomes without blindly repeating external writes. Support uses scoped actions and runbooks; manual enrollment is performed by Canvas Administration when the runbook requires it.

```mermaid
sequenceDiagram
    autonumber
    participant Worker
    participant DB as Portal database
    participant Stripe
    participant Identity as IT identity service
    participant Canvas
    actor Staff as Authorized support staff
    participant Portal
    Worker->>DB: Read unresolved sessions, jobs and access obligations
    Worker->>Stripe: Retrieve relevant payment/session/refund state
    Stripe-->>Worker: Authoritative financial state
    Worker->>Identity: Retrieve relevant provisioning and account state
    Identity-->>Worker: Authoritative identity state
    Worker->>Canvas: Retrieve relevant user and enrollment state
    Canvas-->>Worker: Authoritative learning-access state
    Worker->>DB: Record discrepancies and assign owned exceptions
    Staff->>Portal: Open exception evidence and runbook
    Portal->>DB: Read evidence, attempts and permitted actions
    Portal-->>Staff: Show current state and proposed resolution
    Staff->>Portal: Resolve or retry with reason
    Portal->>Portal: Authorize action and validate current state
    Portal->>DB: Save audit event and queue idempotent recovery job
    Worker->>DB: Claim job and recheck eligibility
    Worker->>Worker: Execute relevant workflow with authoritative verification
    Worker->>DB: Save verified outcome or keep exception open
    Portal-->>Staff: Resolution evidence or next required action
```

## Project migration and cutover

This section describes the project team's transition process, not a portal feature or automated portal workflow. It applies only if replacing an existing course platform is confirmed in scope and runs alongside portal development.

Here, **migrate** means transferring or rebuilding existing lessons, files, videos, quizzes and assignments in Canvas, then verifying that they work. Learner accounts, grades, completion records and certificates require separate decisions about transfer or preservation; moving course content does not automatically move those records. **Cutover** means switching the approved learner entry points to the new portal and Canvas setup.

### 10. Course migration and cutover

Related milestone: parallel migration workstream. Course-owner QA and cutover approval precede learner redirection or source-platform retirement. Publishing offering mappings uses portal workflow 1; content migration and launch approval remain project responsibilities.

```mermaid
sequenceDiagram
    autonumber
    actor Team as Migration team
    participant Source as Existing course platform
    participant Canvas
    actor Owner as Course owner
    actor Operations as Program Operations
    participant Portal
    Team->>Source: Inventory content, active learners, records and certificates
    Source-->>Team: Authorized exports and migration inventory
    Team->>Canvas: Migrate representative course to approved target
    Team->>Owner: Request content, access and record validation
    Owner->>Canvas: Check migrated course and representative learner access
    Owner-->>Team: QA evidence and defects
    alt QA fails or records/access continuity is unresolved
        Team->>Canvas: Repair migration and repeat validation
        Note over Source,Portal: Keep existing learner entry points available
    else QA passes and portal integration is ready
        Team->>Operations: Present cutover, active-learner continuity and rollback plan
        Operations-->>Team: Approve cutover with required owners
        Team->>Portal: Publish verified offering mappings
        Operations->>Source: Apply approved learner redirection and notices
        Team->>Canvas: Verify post-cutover access and records
        opt Post-cutover validation fails
            Team->>Portal: Suspend affected new registrations
            Operations->>Source: Restore approved entry points
            Team->>Operations: Resolve paid orders and learner access under rollback runbook
        end
        Note over Source,Operations: Retire source only after continuity and retention gates pass
    end
```

## Delivery sequence

Milestones are dependency based, not promised dates. Start content migration and sandbox development in parallel. The IT identity contract is the principal integration dependency.

### M0 — Establish decisions and contracts

Owners: portal lead, Program Operations, IT Identity, Canvas Administration, Finance and Security.

Deliver the domain glossary; ADRs for build-versus-buy, UI library, backend/hosting, authentication and job persistence; identity API mock and versioned contract; approved Canvas mapping; and a decision register with owner/due date (maintained in [docs/decision-register.md](decision-register.md)). Confirm approval, capacity, tax, refund/dispute, age, retention, expiry and recovery policies.

Identity contract covers `findIdentity`, asynchronous Courtesy provisioning/status, setting expiry earlier or later, identity status, disablement and reinstatement. Include idempotency, error taxonomy, ambiguous-match handling, least-data responses and proof of portal sponsorship. Permanent deletion is not a portal operation.

Exit: mocks and isolated environments permit development; every production blocker has an owner. Policy decisions may remain open for sandbox work.

### M1 — Foundation and interface baseline

Create the application, migrations, environment separation, server authorization, shared MUI theme and CI for lint/type/build checks. Select a maintained authentication solution supporting approved email challenge, passkeys and university SSO; staff always use SSO/MFA. Implement record-level isolation and audit logging from the first staff write.

Deliver the four representative screens above with mock data, sign-in/linking spike and seeded offerings. Pin dependency versions after compatibility checks.

Exit: approved visual baseline; browser checks cover learner/staff access isolation, keyboard flow and mobile layout. No custom form, menu or dialog interaction replaces an available library component without a documented reason.

### M2 — Catalog, offerings and approvals

Implement draft/publish lifecycle, categories/search, dated offerings, immutable price history, Canvas mapping validation and approval expiry. Publish only when required data, active price and mapped section are valid. Validate dates deliberately rather than assuming every Canvas date must equal an offering date.

Deliver learner requests, staff approval queue and decision notices. Audit price, mapping, capacity, publication and approval changes.

Exit: authorized staff publish and manage an offering without code changes; approval-gated checkout is denied until a valid approval exists. Publishing a new price preserves existing Checkout Sessions.

### M3 — Sandbox checkout and durable fulfillment

Perform identity matching/link proof before payment, then atomically reserve capacity. Create Stripe Products/Prices and Checkout Sessions server-side using idempotency keys. Persist reservation-to-session mapping; recover interrupted session creation without leaking seats.

Verify webhook signatures against the raw request body. Commit the received event and durable work atomically, acknowledge promptly and fulfill only after authoritative payment confirmation. Use unique Stripe event IDs plus session/operation constraints. The return page reads server status.

Reconcile expired and paid sessions before releasing capacity; do not release merely because local time elapsed while Stripe outcome is unknown. Disable automatic Checkout recovery unless recovered sessions repeat availability/approval checks. Retry uncertain network outcomes using the same operation key.

Exit: concurrent checkout for the last seat cannot oversell; duplicate/out-of-order deliveries and worker crashes do not duplicate orders or jobs; expired sessions free seats safely. Validate behavior against [Stripe fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) during implementation.

### M4 — Identity, Canvas and learner status

Implement identity and Canvas adapters against mocks, then approved test services. Request a Courtesy identity only for a proved no-match outcome. Persist request ID and sponsorship; handle asynchronous activation separately from Canvas enrollment.

Look up Canvas users by confirmed SIS mapping, retry with bounded backoff and raise owned exceptions at the configured deadline. Verify an existing enrollment before retrying uncertain writes. Recheck entitlement validity before and after external operations; reversal during provisioning triggers compensating access removal without duplicate identity creation.

IT sends credential activation messages. The portal sends order/access messages and shows payment, activation and enrollment status distinctly. A ready-course link requires the appropriate verified access/activation status.

Exit: one paid test order produces one verified enrollment, delayed SIS and activation are visible, and unrecoverable failures enter an owned queue. Existing CedarNet accounts are never modified.

### M5 — Reversals, lifecycle and support operations

Implement approved full/partial refund and dispute rules, staff-assisted withdrawals/transfers, reconciliation and safe job retry. Transfers reserve target capacity and coordinate enrollment changes as a recoverable workflow; never discard original access without a recovery path.

Calculate Courtesy expiry from approved eligible entitlements, including protected paid provisioning obligations. Use compressed dates in tests. Before disablement, re-read current entitlements and sponsorship, detect concurrent purchases and conflicting IT updates, send required notice and retain an audit record. IT enforces the sponsorship boundary independently. Existing CedarNet identities have no portal lifecycle.

Provide staff roles for approver, catalog manager, support, Finance and IT/Canvas administrator. Sensitive retries and lifecycle actions require reason, preview and scoped authorization. Support must resolve normal exceptions without direct database edits.

Exit: test reversals preserve records, recalculate expiry correctly and cannot disable reused identities. Retention disposition remains IT-controlled. Learner records remain accessible through the approved post-disablement authentication method.

### M6 — Operational readiness and closed pilot

Deliver dashboards/alerts for webhook failures, queue age, provisioning delays and unowned exceptions; daily paid-versus-enrolled and sponsorship reconciliation; secret rotation, backup/restore and deployment runbooks. Finance/Security confirm payment compliance and privacy requirements rather than inferring them from hosted Checkout alone.

Run one low-risk offering with a small cohort after production gates pass. Exercise lifecycle expiry in the isolated environment; monitor the real pilot through offering completion before broader release.

Exit: all criteria below pass and Program Operations, IT Identity, Canvas Administration and Finance approve results.

### Requested features by milestone

These placements are proposals, not commitments. Each feature starts only after its F-series decisions have owners.

- **M2+ (catalog extensions):**
  - staff-curated collections
  - learner saved courses
  - pathway browse and follow, without progress
  - customizable sales pages, after brand approval (O4)
- **M3+:** coupons, after Finance discount policy (F7).
- **M4+:**
  - pathway progress, once completion evidence (R2) is approved
  - enrollment dashboard on verified enrollments
- **M5:** user exports, after privacy approval (F9).
- **M6:** sales dashboard, reconciled to Stripe.
- **After the pilot:**
  - memberships (F6)
  - bulk enrollment and organizational purchasing (F8)
  - any priced pathway or collection bundles (F4)

  These revisit first-release deferrals and need sponsor approval.

### Parallel workstream — Existing course migration

If Teachable or another catalog is being replaced, begin inventory and representative-course migration during M0. Verify this scope and staffing with Program Operations; older planning dates are not release commitments. Inventory content, learner records, certificates, active enrollments, rights and dependencies. Map offerings to Canvas, migrate representative content and conduct course-owner QA independently of portal integration.

Do not redirect learners or retire the source platform until content, access, records and support continuity are verified. Preserve a rollback path and distinguish historical-record migration from new paid enrollment.

### Course schedule types

Support two explicit offering types: cohort courses have scheduled start/end dates; learn-on-your-own courses start anytime and have no cohort dates. Keep course type separate from delivery format, enrollment windows and access-duration rules. Catalog cards, spotlight, course details and learner records must use the appropriate schedule label. Staff choose the type before entering dates; API and database validation reject missing cohort dates or cohort dates on an anytime course.

## Verification and release gates

| Area | Required evidence |
| --- | --- |
| Interface | Brand review; desktop/mobile screenshots; functional verification of changed workflows |
| Accessibility | Required in each UI review using the README review/test checklist; keyboard/focus, names/labels/semantics, contrast, targets, reflow/zoom and announcements; automated scan plus manual screen-reader review of registration, sign-in, errors, dialogs and staff tables before release; record unresolved findings and unperformed checks |
| Authorization | Learner cannot read another learner's records; staff scopes enforced server-side; SSO linking and recovery cannot claim another identity |
| Payments/capacity | Success, decline, abandoned/expired checkout, final-seat concurrency, duplicate/out-of-order webhook, crash/replay and unavailable Stripe reconciliation |
| Provisioning | Ambiguous identities blocked before payment; existing identity reused safely; asynchronous IT/SIS delays; uncertain enrollment response and retry; reversal during provisioning |
| Reversals/lifecycle | Full/partial/failed refund, dispute outcomes, transfer recovery, new purchase near expiry, notice rules, protected provisioning and existing-identity immunity |
| Operations | Restore drill, job recovery, tested alerts, owner assignment, Finance reconciliation and manual-enrollment procedure |
| Migration | Course-owner content/access/record QA and explicit source-platform cutover approval, if applicable |

Pilot metrics: every paid learner is enrolled within the approved deadline or has an owned exception; no duplicate identities/enrollments; no unauthorized identity changes; no unexplained financial or access reconciliation differences; all tested reversals follow approved policy; support resolves normal exceptions through the staff interface. An owned exception is an escalation success, not an enrollment success—report these rates separately.

Production blockers: approved identity/authentication contract, live SIS timing/mapping, lifecycle and notice rules, Finance payment/refund/tax rules, hosting/backup/retention ownership, accessibility acceptance and pilot course readiness. Sandbox uses synthetic data, Stripe test mode and isolated Canvas/identity environments; it cannot touch production identities or enrollments.

Rollback: unpublish affected offerings and prevent new Checkout Sessions, while reconciling existing sessions and processing already-paid orders. Keep webhooks and workers running; route exceptions to designated staff. Canvas Administration handles controlled manual enrollment. Never bulk-delete learner, identity, payment or learning records as rollback.

## GitHub execution plan

Create GitHub issues only when the user explicitly requests them. Prepare planning updates locally; publish or synchronize them to the tracker when authorized. For an authorized planning issue, use the existing `documentation` label. Use canonical triage labels only when their meanings apply; missing labels are not a reason to invent alternate names. The initial plan needs sponsor decisions and is not a fully specified `ready-for-agent` task.

When issue creation is explicitly requested and contracts are concrete, split milestones into implementation issues. Each issue must state scope/exclusions, prerequisites, relevant ADR/contract, affected UI states, acceptance criteria and validation evidence. Record dependencies explicitly. Start with M0 decisions and the M1 interface spike; do not mark integration work ready while its contract is unresolved. When tracker updates are authorized, synchronize the repository copy and planning issue.
