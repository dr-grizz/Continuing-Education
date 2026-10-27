# ADR 0011: Integrated PostgreSQL credentials

Accepted October 27, 2026 at the project owner's request. Supersedes ADR 0008's separate listener, optional startup and SQLite storage. Its portal roles, learner ownership, explicit identity links, immutable snapshots and Canvas evidence requirements remain in force.

The NestJS API owns the badge request handler at `/api/credentials`, on its existing loopback listener. Next's allowlisted broker continues verifying current staff/learner sessions and CSRF before forwarding requests. Private broker tokens stay server-side; direct unauthenticated credential requests remain denied. `npm run dev` starts web and API, including credentials. The API passes its existing PostgreSQL pool to the credential domain; no second database or listening process is created.

Prisma migration `024_integrated_credentials` adds prefixed relational tables to the portal database. Every signing workspace scopes reads/writes and uniqueness. All writes use parameter binding. AsyncLocalStorage keeps all operations in a transaction on one client; transaction-level PostgreSQL advisory locks serialize concurrent mutations for a signing workspace across API instances. PostgreSQL triggers protect published badge, course mapping and certificate snapshots. Signed JSON remains text so storage cannot normalize its signature bytes. Identity keys and server tokens remain private files, not source-controlled data.

Only the explicit legacy import command reads SQLite. It verifies signatures and copies complete records in one transaction after a consistent SQLite backup; conflicting destination workspaces are refused. The running application never opens SQLite. Existing private stores elsewhere are not discovered or migrated automatically. The local portal database was backed up before the additive migration.

Python remains a certificate rendering dependency. This change does not introduce live Canvas enrollment, automatic completion polling, Open Badges certification or a hosted deployment.
