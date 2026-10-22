import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";
// WCAG 2.2 A/AA rules on the key learner and staff screens, in light, dark and
// phone layouts. Uses synthetic accounts only: a demo learner on example.test
// and the seeded demo staff administrator on cuce.test.
const tags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

test.describe("T01 offering visibility", () => {
  const id = "00000000-0000-4000-8000-000000000301";
  const listingName = "Listed in course discovery";
  async function setup(
    page: Page,
    {
      published = true,
      listed = true,
      editable = true,
      incomplete = false,
    } = {},
  ) {
    const offering = {
      id,
      title: "Visibility test course",
      category: "Technology",
      summary: "A synthetic course for visibility checks.",
      description:
        "A synthetic course description used to verify independent visibility settings.",
      format: "Online",
      course_type: incomplete ? null : "self_paced",
      start_date: null,
      end_date: null,
      capacity: incomplete ? null : 20,
      unlimited_seats: false,
      price_cents: incomplete ? null : 1000,
      published,
      listed,
      version: 1,
      approval_required: false,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      canvas_course_url: null,
      imported_from_canvas: incomplete,
      unpublished_at: null,
      seats_available: incomplete ? null : 20,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: true,
      outcomes: [],
      collections: [],
      sales_page: null,
    };
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: null,
          email: null,
          auth: { mode: "mock", configured: true },
        },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000302",
            email: "visibility@example.test",
            display_name: "Visibility tester",
            active: true,
            version: 1,
            roles: [editable ? "catalog_manager" : "support"],
            scopes: editable ? ["catalog:write"] : [],
          },
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [offering] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
    );
    await page.route(`**/api/offerings/${id}/prices`, (route) =>
      route.fulfill({ json: [] }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    return offering;
  }
  test("keyboard listing control saves independently and requires an audit reason", async ({
    page,
  }) => {
    const offering = await setup(page);
    const writes: any[] = [];
    await page.route(`**/api/offerings/${id}/edit`, async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      expect(body.version).toBe(offering.version);
      expect(body.reason).toBe("Share course only by its direct link");
      expect(body.priceCents).toBe(offering.price_cents);
      Object.assign(offering, {
        listed: body.listed,
        version: offering.version + 1,
      });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/settings`);
    const listing = page.getByRole("switch", { name: listingName });
    await expect(listing).toBeChecked();
    await listing.focus();
    await page.keyboard.press("Space");
    await expect(listing).not.toBeChecked();
    await expect(page.getByText(/Unlisted: published courses/)).toBeVisible();
    const save = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await save.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Fix these fields" }),
    ).toBeFocused();
    expect(writes).toHaveLength(0);
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Share course only by its direct link");
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].listed).toBe(false);
    await expect(
      page.getByText("Published · Unlisted", { exact: true }),
    ).toBeVisible();
    await scan(page, "Published unlisted settings");
    await page.reload();
    await expect(listing).not.toBeChecked();
    await listing.focus();
    await page.keyboard.press("Space");
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Share course only by its direct link");
    await save.click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].listed).toBe(true);
    await expect(listing).toBeChecked();
    await scan(page, "Relisted offering settings");
  });
  test("stale visibility save preserves input and announces the conflict", async ({
    page,
  }) => {
    await setup(page);
    await page.route(`**/api/offerings/${id}/edit`, (route) =>
      route.fulfill({
        status: 409,
        json: { message: "Offering changed. Refresh and retry." },
      }),
    );
    await page.goto(`/staff/offerings/${id}/settings`);
    const listing = page.getByRole("switch", { name: listingName });
    await listing.uncheck();
    await page
      .getByRole("textbox", { name: "Reason for change", exact: true })
      .fill("Restrict discovery to direct course links");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Offering changed" }),
    ).toBeFocused();
    await expect(listing).not.toBeChecked();
    await scan(page, "Stale listing preference save");
  });
  test("incomplete imported draft saves listing without publishing or filling sales details", async ({
    page,
  }) => {
    const offering = await setup(page, { published: false, incomplete: true });
    let saved = false;
    await page.route(`**/api/offerings/${id}/settings`, async (route) => {
      const body = route.request().postDataJSON();
      expect(body.listed).toBe(false);
      expect(body.priceCents).toBeUndefined();
      expect(body.version).toBe(1);
      saved = true;
      Object.assign(offering, { listed: false, version: 2 });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/settings`);
    await page.getByRole("switch", { name: listingName }).uncheck();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect.poll(() => saved).toBe(true);
    await expect(
      page.getByText("Draft · Unlisted", { exact: true }),
    ).toBeVisible();
    await scan(page, "Incomplete draft listing settings");
  });
  test("view-only staff see unlisted state without an edit control", async ({
    page,
  }) => {
    await setup(page, { listed: false, editable: false });
    await page.goto(`/staff/offerings/${id}/settings`);
    await expect(
      page.getByText("Published · Unlisted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: listingName })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Unlisted — published courses are available by direct link",
        { exact: true },
      ),
    ).toBeVisible();
    await scan(page, "Read-only offering visibility");
  });
  test("staff curation retains hidden membership and explains unlisted featured picks", async ({
    page,
  }) => {
    const offering = await setup(page, { listed: false });
    await page.route("**/api/staff/collections", (route) =>
      route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000303",
            kind: "collection",
            slug: "visibility-group",
            title: "Visibility group",
            summary: "A collection with an unlisted course",
            published: true,
            version: 1,
            followers: 0,
            courses: [
              { id, title: offering.title, published: true, listed: false },
            ],
          },
        ],
      }),
    );
    await page.route("**/api/staff/explore", (route) =>
      route.fulfill({
        json: {
          courses: [{ id, title: offering.title, published: true }],
          collections: [],
          pathways: [],
        },
      }),
    );
    await page.goto("/staff/collections");
    await expect(
      page.locator("li:visible").filter({ hasText: offering.title }),
    ).toContainText("unlisted, hidden from this list");
    await scan(page, "Staff collection unlisted membership");
    await page.goto("/staff/explore");
    await expect(
      page.getByText("Unlisted; hidden from Explore until listed", {
        exact: true,
      }),
    ).toBeVisible();
    await scan(page, "Staff retained unlisted featured pick");
  });
});

