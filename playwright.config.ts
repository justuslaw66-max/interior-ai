import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { loadProductionArtifactForPlaywright } from "./scripts/production-artifact-playwright.mjs";

const localBaseURL = "http://127.0.0.1:3000";
const releaseBaseURL = process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim().replace(
  /\/+$/,
  ""
);
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "1";
const productionEvidenceManifestPath = process.env.PRODUCTION_EVIDENCE_MANIFEST?.trim();
const productionEvidenceReportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
const requiredTestGateId = process.env.REQUIRED_TEST_GATE_ID?.trim();
const requiredTestReportPath = process.env.REQUIRED_TEST_REPORT_PATH?.trim();

if (requiredTestGateId && !/^[a-z0-9][a-z0-9.-]+$/.test(requiredTestGateId)) {
  throw new Error("REQUIRED_TEST_GATE_ID is invalid.");
}
if (requiredTestGateId && productionEvidenceManifestPath) {
  throw new Error("Required-test and production-artifact evidence modes cannot be combined.");
}

function repositoryPath(relativePath: string, description: string) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be repository-relative.`);
  }
  const root = process.cwd();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository.`);
  }
  return resolved;
}

const loadedProductionArtifactEvidence = productionEvidenceManifestPath
  ? loadProductionArtifactForPlaywright({
      repositoryRoot: process.cwd(),
      manifestPath: productionEvidenceManifestPath,
      reportPath: productionEvidenceReportPath,
      useProductionServer,
      releaseBaseURL,
      environment: process.env,
    })
  : null;
const productionArtifactEvidence = loadedProductionArtifactEvidence?.identity ?? null;
const productionEvidenceReportOutputPath =
  loadedProductionArtifactEvidence?.reportDestination.outputPath;

if (releaseBaseURL) {
  const parsedURL = new URL(releaseBaseURL);

  if (parsedURL.protocol !== "https:") {
    throw new Error(
      "PLAYWRIGHT_RELEASE_BASE_URL must use HTTPS for release-candidate testing."
    );
  }
}

const baseURL = releaseBaseURL ?? localBaseURL;

if (requiredTestGateId && !requiredTestReportPath) {
  throw new Error("REQUIRED_TEST_REPORT_PATH is required for required-test evidence.");
}
if (requiredTestReportPath) {
  repositoryPath(requiredTestReportPath, "Required-test report path");
}

export default defineConfig({
  testDir: "./tests/e2e",
  captureGitInfo: { commit: false, diff: false },
  forbidOnly: true,
  outputDir: productionArtifactEvidence
    ? ".local/production-artifact-evidence/playwright-output"
    : requiredTestGateId
      ? `.local/required-test-evidence/${requiredTestGateId}/playwright-output`
    : "test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: productionArtifactEvidence
    ? [
        ["list"],
        ["json", { outputFile: productionEvidenceReportOutputPath }],
      ]
    : requiredTestGateId
      ? [
          ["list"],
          ["json", { outputFile: requiredTestReportPath }],
        ]
      : [["list"]],
  metadata: {
    gateA3ReleaseBaseURL: releaseBaseURL ?? null,
    productionArtifactEvidence,
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
  use: {
    baseURL,
    actionTimeout: 30000,
    navigationTimeout: 60000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(releaseBaseURL
    ? {}
    : {
        webServer: {
          command: productionArtifactEvidence
            ? productionArtifactEvidence.serverCommand
            : useProductionServer
              ? "npm run start"
              : "npm run dev",
          url: localBaseURL,
          reuseExistingServer: productionArtifactEvidence ? false : !process.env.CI,
          timeout: 120000,
        },
      }),
});
