# Continuing Education Portal prototype

Local Next.js + Material UI website, NestJS REST API, PostgreSQL and request-driven simulated enrollment. Seeded offerings and learner/payment test data are synthetic; the configured Canvas connection can import real course metadata into unpublished drafts. Stripe sandbox Checkout is supported when configured; learner login can use existing CU accounts through [Canvas OAuth](docs/canvas-learner-auth.md), while guest provisioning and Canvas enrollment remain simulated. Staff can use configurable Canvas OAuth and opt-in [Canvas course previews and synchronization](docs/canvas-courses.md), using that same OAuth connection. Explicit selected-course sync creates unpublished offering drafts with duplicate protection, preserved staff edits and required-information warnings; Canvas API access remains read-only. See [Canvas staff authentication](docs/canvas-staff-auth.md).

## Implementation progress

Start with the [next steps](docs/next-steps.md) for the current checkpoint and recommended work sequence. Open project decisions, their owners and due dates are tracked in the [M0 decision register](docs/decision-register.md). See the [prototype implementation progress](docs/prototype/implementation-progress.md) for completed tasks, remaining todos, recent changes and verification evidence. The [implementation plan](docs/implementation-plan.md) describes the broader delivery scope and production gates.

Course managers can independently control [listed and unlisted visibility](docs/offering-visibility.md) in offering Settings. Published/unlisted offerings accept direct-link registrations but stay out of public discovery. Canvas refreshes and unpublish/republish preserve the preference; existing paid/saved learner records remain available.

The [demo deployment plan](docs/hosting/deployment-plan.md) contains the Azure overview and detailed diagrams, the equivalent Railway diagram, and preparation and verification steps for the combined web/API container.

## Run locally

Requires Node.js 22+ and running Docker Desktop. From the repository root:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run dev
```

- Website: http://localhost:3050
- API docs: http://localhost:3051/api/docs
- OpenAPI JSON: http://localhost:3051/api/openapi.json
- PostgreSQL: localhost:5433, database `continuing_education`, user `portal`; local password is in ignored `.env`.

**Other devices on your network** (phones, tablets, another computer): run `npm run dev:lan` instead of `npm run dev`. It prints the address to open, such as `http://10.0.0.5:3050`. Only the website listens on the network; the API and database stay on this computer, so the API docs link works only here. Use a trusted network: the default staff sign-in mode is mock, with no passwords, so anyone who can reach the address can act as any staff member. Stripe Checkout returns learners to the network address. If macOS asks whether `node` may accept incoming connections, allow it.

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
2. Register for an open course as the demo learner. In My learning, select **Simulate payment** and see simulated access complete.
3. Request Healthcare Communication, then open **Staff**, sign in as a demo staff member with the Approver role, and approve it in **Approvals**. Return to My learning, reserve a seat and simulate payment.
4. Use Staff to create a draft offering, publish it and inspect the audit activity. This needs the Catalog manager role.
5. **Explore, collections and pathways.** The catalog opens on **Explore**: featured pathways, collections and courses. Open the Data-Informed Leader pathway and select **Follow pathway**, then **Save course** on any course page. Both appear in My learning, where the pathway marks your **Next** course; neither registers you. Signed-in learners land on My learning, with enrolled courses (**Enrolled courses**) above registrations in progress. As Casey Catalog Manager, use **Staff → Collections** to create, reorder and publish collections and pathways, and **Staff → Explore page** to choose what Explore features.
6. In **Staff → Exceptions**, set *Outcome for new payments* to a failure, then simulate a payment in My learning. Watch the automatic retries, then review the exception in Staff and retry provisioning or record a manual enrollment with a reason. Set the outcome back to *Normal* afterwards; it applies to every demo learner.
7. **Try the roles.** Use **Switch staff member** to act as each demo staff member:
   - Avery Approver can decide approvals but not edit offerings.
   - Casey Catalog Manager manages offerings, collections and pathways. Each offering has its own page (Overview, Details, Settings, Sales page, Activity).
   - Sam Support and Ivy (IT/Canvas) recover exceptions.
   - Cory Content Editor opens an offering in **Staff → Offerings** and, on its **Sales page** tab, writes the course's sales page in a rich text editor (headings, lists, links, uploaded images and embedded videos), previews them and publishes them; a published page replaces the course's default description. Cory also chooses the Explore tab picks, with catalog managers.
   - The Demo Staff Administrator holds every role and manages people in the **Staff** and **Roles** tabs. Staff administrators also see sales on the **Dashboard** tab (other staff see enrollment only) and **Transactions**, where they and Sam Support record refund requests for the university Finance department, which issues refunds in Stripe. The portal has no Finance role (removed October 8, 2026): Finance works in Stripe, not in the portal.

   - In **Learners**, any staff member can inspect a learner's registrations and activity. Sam Support can deactivate or reactivate a learner, with a reason; a deactivated learner cannot sign in or act.

   Default staff sign-in is mock: no password, and anyone can pick anyone. See [ADR 0004](docs/adr/0004-staff-roles-mock-sign-in.md). Configure [Canvas staff OAuth](docs/canvas-staff-auth.md) to require verified, explicitly linked identities.