test.describe("CU learner OAuth", () => {
  async function sessions(page: Page, signedIn = false, staff = false) {
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: signedIn ? "00000000-0000-4000-8000-000000000099" : null,
          email: null,
          display_name: signedIn ? "CU Test Learner" : null,
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: staff
            ? {
                id: "test-staff",
                email: "test@example.test",
                display_name: "Test Staff",
                roles: ["staff_admin"],
                scopes: [],
              }
            : null,
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
  }
  test("existing-account sign-in and error are accessible without password fields", async ({
    page,
  }) => {
    await sessions(page);
    await page.goto("/sign-in?returnTo=%2Flearning");
    const link = page.getByRole("link", {
      name: "Sign in with CU account",
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await expect(link).toHaveAttribute(
      "href",
      "/api/auth/learner/canvas/start?returnTo=%2Flearning",
    );
    for (
      let i = 0;
      i < 25 &&
      !(await link.evaluate((element) => element === document.activeElement));
      i++
    )
      await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await scan(page, "CU learner sign-in");
    await page.goto("/sign-in?authError=invalid");
    await expect(
      page.getByRole("alert").filter({ hasText: "Sign-in expired" }),
    ).toBeVisible();
    await scan(page, "CU learner sign-in error");
  });
  test("Canvas identity without email stays signed in after checkout return", async ({
    page,
  }) => {
    await sessions(page, true, true);
    await page.route("**/api/me/**", (route) => route.fulfill({ json: [] }));
    await page.goto("/settings");
    await expect(
      page.getByText("Your CU account is linked through Canvas.", {
        exact: false,
      }),
    ).toBeVisible();
    await scan(page, "CU learner account settings");
    await page.goto("/learning?checkout=success");
    await expect(
      page.getByRole("heading", { name: "My learning", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await scan(page, "CU learner checkout return");
  });
  test("staff can reach the separate learner login", async ({
    page,
    isMobile,
  }) => {
    await sessions(page, false, true);
    await page.goto("/settings");
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    const link = page.getByRole(isMobile ? "menuitem" : "link", {
      name: "Use as learner",
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/sign-in");
    if (isMobile) await page.keyboard.press("Escape");
    await scan(page, "staff-to-learner navigation");
  });
  test("staff learner list identifies Canvas learners by name without email", async ({
    page,
  }) => {
    await sessions(page, false, true);
    await page.route("**/api/staff/learners", (route) =>
      route.fulfill({
        json: [
          {
            id: "00000000-0000-4000-8000-000000000099",
            email: null,
            display_name: "CU Test Learner",
            created_at: "2026-10-21T12:00:00Z",
            active: true,
            version: 1,
            registrations: 0,
            enrolled: 0,
            in_progress: 0,
            last_activity: null,
          },
        ],
      }),
    );
    await page.goto("/staff/learners");
    await expect(
      page
        .getByRole("button", { name: "View learner CU Test Learner" })
        .first(),
    ).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search learners" });
    await search.fill("CU Test");
    await expect(
      page
        .getByRole("button", { name: "View learner CU Test Learner" })
        .first(),
    ).toBeVisible();
    await scan(page, "Canvas learner name in staff directory");
  });
});
async function scan(page: Page, name: string) {
  // Wait for loading placeholders to be replaced before scanning.
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".MuiSkeleton-root")).toHaveCount(0, {
    timeout: 15_000,
  });
  // Let dialog fades and other transitions finish: mid-fade text is partly
  // transparent, which axe reports as low contrast (seen in WebKit on CI).
  // Endless animations, such as the keyboard focus pulse on radio buttons,
  // never finish and are skipped.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(tags)
    .analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
        .slice(0, 5)
        .map((n) => n.target.join(" "))
        .join("\n  ")}`,
  );
  expect(summary, `${name} accessibility violations`).toEqual([]);
}
// Staff sections have their own addresses (/staff/offerings, ...).
// Opens the sales page editor for a sample course and fills the rich text
// editor with a heading, a paragraph and a video, without saving, so the scans
// cover the editor, its toolbar and the preview.
async function openEditorWithRichContent(page: Page) {
  await page.request.post("/api/staff-session", {
    data: { email: "content@cuce.test" },
  });
  await page.goto(
    "/staff/offerings/10000000-0000-4000-8000-000000000001/sales-page",
  );
  const editor = page.getByRole("textbox", { name: "Page content" });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("Why take this course");
  await page.getByRole("combobox", { name: "Styles" }).click();
  await page.getByRole("option", { name: "Heading 2" }).click();
  await editor.press("End");
  await editor.press("Enter");
  await page.keyboard.type("Turn everyday spreadsheets into clear answers.");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Add a video" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a video" });
  await dialog
    .getByRole("textbox", { name: "Video link or embed code" })
    .fill("https://vimeo.com/76979871");
  await dialog
    .getByRole("textbox", { name: "Video title" })
    .fill("Course introduction");
  await dialog.getByRole("button", { name: "Add video" }).click();
  await expect(dialog).toBeHidden();
  await expect(editor.locator("[data-video-embed]")).toHaveCount(1);
}
const staffSlugs: Record<string, string> = {
  Dashboard: "",
  Offerings: "offerings",
  Collections: "collections",
  "Explore page": "explore",
  Approvals: "approvals",
  Exceptions: "exceptions",
  Activity: "activity",
  Transactions: "transactions",
  Learners: "learners",
  Staff: "staff",
  Roles: "roles",
};
test.describe("learner pages", () => {
  test("catalog", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Catalog");
  });
  for (const tab of ["courses", "collections", "pathways"])
    test(`catalog ${tab} tab`, async ({ page }) => {
      await page.goto(`/?tab=${tab}`);
      await expect(page.getByRole("tab", { selected: true })).toBeVisible();
      await scan(page, `Catalog ${tab} tab`);
    });
  test("my learning with pathways and saved courses", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    const pathway = await (
      await page.request.get("/api/collections/data-informed-leader")
    ).json();
    const command = (path: string, data: object) =>
      page.request.post(`/api/${path}`, {
        data,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    await command(`me/pathways/${pathway.id}`, { following: true });
    await command(`me/saved-courses/${pathway.offerings[0].id}`, {
      saved: true,
    });
    await page.goto("/learning");
    await expect(
      page.getByRole("heading", { level: 2, name: "Pathways you follow" }),
    ).toBeVisible();
    await scan(page, "My learning with pathways and saved courses");
  });
  test("catalog filtered by a pathway", async ({ page }) => {
    await page.goto("/?collection=data-informed-leader");
    await expect(
      page.getByRole("heading", { level: 2, name: "Data-Informed Leader" }),
    ).toBeVisible();
    await scan(page, "Catalog with collection filter");
  });
  test("pathway page", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    await page.goto("/collections/data-informed-leader");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Pathway page");
  });
  test("sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await scan(page, "Sign-in");
  });
  test("course detail", async ({ page }) => {
    await page.goto("/");
    const course = page.locator('a[href^="/courses/"]').first();
    await page.goto((await course.getAttribute("href")) as string);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Course detail");
  });
  test("my learning", async ({ page }) => {
    const signIn = await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    expect(signIn.ok()).toBeTruthy();
    await page.goto("/learning");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "My learning");
  });
});
test("placeholder Canvas link dialog", async ({ page }) => {
  // Enroll the scan's synthetic learner in a sample course (placeholder Canvas
  // address) through the normal flow; later runs reuse the same registration.
  await page.request.post("/api/demo-session", {
    data: { email: "a11y-scan@example.test" },
  });
  const command = (path: string, data: object) =>
    page.request.post(`/api/${path}`, {
      data,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  const registration = await (
    await command("registrations", {
      offeringId: "10000000-0000-4000-8000-000000000001",
    })
  ).json();
  if (registration.status === "reserved")
    await command(
      `prototype/registrations/${registration.id}/simulate-payment`,
      {},
    );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/me/learning")).json()).find(
          (row: { id: string }) => row.id === registration.id,
        )?.status,
      { timeout: 30_000 },
    )
    .toBe("enrolled");
  await page.goto("/learning");
  await page
    .getByRole("button", { name: "Open Practical Data Analysis in Canvas" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await scan(page, "Placeholder Canvas link dialog");
});
test("text fields show focus with a thicker border, not an outline over the label", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const field = page.getByRole("textbox").first();
  await field.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  expect(
    await field.evaluate(
      (el) =>
        getComputedStyle(
          el
            .closest(".MuiOutlinedInput-root")!
            .querySelector(".MuiOutlinedInput-notchedOutline")!,
        ).borderWidth,
    ),
  ).toBe("3px");
});
test("settings page: color theme choice and memory", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  const group = page.getByRole("radiogroup", { name: "Color theme" });
  await expect(
    group.getByRole("radio", { name: /^Match device/ }),
  ).toBeChecked();
  await scan(page, "Settings");
  // Choosing the opposite of the device's setting overrides it, from the keyboard.
  const device = await page.evaluate(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const other = device === "dark" ? "light" : "dark";
  await group.getByRole("radio", { name: /^Match device/ }).focus();
  // Light is next, Dark after it (Safari does not wrap arrow keys).
  await page.keyboard.press("ArrowDown");
  if (other === "dark") await page.keyboard.press("ArrowDown");
  await expect(
    group.getByRole("radio", { name: new RegExp(`^${other}`, "i") }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveClass(new RegExp(other));
  await scan(page, `Settings in the ${other} theme`);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(new RegExp(other));
  await expect(
    group.getByRole("radio", { name: new RegExp(`^${other}`, "i") }),
  ).toBeChecked();
});
test("Stripe test cards dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Test Payment Info" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Stripe sandbox test cards",
  });
  await expect(dialog).toBeVisible();
  await scan(page, "Stripe test cards dialog");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Test Payment Info" }),
  ).toBeFocused();
});
test.describe("staff workspace", () => {
  test("staff sign-in", async ({ page }) => {
    await page.request.delete("/api/staff-session");
    await page.goto("/staff");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "Staff sign-in");
  });
  const tabs = [
    "Dashboard",
    "Offerings",
    "Collections",
    "Explore page",
    "Approvals",
    "Exceptions",
    "Activity",
    "Transactions",
    "Learners",
    "Staff",
    "Roles",
  ];
  for (const tab of tabs)
    test(`${tab} tab`, async ({ page }) => {
      const signIn = await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      expect(signIn.ok()).toBeTruthy();
      await page.goto(`/staff/${staffSlugs[tab]}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
      await scan(page, `Staff ${tab} tab`);
    });
});
// Each tab of an offering's page, as a catalog manager (editable forms) and as
// an approver (read-only views).
const offeringTabs = ["", "details", "settings", "sales-page", "activity"];
for (const who of ["catalog@cuce.test", "approver@cuce.test"])
  test(`offering page tabs as ${who.split("@")[0]}`, async ({ page }) => {
    await page.request.post("/api/staff-session", { data: { email: who } });
    for (const tab of offeringTabs) {
      await page.goto(
        `/staff/offerings/10000000-0000-4000-8000-000000000001${tab ? `/${tab}` : ""}`,
      );
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Practical Data Analysis",
        }),
      ).toBeVisible();
      await expect(page.locator("#offering-panel-heading")).toBeVisible();
      await scan(page, `Offering page ${tab || "overview"} as ${who}`);
    }
  });
