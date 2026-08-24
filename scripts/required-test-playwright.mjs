import {
  CERTIFICATION_EVIDENCE_ROOT,
  PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  resolveRequiredTestReportPath,
  resolveRequiredTestStartMarkerPath,
} from "./playwright-report-path.mjs";

/**
 * @param {string | null} outputFile
 * @returns {import("playwright/types/test").ReporterDescription[]}
 */
function requiredEvidenceReporters(
  outputFile,
  startMarker,
  gateId,
  outputAuthorization = null,
) {
  return outputFile
    ? [
        ["list"],
        ["json", { outputFile }],
        ...(startMarker
          ? [[
              "./scripts/certification-playwright-start-reporter.mjs",
              {
                markerPath: startMarker,
                boundary: "discovery",
                gateId,
                ...(outputAuthorization
                  ? {
                      outputAuthorizationPath:
                        outputAuthorization.authorizationPath,
                      outputCompletionPath: outputAuthorization.completionPath,
                      outputAuthorizationSha256: outputAuthorization.sha256,
                    }
                  : {}),
              },
            ]]
          : []),
      ]
    : [["list"]];
}

export function requiredTestPlaywrightEvidence({
  repositoryRoot,
  expectedGateId,
  expectedBrowserOwnerId,
  environment = process.env,
  processIdentity = null,
}) {
  const certificationRoot = environment[CERTIFICATION_EVIDENCE_ROOT]?.trim();
  const playwrightRoot = environment[PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT]?.trim();
  if (certificationRoot && playwrightRoot && certificationRoot !== playwrightRoot) {
    throw new Error("Required-test certification evidence roots are contradictory.");
  }
  const authorizedExternalRoot = playwrightRoot || certificationRoot;
  const gateId = environment.REQUIRED_TEST_GATE_ID?.trim();
  const requestedPath = environment.REQUIRED_TEST_REPORT_PATH;
  if (!gateId) {
    if (requestedPath !== undefined) {
      throw new Error("REQUIRED_TEST_REPORT_PATH requires REQUIRED_TEST_GATE_ID.");
    }
    return Object.freeze({
      active: false,
      gateId: null,
      reportDestination: null,
      reporter: requiredEvidenceReporters(null, null, null),
      metadata: null,
      outputDirectory: null,
    });
  }
  if (gateId !== expectedGateId) {
    throw new Error("Required-test gate ID does not match this Playwright owner.");
  }
  const value = (name) => environment[name]?.trim() || null;
  const browserOwnerId = value("REQUIRED_TEST_BROWSER_OWNER_ID");
  if (authorizedExternalRoot && browserOwnerId !== expectedBrowserOwnerId) {
    throw new Error(
      "Required-test browser owner ID does not match this Playwright owner.",
    );
  }
  const stageAttempt = Number(value("REQUIRED_TEST_STAGE_ATTEMPT"));
  const browserRunIdentity = authorizedExternalRoot
    ? {
        certificationId: value("PRODUCTION_CERTIFICATION_ID"),
        candidateId: value("REQUIRED_TEST_RELEASE_CANDIDATE_ID"),
        sourceCommitSha: value("REQUIRED_TEST_SOURCE_COMMIT_SHA"),
        sourceTreeSha: value("REQUIRED_TEST_SOURCE_TREE_SHA"),
        browserOwnerId,
        gateId,
        stageAttempt,
        runNonce: value("REQUIRED_TEST_RUN_NONCE"),
      }
    : null;
  const reportDestination = resolveRequiredTestReportPath({
    requestedPath,
    repositoryRoot,
    gateId,
    authorizedExternalRoot,
    browserRunIdentity,
    processIdentity,
  });
  const requestedStartMarker = environment.REQUIRED_TEST_START_MARKER_PATH;
  const startMarker = requestedStartMarker
    ? resolveRequiredTestStartMarkerPath({
        requestedPath: requestedStartMarker,
        repositoryRoot,
        gateId,
        authorizedExternalRoot,
        outputAuthorization: reportDestination.outputAuthorization,
      }).outputPath
    : null;
  return Object.freeze({
    active: true,
    gateId,
    reportDestination,
    reporter: requiredEvidenceReporters(
      reportDestination.outputPath,
      startMarker,
      gateId,
      reportDestination.outputAuthorization,
    ),
    metadata: Object.freeze({
      schema: "interior-ai.required-test-evidence.v1",
      gateId,
      sourceCommitSha: value("REQUIRED_TEST_SOURCE_COMMIT_SHA"),
      sourceTreeSha: value("REQUIRED_TEST_SOURCE_TREE_SHA"),
      artifactSha256: value("REQUIRED_TEST_ARTIFACT_SHA256"),
      nextBuildId: value("REQUIRED_TEST_BUILD_ID"),
      releaseCandidateId: value("REQUIRED_TEST_RELEASE_CANDIDATE_ID"),
      releaseEnvironment: value("REQUIRED_TEST_RELEASE_ENVIRONMENT"),
      harnessVersion: value("REQUIRED_TEST_HARNESS_VERSION"),
      harnessSourceSha256: value("REQUIRED_TEST_HARNESS_SOURCE_SHA256"),
      destinationClass: reportDestination.destinationClass,
    }),
    outputDirectory: reportDestination.outputDirectory,
  });
}
