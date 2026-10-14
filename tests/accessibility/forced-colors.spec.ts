import { expect, Page, test } from "@playwright/test";
// Windows High Contrast and other forced-color modes drop backgrounds. These
// checks keep states that were shown only by a fill visible (WCAG 1.4.11 and
// 2.4.7): the brand header, the selected tab, the selected layout, filled
// buttons and the focus ring.
const style = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        adjust: css.forcedColorAdjust,
        background: css.backgroundColor,
        borderWidth: css.borderTopWidth,
        outline: `${css.outlineStyle} ${css.outlineWidth}`,
      };
    });
test("forced colors are active", async ({ page }) => {
  await page.goto("/");
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
  ).toBe(true);
});
test("catalog keeps the header, selected tab and selected layout", async ({
  page,
}) => {
  await page.goto("/?tab=courses");
  await expect(page.getByRole("tab", { selected: true })).toBeVisible();
  // The brand bar keeps its navy background so the white logo stays visible.
  expect((await style(page, "header")).adjust).toBe("none");
  const indicator = await style(page, ".MuiTabs-indicator");
  expect(indicator.adjust).toBe("none");
  expect(indicator.background).not.toBe("rgba(0, 0, 0, 0)");
  const selected = await style(page, ".MuiToggleButton-root.Mui-selected");
  expect(selected.adjust).toBe("none");
  expect(selected.background).not.toBe("rgba(0, 0, 0, 0)");
});
test("filled buttons keep a border", async ({ page }) => {
  await page.goto("/courses/10000000-0000-4000-8000-000000000001");
  await expect(page.locator(".MuiButton-contained").first()).toBeVisible();
  expect(
    parseFloat((await style(page, ".MuiButton-contained")).borderWidth),
  ).toBeGreaterThanOrEqual(1);
});
test("keyboard focus stays visible on tabs", async ({ page }) => {
  await page.goto("/?tab=courses");
  await page.getByRole("tab", { selected: true }).focus();
  await page.keyboard.press("ArrowRight");
  const focused = await page.evaluate(() => {
    const css = getComputedStyle(document.activeElement as Element);
    return {
      role: document.activeElement?.getAttribute("role"),
      outline: `${css.outlineStyle} ${css.outlineWidth}`,
      offset: css.outlineOffset,
    };
  });
  expect(focused.role).toBe("tab");
  expect(focused.outline).toBe("solid 3px");
  // Drawn inside the tab, because the tab row clips overflow.
  expect(parseFloat(focused.offset)).toBeLessThan(0);
});
test("the current staff section stays marked", async ({ page }) => {
  await page.request.post("/api/staff-session", {
    data: { email: "admin@cuce.test" },
  });
  await page.goto("/staff/offerings");
  const current = page
    .getByRole("navigation", { name: "Staff sections" })
    .locator('[aria-current="page"]');
  await expect(current).toHaveText("Offerings");
  const css = await current.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      adjust: style.forcedColorAdjust,
      background: style.backgroundColor,
    };
  });
  expect(css.adjust).toBe("none");
  expect(css.background).not.toBe("rgba(0, 0, 0, 0)");
});