test("unsaved changes: the staff sidebar asks before leaving", async ({
  page,
}) => {
  await page.request.post("/api/staff-session", {
    data: { email: "catalog@cuce.test" },
  });
  await page.goto(
    "/staff/offerings/10000000-0000-4000-8000-000000000001/settings",
  );
  const field = page.getByRole("textbox", { name: "Canvas course URL" });
  await field.fill("https://canvas.example.edu/courses/changed");
  // On phones the sidebar is in a drawer behind the "Staff sections" button.
  const sections = page.getByRole("button", { name: "Staff sections" });
  const clickCollections = async () => {
    if (await sections.isVisible()) await sections.click();
    await page
      .getByRole("navigation", { name: "Staff sections" })
      .getByRole("link", { name: "Collections" })
      .filter({ visible: true })
      .click();
  };
  await clickCollections();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await scan(page, "Leave without saving dialog");
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
  // Stay returns to the open drawer on phones; Escape closes it.
  if (await page.locator(".MuiDrawer-paper").isVisible())
    await page.keyboard.press("Escape");
  await expect(field).toHaveValue("https://canvas.example.edu/courses/changed");
  await clickCollections();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/staff\/collections$/);
});
test("sales page editor and preview", async ({ page }) => {
  await openEditorWithRichContent(page);
  await scan(page, "Sales page editor");
  // Choosing an image asks for its description first (cancelled: nothing is uploaded).
  await page.locator('input[type="file"]').setInputFiles({
    name: "chart.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex",
    ),
  });
  const describe = page.getByRole("dialog", { name: "Describe the image" });
  await expect(describe).toBeVisible();
  await expect(
    describe.getByRole("textbox", { name: "Image description" }),
  ).toBeFocused();
  await scan(page, "Image description dialog");
  await describe.getByRole("button", { name: "Cancel" }).click();
  await expect(describe).toBeHidden();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await scan(page, "Sales page preview");
});
test.describe("staff dialogs", () => {
  // Opens each dialog and scans it; nothing is submitted.
  const dialogs: [string, string, RegExp][] = [
    ["New offering", "Offerings", /^New offering$/],
    ["Unpublish offering", "Offerings", /^Unpublish /],
    ["Learner details", "Learners", /^View learner /],
    ["New collection", "Collections", /^New collection$/],
    ["Edit collection", "Collections", /^Edit /],
    ["Add staff member", "Staff", /^Add staff member$/],
  ];
  for (const [name, tab, button] of dialogs)
    test(`${name} dialog`, async ({ page }) => {
      if (tab === "Staff") {
        const member = {
          id: "00000000-0000-4000-8000-000000000001",
          email: "staff-dialog@example.test",
          display_name: "Staff dialog test",
          roles: ["staff_admin"],
          scopes: ["staff:read", "staff:manage"],
          active: true,
          version: 1,
          auth_provider: "canvas:https://canvas.example.test",
        };
        await page.route("**/api/staff-session", (route) =>
          route.fulfill({
            json: { member, auth: { mode: "canvas", configured: true } },
          }),
        );
        await page.route("**/api/staff/members", (route) =>
          route.fulfill({ json: [member] }),
        );
      } else {
        await page.request.post("/api/staff-session", {
          data: { email: "admin@cuce.test" },
        });
      }
      await page.goto(`/staff/${staffSlugs[tab]}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
      await page.getByRole("button", { name: button }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `${name} dialog`);
      if (tab === "Staff") {
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("checkbox", { name: "Finance", exact: true }),
        ).toHaveCount(0);
        await dialog.getByRole("button", { name: "Cancel" }).press("Enter");
        const edit = page.getByRole("button", {
          name: "Edit Staff dialog test",
        });
        await edit.press("Enter");
        await expect(dialog).toHaveAccessibleName("Edit staff member");
        await expect(
          dialog.getByRole("checkbox", { name: "Finance", exact: true }),
        ).toHaveCount(0);
        await expect(dialog.getByRole("checkbox")).toHaveCount(6);
        await scan(page, "Edit staff member dialog");
        await page.screenshot({
          path: `/tmp/ce-staff-roles-edit-${test.info().project.name}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
      }
    });
});

