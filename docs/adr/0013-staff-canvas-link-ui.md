# ADR 0013: Administrator-managed Canvas identity linking UI

Accepted October 27, 2026 at the owner's request. This extends ADR 0004's explicit verified identity linking with a Staff-screen action; identity binding still requires administrator confirmation and does not allow self-service staff enrollment.

- Only authenticated staff with `staff:manage` can view detailed links or call the linking command. The general API broker retains same-origin writes and normal staff session checks.
- An active staff record must already exist. The administrator verifies the numeric Canvas user ID in Canvas administration and explicitly confirms ownership in the dialog. Optional directory lookup retrieves candidates for administrator confirmation; it never binds identities automatically.
- The Canvas installation comes from server configuration, never from browser input. Staff identities remain bound to installation/user ID; names and email do not establish a link.
- Linking is version-checked, transactional, idempotent and audited. It preserves roles, updates the version and revokes older portal sessions for the target. Duplicate identities and replacement of existing links are refused; identity recovery remains separate.
- The directory shows link status on desktop and phone layouts. Existing links can be inspected read-only. The dialog supplies labels, ownership confirmation, focused error feedback, keyboard cancellation/focus restoration and a disabled in-flight state.
- No migration is needed. The feature uses existing identity/session/audit columns. Adding this UI does not deploy the app or link live staff automatically.

## Optional Canvas directory lookup

When `CANVAS_STAFF_LOOKUP_ACCOUNT_ID` is configured, adding an active staff member opens the linking dialog and searches that stored email. Existing unlinked staff have the same **Find in Canvas** action. The administrator sees the returned name, email, login and numeric ID, then confirms ownership before saving. A failed lookup leaves the record unlinked and supports independently verified manual entry.

The server requires `staff:manage`, an active Canvas-linked caller and that caller's encrypted OAuth grant. It requests `url:GET|/api/v1/accounts/:account_id/users`; Canvas still enforces the caller's account permissions. Learner OAuth stays identity-only. Results must exactly match the stored email through Canvas email or login; no result, ambiguous results, unsafe pagination and stale staff versions fail closed. Only the final linking command changes the identity. No service-account grant is used.
