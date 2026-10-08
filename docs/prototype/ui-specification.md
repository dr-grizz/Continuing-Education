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

Light or dark is set by a class on `<html>` (`cssVariables.colorSchemeSelector: "class"`). People choose **Match device** (the default, following the operating system), **Light** or **Dark** on the Settings page. MUI keeps the choice in the browser's local storage, and `InitColorSchemeScript` in `app/layout.tsx` applies it before the page paints, so there is no flash of the other theme.

| Token | Light | Dark |
| --- | --- | --- |
| `primary.main` | `#17364b` | `#9cc3df` (text `#0d1b25`) |
| `secondary.main` (category overlines) | `#80601e` | `#d8b75d` |
| `background.default` | `#f7f8fa` | `#0f171f` |
| `background.paper` | `#ffffff` | `#17222c` |
| `text.primary` | `#1c2b36` | `#e6edf2` |
| `text.secondary` | `#52616d` | `#a9b6c1` |
| `divider` | `#dde2e7` | `#2c3a46` |
| `error.main` | MUI default `#d32f2f` | `#f28b82` (text `#0d1b25`) |
| Input outline | `#7c8791` | `#71808c` |
| Prototype banner | `#fff8e6` / border `#ead8a8` | `#2b2412` / border `#5c4a1c` |

