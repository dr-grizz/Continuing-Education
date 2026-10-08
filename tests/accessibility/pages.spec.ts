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
// Opens the sales page editor for a sample course and adds one block of each
// type, without saving, so the scans cover every block's fields.
const blockTypes = [
  "Hero image",
  "Text",
  "Learning outcomes",
  "Instructor",
  "Testimonial",
  "Questions and answers",
];
async function openEditorWithEveryBlock(page: Page) {
  await page.request.post("/api/staff-session", {
    data: { email: "content@cuce.test" },
  });
  await page.goto(
    "/staff/offerings/10000000-0000-4000-8000-000000000001/sales-page",
  );
  await expect(
    page.getByRole("heading", { level: 3, name: "Sales page" }),
  ).toBeVisible();
  for (const type of blockTypes) {
    await page.getByRole("combobox", { name: "Block type" }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
    await page.getByRole("button", { name: "Add block" }).click();
  }
  await expect(
    page.getByRole("group", { name: /^Block 6 of 6/ }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Test cards" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Stripe sandbox test cards",
  });
  await expect(dialog).toBeVisible();
  await scan(page, "Stripe test cards dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Test cards" })).toBeFocused();
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
test("sales page editor and preview", async ({ page }) => {
  await openEditorWithEveryBlock(page);
  await scan(page, "Sales page editor");
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
      await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      await page.goto(`/staff/${staffSlugs[tab]}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
      await page.getByRole("button", { name: button }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `${name} dialog`);
    });
});
