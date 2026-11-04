# Offering and badge skills — November 4, 2026

## Implemented

- New offering dialog and Details editor: optional O*NET skill search, Add/Remove,
  up to 20 selections, retained selection state and normal audited/versioned saves.
- Published course page: names and definitions under **Skills covered**, with
  source/license credit and the public career explorer link.
- Badge publishing: selected draft and published-version skill summaries;
  **Add or edit skills** opens the selected draft in Details with its saved
  assessment statements. Badge approval/issuance still freezes those statements.
- Migration `029_offering_skills`: default-empty JSONB skill coverage, array/limit
  constraint and matching Prisma model. Server-side resolution uses canonical
  immutable O*NET records, not browser-provided labels. Older edits that omit
  skills preserve the saved values; explicit `[]` removes them.

The existing database was backed up privately before the additive migration.
Existing offering publication/version settings and issued awards were retained.
Offering coverage is separate from assessed badge achievements; no award is
issued by selecting an offering skill.

## Verification

- `npm run test:offering-skills`: passed against a disposable PostgreSQL database
  and the real HTTP API: permissions, invalid/forged/duplicate references, create,
  idempotency, staff/public read-back, publish, audited edit, stale version,
  no-op detection, old-client preservation, explicit removal and database constraint.
- `npm run test:migrations`: passed fresh/adopted equivalence, preservation,
  concurrent migrations, recovery/backfill and no Prisma schema drift.
- `npm run test:badges`: 76 domain tests, 114 broker checks and embedded API /
  PostgreSQL persistence passed, including assessed-skill freezing through draft
  approval and paired badge/certificate issuance.
- Offering visibility and Canvas connector integration suites passed; the JSON
  clone fixture explicitly resets skills like its existing outcomes field.
- Typecheck, formatting check, production build and `git diff --check` passed.
- 18 browser/accessibility cases passed in light, dark and phone layouts:
  new offering selection/save/reopen/removal, public course display, publishing
  summary/deep link, and the existing skills explorer/designer/learner regressions.
  Keyboard search/selection and automated WCAG A/AA scans are included.
- A separate anonymous-browser staff session searched the real imported catalog
  and selected Critical Thinking in a new offering dialog without saving; the
  dialog was visually inspected. Tests did not create live offerings or awards.

Manual screen-reader review remains outstanding; automated scans do not establish
complete accessibility compliance. Firefox/WebKit were not run for this change.

See [usage](../skills-and-careers.md#attach-skills-to-offerings-and-badges) and
[ADR 0018](../adr/0018-offering-skill-coverage.md).
