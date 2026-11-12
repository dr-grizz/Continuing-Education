# ADR 0021: Engagement and Impact analytics

Accepted November 4, 2026 for the portal owner's requested admin analytics dashboard, with administrator SSO configuration explicitly paused.

The portal adds an aggregate reporting endpoint and a native staff workspace section rather than a separate analytics app. Existing `reports:read` controls reporting and `badges:manage` additionally controls credential metrics. No schema migration, tracking pixels, third-party telemetry, or expanded identity/provider permissions are introduced.

Registrations, documented progress assignments, and credentials have separate populations and grains. Complete UTC date windows permit equal-length prior registration comparisons. Progress is reconstructed from required-step evidence available before the selected period ended for assignments created in that window. Null denominators and missing verification remain unknown. Current active learners and current cohort membership define eligibility; current offering skill coverage and credential sharing/revocation state are disclosed as snapshots.

Signed credential validation and explicit learner links reuse the integrated issuance reader. Badges/certificates count independently; a source/badge key identifies a paired accomplishment or redeemed distribution once. Offering filters select credential recipients without inventing offering-to-accomplishment attribution. Credential source errors remain unavailable, and role restrictions apply on the API, not just the page.

Interactive registration history, offering outcomes, cohort comparisons, course skill coverage, source definitions, and aggregate CSV share the applied filters. Canvas learning activity remains in its authorized alert workflow; this dashboard performs no Canvas reads or SSO changes. Participation/achievement counts do not establish employment or causal impact.

See [operator and measurement definitions](../engagement-impact.md) and [verification](../testing/engagement-impact-verification.md).