test.describe("Canvas course connector", () => {
  const sourceCourse = {
    id: "101",
    account_id: "50",
    name: "Working with Data",
    course_code: "CE-101",
    workflow_state: "available",
    start_at: null,
    end_at: null,
    url: "https://canvas.example.test/courses/101",
    sync_status: "not_synced" as string,
    synced_at: null as string | null,
  };
  function preview() {
    return {
      enabled: true,
      configured: true,
      connected: true,
      subaccount_id: "50",
      include_subaccounts: false,
      last_success_at: null as string | null,
      saved_run_id: null as string | null,
      saved_revision: "0".repeat(64),
      synced_total: 0,
      source: "saved",
      preview: null as {
        run_id: string;
        expires_at: string;
        observed_at: string;
        total: number;
      } | null,
      preview_expired: false,
      latest_run: null as {
        id: string;
        status: string;
        trigger: string;
        course_count: number;
        error: string | null;
      } | null,
      schedule: {
        enabled: false,
        interval_minutes: 60,
        owner_name: null as string | null,
        owner_active: true,
        next_run_at: null as string | null,
        version: 0,
      },
      courses: [] as (typeof sourceCourse)[],
      total: 0,
      page: 1,
      page_size: 100,
    };
  }
  async function staff(
    page: Page,
    scopes = ["canvas:read", "canvas:sync", "canvas:manage"],
  ) {
    await page.route("**/api/staff/canvas/sync", (route) =>
      route.fulfill({
        status: 503,
        json: { message: "No Canvas read fixture configured." },
      }),
    );
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "connector@example.test",
            display_name: "Course connector test",
            roles: ["staff_admin"],
            active: true,
            version: 1,
            scopes,
          },
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
  }
  test("unlimited seats require an explicit choice and display correctly for staff and learners", async ({
    page,
  }, testInfo) => {
    await staff(page, [
      "canvas:read",
      "canvas:sync",
      "catalog:read",
      "catalog:write",
    ]);
    const id = "00000000-0000-4000-8000-000000000202";
    const offering = {
      id,
      title: "Unlimited learning workshop",
      category: "Technology",
      summary: "A synthetic offering for unlimited-seat testing.",
      description:
        "This synthetic workshop verifies explicit unlimited capacity without changing live offerings.",
      format: "Online",
      course_type: "self_paced",
      start_date: null,
      end_date: null,
      capacity: null as number | null,
      unlimited_seats: false,
      price_cents: 7500,
      published: false,
      imported_from_canvas: true,
      unpublished_at: null,
      canvas_course_url: "https://canvas.example.test/courses/202",
      approval_required: false,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      version: 1,
      seats_available: null as number | null,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: true,
      outcomes: [],
      collections: [],
      sales_page: null,
    };
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [offering] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
    );
    await page.route(`**/api/offerings/${id}/prices`, (route) =>
      route.fulfill({ json: [] }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({ json: { email: null } }),
    );
    let saves = 0;
    await page.route(`**/api/offerings/${id}/edit`, async (route) => {
      const data = route.request().postDataJSON();
      expect(data.version).toBe(offering.version);
      expect(data.unlimitedSeats).toBe(saves === 0);
      expect(data.capacity).toBe(saves === 0 ? null : 25);
      saves++;
      Object.assign(offering, {
        unlimited_seats: data.unlimitedSeats,
        capacity: data.capacity,
        seats_available: data.capacity,
        version: offering.version + 1,
      });
      await route.fulfill({ json: { id } });
    });
    await page.goto(`/staff/offerings/${id}/details`);
    const unlimited = page.getByRole("checkbox", {
      name: "Unlimited seats",
      exact: true,
    });
    const capacity = page.getByRole("textbox", {
      name: "Seat capacity",
      exact: true,
    });
    const save = page.getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await expect(unlimited).not.toBeChecked();
    await expect(capacity).toHaveValue("");
    await save.press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "Fix these fields" }),
    ).toBeFocused();
    await unlimited.press("Space");
    await expect(unlimited).toBeChecked();
    await expect(capacity).toBeDisabled();
    await save.press("Enter");
    await expect.poll(() => saves).toBe(1);
    await expect(
      page.getByText(/Draft missing required information:/),
    ).toHaveCount(0);
    await expect(unlimited).toBeChecked();
    await scan(
      page,
      "Unlimited seats form, explicit choice and blank disabled capacity",
    );
    if (testInfo.project.name === "light")
      await page.screenshot({
        path: "artifacts/unlimited-seats.png",
        fullPage: true,
      });
    await page.reload();
    await expect(unlimited).toBeChecked();
    await unlimited.press("Space");
    await expect(capacity).toBeEnabled();
    await expect(capacity).toHaveValue("");
    await save.press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "Seat capacity" }),
    ).toBeFocused();
    await capacity.fill("25");
    await save.press("Enter");
    await expect.poll(() => saves).toBe(2);
    // Present an unlimited source response to check every display surface.
    Object.assign(offering, {
      unlimited_seats: true,
      capacity: null,
      seats_available: null,
      seats_in_use: 12,
    });
    await page.goto(`/staff/offerings/${id}`);
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("Unlimited seats · 12 in use", { exact: true }),
    ).toBeVisible();
    await page.goto("/staff/offerings");
    await expect(
      page
        .getByText(/Unlimited/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await scan(page, "Staff offering list with unlimited capacity");
    await page.route("**/api/staff/dashboard?*", (route) =>
      route.fulfill({
        json: {
          range: {
            days: 30,
            from: "2026-09-14",
            to: "2026-10-14",
            bucket: "day",
          },
          simulated: true,
          enrollment: {
            registrations: 12,
            enrolled: 0,
            in_progress: 12,
            awaiting_approval: 0,
            exceptions: 0,
            not_continuing: 0,
            seats_capacity: 0,
            seats_in_use: 12,
            limited_seats_in_use: 0,
            unlimited_offerings: 1,
            unlimited_seats_in_use: 12,
            trend: [],
            by_offering: [
              {
                ...offering,
                registrations: 12,
                enrolled: 0,
                in_progress: 12,
                awaiting_approval: 0,
              },
            ],
          },
          sales: null,
          completion: {
            available: false,
            reason: "Canvas completion is not connected.",
          },
        },
      }),
    );
    await page.goto("/staff");
    await expect(
      page.getByText(/1 unlimited offering · 12 seats in use/),
    ).toBeVisible();
    await scan(
      page,
      "Dashboard separates unlimited seats from finite occupancy",
    );
    await page.route(`**/api/offerings/${id}`, (route) =>
      route.fulfill({ json: { ...offering, published: true } }),
    );
    await page.goto(`/courses/${id}`);
    await expect(
      page.getByText("Unlimited seats", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in to register", exact: true }),
    ).toBeEnabled();
    await scan(
      page,
      "Learner offering with unlimited availability and enabled registration",
    );
  });
  test("imported drafts warn about missing fields, keep inputs blank and protect the Canvas link", async ({
    page,
  }, testInfo) => {
    await staff(page, [
      "canvas:read",
      "canvas:sync",
      "catalog:read",
      "catalog:write",
    ]);
    const id = "00000000-0000-4000-8000-000000000101";
    const draft = {
      id,
      title: "Imported Canvas workshop",
      category: "",
      summary: "",
      description: "",
      format: "",
      course_type: null as string | null,
      start_date: null,
      end_date: null,
      capacity: null as number | null,
      price_cents: null as number | null,
      published: false,
      imported_from_canvas: true,
      unpublished_at: null,
      canvas_course_url: "https://canvas.example.test/courses/101",
      approval_required: true,
      approval_valid_days: 7,
      enrollment_close_days: 7,
      version: 1,
      seats_available: null,
      seats_in_use: 0,
      active_registrations: 0,
      sales_page_status: "none",
      enrollment_open: false,
    };
    await page.route("**/api/staff/offerings", (route) =>
      route.fulfill({ json: [draft] }),
    );
    await page.route(`**/api/staff/offerings/${id}`, (route) =>
      route.fulfill({
        json: { offering: draft, registrations: {}, activity: [] },
      }),
    );
    for (const endpoint of ["approval-requests", "exceptions"])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: [] }),
      );
    await page.route("**/api/reconciliation", (route) =>
      route.fulfill({ json: { audit: [] } }),
    );
    await page.route("**/api/prototype/simulation", (route) =>
      route.fulfill({ json: { provisioningOutcome: "normal" } }),
    );
    await page.goto(`/staff/offerings/${id}`);
    await expect(
      page.getByText(/Draft missing required information:/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Not set", { exact: true }).first(),
    ).toBeVisible();
    await scan(
      page,
      "Imported offering overview and required-information warning",
    );
    if (testInfo.project.name === "light")
      await page.screenshot({
        path: "artifacts/canvas-offering-draft-warning.png",
        fullPage: true,
      });

    await page
      .getByRole("navigation", { name: "Offering sections" })
      .getByRole("link", { name: "Details", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Price (USD)" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("textbox", { name: "Seat capacity" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("combobox", { name: "Course type" }),
    ).toHaveText(/Not set/);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "Fix these fields" });
    await expect(summary).toBeFocused();
    await summary
      .getByRole("link", {
        name: "Course type: Choose a course type.",
        exact: true,
      })
      .press("Enter");
    await expect(
      page.getByRole("combobox", { name: "Course type" }),
    ).toBeFocused();
    await scan(
      page,
      "Imported offering details, blank fields and validation focus",
    );
    // Settings remain independently saveable while Details are incomplete.
    let settingsSaved = false;
    await page.route(`**/api/offerings/${id}/settings`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        version: 1,
        approvalValidDays: 14,
        enrollmentCloseDays: 7,
        listed: true,
        canvasCourseUrl: draft.canvas_course_url,
      });
      settingsSaved = true;
      await route.fulfill({ json: { id } });
    });
    await page
      .getByRole("navigation", { name: "Offering sections" })
      .getByRole("link", { name: "Settings", exact: true })
      .click();
    const canvasUrl = page.getByRole("textbox", { name: "Canvas course URL" });
    await expect(canvasUrl).toHaveAttribute("readonly");
    await page
      .getByRole("textbox", { name: "Approval valid for (days)" })
      .fill("14");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect.poll(() => settingsSaved).toBe(true);
    await scan(page, "Incomplete offering settings and protected Canvas link");
    await page.goto("/staff/offerings");
    await expect(
      page
        .getByText(/Missing required information:/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: `Publish ${draft.title}`, exact: true })
        .filter({ visible: true }),
    ).toBeDisabled();
    await scan(page, "Offerings list with incomplete imported drafts");
    await page.route("**/api/staff/dashboard?*", (route) =>
      route.fulfill({
        json: {
          range: {
            days: 30,
            from: "2026-09-14",
            to: "2026-10-14",
            bucket: "day",
          },
          simulated: true,
          enrollment: {
            registrations: 0,
            enrolled: 0,
            in_progress: 0,
            awaiting_approval: 0,
            exceptions: 0,
            not_continuing: 0,
            seats_capacity: 0,
            seats_in_use: 0,
            trend: [],
            by_offering: [
              {
                ...draft,
                registrations: 0,
                enrolled: 0,
                in_progress: 0,
                awaiting_approval: 0,
              },
            ],
          },
          sales: null,
          completion: {
            available: false,
            reason: "Canvas completion is not connected.",
          },
        },
      }),
    );
    await page.goto("/staff");
    await expect(
      page
        .getByText(/Seat capacity not set|^Not set$/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await scan(page, "Dashboard with an unset draft capacity");
  });
  test("setup needed and reauthorization states", async ({ page }) => {
    await staff(page);
    const data = preview();
    data.enabled = false;
    data.configured = false;
    data.connected = false;
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.goto("/staff/canvas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Canvas courses",
    );
    await expect(
      page.getByText("Canvas course reads are not configured yet.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Authorize course reads" }),
    ).toHaveCount(0);
    await scan(page, "Canvas courses setup");
    data.enabled = true;
    data.configured = true;
    await page
      .getByRole("button", { name: "Connection details", exact: true })
      .press("Enter");
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(
      page.getByRole("link", { name: "Authorize course reads" }),
    ).toHaveAttribute("href", "/api/auth/canvas/start");
    await scan(page, "Canvas courses reauthorization");
  });
  test("sync status, course preview and schedule keyboard controls", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    let polls = 0;
    let commands = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      if (data.latest_run?.status === "pending" && ++polls >= 2) {
        data.latest_run.status = "succeeded";
        data.latest_run.course_count = 1;
        data.source = "preview";
        data.preview = {
          run_id: data.latest_run.id,
          expires_at: "2099-10-14T12:30:00Z",
          observed_at: "2026-10-14T12:00:00Z",
          total: 1,
        };
        data.courses = [sourceCourse];
        data.total = 1;
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      data.latest_run = {
        id: "00000000-0000-4000-8000-000000000002",
        status: "pending",
        trigger: "manual",
        course_count: 0,
        error: null,
      };
      return route.fulfill({ status: 202, json: data.latest_run });
    });
    await page.route("**/api/staff/canvas/schedule", (route) => {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(data.schedule.version);
      data.schedule = {
        enabled: body.enabled,
        interval_minutes: body.intervalMinutes,
        owner_name: "Course connector test",
        owner_active: true,
        next_run_at: body.enabled ? "2026-10-14T13:00:00Z" : null,
        version: data.schedule.version + 1,
      };
      return route.fulfill({ json: { saved: true } });
    });
    let saves = 0;
    await page.route(
      "**/api/staff/canvas/sync-runs/*/sync-courses",
      (route) => {
        saves++;
        expect(route.request().postDataJSON()).toEqual({
          courseIds: ["101"],
          savedRevision: "0".repeat(64),
        });
        data.last_success_at = "2026-10-14T12:00:00Z";
        data.saved_run_id = data.preview!.run_id;
        data.synced_total = 1;
        data.saved_revision = "1".repeat(64);
        data.courses = [
          {
            ...sourceCourse,
            sync_status: "synced",
            synced_at: "2026-10-14T12:00:00Z",
          },
        ] as typeof data.courses;
        return route.fulfill({ json: { synced: true } });
      },
    );
    await page.goto("/staff/canvas");

    await expect(
      page.getByRole("button", { name: "Reading courses…", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).not.toBeFocused();
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    expect(commands).toBe(1);
    expect(saves).toBe(0);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("region", { name: "Canvas connection" })
        .getByRole("button", { name: "Sync Now", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Unsaved Canvas course preview");
    await page
      .getByRole("checkbox", {
        name: "Select Working with Data (Canvas ID 101)",
        exact: true,
      })
      .press("Space");
    await page
      .getByRole("button", { name: "Import selected", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeFocused();
    await expect(
      page.getByRole("cell", { name: "Imported", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Imported courses (1)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Imported courses (1)", exact: true }),
    ).toBeVisible();
    expect(saves).toBe(1);
    await expect(
      page.getByRole("link", { name: /Working with Data/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    const settings = page.getByRole("button", {
      name: "Schedule settings",
      exact: true,
    });
    await expect(
      page.getByRole("region", { name: "Scheduled course reads" }),
    ).toHaveCount(0);
    await settings.press("Enter");
    await expect(
      page.getByRole("button", { name: "Hide schedule settings" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("Scheduled synchronization is deferred in this demo.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable using my Canvas account" }),
    ).toHaveCount(0);
    await scan(page, "Canvas course preview and deferred schedule");
  });
  test("cached preview is reused and refresh stays in the filter toolbar", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 1,
    };
    data.courses = [sourceCourse];
    data.total = 1;
    let commands = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      data.latest_run = {
        id: data.preview!.run_id,
        status: "succeeded",
        trigger: "manual",
        course_count: 1,
        error: null,
      };
      return route.fulfill({ status: 202, json: { id: data.preview!.run_id } });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      page.getByText("1 matching courses of 1", { exact: true }),
    ).toBeVisible();
    expect(commands).toBe(0);
    await expect(
      page
        .getByRole("region", { name: "Canvas connection" })
        .getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toHaveCount(0);
    const refresh = page
      .getByRole("form", { name: "Filter Canvas courses" })
      .getByRole("button", { name: "Refresh from Canvas", exact: true });
    const buttonBox = await refresh.boundingBox();
    const toolbarBox = await page
      .getByRole("form", { name: "Filter Canvas courses" })
      .boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(
      Math.abs(
        buttonBox!.x + buttonBox!.width - toolbarBox!.x - toolbarBox!.width,
      ),
    ).toBeLessThanOrEqual(2);
    await refresh.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Course preview (1)" }),
    ).toBeFocused();
    expect(commands).toBe(1);
    await scan(page, "Cached course preview and refresh toolbar");
  });
  test("expired preview automatically reads once and a failure requires explicit retry", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    data.preview_expired = true;
    let attempts = 0,
      reads = 0;
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      reads++;
      if (attempts === 2) {
        data.preview = {
          run_id: "00000000-0000-4000-8000-000000000002",
          expires_at: "2099-10-14T12:30:00Z",
          observed_at: "2026-10-14T12:00:00Z",
          total: 1,
        };
        data.preview_expired = false;
        data.courses = [sourceCourse];
        data.total = 1;
        data.latest_run = {
          id: data.preview.run_id,
          status: "succeeded",
          trigger: "manual",
          course_count: 1,
          error: null,
        };
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 503,
          json: {
            message:
              "Automatic course read failed. Refresh from Canvas to retry.",
          },
        });
      return route.fulfill({
        status: 202,
        json: { id: "00000000-0000-4000-8000-000000000002" },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Automatic course read failed" }),
    ).toBeVisible();
    expect(attempts).toBe(1);
    const before = reads;
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect.poll(() => reads).toBeGreaterThan(before);
    expect(attempts).toBe(1);
    await page
      .getByRole("button", { name: "Refresh from Canvas", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    expect(attempts).toBe(2);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toBeDisabled();
    await scan(page, "Automatic preview retry");
  });
  test("an existing failed background read is followed without another automatic request", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    let gets = 0,
      commands = 0;
    let complete = false;
    data.latest_run = {
      id: "00000000-0000-4000-8000-000000000002",
      status: "running",
      trigger: "manual",
      course_count: 0,
      error: null,
    };
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      gets++;
      if (complete) {
        data.latest_run!.status = "failed";
        data.latest_run!.error =
          "Canvas read failed. Refresh from Canvas to retry.";
      }
      return route.fulfill({ json: data });
    });
    await page.route("**/api/staff/canvas/sync", (route) => {
      commands++;
      return route.fulfill({
        status: 503,
        json: { message: "Unexpected duplicate read" },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("button", { name: "Reading courses…", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    complete = true;
    await expect(
      page.getByRole("alert").filter({ hasText: "Canvas read failed" }),
    ).toBeVisible();
    expect(commands).toBe(0);
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect.poll(() => gets).toBeGreaterThanOrEqual(3);
    expect(commands).toBe(0);
  });
  test("select courses across pages, retry failures and find imported courses", async ({
    page,
  }, testInfo) => {
    await staff(page);
    const data = preview();
    const all = Array.from({ length: 26 }, (_, i) => ({
      ...sourceCourse,
      id: String(101 + i),
      name: `Selection course ${101 + i}`,
    }));
    const synced = new Set<string>();
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 26,
    };
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      const q = new URL(route.request().url()).searchParams;
      const rows =
        q.get("view") === "synced" ? all.filter((c) => synced.has(c.id)) : all;
      const pageNumber = Number(q.get("page") || 1),
        size = Number(q.get("pageSize") || 25);
      return route.fulfill({
        json: {
          ...data,
          saved_revision: "0".repeat(64),
          synced_total: synced.size,
          last_success_at: synced.size ? "2026-10-14T12:00:00Z" : null,
          total: rows.length,
          source_total: rows.length,
          courses: rows
            .slice((pageNumber - 1) * size, pageNumber * size)
            .map((c) => ({
              ...c,
              sync_status: synced.has(c.id) ? "synced" : "not_synced",
              synced_at: synced.has(c.id) ? "2026-10-14T12:00:00Z" : null,
              offering_id: synced.has(c.id)
                ? `00000000-0000-4000-8000-000000000${c.id}`
                : null,
              offering_title: c.name,
              offering_missing_fields: synced.has(c.id)
                ? ["Price", "Seat capacity", "Course type"]
                : [],
            })),
        },
      });
    });
    let requests = 0;
    await page.route(
      "**/api/staff/canvas/sync-runs/*/sync-courses",
      (route) => {
        requests++;
        if (requests === 1)
          return route.fulfill({
            status: 503,
            json: { message: "Temporary sync failure. Try again." },
          });
        const ids = route.request().postDataJSON().courseIds;
        expect(ids).toEqual(requests === 2 ? ["101", "126"] : ["126"]);
        ids.forEach((id: string) => synced.add(id));
        return route.fulfill({
          json: {
            synced: true,
            course_count: ids.length,
            created_count: requests === 2 ? ids.length : 0,
            existing_count: requests === 2 ? 0 : ids.length,
          },
        });
      },
    );
    await page.goto("/staff/canvas");
    const bulk = page.getByRole("button", {
      name: "Import selected",
      exact: true,
    });
    await expect(bulk).toBeDisabled();
    await expect(bulk).toHaveAccessibleDescription(
      "Creates drafts for new courses and refreshes Canvas source details for existing mappings. Staff edits are preserved.",
    );
    await expect(
      page.getByRole("button", {
        name: "Create offering draft for Selection course 101 (Canvas ID 101)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Import status", exact: true }),
    ).toBeVisible();
    const header = page.getByRole("checkbox", {
      name: "Select all courses on this page",
      exact: true,
    });
    await header.check();
    await expect(page.getByText("25 selected", { exact: true })).toBeVisible();
    await header.uncheck();
    await page
      .getByRole("checkbox", {
        name: "Select Selection course 101 (Canvas ID 101)",
        exact: true,
      })
      .check();
    await expect(header).toHaveAttribute("aria-checked", "mixed");
    await page
      .getByRole("button", { name: "Go to next page", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "Select Selection course 126 (Canvas ID 126)",
        exact: true,
      })
      .check();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await bulk.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Temporary sync failure" }),
    ).toBeVisible();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await bulk.click();
    await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
    if (testInfo.project.name === "light") {
      await page
        .getByRole("button", {
          name: "Refresh source details for Selection course 126 (Canvas ID 126)",
          exact: true,
        })
        .waitFor({ state: "visible" });
      await page.screenshot({
        path: "artifacts/canvas-import-controls.png",
        fullPage: true,
      });
    }
    await page
      .getByRole("button", {
        name: "Refresh source details for Selection course 126 (Canvas ID 126)",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Course preview (26)" }),
    ).toBeFocused();
    await page
      .getByRole("tab", { name: "Imported courses (2)", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: /^Selection course 101/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Selection course 126/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Open offering Selection course 101",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Missing required information: Price, Seat capacity, Course type",
        { exact: true },
      ),
    ).toHaveCount(2);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Import selected", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Imported Canvas courses");
  });
  test("course dates, filters, pagination and compact staff details", async ({
    page,
  }) => {
    await staff(page);
    const data = preview();
    const courses = [
      {
        ...sourceCourse,
        name: "Advanced Data Workshop",
        start_at: "2026-10-01T04:00:00Z",
        end_at: "2026-10-31T23:00:00Z",
      },
      {
        ...sourceCourse,
        id: "102",
        name: "Data Basics",
        workflow_state: "completed",
        start_at: null,
        end_at: null,
      },
    ];
    data.courses = courses as typeof data.courses;
    data.preview = {
      run_id: "00000000-0000-4000-8000-000000000002",
      expires_at: "2099-10-14T12:30:00Z",
      observed_at: "2026-10-14T12:00:00Z",
      total: 2,
    };
    data.total = 2;
    data.last_success_at = "2026-10-14T12:00:00Z";
    let query = new URLSearchParams();
    await page.route("**/api/staff/canvas/courses?*", (route) => {
      query = new URL(route.request().url()).searchParams;
      const filtered = courses.filter(
        (course) =>
          (!query.get("title") ||
            course.name
              .toLowerCase()
              .includes(query.get("title")!.toLowerCase())) &&
          (!query.get("startFrom") || Boolean(course.start_at)) &&
          (!query.get("endTo") || Boolean(course.end_at)) &&
          (query.get("status") !== "concluded" ||
            course.workflow_state === "completed"),
      );
      return route.fulfill({
        json: {
          ...data,
          courses: filtered,
          total: filtered.length,
          source_total: 2,
        },
      });
    });
    await page.goto("/staff/canvas");
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    const connectionDetails = page.getByRole("button", {
      name: "Connection details",
      exact: true,
    });
    await expect(connectionDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText("Subaccount: 50 · Direct courses only", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Refresh status", exact: true }),
    ).toHaveCount(0);
    await connectionDetails.press("Enter");
    await expect(
      page.getByText("Subaccount: 50 · Direct courses only", { exact: true }),
    ).toBeVisible();
    const hideConnection = page.getByRole("button", {
      name: "Hide connection details",
      exact: true,
    });
    await expect(hideConnection).toHaveAttribute("aria-expanded", "true");
    await scan(page, "Expanded Canvas connection");
    await hideConnection.press("Enter");
    await expect(connectionDetails).toBeFocused();
    await expect(connectionDetails).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("columnheader", { name: "Start date", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "End date", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "10/01/2026", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Not set", exact: true }),
    ).toHaveCount(2);
    const details = page.getByRole("button", {
      name: "Staff details",
      exact: true,
    });
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText("connector@example.test", { exact: true }),
    ).toHaveCount(0);
    await details.press("Enter");
    await expect(
      page.getByText("connector@example.test", { exact: true }),
    ).toBeVisible();
    await scan(page, "Expanded staff session");
    await page
      .getByRole("button", { name: "Hide staff details" })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Course title keywords" })
      .fill("advanced");
    await page
      .getByLabel("Start date from", { exact: true })
      .fill("2026-10-01");
    await page.getByLabel("End date to", { exact: true }).fill("2026-10-31");
    await page.getByRole("button", { name: "Apply filters" }).press("Enter");
    await expect(
      page.getByText("1 matching courses of 2", { exact: true }),
    ).toBeVisible();
    expect(query.get("title")).toBe("advanced");
    expect(query.get("startFrom")).toBe("2026-10-01");
    expect(query.get("endTo")).toBe("2026-10-31");
    expect(query.get("page")).toBe("1");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByText("2 matching courses of 2", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Publish status" })
      .selectOption("concluded");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name: /Data Basics/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Advanced Data Workshop/ }),
    ).toHaveCount(0);
    await scan(page, "Canvas course filters");
    await page
      .getByRole("textbox", { name: "Course title keywords" })
      .fill("no match");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByText(/No courses match these filters/),
    ).toBeVisible();
    await scan(page, "Empty filtered Canvas courses");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(
      page.getByRole("table", { name: "Published Canvas courses" }),
    ).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("main *")]
        .filter(
          (el) => el.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .slice(0, 12)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          width: el.getBoundingClientRect().width,
          text: el.textContent?.slice(0, 60),
        })),
    }));
    expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(
      layout.width,
    );
  });
  test("failed read retains preview and read-only role has no write controls", async ({
    page,
  }) => {
    await staff(page, ["canvas:read"]);
    const data = preview();
    data.courses = [sourceCourse];
    data.total = 1;
    data.last_success_at = "2026-10-14T12:00:00Z";
    data.latest_run = {
      id: "00000000-0000-4000-8000-000000000002",
      status: "failed",
      trigger: "manual",
      course_count: 0,
      error:
        "Canvas could not complete the course read. The previous preview was retained.",
    };
    await page.route("**/api/staff/canvas/courses?*", (route) =>
      route.fulfill({ json: data }),
    );
    await page.goto("/staff/canvas");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "previous preview was retained",
    );
    await expect(
      page.getByRole("link", { name: /Working with Data/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh from Canvas", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Enable using my Canvas account" }),
    ).toHaveCount(0);
    await scan(page, "Canvas course read failure");
  });
});

