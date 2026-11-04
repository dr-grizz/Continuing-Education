# Engagement and Impact

Open **Admin → Overview → Engagement and Impact** (`/staff/engagement-impact`). The report uses the portal's PostgreSQL records and its existing signed credential reader; it makes no Canvas requests and leaves the paused administrator SSO setup unchanged. No new database migration, analytics provider, or background service is needed.

Choose a preset or custom **From / Through** dates, an offering, and optionally a cohort, then **Apply filters**. The report states its applied scope separately from the editable controls. **Refresh** repeats the applied query. **Export analytics CSV** contains the same aggregates, definitions, source qualifications, and scope; no learner names, emails, grades, claim codes, or credentials are exported. Missing data and request failures never leave old totals underneath new filters.

## Charts

- **Credentials issued:** horizontal bars compare badge and certificate award counts on a common zero-based scale, near the top of the page. Recipients and paired accomplishments remain separate figures.
- **Participation over time:** selectable daily or seven-day registration bars, with a counts table.
- **Documented learning progress:** an interactive donut chart shows completed, in-progress, awaiting-verification, and verified-not-started assignments. Select a legend item to highlight a segment and read its count/share. No assignments shows an unavailable rate and an empty ring, not 0% completion.
- **Offering outcomes:** select registrations, completed assignments, or completion rate. Counts use a common zero-based count scale; rates use a fixed 0–100% scale with completed/assigned denominators. Unavailable rates remain missing. The full counts table is expandable below the chart.
- **Cohort comparison:** stacked bars compare assignment counts and completion states; overlapping cohorts are not additive.
- **Skills reached:** horizontal bars show distinct registered learners by skill, with offering counts and an expandable table. Skills may overlap and are not summed into a unique learner total.

Bar values and segment counts are visible without hovering. Native keyboard controls support inspection/highlighting. Charts show up to six offering/skill rows initially, with **Show all** for longer lists, while tables and CSV retain every filtered row. Existing definitions, permissions, filters, attribution, and unavailable-data handling apply to the charts as well.

## Measures and boundaries

Dates cover 1–366 complete **UTC** days, inclusive of the Through date. Today is intentionally excluded to keep registration comparisons equally complete. The default is the preceding 30 complete days; the comparison is the immediately preceding equal-length period. Registration history is bucketed daily for up to 31 days and into seven-day intervals for longer ranges, with the last interval potentially shorter. Empty buckets are zero-filled and reconcile to the total.

Only currently active portal learners count. Current cohort membership applies to both registration periods; account status and membership are not reconstructed historically. A cohort also restricts the report to its offering. Invalid dates, unknown filters, and a cohort/offering mismatch fail validation rather than silently broadening the population.

| Measure | Definition |
| --- | --- |
| Registered learners | Distinct learner IDs whose entitlement was created in the selected period and scope. |
| Registrations | Entitlement creation records, including pending, declined, expired, and refunded registrations. The same learner in two offerings counts twice; retrying the same offering does not create a new entitlement. |
| Currently enrolled | Selected-period registrations whose **current** entitlement status is enrolled; this is not an enrollment-event time series. |
| Returning learners | Selected-period registered learners with an earlier portal entitlement in any offering, before the period began. The earlier-registration lookback intentionally spans the portal even when the current offering is filtered. |
| Progress assignments | Version-specific participant records assigned in the selected period. A learner can have multiple plans/offerings/versions. These are independent of registration records. |
| Documented completion | Completed selected assignments divided by all selected assignments; null when none exist. Each required step must have its latest evidence **recorded before the selected period ended** marked complete. Optional steps do not count. |
| In progress | An incomplete assignment with at least one required step completed or in progress. |
| Awaiting verification | No required work completed/in progress and at least one required step without evidence. This is not learner inactivity or failure. |
| Verified not started | Every required step has explicit not-started evidence. |
| Required steps verified | Completed required participant-step pairs, not unique reusable step definitions. |
| Cohort comparison | Current active memberships of the selected-period assignments. Cohorts may overlap; do not add their populations or average their rates. |
| Skills reached | Current O*NET skill references attached to selected offerings and distinct selected-period registered learners in those offerings. Deduplicated by skill/release and learner; coverage is not assessed mastery. O*NET attribution appears once when skill rows are present. |

Historical assignment status is reconstructed from append-only evidence and its database sequence, excluding corrections recorded after the period. Different cohorts have different follow-up time and requirements; the report does not rank their effectiveness or infer a registration-to-completion conversion funnel. Current offering titles and skill coverage are not historical snapshots. UTC rather than local-calendar boundaries remain explicit in the UI and export.

## Credentials and recognition

This section requires existing `badges:manage` in addition to `reports:read`. It reuses the credential register's actual badge signature validation, certificate verification, and explicit active, unambiguous learner-account links. Email matching is never used. A missing source, failed verification infrastructure, or unavailable link directory yields an unavailable section, not a measured zero. Individual invalid/revoked records are excluded and counted separately.

Badges and certificates issued within the selected window count separately. Recipients are distinct explicitly linked selected portal learners; a paired accomplishment uses the same source/badge identity with both a badge and a certificate issued in the window. The pair does not become two accomplishments. Expired, unrevoked credentials remain historical issuance; current revocations are excluded. Sharing state is current, not reconstructed at period end. Acknowledgments count distinct issued accomplishments with a redeemed distribution claim by period end, including multiple codes only once; a claim is receipt, not a measured PDF download.

Offering/cohort filters select credential **recipients** through registrations or progress assignments existing before period end. They do not prove that an award belongs to that offering. Unlinked credential accounts are outside these counts; the report does not represent a complete institution-wide issuance inventory.

## Access and limitations

`GET /api/v1/staff/engagement-impact?from=YYYY-MM-DD&to=YYYY-MM-DD&offeringId=UUID&cohortId=UUID` requires existing `reports:read`; credential figures are omitted server-side without `badges:manage`. The report returns aggregate rows and source metadata, not learner-level records. SQL values are bound, related portal reads use a repeatable-read transaction, and CSV cells neutralize spreadsheet formulas. Credential verification occurs after that transaction, so cross-source observation is not an atomic historical snapshot.

Canvas activity and scores are deliberately not dashboard engagement proxies. The source status points staff to **Alerts**; the dashboard never authorizes or fetches Canvas data. Employment, earnings gains, workplace transfer, satisfaction, and causal learning impact are not collected or claimed. The existing local-prototype banner continues to identify sample data.

Verification: [test record](testing/engagement-impact-verification.md); architecture: [ADR 0021](adr/0021-engagement-impact.md).
