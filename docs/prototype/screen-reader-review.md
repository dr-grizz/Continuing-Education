# Screen-reader review script (VoiceOver)

A manual review for the M1 accessibility exit gate. The automated checks (`npm run test:a11y`) cover axe rules, forced colors, reflow and text resizing; they cannot judge whether announcements make sense, so a person runs this script. Expect about 45 minutes.

Record each step as **Pass**, **Fail** or **Note** in the Result column, with what was heard when it differs. Add findings to the [progress log](implementation-progress.md); do not create GitHub issues unless asked.

## Setup

- **Mac with Safari** (VoiceOver is tested most with Safari). Turn VoiceOver on and off with **Cmd+F5**. `VO` below means **Control+Option**.
- Useful keys: next/previous item **VO+Right/Left**; activate **VO+Space**; rotor (headings, landmarks, links, form controls) **VO+U**, then Left/Right to switch lists; next heading **VO+Cmd+H**; read from here **VO+A**; Tab and Shift+Tab move between controls.
- Start the stack with `npm run dev` and open `http://127.0.0.1:3000`.
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
