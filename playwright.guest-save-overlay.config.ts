import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const localBaseURL = "http://127.0.0.1:3000";
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";
const requiredTestGateId = process.env.REQUIRED_TEST_GATE_ID?.trim();
const requiredTestReportPath = process.env.REQUIRED_TEST_REPORT_PATH?.trim();

if (requiredTestGateId && !/^[a-z0-9][a-z0-9.-]+$/.test(requiredTestGateId)) {
  throw new Error("REQUIRED_TEST_GATE_ID is invalid.");
}
if (requiredTestGateId && !requiredTestReportPath) {
  throw new Error("REQUIRED_TEST_REPORT_PATH is required for required-test evidence.");
}
if (requiredTestGateId && !useProductionServer) {
  throw new Error("Required Guest Save Prompt evidence must use the strict production server.");
}
if (requiredTestReportPath) {
  const root = process.cwd();
  const resolved = path.resolve(root, requiredTestReportPath);
  if (path.isAbsolute(requiredTestReportPath) || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("REQUIRED_TEST_REPORT_PATH must remain repository-relative.");
  }
}

export default defineConfig({
  testDir: "./tests/required",
  testMatch: "guest-save-overlay-accessibility.spec.ts",
  captureGitInfo: { commit: false, diff: false },
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: requiredTestGateId
    ? [["list"], ["json", { outputFile: requiredTestReportPath }]]
    : [["list"]],
  metadata: {
    requiredTestEvidence: requiredTestGateId
      ? {
          schema: "interior-ai.required-test-evidence.v1",
          gateId: requiredTestGateId,
          sourceCommitSha: process.env.REQUIRED_TEST_SOURCE_COMMIT_SHA?.trim() || null,
          artifactSha256: null,
          releaseCandidateId: null,
          releaseEnvironment: null,
        }
      : null,
  },
  outputDir: requiredTestGateId
    ? `.local/required-test-evidence/${requiredTestGateId}/playwright-output`
    : "test-results/guest-save-overlay-accessibility",
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