Design uses standard MUI navigation, forms, tables, alerts and dialogs. The [UI specification](docs/prototype/ui-specification.md) records the theme tokens, layouts, patterns and page behavior. Colors, the font and text branding are provisional; institutional brand assets and course content need review.

## Request-driven demo (no worker)

`npm run dev` starts only web and API. A verified payment webhook (or simulated payment) records the order and completes normal simulated enrollment in one database transaction. No Canvas accounts or enrollments are created. Delayed/failure simulations retain durable retry state and advance on authenticated API requests, including My learning polling; they pause when nobody makes requests and resume when a learner or staff member returns. Reservations and approvals are expired during authenticated requests; health checks do not run this work.

Canvas previews run during staff page requests, with the existing bounded provider timeout, private encrypted previews and explicit import gate. Scheduled previews are deferred; saved schedule configuration is retained but never executed. The settings panel explains the limitation and enabling a schedule is rejected.

For a missed Stripe webhook, Support or a Staff administrator can use **Admin → Transactions → Check Stripe payments**. It checks up to five unresolved sessions past expiry, fulfills verified payments, releases confirmed expired reservations and leaves uncertain results pending. Repeat if more sessions remain. This is manual recovery, not automatic reconciliation. Production account provisioning/enrollment will need an on-demand durable job runner.

This change does not deploy the demo or remove the local-only guard. See [ADR 0008](docs/adr/0008-request-driven-demo.md).

## Seat capacity

In an offering's Details, enter 1–10,000 seats or explicitly select **Unlimited seats**. Unlimited disables the capacity field and removes the seat limit; dates, approval rules and payment requirements still apply. Blank capacity without that option remains incomplete. Returning to a finite limit requires enough seats for current reservations/enrollments; changes to published offerings retain the audited reason requirement. Staff/learner screens and dashboard exports distinguish Unlimited from Not set.

## Course display images

