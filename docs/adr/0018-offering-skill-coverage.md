# ADR 0018: Offering skill coverage and badge skill discovery

Accepted November 4, 2026 at the project owner's request.

An offering may describe up to 20 skills it develops. These are course coverage,
separate from an individual's assessed achievement. Existing badge skill
alignments continue to require an assessment explanation and remain frozen in
approved/issued versions under ADR 0017.

Migration 029 adds an optional-by-default `skills` JSONB array to offerings in
the main PostgreSQL database. Save commands resolve selected release/skill IDs
against the immutable O*NET reference tables and store canonical definitions,
release, source URL and license. Browser-provided names/descriptions are not
accepted as authoritative. Existing offerings default to an empty array; older
clients that omit skills retain the saved values on edits. Published edits still
require a reason, use version checks, and record skill changes in the audit log.
Changing course metadata does not modify an issued credential or award eligibility.

The create dialog and Details editor share a native accessible skill picker.
Published course pages display the selected skill names/definitions with source
credit. The public catalog remains the reference-search source, so course managers
do not need an additional badge-manager permission to choose offering skills.
Canvas source refreshes preserve this staff-owned metadata.

Badge publishing shows skills on the selected draft and published versions, and
links directly to the selected draft's Details tab for adding/editing assessed
skills. Publication/issuance follows the existing canonical resolution and
immutable snapshot rules; offering selections are not automatically copied into
badges or interpreted as assessment evidence.
