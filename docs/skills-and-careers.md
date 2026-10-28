# Skills and career information

## Using the portal

Open **Skills and careers** in the main menu, or `/skills`, without signing in.
Search O*NET skill names or software, select relevant results, and choose **Find
related occupations**. Select a wage region to compare the imported BLS median
wage estimates. National outlook stays national, regardless of the wage region.
Missing estimates display **Not published**, including the source suppression
marker when available; a missing value is never presented as zero.

The **Search occupations with O*NET** section searches current API career titles.
Choose **View O*NET outlook** for original national outlook information. Provider
retrieval time is labeled separately from source publication dates; retrieved
responses may be cached for up to 24 hours. The API reference area is available
to visitors as well as staff and learners. No learner identity or evidence is
sent to O*NET.

In **Admin → Badge designer → Details → Assessed skills**, select a skill and
explain how the learner demonstrates it, including the assessment, standard or
documented evidence. For example: “Compare two instructional approaches against
the case-study rubric, earning at least 80%.” Save the draft, then use the normal
approval and award workflow. Published versions and issued badges retain the
source definition and institutional assessment statement. A certificate issued
with that badge represents the same accomplishment. Previously issued awards
without skill alignments remain unchanged.

Learners with aligned awards can open **Skills and career connections** in
**My Badges**. This view uses the learner's owned award, not an email match or a
browser-selected learner. Reference search results alone never confer a skill,
badge, certificate, or employment qualification.

## Server configuration

Set `ONET_API_KEY` in the private server environment, never a `NEXT_PUBLIC_`
variable or committed file. Restart `npm run dev` after changing it. Run:

```sh
npm run skills:verify-api
```

This checks the official version endpoint, keyword search and one occupation's
outlook without printing the credential. Without a key, the API controls are
disabled while downloaded reference data remains available. Credential rejection,
provider throttling and outages have explicit messages and manual retry controls.

To install the downloaded reference datasets after database migration:

```sh
npm run db:migrate
npm run skills:import
# Reuse previously downloaded files without contacting source sites:
npm run skills:import -- --offline
```

The importer uses the main app's PostgreSQL database and writes private source
files and a hash manifest under `badge-service/data/labor-market-import/` (or
`BADGE_DATA_DIR`). It uses `LABOR_IMPORT_PYTHON`, `CERTIFICATE_PYTHON`, or `python3`
with the standard library. These source files are not served by the portal.
Imports are version-pinned to O*NET 31.0, BLS May 2025 OEWS and 2025–2035
projections; future release/schema/year changes need a reviewed importer update.

The API client allows only the official HTTPS host, uses an 8-second timeout,
rejects redirects and oversized responses, and coalesces simultaneous identical
requests. It permits at most four outbound requests per second and 49,000 per
UTC day **per process**, plus provider Retry-After cooldown. Coordinate limits
centrally before running multiple API processes or other clients on the same key.

## Attribution and publication

O*NET API information includes a prominent link to
[O*NET Web Services](https://services.onetcenter.org/); downloadable skills also
identify the release and [CC BY 4.0 license](https://www.onetcenter.org/license_db.html).
BLS statistics identify the period, geography and source. Institutional assessment
statements are labeled separately from source definitions.

The shared credit now includes the supplied **O*NET in-it** linked graphic at
130 × 60 pixels, its provided link title and alternative text, and the complete
USDOL/ETA acknowledgment and trademark sentence from
[How to Credit Us](https://services.onetcenter.org/help/license_data).
It appears beside skill selection, before related-occupation results (including
the learner's owned award view), and beside API occupation search. Downloaded
database attribution and its separate CC BY license remain alongside this credit.
The official SVG is served unchanged from the portal's own static assets so it
works under the existing image security policy and the public Basic-gate exception.
Original graphic: <https://www.onetcenter.org/image/link/onet-in-it.svg>;
SHA-256: `df2a16f0517c0f2057a36cfcd091908796f26e981d18bcc00f3b1e0364a68400`.

The free `/skills` area and its specific public reference APIs remain available
without registration even when the demo catalog uses Basic authentication.
Existing staff/learner APIs remain protected; same-origin checks and hosted
request limits still apply. Publishing on a publicly reachable HTTPS host and
registering that application's URL with O*NET remain deployment steps; localhost
does not make this development instance publicly accessible. See the
[O*NET terms](https://services.onetcenter.org/terms).

See [verification](testing/skills-and-careers-verification.md) and
[ADR 0017](adr/0017-skills-and-public-career-reference.md).

## Recommended student-facing additions (proposals)

Beyond the existing public explorer and learner award context, prioritize:

| Priority | Placement | Proposed student benefit |
| --- | --- | --- |
| 1 | Public course details | Before enrolling, see staff-mapped assessed skills, related occupations, and dated wages/outlook with source credit. |
| 2 | My learning | See assessed skills earned through credentials, skills targeted by enrolled courses, and links to relevant learning/evidence; clearly distinguish learning progress from verified skill attainment. |
| 3 | Career goals and pathways | Choose a target occupation, compare its skill requirements against documented earned alignments, and explore staff-reviewed courses addressing other skills. |

These placements are recommendations, not completed workflows or a claim that an
occupation match proves job readiness. O*NET's
[career skills reference](https://services.onetcenter.org/reference/mnm/career/skills)
provides source skill identifiers, and the
[program overview](https://www.onetcenter.org/overview.html) describes its training
and career-exploration uses. The institution still needs to approve course-to-skill
alignments and the evidence used to substantiate each earned skill.
