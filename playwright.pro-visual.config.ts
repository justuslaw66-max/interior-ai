import { defineConfig, devices } from "@playwright/test";
import { requiredTestPlaywrightEvidence } from "./scripts/required-test-playwright.mjs";

const localBaseURL = "http://127.0.0.1:3000";
const releaseBaseURL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";
const requiredEvidence = requiredTestPlaywrightEvidence({
  repositoryRoot: process.cwd(),
  expectedGateId: "ci.pro-visual-policy",
});
const requiredTestGateId = requiredEvidence.gateId;

if (releaseBaseURL && new URL(releaseBaseURL).protocol !== "https:") {
  throw new Error("PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "pro-visual-policy.spec.ts",
  captureGitInfo: { commit: false, diff: false },
  forbidOnly: true,
  fullyParallel: false,
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: requiredEvidence.reporter,
  metadata: {
    gateA3ReleaseBaseURL: releaseBaseURL ?? null,
    requiredTestEvidence: requiredEvidence.metadata,
  },
  outputDir: requiredTestGateId
    ? requiredEvidence.outputDirectory
    : "test-results/pro-visual-policy",
  use: {
    baseURL: releaseBaseURL ?? localBaseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  expect: { timeout: 30_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  ...(releaseBaseURL
    ? {}
    : {
        webServer: {
          command: useProductionServer ? "npm run start" : "npm run dev",
          url: localBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
