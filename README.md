# Continuing Education Portal prototype

Local Next.js + Material UI website, NestJS REST API, PostgreSQL and durable simulated enrollment worker. All offerings and learner data are synthetic. No Stripe, university identity or Canvas service is connected.

## Implementation progress

Open project decisions, their owners and due dates are tracked in the [M0 decision register](docs/decision-register.md). See the [prototype implementation progress](docs/prototype/implementation-progress.md) for completed tasks, remaining todos, recent changes and verification evidence. The [implementation plan](docs/implementation-plan.md) describes the broader delivery scope and production gates.

## Run locally

Requires Node.js 22+ and running Docker Desktop. From the repository root:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run dev
```

- Website: http://localhost:3000
- API docs: http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/openapi.json
- PostgreSQL: localhost:5433, database `continuing_education`, user `portal`; local password is in ignored `.env`.

**Other devices on your network** (phones, tablets, another computer): run `npm run dev:lan` instead of `npm run dev`. It prints the address to open, such as `http://10.0.0.5:3000`. Only the website listens on the network; the API, worker and database stay on this computer, so the API docs link works only here. Use a trusted network: staff sign-in is mock, with no passwords, so anyone who can reach the address can act as any staff member. Stripe Checkout returns learners to the network address. If macOS asks whether `node` may accept incoming connections, allow it.

Stop application processes with Ctrl+C. `docker compose stop db` stops PostgreSQL without removing its persistent volume. Do not use `down -v` unless you intend to erase the prototype data. Setup and migration preserve existing environments/data; seed runs once.

## Database migrations

[Prisma Migrate](docs/adr/0002-prisma-orm.md) is the single migration authority. `npm run db:migrate` is the only command that changes the schema of a shared or existing database.

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Adopt a legacy database (once), then apply reviewed migrations with `prisma migrate deploy`. Safe to repeat; concurrent runs wait for each other. |
| `npm run db:migrate:status` | Show applied and pending migrations. |
| `npm run db:migrate:draft -- <name>` | Draft a migration from `prisma/schema.prisma` changes, using a disposable shadow database. |
| `npm run db:generate` | Regenerate the typed client (also runs on `npm ci`). |
| `npm run test:migrations` | Migration tests on disposable databases. |

- **Migration names** use three-digit numbers (`000_baseline`, `001_status_enums`, …) so Prisma's alphabetical order matches the real order. `npm run db:migrate` renames history recorded under the earlier one- and two-digit names automatically.
- **New empty database:** `npm run db:migrate` applies `prisma/migrations/000_baseline`, which creates the schema, checks, the price-history trigger and the synthetic seed.
- **Existing database (legacy migrations 001–007):** take a backup (below), then run `npm run db:migrate`.
  - It applies any missing legacy migration, verifies 001–007, and records the baseline as applied without replaying it.
  - Records are untouched, and `schema_migrations` remains as history.
  - A database with application tables but no migration history is refused; investigate it instead of baselining it.
- **Backups:** before adopting or applying a risky migration, back up to the ignored `backups/` folder:

  ```sh
  docker compose exec -T db pg_dump -U portal -d continuing_education -Fc > backups/pre-change.dump
  ```

  Test a restore into a separate database with `pg_restore`. Never restore over the main database without a decision to discard its current data.
- **Writing a migration:**
  1. Edit `prisma/schema.prisma`, then run `npm run db:migrate:draft -- short_name`.
  2. Review the SQL.
  3. Add by hand anything Prisma does not model: CHECK constraints, functions, triggers and data backfills.
  4. Keep the file wrapped in `BEGIN`/`COMMIT`; Prisma does not add a transaction.
  5. Apply it with `npm run db:migrate`.

  Never run `prisma migrate dev`, `prisma db push` or `prisma migrate reset` against the main database; they can propose a reset.
- **Backfills and incompatible changes:** use expand → backfill → contract.
  1. Add the new column or table.
  2. Backfill in the same migration, or in a follow-up migration.
  3. Switch the code over.
  4. Remove the old structure in a later migration.

  Do not rename or drop a column in the same release that stops using it.
- **Failed migration:** `migrate deploy` refuses to continue while a migration is marked failed.
  1. Inspect the database. A migration without `BEGIN`/`COMMIT` can leave partial changes.
  2. Undo any partial change by hand.
  3. Run `npx prisma migrate resolve --rolled-back <name>`.
  4. Fix or replace the migration file. Ship a corrected migration under a new name if the old one was already shared.
  5. Run `npm run db:migrate`.

  There is no automatic undo. A mistake that was applied successfully is fixed with a new corrective migration, or by restoring a backup.

## Try the prototype