test.describe("Canvas staff sign-in", () => {
  test("authenticated staff can retry a failed sign-out and return to Canvas login", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/staff-session", async (route) => {
      if (route.request().method() === "DELETE") {
        attempts++;
        return route.fulfill(
          attempts === 1
            ? { status: 503, json: { message: "Unavailable" } }
            : { json: { member: null } },
        );
      }
      return route.fulfill({
        json: {
          member: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "header@cuce.test",
            display_name: "Header test staff",
            roles: ["staff_admin"],
            active: true,
            version: 1,
            scopes: [],
          },
          auth: { mode: "canvas", configured: true },
        },
      });
    });
    await page.goto("/staff");
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    await expect(signOut).toBeVisible();
    const navigationMenu = page.getByRole("button", {
      name: "Open navigation menu",
    });
    if (await navigationMenu.isVisible()) {
      await navigationMenu.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Sign in", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(navigationMenu).toBeFocused();
    }
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await scan(page, "Authenticated staff navigation");
    await signOut.click();
    await expect(
      page
        .getByRole("main")
        .getByRole("alert")
        .filter({ hasText: "Unable to sign out" }),
    ).toBeVisible();
    await expect(signOut).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await signOut.click();
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    if (await navigationMenu.isVisible()) {
      await navigationMenu.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(navigationMenu).toBeFocused();
    } else {
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", {
            name: "Sign in",
            exact: true,
          }),
      ).toBeVisible();
    }
  });
  async function canvasScreen(page: Page, configured: boolean, error = "") {
    await page.route("**/api/staff-session", (route) =>
      route.fulfill({
        json: { member: null, auth: { mode: "canvas", configured } },
      }),
    );
    await page.goto(`/staff${error ? `?authError=${error}` : ""}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Staff sign-in" }),
    ).toBeVisible();
  }
  test("configured: keyboard reaches and activates Canvas login", async ({
    page,
  }) => {
    await canvasScreen(page, true);
    const login = page.getByRole("link", { name: "Sign in with Canvas" });
    await expect(login).toHaveAttribute("href", "/api/auth/canvas/start");
    await expect(page.getByRole("radio")).toHaveCount(0);
    // Start at the skip link and use only Tab to reach the login action.
    await page.keyboard.press("Tab");
    for (
      let count = 0;
      count < 20 &&
      !(await login.evaluate((el) => el === document.activeElement));
      count++
    )
      await page.keyboard.press("Tab");
    await expect(login).toBeFocused();
    expect(
      await login.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.outlineStyle !== "none" || style.boxShadow !== "none";
      }),
    ).toBeTruthy();
    await scan(page, "Canvas staff sign-in");
    await page.route("**/api/auth/canvas/start", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><body>Mock Canvas authorization boundary</body></html>",
      }),
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/api\/auth\/canvas\/start$/);
    await page.goto("/staff?authError=denied");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "cancelled or denied",
    );
    await expect(login).toBeVisible();
  });
  test("missing configuration: accessible notice and no mock fallback", async ({
    page,
  }) => {
    await canvasScreen(page, false);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "not configured yet",
    );
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await scan(page, "Canvas sign-in awaiting configuration");
  });
  test("callback errors are announced and allow another attempt", async ({
    page,
  }) => {
    await canvasScreen(page, true, "unauthorized");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "not been authorized",
    );
    await expect(
      page.getByRole("link", { name: "Sign in with Canvas" }),
    ).toBeVisible();
    await scan(page, "Canvas identity not authorized");
  });
});

test("manual Stripe reconciliation keyboard action and status", async ({
  page,
}) => {
  await page.route("**/api/staff-session", (route) =>
    route.fulfill({
      json: {
        member: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "support@example.test",
          display_name: "Payment test",
          roles: ["support"],
          active: true,
          version: 1,
          scopes: [
            "staff:read",
            "payments:read",
            "payments:reconcile",
            "refunds:request",
          ],
        },
        auth: { mode: "canvas", configured: true },
      },
    }),
  );
  for (const endpoint of ["staff/offerings", "approval-requests", "exceptions"])
    await page.route(`**/api/${endpoint}`, (route) =>
      route.fulfill({ json: [] }),
    );
  await page.route("**/api/reconciliation", (route) =>
    route.fulfill({
      json: {
        audit: [],
        simulated_orders: 0,
        simulated_enrollments: 0,
        pending_operations: 0,
        open_exceptions: 0,
      },
    }),
  );
  await page.route("**/api/prototype/simulation", (route) =>
    route.fulfill({ json: { provisioningOutcome: "normal" } }),
  );
  await page.route("**/api/staff/transactions", (route) =>
    route.fulfill({ json: [] }),
  );
  let checks = 0;
  await page.route("**/api/staff/transactions/reconcile", (route) => {
    checks++;
    if (checks === 1)
      return route.fulfill({
        status: 503,
        json: { message: "Stripe check unavailable. Try again." },
      });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    return route.fulfill({ json: { checked: 2, failed: 1 } });
  });
  await page.goto("/staff/transactions");
  const check = page.getByRole("button", {
    name: "Check Stripe payments",
    exact: true,
  });
  await check.focus();
  await check.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Stripe check unavailable. Try again." }),
  ).toBeVisible();
  await expect(check).toBeFocused();
  await scan(page, "Manual Stripe recovery error");
  await check.press("Enter");
  await expect(
    page.getByRole("status").filter({
      hasText: "2 Checkout sessions reconciled; 1 could not be verified",
    }),
  ).toBeVisible();
  await expect(check).toBeFocused();
  expect(checks).toBe(2);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await scan(page, "Manual Stripe reconciliation");
  await page.screenshot({
    path: `/tmp/ce-request-demo-transactions-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("portal offering image editor keyboard, upload, validation and reset", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000601";
  const mediaId = "00000000-0000-4000-8000-000000000602";
  let offering = {
    id,
    title: "Portal image test",
    category: "Technology",
    summary: "Synthetic course summary for image checks",
    description: "Synthetic description for course image verification.",
    outcomes: [],
    format: "Online",
    course_type: "self_paced",
    start_date: null,
    end_date: null,
    price_cents: 100,
    capacity: 25,
    unlimited_seats: false,
    seats_available: 25,
    published: true,
    version: 1,
    approval_required: false,
    approval_valid_days: 7,
    enrollment_close_days: 7,
    canvas_course_url: "https://canvas.example.test/courses/1",
    imported_from_canvas: true,
    canvas_image_url: null,
    image_override: false,
    image_media_id: null as string | null,
    unpublished_at: null,
    active_registrations: 0,
    seats_in_use: 0,
    sales_page_status: "none",
  };
  await page.route("**/api/staff-session", (route) =>
    route.fulfill({
      json: {
        member: {
          id,
          email: "manager@example.test",
          display_name: "Image test",
          roles: ["catalog_manager"],
          active: true,
          version: 1,
          scopes: ["staff:read", "catalog:write"],
        },
        auth: { mode: "canvas", configured: true },
      },
    }),
  );
  for (const endpoint of ["approval-requests", "exceptions"])
    await page.route(`**/api/${endpoint}`, (route) =>
      route.fulfill({ json: [] }),
    );
  await page.route("**/api/staff/offerings", (route) =>
    route.fulfill({ json: [offering] }),
  );
  await page.route(`**/api/staff/offerings/${id}`, (route) =>
    route.fulfill({ json: { offering, registrations: {}, activity: [] } }),
  );
  await page.route(`**/api/offerings/${id}/prices`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/reconciliation", (route) =>
    route.fulfill({
      json: {
        audit: [],
        simulated_orders: 0,
        simulated_enrollments: 0,
        pending_operations: 0,
        open_exceptions: 0,
      },
    }),
  );
  await page.route("**/api/prototype/simulation", (route) =>
    route.fulfill({ json: { provisioningOutcome: "normal" } }),
  );
  const { readFile } = await import("node:fs/promises");
  const cover = await readFile(
    "src/web/public/course-images/data-analysis.jpg",
  );
  await page.route(`**/media/${mediaId}`, (route) =>
    route.fulfill({ contentType: "image/jpeg", body: cover }),
  );
  const modes: string[] = [];
  await page.route(`**/api/offerings/${id}/image`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body.version).toBe(offering.version);
    expect(body.reason).toBe("Choose a portal course image");
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    modes.push(body.mode);
    if (body.mode === "upload") {
      expect(body.fileName).toBe("portal-cover.jpg");
      expect(body.contentType).toBe("image/jpeg");
      expect(body.data).toBe(cover.toString("base64"));
    }
    offering = {
      ...offering,
      version: offering.version + 1,
      image_override: body.mode !== "source",
      image_media_id: body.mode === "upload" ? mediaId : null,
    };
    await route.fulfill({ json: offering });
  });
  await page.goto(`/staff/offerings/${id}/details`);
  const change = page.getByRole("button", {
    name: "Change image",
    exact: true,
  });
  // Unsaved text changes must not be lost by an independent image save.
  const summary = page.getByRole("textbox", {
    name: "Short summary",
    exact: true,
  });
  await summary.fill("Unsaved portal summary");
  await expect(change).toBeDisabled();
  await summary.fill(offering.summary);
  await expect(change).toBeEnabled();
  for (const mode of ["upload", "fallback", "source"]) {
    await change.focus();
    await change.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Change course image" });
    const choice = dialog.getByRole("radio", {
      name:
        mode === "upload"
          ? "Upload a portal image"
          : mode === "fallback"
            ? "Use CU CE image"
            : "Use Canvas course image",
      exact: true,
    });
    await choice.focus();
    await choice.press("Space");
    if (mode === "upload") {
      await dialog
        .getByLabel("Choose image (PNG, JPEG, WebP or GIF; up to 5 MB)")
        .setInputFiles({
          name: "wrong.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from("<svg/>"),
        });
      await expect(dialog.getByRole("alert")).toContainText("Choose a PNG");
      await expect(dialog.getByRole("alert")).toBeFocused();
      await scan(page, "Course image validation");
      await dialog
        .getByLabel("Choose image (PNG, JPEG, WebP or GIF; up to 5 MB)")
        .setInputFiles({
          name: "portal-cover.jpg",
          mimeType: "image/jpeg",
          buffer: cover,
        });
      await expect(
        dialog.getByAltText("Course display image preview"),
      ).toHaveAttribute("src", /^data:image\/jpeg/);
    }
    await dialog
      .getByRole("textbox", { name: "Reason for image change" })
      .fill("Choose a portal course image");
    await scan(page, `Portal image ${mode} dialog`);
    if (mode === "upload")
      await page.screenshot({
        path: `/tmp/ce-portal-image-dialog-${test.info().project.name}.png`,
      });
    const save = dialog.getByRole("button", {
      name: "Save image",
      exact: true,
    });
    await save.focus();
    await save.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(change).toBeFocused();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Course image saved in the portal" }),
    ).toBeVisible();
  }
  expect(modes).toEqual(["upload", "fallback", "source"]);
  await change.press("Enter");
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(change).toBeFocused();
  await scan(page, "Portal course image saved");
  await page.screenshot({
    path: `/tmp/ce-portal-image-editor-${test.info().project.name}.png`,
    fullPage: true,
  });
});