Measured contrast (WCAG 2.x): light secondary text 6.38:1 and gold overline 5.82:1 on white. Dark body text 13.64:1, secondary text 7.80:1, link 8.67:1, input outline 3.97:1 on paper. Dark error text 6.75:1 on paper (MUI's default dark red was 4.4:1, found by the axe scans). Helper text on disabled fields keeps `text.secondary`, because it explains why a field is locked. New colors must meet 4.5:1 for text and 3:1 for control boundaries and focus indicators; `npm run test:a11y` checks them on the scanned pages.

### Brand surfaces

`brand` in `theme.tsx` is fixed in both schemes: the header uses navy `#17364b` with white text, muted text `#e2e8ed`, gold `#e7d99b` overline, and the gold `#d8b75d` active-navigation underline.

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
  - `md` and up: inline navigation (Courses, My learning, Staff, Settings, Sign in/out). The current page has `aria-current="page"` and a gold underline. The demo session email appears below.
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
| Links inside sentences | `underline="always"`, so they are not distinguished by color alone (axe `link-in-text-block`). Standalone links (headings, lists, breadcrumbs) keep the hover underline. |
| Static status or notice text | `Alert` with `role="note"`, so it is not re-announced on render. Reserve `role="alert"` for new, time-sensitive messages. |
| Informational limits (demo, simulation) | Info `Alert` (`role="note"`) or caption text |
| Save and follow toggles | The button names the action ("Save course" / "Remove from saved courses", "Follow pathway" / "Stop following") instead of using `aria-pressed`. Focus stays on the button, and a polite live region under it confirms the change. |

### Focus

- Buttons stay focusable while their request runs: use `aria-disabled` and ignore repeat clicks instead of `disabled`, because disabling a focused button drops focus to the page.
- When an action replaces its own button, move focus to the next step's action (`data-next-action`), or to the item heading (`tabIndex={-1}`) when no action remains.
- Tabs draw their focus ring inside (`outline-offset: -3px`), because tab rows clip overflow.
- Text fields and selects show focus with their own border, which turns the primary color and thickens from 1px to 3px. They get no focus ring: on an input, the ring would cover the floating label.
- Screen-reader-only text uses the shared `visuallyHidden` style (`components/visually-hidden.ts`). Never write `width: 1` in `sx` for a 1-pixel size: MUI reads numbers from 0 to 1 as percentages.
- **Forced colors:** the brand header keeps its colors (`forced-color-adjust: none`); the selected tab bar and the selected List/Grid option use the system `Highlight` color; filled buttons get a `ButtonText` border. States must never be shown by a background fill alone.
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
| `enrolled` | Enrolled | **Open course in Canvas** when a Canvas URL is mapped: a real address opens in a new tab (accessible name "Open {course} in Canvas (opens in a new tab)"); a placeholder address (`example.com/.org/.net/.edu`, `.test`, `.example`, `.invalid`, `localhost`) opens a "Canvas course not connected yet" dialog showing the placeholder (`aria-haspopup="dialog"`, name "Open {course} in Canvas"; focus returns to the button on close); otherwise a note that the link will appear when staff connect the course |
| `refunded` | Refunded, access ended | Info note (`role="note"`): the course was refunded and access has ended; contact the program office to register again. No actions. Listed with closed registrations. |
| `expired` | Reservation expired | Reserve a seat while the approval (if any) is still valid; otherwise Request approval again |
| `provisioning` (retrying) | Preparing access | "Taking longer than usual… retrying automatically; no action is needed" |
| any unpaid status on an unpublished offering | No longer offered | "This course is no longer open for registration…"; no actions, and the title is not linked |
| `exception` | Support review needed (warning chip) | The failed step is marked "Needs staff review"; payment is recorded and the learner does not need to pay again |

- **Staff activity events** use plain language, for example "Approval requested", "Reservation expired", "Payment simulated" and "Enrollment completed (simulated)". Learner actors are shown by email. System actors are "Staff (demo)", "Background worker", "Automation token" or "Legacy demo learner". The complete mapping is `auditLabels` in `src/web/app/staff/page.tsx`. Add a label there whenever a new audit action is introduced.

## Page specifications

### Catalog (`/`)

1. Intro: overline, `h1` "Build skills. Keep learning.", one-sentence description.
2. **Landing:** a signed-in learner who opens the bare home page from outside the site (empty or external referrer, a fresh navigation rather than a reload or back/forward, at most once per page load) is sent to My learning with `router.replace`. In-site links, URLs with a tab or filter, reloads and back/forward show the catalog.
3. Tabs (each label is a single span, because MUI stacks a tab's label children; `aria-label="Catalog views"`, manual activation: arrow keys move, Enter or Space selects): **Explore** (default), **Courses**, **Collections**, **Pathways**. Counts follow the last three labels from `sm` up and are hidden on phones so all four tabs fit at 320–375px. A tab with nothing published is hidden. The tab is kept in the URL as `tab` (omitted for Explore). Each panel has `role="tabpanel"` and is labelled by its tab. A **List/Grid** toggle (`aria-label="Card layout"`) sits at the right of the tab row (below it on phones), applies to every tab, and is remembered in `localStorage`. Grid shows 1, 2 or 3 columns; list shows one card per row.
4. **Explore:**
   - **Featured courses** (up to 5), then **Featured pathways** (up to 3) and **Featured collections** (up to 3), each an `h2` section with a card grid (1, 2 or 3 columns) and a "See all {type} (n)" button. That button selects the matching tab and moves focus to it.
   - Items come from `GET /explore`: staff picks in their order, then automatic fill (open scheduled courses by soonest start, then the newest self-paced; newest collections and pathways). This replaced the former hard-coded three-course spotlight; its picks were carried over as the first featured courses.
5. **Courses:**
   - Filters (grid: 4 columns on `md`; on phones search and topics span the full row, with type and sort side by side): search by title or summary; topics (multi-select with checkboxes, where "All topics" resets); course type (All, Scheduled, Self-paced); sort (Soonest start with self-paced first, Price low→high, Price high→low, Title A–Z).
   - Filters are kept in the URL (`q`, `topics`, `type`, `sort`) with `history.replaceState`; default values are omitted.
   - Older links with `?collection=` open this tab filtered to that collection. They show an "In: {title}" chip, a **Remove** button named "Remove filter: {title}", and a link to the collection's page.
   - Results header: list heading, live course count and "Clear filters" when any filter is active.
   - Results: list cards (thumbnail 88–144px) or grid cards (16:9 image; 1, 2 or 3 columns). Each card shows the category, `h3` title, summary, format label, price, start, an "Approval required" chip when relevant, an "Enrollment closed" warning chip once a Scheduled course's enrollment window has passed, and "View course".
6. **Collections** and **Pathways:** an `h2` ("All collections", "All pathways") with a one-line explanation and a card grid. A card shows the type overline, `h3` title, summary, course count, price range and topics, and "View collection" or "View pathway" (named with the title). Cards do not list their courses; the collection or pathway page does. Followed pathways show a "Following" chip. In list layout the course count, price range, topics and View button move to a right-hand column from `sm` up (stacked below a divider on phones).

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
- Below the registration action, a full-width outlined **Save course** button (bookmark icon) follows the toggle pattern; signed-out learners see "Sign in to save this course". Saving registers nothing.
- Description and outcomes list, or the course's published **sales page** in their place (blocks as described under the offering page's Sales page tab; headings start at `h2`). The page title is the sales page's title when set, otherwise the course title. Then a **Part of** heading with link chips to the published collections and pathways that include the course, and the "Before you register" simulation notice.

### Collection or pathway (`/collections/[slug]`)

- Breadcrumb, "Collection" or "Pathway" overline, `h1` title and summary.
- Pathways add an info note (`role="note"`): the order is a recommendation, following is free and registers nothing, and each course is registered separately. Below it, **Follow pathway** / **Stop following** (toggle pattern), or "Sign in to follow this pathway".
- An `h2` ("Recommended order" or "Courses") over a list of course cards: an ordered list with numbered circles (decorative; the link text starts with a visually hidden "Step N:") for pathways, an unordered list for collections. Each card has an `h3` course link, summary, topic and type chips, schedule and price.
- Only published courses are listed. An unknown or unpublished collection shows an error with a link back to the catalog.

### Settings (`/settings`)

- Open to everyone; nothing on it needs sign-in. `h1` "Settings", then outlined sections with `h2` headings.
- **Appearance:** a **Color theme** radio group (Match device, Light, Dark), each with a one-line description. A choice applies immediately and is remembered in this browser; a note under the group says so.
- **Account:** the demo session's email, or a Sign in button when signed out. Demo sign-in has no password or profile to change.

### Sign in (`/sign-in`)

Mock sign-in. The Email field (`autoComplete="username"`) and Password field (`current-password`) carry helper text saying any password works and is not saved. Submitting returns the user to `returnTo` when it is a course page, a collection or pathway page, or My learning; otherwise the learner lands on **My learning**.

### My learning (`/learning`)

- Signed out: a panel with a sign-in button.
- Signed in: the session email, then registrations in two `h2` sections of outlined cards (category, `h3` linked title, schedule, status chip, and the status-specific content from the table above). The page polls every 2.5 seconds.
  - **Enrolled courses** (no description line): those with a Canvas link come first, then those ready now (self-paced or already started), then upcoming by start date. Enrolled cards show no progress steps, only the Canvas link or the "link will appear" note.
  - **Registrations:** everything else in progress (approval, reservation, payment, preparing access, support review); declined and expired requests last.
  - When the worker enrolls a course, its card moves to Enrolled courses. If focus was inside that card, focus follows it to its next action (Open course in Canvas) and the status region announces the change.
- **Pathways you follow** (`h2`, shown when the learner follows any): one card per pathway with an `h3` link to its page and an ordered list of its published courses, each with the learner's registration status or "Not registered". A **Next** chip marks the first course that is not registered (or whose request expired, lapsed or was declined). No completion progress until Canvas.
- **Saved courses** (`h2`, shown when the learner has any): one card per course with a linked `h3` title, schedule and price, and **Remove** (accessible name "Remove {course} from saved courses"). After removal, focus moves to the section heading and the status region announces it; removing the last course leaves the section with "No saved courses" and a Browse courses link.
- Action errors stay inside the affected card. Successes show a snackbar ("Seat reserved for …", "Payment simulated for …").
- Focus and announcements follow the Focus and Feedback patterns above. Action buttons carry `data-next-action`, and course headings are programmatic focus targets.

### Staff (`/staff`)

- **Staff sign-in (mock, [ADR 0004](../adr/0004-staff-roles-mock-sign-in.md)):** shown when no staff session exists.
  - A radio group lists active demo staff (name, email, role chips) inside a labelled fieldset.
  - "Sign in as staff" submits; an inline error appears if nobody is chosen.
  - An info note says SSO replaces this screen later.
- **Staff session bar:** "Signed in as {name} ({email})", role chips, and **Switch staff member**, which returns to sign-in. The workspace remounts per member, so no data or tab carries over.
- **Permission-aware UI:** controls appear only when the member's scopes allow them; the API still enforces every scope.
  - Without `catalog:write`, Offerings, Collections and Explore page show a view-only note and hide New offering, New collection, Edit, Publish and Unpublish.
  - Without `approvals:decide`, Approvals shows "Approver role required" in place of the decision buttons.
  - Without `exceptions:resolve`, Exceptions shows "Support or IT/Canvas role required" instead of Review.
  - Without `prototype:simulate`, the simulation select is disabled with an explanation.
- **Admin layout (October 7, 2026):** staff pages use the full window width (the shell drops its centered container and outer padding under `/staff`).
  - **Sidebar** (`nav`, `aria-label="Staff sections"`): grouped links, each group a labelled list. Overview: Dashboard. Catalog: Offerings, Collections, Explore page. Learners: Approvals (count), Exceptions (count), Learners. Finance: Transactions (`payments:read`). Administration: Staff (`staff:manage`), Roles, Activity. Only permitted sections appear.
  - The current link has `aria-current="page"` and the selected style, which uses `Highlight` in forced colors. On `md` and up the sidebar is sticky and collapses to a 72px icon rail (each link named, with a tooltip; remembered in `localStorage`). Below `md` it is a drawer opened by **Staff sections**, which closes on navigation.
  - **Addresses:** each section is its own route via `staff/[[...section]]`: `/staff` (Dashboard), `/staff/offerings`, `/staff/collections`, `/staff/explore`, `/staff/approvals`, `/staff/exceptions`, `/staff/learners`, `/staff/transactions`, `/staff/staff` (with `?role=` for the Roles → Manage people filter), `/staff/roles` and `/staff/activity`. Unknown or not-permitted addresses are replaced by `/staff`. Back and forward work.
  - **Header:** a "Staff workspace" overline, an `h1` with the section name, and a compact session panel (name, email, role chips, mock sign-in note, **Switch staff member**, **API docs**). Moving between sections focuses the `h1` and sets the document title to "{Section} · Staff".

- **Collections:**
  - `h2` "Collections and pathways" with a one-line explanation and **New collection** (catalog managers).
  - Table on `md` and up (Title with the `/collections/{slug}` address, linked once published; Type; Courses as an ordered list for pathways, unpublished ones marked "not published, hidden from learners"; Followers for pathways; Status chip; Actions). Cards below `md`.
  - Row actions: **Edit**, plus **Publish** for drafts or **Unpublish** (error color) for published ones. Unpublish opens a confirmation dialog stating that learners lose sight of it, followers keep their follow, and registrations are unaffected. A refused publish (too few published courses) shows an inline error above the table.
  - **New collection** and **Edit** open one dialog following the Forms pattern: Type (fixed after creation), Title, Web address (optional on create, fixed afterwards), Summary, and a **Courses** fieldset. Each course row has **Move up**, **Move down** and **Remove** icon buttons named with the course title. Focus stays on the moved course's arrow, switching to the other arrow at the ends; after a removal, focus goes to the neighbouring Remove button or the **Add a course** select. A visually hidden status region announces each move, addition and removal.
- **Offering page** (`/staff/offerings/{id}` and `/{tab}`, built October 8, 2026): opened from an offering's title in the Offerings list. An **All offerings** link, the course title (`h2`), a status chip and the sales page status, then an **Offering sections** `nav` of links (Overview, Details, Settings, Sales page, Activity; the current one has `aria-current="page"`). Each tab has its own address and an `h3`. Following a link moves focus to the new tab's heading (or to the title when arriving from the list, and back to the list heading on return). The former `/staff/sales-pages` addresses redirect to the matching tab.
  - **Overview:** Publish, or Unpublish (with the existing dialog), for catalog managers; price, schedule, format, seats in use and approval as a description list; a **Registrations** table of counts by status with a total (counts only; learner details stay in Learners); links to the course page, the Canvas course and the Sales page tab.
  - **Details** and **Settings:** the offering form inline, each with only its own fields (Details: title, topic, summary, description, course type, format, dates, price with history, capacity; Settings: approval, approval validity, enrollment window, Canvas link). Saving sends the other fields unchanged, the error summary lists only this tab's fields, and **Discard changes** resets the form. Staff without `catalog:write` see a view-only note and a description list.
  - **Unsaved changes:** a tab with unsaved changes asks "Leave without saving?" (Stay, Discard changes) before following a link on the page, and the browser warns before closing. The staff sidebar does not ask yet.
  - **Activity:** the offering's own audit events, newest first, with time, who and any reason.
- **Sales page tab** (decision F2): staff without `content:write` see a view-only note and the preview.
  - **Editor:** **Edit** and **Preview** tabs. Each block is a `fieldset` whose `legend` ("Block 2 of 5: Text") is its first child, with Move up, Move down and Remove icon buttons named after the block. Focus stays on the moved block's arrow (switching arrows at the ends), goes to the next block after a removal, and to a new block when added; a polite live region announces each change. Blocks: Hero image (library image, a **Decorative only** checkbox, otherwise required alternative text, optional tagline), Text, Learning outcomes (the offering's own outcomes), Instructor, Testimonial (quote, name, role, a consent checkbox and a staff-only note on where consent is kept), Questions and answers. Up to 20 blocks.
  - Text is plain: blank lines separate paragraphs and lines starting with "- " form a bulleted list. There is no HTML. Prices, dates, seats and registration come from the offering.
  - **Browser tab and search results:** page title (70 characters) and description (160).
  - **Before publishing** (warning alert) lists what the saved draft still needs. **Save draft** is version-checked. **Publish** uses `aria-disabled` while there are unsaved changes or problems and explains why when pressed. **Remove published page** (error color) confirms in a dialog; the draft and revisions are kept.
  - **Published revisions:** number, time and publisher, the live one marked; **Copy to draft** confirms in a dialog, then replaces the draft.
