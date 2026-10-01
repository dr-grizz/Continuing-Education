# Continuing Education domain context

- **Course product:** instructional subject and reusable catalog description.
- **Offering:** saleable instance/cohort with dates, capacity, approval rule and eventual Canvas mapping. The prototype stores sample course descriptions directly on offerings; product normalization is deferred.
- **Course type:** `cohort` uses scheduled start/end dates; `self_paced` means learn on your own and start anytime, with no cohort dates. User-facing labels are **Scheduled** and **Self-paced**; show **Start anytime** for self-paced courses. Course type is distinct from delivery format and access-duration policies.
- **Learner:** internal portal person; the prototype persists one demo learner per normalized email in PostgreSQL. Existing shared sample registrations remain on an email-less legacy learner. Sign-in is mocked; no passwords are stored.
- **Entitlement:** learner-to-offering access justification, distinct from payment and identity status.
- **Order:** payment record. Prototype orders are explicitly simulated, not financial evidence.
- **Operation:** durable background workflow with a queryable status.
- **Migration/cutover:** project transition process, not portal business behavior.

Portal owns catalog and workflow coordination; IT owns identities; Canvas owns learning access/records; Finance owns payment/refund decisions. Prototype adapters must never call production services. Issue creation requires explicit user instruction.
