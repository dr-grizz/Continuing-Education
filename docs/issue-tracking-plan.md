# GitHub issue tracking rollout plan

Proposed October 21, 2026. Use GitHub Issues for actionable work, decisions, dependencies and acceptance evidence. Keep architecture, policy and testing procedures in repository documents and link to them from issues. This is a creation plan; it does not publish issues, labels, milestones or tracker edits.

## Current tracker and starting point

- Issue [#1](https://github.com/dr-grizz/Continuing-Education/issues/1), the original implementation plan/UI baseline, is closed.
- Issue [#2](https://github.com/dr-grizz/Continuing-Education/issues/2), the Prisma adoption, is closed.
- No open issues or GitHub milestones exist at this checkpoint. The repository has default labels, including bug, enhancement, documentation, accessibility, question and wontfix.
- PRs #17 and #18 delivered the request-driven demo, course images/portal overrides and testing documents. Do not recreate those features as unfinished implementation tickets.
- The remaining-work baseline is [next steps](next-steps.md). Current runtime behavior follows [ADR 0008](adr/0008-request-driven-demo.md), not older descriptions of an always-running worker.

Keep closed issues as history. Create a new **Continuing Education delivery roadmap** issue, linking the current plan and child issues rather than copying the entire implementation document into its body.

## Tracking structure

### Roadmap issue

Use the roadmap for a short current checkpoint, linked workstreams, a checklist of child issues, dependencies that cross workstreams and the next few tasks to pick up. Include a compact completed-work summary with links to merged PRs. Individual implementation details and discussions belong in the child issues.

### Milestones

Use outcomes without invented due dates. These are remaining-work views of the existing M0–M6 plan, not replacements for its history.

| Proposed milestone            | Exit outcome                                                                                                                                                                                      | Existing plan alignment                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Canvas mapping and visibility | Listed/unlisted rules, mapping status, reviewed existing-offering links and a recorded three-course acceptance run work without changing Canvas or overwriting portal fields.                     | Remaining M2 and source-read portion of M4 |
| Shared demo and test baseline | Portable web/API packaging, approved restricted demo access and recorded functional/security/accessibility results support shared synthetic-data review. No real learner provisioning is implied. | Remaining M1/M3 and preparation for M6     |
| Verified learner access       | Approved login/identity contracts, trusted Canvas identity matching and one confirmed payment producing one verified enrollment, with recovery.                                                   | M0 decisions and remaining M4              |
| Closed pilot readiness        | Applicable security/accessibility/operations/policy gates and a low-risk offering have named owners and acceptance evidence.                                                                      | Remaining M5/M6                            |

Work can proceed in parallel. A shared synthetic-data demo can use an approved access gate while real learner identity decisions are resolved; it must not be mistaken for a production learner deployment.

### Labels and readiness

Use existing type labels: `enhancement`, `bug`, `documentation`, `question` and `accessibility`. Add the missing canonical triage labels already specified in [repository guidance](agents/triage-labels.md): `needs-triage`, `needs-info`, `ready-for-agent` and `ready-for-human`. Retain the existing `wontfix` label.

Use one active triage label per issue. Start with `needs-triage`; promote only when scope, acceptance and dependencies are clear. Use `needs-info` for unresolved external decisions. A ready human review can use `ready-for-human`; a scoped implementation can use `ready-for-agent`. Readiness does not itself authorize deployment, external writes or account provisioning.

Put Priority (P1/P2), owner and dependencies in the issue body initially. Add area/priority labels or a GitHub Project only when the backlog needs them; Issues and Milestones are enough to start. Do not create duplicate open/closed status labels.

Use native sub-issues/dependencies when available. Otherwise, put `Part of #<roadmap>` and `Blocked by #<issue>` references in child bodies and link them from the roadmap checklist. The temporary T identifiers below are drafting references, not proposed GitHub issue numbers.

## First publication batch

Create **one roadmap plus these ten issues**. Each title represents a concrete outcome or a bounded decision. Proposed owners are responsibility groups; assign a named GitHub user when agreed or when they pick up the task. Do not invent assignees or delivery dates.

| Draft ID | Proposed issue title                                                             | Priority | Milestone                     | Dependency or initial readiness                                                           |
| -------- | -------------------------------------------------------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| T01      | Add independent listed and unlisted offering visibility                          | P1       | Canvas mapping and visibility | Implemented locally; verification recorded; manual screen-reader acceptance pending                                          |
| T02      | Show verified Canvas mapping status and allow manual recheck                     | P1       | Canvas mapping and visibility | Source-status slice can proceed; purchase-blocking policy excluded                        |
| T03      | Link a Canvas course to an existing offering through an explicit reviewed action | P1       | Canvas mapping and visibility | Scope/review the link workflow before ready-for-agent                                     |
| T04      | Verify and recover interrupted Stripe Checkout creation                          | P1       | Shared demo and test baseline | Existing sandbox/recovery foundation; use provider mocks                                  |
| T05      | Execute the functional and security test baseline and record findings            | P1       | Shared demo and test baseline | Can start on the current synthetic demo; missing live prerequisites recorded as Blocked   |
| T06      | Complete the manual screen-reader review and retest findings                     | P1       | Shared demo and test baseline | Ready-for-human once reviewer/browser are agreed                                          |
| T07      | Decide future guest pre-account sign-in and recovery                    | P1       | Verified learner access       | needs-info; IT Identity and Security decision                                             |
| T08      | Agree the Canvas identity matching and paid provisioning contract                | P1       | Verified learner access       | needs-info; coordinate with T07 and Canvas Administration                                 |
| T09      | Decide the hosted demo target access gate and operational owner                  | P1       | Shared demo and test baseline | needs-info; IT/portal lead/Security decision                                              |
| T10      | Package the demo web and API into one reproducible container                     | P2       | Shared demo and test baseline | Portable local packaging can start; exposure/deployment waits for T09 and later hardening |

## Issue specifications for the first batch

### T01 Independent offering visibility

**Status:** implemented locally October 21, 2026 on `codex/offering-visibility`; see [verification](testing/offering-visibility-verification.md). Manual screen-reader acceptance remains pending. No GitHub issue has been created.

**Original problem:** portal publication did not support a published course that is accessible by direct link but excluded from public discovery.

**Scope:** add listed/unlisted preference separately from publication; use an additive migration; provide staff Settings controls and apply visibility server-side to browsing/search, Explore, collections/pathways, related responses and counts. New imported drafts remain unpublished. Existing offerings retain their current discovery behavior.

**Acceptance:** published/listed appears in discovery; published/unlisted can be opened and registered through its direct URL under the existing rules; draft/unpublished blocks new registrations. Republish retains listing preference. Existing paid access and all staff-owned edits survive. Canvas state is unchanged. Direct links are shareable, not private authorization.

**Validation:** API/direct-link/discovery coverage, migration preservation, stale-version/audit behavior, keyboard/axe checks and the relevant future visibility case promoted into the current test set. Update API/domain/plan documentation with the implementation.

**Owner:** portal development. **Reference:** [next step 1A](next-steps.md#a-add-listed-and-unlisted-visibility).

### T02 Mapping status and manual verification

**Problem:** a course missing from published-only discovery may be unpublished, moved, inaccessible or temporarily unavailable; absence cannot explain the cause.

**Scope:** read mapped course IDs under the existing staff authorization, verify account boundary, retain last verified state/time and show a manual recheck action. Model observed unavailable/out-of-scope state separately from inconclusive permission/network failures.

**Acceptance:** successful, unpublished/moved, denied, not found and timeout outcomes are understandable. An inconclusive result does not claim deletion. Last good metadata, offerings, payment history and learner records remain. Recheck recovery does not silently publish, remap or overwrite fields. No Canvas write occurs.

**Exclusions:** do not introduce purchase-blocking or automatic unpublication rules before agreeing freshness, ambiguity, reservations, existing Checkout sessions and paid-access policy. Create that policy/implementation follow-up when the status slice is concrete.

**Validation:** provider mocks for status/account changes, 403/404/timeouts, revoked grants and recovery; portal/API permission, keyboard/error-state checks. Update mapping-health test cases with implemented rules.

**Owner:** portal development with Canvas Administration. **Reference:** [next step 1B](next-steps.md#b-add-mapping-availability-checks).

### T03 Reviewed existing-offering link

**Problem:** import rejects a course already linked manually, but there is no supported action to deliberately associate an existing offering with a source course.

**Scope:** show both records, require explicit selection/confirmation and enforce the same installation/course/offering uniqueness rules. Preserve the existing offering's content, terms, publication and image choice.

**Acceptance:** one intended stable mapping is created once; retries/concurrent attempts cannot duplicate or replace links. Conflicting ownership is explained before committing. No match is inferred from a title. Normal offering editing cannot mutate the established mapping.

**Exclusions:** remapping offerings with fulfilled enrollments, additional variants and bulk automatic adoption remain deferred. Agree treatment of active records before allowing them in this action.

**Validation:** mocked/API conflict, stale/retry/atomicity and preservation checks; UI confirmation and keyboard/accessibility review. Record approved pilot fixture IDs.

**Owner:** portal development and Canvas Administration. **Reference:** [next step 1C](next-steps.md#c-review-existing-offering-conflicts-and-run-a-small-pilot).

### T04 Interrupted Checkout creation recovery

**Problem:** Stripe calls currently occur inside a database transaction; a provider-created Checkout session can outlive a failed transaction before the portal saves its ID.

**Scope:** add a deterministic failure fixture at that boundary; retain/recover the idempotent external operation before a retry, changing transaction boundaries if needed. Preserve quoted prices, reservation eligibility and current payment/webhook behavior.

**Acceptance:** provider success followed by local rollback/timeout can be reconciled without a second independent Checkout attempt or lost payment. Retry and later webhook/reconciliation converge on the same purchase. No duplicate order/fulfillment or incorrect seat release occurs; uncertainty is visible for staff recovery.

**Validation:** disposable database and mocked Stripe adapter, concurrent/retry/out-of-order cases. Existing missed-webhook and delayed-simulation tests remain regression coverage; do not reopen them as unimplemented features. A live sandbox drill is separate evidence.

**Owner:** portal development with Finance/Program Operations for unresolved policy. **Reference:** [payment recovery work](next-steps.md#2-verify-payment-and-request-driven-recovery).

### T05 Recorded functional and security baseline

**Problem:** the test specifications exist, but their new run record starts Not run/Deferred and needs actual acceptance evidence.

**Scope:** execute an agreed current-demo subset first, then applicable remaining P0 and affected P1 cases. Use synthetic users/disposable environments, approved live read/sandbox fixtures where appropriate, and the existing commands. Record exact assertions and exclusions.

**Acceptance:** commit/environment/IDs and case results are recorded; failures and blocked prerequisites remain visible; security checks distinguish mock learner impersonation from the protected Canvas staff flow. No functional pass is presented as security certification or real Canvas enrollment. Record findings, owners and retest needs; creating further bug issues is a subsequent triage step.

**Exclusions:** no active attack against external Canvas/SSO/Stripe services, no live identity/enrollment changes and no broad load campaign. This issue does not claim to implement real learner authentication.

**Validation:** [functional cases](testing/use-cases.md), [security cases](testing/security-test-cases.md) and [run record](testing/test-run-template.md), with sanitized evidence. Relate genuine failures to follow-up issues once triaged.

**Owner:** portal lead/tester. Block only affected cases while T07/T08/T09 decisions are pending, rather than labeling an entire mixed run successful.

### T06 Manual screen-reader acceptance

**Problem:** automated accessibility checks do not verify understandable announcements, focus order and assistive-technology interactions.

**Scope:** a named reviewer runs the current learner/staff/Canvas/image/recovery workflows with a recorded screen reader/browser. Adapt historical script steps to the current no-worker/deferred-schedule behavior.

**Acceptance:** actual announcements, keyboard paths, focus/return, form errors, table states and async status changes are recorded. Failures have severity and retest evidence. The current script no longer instructs enabling deferred schedules. No WCAG conformance claim is inferred from automated scans alone.

**Validation:** [manual review script](prototype/screen-reader-review.md), ACCESS-01/02 and the affected test workflows. Code fixes can be separate scoped follow-ups; preserve failed evidence.

**Owner:** accessibility reviewer/portal lead. **Labels:** accessibility and the applicable triage state.

### T07 Future guest login and recovery decision

**Current amendment, October 21:** existing-CU-account learner login now uses identity-only Canvas OAuth, including staff as learners; see [ADR 0009](adr/0009-canvas-learner-login.md). This draft issue now concerns future guest pre-account login and recovery before paid Cedarville guest provisioning.

**Decision needed:** approved future guest pre-account login, verified contact ownership, recovery/linking and deactivation rules.

**Output:** a named accountable owner, chosen integration/provider route, documented contract/ADR and test scenarios. Explicitly separate learner login from the existing staff Canvas OAuth flow. Keep mock email/UUID identity local-only; verify the implemented Canvas learner path separately.

**Done when:** IT Identity/Security agree the contract or record unresolved items with owners. Only then open a scoped implementation issue; a meeting or placeholder provider name alone does not close this decision.

**Blocks:** future guest pre-account authentication and paid guest provisioning. Existing-account learner Canvas OAuth is implemented separately. No automatic due date is assumed.

**Owner:** IT Identity and Security, coordinated by the portal lead. **Decision references:** A4/P9 in [decision register](decision-register.md).

### T08 Canvas identity and paid provisioning contract

**Decision needed:** authoritative identity/SIS lookup, verified-email candidate matching, aliases/ambiguity/no-match handling, approved Courtesy/Canvas account creation route and separately approved user/enrollment write permissions.

**Output:** versioned contract with representative existing/missing/ambiguous identities, installation/user/section/enrollment IDs, no-match versus lookup-failure semantics, idempotence/reconciliation, activation timing and refund-during-provisioning behavior. Use an approved isolated test environment. Do not assume the current staff course-read grant authorizes account creation, enrollment or learner records.

**Done when:** IT Identity and Canvas Administration confirm authoritative matching and ownership of provisioning/access removal, with mocks/test fixtures and unresolved policy owners. Open separate implementation issues for matching, account creation and enrollment afterwards.

**Dependencies:** coordinate with T07; real implementation waits for the trusted learner identity contract. **Owner:** IT Identity and Canvas Administration. **Decision references:** C1/C2/R3/R4 in the [register](decision-register.md).

### T09 Hosted demo target and access gate decision

**Decision needed:** Azure/Railway or other supported target, institutional resource owner, audience restriction, webhook exemption, secret storage, private API/database access, image/preview storage and operational ownership.

**Output:** approved demo topology and environment/access policy, with a named accountable operator and restore/recovery responsibilities. Keep synthetic-only demo hosting distinct from a real learner pilot. Update the existing [deployment plan](hosting/deployment-plan.md) rather than creating a conflicting architecture.

**Done when:** the target/gate and owners are agreed and the provider-specific implementation prerequisites are concrete. Price estimates alone do not close the decision. A subsequent implementation/validation issue authorizes the configured demo deployment steps; no deployment is part of this decision ticket.

**Owner:** portal lead, IT and Security. **Decision reference:** A3 and hosted security gates SEC-F02–06.

### T10 Portable combined app container

**Problem:** the combined web/API target is documented but reproducible hosted packaging is not implemented.

**Scope:** compiled API start, reproducible container build, web/API process startup and shutdown, configurable listening/public/internal URLs, reviewed migration-before-serving flow, readiness, and an exact-byte signed Stripe webhook route. Keep PostgreSQL external and preserve data. Retain the no-worker demo model and deferred schedules.

**Acceptance:** a local container rehearsal starts both services, exposes only intended routes, handles a signed synthetic webhook without changing bytes, preserves data across restart and reports startup/migration failure. Guards are deliberate; do not simply remove production/test-key restrictions. Document image/temporary-preview behavior and deployment prerequisites.

**Exclusions:** real provisioning, provider-specific deployment, public exposure or bypass of an access gate. T09 plus later hardening/validation gate any shared deployment, even if the portable build is ready.

**Validation:** build/start/health/shutdown checks, isolated migration/restart/restore rehearsal and webhook-byte integrity test. Update README and [deployment plan](hosting/deployment-plan.md).

**Owner:** portal development/operations. **Reference:** [portable deployment preparation](next-steps.md#3-prepare-a-portable-deployment-for-shared-review).

## Later issues to open when prerequisites are clear

Keep these as roadmap outcomes initially. Split them into scoped issues when contracts and earlier results exist, rather than publishing dozens of speculative implementation tickets now.

- **Canvas acceptance:** after T01/T02/T03, validate three approved representative mappings, including repeat import, edited fields/images, visibility, conflict handling and recovery. Agree purchase gates/freshness before implementation.
- **Shared demo exposure:** after T09/T10, implement provider-specific gate/secrets/networking/storage, validate hosted security/callback/webhook behavior and complete a restore drill. Do not expose mock identity without the approved gate.
- **Trusted learner access:** after T07/T08, separately implement real login, verified Canvas identity links, missing-account provisioning after confirmed payment, durable enrollment/recovery and refund compensation. Preserve existing institutional accounts.
- **Learner learning records:** after verified identity/enrollment, choose one agreed grade/progress measure and its visibility/read scope, then implement ownership/staleness rules.
- **Closed pilot operations:** complete remaining security/accessibility/policy acceptance, authoritative payment-versus-enrollment reporting, alerts, Support runbooks and any course-migration/cutover decisions.
- **Deferred product scope:** scheduled discovery, coupons, memberships, bulk purchasing and transfers remain outside the initial batch unless priorities change.

## Common issue body and completion rule

Use this structure for each child issue, with concrete acceptance criteria rather than only a feature title:

```markdown
## Problem and intended outcome

## Scope and exclusions

## Dependencies and decisions

Part of #<roadmap>
Blocked by #<issue>, where applicable
Owner: <agreed person or responsibility group>
Priority: P1 or P2

## Acceptance criteria

- [ ] Observable behavior or decision output
- [ ] Permissions, preservation and failure behavior

## Validation

Relevant case IDs, automated checks and required manual review

## References

Plan section, ADR, contract and related PRs
```

A PR closes an implementation issue only when acceptance and relevant test evidence are complete. Link it using the appropriate closing reference for the repository's merge workflow. A decision issue closes with an agreed written decision, not with speculative code. Keep blocked/outstanding acceptance visible rather than checking everything because a PR merged.

## Publication and ongoing workflow

1. When issue creation is requested, create the missing canonical labels and outcome milestones, then the new roadmap issue with `documentation`.
2. Create the ten children with their type/triage labels and milestone; add actual links/dependencies to the roadmap. Verify titles, counts, links and initial states after creation.
3. Reconcile stale current-state text in `docs/next-steps.md` and the implementation plan's GitHub execution section: #17/#18 are merged; the old tracker issues are closed; source reads/simulation have no always-running worker. Keep dated history intact and use current Course manager terminology.
4. Make Issues the work queue; keep ADRs/contracts/test scripts as the detailed reference. Link issue IDs from the next-steps summary rather than maintaining duplicate status checklists in several files.
5. Before starting a task, choose an unblocked ready issue, assign the actual worker and create a fresh branch from current main. Put only the work in scope into its PR and include acceptance/test evidence.
6. Review the roadmap briefly each week: next ready work, blocked decisions/owners, newly verified findings and completed outcomes. Do not automatically create issues from every test case; open a bug for a reproducible defect and link its case ID/run evidence.

Recommended first implementation: **T01 listed/unlisted visibility**. T02/T03 and T04 can follow; T05/T06 and external decision coordination can proceed in parallel with appropriate fixtures/reviewers. No dates or deployment commitments are created by this plan.
