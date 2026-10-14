# Screen-reader review script (VoiceOver)

A manual review for the accessibility release gate. **Status: deferred on October 7, 2026; required before the closed pilot.** The automated checks (`npm run test:a11y`) cover axe rules, forced colors, reflow and text resizing; they cannot judge whether announcements make sense, so a person runs this script. Expect about 45 minutes.

Record each step as **Pass**, **Fail** or **Note** in the Result column, with what was heard when it differs. Add findings to the [progress log](implementation-progress.md); do not create GitHub issues unless asked.

## Setup

- **Mac with Safari** (VoiceOver is tested most with Safari). Turn VoiceOver on and off with **Cmd+F5**. `VO` below means **Control+Option**.
- Useful keys: next/previous item **VO+Right/Left**; activate **VO+Space**; rotor (headings, landmarks, links, form controls) **VO+U**, then Left/Right to switch lists; next heading **VO+Cmd+H**; read from here **VO+A**; Tab and Shift+Tab move between controls.
- Start the stack with `npm run dev` and open `http://127.0.0.1:3050`.
- Use synthetic accounts only: learner `sr-review@example.test` (any password), staff `admin@cuce.test` and `catalog@cuce.test` (mock sign-in). Afterwards, remove the review learner's records (see the cleanup note at the end).

Reviewer: ______ Date: ______ macOS / Safari versions: ______

## 1. Catalog, signed out

| #   | Do                                  | Expect to hear                                                                                                                                      | Result |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 | Load `/`. Press Tab once.           | "Skip to content, link". Activating it moves to the main content.                                                                                   |        |
| 1.2 | Rotor → Landmarks.                  | Banner, "Main navigation", main, content information (footer).                                                                                      |        |
| 1.3 | Rotor → Headings.                   | Level 1 "Build skills. Keep learning."; level 2 Featured courses, Featured pathways, Featured collections; course and collection titles at level 3. |        |
| 1.4 | Tab to the tabs.                    | "Explore, selected, tab, 1 of 4" (wording varies) inside "Catalog views, tab group".                                                                |        |
| 1.5 | Right Arrow, then Space.            | Focus moves to "Courses (n)"; after Space it is selected and the Courses panel shows. The address bar shows `?tab=courses`.                         |        |
| 1.6 | Tab to the layout switch.           | "Card layout" group; "List layout, selected, toggle button" (or pressed) and "Grid layout". Switching changes the card layout.                      |        |
| 1.7 | On Courses, type in Search courses. | The live count updates politely ("3 courses") without moving focus.                                                                                 |        |
| 1.8 | Tab to a card's link.               | "View course: {title}, link".                                                                                                                       |        |
| 1.9 | Explore → "See all pathways (n)".   | Focus moves to the selected "Pathways" tab.                                                                                                         |        |

## 2. Sign-in and registration

| #   | Do                                               | Expect to hear                                                                                             | Result |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------ |
| 2.1 | Open Sign in. Tab through.                       | "Email, required, edit text" and "Password, required, secure edit text", each followed by its helper text. |        |
| 2.2 | Submit empty.                                    | The error is announced and focus goes to the first problem.                                                |        |
| 2.3 | Sign in as `sr-review@example.test`.             | Lands on My learning; "My learning, heading level 1".                                                      |        |
| 2.4 | Open Practical Data Analysis. Rotor → Landmarks. | A "Registration" region holding price, format, schedule and the action.                                    |        |
| 2.5 | Activate **Save course**.                        | "Saved. Find it in My learning." Focus stays on the button, now named "Remove from saved courses".         |        |
| 2.6 | Activate **Start registration**.                 | The result message is announced; focus moves to "Go to My learning".                                       |        |

## 3. My learning

| #   | Do                                     | Expect to hear                                                                                                | Result |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | Rotor → Headings.                      | "Registrations" (and "Enrolled courses" once enrolled), "Pathways you follow" if any, "Saved courses".        |        |
| 3.2 | Activate **Simulate payment**.         | "Payment simulated …" notice; focus goes to the course heading.                                               |        |
| 3.3 | Wait a few seconds without moving.     | "{course}: Enrolled." announced once; focus follows the card to "Open {course} in Canvas".                    |        |
| 3.4 | Activate **Open course in Canvas**.    | A dialog: "Canvas course not connected yet", then its text. Escape closes it and focus returns to the button. |        |
| 3.5 | In Saved courses, activate **Remove**. | "{course} removed from saved courses."; focus moves to the "Saved courses" heading.                           |        |

## 4. Pathways

| #   | Do                                        | Expect to hear                                                                             | Result |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| 4.1 | Open Pathways tab → Data-Informed Leader. | Level 1 title; an info note that the order is a recommendation and following is free.      |        |
| 4.2 | Activate **Follow pathway**.              | "Following. This pathway now appears in My learning."; the button is now "Stop following". |        |
| 4.3 | Move through the course list.             | "List, 3 items"; links read "Step 1: Practical Data Analysis" and so on.                   |        |
| 4.4 | In My learning, read the pathway.         | Each course with its status; the next course has "Next".                                   |        |

## 5. Staff workspace

Sign out, open Staff.

