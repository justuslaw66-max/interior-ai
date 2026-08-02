import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const localBaseURL = "http://127.0.0.1:3000";
const releaseBaseURL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";
const requiredTestGateId = process.env.REQUIRED_TEST_GATE_ID?.trim();
const requiredTestReportPath = process.env.REQUIRED_TEST_REPORT_PATH?.trim();

if (requiredTestGateId && !/^[a-z0-9][a-z0-9.-]+$/.test(requiredTestGateId)) {
  throw new Error("REQUIRED_TEST_GATE_ID is invalid.");
}

if (releaseBaseURL && new URL(releaseBaseURL).protocol !== "https:") {
  throw new Error("PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing.");
}
if (requiredTestGateId && !requiredTestReportPath) {
  throw new Error("REQUIRED_TEST_REPORT_PATH is required for required-test evidence.");
}
if (requiredTestReportPath) {
  const root = process.cwd();
  const resolved = path.resolve(root, requiredTestReportPath);
  if (path.isAbsolute(requiredTestReportPath) || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("REQUIRED_TEST_REPORT_PATH must remain repository-relative.");
  }
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
  reporter: requiredTestGateId
    ? [
        ["list"],
        ["json", { outputFile: requiredTestReportPath }],
      ]
    : [["list"]],
  metadata: {
    gateA3ReleaseBaseURL: releaseBaseURL ?? null,
    requiredTestEvidence: requiredTestGateId
      ? {
          schema: "interior-ai.required-test-evidence.v1",
          gateId: requiredTestGateId,
          sourceCommitSha: process.env.REQUIRED_TEST_SOURCE_COMMIT_SHA?.trim() || null,
          artifactSha256: process.env.REQUIRED_TEST_ARTIFACT_SHA256?.trim() || null,
          releaseCandidateId:
            process.env.REQUIRED_TEST_RELEASE_CANDIDATE_ID?.trim() || null,
          releaseEnvironment:
            process.env.REQUIRED_TEST_RELEASE_ENVIRONMENT?.trim() || null,
        }
      : null,
  },
  outputDir: requiredTestGateId
    ? `.local/required-test-evidence/${requiredTestGateId}/playwright-output`
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
