import { defineConfig, devices } from "@playwright/test";
// Automated accessibility checks against a running local stack:
// `npm run dev` locally, or the built site in CI. Scans do not replace
// keyboard and screen-reader review (see the README checklist).
export default defineConfig({
  testDir: "tests/accessibility",
  globalTeardown: "./tests/accessibility/teardown.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.WEB_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  // axe scans run in three Chrome layouts and in Firefox and WebKit; the
  // forced-colors and reflow/zoom checks run once, in Chrome.
  projects: [
    {
      name: "light",
      testMatch: "pages.spec.ts",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "dark",
      testMatch: "pages.spec.ts",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      name: "phone",
      testMatch: "pages.spec.ts",
      use: { ...devices["Pixel 7"], colorScheme: "light" },
    },
    {
      name: "firefox",
      testMatch: "pages.spec.ts",
      use: { ...devices["Desktop Firefox"], colorScheme: "light" },
    },
    {
      name: "webkit",
      testMatch: "pages.spec.ts",
      use: { ...devices["Desktop Safari"], colorScheme: "light" },
    },
    {
      name: "forced-colors",
      testMatch: "forced-colors.spec.ts",
      use: { ...devices["Desktop Chrome"], forcedColors: "active" },
    },
    {
      name: "reflow",
      testMatch: "reflow.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
