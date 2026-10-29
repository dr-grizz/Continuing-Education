# Temporary setup administrator using a private key

This shared feature is enabled only in the beta profile. The demo keeps its existing deployment settings and operator-managed migrations; importing this code does not activate setup or add startup migrations to the demo. The CU Launch pre-start migration option mentioned below belongs to the separate managed beta repository.

Initial setup at `/setup` uses `BOOTSTRAP_KEY` configured privately in Azure. Microsoft login, Microsoft credentials and the former tenant/user ID allowlist are no longer required. Anyone holding this key can initialize settings and select the permanent Canvas administrator during the explicit setup window. Protect it as an administrator credential.

## Activation

For Azure portal steps and troubleshooting, use the [setup activation guide](../publishing/enable-initial-setup.md).

The app must reach its database and apply migrations through `026_bootstrap_key`. The existing beta pre-start migration option applies them inside Azure; GitHub Actions does not need to reach the private database.

Set these values on the Azure app:

```dotenv
BOOTSTRAP_ENABLED=true
BOOTSTRAP_EXPIRES_AT=<absolute UTC timestamp no more than 24 hours ahead>
BOOTSTRAP_KEY=<64 random hexadecimal characters, entered privately>
```

Generate the key privately with `openssl rand -hex 32`. Do not use the sample already displayed in chat. Do not put the actual key in Git, URLs, screenshots, issues or logs. Azure App Service encrypts stored application settings; only authorized administrators should have permission to read them. This implementation reads BOOTSTRAP_KEY from the server environment, never returns it, and does not copy it to the database, deployment configuration or GitHub secrets. Deployment preserves the existing setting.

Both Node processes must also have the same stable, private `AUTH_SECRET` (at least 32 characters) and correct HTTPS `WEB_URL`. AUTH_SECRET is the separate AES-256-GCM encryption root for saved settings and OAuth flow material; BOOTSTRAP_KEY is only the setup credential. Rotating BOOTSTRAP_KEY invalidates temporary sessions without changing encrypted settings. Changing AUTH_SECRET or WEB_URL requires deliberate re-encryption of saved settings. Preserve the original root key securely with database backups.

The existing hosted beta restrictions remain: HOSTED_BETA=true, PROTOTYPE_MODE=true, HOSTED_DEMO not true. Setup defaults disabled. No Microsoft app registration or callback is needed for setup. Existing Microsoft infrastructure settings are left unchanged; do not delete unrelated settings.

## Workflow

1. Open `/setup` on the configured HTTPS app origin. Enter the setup key in the masked field and choose **Unlock setup**. Keys are sent only in a same-origin HTTPS POST body, never in URL parameters. The field clears after every attempt. Failed key guesses are limited to 20 per minute per web process without querying the database. Correct-key sign-ins have a separate shared database-backed limit of 20 per minute across instances. Excess requests receive HTTP 429 and Retry-After. A wrong-key cooldown does not block a correct key; its accepted sign-in still follows the shared limit.
2. Review the app URL and migration checks, then save the Canvas client ID/secret and session preferences. Blank secret fields retain the existing value. Setup does not edit DATABASE_URL, Microsoft credentials, arbitrary environment variables or Azure/GitHub permissions. Enter the key again when a privileged operation requests recent verification.
3. Use **Add an administrator** to enter a name, contact email and verified-by-the-operator numeric Canvas user ID. This prepares the active staff_admin account without a provider call or login session. Alternatively, enter a contact email and choose **Verify and link my Canvas administrator** to verify your own identity through OAuth. The key authorizes this explicit role grant; contact email is operator-provided metadata, not verified identity or an authentication mechanism. The added account must independently authenticate through Canvas before handoff can finish. The OAuth alternative obtains the installation/user ID through identity-only OAuth. The existing Canvas developer key must allow `https://app-cuce-beta-cmvjnykp.azurewebsites.net/api/auth/canvas/callback`. Existing inactive, conflicting or already-claimed identities require administrator review. Other staff roles and records are preserved.
4. Open normal staff sign-in in another tab and complete Canvas sign-in. A new, normal staff session for the linked active staff_admin, after the latest linking or settings update, is required as handoff proof. Key authorization never creates a normal staff session.
5. Refresh setup checks, confirm handoff, and choose **Finish setup and remove temporary access**. Completion permanently marks the setup gate closed and deletes all temporary sessions and OAuth states while retaining application settings, permanent staff and audit records. Enabling the flag, changing the key/deadline, restarting or redeploying cannot reopen completed setup.
6. Set BOOTSTRAP_ENABLED=false and remove BOOTSTRAP_KEY from Azure as defense in depth. No temporary password or Microsoft staff account was created to delete.

## Security and migration behavior

Key comparisons use constant-time comparison of fixed-size digests. Only a 64-character hexadecimal key is accepted. Temporary session cookies contain a random token, expiration and HMAC proof tied to the current setup key, AUTH_SECRET and app origin. They are host-only, Secure, HttpOnly and SameSite=Lax. Only token digests are persisted. The signature and expiration are checked before connecting to PostgreSQL; the stored session and gate remain authoritative afterward. Sessions last at most 30 minutes and expire sooner at the configured or persisted setup deadline; privileged operations require key verification within ten minutes. Reverification rotates the current session. Old unsigned setup cookies from earlier builds are rejected and require a fresh key entry; permanent Canvas sessions are unchanged. Invalid or expired cookies return HTTP 401 and allow a fresh key entry; missing/disabled/expired configuration returns HTTP 403 without database access.