for (const layout of ["list", "grid"] as const)
  test(`Canvas course card images and CU CE fallback in ${layout} layout`, async ({
    page,
  }) => {
    const rows = [
      {
        id: "00000000-0000-4000-8000-000000000501",
        title: "Imported course with Canvas image",
        canvas_image_url: "https://images.example.test/course-cover.jpg",
      },
      {
        id: "00000000-0000-4000-8000-000000000502",
        title: "Imported course without image",
        canvas_image_url: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000503",
        title: "Imported course with unavailable image",
        canvas_image_url: "https://images.example.test/unavailable.jpg",
      },
      {
        id: "00000000-0000-4000-8000-000000000504",
        title: "Imported course with portal image",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: "00000000-0000-4000-8000-000000000506",
      },
      {
        id: "00000000-0000-4000-8000-000000000505",
        title: "Imported course with explicit CU CE choice",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000507",
        title: "Imported course with unavailable portal image",
        canvas_image_url: "https://images.example.test/should-not-load.jpg",
        image_override: true,
        image_media_id: "00000000-0000-4000-8000-000000000508",
      },
    ].map((row) => ({
      ...row,
      imported_from_canvas: true,
      category: "Technology",
      summary: "Synthetic image verification course",
      format: "Online",
      course_type: "self_paced",
      start_date: null,
      end_date: null,
      price_cents: 100,
      published: true,
      approval_required: false,
      enrollment_open: true,
    }));
    const { readFile } = await import("node:fs/promises");
    const cover = await readFile(
      "src/web/public/course-images/data-analysis.jpg",
    );
    await page.route("**/media/00000000-0000-4000-8000-000000000506", (route) =>
      route.fulfill({ contentType: "image/jpeg", body: cover }),
    );
    await page.route("**/media/00000000-0000-4000-8000-000000000508", (route) =>
      route.fulfill({ status: 404, body: "Missing portal image" }),
    );
    let imageRequests = 0;
    await page.route("https://images.example.test/*", (route) => {
      expect(route.request().headers()["authorization"]).toBeUndefined();
      expect(route.request().url()).not.toContain("should-not-load");
      imageRequests++;
      return route.request().url().includes("unavailable")
        ? route.fulfill({ status: 404, body: "Image not found" })
        : route.fulfill({ contentType: "image/jpeg", body: cover });
    });
    await page.route("**/api/offerings", (route) =>
      route.fulfill({ json: rows }),
    );
    await page.route("**/api/explore", (route) =>
      route.fulfill({ json: { courses: rows, collections: [], pathways: [] } }),
    );
    await page.goto("/?tab=courses");
    const toggle = page.getByRole("button", {
      name: `${layout === "grid" ? "Grid" : "List"} layout`,
      exact: true,
    });
    await toggle.focus();
    await toggle.press("Enter");
    for (const [index, row] of rows.entries()) {
      const card = page.locator(".MuiPaper-root").filter({
        has: page.getByRole("heading", { name: row.title, exact: true }),
      });
      await card.scrollIntoViewIfNeeded();
      const image = card.locator("img");
      await expect(image).toHaveAttribute("alt", "");
      await expect(image).toHaveAttribute(
        "src",
        row.image_override && row.image_media_id && index !== 5
          ? new RegExp(`/media/${row.image_media_id}$`)
          : index === 0
            ? row.canvas_image_url!
            : /cedarville-continuing-education-white/,
      );
      await expect(image).toHaveJSProperty("complete", true);
      expect(
        await image.evaluate(
          (element: HTMLImageElement) => element.naturalWidth,
        ),
      ).toBeGreaterThan(0);
      await expect(
        card.getByRole("link", { name: `View course: ${row.title}` }),
      ).toBeVisible();
    }
    expect(imageRequests).toBeGreaterThanOrEqual(2);
    await scan(page, `Canvas images and CU CE fallback (${layout})`);
    await page.screenshot({
      path: `/tmp/ce-course-images-${layout}-${test.info().project.name}.png`,
      fullPage: true,
    });
  });
