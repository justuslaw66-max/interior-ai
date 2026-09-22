// DIAGNOSTIC ONLY (branch diagnostic/cabinet-preview-webkit-blank, never merged).
// Runs the real required spec on WebKit with the same browser settings as
// playwright.pro-visual.config.ts, without the required-evidence reporter.
import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "pro-visual-policy.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 300_000,
  reporter: [["list"], ["json", { outputFile: "test-results/cabinet-preview-repro/report.json" }]],
  outputDir: "test-results/cabinet-preview-repro/output",
  preserveOutput: "failures-only",
  use: {
    baseURL: localBaseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  expect: { timeout: 30_000 },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: "npm run start",
    url: localBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
