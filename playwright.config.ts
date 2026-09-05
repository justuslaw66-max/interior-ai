import {
  defineConfig,
  devices,
  type ReporterDescription,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadProductionArtifactForPlaywright } from "./scripts/production-artifact-playwright.mjs";
import {
  directRuntimeSmokeServerEnvironment,
  loadDirectRuntimeSmokeIdentity,
} from "./scripts/runtime-smoke-direct-identity.mjs";
import {
  CERTIFICATION_EVIDENCE_ROOT,
  PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  resolveRuntimeSmokeStartMarkerPath,
} from "./scripts/playwright-report-path.mjs";

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
const directRuntimeSmokeIdentity =
  !productionArtifactEvidence && !requiredTestGateId
    ? loadDirectRuntimeSmokeIdentity({ repositoryRoot: process.cwd(), useProductionServer, releaseBaseURL })
    : null;
// Workers inherit this invocation ID; independent CLI processes generate their
// own. Playwright startup may remove only this invocation's output directory.
const directInvocationId = directRuntimeSmokeIdentity
  ? process.env.TEST_WORKER_INDEX === undefined
    ? (process.env.RUNTIME_SMOKE_DIRECT_INVOCATION_ID = randomUUID())
    : process.env.RUNTIME_SMOKE_DIRECT_INVOCATION_ID
  : null;
if (directInvocationId && !/^[a-f0-9-]{36}$/.test(directInvocationId)) {
  throw new Error("Direct runtime-smoke invocation ID is invalid");
}
const directOutputRoot = directInvocationId
  ? path.join(useProductionServer ? ".local/production-artifact-evidence" : "test-results",
      `direct-runtime-smoke-${directInvocationId}`) : "test-results";
if (directRuntimeSmokeIdentity) directRuntimeSmokeIdentity.invocationId = directInvocationId;
const productionEvidenceReportOutputPath =
  loadedProductionArtifactEvidence?.reportDestination.outputPath;
const certificationRuntimeMarkerPath =
  process.env.CERTIFICATION_RUNTIME_START_MARKER_PATH;
const certificationEnvironmentStage =
  process.env.CERTIFICATION_ENVIRONMENT_STAGE?.trim();
const certificationRuntimeActive =
  certificationEnvironmentStage === "runtime-smoke";
const certificationRoot = process.env[CERTIFICATION_EVIDENCE_ROOT];
const playwrightExternalRoot =
  process.env[PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT];
if (
  certificationRoot &&
  playwrightExternalRoot &&
  certificationRoot !== playwrightExternalRoot
) {
  throw new Error("Playwright certification evidence roots are contradictory.");
}
if (
  certificationRuntimeMarkerPath &&
  !certificationRuntimeActive
) {
  throw new Error(
    "certification runtime start marker is prohibited outside runtime-smoke",
  );
}
if (
  certificationRuntimeActive &&
  (!productionArtifactEvidence ||
    !certificationRuntimeMarkerPath ||
    !playwrightExternalRoot ||
    !useProductionServer)
) {
  throw new Error("certification runtime smoke requires its product-test start marker");
}
const certificationRuntimeMarker =
  certificationRuntimeActive && certificationRuntimeMarkerPath
    ? resolveRuntimeSmokeStartMarkerPath({
        requestedPath: certificationRuntimeMarkerPath,
        repositoryRoot: process.cwd(),
        authorizedExternalRoot: playwrightExternalRoot,
        reportDestination: loadedProductionArtifactEvidence?.reportDestination,
      }).outputPath
    : null;
const productionArtifactReporters: ReporterDescription[] = [
  ["list"],
  ["json", { outputFile: productionEvidenceReportOutputPath }],
];
if (certificationRuntimeMarker) {
  productionArtifactReporters.push([
    "./scripts/certification-playwright-start-reporter.mjs",
    {
      markerPath: certificationRuntimeMarker,
      boundary: "test-begin",
      gateId: "ci.production-runtime-smoke",
    },
  ]);
}

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
    : path.join(directOutputRoot, "playwright-output"),
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: productionArtifactEvidence
      ? productionArtifactReporters
    : requiredTestGateId
      ? [
          ["list"],
          ["json", { outputFile: requiredTestReportPath }],
        ]
      : directRuntimeSmokeIdentity ? [
          ["list"],
          ["./scripts/runtime-smoke-direct-attempt-reporter.mjs", {
            invocationId: directInvocationId,
            sourceIdentity: directRuntimeSmokeIdentity,
            outputRoot: path.join(directOutputRoot, "results"),
            timingRoot: path.join(directOutputRoot, "playwright-output"),
          }],
        ] : [["list"]],
  metadata: {
    gateA3ReleaseBaseURL: releaseBaseURL ?? null,
    productionArtifactEvidence,
    directRuntimeSmokeIdentity,
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
              ? "npm run start -- --hostname 127.0.0.1"
              : "npm run dev",
          url: localBaseURL,
          env: directRuntimeSmokeServerEnvironment(directRuntimeSmokeIdentity),
          reuseExistingServer: productionArtifactEvidence || directRuntimeSmokeIdentity || useProductionServer ? false : !process.env.CI,
          timeout: 120000,
        },
      }),
});
