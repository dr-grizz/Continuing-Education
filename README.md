# Continuing Education Portal prototype

Local Next.js + Material UI website, NestJS REST API, PostgreSQL and durable simulated enrollment worker. All offerings and learner data are synthetic. No Stripe, university identity or Canvas service is connected.

## Implementation progress

See the [prototype implementation progress](docs/prototype/implementation-progress.md) for completed tasks, remaining todos, recent changes and verification evidence. The [implementation plan](docs/implementation-plan.md) describes the broader delivery scope and production gates.

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

Stop application processes with Ctrl+C. `docker compose stop db` stops PostgreSQL without removing its persistent volume. Do not use `down -v` unless you intend to erase the prototype data. Setup and migration preserve existing environments/data; seed runs once.

## Try the prototype

1. Browse/search courses and view a course detail page.
2. Register for an open course as the demo learner. In My learning, select **Simulate payment** and watch the worker prepare demo access.
3. Request Healthcare Communication, then use **Staff → Approvals** to approve it. Return to My learning, reserve a seat and simulate payment.
4. Use Staff to create a draft offering, publish it and inspect the audit activity.

Design uses standard MUI navigation, forms, tables, alerts and dialogs. Colors and text branding are provisional; institutional brand assets and course content need review.

## Automation

The API uses `/api/v1`, server-side scope checks and `Idempotency-Key` on writes. Three random prototype tokens live in `.env`: learner, staff and read-only automation. The web demo role selector is local convenience, not production security. Never expose this prototype publicly or add real learner data. API/worker refuse `NODE_ENV=production`.

Read the automation token locally into a shell variable without printing it, then request:

```sh
curl http://localhost:3001/api/v1/reconciliation \
  -H "Authorization: Bearer $CE_AUTOMATION_TOKEN"
```

Public catalog requests need no token. The read-only automation token cannot create offerings or decide approvals. Use the staff token for authorized prototype write experiments; do not embed tokens in committed scripts. OpenAPI describes requests and required command headers. Registration/payment jobs expose their status at `/api/v1/operations/{id}`. OAuth/service-account management and signed outbound notifications are planned, not implemented.

## Verify

```sh
npm run typecheck
npm run build
npm test
```

Integration tests require the website, API and PostgreSQL running. They check authorization, validation, payment-before-approval prevention, idempotency and concurrent final-seat reservation against isolated test records, then remove those records. Production UI/SSO, refunds, transfers, lifecycle automation, exception recovery and live integrations remain future work. See `docs/implementation-plan.md` and `docs/adr/0001-local-prototype.md`.

### Review/test checklist

- [ ] Run the code checks appropriate to the change: type checking, build, and relevant integration tests.
- [ ] Verify the affected workflows in the browser, including empty, loading, success, and error states.
- [ ] **Accessibility:** verify keyboard operation, visible focus, focus order/return, skip navigation, and no keyboard traps.
- [ ] **Accessibility:** check accessible names, form labels, heading structure, landmarks, image alternatives, selected states, and status/error announcements.
- [ ] **Accessibility:** check text/control contrast, touch target sizes, narrow-screen reflow, and zoom behavior.
- [ ] **Accessibility:** run an automated scan when available and manually review the affected workflows with a screen reader. Before release, cover catalog/filtering, spotlight, sign-in, registration, learner status, and staff forms/dialogs/tables.
- [ ] Record evidence, fixes, unresolved findings, and checks not performed; do not describe untested checks as passing or a partial review as WCAG certification.

Accessibility is part of every UI review. Scale checks to the change; a narrow UI change does not require repeating unrelated integration tests. The first manual catalog review is recorded in `docs/prototype/accessibility-check.txt`.

Mock sign-in accepts any email and any password at `/sign-in`. Emails are normalized and saved in the PostgreSQL `learners` table; the password is never saved or sent. An HTTP-only cookie selects the demo learner for 30 days. Sign-out clears that cookie, while registrations remain in the database. Each email has its own course registrations, and staff access remains open for local prototyping. Anyone can sign in as any demo email; this is not production authentication. Existing shared sample registrations remain attached to the legacy email-less learner.

For API automation, use the learner token with `POST /api/v1/prototype/users` and an email JSON body to obtain a learner ID. Pass `X-Prototype-Learner-Id` with that token on learner workflow requests. `GET /api/v1/me` returns the selected learner. Omitting the header selects the legacy sample learner for direct API demos; signed-out web workflow requests are rejected.
