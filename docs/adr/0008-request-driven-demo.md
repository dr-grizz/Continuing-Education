# ADR 0008: Request-driven demo without an always-running worker

Accepted October 15, 2026, at the project owner's direction. This supersedes the separate worker arrangement in ADR 0001 and scheduled course-read execution in ADR 0007 for the current demo.

Run only the Next.js website and NestJS API. Preserve the database-backed operation records, payment idempotency, audit history and simulation boundaries; no database migration or data reset is required.

- Verified Stripe webhooks and simulated payments finish normal simulated identity/enrollment stages within the payment transaction. These stages make no external provisioning calls. Failed webhook transactions roll back and can be retried safely.
- Delayed/failure simulations keep their next-attempt timestamps and bounded retry count. Authenticated API requests advance due work and expire reservations/approvals before returning. Nothing polls in the background or continues after the response. Jobs pause without traffic and resume from persisted state after a restart. Health checks do not advance jobs.
- Manual Canvas preview requests process durable owned read runs in the API, retaining OAuth permission checks, leases, bounded provider timeouts, encrypted temporary previews and explicit import. The web proxy accommodates the provider time budget for this path. There is no scheduled preview execution; historical schedule records are retained and enabling schedules is rejected.
- Support and Staff administrators can manually reconcile up to five overdue unresolved Checkout sessions through Transactions. Provider calls have bounded timeouts and run outside database transactions. Failures preserve unresolved sessions and do not stop checks of the other sessions. Reconciliation and later webhook delivery reuse the recorded payment.

The API's local-only environment guard, Stripe test-mode restriction and simulated learner identity/enrollment remain. Hosted demo access controls and packaging are separate work. One combined web/API container with an external PostgreSQL database is a possible deployment; it is not created by this change. Multiple API replicas would require shared preview storage.

Real Canvas account creation, enrollment, institutional provisioning and automatic recovery should use an on-demand durable job runner with explicit authorization. Do not put those long external workflows inside a webhook or rely on unawaited promises after responding.