1. Browse/search courses and view a course detail page.
2. Register for an open course as the demo learner. In My learning, select **Simulate payment** and watch the worker prepare demo access.
3. Request Healthcare Communication, then open **Staff**, sign in as a demo staff member with the Approver role, and approve it in **Approvals**. Return to My learning, reserve a seat and simulate payment.
4. Use Staff to create a draft offering, publish it and inspect the audit activity. This needs the Catalog manager role.
5. **Explore, collections and pathways.** The catalog opens on **Explore**: featured pathways, collections and courses. Open the Data-Informed Leader pathway and select **Follow pathway**, then **Save course** on any course page. Both appear in My learning, where the pathway marks your **Next** course; neither registers you. Signed-in learners land on My learning, with enrolled courses (**Enrolled courses**) above registrations in progress. As Casey Catalog Manager, use **Staff → Collections** to create, reorder and publish collections and pathways, and **Staff → Explore page** to choose what Explore features.
6. In **Staff → Exceptions**, set *Outcome for new payments* to a failure, then simulate a payment in My learning. Watch the automatic retries, then review the exception in Staff and retry provisioning or record a manual enrollment with a reason. Set the outcome back to *Normal* afterwards; it applies to every demo learner.
7. **Try the roles.** Use **Switch staff member** to act as each demo staff member:
   - Avery Approver can decide approvals but not edit offerings.
   - Casey Catalog Manager manages offerings, collections and pathways. Each offering has its own page (Overview, Details, Settings, Sales page, Activity).
   - Sam Support and Ivy (IT/Canvas) recover exceptions.
   - Cory Content Editor opens an offering in **Staff → Offerings** and, on its **Sales page** tab, writes the course's sales page in a rich text editor (headings, lists, links, uploaded images and embedded videos). Collections and pathways have their own pages too (Overview, Details, Sales page, Activity), opened from their titles in **Staff → Collections**, previews them and publishes them; a published page replaces the course's default description. Cory also chooses the Explore tab picks, with catalog managers.
   - The Demo Staff Administrator holds every role and manages people in the **Staff** and **Roles** tabs. Staff administrators also see sales on the **Dashboard** tab (other staff see enrollment only) and **Transactions**, where they and Sam Support record refund requests for the university Finance department, which issues refunds in Stripe. The portal has no Finance role (removed October 8, 2026): Finance works in Stripe, not in the portal.

   - In **Learners**, any staff member can inspect a learner's registrations and activity. Sam Support can deactivate or reactivate a learner, with a reason; a deactivated learner cannot sign in or act.

   Staff sign-in is mock: no password, and anyone can pick anyone. See [ADR 0004](docs/adr/0004-staff-roles-mock-sign-in.md); university SSO replaces it later.

Design uses standard MUI navigation, forms, tables, alerts and dialogs. The [UI specification](docs/prototype/ui-specification.md) records the theme tokens, layouts, patterns and page behavior. Colors, the font and text branding are provisional; institutional brand assets and course content need review.

## Stripe sandbox (optional)

Payments are simulated unless a Stripe **test-mode** key is configured ([ADR 0005](docs/adr/0005-stripe-hosted-checkout.md)). To use your sandbox:

1. Add `STRIPE_SECRET_KEY=sk_test_…` to `.env` yourself; never commit or share it. Live keys are refused.
2. Install the Stripe CLI (`brew install stripe/stripe-cli/stripe`), run `stripe login`, then forward webhooks and copy the printed `whsec_…` into `.env` as `STRIPE_WEBHOOK_SECRET`:

   ```sh
   stripe listen --forward-to http://127.0.0.1:3001/api/v1/webhooks/stripe
   ```

3. Restart `npm run dev`. Reserved seats in My learning now show **Pay with Stripe**. Pay with test card `4242 4242 4242 4242` (any future date, any CVC); `4000 0000 0000 9995` is declined.

For the university Finance department and whoever hosts the portal, [How the portal works with Stripe](docs/finance/stripe-integration.md) explains the payment and refund flows, the refund handoff to Finance, what is shared with Stripe, and what the portal needs from the university's Stripe account. Only the signed webhook marks a payment paid; the page Stripe returns to is informational. No tax is collected. Refunds are processed by Finance in the Stripe Dashboard; the portal does not issue them.

## Automation

The API uses `/api/v1`, server-side scope checks and `Idempotency-Key` on writes. Three random prototype tokens live in `.env`: learner, staff and read-only automation. Staff act as a mock-signed-in demo staff member whose roles decide their scopes; this is local convenience, not production security. Never expose this prototype publicly or add real learner data. API/worker refuse `NODE_ENV=production`.

Read the automation token locally into a shell variable without printing it, then request:

```sh
curl http://localhost:3001/api/v1/reconciliation \
  -H "Authorization: Bearer $CE_AUTOMATION_TOKEN"
```

