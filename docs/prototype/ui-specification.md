# Prototype UI specification

Status: baseline for the local prototype, updated October 6, 2026. This records how the current interface is built, so that future changes stay consistent. Colors, the font and copy are provisional until Cedarville brand and content review. Implementation lives in `src/web`. Accessibility review requirements are in the [README checklist](../../README.md#reviewtest-checklist).

## Principles

- Use standard Material UI components and the shared theme. Do not add a second component or styling system without an ADR.
- Show learners the next action and the reason for each status. Never show internal codes or IDs.
- Every layout works from 320px width without horizontal page scrolling. Phones get the same capabilities as desktop.
- Keyboard and screen-reader use are required, not optional polish.
- Label simulated behavior plainly ("simulated", "sample", "demo"). Never imply real payment, identity or Canvas access.

## Design tokens

Defined in `src/web/app/theme.tsx`. Components use theme tokens (`primary.main`, `text.secondary`, `divider`, `background.paper`, `action.hover`). Literal colors are allowed only for the fixed brand surfaces below.

### Color schemes

The site follows the operating system light/dark preference (`cssVariables.colorSchemeSelector: "media"`). There is no manual toggle.

| Token | Light | Dark |
| --- | --- | --- |
| `primary.main` | `#17364b` | `#9cc3df` (text `#0d1b25`) |
| `secondary.main` (category overlines) | `#80601e` | `#d8b75d` |
| `background.default` | `#f7f8fa` | `#0f171f` |
| `background.paper` | `#ffffff` | `#17222c` |
| `text.primary` | `#1c2b36` | `#e6edf2` |
| `text.secondary` | `#52616d` | `#a9b6c1` |
| `divider` | `#dde2e7` | `#2c3a46` |
| Input outline | `#7c8791` | `#71808c` |
| Prototype banner | `#fff8e6` / border `#ead8a8` | `#2b2412` / border `#5c4a1c` |

Measured contrast (WCAG 2.x): light secondary text 6.38:1 and gold overline 5.82:1 on white. Dark body text 13.64:1, secondary text 7.80:1, link 8.67:1, input outline 3.97:1 on paper. New colors must meet 4.5:1 for text and 3:1 for control boundaries and focus indicators.

### Brand surfaces

`brand` in `theme.tsx` is fixed in both schemes: header and featured-course spotlight use navy `#17364b` with white text, muted text `#e2e8ed`, gold `#e7d99b` overline, and the gold `#d8b75d` active-navigation underline.

### Typography

- Font: Figtree (SIL Open Font License), self-hosted by `next/font/google` through the `--font-sans` variable (`src/web/app/layout.tsx`), falling back to `system-ui`. It is a free stand-in for Proxima Nova, the font cedarville.edu uses through a paid Adobe Fonts license; this project does not use Adobe Fonts. The first production build needs network access to fetch the font.
- Headings: h3/h4 weight 700 with slight negative tracking; h5/h6 weight 600. Page titles render as `h1` (`variant="h3"` on catalog/course, `h4` elsewhere), and the heading order must not skip levels.
- Buttons: sentence case, weight 600, no uppercase transform.
- Category labels: `overline`, weight 700, `secondary` color.

### Shape, spacing and elevation

- Corner radius 10px (`shape.borderRadius`).
- Flat surfaces: `Paper` elevation 0 with `variant="outlined"`; no button elevation.
- Spacing uses the MUI 8px scale. Main content padding is 24px on phones and 40px on desktop.
- Default sizes are compact: `TextField` and `Chip` default to `small`.

### Breakpoints

MUI defaults: `xs` <600, `sm` ≥600, `md` ≥900, `lg` ≥1200. Content is centered in a `Container maxWidth="lg"` (1200px).

## Application shell

`src/web/components/shell.tsx`

- **Skip link:** first focusable element. Hidden until focused, then targets `#main`.
- **Header:** navy app bar.
  - Logo links home: 196px wide on phones, 260px on tablets, 300px on desktop. Its alt text is "Cedarville University Continuing Education".
  - `md` and up: inline navigation (Courses, My learning, Staff, Sign in/out). The current page has `aria-current="page"` and a gold underline. The demo session email appears below.
  - Below `md`: a 48px menu button (`aria-label="Open navigation menu"`, `aria-expanded`, `aria-controls`) opens a `Menu`. The menu lists the session email as a subheader, then the links (48px rows, current page selected) and sign in/out. Escape closes it and returns focus to the button.
- **Prototype banner:** one line on phones ("Local prototype · Sample data only"). The full text, which adds "No real payments or Canvas enrollments", appears from `sm`.
- **Main:** `<main id="main" tabIndex={-1}>`.
- **Footer:** program name and the API documentation link.

## Shared patterns

### Feedback

| Situation | Pattern |
| --- | --- |
| Successful action | Filled success `Alert` inside a `Snackbar`. It is at the bottom center, auto-hides after 6 seconds, has a close button, and is announced (`role="alert"`). |
| Action failure | Inline error `Alert` placed beside the affected item. It never auto-hides, and polling must not clear it. |
| Page/load failure | Inline error `Alert` at the top of the content. |
| Registration result on course page | Inline `Alert`, severity by status (see Course detail). Focus moves to the next action. |
| Background status change (polling, worker) | One visually hidden `role="status"` region per page announces "{course}: {new status}." once. Changes caused by the learner's own action are not repeated there, because the snackbar announces them. |
| Static status or notice text | `Alert` with `role="note"`, so it is not re-announced on render. Reserve `role="alert"` for new, time-sensitive messages. |
| Informational limits (demo, simulation) | Info `Alert` (`role="note"`) or caption text |

### Focus

- Buttons stay focusable while their request runs: use `aria-disabled` and ignore repeat clicks instead of `disabled`, because disabling a focused button drops focus to the page.
- When an action replaces its own button, move focus to the next step's action (`data-next-action`), or to the item heading (`tabIndex={-1}`) when no action remains.
- Dialogs are modal and labelled by their title, and focus starts inside the dialog. On close, focus returns to the opening control; if that control no longer exists (for example a resolved queue row), focus moves to the section heading.

### Loading

Use `LoadingCards` (`src/web/components/loading.tsx`) instead of spinners. It shows outlined placeholder cards shaped like the content they replace, inside `role="status"` / `aria-busy="true"` with one visually hidden label (for example "Loading courses"). The placeholders are `aria-hidden`.

### Empty states

An outlined `Paper` with a sentence explaining the state and the next action, for example "Browse courses" or "Clear filters".

### Counts and live regions

Filtered lists show "N of M …" or "N courses" in `body2`/`text.secondary` with `aria-live="polite"`, so filter changes are announced.

### Cards

Outlined `Paper`. Catalog cards add a hover and focus-within state: primary border and a soft shadow, with a .15s transition. Images are decorative (`alt=""`), because the title carries the meaning. Course links use descriptive accessible names, for example "View course: {title}".

### Tables

`src/web/components/table-view.tsx`

- `useTableView(rows, { compare, initial, matches })` provides client-side filter, sort and paging. Paging resets to page 1 when filtering empties the current page.
- `SortableHeader`: `TableSortLabel` in a cell with `aria-sort`. Activating it toggles ascending/descending, and it works from the keyboard.
- `SortSelect`: shown only below `sm`, because phone card lists have no column headers. Options are labeled in words ("Price: low to high").
- `TablePager`: `TablePagination` rendered as a `<nav>` labelled "{name} pages". It is hidden when there are 10 rows or fewer. Rows-per-page options are 10, 25 and 50.
- Below `sm`, tables are replaced by stacked cards with the same data and actions (`phoneOnly` / `wideOnly` display rules). Do not rely on horizontal table scrolling on phones.
- Row actions include the item in their accessible name, for example "Publish {title}".

### Forms

- Every field has a visible label. Placeholders only give examples.
- Required fields are marked by MUI's required indicator.
- Pattern (offering form, `src/web/components/offering-form.tsx`):
  - Validate on save.
  - Mark each invalid field (`aria-invalid`), with the message as its helper text.
  - Show an error summary above the fields: an error `Alert` titled "Fix these fields", listing each problem as a link that focuses its field. The summary receives focus.
  - Keep entered values after an error.
  - Server failures appear in the same summary.
- Single-field confirmation dialogs, such as Unpublish, mark the field, focus it and keep the error inline.
- Self-paced course creation hides the date fields.

## Terminology

- **Course type:** show "Scheduled" with a date range ("Nov 9, 2026 – Dec 4, 2026") or "Starts {date}". Show "Self-paced" with "Start anytime". Do not show cohort dates for self-paced courses.
- **Learner registration statuses** (for `approved`, `approval_expired`, `declined` and `expired`, once enrollment has closed the action is replaced by "Enrollment for this course closed on {date}…"):

| Status | Label | Primary action/message |
| --- | --- | --- |
| `awaiting_approval` | Awaiting approval | Explains staff review |
| `approved` | Approved — reserve a seat | "Reserve a seat by {date, time}, when the approval expires"; Reserve a seat |
| `approval_expired` | Approval expired | Explains the approval lapsed; Request approval again |
| `declined` | Request declined | "You can request approval again"; Request approval again |
| `reserved` | Seat reserved | Shows the deadline time; Simulate payment |
| `provisioning` | Preparing access | Three-step progress: Payment recorded → Identity prepared → Enrollment verified |
| `enrolled` | Enrolled | **Open course in Canvas** (new tab; accessible name "Open {course} in Canvas (opens in a new tab)") when a Canvas URL is mapped; otherwise a note that the link will appear when staff connect the course |
| `expired` | Reservation expired | Reserve a seat while the approval (if any) is still valid; otherwise Request approval again |
| `provisioning` (retrying) | Preparing access | "Taking longer than usual… retrying automatically; no action is needed" |
| any unpaid status on an unpublished offering | No longer offered | "This course is no longer open for registration…"; no actions, and the title is not linked |
| `exception` | Support review needed (warning chip) | The failed step is marked "Needs staff review"; payment is recorded and the learner does not need to pay again |

- **Staff activity events** use plain language, for example "Approval requested", "Reservation expired", "Payment simulated" and "Enrollment completed (simulated)". Learner actors are shown by email. System actors are "Staff (demo)", "Background worker", "Automation token" or "Legacy demo learner". The complete mapping is `auditLabels` in `src/web/app/staff/page.tsx`. Add a label there whenever a new audit action is introduced.

## Page specifications

### Catalog (`/`)

1. Featured-course spotlight: up to three editorial picks with previous, next and per-course buttons (44px; `aria-pressed` marks the current one) and an "n / 3" indicator. The course image is hidden below `sm`.
2. Intro: overline, `h1` "Build skills. Keep learning.", one-sentence description.
3. Filters (grid: 4 columns on `md`; on phones search and topics span the full row, with type and sort side by side):
   - Search by title or summary
   - Topics (multi-select with checkboxes; "All topics" resets)
   - Course type (All, Scheduled, Self-paced)
   - Sort (Soonest start with self-paced first, Price low→high, Price high→low, Title A–Z)
4. Filters are kept in the URL (`q`, `topics`, `type`, `sort`) with `history.replaceState`. Default values are omitted.
5. Results header: list heading, live course count, "Clear filters" when any filter is active, and a List/Grid toggle remembered in `localStorage`.
6. Results: list cards (thumbnail 88–144px) or grid cards (16:9 image; 1, 2 or 3 columns). Each card shows the category, title, summary, format label, price, start, an "Approval required" chip when relevant, an "Enrollment closed" warning chip once a Scheduled course's enrollment window has passed, and "View course".

### Course detail (`/courses/[id]`)

- Breadcrumb, category, `h1` title, summary.
- The registration panel (`section`, `aria-label="Registration"`) comes **first in DOM order**. On `md` and up it is placed in the right column (340px) and stays sticky at the top while scrolling. It shows the price, format, schedule, "Enrollment closes/Closed {date}" (Scheduled only), availability, an approval chip with "Once approved, reserve a seat within N days", and the action button: "Start registration", "Request approval", the "Sign in to …" variants, or a disabled "Enrollment closed".
- The result message depends on the returned status:

| Status | Severity | Message |
| --- | --- | --- |
| `awaiting_approval` | success | Approval request saved |
| `reserved` | success | Seat reserved; pay in My learning |
| `declined` | warning | Request declined |
| `provisioning`, `enrolled` | info | Already registered |

  After registering, focus moves to "Go to My learning".
- Description, outcomes list, and "Before you register" simulation notice.

### Sign in (`/sign-in`)

Mock sign-in. The Email field (`autoComplete="username"`) and Password field (`current-password`) carry helper text saying any password works and is not saved. Submitting returns the user to `returnTo` when it is provided.

### My learning (`/learning`)

- Signed out: a panel with a sign-in button.
- Signed in: the session email, then one outlined card per registration with category, linked title, schedule, status chip, and the status-specific content from the table above. The page polls every 2.5 seconds.
- Action errors stay inside the affected card. Successes show a snackbar ("Seat reserved for …", "Payment simulated for …").
- Focus and announcements follow the Focus and Feedback patterns above. Action buttons carry `data-next-action`, and course headings are programmatic focus targets.

### Staff (`/staff`)

Header with the API documentation link and the demo-access info note. Tabs: Offerings, Approvals (count), Exceptions (count), Activity. The tab row scrolls on phones, with scroll arrows shown.

- **Offerings:**
  - Search by title, Status filter (All, Published, Draft), live count.
  - Sortable columns: Offering, Schedule, Price, Seats, Status. The phone sort select adds "Fewest seats left" and "Drafts first".
  - The Schedule column adds "Enrollment closes/closed {date}" for Scheduled courses.
  - Row actions: **Edit**, plus **Publish** for drafts or **Unpublish** (error color) for published offerings. Accessible names include the course title.
  - **New offering** and **Edit** open the same offering form, which follows the Forms pattern and is version-checked. Fields:
    - Course title, Topic, Short summary, Description.
    - Course type, Format.
    - Start and End dates plus Enrollment closes (days after start), for Scheduled only.
    - Price (USD), Seat capacity.
    - Approval switch, plus Approval valid for (days) when approval is required.
    - Canvas course URL (optional, https).
  - New offerings save as drafts, and each policy defaults to 7 days. Focus returns to the opening button on close.
  - Editing a **published** offering:
    - An info note explains that course type and the approval requirement are locked, and that dates are locked while learners are registered. Those controls are disabled, with helper text.
    - Capacity shows the seats in use and cannot go below them.
    - Price helper: a new price applies to new reservations, and earlier reservations keep their quoted price.
    - The form lists the **Price history** (newest first, with reasons).
    - A required **Reason for change** field (10–500 characters, audited) appears.
  - **Unpublish** dialog: explains the effect (leaves the catalog; no new registrations, approval requests or payments) and warns with the number of learners whose registrations are active. It requires a reason (10–500 characters, audited).
  - Status chips: **Draft** (never published, neutral), **Published** (success), **Unpublished** (warning; removed from the catalog after publishing, and can be published again). The Status filter offers all three. Unpublished offerings keep the published-offering edit rules: reason required and protected terms.
- **Approvals:**
  - Search by learner email or course; sortable Learner, Offering, Requested (default oldest first); Approve (outlined) and Decline (error text) actions.
  - Empty state suggests requesting Healthcare Communication.
- **Exceptions** (`src/web/components/staff-exceptions.tsx`):
  - **Provisioning simulation** panel (prototype only): an "Outcome for new payments" select with these options. It applies to payments made after the change, and each operation keeps the outcome it was queued with.
    - Normal
    - Delayed: about 20 seconds longer
    - Temporary failure: recovers on automatic retry
    - Identity failure
    - Canvas enrollment failure
  - Failed steps retry automatically up to three times with increasing delay before reaching the queue.
  - "Needs staff review" queue: Learner, Course, Failed step (with attempts), Failed time, Review. It is sortable, with a phone sort select and cards. The empty state explains how to try the workflow.
  - Review dialog:
    - Course and learner.
    - A warning note with the failed step, attempts and reason.
    - An ordered history: event, any staff reason, actor and time.
    - Guidance text.
    - A required **Reason** field (at least 10 characters, audited; inline error with `aria-invalid`).
    - Actions: Cancel, **Record manual enrollment** (outlined) and **Retry provisioning** (contained). Retry assumes the cause is fixed and resumes from the failed step.
- **Activity:**
  - Simulated order, enrollment, pending-operation and open-exception counts.
  - Search across event, course and learner.
  - Sortable Time (default newest first), Event and By columns, plus a Details column with the course and the affected learner.
  - Shows the 200 most recent events (API limit), paged on the client.

## Known gaps

- Focus and announcement behavior is verified by keyboard and DOM inspection; no screen-reader session, forced-colors, zoom or cross-browser review has been recorded for this baseline.
- Staff paging and sorting are client-side, so they cover at most the 100 offerings and 200 audit events the API returns.
- The provisioning simulation is one shared setting for all demo users. Exceptions have no assigned owner, age target or alert.
- There is no manual light/dark toggle. The brand font, colors and copy await Cedarville review.
