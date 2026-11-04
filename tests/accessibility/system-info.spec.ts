import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/demo-session", (route) =>
    route.fulfill({
      json: {
        id: null,
        email: null,
        auth: { mode: "canvas", configured: true },
      },
    }),
  );
  await page.route("**/api/staff-session", (route) =>
    route.fulfill({
      json: { member: null, auth: { mode: "canvas", configured: true } },
    }),
  );
});
test("System Info handles empty server responses and access errors without a reload loop", async ({
  page,
}) => {
  let empty = true,
    requests = 0;
  await page.route("**/api/system-info", (route) => {
    requests++;
    return route.fulfill(
      empty
        ? { status: 500, body: "" }
        : {
            status: 401,
            json: {
              message:
                "Sign in as a staff administrator or unlock initial setup, then refresh this page.",
            },
          },
    );
  });
  await page.goto("/system-info");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "empty or invalid response (HTTP 500)" }),
  ).toBeVisible();
  const before = requests;
  await page.waitForTimeout(200);
  expect(requests).toBe(before);
  empty = false;
  await page
    .getByRole("button", { name: "Refresh system information" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "unlock initial setup" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Database migrations", exact: true }),
  ).toHaveCount(0);
});
test("System Info migration warnings and tables are accessible in narrow and forced-color layouts", async ({
  page,
}) => {
  const report = {
    checkedAt: "2026-10-29T14:00:00Z",
    application: {
      version: "0.1.0",
      revision: "a".repeat(40),
      localChanges: false,
      buildTime: "2026-10-29T13:00:00Z",
      nodeVersion: "v24.22.1",
      profile: "beta",
      startupMigrationsEnabled: true,
    },
    database: {
      connected: true,
      error: null as null | { code: string; message: string },
      historyPresent: true,
      state: "attention required",
      unknownMigrations: 0,
      criticalTables: [
        { name: "bootstrap_control", present: true },
        { name: "bootstrap_key_limits", present: false },
      ],
      migrations: [
        {
          name: "000_baseline",
          state: "applied",
          appliedAt: "2026-10-29T13:00:00Z",
        },
        { name: "025_bootstrap_setup", state: "failed", appliedAt: null },
        { name: "026_bootstrap_key", state: "pending", appliedAt: null },
      ],
    },
  };
  await page.route("**/api/system-info", (route) =>
    route.fulfill({ json: report }),
  );
  await page.goto("/system-info");
  await expect(
    page.locator('a[href="/system-info"],a[href="/setup"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Database migrations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "need attention" }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "026_bootstrap_key" }),
  ).toBeVisible();
  await expect(
    page.getByText("bootstrap_key_limits: missing", { exact: true }),
  ).toBeVisible();
  report.database.state = "unavailable";
  report.database.error = {
    code: "DB_PERMISSION_DENIED",
    message: "The database account lacks required permissions.",
  };
  await page
    .getByRole("button", { name: "Refresh system information" })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "database account lacks required permissions" }),
  ).toBeVisible();
  const refresh = page.getByRole("button", {
    name: "Refresh system information",
  });
  await refresh.focus();
  await expect(refresh).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  if (test.info().project.name === "light")
    await page.screenshot({
      path: "artifacts/system-info-desktop.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (test.info().project.name === "light")
    await page.screenshot({
      path: "artifacts/system-info-mobile.png",
      fullPage: true,
    });
  await page.emulateMedia({ forcedColors: "active" });
  await expect(refresh).toBeVisible();
});
