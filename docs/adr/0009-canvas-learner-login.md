# ADR 0009: Learner login through existing Canvas accounts

Accepted October 21, 2026 at the project owner's direction. This amends the mock learner login in ADR 0001 and separates the current login path from future guest provisioning.

## Current scope

Anyone with an existing account on the configured CU Canvas installation can sign in as a learner. Staff use the same CU account for this purpose, but learner and staff sessions remain independent. Staff admission still requires a pre-approved staff identity and current portal roles. Learner login never creates a staff record or assigns staff roles.

Reuse the existing OAuth developer key and registered `/api/auth/canvas/callback`. Learner authorization requests only `/auth/userinfo`, even when staff course reads are enabled. Canvas supplies the user's numeric ID and name; this response does not verify an email address and returns no API grant. The portal binds the learner to `(Canvas origin, numeric user ID)`, not an entered email. First login creates a portal learner record only. This does not create a CU guest account or a Canvas enrollment.

Use separate learner OAuth state and session tables. Each state is hashed, expires after ten minutes, binds an independent browser nonce and configuration fingerprint, and is consumed atomically before the code exchange. The shared callback dispatches learner states to the learner flow; each flow rejects the other flow's state. Allowed return destinations are stored server-side and checked again before redirecting.

Portal learner session secrets are random, stored only as hashes, and sent in HTTP-only SameSite=Lax cookies. HTTPS uses Secure and `__Host-` cookies. Requests recheck expiry, active learner status and the Canvas identity binding. Logout revokes the portal learner session, without logging out staff or Canvas. Learner mutations and logout enforce same-origin requests. Canvas tokens, codes and raw session secrets do not enter audit events or browser JSON.

`LEARNER_AUTH_MODE=canvas` disables arbitrary-email sign-in, learner UUID selectors and the legacy default learner. `mock` remains an explicit local test mode. Missing Canvas configuration fails closed. Existing mock registrations are preserved and never silently reassigned by email or an old browser cookie. Email can remain unset on a Canvas-linked profile; the UI uses the Canvas name, and Stripe can collect its own checkout email.

## Future guest workflow

A learner without an existing CU account will register for a course and pay, then receive a Cedarville guest account through the approved institutional identity workflow. Pre-account portal authentication, eligibility, recovery, authoritative matching and the guest-provisioning contract remain future decisions. Neither a failed lookup nor an entered email authorizes account creation. Provisioning follows server-verified payment, with idempotency, ambiguity handling and reconciliation before retries. No guest account creation, identity lifecycle change or real Canvas enrollment is implemented here.

## Verification and limits

`npm run test:learner-auth` uses a disposable database and mocked Canvas to cover identity binding, role separation, concurrent first login, state expiry/replay, session rotation/revocation, deactivation, shared callback cookies, origin checks and rejection of mock selectors. Existing staff OAuth and migration tests remain required. Live CU login/MFA, live payment return and manual screen-reader review require separate evidence; automated checks do not prove them.

Azure remains the requested demo host. Email links, email codes and Entra External ID are not prerequisites for this existing-account login path. Hosting still requires its own confirmed Azure context, access gate, packaging and validation.

See [Canvas OAuth identity-only login](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth), [staff OAuth](../canvas-staff-auth.md) and the [demo deployment plan](../hosting/deployment-plan.md).
