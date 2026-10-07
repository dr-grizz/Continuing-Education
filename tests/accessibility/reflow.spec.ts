import { expect, Page, test } from "@playwright/test";
// Reflow and text resizing (WCAG 1.4.4, 1.4.10, 1.4.12): no page may need
// horizontal scrolling at 320 CSS px (400% zoom of 1280 px), with text at 200%,
// or with increased text spacing.
const learnerPages = [
  "/",
  "/?tab=courses",
  "/?tab=collections",
  "/?tab=pathways",
  "/courses/10000000-0000-4000-8000-000000000001",
  "/collections/data-informed-leader",
  "/sign-in",
];
const staffTabs = [
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
const overflow = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    // Name the widest element so a failure says what to fix.
    let widest = "";
    if (scroll > width + 1)
      for (const element of document.querySelectorAll("body *")) {
        const box = element.getBoundingClientRect();
        if (box.right > width + 1 && box.width > 0) {
          widest = `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
          break;
        }
      }
    return scroll > width + 1 ? `${scroll}px > ${width}px (${widest})` : "";
  });
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".MuiSkeleton-root")).toHaveCount(0, {
    timeout: 15_000,
  });
}
const conditions: [string, (page: Page) => Promise<void>][] = [
  ["320px wide", (page) => page.setViewportSize({ width: 320, height: 640 })],
  [
    "200% text",
    async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
    },
  ],
  [
    "increased text spacing",
    async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addStyleTag({
        content:
          "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
      });
    },
  ],
];
for (const [name, apply] of conditions)
  test.describe(name, () => {
    test("learner pages", async ({ page }) => {
      await page.request.post("/api/demo-session", {
        data: { email: "a11y-scan@example.test" },
      });
      const problems: string[] = [];
      for (const path of [...learnerPages, "/learning"]) {
        await page.goto(
          path.includes("?") || path !== "/" ? path : "/?tab=explore",
        );
        await settle(page);
        await apply(page);
        const found = await overflow(page);
        if (found) problems.push(`${path}: ${found}`);
      }
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
    test("staff workspace", async ({ page }) => {
      await page.request.post("/api/staff-session", {
        data: { email: "admin@cuce.test" },
      });
      await page.goto("/staff");
      await settle(page);
      await apply(page);
      const problems: string[] = [];
      for (const tab of staffTabs) {
        await page.getByRole("tab", { name: new RegExp(`^${tab}\\b`) }).click();
        await settle(page);
        const found = await overflow(page);
        if (found) problems.push(`${tab}: ${found}`);
      }
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
  });
