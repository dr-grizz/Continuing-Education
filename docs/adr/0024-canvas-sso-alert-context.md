# ADR 0024: Bind Canvas alerts to the university SSO identity

Accepted November 4, 2026 at the project owner's request to continue university SSO through Canvas and display alert data based on that login.

## Context

The existing Canvas OAuth flow resolves the verified Canvas installation/user ID to an approved portal staff member, issues an opaque portal session, and stores any refreshable API authorization encrypted on the server. The original alert reader used a rule owner's saved grant, but its Canvas-read scope allowed other staff to view those observations and manually adopt the rule. That shared behavior in ADR 0020 does not meet the requested login-specific display.

## Decision

Keep the existing university SSO through Canvas, staff directory mappings, portal roles, OAuth callback, and encrypted grant store. Do not add a separate credential/token workflow, infer identity from email, or assign roles from a Canvas response.

Restrict Canvas rule listing, alert observations/counts, rule edits, sync, actions and history to the staff ID resolved from the authenticated portal session. A staff administrator has no cross-owner override. New rules derive ownership from that session; manual sync cannot change it. Local verification, milestone and credential sources retain their existing portal permission model and are labeled separately.

Check current account/role authorization, grant subject/provider/configuration binding, and decryptability before exposing or using saved Canvas observations. Retain owned rule configuration during reconnection, but hide source observations and their counts without a valid current grant. After scope/client configuration changes, require a current authorized snapshot before displaying old observations. Background evaluation and reads check the same owner's authorization; unavailable data does not clear prior alerts as recovered.

Show **Alerts for your login** with identity, SSO versus local preview mode, source restrictions, and an authorization/reconnection state. Use the existing Canvas sign-in route to recover a grant. Local mock identities cannot initiate live Canvas alert reads. A failed refresh clears previous alert display; existing staff workspace identity remounting prevents carrying data between logins.

## Consequences

This supersedes ADR 0020's cross-staff Canvas visibility and manual sync adoption. Separate managers create separate Canvas rules under their own authorized login. Current Canvas course permissions and accessible enrollment/grade fields still determine observations. Provider failures/stale data retain durable alerts with unavailable-source warnings; no grades, access, credentials, student messaging or developer keys are changed.

No schema migration or authentication-setting switch is required. The local preview can remain mock while the hosted portal uses Canvas SSO. Live institutional sign-in and actual course permissions require separate verification; tests exercise real OAuth/session/guard and encrypted-grant code with mocked provider HTTP, not a claim of live university data access.
