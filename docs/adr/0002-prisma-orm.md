# ADR 0002: Prisma ORM and Prisma Migrate

Status: accepted for the local prototype, October 6, 2026. Supersedes ADR 0001's choice of "plain parameterized PostgreSQL queries … rather than introducing an ORM" and its hand-registered SQL migrations. All other parts of ADR 0001 stand.

Context: queries, TypeScript types and migration registration were maintained separately, and most database rows were untyped. Issue #2 originally proposed Drizzle ORM. Alternatives considered:

- Drizzle: pre-1.0, and cannot express the price-history trigger.
- Kysely: a typed query builder and the smallest change.
- TypeORM, MikroORM, Sequelize, Knex/Objection.

Decision:

- **Prisma 7.10.0**, pinned. npm's `latest` tag pointed to an 8.0 release candidate at the time of the decision. Packages: `prisma` (dev), `@prisma/client` and `@prisma/adapter-pg` over the existing `pg` driver. The generated client is CommonJS and lives in `src/generated/prisma`; it is ignored by Git and generated on install.
- Models keep **snake_case** field names that match the columns, so API responses and the web UI do not change.
- **One migration authority:** `npm run db:migrate` (`scripts/db-migrate.ts`).
  - It holds the legacy advisory lock (21001001).
  - If the database was built by legacy migrations 001–007, it applies any missing legacy migration, verifies all seven are present, and records `prisma/migrations/0_baseline` as applied (`prisma migrate resolve --applied`) without replaying it.
  - It then runs `prisma migrate deploy`.
  - It refuses a database that has application tables but no migration history.
  - `schema_migrations` and `src/domain/001–007` stay as read-only history.
- The **baseline** reproduces the 001–007 schema exactly. Prisma generates the DDL; the hand-added parts are unique constraints matching the legacy definitions, all CHECK constraints, the `offering_prices` append-only function and trigger, and the synthetic seed. Prisma does not model checks, functions or triggers, so any migration that changes them is hand-written. The structural comparison in `npm run test:migrations` guards against drift. Each check and the trigger are also documented with `///` comments in `prisma/schema.prisma`, so they appear in the generated types. Keep these comments when editing the schema, and do not overwrite them with `prisma db pull`.
- **Authoring:** `npm run db:migrate:draft -- <name>` diffs the migrations, replayed into a disposable shadow database, against `schema.prisma`, and writes a reviewable migration wrapped in `BEGIN`/`COMMIT`. Do not run `prisma migrate dev`, `db push` or `migrate reset` against the main database. They can propose resetting it.
- **Transactions:** Prisma does not wrap a migration in a transaction. The failure test showed a partial change left behind, so migrations with several statements wrap themselves in `BEGIN`/`COMMIT`.
- **Data access (Phase 2):** `src/domain/prisma.ts` creates one `PrismaClient` on the existing `pg` pool, keeping the local-only guard in `db.ts`.
  - **Routine reads and simple writes** use the typed client: learner lookup and upsert, operations, approvals, exceptions and their history, price history, settings, report counts, offering create/update/publish, orders, audit events and idempotency records.
  - **Raw SQL stays** where it carries locking or computed columns, through `sql()` (bound parameters only), with row types built from the generated models:
    - offering `FOR UPDATE`
    - `FOR UPDATE OF e`/`e,p`
    - actor-scoped advisory locks
    - final-seat counts
    - the `ON CONFLICT` registration upsert
    - approval expiry
    - the enrollment window
    - seat and registration counts
    - the audit-label joins
    - worker claiming with `FOR UPDATE SKIP LOCKED`
  - **Transactions:** every workflow runs in one interactive transaction (`transaction()`, maxWait 10 s, timeout 20 s), so typed calls and raw statements share one transaction. Prisma cannot read `void`, so advisory locks are wrapped in `SELECT 1 FROM (SELECT pg_advisory_xact_lock(…))`. Counts are cast to integer, because uncast counts come back as bigint.
  - **TypedSQL** was considered and not adopted. `prisma generate --sql` needs a live database during generation, which would break `npm ci` before setup.

Consequences:

- Schema changes have a single reviewed path, and query results can be typed.
- Checks, triggers and seed data remain hand-written SQL.
- The `prisma` CLI (dev only) brings npm audit findings through `deepmerge-ts` and an unused `mysql2` driver. The runtime packages are not flagged. Re-review on upgrade, and do not use `npm audit fix --force` on pinned versions.
- Pre-1.0 and release-candidate tags must not be installed unpinned.
