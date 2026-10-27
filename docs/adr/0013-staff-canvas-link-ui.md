# ADR 0013: Administrator-managed Canvas identity linking UI

Accepted October 27, 2026 at the owner's request. This extends ADR 0004's explicit verified identity linking with a Staff-screen action; it does not introduce email-based matching or self-service staff enrollment.

- Only authenticated staff with `staff:manage` can view detailed links or call the linking command. The general API broker retains same-origin writes and normal staff session checks.
- An active staff record must already exist. The administrator verifies the numeric Canvas user ID in Canvas administration and explicitly confirms ownership in the dialog. The app does not claim to verify that ownership automatically or request additional Canvas OAuth scopes.
- The Canvas installation comes from server configuration, never from browser input. Staff identities remain bound to installation/user ID; names and email do not establish a link.
- Linking is version-checked, transactional, idempotent and audited. It preserves roles, updates the version and revokes older portal sessions for the target. Duplicate identities and replacement of existing links are refused; identity recovery remains separate.
- The directory shows link status on desktop and phone layouts. Existing links can be inspected read-only. The dialog supplies labels, ownership confirmation, focused error feedback, keyboard cancellation/focus restoration and a disabled in-flight state.
- No migration is needed. The feature uses existing identity/session/audit columns. Adding this UI does not deploy the app or link live staff automatically.