// Credential documents keep the pilot editor behavior and participate in the
// existing portal theme, session, keyboard and accessibility checks.
test.describe("credential integration", () => {
  for (const [slug, title] of [
    ["badges", "Badge designer"],
    ["badge-publishing", "Publish and map badges"],
    ["badge-awards", "Award badges"],
    ["certificates", "Certificates"],
    ["badge-issuances", "Issuance register"],
  ]) {
    test(`${title} workspace`, async ({ page }) => {
      const signIn = await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      expect(signIn.ok()).toBeTruthy();
      await page.goto(`/staff/${slug}`);
      await expect(
        page
          .locator("main > div")
          .getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const frame = page.frameLocator("iframe");
      await expect(frame.locator("main")).toBeVisible();
      if (slug === "certificates")
        await expect(frame.locator("#cc-tools")).toBeVisible();
      if (slug === "badge-awards")
        await expect(frame.locator("#ca-tools")).toBeVisible();
      if (slug === "badge-issuances")
        await expect(frame.locator("#register-content")).toBeVisible();
      if (slug === "badge-publishing")
        await expect(frame.locator("#workspace")).toBeVisible();
      await scan(page, `${title} integrated document`);
    });
  }
  test("signed-out learner badges", async ({ page }) => {
    await page.goto("/badges");
    await expect(
      page.getByRole("heading", { name: "My badges and certificates" }),
    ).toBeVisible();
    await scan(page, "Signed-out learner badges");
  });
  test("Canvas learner without email can open earned credentials", async ({
    page,
  }) => {
    await page.route("**/api/demo-session", (route) =>
      route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000099",
          email: null,
          display_name: "CU Test Learner",
          auth: { mode: "canvas", configured: true },
        },
      }),
    );
    await page.route("**/api/badges/me/badges", (route) =>
      route.fulfill({ json: { badges: [] } }),
    );
    await page.goto("/badges");
    await expect(page.locator("iframe")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .frameLocator("iframe")
        .getByText("Your achievements will appear here.", { exact: true }),
    ).toBeVisible();
    await scan(page, "Canvas learner credentials without email");
  });
  test("unlinked learner account fails closed", async ({ page }) => {
    await page.request.post("/api/demo-session", {
      data: { email: "a11y-scan@example.test" },
    });
    await page.goto("/badges");
    await expect(
      page
        .frameLocator("iframe")
        .getByText(
          "Your badge account has not been linked. Contact portal support.",
          { exact: true },
        ),
    ).toBeVisible();
    await scan(page, "Unlinked learner badges");
  });
});

