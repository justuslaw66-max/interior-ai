// DIAGNOSTIC ONLY (branch diagnostic/cabinet-preview-webkit-blank, never merged).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/cabinet-preview-diagnostic",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 10 * 60_000,
  reporter: [["list"]],
  outputDir: "test-results/cabinet-preview-minimal/output",
  use: { trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
});
