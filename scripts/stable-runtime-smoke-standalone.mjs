import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { validateProductionEvidence } from "./production-artifact-evidence.mjs";
import { PRODUCTION_EVIDENCE_VERIFICATION_MODES } from "./production-artifact-contract.mjs";
import { validateProjectedEnvironmentMetadata } from "./production-certification-stage-environment.mjs";
import {
  STABLE_MANIFEST_PATH,
  STABLE_PORTABLE_REPORT_PATH,
  STABLE_PORTABLE_SUMMARY_PATH,
  STABLE_PORTABLE_TIMING_PATH,
  stableSha256,
} from "./stable-runtime-smoke-resources.mjs";

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function stableDatabaseSummaryIssues(database) {
  const issues = [];
  const databaseMatch = database?.databaseName?.match(
    /^interior_ai_gate_a3_test_cert_([a-f0-9]{32})$/,
  );
  const roleMatch = database?.roleName?.match(
    /^interior_ai_cert_stage_([a-f0-9]{32})$/,
  );
  if (
    !exactKeys(database, [
      "lifecycleClassification", "databaseName", "databaseIdentitySha256",
      "roleName", "scopedRoleClassification", "transportClassification",
      "transportAttestationSha256", "transportVerificationStatus",
      "imageClassification", "migrationCount", "finalState", "targetAbsent",
    ]) ||
    database?.lifecycleClassification !== "STABLE_RUNTIME_SMOKE_ONLY" ||
    database?.scopedRoleClassification !== "private-stage-login-no-admin" ||
    !/^[a-f0-9]{64}$/.test(database?.databaseIdentitySha256 ?? "") ||
    !databaseMatch ||
    !roleMatch ||
    databaseMatch[1] !== roleMatch[1] ||
    databaseMatch[1] !== database.databaseIdentitySha256.slice(0, 32) ||
    !(
      (database?.transportClassification === "native-loopback" &&
        database.transportAttestationSha256 === null &&
        database.transportVerificationStatus === "verified-live" &&
        database.imageClassification === null) ||
      (database?.transportClassification ===
          "github-hosted-service-container-loopback-forward" &&
        /^[a-f0-9]{64}$/.test(database.transportAttestationSha256 ?? "") &&
        database.transportVerificationStatus === "verified-live-attested" &&
        database.imageClassification === "official-postgres-major-15")
    ) ||
    !Number.isSafeInteger(database?.migrationCount) ||
    database.migrationCount <= 0 ||
    database?.finalState !== "stable-absence-verified" ||
    database?.targetAbsent !== true
  ) {
    issues.push("Stable runtime-smoke standalone database absence is unproved");
  }
  return issues;
}

function stableEvidenceSummaryIssues(evidence, test) {
  const sha = /^[a-f0-9]{64}$/;
  if (
    !exactKeys(evidence, ["rawReport", "portableReport", "timings", "startMarker"]) ||
    !exactKeys(evidence?.rawReport, ["path", "sha256"]) ||
    evidence?.rawReport?.path !== "runtime-smoke/playwright-report.json" ||
    !sha.test(evidence?.rawReport?.sha256 ?? "") ||
    !exactKeys(evidence?.portableReport, ["path", "sha256"]) ||
    evidence?.portableReport?.path !== STABLE_PORTABLE_REPORT_PATH ||
    evidence?.portableReport?.sha256 !== test?.report?.sha256 ||
    !exactKeys(evidence?.timings, ["path", "sha256"]) ||
    evidence?.timings?.path !== STABLE_PORTABLE_TIMING_PATH ||
    evidence?.timings?.sha256 !== test?.phaseTimings?.sha256 ||
    !exactKeys(evidence?.startMarker, ["path", "sha256"]) ||
    evidence?.startMarker?.path !== "runtime-smoke/product-test-start.json" ||
    !sha.test(evidence?.startMarker?.sha256 ?? "")
  ) {
    return ["Stable runtime-smoke standalone test evidence is foreign"];
  }
  return [];
}

