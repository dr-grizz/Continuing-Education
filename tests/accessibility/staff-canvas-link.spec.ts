import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Staff Canvas identity linking", () => {
  async function setup(
    page: import("@playwright/test").Page,
    conflict = false,
    manage = true,
  ) {
    const admin = {
      id: "00000000-0000-4000-8000-000000000701",
      email: "admin@example.test",
      display_name: "Test administrator",
      roles: ["staff_admin"],
      scopes: ["staff:read", ...(manage ? ["staff:manage"] : [])],
      active: true,
      version: 1,
      auth_provider: "canvas:https://canvas.example.test",
      external_subject: "42",
      canvas_origin: "https://canvas.example.test",
    };
    let target = {
      ...admin,
      id: "00000000-0000-4000-8000-000000000702",
      email: "staff@example.test",
      display_name: "Test staff",
      roles: ["approver"],
      scopes: ["staff:read"],
      auth_provider: "mock",
      external_subject: null as string | null,
    };
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/staff-session")
        return route.fulfill({
          json: { member: admin, auth: { mode: "canvas", configured: true } },
        });
      if (path === "/api/demo-session")
        return route.fulfill({
          json: {
            id: null,
            email: null,
            auth: { mode: "canvas", configured: true },
          },
        });
      if (path === "/api/staff/dashboard")
        return route.fulfill({
          json: {
            range: {
              days: 30,
              from: "2026-09-27",
              to: "2026-10-27",
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
              limited_seats_in_use: 0,
              unlimited_offerings: 0,
              unlimited_seats_in_use: 0,
              trend: [],
              by_offering: [],
            },
            sales: null,
            completion: {
              available: false,
              reason: "Canvas completion is not connected.",
            },
          },
        });
      if (path === "/api/staff/members")
        return route.fulfill({ json: [admin, target] });
      if (path === `/api/staff/members/${target.id}/canvas-link`) {
        writes++;
        expect(route.request().headers()["x-prototype-role"]).toBe("staff");
        expect(route.request().headers()["idempotency-key"]).toBeTruthy();
        expect(route.request().postDataJSON()).toEqual({
          version: 1,
          canvasUserId: "12345",
          identityVerified: true,
        });
        if (conflict)
          return route.fulfill({
            status: 409,
            json: {
              message:
                "This Canvas identity is already linked to another staff member.",
            },
          });
        target = {
          ...target,
          auth_provider: "canvas:https://canvas.example.test",
          external_subject: "12345",
          version: 2,
        };
        return route.fulfill({ json: target });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/staff/staff");
    await expect(
      page.getByRole("heading", {
        name: manage ? "Staff" : "Dashboard",
        exact: true,
      }),
    ).toBeVisible();
    return () => writes;
  }
  async function scan(page: import("@playwright/test").Page) {
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== "running" ||
            a.effect?.getComputedTiming().iterations === Infinity,
        ),
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`,
      ),
    ).toEqual([]);
  }
  test("administrator verifies ownership, links and sees persisted status", async ({
    page,
    browserName,
  }, testInfo) => {
    const writes = await setup(page);
    const open = page.getByRole("button", {
      name: "Link Canvas for Test staff",
      exact: true,
    });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Link Canvas sign-in" });
    const input = dialog.getByRole("textbox", { name: "Canvas user ID" });
    await expect(input).toBeFocused();
    await scan(page);
    if (testInfo.project.name === "light")
      await dialog.screenshot({
        path: "artifacts/staff-canvas-link-dialog.png",
      });
    await dialog.getByRole("button", { name: "Link Canvas account" }).click();
    await expect(dialog.getByRole("alert")).toBeFocused();
    expect(writes()).toBe(0);
    await input.fill("12345");
    await input.press(
      browserName === "webkit" && process.platform === "darwin"
        ? "Alt+Tab"
        : "Tab",
    );
    const confirm = dialog.getByRole("checkbox", {
      name: /I verified this Canvas user ID/,
    });
    await expect(confirm).toBeFocused();
    await confirm.press("Space");
    await dialog.getByRole("button", { name: "Link Canvas account" }).click();
    await expect(dialog).toBeHidden();
    expect(writes()).toBe(1);
    await page
      .getByRole("button", {
        name: "View Canvas link for Test staff",
        exact: true,
      })
      .click();
    const linked = page.getByRole("dialog", { name: "Canvas identity link" });
    await expect(
      linked.getByRole("textbox", { name: "Canvas user ID" }),
    ).toHaveValue("12345");
    await expect(
      linked.getByRole("textbox", { name: "Canvas user ID" }),
    ).toHaveAttribute("readonly", "");
    await expect(
      linked.getByRole("button", { name: "Link Canvas account" }),
    ).toHaveCount(0);
    await scan(page);
    await linked.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("button", {
        name: "View Canvas link for Test staff",
        exact: true,
      }),
    ).toBeFocused();
  });
  test("conflicts remain visible and cancel restores keyboard focus", async ({
    page,
  }) => {
    const writes = await setup(page, true);
    const open = page.getByRole("button", {
      name: "Link Canvas for Test staff",
      exact: true,
    });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Link Canvas sign-in" });
    await dialog.getByRole("textbox", { name: "Canvas user ID" }).fill("12345");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Link Canvas account" }).click();
    await expect(dialog.getByRole("alert")).toContainText("already linked");
    await expect(dialog.getByRole("alert")).toBeFocused();
    expect(writes()).toBe(1);
    await scan(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(open).toBeFocused();
  });
  test("staff without management scope have no linking controls", async ({
    page,
  }) => {
    const writes = await setup(page, false, false);
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Link Canvas/ })).toHaveCount(
      0,
    );
    expect(writes()).toBe(0);
    await scan(page);
  });
});
