# M0 decision register

Required by milestone M0 of the [implementation plan](implementation-plan.md#m0--establish-decisions-and-contracts): every decision needs an owner and a due date before integration work depends on it. This register is the single list. Details live in the linked ADR or plan section.

Last updated: October 7, 2026. Summary: 40 decisions: 7 decided, 5 proposed, 28 open. A3 and F4 count as open because parts of them are undecided, although other parts are proposed or decided.

## How to use this register

- **Status:**
  - **Decided:** recorded in an ADR or the plan's Policy decisions table.
  - **Proposed:** in use or recommended, but not yet formally approved.
  - **Open:** no decision yet.
- **Due date:** set by the owner. A blank date means none is agreed yet. Dates are not release commitments unless the sponsor says so.
- **Blocks:** the earliest work that cannot proceed without the decision. The plan allows policy decisions to stay open for sandbox work; "Production" means the decision is needed before a pilot or any real learner data.
- **When a decision is made:**
  1. Change its status.
  2. Add the date and a one-line summary.
  3. Link the record: an ADR for architecture, or the plan's Policy decisions table for policy.
  4. Update the summary counts above.

  Never delete rows; mark superseded decisions instead.

## Architecture (M0 requires an ADR for each)

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Build vs buy: custom portal or Canvas Catalog | **Decided** Oct 6, 2026: custom portal; Catalog does not fit requirements (specific gaps still to be listed) | Sponsor, Program Operations | n/a | n/a | [ADR 0003](adr/0003-custom-portal-not-canvas-catalog.md) |
| A2 | UI library: MUI | **Proposed**: used by the prototype | Portal lead | | M1 exit | [Plan: interface requirement](implementation-plan.md#interface-requirement-established-open-source-components) |
| A3 | Backend and hosting: Next.js, NestJS and PostgreSQL proposed, subject to IT checks; hosting provider undecided | **Proposed** (framework) / **Open** (hosting) | Portal lead, IT | | Any shared or hosted environment; production | [Plan: architecture](implementation-plan.md#architecture-and-implementation-boundaries) |
| A4 | Authentication provider: learner email code, passkeys and university SSO; staff on SSO with MFA; no custom authentication | **Open**. Interim: mock staff sign-in with real roles, built so SSO plugs in later | Security, IT Identity | | M1 exit (sign-in spike); production | [Plan: M1](implementation-plan.md#m1--foundation-and-interface-baseline), [ADR 0004](adr/0004-staff-roles-mock-sign-in.md) |
| A5 | Job persistence and runtime: database-backed durable queue | **Proposed**: built in the prototype | Portal lead | | M3 | [ADR 0001](adr/0001-local-prototype.md) (prototype only) |
| A6 | Data access and migrations: Prisma ORM | **Decided** Oct 6, 2026 | Portal lead | n/a | n/a | [ADR 0002](adr/0002-prisma-orm.md) |

## Contracts

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Identity API contract and mock. Operations: find identity, provision a Courtesy account and report status, set expiry earlier or later, identity status, disable, reinstate. Requirements: idempotency, error taxonomy, ambiguous-match handling, least-data responses, proof of portal sponsorship. Principal integration dependency. | **Open** | IT Identity | | M3 (identity checks before payment), M4 | [Plan: M0](implementation-plan.md#m0--establish-decisions-and-contracts) |
| C2 | Approved Canvas mapping: course and section mappings, SIS user mapping, enrollment permissions | **Open** | Canvas Administration | | M2 exit (mapping validation before publish), M4; real course links | [Plan: M2](implementation-plan.md#m2--catalog-offerings-and-approvals) |
| C3 | Decision register with owners and due dates | **Proposed**: this document; due dates still blank | Portal lead | | M0 exit | This file |

## Policies (M0: approval, capacity, tax, refund/dispute, age, retention, expiry, recovery)

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Approval validity and repeat requests | **Decided** Oct 6, 2026: valid 7 days, staff-adjustable per offering; declined or lapsed learners may request again | Program Operations | n/a | n/a | [Plan: Policy decisions](implementation-plan.md#policy-decisions) |
| P2 | Enrollment window | **Decided** Oct 6, 2026: Scheduled courses close 7 days after the start date, staff-adjustable; Self-paced never closes | Program Operations | n/a | n/a | [Plan: Policy decisions](implementation-plan.md#policy-decisions) |
| P3 | Capacity and seat holds: hold length versus Stripe session expiry (30 minutes to 24 hours); whether delayed payment methods are allowed (recommendation: disabled for the pilot) | **Open** (atomic allocation itself is settled) | Finance, Program Operations | | M3 | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| P4 | Tax treatment | **Open** | Finance | | Production (pilot checkout) | [Plan: M0](implementation-plan.md#m0--establish-decisions-and-contracts) |
| P5 | Refunds and disputes: full, partial, pending and failed refunds; which revoke access; dispute opened versus dispute lost; refund during pending provisioning | **Open** | Finance, Program Operations | | M5; production | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| P6 | Age restrictions | **Open** | Registrar, Legal | | Production | [Plan: scope and ownership](implementation-plan.md#scope-and-ownership) |
| P7 | Retention and disposition of learner, identity and payment records | **Open** | IT, Registrar, Legal | | Production | [Plan: scope and ownership](implementation-plan.md#scope-and-ownership) |
| P8 | Courtesy account expiry calculation, including paid provisioning still in progress | **Open** | IT Identity | | M5 | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| P9 | Account recovery and linking: email codes bound to the requesting browser, attempt limits, linking rules | **Open** | Security | | M1 sign-in spike; production | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |

## Corrections to the source plan

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Withdrawal timing: a 14-day warning conflicts with a 7-day grace period for immediate withdrawal; choose an expedited notice or a longer grace | **Open** | Program Operations, IT Identity | | M5 | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| R2 | Completion evidence: an offering ending is not completion; choose the approved source of completion records | **Open** | Registrar, Canvas Administration | | M4/M5; production | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| R3 | Canvas access removal: which enrollment state to use instead of deleting enrollments | **Open** | Canvas Administration | | M4/M5 | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |
| R4 | SIS timing: verify the 2-hour sync and 8-hour escalation assumptions; approve the learner-facing expectation | **Open** | IT Identity | | M4 | [Plan: corrections](implementation-plan.md#corrections-and-decisions-required-from-v2) |

## Other decisions the plan defers to owners

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| O1 | Accessibility standard: WCAG 2.1 AA, or a newer institutional requirement | **Open** | Security, Registrar, Legal | | Release gate | [Plan: visual conventions](implementation-plan.md#visual-and-interaction-conventions) |
| O2 | Course migration scope: whether Teachable or another platform is being replaced, and with what staffing | **Open** | Program Operations | | Parallel migration workstream (meant to start in M0) | [Plan: migration](implementation-plan.md#project-migration-and-cutover) |
| O3 | Course launch link | **Decided** Oct 6, 2026, for the prototype: "Open course in Canvas" after enrollment completes; real links depend on C2 | Program Operations, Canvas Administration | n/a | n/a | [Plan: Policy decisions](implementation-plan.md#policy-decisions) |
| O4 | Brand assets: approve Figtree as the Proxima Nova stand-in, plus colors and copy | **Open** | Cedarville Marketing | | M1 exit (approved visual baseline) | [UI specification](prototype/ui-specification.md#typography) |
| O5 | Staff roles and permissions: the five M5 roles plus a Staff administrator role, and the role-to-scope mapping (for example, Finance read-only until M5; Support and IT/Canvas both recover exceptions) | **Proposed**: built in the prototype Oct 7, 2026 | Program Operations, Security | | M5; production | [ADR 0004](adr/0004-staff-roles-mock-sign-in.md) |
| O6 | Learner account deactivation: who may deactivate (Support in the prototype), required reason, and the effect (blocks sign-in and learner actions; paid enrollments continue; Canvas access unchanged) | **Proposed**: built in the prototype Oct 7, 2026 | Program Operations, Security, Registrar | | Production (pairs with P7 retention and M5 lifecycle) | [UI specification](prototype/ui-specification.md#staff-staff) |

## Product features

Requested October 7, 2026; see the plan's [requested feature additions](implementation-plan.md#requested-feature-additions).

| ID | Decision | Status | Owner | Due | Blocks | Record |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Dashboards: which enrollment and sales metrics, who sees sales figures (new `reports:sales` scope), and how sales reconcile to Stripe. Proposed metrics follow the Teachable comparison: date and product filters, refunds and failed payments, CSV export; MRR and churn only with memberships. A sample dashboard is built in the prototype for review (Finance holds `reports:sales`) | **Open** | Program Operations, Finance | | Enrollment: M4. Sales: M6 | [Plan: dashboards](implementation-plan.md#enrollment-sales-and-completion-dashboards) |
| F2 | Sales pages: who edits and approves content; allowed content blocks; testimonial consent. **Decided Oct 7, 2026:** add a Content editor staff role (scope `content:write`, reserved until the editor exists) | **Open** (role decided; content approval, blocks and consent still open) | Marketing, Program Operations | | Sales pages (after O4) | [Plan: sales pages](implementation-plan.md#customizable-sales-pages) |
| F3 | Collections: staff-curated only, or also learner-created? Recommendation: staff-only collections plus a private learner **Saved courses** list; reconsider shareable learner lists later. **Decided Oct 7, 2026:** staff-curated collections only, plus a private learner Saved courses list, as built in the prototype | **Decided** | Program Operations | | Collections, saved courses | [Plan: collections](implementation-plan.md#collections) |
| F4 | Pathways: does following one register or charge; prerequisites or a recommended order; bundled pricing (a deferred "bundle"); certificates. **Decided Oct 7, 2026:** following is free and registers nothing; the order is recommended, not a prerequisite; each course is registered and paid separately (as built) | **Decided** (follow and order) / **Open** (bundled pricing, certificates) | Program Operations, Registrar, Finance | | Pathways | [Plan: pathways](implementation-plan.md#pathways) |
| F5 | Partner or credential collections (for example ACSI): eligibility, partner pricing and reporting obligations | **Open** | Program Operations | | ACSI collection | [Plan: collections](implementation-plan.md#collections) |
| F6 | Memberships: what access a membership grants; price, trials, proration, cancellation, refunds and tax; lapse handling; interaction with Courtesy expiry (P8) | **Open** | Finance, Program Operations, IT Identity | | Memberships (after the pilot) | [Plan: memberships](implementation-plan.md#memberships) |
| F7 | Coupons: who creates them, discount limits, stacking, 100% discounts and their records, abuse controls | **Open** | Finance | | Coupons (M3+) | [Plan: coupons](implementation-plan.md#coupons) |
| F8 | Bulk enrollment: who may use it, invoice versus card, organizational seat reservations, Courtesy provisioning at volume, notifications | **Open** | Program Operations, Finance, IT Identity | | Bulk enrollment (after M4) | [Plan: bulk enrollment](implementation-plan.md#bulk-enrollment) |
| F9 | User exports: who may export, which datasets and fields, handling and retention of files | **Open** | Security, Registrar | | Exports (M5) | [Plan: user exports](implementation-plan.md#user-exports) |
| F10 | Release placement: whether any requested feature moves into the first release, overriding the deferral of subscriptions, group purchasing and bundles | **Open** | Sponsor | | Scope of the first release | [Plan: scope](implementation-plan.md#scope-and-ownership) |
| F11 | Completion dashboard (after the Canvas connection): the completion signal (Canvas course completion, module requirements or grades), refresh method (scheduled pull or Canvas events), metrics, and who may see learner-level progress (for example instructors) | **Open** | Program Operations, Canvas Administration, Registrar | | Completion dashboard (M4+, after R2) | [Plan: dashboards](implementation-plan.md#enrollment-sales-and-completion-dashboards) |
| F12 | Explore tab picks: who chooses the featured courses, pathways and collections? **Decided Oct 7, 2026:** both catalog managers (`catalog:write`) and content editors (`content:write`), saved as one audited change | **Decided** | Program Operations, Marketing | | Explore tab | [Plan: Explore landing tab](implementation-plan.md#explore-landing-tab) |

## Critical path

These open items block work beyond simulation:

- **C1** identity contract and **C2** Canvas mapping: real integration in M3 and M4.
- **A4** authentication and **P9** recovery: the M1 sign-in spike.
- **A3** hosting: any shared environment.
- **P3** seat holds: sandbox checkout.

Nearly all are owned outside engineering, so schedule them first.