- **Explore page:** three outlined panels in the learner order (Featured courses up to 5, Featured pathways up to 3, Featured collections up to 3), each using the shared ordered-list editor (the same keyboard behavior as the collection dialog). The editor's add select stays enabled when full, because it often has focus; its menu then shows "Limit of N reached" and its helper text explains the limit. Only published items are offered. **Save Explore page** saves all three lists in one audited command, and a polite note reports unsaved changes. Staff without `catalog:write` see the picks as read-only ordered lists.
- **Offerings:**
  - Search by title, Status filter (All, Published, Draft), live count.
  - Sortable columns: Offering, Schedule, Price, Seats, Status. The phone sort select adds "Fewest seats left" and "Drafts first".
  - The Schedule column adds "Enrollment closes/closed {date}" for Scheduled courses.
  - Each title links to the offering's page. A **Sales page** column (None, Draft, Published, Unpublished changes) and filter show which pages need work.
  - Row actions: **Publish** for drafts or **Unpublish** (error color) for published offerings. Accessible names include the course title. Editing happens on the offering page.
  - **New offering** opens the offering form in a dialog; after saving, the new draft's page opens with its title focused. The form follows the Forms pattern and is version-checked. Fields:
    - Course title, Topic, Short summary, Description.
    - Course type, Format.
    - Start and End dates plus Enrollment closes (days after start), for Scheduled only.
    - Price (USD), Seat capacity.
    - Approval switch, plus Approval valid for (days) when approval is required.
    - Canvas course URL (optional, https).
  - New offerings save as drafts, and each policy defaults to 7 days. Focus returns to the opening button when the dialog is cancelled.
  - Editing a **published** offering (Details and Settings tabs):
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