test("credential integration: keyboard, unsaved design and 320px reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.request.post("/api/staff-session", {
    data: { email: "admin@cuce.test" },
  });
  await page.goto("/staff/certificates");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#cc-tools")).toBeVisible();
  await frame.locator("#cc-header").focus();
  await page.keyboard.press("Tab");
  await expect(frame.locator("#cc-logo")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(frame.locator("#cc-header")).toBeFocused();
  await frame.locator("#cc-header").fill("Unsaved accessibility exercise");
  await page
    .getByRole("link", { name: "Issuance register", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(frame.locator("#cc-header")).toHaveValue(
    "Unsaved accessibility exercise",
  );
  await page
    .getByRole("link", { name: "Issuance register", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/staff\/badge-issuances$/);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const slug of [
    "badges",
    "badge-publishing",
    "badge-awards",
    "certificates",
    "badge-issuances",
  ]) {
    await page.goto(`/staff/${slug}`);
    await expect(page.locator("iframe")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
      `${slug} portal reflow`,
    ).toBe(true);
    if (slug === "badge-issuances") {
      const region = page
        .frameLocator("iframe")
        .getByRole("region", { name: "Issuance register table", exact: true });
      await region.focus();
      await expect(region).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => region.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    const overflow = await page
      .frameLocator("iframe")
      .locator("html")
      .evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        regions: [
          ...el.querySelectorAll("main,.records,.table-wrap,.table-footer"),
        ].map((n) => ({
          cls: String(n.className),
          width: n.getBoundingClientRect().width,
          overflow: getComputedStyle(n).overflow,
          display: getComputedStyle(n).display,
        })),
        widest: [...el.querySelectorAll("body *")]
          .filter(
            (n) =>
              !n.closest(".table-wrap") &&
              n.getBoundingClientRect().right > el.clientWidth + 1,
          )
          .slice(0, 8)
          .map((n) => ({
            tag: n.tagName,
            id: n.id,
            cls: String(n.className),
            right: n.getBoundingClientRect().right,
            width: n.getBoundingClientRect().width,
          })),
      }));
    expect(
      overflow.scroll <= overflow.width + 1,
      `${slug} editor reflow: ${JSON.stringify(overflow)}`,
    ).toBe(true);
  }
});
