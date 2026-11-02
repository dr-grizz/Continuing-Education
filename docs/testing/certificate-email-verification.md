# Certificate email verification

Verified locally October 28, 2026 on `codex/individual-progress-cohorts`. These are local results, not remote CI or deployment evidence. All provider calls in tests used a fake transport or an intercepted HTTP boundary. No real email was sent.

## Implemented

- **Email certificate** beside the issued-record **Download PDF** action and in the selected earned-award area; cohort filtering, individual selections, personalized previews and original-PDF review.
- Attachment, seven-day private link or both; links use the configured public HTTPS origin. The fragment token is removed from browser history and posted in the request body rather than sent in the HTTP URL.
- Frozen reviewed content, staff-owned 30-minute previews, authenticated confirmation, durable jobs and append-only attempts/failure/resend history in the portal's PostgreSQL database.
- Duplicate protection across requests and API instances, including changes to message format and email-address capitalization. Explicit individual resends record the previous attempt and a reason. Uncertain outcomes do not automatically retry.
- An optional worker in the existing API process; automatic delivery defaults off, queues only newly created certificate snapshots, and rolls back with issuance. No historical backfill or separate service startup.
- Sender defaults to the requested `continuinged@cedarville.edu`; a Resend transport adapter is available but no provider account or credentials were configured. Demonstration certificate delivery defaults to blocked.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run test:badges` | 60 domain tests passed on disposable PostgreSQL, including 11 email tests for configuration gates, separate/personalized recipients, PDF binding, token scope/expiry/revocation, durable concurrency/duplicate protection, uncertain recovery, explicit resends, missing/changed/inactive identity links, real cohort membership filtering, opt-in automatic delivery and atomic rollback. |
| Portal broker integration (part of `test:badges`) | 75 checks passed using the real credential service and PDF renderer with a mocked identity-provider boundary; new email routes enforce staff scope and same origin, browser recipient/actor overrides cannot establish authority, and the public download endpoint accepts only its limited capability exchange. |
| Embedded API integration (part of `test:badges`) | Passed actual NestJS startup, authorization, common PostgreSQL pool and persistence across API restart. |
| `npm run test:migrations` | Fresh/adopted/repeated/concurrent/refused/failed/recovery paths passed; 979-element structural comparison and Prisma schema no-drift check passed. |
| `npm run test:progress` | Existing individual progress/cohort authorization, immutable evidence, idempotency, membership preservation and reporting checks passed. |
| Email browser suite | 12 Chromium cases passed across light, dark and phone layouts: individual preview/PDF review/confirmation, cohort personalization and invalidation after editing, unconfigured-provider behavior, expired links, token URL/history handling and 320px reflow. Includes keyboard navigation, Escape/focus restoration and axe WCAG A/AA scans. |
| Credential regression browser suite | 13 light-layout cases passed, covering the four email cases plus existing staff workspaces, learner states, unsaved design protection, keyboard use and 320px reflow. |
| `npm run build` | Server compilation and Next.js production build passed. |
| `npm run typecheck`, `npm run format:check`, JavaScript syntax checks and `git diff --check` | Passed. |
| Restarted local app | Authenticated email catalog/history and new public assets returned 200; sender was the requested address, sending was disabled, and automatic delivery was off. |

Migration `026_certificate_email` was applied after a private local backup at ignored `backups/pre-certificate-email.dump`. Existing signed certificate snapshots were preserved. The app was restarted on the normal web/API ports, 3050/3051.

## Remaining boundaries

Manual screen-reader review and Firefox/WebKit checks were not performed for the new flow. Production sender/domain authorization, provider credentials, real sending and institutional approval of the provider remain unverified. Provider acceptance is recorded; inbox delivery, bounce and complaint webhooks are not implemented. Links are private bearer capabilities that may be forwarded; attachments already received cannot be revoked. The inherited deployment audience gate still applies. No commit, push or deployment was performed for this addition.

Configuration and operator steps: [Certificate email](../certificate-email.md). Architecture: [ADR 0015](../adr/0015-certificate-email-delivery.md).