- **Dashboard** (`src/web/components/staff-dashboard.tsx`, all staff; sample on prototype data):
  - **Filters**, in one row above everything: date range (last 7, 30 or 90 days, last 12 months, all time) and offering. A note shows the sample date range. A one-line polite live summary announces filter results.
  - **Enrollment:**
    - KPI tiles: new registrations, enrolled, in progress, awaiting approval, needs staff review, and seats filled now as a percentage with a meter.
    - A "New registrations per day, week or month" column chart.
    - A By offering table (cards below `md`) with seat meters (`role="meter"`) and Export CSV.
  - **Sales (simulated)**, only with `reports:sales` (otherwise "Sales figures are shown to staff administrators"):
    - Tiles: gross, orders, average order (two decimals), first-time and returning buyers, and refunds ("—", arriving with Stripe).
    - A gross sales chart.
    - A Sales by offering table with Export CSV.
  - **Completion:** a placeholder until the Canvas connection (R2, F11).
  - **Charts** (dataviz method):
    - Single series, so there is no legend. Uses one validated hue per mode (`#2a78d6` light, `#3987e5` dark; the brand navy fails as a data fill), with a same-ramp meter track.
    - Bars are at most 24px wide, with 4px rounded tops and a single baseline. The y-axis shows 0 and a rounded maximum; x-axis labels are sparse.
    - One tab stop: arrow keys, Home and End move between bars. Hover or focus shows a tooltip, with the value first. The current value is announced politely.
    - **Show table** gives every value.
  - **CSV export** contains aggregates only, and neutralizes formula injection.
