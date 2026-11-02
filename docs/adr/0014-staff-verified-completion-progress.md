# ADR 0014: Staff-verified individual progress and learner cohorts

Accepted for local implementation October 28, 2026, following the project owner's request to start with individual progress and cohort reporting.

Completion tracking is separate from entitlement/payment state and pathway follows. Staff define immutable per-offering requirements versions and explicitly assign active learners; no completion is inferred from enrollment. Cohorts are named learner memberships bound to a requirements version, not catalog collections or group project awards. A learner's individual evidence is the canonical record used by each cohort that shares the version.

The first evidence source is documented staff verification. Course managers and staff administrators receive `progress:manage`; existing `reports:read` authorizes staff reporting. Learners can read only their own assignments. Each evidence event includes the authenticated actor, a learner-visible evidence/correction note, an optional learner-visible reference, and a database timestamp. Corrections append new events. A missing event remains awaiting verification; reporting an explicitly verified not-started state requires evidence as well.

Prisma migration 025 owns the six new tables. Composite foreign keys keep evidence and cohort memberships within the assigned version. Immutable-snapshot triggers protect requirements/evidence. Staff writes use the existing actor-scoped idempotency mechanism; a previous-event comparison under a participant row lock prevents stale corrections. New requirements versions compare the previous version while holding the offering row lock. Cohort membership can be removed/re-added without deleting individual evidence.

Reports count only required steps in percentages and completion. Optional steps do not affect the overall required-work state. A new version does not rewrite assignments or carry evidence forward. There is no automatic evidence-expiry rule in this phase. Learners and staff explicitly refresh reports; times represent staff recording times, not fetched Canvas completion timestamps.

Automatic Canvas completion synchronization, prerequisite/access gates, badge eligibility/issuance, cross-course pathway completion, shared group-project credit, and due-date/overdue reporting are separate work. No live Canvas content or existing badge awards are changed by this feature. The local portal database was backed up before the additive migration; generated private backups remain ignored by Git.
