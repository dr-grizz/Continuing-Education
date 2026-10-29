# Enable initial setup for cuce-beta

Use this guide to open the temporary setup page, configure Canvas, establish a permanent administrator, and close temporary access. Microsoft sign-in is not required for setup. Anyone with the setup key can act as the temporary administrator while setup is enabled.

## 1. Make sure the new version is deployed

The app must include the BOOTSTRAP_KEY implementation and database migration `026_bootstrap_key`. Adding the variables alone will not update an older version of the app. When this guide was written, the key implementation was prepared locally and had not been deployed.

The deployment packages migrations; Azure runs them before starting the app when `MIGRATE_ON_START=true`. GitHub Actions does not need access to the private database. The app itself must have database access and migration permissions.

Target:

| Item | Value |
| --- | --- |
| CU Launch app | `cuce-beta` |
| Azure App Service | `app-cuce-beta-cmvjnykp` |
| Resource group | `rg-cu-apps-published` |
| Setup page | <https://app-cuce-beta-cmvjnykp.azurewebsites.net/setup> |
| Health check | <https://app-cuce-beta-cmvjnykp.azurewebsites.net/api/health> |

A successful health check confirms that the web process responds; it does not prove setup authentication or Canvas handoff works.

## 2. Prepare a private setup key and deadline

Generate a fresh 256-bit key on your own computer:

```sh
openssl rand -hex 32
```

The result is 64 hexadecimal characters. Keep it in a password manager. Do not use the sample key already shown in chat or paste your real key into chat, source files, URLs, or screenshots.

Choose a short setup window, such as two hours. The expiration must be an absolute UTC timestamp ending in `Z`, no more than 24 hours ahead when first unlocking setup. This command generates a timestamp two hours from now; it does not change Azure:

```sh
python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(timespec="seconds").replace("+00:00", "Z"))'
```

Generate the deadline when you are ready to begin, not days before deployment.

## 3. Add the Azure application settings

An administrator with permission to edit this App Service must perform these steps. Ownership of the CU Launch app alone may not grant Azure configuration access.

