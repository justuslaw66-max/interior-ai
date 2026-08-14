import { defineConfig, devices } from "@playwright/test";
import { requiredTestPlaywrightEvidence } from "./scripts/required-test-playwright.mjs";

const localBaseURL = "http://127.0.0.1:3000";
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";
const requiredEvidence = requiredTestPlaywrightEvidence({
  repositoryRoot: process.cwd(),
  expectedGateId: "ci.my-designs-overlay-accessibility",
});
const requiredTestGateId = requiredEvidence.gateId;

if (requiredTestGateId && !useProductionServer) {
  throw new Error("Required My Designs evidence must use the strict production server.");
}
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("The My Designs matrix requires an explicit isolated DATABASE_URL.");
}

export default defineConfig({
  testDir: "./tests/required",
  testMatch: "my-designs-overlay-accessibility.spec.ts",
  captureGitInfo: { commit: false, diff: false },
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: requiredEvidence.reporter,
  metadata: {
    requiredTestEvidence: requiredEvidence.metadata,
  },
  outputDir: requiredTestGateId
    ? requiredEvidence.outputDirectory
    : "test-results/my-designs-overlay-accessibility",
  use: {
    baseURL: localBaseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: requiredTestGateId ? "off" : "retain-on-failure",
    screenshot: requiredTestGateId ? "off" : "only-on-failure",
    video: requiredTestGateId ? "off" : "retain-on-failure",
  },
  expect: { timeout: 30_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: useProductionServer ? "npm run start" : "npm run dev:webpack",
    url: localBaseURL,
    reuseExistingServer: requiredTestGateId ? false : !process.env.CI,
    timeout: 120_000,
  },
});
