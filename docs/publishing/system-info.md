# Verify database migrations with System Info

Open `/system-info` on the app you want to inspect. For local testing, use <https://localhost:3050/system-info>. After this feature is deployed, the beta address is <https://app-cuce-beta-cmvjnykp.azurewebsites.net/system-info>.

## Access

Sign in through `/staff` as an active **Staff administrator**, or verify your private key at `/setup`, then type `/system-info` in the address bar. Key verification grants up to ten minutes of read-only diagnostic access even when the subsequent database/setup-session check fails. There are no in-app navigation links to System Info. Keep that session in the same browser. Other staff roles and anonymous requests cannot read the diagnostic report. A normal staff administrator can use this page after setup has been permanently closed.

Select **Refresh system information** to make a new read-only check. The page does not poll continuously, run SQL entered by users, apply migrations or repair database state. It never shows a connection string, database password, authentication token, setup key or stored application secret. Known database errors show a safe category and actionable message, such as authentication failure, missing permissions, unavailable connection, timeout, missing table/column or TLS certificate failure. Raw driver messages and SQL are never displayed.

## What to inspect

- **Revision:** compare this commit ID with the GitHub deployment's commit. Local builds indicate when tracked files included uncommitted changes. The manifest time is when build metadata was generated, not when Azure last restarted.
- **Startup migrations:** confirms whether this running web process has MIGRATE_ON_START=true. A local environment can legitimately show disabled after migrations were run manually.
- **Database query / migration history:** confirms that this web process can query its configured database and whether `_prisma_migrations` exists.
- **Migration rows:** compares the migrations included in this build, including their SQL checksums, with the database's recorded results. Look for `025_bootstrap_setup` and `026_bootstrap_key` when diagnosing initial setup.
- **Critical tables:** checks that the staff, setup-session, setup-control, setup-key-limit and encrypted-settings tables exist in the public schema.

“All shipped migrations are applied and the critical tables are present” is the expected result. It does not prove that every column, index, constraint or business record is correct. The report checks this web process's DATABASE_URL; it cannot prove a separately configured process uses the same database.

## Interpreting warnings

| Result | Meaning and next step |
| --- | --- |
| Pending | A migration shipped in this build has no active applied record. Review startup migration configuration and logs. |
| Failed | An unresolved migration attempt has no finished timestamp. An authorized administrator must inspect and recover it before retrying. |
| Checksum mismatch | The SQL shipped in this build differs from the applied migration record. Investigate the version/history mismatch; do not change checksums blindly. |
| Rolled back | Only rolled-back attempts exist for that expected migration. It still needs a successful application. |
| Unrecognized migrations | The database records active migrations absent from this build. The database may be ahead of the deployed code. Do not remove records or downgrade blindly. |
| Missing critical table | Migration history alone is insufficient: an expected table is absent. Investigate schema state or the configured database. |
| Database unavailable | The read-only check could not complete. Review connectivity, query permissions and runtime logs privately. |
| Administrator access could not be verified | Authentication itself depends on the database/API or setup module and could not complete. No privileged diagnostic details are disclosed. |
| Empty or invalid response | The request failed before producing the expected JSON. The page shows HTTP status instead of a JSON parsing exception. |

The app must already be running to serve System Info. If a startup migration failure prevents both web and API processes from starting, use Azure startup/runtime logs; an in-app page cannot diagnose an app that never starts. The public `/api/health` remains a separate, database-independent liveness check and does not prove migrations are current.

The page is private/no-store and requires a fresh authorization check on every request. The diagnostic API is GET-only at `/api/system-info`; sending prototype role headers alone grants no access. Diagnostic authorization uses its own signed proof and does not require a database session. It respects the current key, AUTH_SECRET, origin, enabled flag and environment deadline. It never authorizes setup writes or reopens a completed gate. An existing full setup session can also authorize reads after its normal database validation. Invalid capabilities do not grant diagnostic access.
