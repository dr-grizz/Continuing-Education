import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function mockShell(page: Page) {
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
}
test("setup sign-in and disabled states have labelled keyboard access", async ({
  page,
}) => {
  await mockShell(page);
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Initial setup", exact: true }),
  ).toBeVisible();
  const signIn = page.getByRole("button", {
    name: "Unlock setup",
  });
  await expect(signIn).toBeVisible();
  const key = page.getByLabel(/^Setup key/);
  await expect(key).toHaveAttribute("type", "password");
  await key.fill("a".repeat(64));
  await signIn.focus();
  await expect(signIn).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.unroute("**/api/bootstrap");
  await page.route("**/api/bootstrap", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      action: "start",
      key: "a".repeat(64),
    });
    return route.fulfill({
      status: 403,
      json: { message: "The setup key could not be verified." },
    });
  });
  await signIn.click();
  await expect(key).toHaveValue("");
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be verified" }),
  ).toBeVisible();
  await page.unroute("**/api/bootstrap");
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      status: 403,
      json: { message: "Initial setup is closed or unavailable." },
    }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlock setup" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "closed or unavailable" }),
  ).toBeVisible();
});
test("setup settings, verified handoff and completion are accessible and do not echo secrets", async ({
  page,
}) => {
  await mockShell(page);
  let verified = false,
    closed = false;
  let owner = "Setup owner <img src=x onerror=alert(1)>";
  const status = () => ({
    authenticated: true,
    origin: "https://setup.example.test",
    owner,
    email: "owner@example.test",
    expiresAt: "2099-01-01T00:00:00Z",
    settings: {
      CANVAS_STAFF_CLIENT_ID: { value: "123456" },
      CANVAS_STAFF_CLIENT_SECRET: { configured: true },
      STAFF_SESSION_HOURS: { value: "8" },
      LEARNER_SESSION_HOURS: { value: "8" },
      CANVAS_STAFF_FORCE_LOGIN: { value: "false" },
    },
    canvasBaseUrl: "https://cedarville.instructure.com",
    canvasRedirectUri: "https://setup.example.test/api/auth/canvas/callback",
    handoff: {
      linked: true,
      verified,
      email: "owner@example.test",
      canvasUserId: "12345",
    },
    database: { connected: true, appliedMigrations: 27, failedMigrations: 0 },
  });
  await page.route("**/api/bootstrap", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: status() });
    const body = route.request().postDataJSON();
    if (body.action === "save")
      expect(body.settings.CANVAS_STAFF_CLIENT_SECRET).toBe(
        "synthetic-ui-secret",
      );
    if (body.action === "add-admin") {
      expect(body.administrator).toEqual({
        name: "Prepared administrator",
        email: "prepared@example.test",
        canvasUserId: "98765",
      });
    }
    if (body.action === "complete") {
      expect(verified).toBe(true);
      closed = true;
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/setup");
  await expect(
    page.getByRole("textbox", { name: "Canvas client ID", exact: true }),
  ).toHaveValue("123456");
  const secret = page.getByLabel("Canvas client secret");
  await expect(secret).toHaveValue("");
  await expect(page.locator('a[href="/system-info"]')).toHaveCount(0);
  await expect(secret).toHaveAttribute("type", "password");
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  owner = "Setup administrator";
  const finish = page.getByRole("button", {
    name: "Finish setup and remove temporary access",
  });
  await expect(finish).toBeDisabled();
  await secret.fill("synthetic-ui-secret");
  await page.getByRole("button", { name: "Save application settings" }).click();
  await expect(secret).toHaveValue("");
  await expect(
    page.getByText("Application settings saved privately.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel(/^Administrator name/).fill("Prepared administrator");
  await page
    .getByLabel(/^New administrator email/)
    .fill("prepared@example.test");
  await page.getByLabel(/^Canvas user ID/).fill("98765");
  await page
    .getByRole("button", { name: "Add administrator", exact: true })
    .click();
  await expect(
    page.getByText(
      "Administrator added. They must sign in through Canvas before you can finish setup.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(finish).toBeDisabled();
  verified = true;
  await page.getByRole("button", { name: "Refresh setup checks" }).click();
  await expect(
    page.getByText("Normal administrator sign-in has been verified.", {
      exact: false,
    }),
  ).toBeVisible();
  const confirmation = page.getByRole("checkbox", {
    name: "I verified normal administrator access",
    exact: false,
  });
  await confirmation.focus();
  await page.keyboard.press("Space");
  await expect(finish).toBeEnabled();
  // Wait for the disabled-to-enabled CSS transition before measuring contrast.
  await finish.evaluate(async (button) => {
    await Promise.all(
      button
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  if (test.info().project.name === "light")
    await page.screenshot({
      path: "artifacts/bootstrap-setup-desktop.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(finish).toBeVisible();
  await finish.click();
  await expect.poll(() => closed).toBe(true);
  await expect(
    page.getByText(
      "Setup is closed. Temporary sessions and privileges have been removed.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Canvas client ID", exact: true }),
  ).toHaveCount(0);
});

test("setup displays a clear empty-response error without repeating requests", async ({
  page,
}) => {
  await mockShell(page);
  let requests = 0;
  await page.route("**/api/bootstrap", (route) => {
    requests++;
    return route.fulfill({ status: 500, body: "" });
  });
  await page.goto("/setup");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "empty or invalid response (HTTP 500)" }),
  ).toBeVisible();
  const before = requests;
  await page.waitForTimeout(200);
  expect(requests).toBe(before);
});

test("setup shows a database error after key verification and clears the entered key", async ({
  page,
}) => {
  await mockShell(page);
  await page.route("**/api/bootstrap", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { authenticated: false } })
      : route.fulfill({
          status: 503,
          json: {
            code: "DB_TABLE_MISSING",
            diagnosticsAuthorized: true,
            message:
              "A required database table is missing. Check database migrations and confirm the app uses the intended database.",
          },
        }),
  );
  await page.goto("/setup");
  const key = page.getByLabel(/^Setup key/);
  await key.fill("a".repeat(64));
  await page.getByRole("button", { name: "Unlock setup", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "required database table is missing" }),
  ).toBeVisible();
  await expect(key).toHaveValue("");
  await expect(
    page.getByText("Your setup key is verified.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator('a[href="/system-info"]')).toHaveCount(0);
});
