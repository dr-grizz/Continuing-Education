import { defineConfig, devices } from "@playwright/test";
// Automated accessibility scans (axe) against a running local stack:
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
  projects: [
    {
      name: "light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "dark",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    { name: "phone", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  ],
});