1. Sign in to the [Azure portal](https://portal.azure.com/).
2. Open **App Services** and select **app-cuce-beta-cmvjnykp**. Confirm the resource group is **rg-cu-apps-published**.
3. Open **Settings → Environment variables → App settings**.
4. Add or edit only these three entries:

| Name | Value |
| --- | --- |
| `BOOTSTRAP_KEY` | Your privately generated 64-character hexadecimal key |
| `BOOTSTRAP_EXPIRES_AT` | The UTC timestamp generated above, without quotes |
| `BOOTSTRAP_ENABLED` | `true` in lowercase |

5. Select **Apply** and confirm the changes. Saving App Service settings triggers an application restart; allow startup and migrations to finish. See [Microsoft's application settings instructions](https://learn.microsoft.com/en-us/azure/app-service/configure-common#configure-app-settings).

Enter BOOTSTRAP_KEY privately through Azure App Service settings or an approved secret reference. Do not add it to CU Launch's ordinary environment-variable form, the repository's nonsecret settings JSON, or a `NEXT_PUBLIC_` variable.

Preserve the existing `DATABASE_URL`, `AUTH_SECRET`, authentication credentials, and unrelated settings. `AUTH_SECRET` is a separate encryption key and must remain stable and at least 32 characters. Do not replace it with BOOTSTRAP_KEY. The existing beta profile must remain HOSTED_BETA=true, PROTOTYPE_MODE=true, and HOSTED_DEMO=false, with WEB_URL set to the app's HTTPS origin.

## 4. Unlock setup and save settings

1. Open <https://app-cuce-beta-cmvjnykp.azurewebsites.net/setup>.
2. Enter your private key in **Setup key** and choose **Unlock setup**. Opening the form does not read the database. The server verifies the key first and grants short-lived read-only access to `/system-info`, then checks the database for the saved deadline and closure state. If those later checks fail, type `/system-info` in the address bar to inspect diagnostics with the verified-key session. A completed setup gate can still show the form, but will refuse unlocking after the correct key is verified.
3. Confirm that the app URL and database checks are correct. Type `/system-info` in the browser address bar to inspect the actual applied/pending migrations and critical setup tables. See [System Info verification](system-info.md).
4. Enter the Canvas client ID and client secret, review session preferences, and choose **Save application settings**. A blank Canvas secret preserves the current value.

The setup key field clears after each attempt. Setup sessions last at most 30 minutes; sensitive operations require key verification within ten minutes. If asked, use **Verify setup key again**. Normal Canvas sign-in is not required to save these settings.

Settings saved here are encrypted in the database. Saving them does not update Azure variables or GitHub secrets. Keep the existing AUTH_SECRET with database backups so the saved settings remain readable.

## 5. Add a permanent administrator

In **Add an administrator**, enter the person's name, contact email and numeric Canvas user ID, then choose **Add administrator**. Use the user ID from `https://cedarville.instructure.com`, not a login name, email, course ID or ID from another Canvas installation. The setup key authorizes this role grant; verify the ID carefully. This prepares the account without requiring working Canvas credentials yet. Existing inactive accounts or conflicting identity mappings are refused, and existing roles are preserved.

Alternatively, use **Or add yourself through Canvas sign-in** to obtain your verified Canvas identity automatically and link it as the administrator.

Before closing setup:

1. Save the approved Canvas client credentials and ensure its developer key allows this callback:

   ```text
   https://app-cuce-beta-cmvjnykp.azurewebsites.net/api/auth/canvas/callback
   ```

2. Select **Open normal staff sign-in**. The intended administrator must sign in through Canvas as the account with the added ID. Adding a contact email alone never grants login access or creates a staff session.
3. Return to setup, select **Refresh setup checks**, and confirm **Normal administrator sign-in has been verified**. The sign-in must happen after the latest administrator addition/link or settings update.

Adding another administrator does not remove earlier administrators. Setup tracks the latest added administrator for the handoff check. If that person is different from you, they must complete their own normal Canvas login before you finish setup.

## 6. Close setup

1. Confirm normal administrator access works.
2. Select the confirmation checkbox and choose **Finish setup and remove temporary access**.
3. In Azure, set `BOOTSTRAP_ENABLED=false`, remove `BOOTSTRAP_KEY`, and apply the changes. You may also remove `BOOTSTRAP_EXPIRES_AT`.

Completion permanently closes the setup gate and revokes all temporary sessions. Saved settings and permanent administrator access remain. Changing the key, moving the deadline forward, or redeploying cannot reopen completed setup.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `/setup` returns 404 | The key-based setup version may not be deployed yet. |
| Setup is disabled or unavailable / HTTP 403 | Check the enable flag, 64-character key, future UTC deadline, stable AUTH_SECRET, beta profile, and whether setup was already closed or expired. |
| Key cannot be verified | Use the exact key saved on the target Azure app, without spaces or quotes. Confirm the latest settings finished applying. |
| HTTP 429 | Wait at least one minute before retrying. Failed guesses are limited to 20 per minute per web process before database access; accepted key sign-ins also have a shared database limit of 20 per minute. |
| Session expired / HTTP 401 | Enter the setup key again while the setup window remains open. |
| HTTP 500, HTTP 503, or startup failure | Ask the Azure administrator to inspect runtime logs for module-loading, database, migration, or private configuration errors. Do not rotate AUTH_SECRET to try to clear the error. Share only redacted errors. |
| Canvas linking fails | Check the client credentials, approved callback, intended Canvas account, and existing staff identity conflicts. |
| Cannot finish setup | Complete a new normal Canvas administrator login after the latest settings update/link, then refresh checks. |

The first successful unlock stores the deadline in the database. Moving the Azure expiration forward does not extend that saved window. If setup has already expired or completed, stop and arrange a separately reviewed recovery with the database administrator; there is no UI reset.

The deployment preserves an existing BOOTSTRAP_KEY and existing optional setup activation values on an established beta app. It defaults missing BOOTSTRAP_ENABLED to false and never renews the deadline. Redeployment does not activate setup by itself.

For implementation details and security boundaries, see [Temporary setup administrator using a private key](../security/initial-setup.md).
