# Canvas staff authentication

Implemented on `canvas-sync`, extended on `azure-demo` October 27, 2026. Canvas OAuth verifies an explicitly linked staff identity; portal roles still decide access. Optional [Canvas course reads and schedules](canvas-courses.md) reuse this OAuth client and callback with API read scopes and encrypted per-staff grants. Learner sign-in uses a separate identity-only flow; enrollment remains simulated.

## Configure before live testing

Set these in the API's root `.env` (ignored by Git). The values below are placeholders; credentials must not be committed. Restart the API after changes.

```dotenv
STAFF_AUTH_MODE=canvas
CANVAS_BASE_URL=https://your-institution.instructure.com
CANVAS_STAFF_CLIENT_ID=
CANVAS_STAFF_CLIENT_SECRET=
CANVAS_STAFF_REDIRECT_URI=http://localhost:3050/api/auth/canvas/callback
CANVAS_USER_AGENT=Cedarville-CE-Portal/0.1.0
STAFF_SESSION_HOURS=8
CANVAS_STAFF_FORCE_LOGIN=false
```

Use the actual Canvas hostname. IT must create/enable an OAuth API developer key and register the exact callback URL. By default, the request uses Canvas's identity-only `/auth/userinfo` scope. When `CANVAS_COURSES_ENABLED=true`, it requests the narrow API course-read scopes described in [Canvas courses](canvas-courses.md) instead. Verify that the institution's key and authentication settings allow this flow. In identity-only mode the exchange must return `access_token: null` and a Canvas user ID, and API tokens are rejected. With course reads or directory lookup enabled, API access/refresh tokens are validated and encrypted on the server for staff with course-read or staff-management permission; the browser still receives only the portal session cookie. See [Canvas OAuth endpoints](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints).

