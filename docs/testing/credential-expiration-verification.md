# Credential expiration verification — November 4, 2026

Implemented optional independent expiration dates for badges and certificates; [staff instructions and behavior](../credential-expiration.md), [ADR 0019](../adr/0019-credential-expiration.md).

## Passed checks

- `npm run test:badges`: **85 domain tests**, **114 portal integration checks**, and the embedded API/PostgreSQL restart-and-persistence test passed. All use isolated disposable PostgreSQL databases/workspaces and synthetic identities.
- Nine expiration tests cover blank/invalid/leap dates; the UTC end-of-day boundary; revocation precedence; signed immutable dates; independent badge/certificate status; preserved legacy undated records; manual paired and Canvas-mapped issuance; existing duplicate protection; rejected past-date issuance with transactional rollback; authenticated HTTP persistence/errors; historical PDF download; sharing; claim creation/redemption; email preview/confirmation/send; and previously accepted emailed links after credential expiry. Provider transport is mocked; no live email was sent.
- `npm run test:a11y -- tests/accessibility/pages.spec.ts --grep 'credential expiration' --project=light --project=dark --project=phone`: **12 browser/axe checks passed**. Coverage includes saving/reopening/clearing both dates, keyboard exit from native segmented date fields, record and public expired labels, independent learner certificate dates, expired filtering, historical PDF availability, and blocked email/new sharing. Browser save requests use mocked API routes, so no real awards/templates are created by these UI tests.
- A dark-mode contrast violation in the existing certificate status message was corrected with the portal's theme colors, then the full 12-case matrix passed.
- `npm run typecheck`, `npm run format:check`, production `npm run build`, and `git diff --check` passed.
- Certificate PDF extraction confirmed a single page with the frozen `Valid through YYYY-MM-DD (UTC)` text. Classic and modern sample PDFs were rendered to PNG and visually reviewed: expiration, award date, signature area, footer, and identifiers fit without overlap.
- Regenerated credential workspace assets with `npm run badges:build` (also part of the production build).

Local evidence: `/tmp/ce-credential-expiration-tests-complete.log`, `/tmp/ce-credential-expiration-ui-verified.log`, `/tmp/ce-credential-expiration-types.log`, `/tmp/ce-credential-expiration-format-check.log`, `/tmp/ce-credential-expiration-build.log`; synthetic visual samples `/tmp/ce-expiration-classic.png` and `/tmp/ce-expiration-modern.png`.

## Limits

Manual screen-reader review, Firefox, WebKit, and a full release-wide reflow/forced-colors sweep were not performed for this change. Automated axe and keyboard checks do not establish full WCAG conformance. No live Canvas issuance, real provider delivery, public deployment, renewal process, or Open Badges certification is claimed. Existing signed credentials were not rewritten and no expiration-specific database migration was needed.
