# Listed and unlisted offerings and groups

Open **Admin → Offerings → an offering → Settings**. **Listed in course discovery** is on by default. Turn it off to make the offering unlisted, supply a reason if it is or was published, then save changes.

An unlisted offering must still be published before its course page opens or accepts registrations. Use the course-page link shown in the offering Overview to share it. Unlisted links are shareable, not private access controls. Learners still need to sign in and satisfy the course's approval, enrollment-window and seat rules.

Unlisted published offerings disappear from browsing/search, Explore, public collections/pathways and their counts, topics and price ranges. Existing paid registrations and courses explicitly saved by a learner remain available in My learning. Staff still see the offering, with an **Unlisted** status label. Course listing does not alter Canvas publication or any Canvas data.

Publishing/unpublishing and Canvas refreshes retain the listing preference. Curated collection membership and featured picks are retained; public responses exclude the unlisted course. Relisting a published offering restores discovery without recreating it.

## Collections and pathways

Open **Admin → Collections → Edit** (or **New collection**) and set **Listed in course discovery**. The shared editor supports collections and pathways. Published unlisted groups remain available at `/collections/:slug`, but do not appear in Explore, browse filters or course-page group recommendations. An explicit public browse query using an unlisted group's slug returns no courses; use its direct group page instead.

Group listing never changes the individual courses' listing or publication. Direct group pages continue to show only published, listed courses; those courses can still appear elsewhere. Members, ordering, saved featured picks and existing pathway follows are retained. A learner can follow a published unlisted pathway from its direct page, and private My learning continues to show that follow. Unpublish/republish retains listing preference. Unlisted links are shareable, not private.

Existing and new groups default to listed. A listing-only edit remains possible even if the group has lost its visible courses; publishing or changing a published group's membership still requires the existing minimum visible-course count. Collection edits retain their existing permission, version, idempotency and audit controls; they do not introduce an offering-style reason field.

## API and migration

- Apply `npm run db:migrate`; migration `022_offering_visibility` defaults all existing offerings to `listed=true` without changing publication or existing records.
- Public `GET /api/v1/offerings`, `explore`, `collections` and collection/pathway contents apply discovery filtering on the server. `GET /api/v1/offerings/:id` requires publication but permits unlisted courses.
- Staff create/edit/settings payloads accept optional boolean `listed`. Omitted on creation means true; omitted on edit/settings retains the existing preference. Null and string values are invalid.
- The existing `POST /api/v1/offerings/:id/edit` and `/settings` commands require the current `version`, an idempotency key and `catalog:write`. A listing change on an offering that is or was published requires `reason` (10–500 characters). Settings also retains its existing approval-validity, enrollment-window and Canvas-link fields; send the current mapped Canvas link when changing settings.
- Migration `023_collection_visibility` adds `collections.listed=true` without changing publication, members, follows or picks. Collection create/edit payloads accept optional boolean `listed` with the same defaults and omission semantics as offerings; null/string values are rejected.
- Read responses for staff groups and offerings include `listed`. Public course links remain `/courses/:id`. Staff listing and learner-owned records can include published unlisted offerings; they are not public discovery APIs.

Run `npm run test:visibility`, `npm run test:migrations` and `npm run test:canvas` for isolated checks. The focused UI cases are `npm run test:a11y -- --grep 'T01 offering visibility'`. See [ADR 0010](adr/0010-independent-offering-visibility.md) and the [verification record](testing/offering-visibility-verification.md).