| #    | Do                                                                                 | Expect to hear                                                                                                                    | Result |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 5.1  | Staff sign-in.                                                                     | A radio group with a legend; each option reads name, email and roles. Submitting with none chosen announces an error.             |        |
| 5.2  | Sign in as `admin@cuce.test`. Tab to the tabs.                                     | "Staff workspace" tab group; Dashboard selected.                                                                                  |        |
| 5.3  | Dashboard: move into the chart.                                                    | Each bar reads its period and value; the table view toggle offers the same data as a table.                                       |        |
| 5.4  | Offerings table: VO+Right through a row; activate a column header.                 | Cells read with their column headers; the sorted header announces ascending/descending.                                           |        |
| 5.5  | **New offering**, then **Save** empty.                                             | Dialog title announced; on save, focus moves to "Fix these fields" with the list of problems; each link moves focus to its field. |        |
| 5.6  | Cancel. Focus returns to **New offering**.                                         |                                                                                                                                   |        |
| 5.7  | Collections → **Edit** Data-Informed Leader → **Move … down** on the first course. | "{course} moved to position 2 of 3."; focus stays on the arrow. At the end of the list focus moves to the other arrow.            |        |
| 5.8  | **Remove** a course, then Cancel.                                                  | "{course} removed."; focus moves to the neighbouring Remove button.                                                               |        |
| 5.9  | Explore page: add a course until the limit.                                        | Each addition announced; at the limit the select says "Limit of 5 reached" and focus is not lost. Do not save.                    |        |
| 5.10 | Learners → **View learner** on any row; close.                                     | Dialog title, details read in order; focus returns to "View".                                                                     |        |

## Cleanup and findings

- Sign out of learner and staff sessions, then remove the review learner and their records:

  ```bash
  npm run db:remove-test-learner -- sr-review@example.test
  ```

- Summarize: steps passed, failures (step, what was heard, what was expected), and any notes on wording or verbosity.

| Step | Finding | Severity | Follow-up |
| ---- | ------- | -------- | --------- |
|      |         |          |           |

## Canvas staff authentication, when configured

Use approved test staff identities. Verify that Staff sign-in announces one heading, its explanatory text and the Sign in with Canvas link in a logical order. Check the configuration notice before keys are supplied and error announcements for cancelled, expired and unauthorized callbacks. Follow the link with the keyboard through the institution's SSO/MFA screen, return to the portal and confirm the staff member and roles are announced. Sign out and confirm focus/announcements on the sign-in screen; if logout fails, verify the error is announced and a retry remains available. The institutional login UI requires its own review. This session is pending.

## Canvas courses

Pending manual review: open **Admin → Canvas courses**. Check the setup/reauthorization notice, selected account, connection and schedule region headings, read status announcements, and errors that retain a previous preview. Confirm an automatic preview populates the list without moving focus. A valid preview should be reused; a missing/expired preview should start only one read, and an existing read should be followed. Test a failed automatic read and explicit retry with the keyboard using Refresh from Canvas in the filter toolbar; the completed manual refresh moves focus to the course list. Check start/end date headers, missing dates, inclusive date filters, keyword/status filtering, filtered counts, empty results and pagination. Verify Connection details, Schedule settings and Staff details announce their expanded state and keep focus on their buttons when toggled. Confirm row selection labels, the header checkbox’s checked/mixed state, current-page selection scope and selections across pages. Import selected must be disabled with no selection. Test a failed sync retaining selections, a successful row/batch sync returning focus to the list heading, row sync status/time and the Imported courses tab. Verify changing filters clears selection and the table can be scrolled horizontally by keyboard. Confirm each course link announces opening Canvas in a new tab, table headers/row names read correctly, and pagination works. Confirm the unsaved notice, course count, nested-account setting and 30-minute expiry are understandable. Verify syncing is separate from reading and that its successful action moves focus to the course-list heading. An expired preview should request a fresh read without losing a previously saved snapshot. Enable scheduled reads using an approved staff identity, check that ownership and sign-out behavior are understandable, then pause and confirm focus returns to the enable button. Review the authorization link and disconnect behavior without changing unrelated staff identities. Automated axe/keyboard checks passed; this does not complete the manual screen-reader session.

October 14, 2026 — imported offering drafts (manual review pending): verify the Canvas table’s Open offering links and missing-information text, the Offerings list warnings, the draft page warning and disabled Publish control. Confirm unset prices/capacity/type are read as Not set or blank, never free/sample defaults. In Details, attempt an incomplete save and confirm focus moves to the error summary; each error link must focus its field, including select controls. In Settings, confirm the mapped Canvas URL is read-only and settings save without requiring complete Details. Recheck keyboard scrolling of the expanded Canvas table. Automated scans/keyboard checks do not complete this manual gate.

October 14 wording update (manual review pending): verify Create offering draft for new rows, Refresh source details for mapped rows, Import selected for batches and Imported courses for the saved tab. Import selected references helper text explaining draft creation, source refresh and preservation of staff edits. Verify the visible label is included in each accessible button name.

Unlimited seats manual review pending: confirm checkbox name/state and Space operation, disabled capacity/helper text, validation when clearing Unlimited without a finite value, and saved state after reload. Review Unlimited labels in staff overview/list, learner availability and dashboard (finite occupancy excludes unlimited offerings). Automated keyboard/axe checks cover these flows across five browser/layout projects; a human screen-reader session is still required.