POST requests require the configured host/origin and a bounded JSON body. Responses are private/no-store/no-referrer. No browser storage is used for keys. Contact email is encrypted inside one-use, browser/session-bound Canvas state; callbacks bind to the current key configuration and Canvas credentials. Provider errors and secrets are not reflected or logged. Audit actors identify shared-key authorization rather than claiming an individual Microsoft identity. A shared key cannot provide individual accountability before Canvas handoff.

The initial unauthenticated GET validates only configuration and origin, then displays the key form. It does not read the database or reveal whether a persisted setup gate is closed. Wrong keys and forged or expired signed cookies are rejected before loading database dependencies or querying PostgreSQL. Correct keys reach the shared sign-in limit and persisted gate; completed or expired gates still refuse authorization. Failed key guesses are not written to the database audit trail because no database access occurs before key verification. Existing successful actions remain audited.

The first successful key verification persists an absolute setup deadline. Failed attempts do not create the setup gate. Moving the environment deadline forward never extends a persisted deadline. A completed or expired gate requires separately reviewed out-of-band administrator recovery; there is no reset endpoint.

Migration `026_bootstrap_key` revokes previous Microsoft setup sessions and OAuth states, makes historical Microsoft owner columns optional and adds the bounded attempt counter. It preserves completion tombstones, original deadlines, permanent staff, encrypted settings and audit history. An existing uncompleted, unexpired Microsoft setup gate can proceed with the configured key without renewing its deadline. No previously completed gate is reopened.

## Saved settings and deployment

The five allowed application settings are encrypted in `application_settings`: CANVAS_STAFF_CLIENT_ID, CANVAS_STAFF_CLIENT_SECRET, STAFF_SESSION_HOURS, LEARNER_SESSION_HOURS and CANVAS_STAFF_FORCE_LOGIN. Secrets return only configured/not-configured indicators. API overrides refresh within three seconds and take precedence over environment defaults. Undecryptable saved values fail closed.

Saving does not change Azure, GitHub secrets, Key Vault or networking. The existing deployment credential restoration still manages its five Azure environment defaults; a mismatch stops deployment instead of rotating credentials. BOOTSTRAP_KEY is separately configured by the operator and is never part of that restoration or a managed default. Existing optional setup activation values are preserved on an existing beta target; a missing BOOTSTRAP_ENABLED defaults false. Deployment never renews the expiration.

Database TLS testing policy remains unchanged. The separate SQL console is not implemented by this feature.

## Validation and remaining checks

`npm run test:bootstrap` uses an isolated database and synthetic keys/mocked Canvas responses. It checks key validation, shared attempt limits, cookie security, rotation, CSRF, no secret disclosure, settings encryption, deadline/closure persistence and verified handoff. Migration integration checks fresh and legacy schema equivalence. Packaged-runtime tests cover key authentication and disabled setup returning JSON 403, with no Microsoft configuration. Browser tests cover the masked form, clearing failed keys, keyboard access, axe, mobile reflow and forced colors.

Live Azure startup/logs and the prior setup API HTTP 500 require live read-back after a separately authorized deployment. Local tests do not prove that Azure issue resolved. Real Canvas callback approval, actual handoff and manual screen-reader review remain to be verified before accepting setup end to end.

## Diagnosing setup failures

After key verification, runtime loading, PostgreSQL connection, transaction initialization, shared sign-in limit, saved gate, session creation and audit failures include a safe stage/code in brackets. Reading/decrypting saved settings has its own stage. Share only that code, such as SETUP_RUNTIME_LOAD_FAILED or SETUP_SETTINGS_DECRYPT_FAILED, when asking for help. The message never includes raw driver errors, dependency paths, SQL or secret values. A stage identifies where processing stopped; it does not establish a migration problem by itself.

## Database-independent diagnostic access

A verified BOOTSTRAP_KEY also issues a separate ten-minute, host-only Secure/HttpOnly/SameSite=Lax read-only diagnostics capability. This is returned even if the subsequent runtime/database/setup-session check fails. The setup page confirms that verification passed and displays `/system-info` as a path to type, without a navigation link. System Info verifies this signature using the current key, AUTH_SECRET, origin, enabled flag and environment deadline before collecting its read-only report; a database outage therefore does not prevent diagnostic authorization. If the database driver cannot load, the report still returns build metadata and a safe runtime error where possible.

This capability cannot authorize settings changes, administrator creation, Canvas linking or setup completion. Those operations still require the separate database-backed setup session and open persisted gate. A completed/expired persisted setup gate remains closed to all writes. If BOOTSTRAP_ENABLED is deliberately left true with a valid environment deadline/key, that key can still grant read-only diagnostics after setup closure. Completion/sign-out clear the capability in the current browser; other diagnostic capabilities expire within ten minutes. Disabling BOOTSTRAP_ENABLED, rotating/removing BOOTSTRAP_KEY or reaching its environment deadline revokes them immediately. Normal staff administrator access remains available independently.
