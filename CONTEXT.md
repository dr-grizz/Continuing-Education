# Continuing Education domain context

- **Course product:** instructional subject and reusable catalog description.
- **Offering:** saleable instance/cohort with dates, capacity, approval rule and eventual Canvas mapping. The prototype stores sample course descriptions directly on offerings; product normalization is deferred.
- **Course type:** `cohort` uses scheduled start/end dates; `self_paced` means learn on your own and start anytime, with no cohort dates. User-facing labels are **Scheduled** and **Self-paced**; show **Start anytime** for self-paced courses. Course type is distinct from delivery format and access-duration policies.
- **Staff member:** a portal staff user in the `staff_members` directory. Members have one or more roles and are deactivated rather than deleted. Sign-in is mock in the prototype; university SSO replaces it later.
- **Staff role:** approver, catalog manager, support, Finance, IT/Canvas administrator, staff administrator or content editor (sales pages, planned). Each role grants permission scopes; endpoints check scopes, not role names.
- **Learner:** internal portal person (Support can deactivate an account, which blocks sign-in and learner actions while existing paid enrollments continue); the prototype persists one demo learner per normalized email in PostgreSQL. Existing shared sample registrations remain on an email-less legacy learner. Sign-in is mocked; no passwords are stored.
- **Entitlement:** learner-to-offering access justification, distinct from payment and identity status.
- **Approval validity:** how long an approval lets the learner reserve a seat (default 7 days, set per offering). Lapsed or declined approvals can be requested again.
- **Enrollment window:** Scheduled courses accept registration until a set number of days after the start date (default 7, set per offering). Self-paced courses never close.
- **Canvas course link:** per-offering link that learners see only after their Canvas account and enrollment are complete.
- **Price history:** append-only record of an offering's prices. A reservation keeps the price quoted when the seat was reserved, and payment charges that quoted price.
- **Unpublished offering:** removed from the catalog. No new registrations, approval requests or payments; enrollments already paid continue.
- **Order:** payment record. Prototype orders are explicitly simulated, not financial evidence.
- **Operation:** durable background workflow with a queryable status. Failed steps retry automatically a bounded number of times.
- **Exception:** a paid registration whose provisioning failed after automatic retries. It waits in the staff queue until staff retry provisioning (after the cause is fixed) or record a manual enrollment, each with an audited reason. Learners see “Support review needed” and are never asked to pay again. In the prototype, failures are simulated by a staff-selected outcome.
- **Migration/cutover:** project transition process, not portal business behavior.

Portal owns catalog and workflow coordination; IT owns identities; Canvas owns learning access/records; Finance owns payment/refund decisions. Prototype adapters must never call production services. Issue creation requires explicit user instruction.
