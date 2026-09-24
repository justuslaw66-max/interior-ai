import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/scan-to-editable-plan", fullyParallel: false, workers: 1, retries: 0,
  timeout: 120_000, expect: { timeout: 30_000 }, forbidOnly: true,
  outputDir: process.env.SCAN_PLAN_BROWSER_ARTIFACT_DIR ?? "test-results/scan-plan",
  use: { baseURL: process.env.SCAN_PLAN_BASE_URL ?? "http://127.0.0.1:3018", actionTimeout: 30_000,
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
