# ADR 0010: Offering publication and discovery are independent

Accepted October 21, 2026 for T01 in the [issue-tracking plan](../issue-tracking-plan.md#t01-independent-offering-visibility).

Store `offerings.listed` separately from `published`. Migration `022_offering_visibility` adds a non-null boolean defaulting to true; it preserves existing rows and their current discovery behavior. New Canvas imports remain unpublished drafts. Staff listing preference is portal-owned and is never written to Canvas or overwritten by Canvas source refresh.

| State               | Public discovery | Direct course page                 | New registration                                 |
| ------------------- | ---------------- | ---------------------------------- | ------------------------------------------------ |
| Draft               | Hidden           | Unavailable                        | Blocked                                          |
| Published, listed   | Visible          | Available                          | Existing eligibility/approval/window rules apply |
| Published, unlisted | Hidden           | Available through a shareable link | Same rules as listed courses                     |
| Unpublished         | Hidden           | Unavailable                        | Blocked; existing paid records/access continue   |

Public browsing/search (including collection filters), Explore, public collection/pathway course lists, course counts, topics and price ranges require both `published` and `listed`. Containers with no visible courses disappear from public collection discovery. A known collection URL can still open the published container with an empty course list. Publishing a collection/pathway requires at least one/two published, listed courses, respectively. Unlisting does not remove curated membership, ordering, followers or saved featured picks; hidden picks are filtered out of public Explore and return when relisted.

Private My learning and courses explicitly saved by that learner remain available. Followed-pathway course lists use the public visibility filter; paid registrations remain independently visible in My learning. Unlisted is not private authorization: anyone with the course link can open it, and authenticated learners can register under the same rules. This feature does not secure a course URL or imply a search-engine privacy guarantee.

Course managers change **Listed in course discovery** in offering Settings. Existing `catalog:write` permissions remain required. Saves use the existing version/idempotency controls and audit events. Changing listing on an offering that is or was published requires an audited reason of at least ten characters. Optional API fields preserve existing clients: omitting `listed` on edits/settings retains the stored preference; creation defaults to true. Null and string values are rejected. Incomplete imported drafts can save listing in Settings without filling unknown sales details or publishing.

Unpublish/republish preserves listing. Sales-page publication, prices, capacity, image overrides, Canvas mappings and learner/payment records remain separate. Existing publication/eligibility checks continue to block new registrations and payments for unpublished offerings.

Verification is recorded in [T01 checks](../testing/offering-visibility-verification.md). Manual screen-reader acceptance remains a separate release check.

## Extension: collection and pathway listing

Added October 21, 2026. Migration `023_collection_visibility` adds `collections.listed` defaulting to true. The shared group editor independently controls publication and discovery for both kinds. Public group summaries/Explore, browse filtering by group, and course-page recommendations require published and listed groups. A known published group URL remains available when unlisted, with the existing member-course visibility filter.

Group listing does not change offerings. Private pathway follows, membership/order and saved featured ranks survive unlisting; direct-link following remains permitted. Unpublish/republish retains listing. Optional create/edit API fields default or retain listing; boolean validation, existing role checks, audited before/after state, idempotency and serialized version checks apply. Group edits retain their existing no-reason workflow. Listing-only edits are allowed after member visibility changes, while publishing or changing membership on a published group still enforces the one/two visible-course minimum.