Public catalog requests need no token. The read-only automation token cannot create offerings or decide approvals. The staff token alone only performs mock staff sign-in (`POST /api/v1/prototype/staff-sessions` with an email, and `GET /api/v1/prototype/staff-directory`). To act as staff, also send `X-Prototype-Staff-Id` with an active staff member's ID; that member's roles decide the scopes, and audit entries record them as `staff:<id>`. Do not embed tokens in committed scripts. OpenAPI describes requests and required command headers. Registration/payment jobs expose their status at `/api/v1/operations/{id}`. `GET /api/v1/exceptions` lists failed provisioning for staff and the read-only automation token; only staff with the Support or IT/Canvas administrator role can change the simulation (`/api/v1/prototype/simulation`) or recover exceptions. OAuth/service-account management and signed outbound notifications are planned, not implemented.

## Verify

```sh
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:migrations
npm run test:a11y
```

`npm run test:a11y` runs the automated accessibility checks with Playwright. Run `npx playwright install chromium firefox webkit` once first.
- **axe (WCAG 2.2 A and AA):** the catalog tabs, sign-in, course detail, collection pages, My learning, the placeholder Canvas dialog, the staff sign-in screen, every staff tab and the main staff dialogs. They run in Chrome (light, dark and phone layouts), Firefox and WebKit.
- **Forced colors** (Windows High Contrast): the header, the selected tab, the selected layout, filled buttons and focus rings stay visible.
- **Reflow and text resizing:** no page scrolls horizontally at 320 px wide (400% zoom), with 200% text, or with increased text spacing.

Run one group with `--project`, for example `npm run test:a11y -- --project=firefox`. The checks catch only part of WCAG; the [VoiceOver review script](docs/prototype/screen-reader-review.md) covers what needs a person. Remove a synthetic learner and their records with `npm run db:remove-test-learner -- <email>` (reserved test domains only).

**Continuous integration:** `.github/workflows/ci.yml` runs all of the above on every pull request, against a throwaway PostgreSQL service with synthetic data. It never deploys or connects to external systems. Pull requests and pushes that change only documentation (`docs/**` or Markdown files) skip it; start it by hand from the Actions tab if needed. If the scans fail, the job uploads the Playwright report.

Integration tests require the website, API and PostgreSQL running. Both the integration tests and the accessibility scans remove the records they create, so local runs leave the database unchanged. They check authorization, validation, payment-before-approval prevention, idempotency and concurrent final-seat reservation against isolated test records, then remove those records. Production UI/SSO, refunds, transfers, lifecycle automation, exception recovery and live integrations remain future work. See `docs/implementation-plan.md` and `docs/adr/0001-local-prototype.md`.

### Review/test checklist

- [ ] Run the code checks appropriate to the change: type checking, build, and relevant integration tests.
- [ ] Verify the affected workflows in the browser, including empty, loading, success, and error states.
- [ ] **Accessibility:** verify keyboard operation, visible focus, focus order/return, skip navigation, and no keyboard traps.
- [ ] **Accessibility:** check accessible names, form labels, heading structure, landmarks, image alternatives, selected states, and status/error announcements.
- [ ] **Accessibility:** check text/control contrast, touch target sizes, narrow-screen reflow, and zoom behavior.
- [ ] **Accessibility:** run `npm run test:a11y` (add new pages or dialogs to `tests/accessibility/pages.spec.ts`) and manually review the affected workflows with a screen reader. Before release, cover the catalog tabs and filtering, sign-in, registration, learner status, and staff forms/dialogs/tables.
- [ ] Record evidence, fixes, unresolved findings, and checks not performed; do not describe untested checks as passing or a partial review as WCAG certification.

Accessibility is part of every UI review. Scale checks to the change; a narrow UI change does not require repeating unrelated integration tests. The first manual catalog review is recorded in `docs/prototype/accessibility-check.txt`.

Mock sign-in accepts any email and any password at `/sign-in`. Emails are normalized and saved in the PostgreSQL `learners` table; the password is never saved or sent. An HTTP-only cookie selects the demo learner for 30 days. Sign-out clears that cookie, while registrations remain in the database. Each email has its own course registrations, and staff use a separate mock staff sign-in (ADR 0004). Anyone can sign in as any demo email; this is not production authentication. Existing shared sample registrations remain attached to the legacy email-less learner.

For API automation, use the learner token with `POST /api/v1/prototype/users` and an email JSON body to obtain a learner ID. Pass `X-Prototype-Learner-Id` with that token on learner workflow requests. `GET /api/v1/me` returns the selected learner. Omitting the header selects the legacy sample learner for direct API demos; signed-out web workflow requests are rejected.
