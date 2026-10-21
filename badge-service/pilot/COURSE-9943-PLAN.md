# Course 9943: isolated badge pilot plan

Target: [Frieling Sandbox](https://cedarville.instructure.com/courses/9943), course code `JWF101`.
Read-only snapshot: `/tmp/canvas-tools/9943/badging-inventory.json`, retrieved October 14, 2026 at 20:11:35 UTC.

**Implementation status:** The user replied `Confirm`; the approved objects were created and published on October 14, 2026, with 26 successful independent read-back checks. This document preserves the reviewed scope and rollback; see `IMPLEMENTATION-RECEIPT.md` for resulting IDs and links. The designated test learner mapping has been verified, but the learner has not completed the pilot assignment or received a grade.

## Findings and decision

The inventory has 14 modules. Only module 89190, “Proctorio Test,” is published, and none of its three items has a completion requirement. The unpublished “Welcome” module has a single `must_mark_done` requirement; the other modules have no configured item completion requirements. These are existing unrelated sandbox materials, not an approved CU badge pathway. Do not attach issuance to their names or presume that an empty module's completed state represents verified learning.

Recommended pilot: create one clearly labeled, isolated module. The proposed 80% threshold applies only to this technical test. The resulting credential recognizes completion of a test workflow; it is not a professional competency or institutional academic award.

## Exact proposed Canvas changes — approval required

Create these new objects only:

| Object | Exact title | Proposed configuration |
| --- | --- | --- |
| Page | CU Portal Badge Pilot: Start Here | Published page, content below |
| Assignment | CU Portal Badge Pilot: Completion Check | 10 possible points; points grading; online text entry; individual submission; no due date; omit from course final grade; published |
| Module | CU Portal Badge Pilot — Test Only | Published; append after existing modules; require all required items; no prerequisites; no sequential-progress restriction |
| Module item 1 | CU Portal Badge Pilot: Start Here | Link the new page; require viewing it (`must_view`) |
| Module item 2 | CU Portal Badge Pilot: Completion Check | Link the new assignment; require at least 8 points (`min_score: 8`) |

Page content:

> **CU Portal Badge Pilot — Test Only**
>
> This module tests the connection between Canvas completion and the CU Portal badge service. It does not award an academic or professional credential.
>
> Read this page, then open **CU Portal Badge Pilot: Completion Check** and submit the requested statement. A designated test instructor will review the submission. To complete this test module, view this page and receive at least 8 out of 10 points on the completion check.
>
> Badge issuance will be tested separately after the learner account is mapped to the badge service. No payment is required for this technical test.

Assignment instructions:

> Submit this statement in the text-entry box: “I understand that this is a CU Portal badging system test and does not represent an academic or professional credential.”
>
> The test instructor will assign a score after checking the submission. At least 8 out of 10 points is required for the proposed badge pilot. This assignment is excluded from the course final grade.

Do not create a submission, enter any grade, enroll anyone, change existing objects, send notifications, or issue a credential as part of the course setup. Learner mapping and an instructor-reviewed test submission are separate prerequisites for the integration test.

## Creation sequence and verification

1. Re-read exact object titles and module positions immediately before creation; abort or reconcile if any planned title already exists.
2. Create the page, assignment, and module **unpublished**, recording every returned ID in `/tmp/canvas-tools/9943/badge-pilot-created.json` before continuing.
3. Link the page and assignment as new module items, and configure the two completion requirements. Keep the module's completion policy as `all`.
4. Publish only the new page, assignment, and module as covered by the approval; do not change any existing publication state.
5. Freshly read back each object and both module items, verifying the page text, assignment instructions, 10-point setting, grade exclusion, publication states and exact requirements.
6. Add the verified module and assignment IDs to a runnable configuration derived from `course-9943.draft.json`; preserve the fictional demo in its separate database.

## Rollback

All proposed changes are additions; the current inventory is the pre-change reference. Record each new ID immediately after creation, including partial progress if a later call fails. Rollback consists of deleting **only those newly created objects**, in this order:

1. Delete each new module item through the recorded new module's `delete_module_item` operation.
2. Delete the new module.
3. Delete the new assignment.
4. Delete the new page.
5. Re-read the course object lists to verify that the additions are absent and the existing module requirements/publication states match the pre-change snapshot.

Abort rollback if provenance is uncertain; never delete an existing object merely because its title matches. If a test submission or grade has been added later, re-evaluate rollback before deletion rather than discarding learner work. No rollback has been executed.

## Remaining inputs

- Explicit confirmation to create and publish the isolated module and its two content objects.
- A designated internal test learner account and its Canvas user ID, plus the portal's stable learner ID; do not invent or infer this mapping from names or email addresses.
- Confirmation of the institutional Azure hosting choice, tenant/subscription owner, issuer domain and application owner before any deployment.

Sources: [live course](https://cedarville.instructure.com/courses/9943), [Canvas modules API](https://developerdocs.instructure.com/services/canvas/resources/modules), [Canvas assignments API](https://developerdocs.instructure.com/services/canvas/resources/assignments), and the read-only inventory above.