Imported courses use their Canvas course card image, with the CU CE image as the fallback. Course managers can change this in **Admin → Offerings → Details → Change image**: upload an image (PNG/JPEG/WebP/GIF, up to 5 MB), choose CU CE, or return to the Canvas/default image. Changes save independently of required draft details. Uploads and explicit CU CE choices stay in the portal and survive Canvas refreshes. All other staff-owned offering fields also remain unchanged by sync. See [image behavior and API](docs/canvas-courses.md#portal-owned-image-choice).

## Stripe sandbox (optional)

Payments are simulated unless a Stripe **test-mode** key is configured ([ADR 0005](docs/adr/0005-stripe-hosted-checkout.md)). To use your sandbox:

1. Add `STRIPE_SECRET_KEY=sk_test_…` to `.env` yourself; never commit or share it. Live keys are refused.
2. Install the Stripe CLI (`brew install stripe/stripe-cli/stripe`), then run `stripe login`. Use the same Stripe account/sandbox as the app's `STRIPE_SECRET_KEY`.
3. In a separate terminal, start the listener with the events the portal handles:

   ```sh
   stripe listen \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded \
     --forward-to http://127.0.0.1:3051/api/v1/webhooks/stripe
   ```

   The installed CLI requires event selection. If it reports `must specify events to forward`, include `--events` as above. To forward all snapshot events instead, use:

   ```sh
   stripe listen --all-snapshot --forward-to http://127.0.0.1:3051/api/v1/webhooks/stripe
   ```

   Both commands use test mode by default. Keep this terminal running throughout the demo; do not add `--live`.
4. When the listener reports **Ready**, copy its printed `whsec_…` signing secret directly into the ignored root `.env` as `STRIPE_WEBHOOK_SECRET`. Do not post or commit it. Use the secret from this listener, not a Dashboard endpoint's secret.
5. Start the app in another terminal with `npm run dev`, or stop and restart it if already running so the API loads the signing secret. On later listener starts, update `.env` and restart the app if the printed secret changes.
6. Reserved seats in My learning now show **Pay with Stripe**. Pay with test card `4242 4242 4242 4242` (any future date, any CVC); `4000 0000 0000 9995` is declined. The listener should show forwarded events and the app's HTTP responses.

For the university Finance department and whoever hosts the portal, [How the portal works with Stripe](docs/finance/stripe-integration.md) explains the payment and refund flows, the refund handoff to Finance, what is shared with Stripe, and what the portal needs from the university's Stripe account. Only the signed webhook marks a payment paid; the page Stripe returns to is informational. No tax is collected. Refunds are processed by Finance in the Stripe Dashboard; the portal does not issue them.

## Automation

The API uses `/api/v1`, server-side scope checks and `Idempotency-Key` on writes. Three random prototype tokens live in `.env`: learner, staff and read-only automation. Staff act as a mock-signed-in demo staff member whose roles decide their scopes; this is local convenience, not production security. Never expose this prototype publicly or add real learner data. The API refuses `NODE_ENV=production`.

Read the automation token locally into a shell variable without printing it, then request:

```sh
curl http://localhost:3051/api/v1/reconciliation \
  -H "Authorization: Bearer $CE_AUTOMATION_TOKEN"
```

Public catalog requests need no token. The read-only automation token cannot create offerings or decide approvals. In mock mode, the staff token alone only performs mock staff sign-in (`POST /api/v1/prototype/staff-sessions` with an email, and `GET /api/v1/prototype/staff-directory`). To act as staff, also send `X-Prototype-Staff-Id` with an active staff member's ID; that member's roles decide the scopes, and audit entries record them as `staff:<id>`. Do not embed tokens in committed scripts. OpenAPI describes requests and required command headers. Registration/payment jobs expose their status at `/api/v1/operations/{id}`. `GET /api/v1/exceptions` lists failed provisioning for staff and the read-only automation token; only staff with the Support or IT/Canvas administrator role can change the simulation (`/api/v1/prototype/simulation`) or recover exceptions. Canvas-mode staff requests instead require a valid `X-Staff-Session` from the trusted web backend; mock selection is disabled. See [Canvas staff authentication](docs/canvas-staff-auth.md) for configuration and approved identity linking. Sync credentials/service-account management and signed outbound notifications remain planned.

## Verify

Use the [systematic test cases](docs/testing/use-cases.md) for role-based manual, integration and recovery testing, and copy the [test run record](docs/testing/test-run-template.md) to record actual results and outstanding coverage. The [security test cases](docs/testing/security-test-cases.md) cover adversarial checks and distinguish implemented controls from mock-identity and hosted-release gaps.

```sh
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:migrations
npm run test:auth
npm run test:learner-auth
npm run test:visibility
npm run test:canvas
npm run test:demo
npm run test:a11y
```

`npm run test:a11y` runs the automated accessibility checks with Playwright. Run `npx playwright install chromium firefox webkit` once first.
- **axe (WCAG 2.2 A and AA):** the catalog tabs, sign-in, course detail, collection pages, My learning, the placeholder Canvas dialog, the staff sign-in screen, every staff tab and the main staff dialogs. They run in Chrome (light, dark and phone layouts), Firefox and WebKit.
- **Forced colors** (Windows High Contrast): the header, the selected tab, the selected layout, filled buttons and focus rings stay visible.
- **Reflow and text resizing:** no page scrolls horizontally at 320 px wide (400% zoom), with 200% text, or with increased text spacing.

Run one group with `--project`, for example `npm run test:a11y -- --project=firefox`. The checks catch only part of WCAG; the [VoiceOver review script](docs/prototype/screen-reader-review.md) covers what needs a person. Remove a synthetic learner and their records with `npm run db:remove-test-learner -- <email>` (reserved test domains only).

**Continuous integration:** `.github/workflows/ci.yml` runs all of the above on every pull request, against a throwaway PostgreSQL service with synthetic data. It never deploys or connects to external systems. Pull requests and pushes that change only documentation (`docs/**` or Markdown files) skip it; start it by hand from the Actions tab if needed. If the scans fail, the job uploads the Playwright report.

Integration tests require the website, API and PostgreSQL running. Both the integration tests and the accessibility scans remove the records they create, so local runs leave the database unchanged. They check authorization, validation, payment-before-approval prevention, idempotency and concurrent final-seat reservation against isolated test records, then remove those records. Canvas staff OAuth is implemented with mocked-provider coverage; live SSO/MFA testing awaits configuration. Production hosting, pre-account guest authentication/provisioning, transfers, lifecycle automation and live Canvas enrollment remain future work. Existing-account learner Canvas OAuth has isolated mocked-provider coverage; live learner login remains to be verified. See `docs/implementation-plan.md` and `docs/adr/0001-local-prototype.md`.

### Review/test checklist

- [ ] Run the code checks appropriate to the change: type checking, build, and relevant integration tests.
- [ ] Verify the affected workflows in the browser, including empty, loading, success, and error states.
- [ ] **Accessibility:** verify keyboard operation, visible focus, focus order/return, skip navigation, and no keyboard traps.
- [ ] **Accessibility:** check accessible names, form labels, heading structure, landmarks, image alternatives, selected states, and status/error announcements.
- [ ] **Accessibility:** check text/control contrast, touch target sizes, narrow-screen reflow, and zoom behavior.
- [ ] **Accessibility:** run `npm run test:a11y` (add new pages or dialogs to `tests/accessibility/pages.spec.ts`) and manually review the affected workflows with a screen reader. Before release, cover the catalog tabs and filtering, sign-in, registration, learner status, and staff forms/dialogs/tables.
- [ ] Record evidence, fixes, unresolved findings, and checks not performed; do not describe untested checks as passing or a partial review as WCAG certification.

Accessibility is part of every UI review. Scale checks to the change; a narrow UI change does not require repeating unrelated integration tests. The first manual catalog review is recorded in `docs/prototype/accessibility-check.txt`.

With `LEARNER_AUTH_MODE=canvas`, learners sign in through their existing CU Canvas account, including staff acting as learners. The portal creates or reuses a learner by verified Canvas origin/user ID, uses a revocable opaque session and never grants staff roles from learner login. Existing demo registrations are preserved without automatic email matching. See [Canvas learner sign-in](docs/canvas-learner-auth.md). Guest account creation after payment remains future work.

With `LEARNER_AUTH_MODE=mock` (the local default), mock sign-in accepts any email and any password at `/sign-in`. Emails are normalized and saved in the PostgreSQL `learners` table; the password is never saved or sent. An HTTP-only cookie selects the demo learner for 30 days. Sign-out clears that cookie, while registrations remain in the database. Each email has its own course registrations, and staff use either mock sign-in (ADR 0004) or explicitly configured [Canvas OAuth](docs/canvas-staff-auth.md). Anyone can sign in as any demo email; this is not production authentication. Existing shared sample registrations remain attached to the legacy email-less learner.

In learner mock mode only, use the learner token with `POST /api/v1/prototype/users` and an email JSON body to obtain a learner ID. Pass `X-Prototype-Learner-Id` with that token on learner workflow requests. `GET /api/v1/me` returns the selected learner. Omitting the header selects the legacy sample learner for direct API demos; signed-out web workflow requests are rejected.