The server's Canvas OAuth token request includes an explicit `User-Agent`, defaulting to `Cedarville-CE-Portal/0.1.0`. Override it with `CANVAS_USER_AGENT` (1–256 printable ASCII characters). Browser authorization requests carry the browser's own User-Agent. The course reader and token refresh requests send that same User-Agent. See [Canvas's User-Agent enforcement announcement](https://community.instructure.com/en/discussion/658205/enforcing-user-agent-header-for-canvas-api-requests/p1).

Open the portal on the callback's exact origin: `localhost` and `127.0.0.1` are different. HTTPS is required for Canvas and for any non-loopback portal callback. Optional `CANVAS_STAFF_AUTHORIZE_URL` and `CANVAS_STAFF_TOKEN_URL` override the default `/login/oauth2/auth` and `/login/oauth2/token` endpoints, but must use the same Canvas origin. Session lifetime is configurable from 1–24 hours.

`CANVAS_STAFF_FORCE_LOGIN=true` requests a fresh Canvas login (`force_login=1`). Canvas delegates authentication to the institution's configured login system. Neither this flag nor identity-only OAuth proves that a fresh MFA challenge occurred: IT must verify the SSO/MFA policy during live testing. Portal sign-out ends the portal session; it does not sign the person out of Canvas or the institutional SSO session.

The web server only needs its existing `PROTOTYPE_MODE`, `API_URL`, `STAFF_API_TOKEN` and learner broker token. Canvas settings are read by the API, and public sign-in metadata comes from it. Do not use `NEXT_PUBLIC_` variables for secrets or put Canvas keys in browser code. Keep the API private; its broker token can issue staff sessions and must be treated as a secret.

## Link approved staff

Run `npm run db:migrate` to apply additive migration `016_canvas_staff_auth`; it creates OAuth state and session tables and preserves existing staff/data. Back up the local database before applying migrations per the README. Create the initial staff roster and roles through the existing mock staff screen before switching to Canvas mode, then link at least one active staff administrator:

```sh
npm run staff:link-canvas -- --email staff@example.edu --canvas-user-id 12345
```

Staff administrators can also use **Admin → Staff → Link Canvas** after creating an active staff record. The directory shows whether each person is linked. Open the person's profile in Canvas administration, verify the numeric Canvas user ID belongs to the intended person, enter it in the dialog, confirm ownership, and select **Link Canvas account**. The configured Canvas installation is displayed and cannot be supplied or changed by the browser. Email alone never establishes an identity link. This action records the administrator as the audit actor, preserves roles, increments the staff version, and revokes older portal sessions for the target person. It does not change Canvas permissions or enrollments.

### Optional lookup by staff email

To enable **Find in Canvas**, configure `CANVAS_STAFF_LOOKUP_ACCOUNT_ID` with the account whose directory the administrator may search, plus `CANVAS_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as Base64). Enable `url:GET|/api/v1/accounts/:account_id/users` on the Canvas OAuth developer key. Account `1` in the examples is only a placeholder; use the correct institutional account. This does not grant account access: the administrator must already have directory permission in Canvas.

Restart the API and sign staff administrators out and back in to obtain the new OAuth grant. Existing grants with different scopes are rejected. The portal stores each authorized administrator's grant encrypted and never exposes tokens in the browser. Learner sign-in continues to request only `/auth/userinfo`.

Adding an active staff member now opens the linking dialog automatically when lookup is enabled. Canvas is searched using the saved staff email and the signed-in administrator's own grant. A single exact email/login match displays the account name, email, login and ID. Review the result and confirm ownership to save the link. Missing, ambiguous or forbidden matches leave the staff identity unlinked; independently verified manual entry remains available. No live developer-key or deployment configuration is changed by enabling this feature in source code.

`npm run test:staff-lookup` verifies caller-owned grants, permission denial, exact/ambiguous matching, pagination safety, token refresh and API session authorization against a disposable database with mocked Canvas responses.

Existing links are read-only in the Staff screen; **View Canvas link** shows the saved user ID. Inactive targets, conflicting identity links, duplicate Canvas identities, stale versions and unconfirmed ownership are refused server-side. Refresh the directory after a conflict. Replacement/recovery of an existing identity remains a separate administrator procedure. The CLI remains available for bootstrap and recovery preparation.

The command needs `CANVAS_BASE_URL` and the existing database settings, but no OAuth keys or Canvas network access. Get the numeric user ID from Canvas administration and verify its owner before linking. The link is `(Canvas origin, Canvas user ID)`; email is only used by this administrative command to select an existing portal record. Sign-in never matches people automatically by name or email, creates staff records, or assigns roles.

The command preserves roles, increments the staff record's version, records an audit event and revokes older portal sessions for that record. Re-running the same link is harmless. A different existing link or a Canvas identity already linked to someone else is refused. Identity replacement/recovery needs a separate administrator procedure; this command deliberately cannot overwrite a verified link.

The default remains `STAFF_AUTH_MODE=mock` for the local synthetic demo. In Canvas mode, missing/invalid settings show a configuration notice and disable sign-in; there is no fallback to mock auth. The staff selector, mock session endpoints, mock directory and staff-ID header cannot authenticate staff in Canvas mode. This implementation does not lift the prototype's local-only/production guard.

## Session and request protections

- OAuth state and a separate HTTP-only browser nonce expire after ten minutes, are stored as hashes and are consumed once. Wrong-browser, expired, replayed and configuration-mismatched callbacks fail.
- The authorization code is exchanged by the API over HTTPS, with bounded timeouts and redirects disabled. Client secrets and provider response bodies are never returned to the browser or included in audit events.
- Successful callbacks create a random portal session. Only its SHA-256 hash is stored. The browser cookie is HTTP-only, SameSite=Lax, and Secure with a `__Host-` prefix on HTTPS to prevent subdomain cookie shadowing. Auth responses use `no-store` and `no-referrer`.
- Every staff API request checks session expiry, current active status, current identity binding and current portal roles. Sign-out revokes the session in the database. Changes to roles take effect on the next request. Deactivation through staff management revokes stored sessions; inactive records are also rejected on every request.
- Staff mutations and logout require the configured same-origin `Origin` header. The web proxy takes identity only from its own session cookie; it never forwards browser-supplied staff session headers. Generic proxy access to broker endpoints, including case/path tricks, is blocked.

## Verification and remaining live checks

`npm run test:auth` starts a broker API against a disposable database and mocks the Canvas provider. It exercises the real Next route handlers, state binding/replay/expiry, denied/unknown/inactive accounts, identity-only responses, session hashing/expiry/revocation, current roles, cookies, CSRF, and mock-auth bypasses. It never contacts Canvas. CI runs it alongside migration, API and accessibility checks.

Before enabling real staff access, verify the configured developer key/callback, approved identity links, successful SSO/MFA, denied authorization, unknown/inactive staff, existing Canvas SSO sessions, portal logout and session expiry. A live local Canvas OAuth staff login passed on October 13, and course discovery from subaccount 49 and descendants passed on October 14. Fresh institutional MFA assurance, remaining live denial/session/revocation cases and manual screen-reader review remain pending; mocked-provider checks cannot prove them. Course imports, scheduled previews and separate learner authentication are implemented; real enrollment and grade/progress access remain separate integrations.
