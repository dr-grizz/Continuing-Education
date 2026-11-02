# Skills and careers verification — October 28, 2026

Implemented locally on the existing `Badges-and-Certificates` checkout; no commit,
push or hosted deployment was performed for this change. Existing unrelated work
was preserved. Runtime records use the main PostgreSQL database.

## Checks

- `npm run test:badges`: **76 domain tests**, **112 portal broker assertions**,
  and the embedded real API/PostgreSQL persistence check passed. Identity-provider
  boundaries and provider error cases use controlled fixtures; cryptographic
  credential, SQL and PDF paths run normally in disposable test databases.
- `npm run test:migrations`: fresh/adopted database equivalence, record preservation,
  concurrent migration serialization, recovery/backfill, and **no Prisma schema
  drift** passed. The composite active-release relation uses the Prisma collection
  representation, avoiding a redundant database uniqueness constraint.
- `npm run typecheck` and `npm run test:hosting`: passed, including exact public
  reference exceptions in Basic-gated mode, retained staff restrictions and
  same-origin public POST checks.
- Production `npm run build`: passed; `/skills` is included in the Next route output.
- Targeted Playwright/axe checks: **12 skills workflow checks** passed across
  light, dark and phone layouts. These cover public skill selection, state wage
  suppression, national projection geography/units, API search/outlook, missing
  configuration, provider throttling, assessed-draft validation/save, and the
  learner's owned award panel. Keyboard selection, focus return and narrow-screen
  reflow are checked. Changing color scheme preserves entered search text.
- Credential regression checks: **27 existing checks** passed across those same
  layouts; badge design, publishing, awards, certificates, issuance register,
  signed-out/unlinked learner handling, keyboard operation and unsaved-change
  protections remain functional. A combined 36-check run passed before the final
  learner panel and explicit theme-preservation checks were added.
- Three Python source-format fixtures verify conversion of projection openings
  from thousands, preservation of suppressed annual wages independently of hourly
  values, and rejection of changed projection units.
- `git diff --check`: passed. A credential scan of changed/non-ignored source
  files found no configured O*NET key; the private ignored `.env` has mode `0600`.

## Live local read-back

The configured private O*NET key successfully retrieved API version **2.0.0**,
ten occupation results for “instructional designer,” and the national outlook for
**25-9031.00 — Instructional Coordinators**. A fresh anonymous browser displayed
the same career results and original provider outlook wording through the portal;
the key was never returned to the browser or printed in verification output.

Anonymous requests through `http://localhost:3050` successfully retrieved the
O*NET **31.0** catalog, Critical Thinking, related occupations and Ohio wage
records. Projection geography remained **US** when the wage region was **OH**.
An anonymous staff skills-catalog request returned **401**.

The local source import contains 8,943 skills/software examples, 1,016 occupations,
63,671 relevance links, 36,998 wage records and 831 projection records; versions
and hashes are in the private import manifest. Later imports do not mutate old
skill definitions or signed award snapshots.

Visual inspection covered the desktop public explorer and real API outlook card;
light/dark/phone automated scans found no WCAG A/AA violations in the tested flows.
Manual screen-reader testing remains outstanding; these checks are not a complete
accessibility certification. Firefox/WebKit were not part of this targeted run.

## Deployment still required

The public reference route is implemented without registration and retains
attribution, including when the demonstration catalog is Basic-gated. This is a
local preview, not a publicly reachable deployment. Publish on the approved HTTPS
host, configure the server key there, and verify/register that application URL
with O*NET before representing the hosted service as available. Per-process API
limits also need central coordination before scaling to multiple API instances.

Sources and usage: [skills documentation](../skills-and-careers.md),
[ADR 0017](../adr/0017-skills-and-public-career-reference.md),
[official O*NET samples](https://github.com/onetcenter/web-services-v2-samples),
[O*NET terms](https://services.onetcenter.org/terms).

## Attribution follow-up

The initial implementation included credit links but omitted the complete
provided USDOL/ETA/trademark sentence and linked graphic. The follow-up adds
that exact wording and the official unmodified **O*NET in-it** SVG, with the
supplied link title, image alternative and 130 × 60 dimensions. Shared credit
appears in staff skills selection, public search/results and learner career
context. A white backing keeps the official graphic legible in dark mode.

All **12 skills Playwright/axe cases** passed again in light, dark and phone
layouts, including a check for the exact credit text and a successfully loaded
local logo with the supplied target URL and title. Hosted gate/CSRF tests passed
with the exact public SVG exception. Existing downloaded-data/CC BY attribution
remains distinct from Web Services credit. Manual screen-reader review remains
outstanding.

Follow-up credential checks passed: **76 domain tests**, **114 broker assertions**
(including the official SVG content type and successful response), embedded
API/PostgreSQL checks, TypeScript checks and `git diff --check`.