function stableSummaryIssues(summary, manifest, manifestBytes, repositoryRoot) {
  const test = manifest.tests.find((entry) => entry.name === "runtime-smoke");
  const issues = [];
  if (
    !exactKeys(summary, [
      "schema", "classification", "releaseCertification", "identity",
      "authFixtureContinuity", "database", "stageEnvironment", "evidence",
      "stats", "complete",
    ]) ||
    summary?.schema !== "interior-ai.stable-runtime-smoke-evidence.v1" ||
    summary?.classification !== "REPOSITORY_STABLE_RUNTIME_SMOKE_ONLY" ||
    summary?.releaseCertification !== false ||
    summary?.complete !== true
  ) {
    issues.push("Stable runtime-smoke standalone summary is malformed");
  }
  if (
    !exactKeys(summary?.identity, [
      "certificationId", "candidateId", "sourceCommitSha", "sourceTreeSha",
      "buildId", "artifactSha256", "manifestSha256", "journalSha256",
      "journalNonce",
    ]) ||
    !/^stable-runtime-smoke:\d+:[1-9]\d*:[a-f0-9]{12}$/.test(
      summary?.identity?.certificationId ?? "",
    ) ||
    summary?.identity?.candidateId !== manifest.candidateIdentifier ||
    summary?.identity?.sourceCommitSha !== manifest.source.commitSha ||
    summary?.identity?.sourceTreeSha !== manifest.source.treeSha ||
    summary?.identity?.buildId !== manifest.build.nextBuildId ||
    summary?.identity?.artifactSha256 !== manifest.artifact.sha256 ||
    summary?.identity?.manifestSha256 !== stableSha256(manifestBytes) ||
    !/^[a-f0-9]{64}$/.test(summary?.identity?.journalSha256 ?? "") ||
    summary?.identity?.journalNonce !== manifest.execution.runNonce
  ) {
    issues.push("Stable runtime-smoke standalone identity is foreign");
  }
  if (
    JSON.stringify(summary?.authFixtureContinuity) !==
    JSON.stringify(manifest.build.authFixtureContinuity)
  ) {
    issues.push("Stable runtime-smoke standalone auth fixture is foreign");
  }
  issues.push(...stableDatabaseSummaryIssues(summary?.database));
  const stageMetadata = validateProjectedEnvironmentMetadata({
    repositoryRoot,
    stage: "runtime-smoke",
    profileId: "runtime-smoke",
    metadata: summary?.stageEnvironment,
  });
  issues.push(
    ...stageMetadata.issues.map(
      (issue) => `Stable runtime-smoke stage environment: ${issue}`,
    ),
  );
  if (
    !test ||
    JSON.stringify(summary?.stats) !== JSON.stringify(test.stats)
  ) {
    issues.push("Stable runtime-smoke standalone test evidence is foreign");
  }
  issues.push(...stableEvidenceSummaryIssues(summary?.evidence, test));
  return issues;
}

export async function verifyStableRuntimeSmokeStandalone({
  repositoryRoot = process.cwd(),
  environment = process.env,
} = {}) {
  const expectedSourceCommitSha =
    environment.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA?.trim();
  const result = await validateProductionEvidence({
    repositoryRoot,
    manifestPath: STABLE_MANIFEST_PATH,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL,
    expectedSourceCommitSha,
    environment,
  });
  if (!result.valid) throw new Error(result.issues.join("; "));
  if (
    result.manifest.repositoryEvidence?.status !== "valid" ||
    result.manifest.repositoryEvidence?.releaseReady !== false ||
    result.manifest.repositoryEvidence?.actualDeploymentVerified !== false
  ) {
    throw new Error("Stable standalone evidence has release eligibility");
  }
  const summaryPath = path.join(repositoryRoot, STABLE_PORTABLE_SUMMARY_PATH);
  const summaryEntry = lstatSync(summaryPath);
  if (!summaryEntry.isFile() || summaryEntry.isSymbolicLink()) {
    throw new Error("Stable runtime-smoke standalone summary is not a physical file");
  }
  const manifestBytes = readFileSync(path.join(repositoryRoot, STABLE_MANIFEST_PATH));
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const issues = stableSummaryIssues(
    summary,
    result.manifest,
    manifestBytes,
    repositoryRoot,
  );
  if (issues.length > 0) throw new Error(issues.join("; "));
  return {
    classification: "STABLE_RUNTIME_SMOKE_STANDALONE_VERIFIED",
    sourceCommitSha: result.manifest.source.commitSha,
    artifactSha256: result.manifest.artifact.sha256,
    databaseFinalState: summary.database.finalState,
    databaseTargetAbsent: summary.database.targetAbsent,
    databaseTransportClassification:
      summary.database.transportClassification,
    expectedTests: summary.stats.expected,
    releaseCertification: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  verifyStableRuntimeSmokeStandalone()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