- **Learners** (`src/web/components/staff-learners.tsx`, all staff):
  - Search by email, a live "N of M learners" count, a sort select on phones, and paging.
  - A table at `md` and wider (cards below): Learner, Registrations (with enrolled and in-progress counts), access status (Active or Deactivated), Joined, Last activity, View. Learner, Registrations, Joined and Last activity are sortable.
  - **View** opens Learner details:
    - Email, join date and any deactivation date.
    - Registrations: course, status in learner wording, paid or quoted price, date.
    - Recent activity: up to 50 events, with reasons.
  - **Account access** (requires `learners:manage`, held by Support): a required Reason field (10–500 characters, audited, inline error) and **Deactivate learner** (error color) or **Reactivate learner**.
    - Others see "Changing account access requires the Support role."
    - The legacy sample learner cannot be deactivated.
    - Focus returns to the View button on close.
- **Staff** (`src/web/components/staff-admin.tsx`, requires `staff:manage`):
  - A Role filter (fed by Roles → Manage people) and a live "N of M staff members" count.
  - A table on tablets and desktops, cards on phones: Name ("(you)" marks yourself), Email, role chips, Active/Inactive, Edit.
  - **Add staff member** and **Edit** open one dialog that follows the Forms pattern. Fields:
    - Name (2–120 characters).
    - Email (create only; locked when editing).
    - Roles (checkbox fieldset, at least one).
    - Active switch (edit only).
  - Editing yourself shows a warning.
  - A server rejection, such as removing the last active staff administrator, appears in the error summary, which receives focus.
- **Roles:** one card per role with its description, its permissions in plain language, and the people who hold it (inactive people are marked). Staff administrators get **Manage people**, which opens the Staff tab filtered to that role. Role permissions are read-only.

## Known gaps

- Focus and announcement behavior is verified by keyboard and DOM inspection; no screen-reader session, forced-colors, zoom or cross-browser review has been recorded for this baseline.
- Staff paging and sorting are client-side, so they cover at most the 100 offerings and 200 audit events the API returns.
- The provisioning simulation is one shared setting for all demo users. Exceptions have no assigned owner, age target or alert.
- There is no manual light/dark toggle. The brand font, colors and copy await Cedarville review.
