import { defineConfig, devices } from "@playwright/test";
import { requiredTestPlaywrightEvidence } from "./scripts/required-test-playwright.mjs";

const localBaseURL = "http://127.0.0.1:3000";
const requiredEvidence = requiredTestPlaywrightEvidence({
  repositoryRoot: process.cwd(),
  expectedGateId: "ci.retailer-confirmation-accessibility",
  expectedBrowserOwnerId: "retailer",
});
const requiredTestGateId = requiredEvidence.gateId;

if (process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER) {
  throw new Error("Retailer confirmation evidence owns the canonical Cart development server.");
}

export default defineConfig({
  testDir: "./tests/required",
  testMatch: "retailer-confirmation-accessibility.spec.ts",
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
    : "test-results/retailer-confirmation-accessibility",
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
    command: "npm run dev",
    url: localBaseURL,
    reuseExistingServer: requiredTestGateId ? false : !process.env.CI,
    timeout: 120_000,
  },
});
