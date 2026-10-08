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
  "/settings",
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
        await page.goto(`/staff/${staffSlugs[tab]}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(tab);
        await apply(page);
        await settle(page);
        const found = await overflow(page);
        if (found) problems.push(`${tab}: ${found}`);
      }
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
    test("offering page tabs", async ({ page }) => {
      await page.request.post("/api/staff-session", {
        data: { email: "catalog@cuce.test" },
      });
      const problems: string[] = [];
      for (const tab of ["", "details", "settings", "activity"]) {
        await page.goto(
          `/staff/offerings/10000000-0000-4000-8000-000000000001${tab ? `/${tab}` : ""}`,
        );
        await expect(page.locator("#offering-panel-heading")).toBeVisible();
        await settle(page);
        await apply(page);
        const found = await overflow(page);
        if (found) problems.push(`${tab || "overview"}: ${found}`);
      }
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
    test("collection page tabs", async ({ page }) => {
      await page.request.post("/api/staff-session", {
        data: { email: "catalog@cuce.test" },
      });
      const problems: string[] = [];
      for (const tab of ["", "details", "activity"]) {
        await page.goto(
          `/staff/collections/20000000-0000-4000-8000-000000000003${tab ? `/${tab}` : ""}`,
        );
        await expect(page.locator("#collection-panel-heading")).toBeVisible();
        await settle(page);
        await apply(page);
        const found = await overflow(page);
        if (found) problems.push(`${tab || "overview"}: ${found}`);
      }
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
    test("sales page editor and preview", async ({ page }) => {
      await openEditorWithRichContent(page);
      await apply(page);
      const problems: string[] = [];
      const editor = await overflow(page);
      if (editor) problems.push(`editor: ${editor}`);
      await page.getByRole("tab", { name: "Preview" }).click();
      await settle(page);
      const preview = await overflow(page);
      if (preview) problems.push(`preview: ${preview}`);
      expect(problems, `${name}: horizontal scrolling`).toEqual([]);
    });
  });
