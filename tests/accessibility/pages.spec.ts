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
    await page
      .getByRole("button", { name: "Enable using my Canvas account" })
      .press("Enter");
    const pause = page.getByRole("button", { name: "Pause schedule" });
    await expect(pause).toBeVisible();
    await scan(page, "Canvas course preview and schedule");
    await page.screenshot({
      path: `/tmp/ce-canvas-courses-${test.info().project.name}.png`,
      fullPage: true,
    });
    await pause.press("Enter");
    await expect(pause).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Enable using my Canvas account" }),
    ).toBeFocused();
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
