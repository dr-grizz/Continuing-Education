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
      await page.goto("/staff");
      await page.getByRole("tab", { name: new RegExp(`^${tab}\\b`) }).click();
      await scan(page, `Staff ${tab} tab`);
    });
});
test.describe("staff dialogs", () => {
  // Opens each dialog and scans it; nothing is submitted.
  const dialogs: [string, string, RegExp][] = [
    ["New offering", "Offerings", /^New offering$/],
    ["Edit offering", "Offerings", /^Edit /],
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
      await page.goto("/staff");
      await page.getByRole("tab", { name: new RegExp(`^${tab}\\b`) }).click();
      await page.getByRole("button", { name: button }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await scan(page, `${name} dialog`);
    });
});
