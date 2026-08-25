import assert from "node:assert/strict";
import "./test-production-certification-build-generated-output.mjs";
import "./test-production-certification-browser-server-lifecycle.mjs";
import "./test-production-certification-stage-order.mjs";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  PRODUCTION_EVIDENCE_SCHEMA,
} from "./production-artifact-contract.mjs";
import {
  CERTIFICATION_FAILURE_CLASSIFICATIONS,
  CERTIFICATION_STAGE_ORDER,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  REQUIRED_BROWSER_OWNERS,
  canonicalJsonBytes,
  harnessSourceIdentity,
  sha256Bytes,
  sourceValidationCheckSet,
} from "./production-certification-contract.mjs";
import { parseCertificationStageResult } from "./production-certification-stage-result-contract.mjs";
import {
  assertFileBackedOwner,
  runCertificationDoctor,
} from "./production-certification-doctor.mjs";
import {
  certificationStateSha256,
  certificationStateSealIssues,
  completeCertificationStage,
  createCertificationState,
  invalidateCertificationState,
  readCertificationState,
  startCertificationStage,
  validateCertificationState,
  writeCertificationState,
} from "./production-certification-state.mjs";
import { runProductionCertificationSimulation } from "./production-certification-simulation.mjs";
import {
  absentEvidenceTarget,
  assertCanonicalExtractedArchiveRoot,
  assertCertificationChildPassed,
  browserEnvironment,
  certificationStageFailure,
  parseCertificationChildJson,
  persistManagedCertificationStageFailure,
} from "./production-certification-real.mjs";
import {
  createCertificationAbortCleanupRequest,
  createSerializedTerminalLifecycle,
} from "./production-certification.mjs";
import {
  measureFinalContinuity,
  rootEvidenceName,
  sealSourceValidationEvidence,
  snapshotEvidenceName,
  validateArtifactSnapshotEvidence,
  validateContinuityEvidence,
  validateSourceValidationEvidence,
} from "./production-certification-source-continuity.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import CertificationPlaywrightStartReporter from "./certification-playwright-start-reporter.mjs";
import {
  RUNTIME_SMOKE_REPORT_AUTHORIZATION_SCHEMA,
  resolvePlaywrightReportPath,
  resolveRequiredTestReportPath,
  resolveRequiredTestStartMarkerPath,
} from "./playwright-report-path.mjs";
import {
  projectCertificationChildEnvironment,
  stageEnvironmentContract,
  validateProjectedEnvironmentMetadata,
} from "./production-certification-stage-environment.mjs";
import { stageWorktreeRole } from "./production-certification-worktrees.mjs";
import authFixtureSession from "./ci-auth-fixture-session.cjs";

const repositoryRoot = process.cwd();
const CURRENT_JOURNAL_V2_FINAL_POSITIVE_PATH =
  "state-v4/manifest-v3/journal-v2/physical-final-standalone";
const GENERATED_OUTPUT_AGGREGATE_SEAL_DOMAIN =
  "interior-ai.production-certification-source-generated-output-aggregate-seal.v1\n";
const BROWSER_SERVER_LIFECYCLE_SEAL_DOMAIN =
  "interior-ai.production-certification-browser-server-lifecycle-seal.v1\n";
const fixedTime = "2026-08-14T00:00:00.000Z";
const candidate = {
  id: "certification-test-candidate",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  parentSha: "9".repeat(40),
};
const coveredRegressionIds = new Set();

function finalSimulationChild(
  simulationRoot,
  { allowSimulation = true, artifactRoot } = {},
) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  const environment = {
    ...process.env,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
  };
  if (allowSimulation) environment.CERTIFICATION_ALLOW_SIMULATION = "1";
  return spawnSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: artifactRoot ?? path.join(evidenceRoot, "archive/extracted"),
      env: environment,
      encoding: "utf8",
    },
  );
}

function cloneSimulation(simulationRoot) {
  const root = mkdtempSync(path.join(tmpdir(), "certification-negative-"));
  const clone = path.join(root, "fixture");
  cpSync(simulationRoot, clone, { recursive: true, verbatimSymlinks: true });
  return clone;
}

function mutateBoundEvidence(simulationRoot, name, mutate, binding) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  const descriptor = state.evidenceFiles[name];
  const evidencePath = path.join(evidenceRoot, descriptor.path);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  mutate(evidence);
  writeFileSync(evidencePath, canonicalJsonBytes(evidence));
  descriptor.sha256 = sha256Bytes(readFileSync(evidencePath));
  if (binding?.startsWith("browser:")) {
    state.bindings.browserOwnerEvidenceSha256[binding.slice("browser:".length)] =
      descriptor.sha256;
  } else if (binding) {
    state.bindings[binding] = descriptor.sha256;
  }
  writeCertificationState(statePath, state);
}

function resealBrowserServerLifecycleEvidence(evidence) {
  const payload = structuredClone(evidence);
  delete payload.aggregateEvidenceSha256;
  return {
    ...payload,
    aggregateEvidenceSha256: sha256Bytes(
      Buffer.concat([
        Buffer.from(BROWSER_SERVER_LIFECYCLE_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
  };
}

function mutateExtractedManifest(simulationRoot, mutate) {
  const manifestPath = path.join(
    simulationRoot,
    "evidence/archive/extracted/.local/production-artifact-evidence/manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  writeFileSync(manifestPath, canonicalJsonBytes(manifest));
  writeFileSync(
    `${manifestPath}.sha256`,
    `${sha256Bytes(readFileSync(manifestPath))}  manifest.json\n`,
  );
}

function mutateExtractedJournal(simulationRoot, mutate) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const journalPath = path.join(
    evidenceRoot,
    "archive/extracted/.local/production-artifact-evidence/semantic-event-journal.json",
  );
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  mutate(journal);
  writeFileSync(journalPath, canonicalJsonBytes(journal));
  const state = readCertificationState(statePath);
  state.bindings.semanticJournalSha256 = sha256Bytes(readFileSync(journalPath));
  writeCertificationState(statePath, state);
}

function mutateRuntimeReport(simulationRoot, mutate) {
  mutateBoundEvidence(simulationRoot, "runtime-report", (report) => {
    mutate(report);
  });
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const state = readCertificationState(
    path.join(evidenceRoot, "certification-state.json"),
  );
  mutateBoundEvidence(
    simulationRoot,
    "runtime-smoke",
    (evidence) => {
      evidence.reportSha256 = state.evidenceFiles["runtime-report"].sha256;
    },
    "runtimeSmokeEvidenceSha256",
  );
}

function mutateRuntimeReportIdentity(simulationRoot, mutate) {
  mutateRuntimeReport(simulationRoot, (report) => {
    mutate(report.config.metadata.productionArtifactEvidence);
  });
}

function projectSimulationRuntimeReportThroughPhysicalOwnership(simulationRoot) {
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const statePath = path.join(evidenceRoot, "certification-state.json");
  const state = readCertificationState(statePath);
  const reportDescriptor = state.evidenceFiles["runtime-report"];
  const markerDescriptor = state.evidenceFiles["runtime-start"];
  const reportPath = path.join(evidenceRoot, reportDescriptor.path);
  const markerPath = path.join(evidenceRoot, markerDescriptor.path);
  const producerSidecarDescriptor =
    state.worktrees.roles["final-artifact"].privateSidecar;
  const producerSidecar = JSON.parse(
    readFileSync(
      path.join(evidenceRoot, producerSidecarDescriptor.path),
      "utf8",
    ),
  );
  const producerRoot = producerSidecar.realpath;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  report.config.configFile = path.join(producerRoot, "playwright.config.ts");
  report.config.rootDir = path.join(producerRoot, "tests/e2e");
  report.config.projects[0].outputDir = path.join(
    producerRoot,
    ".local/production-artifact-evidence/playwright-output",
  );
  report.config.projects[0].testDir = path.join(producerRoot, "tests/e2e");
  report.config.reporter = [
    ["list", null],
    ["json", { outputFile: reportPath }],
    [
      path.join(
        producerRoot,
        "scripts/certification-playwright-start-reporter.mjs",
      ),
      {
        markerPath,
        boundary: "test-begin",
        gateId: "ci.production-runtime-smoke",
      },
    ],
  ];
  writeFileSync(reportPath, canonicalJsonBytes(report));
  reportDescriptor.sha256 = sha256Bytes(readFileSync(reportPath));
  const runtimeDescriptor = state.evidenceFiles["runtime-smoke"];
  const runtimePath = path.join(evidenceRoot, runtimeDescriptor.path);
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  runtime.reportSha256 = reportDescriptor.sha256;
  writeFileSync(runtimePath, canonicalJsonBytes(runtime));
  runtimeDescriptor.sha256 = sha256Bytes(readFileSync(runtimePath));
  state.bindings.runtimeSmokeEvidenceSha256 = runtimeDescriptor.sha256;
  const attempt = state.stages["runtime-smoke"].attempts.at(-1);
  const ownerPath = `${reportPath}.owner.json`;
  writeFileSync(
    ownerPath,
    canonicalJsonBytes({
      schema: RUNTIME_SMOKE_REPORT_AUTHORIZATION_SCHEMA,
      certificationId: state.certificationId,
      candidateId: state.candidate.id,
      sourceCommitSha: state.candidate.commitSha,
      sourceTreeSha: state.candidate.treeSha,
      buildId: state.bindings.nextBuildId,
      artifactSha256: state.bindings.artifactSha256,
      productionManifestSha256: state.bindings.productionManifestSha256,
      semanticJournalSha256: state.bindings.semanticJournalSha256,
      runtimeStage: "runtime-smoke",
      runtimeStageAttempt: attempt.number,
      runNonce: state.bindings.semanticJournalNonce,
      reportRelativePath: reportDescriptor.path,
      evidenceRootIdentitySha256: sha256Bytes(realpathSync(evidenceRoot)),
    }),
  );
  writeCertificationState(statePath, state);
  return {
    markerPath,
    ownerPath,
    reportPath,
    reportSha256: reportDescriptor.sha256,
    runtimePath,
    statePath,
  };
}

function mutateRuntimeTiming(simulationRoot, mutate) {
  mutateBoundEvidence(simulationRoot, "runtime-phase-timings", (timing) => {
    mutate(timing);
  });
  const evidenceRoot = path.join(simulationRoot, "evidence");
  const state = readCertificationState(
    path.join(evidenceRoot, "certification-state.json"),
  );
  const timingPath = path.join(
    evidenceRoot,
    state.evidenceFiles["runtime-phase-timings"].path,
  );
  const timing = JSON.parse(readFileSync(timingPath, "utf8"));
  mutateBoundEvidence(
    simulationRoot,
    "runtime-smoke",
    (evidence) => {
      evidence.phaseTimingsSha256 =
        state.evidenceFiles["runtime-phase-timings"].sha256;
      evidence.phaseTimings.sha256 =
        state.evidenceFiles["runtime-phase-timings"].sha256;
      evidence.phaseTimings.identity = timing.evidenceBinding?.identity;
    },
    "runtimeSmokeEvidenceSha256",
  );
}

function mutateRuntimeTimingIdentity(simulationRoot, mutate) {
  mutateRuntimeTiming(simulationRoot, (timing) => {
    mutate(timing.evidenceBinding.identity);
  });
}

function stateFixture() {
  return createCertificationState({
    certificationId: "certification-test",
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    treeSha: candidate.treeSha,
    parentSha: candidate.parentSha,
    harnessSourceSha256: "c".repeat(64),
    executionClass: "deterministic-simulation",
    createdAt: fixedTime,
  });
}

{
  const contract = stageEnvironmentContract(repositoryRoot);
  assert.equal(contract.value.schema, "interior-ai.production-certification-stage-environment.v2");
  assert.equal(Object.keys(contract.variables).length, 117);
  assert.equal(contract.variables.GOOGLE_CLIENT_ID.secret, true);
  assert.equal(contract.variables.GOOGLE_CLIENT_SECRET.secret, true);
  assert.equal(Object.keys(contract.applicationFeatureVariables).length, 5);
  assert.equal(Object.keys(contract.profiles).length, 22);
  assert.deepEqual(
    contract.profiles["source-validation"].valuePolicies
      .FLOOR_PLAN_VISION_ENABLED,
    {
      policy: "check-owned-fixture-value",
      valueType: "boolean",
      value: "0",
      ownerCheckIds: ["floor-plan-required-closure"],
    },
  );
  assert.equal(
    contract.profiles["source-validation"].valuePolicies.OPENAI_API_KEY
      .policy,
    "must-be-absent",
  );
  assert.equal(
    contract.profiles.build.valuePolicies.FLOOR_PLAN_VISION_ENABLED.policy,
    "optional-non-secret-enum",
  );
  assert.equal(
    contract.profiles["runtime-smoke"].valuePolicies.OPENAI_API_KEY.policy,
    "optional-secret-value-not-recorded",
  );
  const legacyGateA3Controls = [
    "PLAYWRIGHT_ADMIN_EMAIL",
    "PLAYWRIGHT_ADMIN_SESSION_COOKIE",
    "PLAYWRIGHT_BASE_URL",
    "PLAYWRIGHT_EXPIRED_SESSION_COOKIE",
    "PLAYWRIGHT_ORDINARY_SESSION_COOKIE",
    "PLAYWRIGHT_PRO_SESSION_COOKIE",
    "PLAYWRIGHT_WEB_SERVER_PORT",
  ];
  for (const name of legacyGateA3Controls) {
    assert.ok(contract.variables[name], `${name} must be explicitly inventoried`);
    assert.equal(
      Object.values(contract.profiles).some((profile) =>
        profile.childVisibleVariables.includes(name),
      ),
      false,
      `${name} must remain parent-only across certification stage profiles`,
    );
  }
  for (const name of [
    "PLAYWRIGHT_ADMIN_EMAIL",
    "PLAYWRIGHT_ADMIN_SESSION_COOKIE",
    "PLAYWRIGHT_EXPIRED_SESSION_COOKIE",
    "PLAYWRIGHT_ORDINARY_SESSION_COOKIE",
    "PLAYWRIGHT_PRO_SESSION_COOKIE",
  ]) {
    assert.equal(contract.variables[name].secret, true);
  }
  for (const name of [
    "PRODUCTION_ARTIFACT_BUILD_ID",
    "PRODUCTION_ARTIFACT_COMMIT_SHA",
    "PRODUCTION_ARTIFACT_SHA256",
  ]) {
    assert.ok(contract.variables[name], `${name} must be explicitly inventoried`);
    assert.deepEqual(
      Object.entries(contract.profiles)
        .filter(([, profile]) => profile.childVisibleVariables.includes(name))
        .map(([profileId]) => profileId),
      ["artifact-product-server"],
    );
  }
  assert.deepEqual(
    Object.entries(contract.profiles)
      .filter(([, profile]) =>
        profile.childVisibleVariables.includes(
          "PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256",
        ),
      )
      .map(([profileId]) => profileId),
    ["archive-verifier"],
  );
  const parentEvidenceRoot = "/external/certification-parent";
  const syntheticSecret = "synthetic-projector-secret-never-print";
  const source = projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: {
      PATH: process.env.PATH,
      DATABASE_URL: syntheticSecret,
      CERTIFICATION_EVIDENCE_ROOT: parentEvidenceRoot,
      CERTIFICATION_RUNTIME_REPORT_PATH: "/external/runtime.json",
      PHASE8_EXTERNAL_EVIDENCE_ROOT: "/external/phase8",
      REQUIRED_TEST_REPORT_PATH: "/external/browser.json",
      PLAYWRIGHT_ADMIN_SESSION_COOKIE: syntheticSecret,
      PRODUCTION_ARTIFACT_SHA256: "e".repeat(64),
      CERTIFICATION_UNKNOWN_FUTURE_CAPABILITY: "strip-me",
    },
    stage: "source-validation",
    checkId: "production-artifact-evidence-contracts",
    profileId: "source-validation",
    requiredEnvironmentNames: ["DATABASE_URL"],
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
      CERTIFICATION_SOURCE_VALIDATION_CHECK_ID:
        "production-artifact-evidence-contracts",
      DATABASE_URL: syntheticSecret,
    },
  });
  assert.equal(source.environment.CERTIFICATION_EVIDENCE_ROOT, undefined);
  assert.equal(source.environment.CERTIFICATION_RUNTIME_REPORT_PATH, undefined);
  assert.equal(source.environment.PHASE8_EXTERNAL_EVIDENCE_ROOT, undefined);
  assert.equal(source.environment.REQUIRED_TEST_REPORT_PATH, undefined);
  assert.equal(source.environment.PLAYWRIGHT_ADMIN_SESSION_COOKIE, undefined);
  assert.equal(source.environment.PRODUCTION_ARTIFACT_SHA256, undefined);
  assert.equal(source.environment.CERTIFICATION_UNKNOWN_FUTURE_CAPABILITY, undefined);
  assert.equal(source.environment.DATABASE_URL, syntheticSecret);
  assert.ok(
    source.metadata.strippedUnknownCertificationControlVariables.includes(
      "CERTIFICATION_UNKNOWN_FUTURE_CAPABILITY",
    ),
  );
  assert.doesNotMatch(JSON.stringify(source.metadata), new RegExp(syntheticSecret));
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId: "production-artifact-evidence-contracts",
      profileId: "source-validation",
      requiredEnvironmentNames: ["DATABASE_URL"],
      metadata: source.metadata,
    }).valid,
    true,
  );
  for (const prohibitedInput of [
    { CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke" },
    { REQUIRED_TEST_REPORT_PATH: "/external/browser.json" },
    { PHASE8_EXTERNAL_EVIDENCE_ROOT: "/external/phase8" },
    { CERTIFICATION_QUALIFICATION_MODE: "1" },
  ]) {
    assert.throws(
      () =>
        projectCertificationChildEnvironment({
          repositoryRoot,
          baseEnvironment: {},
          stage: "source-validation",
          checkId: "production-artifact-evidence-contracts",
          profileId: "source-validation",
          stageInputs: {
            CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
            CERTIFICATION_SOURCE_VALIDATION_CHECK_ID:
              "production-artifact-evidence-contracts",
            ...prohibitedInput,
          },
        }),
      /prohibits stage input|requires fixed input/,
    );
  }
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "source-validation",
        checkId: "production-artifact-evidence-contracts",
        profileId: "runtime-smoke",
        stageInputs: {},
      }),
    /cannot execute stage source-validation/,
  );
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "source-validation",
        checkId: "production-artifact-evidence-contracts",
        profileId: "source-validation",
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
          CERTIFICATION_UNKNOWN_SECRET: syntheticSecret,
        },
      }),
    (error) =>
      /CERTIFICATION_UNKNOWN_SECRET/.test(String(error)) &&
      !String(error).includes(syntheticSecret),
  );
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "source-validation",
        checkId: "production-artifact-evidence-contracts",
        profileId: "source-validation",
        requiredEnvironmentNames: ["DATABASE_URL"],
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
          CERTIFICATION_SOURCE_VALIDATION_CHECK_ID:
            "production-artifact-evidence-contracts",
        },
      }),
    /DATABASE_URL/,
  );
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "source-validation",
      checkId: "production-artifact-evidence-contracts",
      profileId: "source-validation",
      requiredEnvironmentNames: [
        "DATABASE_URL",
        "CERTIFICATION_EVIDENCE_ROOT",
      ],
      metadata: source.metadata,
    }).valid,
    false,
  );
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "source-validation",
        checkId: "production-artifact-evidence-contracts",
        profileId: "source-validation",
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
        },
      }),
    /CERTIFICATION_SOURCE_VALIDATION_CHECK_ID/,
  );
  const runtimeFixtureNonce = "9".repeat(32);
  const runtimeFixtureClientId =
    `123456789012345-gate-a3-ci-${runtimeFixtureNonce}.apps.googleusercontent.com`;
  const runtimeFixtureClientSecret =
    `GOCSPX-gate-a3-ci-${runtimeFixtureNonce}`;
  const runtimeInputs = {
    CERTIFICATION_STAGE_ENVIRONMENT_CONTRACT_SHA256:
      stageEnvironmentContract(repositoryRoot).sha256,
    CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_ID: "runtime-smoke",
    CERTIFICATION_STAGE_ENVIRONMENT_PROFILE_SHA256:
      stageEnvironmentContract(repositoryRoot).profiles["runtime-smoke"].sha256,
    CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "1",
    CERTIFICATION_RUNTIME_START_MARKER_PATH: "/external/start.json",
    CI_AUTH_FIXTURE_ACTIVE: "1",
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: "b".repeat(40),
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: "d".repeat(40),
    CI_AUTH_FIXTURE_LOCAL_TEST: "1",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_NO_REGENERATION: "1",
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256:
      sha256Bytes(runtimeFixtureClientId),
    CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256:
      sha256Bytes(runtimeFixtureClientSecret),
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION:
      "PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH",
    CI_AUTH_FIXTURE_SESSION_ID: "runtime-fixture-session-001",
    CI_AUTH_FIXTURE_SESSION_NONCE: "runtime-fixture-nonce-001",
    DATABASE_URL: syntheticSecret,
    PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT: "/external",
    PLAYWRIGHT_JSON_OUTPUT_FILE: "/external/report.json",
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
    PRODUCTION_CERTIFICATION_ID: "certification-test-id",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate",
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: "a".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: "build",
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: "b".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_NONCE:
      "123e4567-e89b-42d3-a456-426614174001",
    PRODUCTION_EVIDENCE_EXPECTED_JOURNAL_SHA256: "e".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: "c".repeat(64),
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: "d".repeat(40),
    PRODUCTION_EVIDENCE_JOURNAL_PATH:
      ".local/production-artifact-evidence/semantic-event-journal.json",
    PRODUCTION_EVIDENCE_MANIFEST:
      ".local/production-artifact-evidence/manifest.json",
    RUNTIME_SMOKE_PHASE_TIMINGS_PATH: "/external/timings.json",
    GOOGLE_CLIENT_ID: runtimeFixtureClientId,
    GOOGLE_CLIENT_SECRET: runtimeFixtureClientSecret,
  };
  const runtime = projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: { CERTIFICATION_EVIDENCE_ROOT: parentEvidenceRoot },
    stage: "runtime-smoke",
    profileId: "runtime-smoke",
    stageInputs: runtimeInputs,
  });
  assert.equal(runtime.environment.CERTIFICATION_EVIDENCE_ROOT, undefined);
  assert.equal(runtime.environment.CERTIFICATION_ENVIRONMENT_STAGE, "runtime-smoke");
  assert.equal(
    runtime.environment.CERTIFICATION_RUNTIME_START_MARKER_PATH,
    "/external/start.json",
  );
  assert.equal(runtime.environment.PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT, "/external");
  for (const name of [
    "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA",
    "CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA",
    "CI_AUTH_FIXTURE_LOCAL_TEST",
    "CI_AUTH_FIXTURE_MODE",
    "CI_AUTH_FIXTURE_NO_REGENERATION",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256",
    "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION",
    "CI_AUTH_FIXTURE_SESSION_ID",
    "CI_AUTH_FIXTURE_SESSION_NONCE",
  ]) {
    assert.equal(
      runtime.environment[name],
      runtimeInputs[name],
      `${name} must survive the runtime projection that previously caused SYNTHETIC_AUTH_FIXTURE_SCOPE_REJECTED`,
    );
  }
  coveredRegressionIds.add(39);
  const tamperedMetadata = structuredClone(runtime.metadata);
  tamperedMetadata.profileSha256 = "0".repeat(64);
  assert.equal(
    validateProjectedEnvironmentMetadata({
      repositoryRoot,
      stage: "runtime-smoke",
      profileId: "runtime-smoke",
      metadata: tamperedMetadata,
    }).valid,
    false,
  );
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "browser-owners",
        profileId: "development-browser-owner",
        stageInputs: {
          CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners",
          PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
        },
      }),
    /prohibits stage input PLAYWRIGHT_USE_PRODUCTION_SERVER/,
  );
  assert.throws(
    () =>
      projectCertificationChildEnvironment({
        repositoryRoot,
        baseEnvironment: {},
        stage: "browser-owners",
        profileId: "production-browser-owner",
        stageInputs: { CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners" },
      }),
    /requires fixed input PLAYWRIGHT_USE_PRODUCTION_SERVER|missing required names/,
  );
  const mutationChild = spawnSync(
    process.execPath,
    ["-e", "process.env.CERTIFICATION_RUNTIME_START_MARKER_PATH='child-only'"],
    { env: source.environment, encoding: "utf8" },
  );
  assert.equal(mutationChild.status, 0);
  const nextSource = projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: {
      CERTIFICATION_EVIDENCE_ROOT: parentEvidenceRoot,
      DATABASE_URL: syntheticSecret,
    },
    stage: "source-validation",
    checkId: "certification-harness-contracts",
    profileId: "source-validation",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "source-validation",
      CERTIFICATION_SOURCE_VALIDATION_CHECK_ID: "certification-harness-contracts",
      DATABASE_URL: syntheticSecret,
    },
  });
  assert.equal(
    nextSource.environment.CERTIFICATION_RUNTIME_START_MARKER_PATH,
    undefined,
  );
}

{
  const state = stateFixture();
  assert.equal(state.schema, PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1);
  assert.deepEqual(Object.keys(state.stages), CERTIFICATION_STAGE_ORDER);
  assert.throws(
    () => startCertificationStage(state, { stage: "build", startedAt: fixedTime }),
    /requires passed prior stage doctor/,
  );
  const edited = structuredClone(state);
  edited.candidate.treeSha = "d".repeat(40);
  assert.deepEqual(certificationStateSealIssues(edited), [
    "certification state seal mismatch; manual editing is not accepted",
  ]);
  assert.throws(
    () =>
      createCertificationState({
        certificationId: "certification-test",
        candidateId: "bad candidate",
        commitSha: candidate.commitSha,
        treeSha: candidate.treeSha,
        parentSha: candidate.parentSha,
        harnessSourceSha256: "c".repeat(64),
        executionClass: "real-candidate",
        createdAt: fixedTime,
      }),
    /canonical grammar/,
  );
  coveredRegressionIds.add(3);
}

{
  const cleanupReceipt = { currentState: "abort-absence-verified" };
  const terminal = createSerializedTerminalLifecycle({
    runAbortCleanup: async () => cleanupReceipt,
  });
  const commandFailure = new Error("precondition fixture");
  const result = await terminal.execute(async () => {
    throw commandFailure;
  });
  assert.equal(result.commandError, commandFailure);
  assert.equal(result.cleanupError, null);
  assert.equal(result.cleanupResult, cleanupReceipt);
}

{
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: false,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 1,
    failureClassification: "PRECONDITION_ORCHESTRATION_FAILURE",
    consumedSubstantiveGate: true,
  });
  assert.throws(
    () =>
      startCertificationStage(state, {
        stage: "doctor",
        startedAt: "2026-08-14T00:00:00.200Z",
      }),
    /cannot be restarted/,
  );
  const invalidated = invalidateCertificationState(state, {
    stage: "build",
    reason: "source changed",
    invalidatedAt: "2026-08-14T00:00:00.300Z",
  });
  assert.equal(invalidated.stages.build.status, "invalidated");
  assert.equal(invalidated.stages.phase8.status, "invalidated");
}

{
  const root = mkdtempSync(
    path.join(tmpdir(), "certification-runtime-failed-state-"),
  );
  const statePath = path.join(root, "certification-state.json");
  const digest = "e".repeat(64);
  const descriptors = (names) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        {
          path: `${name.replaceAll(":", "-")}.json`,
          sha256: digest,
        },
      ]),
    );
  const passed = [
    ["doctor", ["doctor"], {}],
    ["source-validation", ["source-validation"], {}],
    [
      "build",
      [
        "build",
        "artifact-snapshot:immediateBuild",
        "artifact-root:immediateBuild",
      ],
      {
        semanticJournalNonce: "123e4567-e89b-42d3-a456-426614174001",
        nextBuildId: "runtime-failed-state-build",
        artifactSha256: digest,
        productionManifestSha256: digest,
        semanticJournalSha256: digest,
      },
    ],
    [
      "archive-preflight",
      [
        "archive-plan",
        "archive-preflight",
        "artifact-snapshot:stagedArchive",
        "artifact-root:stagedArchive",
      ],
      { verifierSourceClosureSha256: digest },
    ],
    [
      "archive",
      [
        "archive",
        "archive-inventory",
        "artifact-snapshot:compressedArchive",
        "artifact-root:compressedArchive",
      ],
      { archiveSha256: digest, archiveInventorySha256: digest },
    ],
    [
      "extracted-archive-preflight",
      [
        "extracted-archive-preflight",
        "artifact-snapshot:extractedArchive",
        "artifact-root:extractedArchive",
      ],
      {},
    ],
    [
      "phase8",
      [
        "phase8",
        "phase8-raw",
        "phase8-completion",
        "artifact-snapshot:postPhase8Live",
        "artifact-root:postPhase8Live",
      ],
      { phase8EvidenceSha256: digest },
    ],
  ];
  try {
    let state = stateFixture();
    for (const [index, [stage, evidenceNames, bindingUpdates]] of passed.entries()) {
      const second = String(index).padStart(2, "0");
      state = startCertificationStage(state, {
        stage,
        startedAt: `2026-08-14T00:00:${second}.000Z`,
      });
      state = completeCertificationStage(state, {
        stage,
        passed: true,
        completedAt: `2026-08-14T00:00:${second}.100Z`,
        exitCode: 0,
        bindingUpdates,
        evidenceFiles: descriptors(evidenceNames),
      });
    }
    const preRuntimeStateSha256 = certificationStateSha256(state);
    state = startCertificationStage(state, {
      stage: "runtime-smoke",
      startedAt: "2026-08-14T00:00:07.000Z",
    });
    const runningStateSha256 = certificationStateSha256(state);
    writeCertificationState(statePath, state);
    const evidenceFiles = descriptors([
      "runtime-report",
      "runtime-phase-timings",
      "runtime-start",
    ]);
    const failure = certificationStageFailure(
      new Error("runtime product assertion fixture"),
      {
        consumed: true,
        classification: "PRODUCT_ASSERTION_FAILURE",
      },
    );
    failure.evidenceFiles = evidenceFiles;
    const returnedFailure = persistManagedCertificationStageFailure({
      statePath,
      stage: "runtime-smoke",
      failure,
      completedAt: "2026-08-14T00:00:07.100Z",
    });
    const physicalFailedState = readCertificationState(statePath);
    const physicalFailedStateSha256 =
      certificationStateSha256(physicalFailedState);
    assert.notEqual(runningStateSha256, physicalFailedStateSha256);
    assert.notEqual(preRuntimeStateSha256, physicalFailedStateSha256);
    assert.equal(returnedFailure.failedStateSha256, physicalFailedStateSha256);
    assert.equal(returnedFailure.stage, "runtime-smoke");
    assert.equal(returnedFailure.stageAttempt, 1);
    assert.equal(
      physicalFailedState.stages["runtime-smoke"].attempts.at(-1).status,
      "failed",
    );
    assert.equal(
      physicalFailedState.stages["runtime-smoke"].consumedSubstantiveGate,
      true,
    );

    const cleanup = createCertificationAbortCleanupRequest({
      command: "runtime-smoke",
      terminalSignal: null,
      commandError: returnedFailure,
      environment: {
        PRODUCTION_CERTIFICATION_STATE: statePath,
        CERTIFICATION_EXPECTED_STATE_SHA256: preRuntimeStateSha256,
      },
    });
    assert.equal(
      cleanup.environment.CERTIFICATION_EXPECTED_STATE_SHA256,
      physicalFailedStateSha256,
    );
    assert.deepEqual(cleanup.originalFailure, {
      classification: "PRODUCT_ASSERTION_FAILURE",
      consumedSubstantiveGate: true,
      stage: "runtime-smoke",
      attempt: 1,
      failedStateSha256: physicalFailedStateSha256,
      evidenceReferences: evidenceFiles,
    });

    for (const [description, mutation] of [
      ["stage", { stage: "phase8" }],
      ["attempt", { stageAttempt: 2 }],
      [
        "classification",
        { classification: "PRECONDITION_ORCHESTRATION_FAILURE" },
      ],
      ["consumption", { consumed: false }],
      [
        "evidence",
        {
          evidenceFiles: {
            ...evidenceFiles,
            "runtime-report": {
              ...evidenceFiles["runtime-report"],
              sha256: "0".repeat(64),
            },
          },
        },
      ],
    ]) {
      assert.throws(
        () =>
          createCertificationAbortCleanupRequest({
            command: "runtime-smoke",
            terminalSignal: null,
            commandError: { ...returnedFailure, ...mutation },
            environment: { PRODUCTION_CERTIFICATION_STATE: statePath },
          }),
        /does not match the physical failed attempt/,
        `cleanup must reject caller-supplied ${description} attribution drift`,
      );
    }

    assert.throws(
      () =>
        createCertificationAbortCleanupRequest({
          command: "runtime-smoke",
          terminalSignal: null,
          commandError: {
            classification: "PRODUCT_ASSERTION_FAILURE",
            consumed: true,
            stage: "runtime-smoke",
            stageAttempt: 1,
            evidenceFiles,
          },
          environment: { PRODUCTION_CERTIFICATION_STATE: statePath },
        }),
      /missing its authoritative failed-state SHA/,
      "a task driver may not discard the returned failed-state SHA",
    );
    assert.throws(
      () =>
        createCertificationAbortCleanupRequest({
          command: "runtime-smoke",
          terminalSignal: null,
          commandError: {
            ...returnedFailure,
            failedStateSha256: preRuntimeStateSha256,
          },
          environment: { PRODUCTION_CERTIFICATION_STATE: statePath },
        }),
      /does not match the physical certification state/,
      "the pre-runtime comparator must be rejected as stale",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: false,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 1,
    failureClassification: "PRECONDITION_ORCHESTRATION_FAILURE",
    consumedSubstantiveGate: false,
  });
  state = startCertificationStage(state, {
    stage: "doctor",
    startedAt: "2026-08-14T00:00:00.200Z",
  });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:00:00.300Z",
    exitCode: 0,
    outputHashes: { doctor: "d".repeat(64) },
    evidenceFiles: {
      doctor: { path: "doctor/attempt-002.json", sha256: "d".repeat(64) },
    },
  });
  assert.deepEqual(
    state.stages.doctor.attempts.map((attempt) => ({
      number: attempt.number,
      status: attempt.status,
      consumed: attempt.consumedSubstantiveGate,
    })),
    [
      { number: 1, status: "failed", consumed: false },
      { number: 2, status: "passed", consumed: false },
    ],
  );
}

{
  const root = mkdtempSync(path.join(tmpdir(), "certification-state-hash-"));
  const evidencePath = path.join(root, "doctor.json");
  writeFileSync(evidencePath, "{}\n");
  let state = stateFixture();
  state = startCertificationStage(state, { stage: "doctor", startedAt: fixedTime });
  state = completeCertificationStage(state, {
    stage: "doctor",
    passed: true,
    completedAt: "2026-08-14T00:00:00.100Z",
    exitCode: 0,
    outputHashes: { doctor: sha256Bytes("{}\n") },
    evidenceFiles: {
      doctor: { path: "doctor.json", sha256: sha256Bytes("{}\n") },
    },
  });
  assert.equal(
    validateCertificationState({
      state,
      evidenceRoot: root,
      expectedCandidate: candidate,
      expectedHarnessSourceSha256: "c".repeat(64),
    }).valid,
    true,
  );
  writeFileSync(evidencePath, "{\"changed\":true}\n");
  assert.match(
    validateCertificationState({
      state,
      evidenceRoot: root,
      expectedCandidate: candidate,
      expectedHarnessSourceSha256: "c".repeat(64),
    }).issues.join("\n"),
    /evidence doctor hash mismatch/,
  );
}

{
  const base = mkdtempSync(path.join(tmpdir(), "certification-paths-"));
  const sourceRoot = path.join(base, "source");
  const evidenceRoot = path.join(base, "evidence");
  const ownerRoot = path.join(evidenceRoot, "owner");
  const outsideRoot = path.join(base, "outside");
  for (const directory of [sourceRoot, evidenceRoot, ownerRoot, outsideRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  const runtimePath = path.join(ownerRoot, "runtime.json");
  assert.equal(
    resolvePlaywrightReportPath({
      requestedPath: runtimePath,
      repositoryRoot: sourceRoot,
      authorizedExternalRoot: evidenceRoot,
    }).destinationClass,
    "external-evidence-root",
    "repository-relative-only rejection of a safe external path must not recur",
  );
  const owner = REQUIRED_BROWSER_OWNERS[0];
  const ownerPath = path.join(ownerRoot, "owner.json");
  assert.equal(
    resolveRequiredTestReportPath({
      requestedPath: ownerPath,
      repositoryRoot: sourceRoot,
      gateId: owner.gateId,
      authorizedExternalRoot: evidenceRoot,
    }).outputPath,
    ownerPath,
  );
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: undefined,
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /is required/,
  );
  const missingPlaywrightEnvironment = {};
  assert.throws(
    () =>
      resolvePlaywrightReportPath({
        requestedPath:
          missingPlaywrightEnvironment.PLAYWRIGHT_JSON_OUTPUT_FILE,
        repositoryRoot: sourceRoot,
        authorizedExternalRoot: evidenceRoot,
      }),
    /is required/,
  );
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: path.join(outsideRoot, "outside.json"),
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /beneath the authorized external evidence root/,
  );
  writeFileSync(ownerPath, "{}\n");
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: ownerPath,
        repositoryRoot: sourceRoot,
        gateId: owner.gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /must not already exist/,
  );
  coveredRegressionIds.add(4);
  coveredRegressionIds.add(5);
  coveredRegressionIds.add(6);
}

{
  const base = mkdtempSync(
    path.join(tmpdir(), "certification-browser-output-ownership-"),
  );
  const sourceRoot = path.join(base, "source");
  const evidenceRoot = path.join(base, "evidence");
  const reportParent = path.join(evidenceRoot, "browser-reports/floor-plan-upload");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(reportParent, { recursive: true });
  const reportPath = path.join(reportParent, "playwright.json");
  const gateId = "ci.floor-plan-upload-accessibility";
  const identity = {
    certificationId: "certification-browser-output-0001",
    candidateId: "candidate-browser-output-0001",
    sourceCommitSha: "a".repeat(40),
    sourceTreeSha: "b".repeat(40),
    browserOwnerId: "floor-plan-upload",
    gateId,
    stageAttempt: 1,
    runNonce: "browser-output-run-nonce-0001",
  };
  const resolve = (
    browserRunIdentity = identity,
    processIdentity = { pid: 1001, ppid: 1000 },
  ) =>
    resolveRequiredTestReportPath({
      requestedPath: reportPath,
      repositoryRoot: sourceRoot,
      gateId,
      authorizedExternalRoot: evidenceRoot,
      browserRunIdentity,
      processIdentity,
    });

  const preflight = resolveRequiredTestReportPath({
    requestedPath: reportPath,
    repositoryRoot: sourceRoot,
    gateId,
    authorizedExternalRoot: evidenceRoot,
  });
  assert.equal(existsSync(preflight.outputDirectory), false);
  assert.equal(preflight.outputAuthorization, null);

  const claimed = resolve();
  assert.equal(claimed.outputAuthorization.status, "claimed");
  assert.equal(existsSync(claimed.outputRoot), true);
  assert.equal(existsSync(claimed.outputDirectory), false);
  assert.equal(existsSync(claimed.outputAuthorization.authorizationPath), true);
  assert.equal(
    path.dirname(claimed.outputAuthorization.authorizationPath),
    claimed.outputRoot,
  );

  assert.equal(resolve().outputAuthorization.status, "same-process-reentry");
  mkdirSync(path.join(claimed.outputDirectory, ".playwright-artifacts-0"), {
    recursive: true,
  });
  assert.equal(
    resolve(identity, { pid: 1002, ppid: 1001 }).outputAuthorization.status,
    "same-run-worker-reentry",
  );
  assert.equal(
    resolve(identity, { pid: 1003, ppid: 1001 }).outputAuthorization.status,
    "same-run-worker-reentry",
  );

  for (const [name, value] of [
    ["browserOwnerId", "foreign-owner"],
    ["stageAttempt", 2],
    ["runNonce", "browser-output-run-nonce-foreign"],
    ["candidateId", "candidate-browser-output-foreign"],
    ["certificationId", "certification-browser-output-foreign"],
    ["sourceCommitSha", "c".repeat(40)],
    ["sourceTreeSha", "d".repeat(40)],
  ]) {
    assert.throws(
      () => resolve({ ...identity, [name]: value }, { pid: 1004, ppid: 1001 }),
      /stale or foreign/,
      `foreign ${name} must not reuse the claimed output directory`,
    );
  }
  assert.throws(
    () => resolve(identity, { pid: 2002, ppid: 2001 }),
    /stale or foreign/,
    "a separate process tree must not reuse an active output claim",
  );
  const foreignEntryPath = path.join(claimed.outputRoot, "foreign.txt");
  writeFileSync(foreignEntryPath, "foreign\n");
  assert.throws(
    () => resolve(identity, { pid: 1004, ppid: 1001 }),
    /contains foreign files/,
    "foreign files raced into an active output claim must be rejected",
  );
  unlinkSync(foreignEntryPath);

  const completionMarkerPath = path.join(
    evidenceRoot,
    "browser-owners/floor-plan-upload/discovery-start.json",
  );
  mkdirSync(path.dirname(completionMarkerPath), { recursive: true });
  assert.equal(
    resolveRequiredTestStartMarkerPath({
      requestedPath: completionMarkerPath,
      repositoryRoot: sourceRoot,
      gateId,
      authorizedExternalRoot: evidenceRoot,
      outputAuthorization: claimed.outputAuthorization,
    }).reentryStatus,
    "initial",
  );
  const completionReporter = new CertificationPlaywrightStartReporter({
    markerPath: completionMarkerPath,
    boundary: "discovery",
    gateId,
    outputAuthorizationPath: claimed.outputAuthorization.authorizationPath,
    outputCompletionPath: claimed.outputAuthorization.completionPath,
    outputAuthorizationSha256: claimed.outputAuthorization.sha256,
  });
  completionReporter.onBegin(null, { allTests: () => [{}, {}] });
  const executionBoundaryProjects = [];
  for (const [index, project] of ["chromium", "webkit"].entries()) {
    const workerReentry = resolve(identity, {
      pid: 1005 + index,
      ppid: 1001,
    });
    assert.equal(
      resolveRequiredTestStartMarkerPath({
        requestedPath: completionMarkerPath,
        repositoryRoot: sourceRoot,
        gateId,
        authorizedExternalRoot: evidenceRoot,
        outputAuthorization: workerReentry.outputAuthorization,
      }).reentryStatus,
      "same-run-worker-reentry",
    );
    executionBoundaryProjects.push(project);
  }
  assert.deepEqual(executionBoundaryProjects, ["chromium", "webkit"]);
  completionReporter.onEnd({ status: "passed" });
  const completion = JSON.parse(
    readFileSync(claimed.outputAuthorization.completionPath, "utf8"),
  );
  assert.equal(completion.status, "completed");
  assert.equal(completion.authorizationSha256, claimed.outputAuthorization.sha256);
  assert.throws(() => resolve(), /completed or stale/);

  const precreatedRoot = path.join(evidenceRoot, "operator-precreated");
  mkdirSync(precreatedRoot, { recursive: true });
  const precreatedReportPath = path.join(precreatedRoot, "playwright.json");
  const precreatedOutput = path.join(
    precreatedRoot,
    `${gateId}-playwright-output`,
  );
  mkdirSync(precreatedOutput);
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: precreatedReportPath,
        repositoryRoot: sourceRoot,
        gateId,
        authorizedExternalRoot: evidenceRoot,
        browserRunIdentity: identity,
        processIdentity: { pid: 3001, ppid: 3000 },
      }),
    /missing or unreadable/,
  );
  writeFileSync(path.join(precreatedOutput, "foreign.txt"), "foreign\n");
  assert.throws(
    () =>
      resolveRequiredTestReportPath({
        requestedPath: precreatedReportPath,
        repositoryRoot: sourceRoot,
        gateId,
        authorizedExternalRoot: evidenceRoot,
      }),
    /must not already exist/,
  );
}

{
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-start-markers-"),
  );
  const discoveryPath = path.join(evidenceRoot, "browser/discovery.json");
  mkdirSync(path.dirname(discoveryPath), { recursive: true });
  const discoveryReporter = new CertificationPlaywrightStartReporter({
    markerPath: discoveryPath,
    boundary: "discovery",
    gateId: "ci.test-browser-owner",
  });
  discoveryReporter.onBegin(null, { allTests: () => [{}, {}] });
  assert.deepEqual(JSON.parse(readFileSync(discoveryPath, "utf8")), {
    schema: "interior-ai.production-certification-playwright-start.v1",
    boundary: "discovery",
    gateId: "ci.test-browser-owner",
    discoveredTestCount: 2,
  });

  const runtimePath = path.join(evidenceRoot, "runtime/start.json");
  mkdirSync(path.dirname(runtimePath), { recursive: true });
  const runtimeReporter = new CertificationPlaywrightStartReporter({
    markerPath: runtimePath,
    boundary: "test-begin",
    gateId: "ci.production-runtime-smoke",
  });
  runtimeReporter.onBegin(null, { allTests: () => [{}] });
  assert.equal(existsSync(runtimePath), false);
  runtimeReporter.onTestBegin(
    { title: "runtime product assertion", parent: {} },
    { retry: 0 },
  );
  assert.equal(
    JSON.parse(readFileSync(runtimePath, "utf8")).boundary,
    "test-begin",
  );

  const staleMarker = path.join(evidenceRoot, "browser-owner/stale.json");
  mkdirSync(path.dirname(staleMarker), { recursive: true });
  writeFileSync(staleMarker, "{}\n");
  assert.throws(
    () => absentEvidenceTarget(evidenceRoot, "browser-owner/stale.json"),
    /must be absent/,
    "a stale browser start marker must fail before discovery without consumption",
  );
  rmSync(evidenceRoot, { recursive: true, force: true });
}

{
  for (const [stage, classification] of [
    ["build-snapshot", "BUILD_FAILURE"],
    ["archive-preflight-snapshot", "ARCHIVE_FAILURE"],
    ["archive-snapshot", "ARCHIVE_FAILURE"],
    ["extracted-archive-snapshot", "ARCHIVE_FAILURE"],
    ["phase8", "PERFORMANCE_GATE_FAILURE"],
    ["runtime-smoke", "FINAL_EVIDENCE_FAILURE"],
    ["browser-owners", "FINAL_EVIDENCE_FAILURE"],
  ]) {
    const failure = certificationStageFailure(
      new Error(`${stage} post-boundary evidence processing failed`),
      { consumed: true, classification },
    );
    assert.equal(failure.consumed, true);
    assert.equal(failure.classification, classification);
    assert.match(failure.message, /post-boundary evidence processing failed/);
  }
}

{
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-final-extraction-"),
  );
  const extracted = path.join(evidenceRoot, "archive/extracted");
  const alternate = path.join(evidenceRoot, "archive/staged");
  mkdirSync(extracted, { recursive: true });
  mkdirSync(alternate, { recursive: true });
  assert.equal(assertCanonicalExtractedArchiveRoot(evidenceRoot), extracted);
  assert.throws(
    () => assertCanonicalExtractedArchiveRoot(evidenceRoot, alternate),
    /requires the canonical extracted archive/,
  );
  rmSync(extracted, { recursive: true });
  symlinkSync(alternate, extracted, "dir");
  assert.throws(
    () => assertCanonicalExtractedArchiveRoot(evidenceRoot),
    /physical directory/,
  );
  rmSync(evidenceRoot, { recursive: true, force: true });
}

{
  const closure = deriveProductionVerifierClosure(repositoryRoot);
  assert.ok(closure.files.length > 9);
  assert.ok(closure.edges.some((edge) => edge.kind === "local"));
  assert.equal(closure.missingImports.length, 0);
  assert.equal(closure.sourceWorktreeFallback, false);
  const fixture = mkdtempSync(path.join(tmpdir(), "certification-closure-"));
  for (const file of closure.files) {
    const destination = path.join(fixture, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(repositoryRoot, file.path), destination);
  }
  const removable = closure.edges.find(
    (edge) => edge.kind === "local" && edge.resolution.endsWith(".mjs"),
  );
  rmSync(path.join(fixture, removable.resolution));
  assert.throws(
    () => deriveProductionVerifierClosure(fixture),
    /verifier (?:source|local import) is missing/,
    "a missing transitive verifier dependency must fail closed",
  );
  const resolverSource = readFileSync("scripts/production-verifier-closure.mjs", "utf8");
  assert.doesNotMatch(resolverSource, /import\.meta\.resolve\s*\(/);
  coveredRegressionIds.add(12);
  coveredRegressionIds.add(13);
  coveredRegressionIds.add(14);
}

{
  const artifactContract = readFileSync("scripts/production-artifact-contract.mjs", "utf8");
  const artifactOwner = readFileSync("scripts/production-artifact-evidence.mjs", "utf8");
  const archiveOwner = readFileSync("scripts/production-archive.mjs", "utf8");
  const finalOwner = readFileSync("scripts/production-certification-evidence.mjs", "utf8");
  const historicalFinalOwner = readFileSync(
    "scripts/production-certification-historical-evidence.mjs",
    "utf8",
  );
  const timingOwner = readFileSync("scripts/runtime-smoke-phase-budget.mjs", "utf8");
  const phase8Owner = readFileSync("scripts/run-phase8-project-benchmark.ts", "utf8");
  assert.match(artifactContract, /production-artifact-evidence\.v3/);
  assert.doesNotMatch(artifactContract, /production-artifact-evidence\.v2/);
  assert.match(
    artifactContract,
    /validateCurrentProductionEvidenceSemanticJournal/,
  );
  assert.match(
    artifactOwner,
    /validateCurrentProductionEvidenceSemanticJournal/,
  );
  assert.match(finalOwner, /validateCurrentProductionEvidenceManifest/);
  assert.match(finalOwner, /PRODUCTION_EVIDENCE_JOURNAL_VERSION/);
  assert.doesNotMatch(finalOwner, /semanticJournalVersion\s*!==\s*1/);
  assert.doesNotMatch(finalOwner, /journalIdentity\?\.version\s*!==\s*1/);
  assert.doesNotMatch(
    finalOwner,
    /HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION/,
  );
  assert.match(
    historicalFinalOwner,
    /HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION = 1/,
  );
  assert.match(
    timingOwner,
    /semanticJournalVersion: PRODUCTION_EVIDENCE_JOURNAL_VERSION/,
  );
  assert.doesNotMatch(archiveOwner, /semantic-journal-v1/);
  assert.match(artifactOwner, /testPolicy: "external-certification-required"/);
  assert.doesNotMatch(artifactOwner, /requireTests:\s*false/);
  assert.match(artifactOwner, /verifyFinalCertificationEvidence/);
  for (const marker of ["phase8", "runtime-smoke", "browser:"]) {
    assert.ok(finalOwner.includes(marker), `final verifier must bind ${marker}`);
  }
  const continuityOwner = readFileSync(
    "scripts/production-certification-source-continuity.mjs",
    "utf8",
  );
  assert.match(continuityOwner, /rehashPhysicalRoot: true/);
  assert.match(continuityOwner, /measureFinalContinuity/);
  const realRunner = readFileSync("scripts/production-certification-real.mjs", "utf8");
  const stateOwner = readFileSync("scripts/production-certification-state.mjs", "utf8");
  const simulationOwner = readFileSync(
    "scripts/production-certification-simulation.mjs",
    "utf8",
  );
  const projectorOwner = readFileSync(
    "scripts/production-certification-stage-environment.mjs",
    "utf8",
  );
  const stageEnvironmentRegressionOwner = readFileSync(
    "scripts/test-production-certification-stage-environment.mjs",
    "utf8",
  );
  const stageEnvironmentMatrix = JSON.parse(
    readFileSync(
      "docs/qa/production-certification-stage-environment.v2.json",
      "utf8",
    ),
  );
  const playwrightOwner = readFileSync("playwright.config.ts", "utf8");
  assert.match(realRunner, /sourceValidationStageEvidence/);
  assert.match(realRunner, /schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA/);
  assert.match(realRunner, /version: PRODUCTION_EVIDENCE_JOURNAL_VERSION/);
  assert.match(realRunner, /captureArtifactSnapshot/);
  assert.match(realRunner, /measureFinalContinuity/);
  for (const marker of [
    "consumptionProbe: () => buildConsumed",
    "consumptionProbe: () => archivePreflightConsumed",
    "consumptionProbe: () => archiveConsumed",
    "consumptionProbe: () => extractionConsumed",
  ]) {
    assert.ok(
      realRunner.includes(marker),
      `post-boundary snapshot adaptation must retain ${marker}`,
    );
  }
  assert.doesNotMatch(realRunner, /production-certification-source-identity\.v1/);
  assert.doesNotMatch(
    realRunner,
    /\.map\(\(name\) => \[name, state\.bindings\.artifactSha256\]\)/,
  );
  assert.match(stateOwner, /readAndValidateSourceEvidence/);
  assert.match(stateOwner, /readAndValidateContinuityEvidence/);
  assert.match(
    realRunner,
    /sourceValidationSha256:[\s\S]*finalStandaloneSha256:[\s\S]*continuitySha256:/,
  );
  assert.match(simulationOwner, /acceptedForRealCandidate: false/);
  assert.doesNotMatch(stateOwner, /forcePass|manualPass|overridePass/);
  assert.match(finalOwner, /deterministic simulation evidence cannot certify a real candidate/);
  assert.match(archiveOwner, /verify-archive-preflight/);
  assert.match(archiveOwner, /deterministicArchive/);
  assert.doesNotMatch(archiveOwner, /\btee\b|data:text\/javascript|\beval\s*\(/);
  assert.match(phase8Owner, /PHASE8_EXTERNAL_EVIDENCE_ROOT/);
  assert.match(phase8Owner, /CERTIFICATION_EVIDENCE_ROOT/);
  assert.match(continuityOwner, /projectCertificationChildEnvironment/);
  assert.match(continuityOwner, /environmentProfileHashes/);
  assert.match(realRunner, /stageChildEnvironment/);
  assert.match(projectorOwner, /strip-and-record/);
  assert.match(projectorOwner, /strippedUnknownCertificationControlVariables/);
  assert.match(projectorOwner, /valuePolicySha256/);
  assert.match(projectorOwner, /prohibitedAmbientValueAbsence/);
  assert.match(archiveOwner, /profileId: "archive-verifier"/);
  assert.match(artifactOwner, /profileId: "artifact-product-server"/);
  assert.match(stageEnvironmentRegressionOwner, /sourceValidationStageEvidence/);
  assert.match(
    stageEnvironmentRegressionOwner,
    /Historical real-runner leakage reproduction passed/,
  );
  assert.match(
    stageEnvironmentRegressionOwner,
    /Production certification runtime evidence-root regression passed/,
    "Production certification runtime evidence-root regression passed",
  );
  assert.match(realRunner, /preflightRuntimeSmokeEvidenceOutputs/);
  assert.match(realRunner, /createRuntimeSmokeTimingEvidenceBinding/);
  assert.match(
    stageEnvironmentRegressionOwner,
    /npm run test:production-artifact-evidence/,
  );
  assert.doesNotMatch(
    `${realRunner}\n${continuityOwner}`,
    /delete\s+process\.env\./,
    "certification children must not use check-specific process.env deletion",
  );
  assert.equal(
    stageEnvironmentMatrix.profiles["source-validation"].parentOnlyVariables.includes(
      "CERTIFICATION_EVIDENCE_ROOT",
    ),
    true,
  );
  assert.equal(
    stageEnvironmentMatrix.profiles["source-validation"].childVisibleVariables.includes(
      "CERTIFICATION_EVIDENCE_ROOT",
    ),
    false,
  );
  assert.match(playwrightOwner, /certificationEnvironmentStage === "runtime-smoke"/);
  assert.match(
    playwrightOwner,
    /certification runtime smoke requires its product-test start marker/,
  );
  assert.doesNotMatch(
    playwrightOwner,
    /productionArtifactEvidence\s*&&\s*process\.env\[CERTIFICATION_EVIDENCE_ROOT\]/,
    "generic evidence-root ownership must not activate runtime smoke",
  );

  let malformedArchiveOutputConsumed = false;
  assert.throws(
    () =>
      parseCertificationChildJson("not-json\n", "archive fixture", {
        consumed: true,
        onConsumed: () => {
          malformedArchiveOutputConsumed = true;
        },
      }),
    /did not emit sealed JSON/,
    "a successful consumed child with malformed output must fail adaptation",
  );
  assert.equal(
    malformedArchiveOutputConsumed,
    true,
    "consumption must be retained before successful child output is parsed",
  );

  const contractFixtureRoot = mkdtempSync(
    path.join(tmpdir(), "certification-source-command-contract-"),
  );
  const contractFixturePath = path.join(
    contractFixtureRoot,
    "docs/qa/production-certification-contract.v1.json",
  );
  mkdirSync(path.dirname(contractFixturePath), { recursive: true });
  cpSync(
    "docs/qa/production-certification-stage-environment.v2.json",
    path.join(
      contractFixtureRoot,
      "docs/qa/production-certification-stage-environment.v2.json",
    ),
  );
  const contractMatrix = JSON.parse(
    readFileSync("docs/qa/production-certification-contract.v1.json", "utf8"),
  );
  const weakerInvocation = structuredClone(contractMatrix);
  weakerInvocation.sourceValidation.checks[0].executable = "node";
  weakerInvocation.sourceValidation.checks[0].args = [
    "scripts/check-design-page-architecture.mjs",
  ];
  writeFileSync(contractFixturePath, JSON.stringify(weakerInvocation));
  assert.throws(
    () => sourceValidationCheckSet(contractFixtureRoot),
    /check contract is malformed/,
    "a strong displayed command cannot own weaker executable arguments",
  );
  const wrapperInvocation = structuredClone(contractMatrix);
  wrapperInvocation.sourceValidation.checks[0].canonicalCommand =
    "sh -c producer | tee output.log";
  wrapperInvocation.sourceValidation.checks[0].executable = "sh";
  wrapperInvocation.sourceValidation.checks[0].args = [
    "-c",
    "producer | tee output.log",
  ];
  writeFileSync(contractFixturePath, JSON.stringify(wrapperInvocation));
  assert.throws(
    () => sourceValidationCheckSet(contractFixtureRoot),
    /check contract is malformed/,
    "shell and tee wrappers cannot become the canonical source owner",
  );
  rmSync(contractFixtureRoot, { recursive: true, force: true });
}

{
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const source = readFileSync(owner.config, "utf8");
    assert.match(source, /requiredTestPlaywrightEvidence/);
    assert.doesNotMatch(source, /must remain repository-relative/);
    assert.ok(source.includes(owner.gateId));
    assert.ok(source.includes(`expectedBrowserOwnerId: "${owner.id}"`));
  }
  assert.equal(new Set(REQUIRED_BROWSER_OWNERS.map((owner) => owner.id)).size, 7);
  const proVisualOwner = REQUIRED_BROWSER_OWNERS.find(
    (owner) => owner.id === "pro-visual",
  );
  assert.ok(proVisualOwner);
  assert.equal(proVisualOwner.productionServer, true);
  assert.equal(
    stageWorktreeRole("browser-owners", proVisualOwner.id),
    "final-artifact",
  );
  assert.match(
    readFileSync(proVisualOwner.config, "utf8"),
    /command: useProductionServer \? "npm run start" : "npm run dev"/,
  );
  const cartOwner = REQUIRED_BROWSER_OWNERS.find((owner) => owner.id === "cart");
  assert.ok(cartOwner);
  assert.equal(cartOwner.productionServer, false);
  assert.equal(stageWorktreeRole("browser-owners", cartOwner.id), "development-browser");
  const cartConfig = readFileSync(cartOwner.config, "utf8");
  assert.match(cartConfig, /command: "npm run dev"/);
  assert.match(cartConfig, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(cartConfig, /timeout: 120_000/);
  assert.match(cartConfig, /retries: 0/);
}

{
  const owner = REQUIRED_BROWSER_OWNERS.find((candidate) => candidate.id === "cart");
  assert.ok(owner);
  const fixtureNonce = "7".repeat(32);
  const fixtureClientId =
    `123456789012345-gate-a3-ci-${fixtureNonce}.apps.googleusercontent.com`;
  const fixtureClientSecret = `GOCSPX-gate-a3-ci-${fixtureNonce}`;
  const fixtureParent = mkdtempSync(
    path.join(tmpdir(), "certification-browser-auth-fixture-"),
  );
  const fixtureSessionEnvironment = {
    CI_AUTH_FIXTURE_SESSION_ROOT: path.join(fixtureParent, "session"),
    CI_AUTH_FIXTURE_SESSION_ID: "browser-fixture-session-0001",
    CI_AUTH_FIXTURE_SESSION_NONCE: "browser-fixture-nonce-0001",
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidate.commitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidate.treeSha,
  };
  const fixtureSession = authFixtureSession.publishFixtureSession({
    repositoryRoot,
    environment: fixtureSessionEnvironment,
    fixture: {
      googleClientId: fixtureClientId,
      googleClientSecret: fixtureClientSecret,
    },
  });
  const contextEnvironment = {
    ...fixtureSessionEnvironment,
    ...fixtureSession.assignments,
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: candidate.commitSha,
    CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: candidate.treeSha,
    CERTIFICATION_QUALIFICATION_MODE: "1",
    NODE_ENV: "staging",
    VERCEL_ENV: "preview",
    DATABASE_URL:
      "postgresql://fixture:a6e2c8f4b9d10573a6e2c8f4b9d10573@127.0.0.1:5432/fixture",
    REQUIRED_TEST_SOURCE_COMMIT_SHA: "0".repeat(40),
    REQUIRED_TEST_SOURCE_TREE_SHA: "1".repeat(40),
  };
  delete contextEnvironment.GOOGLE_CLIENT_ID;
  delete contextEnvironment.GOOGLE_CLIENT_SECRET;
  assert.equal(Object.hasOwn(contextEnvironment, "GOOGLE_CLIENT_ID"), false);
  assert.equal(Object.hasOwn(contextEnvironment, "GOOGLE_CLIENT_SECRET"), false);
  const environment = browserEnvironment(
    {
      environment: contextEnvironment,
      evidenceRoot: "/external/certification-evidence",
    },
    {
      certificationId: "certification-test-run",
      executionClass: "deterministic-simulation",
      candidate,
      harness: { version: 1, sourceSha256: "c".repeat(64) },
      bindings: {
        artifactSha256: "d".repeat(64),
        nextBuildId: "build-id",
      },
      stages: {
        "browser-owners": { attempts: [{ number: 1 }] },
      },
    },
    owner,
    "/external/certification-evidence/report.json",
    "/external/certification-evidence/evidence.json",
    "/external/certification-evidence/start.json",
    "browser-run-nonce-0001",
  );
  assert.equal(environment.REQUIRED_TEST_SOURCE_COMMIT_SHA, candidate.commitSha);
  assert.equal(environment.REQUIRED_TEST_SOURCE_TREE_SHA, candidate.treeSha);
  assert.equal(environment.APP_ENV, owner.applicationEnvironment);
  assert.equal(environment.NEXT_PUBLIC_APP_ENV, owner.applicationEnvironment);
  assert.equal(environment.NODE_ENV, "development");
  assert.equal(environment.VERCEL_ENV, undefined);
  assert.equal(environment.PRODUCTION_CERTIFICATION_ID, "certification-test-run");
  assert.equal(environment.REQUIRED_TEST_BROWSER_OWNER_ID, owner.id);
  assert.equal(environment.REQUIRED_TEST_STAGE_ATTEMPT, "1");
  assert.equal(environment.REQUIRED_TEST_RUN_NONCE, "browser-run-nonce-0001");
  for (const name of [
    "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA",
    "CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA",
    "CI_AUTH_FIXTURE_LOCAL_TEST",
    "CI_AUTH_FIXTURE_MODE",
    "CI_AUTH_FIXTURE_NO_REGENERATION",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_ID_SHA256",
    "CI_AUTH_FIXTURE_PROVIDER_CLIENT_SECRET_SHA256",
    "CI_AUTH_FIXTURE_SESSION_CLASSIFICATION",
    "CI_AUTH_FIXTURE_SESSION_ID",
    "CI_AUTH_FIXTURE_SESSION_NONCE",
  ]) {
    assert.equal(typeof environment[name], "string", `${name} must be projected`);
  }
  assert.equal(environment.CI_AUTH_FIXTURE_SESSION_ROOT, undefined);
  assert.equal(
    authFixtureSession.validateProjectedFixtureEnvironment(environment, {
      commitSha: candidate.commitSha,
      treeSha: candidate.treeSha,
    }).noRegenerationProof,
    "passed",
  );
  coveredRegressionIds.add(43);
  assert.throws(
    () =>
      browserEnvironment(
        {
          environment: {
            GOOGLE_CLIENT_ID: fixtureClientId,
            GOOGLE_CLIENT_SECRET: fixtureClientSecret,
          },
          evidenceRoot: "/external/certification-evidence",
        },
        {
          certificationId: "certification-test-run",
          executionClass: "real-candidate",
          candidate,
          harness: { version: 1, sourceSha256: "c".repeat(64) },
          bindings: {
            artifactSha256: "d".repeat(64),
            nextBuildId: "build-id",
          },
          stages: { "browser-owners": { attempts: [{ number: 1 }] } },
        },
        owner,
        "/external/certification-evidence/report.json",
        "/external/certification-evidence/evidence.json",
        "/external/certification-evidence/start.json",
        "browser-run-nonce-0001",
      ),
    /requires the canonical auth fixture session/,
  );
  assert.throws(
    () =>
      browserEnvironment(
        {
          environment: {
            ...contextEnvironment,
            CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: "f".repeat(40),
          },
          evidenceRoot: "/external/certification-evidence",
        },
        {
          certificationId: "certification-test-run",
          executionClass: "deterministic-simulation",
          candidate,
          harness: { version: 1, sourceSha256: "c".repeat(64) },
          bindings: {
            artifactSha256: "d".repeat(64),
            nextBuildId: "build-id",
          },
          stages: { "browser-owners": { attempts: [{ number: 1 }] } },
        },
        owner,
        "/external/certification-evidence/report.json",
        "/external/certification-evidence/evidence.json",
        "/external/certification-evidence/start.json",
        "browser-run-nonce-0001",
      ),
    /ambient candidate override/,
  );
  assert.throws(
    () =>
      browserEnvironment(
        {
          environment: {
            ...contextEnvironment,
            GOOGLE_CLIENT_SECRET: "operator-browser-provider-override",
          },
          evidenceRoot: "/external/certification-evidence",
        },
        {
          certificationId: "certification-test-run",
          executionClass: "deterministic-simulation",
          candidate,
          harness: { version: 1, sourceSha256: "c".repeat(64) },
          bindings: {
            artifactSha256: "d".repeat(64),
            nextBuildId: "build-id",
          },
          stages: { "browser-owners": { attempts: [{ number: 1 }] } },
        },
        owner,
        "/external/certification-evidence/report.json",
        "/external/certification-evidence/evidence.json",
        "/external/certification-evidence/start.json",
        "browser-run-nonce-0001",
      ),
    /missing or overridden parent provider value/,
  );
  assert.throws(
    () =>
      browserEnvironment(
        {
          environment: {
            ...contextEnvironment,
            DATABASE_URL: undefined,
          },
          evidenceRoot: "/external/certification-evidence",
        },
        {
          certificationId: "certification-test-run",
          executionClass: "deterministic-simulation",
          candidate,
          harness: { version: 1, sourceSha256: "c".repeat(64) },
          bindings: {
            artifactSha256: "d".repeat(64),
            nextBuildId: "build-id",
          },
          stages: { "browser-owners": { attempts: [{ number: 1 }] } },
        },
        owner,
        "/external/certification-evidence/report.json",
        "/external/certification-evidence/evidence.json",
        "/external/certification-evidence/start.json",
        "browser-run-nonce-0001",
      ),
    /requires DATABASE_URL/,
  );
  rmSync(fixtureParent, { recursive: true, force: true });
}

{
  const missingEnvironment = {
    DATABASE_URL: "not-a-database-url",
    APP_ORIGIN: "credential://unsafe",
    CERTIFICATION_EXPECTED_COMMIT_SHA: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim(),
    CERTIFICATION_EXPECTED_TREE_SHA: "e".repeat(40),
    CERTIFICATION_EXPECTED_PARENT_SHA: spawnSync("git", ["rev-parse", "HEAD^"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).stdout.trim(),
    CERTIFICATION_UNKNOWN_DOCTOR_CAPABILITY: "synthetic-doctor-secret-never-print",
  };
  const doctor = await runCertificationDoctor({
    repositoryRoot,
    environment: missingEnvironment,
  });
  assert.equal(doctor.valid, false);
  assert.ok(doctor.issues.length >= 5, "doctor must report every pre-consumption gap");
  assert.doesNotMatch(
    JSON.stringify(doctor),
    /not-a-database-url|credential:\/\/unsafe|synthetic-doctor-secret-never-print/,
  );
  assert.match(doctor.issues.join("\n"), /candidate-id/);
  assert.match(doctor.issues.join("\n"), /source tree does not match/);
  assert.match(doctor.issues.join("\n"), /CERTIFICATION_UNKNOWN_DOCTOR_CAPABILITY/);
  coveredRegressionIds.add(1);
  coveredRegressionIds.add(2);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "certification-file-owner-"));
  writeFileSync(path.join(root, "owner.mjs"), "export default 'data:text/javascript,pass';\n");
  assert.throws(
    () => assertFileBackedOwner(root, "owner.mjs"),
    /data URL, eval, or stdin execution/,
  );
  rmSync(root, { recursive: true, force: true });
  coveredRegressionIds.add(11);
}

{
  const regressions = JSON.parse(
    readFileSync("scripts/production-certification-regressions.json", "utf8"),
  );
  assert.equal(regressions.cases.length, 43);
  assert.deepEqual(
    regressions.cases.map((entry) => entry.id),
    Array.from({ length: 43 }, (_, index) => index + 1),
  );
  assert.equal(new Set(regressions.cases.map((entry) => entry.defect)).size, 43);
  assert.equal(regressions.authPreflightDatabaseCases.length, 38);
  assert.equal(new Set(regressions.authPreflightDatabaseCases).size, 38);
  coveredRegressionIds.add(40);
  coveredRegressionIds.add(35);
  coveredRegressionIds.add(37);
  coveredRegressionIds.add(42);
  assert.equal(regressions.nestedAuthFixtureIsolationCases.length, 13);
  assert.equal(new Set(regressions.nestedAuthFixtureIsolationCases).size, 13);
  assert.equal(regressions.stageResultCases.length, 24);
  assert.equal(new Set(regressions.stageResultCases).size, 24);
  coveredRegressionIds.add(36);
  assert.equal(regressions.dependencyLifecycleCases.length, 26);
  assert.equal(new Set(regressions.dependencyLifecycleCases).size, 26);
  assert.equal(regressions.runtimeEvidenceRootCases.length, 21);
  assert.equal(new Set(regressions.runtimeEvidenceRootCases).size, 21);
  assert.equal(regressions.sourceValidationCases.length, 23);
  assert.equal(new Set(regressions.sourceValidationCases).size, 23);
  assert.equal(regressions.generatedOutputCases.length, 26);
  assert.equal(new Set(regressions.generatedOutputCases).size, 26);
  assert.equal(regressions.continuityCases.length, 23);
  assert.equal(new Set(regressions.continuityCases).size, 23);
}

{
  const configEvidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-config-list-"),
  );
  const commitSha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const treeSha = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const harnessSha256 = harnessSourceIdentity(repositoryRoot).sha256;
  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) {
      if (name.startsWith("REQUIRED_TEST_")) delete environment[name];
    }
    environment.APP_ENV = owner.applicationEnvironment;
    environment.NEXT_PUBLIC_APP_ENV = owner.applicationEnvironment;
    environment.CI = "true";
    delete environment.VERCEL_ENV;
    delete environment.PLAYWRIGHT_RELEASE_BASE_URL;
    environment.DATABASE_URL ||=
      "postgresql://list:b5f1d7a3c9e60482b5f1d7a3c9e60482@127.0.0.1:5432/list";
    if (owner.productionServer) environment.PLAYWRIGHT_USE_PRODUCTION_SERVER = "1";
    else delete environment.PLAYWRIGHT_USE_PRODUCTION_SERVER;
    if (owner.id === "public-share") environment.CATALOG_STRICT_VALIDATION = "true";
    else delete environment.CATALOG_STRICT_VALIDATION;
    const ownerRoot = path.join(configEvidenceRoot, owner.id);
    mkdirSync(ownerRoot);
    environment.CERTIFICATION_EVIDENCE_ROOT = configEvidenceRoot;
    environment.PRODUCTION_CERTIFICATION_ID = "config-list-certification";
    environment.REQUIRED_TEST_GATE_ID = owner.gateId;
    environment.REQUIRED_TEST_BROWSER_OWNER_ID = owner.id;
    environment.REQUIRED_TEST_STAGE_ATTEMPT = "1";
    environment.REQUIRED_TEST_RUN_NONCE = `config-list-${owner.id}-nonce`;
    environment.REQUIRED_TEST_REPORT_PATH = path.join(ownerRoot, "playwright.json");
    environment.REQUIRED_TEST_SOURCE_COMMIT_SHA = commitSha;
    environment.REQUIRED_TEST_SOURCE_TREE_SHA = treeSha;
    environment.REQUIRED_TEST_ARTIFACT_SHA256 = "a".repeat(64);
    environment.REQUIRED_TEST_BUILD_ID = "config-list-build";
    environment.REQUIRED_TEST_RELEASE_CANDIDATE_ID = "config-list-candidate";
    environment.REQUIRED_TEST_RELEASE_ENVIRONMENT = owner.applicationEnvironment;
    environment.REQUIRED_TEST_HARNESS_VERSION = "1";
    environment.REQUIRED_TEST_HARNESS_SOURCE_SHA256 = harnessSha256;
    const listed = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", "--config", owner.config, "--list"],
      { cwd: repositoryRoot, env: environment, encoding: "utf8" },
    );
    assert.equal(
      listed.status,
      0,
      `${owner.id} config must list through the real Playwright CLI: ${listed.stderr}`,
    );
    assert.match(listed.stdout, /Total: \d+ tests? in \d+ files?/);
    if (owner.id === "cart") {
      assert.match(
        listed.stdout,
        /\[chromium\].*cart-overlay-accessibility\.spec\.ts/,
      );
      assert.match(
        listed.stdout,
        /\[webkit\].*cart-overlay-accessibility\.spec\.ts/,
      );
    }
    if (owner.id === "pro-visual") {
      assert.match(listed.stdout, /\[chromium\].*pro-visual-policy\.spec\.ts/);
      assert.match(listed.stdout, /\[webkit\].*pro-visual-policy\.spec\.ts/);
    }
  }
  rmSync(configEvidenceRoot, { recursive: true, force: true });
  coveredRegressionIds.add(4);
  coveredRegressionIds.add(41);
}

{
  const floorPlanOwner = REQUIRED_BROWSER_OWNERS.find(
    (owner) => owner.id === "floor-plan-upload",
  );
  assert.ok(floorPlanOwner);
  mkdirSync(path.join(repositoryRoot, ".local"), { recursive: true });
  const fixtureRoot = mkdtempSync(
    path.join(
      repositoryRoot,
      ".local/certification-floor-plan-config-execution-",
    ),
  );
  const evidenceRoot = mkdtempSync(
    path.join(tmpdir(), "certification-floor-plan-config-execution-"),
  );
  const testsRoot = path.join(fixtureRoot, "tests");
  const executionRoot = path.join(evidenceRoot, "execution");
  const reportRoot = path.join(evidenceRoot, "browser-reports/floor-plan-upload");
  const markerRoot = path.join(evidenceRoot, "browser-owners/floor-plan-upload");
  mkdirSync(testsRoot);
  mkdirSync(executionRoot, { recursive: true });
  mkdirSync(reportRoot, { recursive: true });
  mkdirSync(markerRoot, { recursive: true });
  writeFileSync(
    path.join(fixtureRoot, "playwright.config.ts"),
    `import { defineConfig } from "@playwright/test";
import path from "node:path";
import floorPlanConfig from "../../playwright.floor-plan-upload.config";

export default defineConfig({
  ...floorPlanConfig,
  testDir: "./tests",
  testMatch: "execution.spec.ts",
  reporter: floorPlanConfig.reporter?.map(([name, options]) => [
    name.startsWith(".") ? path.resolve(process.cwd(), name) : name,
    options,
  ]),
  webServer: undefined,
});
`,
  );
  writeFileSync(
    path.join(testsRoot, "execution.spec.ts"),
    `import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

test("Floor Plan config reaches worker test execution", async ({}, testInfo) => {
  expect(["chromium", "webkit"]).toContain(testInfo.project.name);
  writeFileSync(
    path.join(
      process.env.FLOOR_PLAN_CONFIG_EXECUTION_ROOT!,
      \`\${testInfo.project.name}.json\`,
    ),
    \`{\"project\":\${JSON.stringify(testInfo.project.name)}}\\n\`,
    { flag: "wx", mode: 0o600 },
  );
});
`,
  );
  const commitSha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const treeSha = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  const execution = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "playwright",
      "test",
      "--config",
      path.join(fixtureRoot, "playwright.config.ts"),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        APP_ENV: floorPlanOwner.applicationEnvironment,
        NEXT_PUBLIC_APP_ENV: floorPlanOwner.applicationEnvironment,
        CI: "true",
        PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_CERTIFICATION_ID: "floor-plan-config-execution-certification",
        REQUIRED_TEST_GATE_ID: floorPlanOwner.gateId,
        REQUIRED_TEST_BROWSER_OWNER_ID: floorPlanOwner.id,
        REQUIRED_TEST_STAGE_ATTEMPT: "1",
        REQUIRED_TEST_RUN_NONCE: "floor-plan-config-execution-nonce",
        REQUIRED_TEST_REPORT_PATH: path.join(reportRoot, "playwright.json"),
        REQUIRED_TEST_START_MARKER_PATH: path.join(
          markerRoot,
          "discovery-start.json",
        ),
        REQUIRED_TEST_SOURCE_COMMIT_SHA: commitSha,
        REQUIRED_TEST_SOURCE_TREE_SHA: treeSha,
        REQUIRED_TEST_ARTIFACT_SHA256: "a".repeat(64),
        REQUIRED_TEST_BUILD_ID: "floor-plan-config-execution-build",
        REQUIRED_TEST_RELEASE_CANDIDATE_ID:
          "floor-plan-config-execution-candidate",
        REQUIRED_TEST_RELEASE_ENVIRONMENT:
          floorPlanOwner.applicationEnvironment,
        REQUIRED_TEST_HARNESS_VERSION: "1",
        REQUIRED_TEST_HARNESS_SOURCE_SHA256:
          harnessSourceIdentity(repositoryRoot).sha256,
        FLOOR_PLAN_CONFIG_EXECUTION_ROOT: executionRoot,
      },
      encoding: "utf8",
    },
  );
  assert.equal(
    execution.status,
    0,
    `Floor Plan Chromium/WebKit config execution probe failed: ${execution.stdout}\n${execution.stderr}`,
  );
  assert.deepEqual(
    ["chromium", "webkit"].map((project) =>
      JSON.parse(readFileSync(path.join(executionRoot, `${project}.json`), "utf8")),
    ),
    [{ project: "chromium" }, { project: "webkit" }],
  );
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(evidenceRoot, { recursive: true, force: true });
}

{
  const pathRoot = mkdtempSync(path.join(tmpdir(), "phase8-path-negative-"));
  const evidenceRoot = path.join(pathRoot, "evidence");
  const outsideRoot = path.join(pathRoot, "outside");
  mkdirSync(evidenceRoot);
  mkdirSync(outsideRoot);
  symlinkSync(outsideRoot, path.join(evidenceRoot, "phase8"));
  const child = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "ts-node",
      "--transpile-only",
      "--compiler-options",
      '{"module":"CommonJS","moduleResolution":"node"}',
      "-r",
      "tsconfig-paths/register",
      "scripts/run-phase8-project-benchmark.ts",
      "--validate-evidence-destination-only",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PHASE8_EXTERNAL_EVIDENCE_ROOT: evidenceRoot,
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(child.status, 0);
  assert.match(`${child.stdout}\n${child.stderr}`, /must be physical/);
  rmSync(pathRoot, { recursive: true, force: true });
  coveredRegressionIds.add(20);
}

{
  const simulation = await runProductionCertificationSimulation({
    cleanupWorktrees: false,
  });
  const base = simulation.simulationRoot;
  assert.equal(
    CURRENT_JOURNAL_V2_FINAL_POSITIVE_PATH,
    "state-v4/manifest-v3/journal-v2/physical-final-standalone",
  );
  assert.equal(simulation.integrationReady, true);
  assert.equal(
    simulation.stageOrder.canonicalOwner,
    "scripts/production-certification-contract.mjs",
  );
  assert.equal(simulation.stageOrder.stageCount, CERTIFICATION_STAGE_ORDER.length);
  assert.equal(simulation.stageOrder.identicalToCanonical, true);
  for (const tamperCase of [
    "missingRealRunnerImportRejected",
    "copiedStageListRejected",
    "reorderedStageListRejected",
    "omittedStageRejected",
    "unknownStageRejected",
    "duplicateStageRejected",
  ]) {
    assert.equal(simulation.tamperCases[tamperCase], true, tamperCase);
  }
  coveredRegressionIds.add(33);
  assert.deepEqual(simulation.sourceDatabaseProjection, {
    actualRealRunnerPath: true,
    parentDatabaseUrlAbsent: true,
    exactLifecycleTargetProjected: true,
    capabilityIsolationPassed: true,
    ambientOverrideRejected: true,
    mismatchedBindingRejected: true,
    staleBindingRejected: true,
    droppedBindingRejected: true,
    rawConnectionMaterialRetained: false,
    regressionPassed: true,
  });
  coveredRegressionIds.add(34);
  assert.equal(
    Object.values(simulation.sourceValidationNestedAuthFixtureRegression).every(
      (value) => value === true,
    ),
    true,
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.selectedOwner,
    "nested-regression-child",
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.historicalConflict,
    "GOOGLE_CLIENT_ID",
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.negativeCases.length,
    13,
  );
  const nestedAuthFixtureRegressions = JSON.parse(
    readFileSync(
      "scripts/production-certification-regressions.json",
      "utf8",
    ),
  ).nestedAuthFixtureIsolationCases;
  assert.deepEqual(
    simulation.authFixtureSession.nestedIsolation.negativeCases,
    nestedAuthFixtureRegressions,
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.capabilityNames.includes(
      "AUTH_SECRET",
    ),
    true,
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.capabilityNames.includes(
      "NEXTAUTH_SECRET",
    ),
    true,
  );
  assert.equal(
    simulation.authFixtureSession.nestedIsolation.rawProviderValuesRecorded,
    false,
  );
  assert.equal(simulation.authFixtureSession.regressionPassed, true);
  coveredRegressionIds.add(38);
  assert.equal(simulation.generatedOutputLifecycle.declaredOutputCount, 2);
  assert.equal(simulation.generatedOutputLifecycle.terminalNodeModulesOnly, true);
  coveredRegressionIds.add(31);
  assert.equal(
    simulation.buildGeneratedOutputLifecycle.realRunnerPassed,
    true,
  );
  assert.equal(
    simulation.buildGeneratedOutputLifecycle.arbitraryIgnoredInputRejected,
    true,
  );
  assert.equal(
    simulation.buildGeneratedOutputLifecycle
      .canonicalIgnoredArtifactsUnchanged,
    true,
  );
  assert.equal(simulation.tamperCases.ambientFeatureFlagLeakageRejected, true);
  coveredRegressionIds.add(27);
  assert.equal(simulation.tamperCases.runtimeRootContractMismatchRejected, true);
  assert.equal(simulation.tamperCases.runtimePathOutsideRootRejected, true);
  assert.equal(simulation.tamperCases.runtimeTimingJournalV1Rejected, true);
  assert.equal(simulation.tamperCases.runtimeEnvelopeJournalV1Rejected, true);
  assert.equal(simulation.tamperCases.runtimeJournalNonceMismatchRejected, true);
  assert.equal(simulation.tamperCases.rawRuntimeReportJournalV1Rejected, true);
  assert.equal(simulation.tamperCases.archivedPhysicalJournalV1Rejected, true);
  assert.equal(simulation.tamperCases.historicalStateSubstitutionRejected, true);
  coveredRegressionIds.add(28);
  assert.equal(simulation.tamperCases.exactStaleNullOrderingRegressionPassed, true);
  assert.equal(simulation.tamperCases.sourcePostCheckDependencyDriftRejected, true);
  assert.equal(simulation.tamperCases.postBuildDependencyDriftRejected, true);
  assert.equal(simulation.tamperCases.preBrowserDependencyDriftRejected, true);
  assert.equal(simulation.tamperCases.sourcePreconditionRetryPassed, true);
  assert.equal(
    simulation.tamperCases.sourceAlreadyBoundRetryWithoutReinstall,
    true,
  );
  assert.equal(
    simulation.tamperCases.sourceBindingRaceRejectedWithoutReinstall,
    true,
  );
  assert.equal(
    simulation.tamperCases.sourceEvidenceIntermediateSymlinkRejectedWithoutWrite,
    true,
  );
  assert.equal(
    simulation.tamperCases.buildAlreadyBoundRetryWithoutReinstall,
    true,
  );
  assert.equal(
    simulation.tamperCases.browserAlreadyBoundRetryWithoutReinstall,
    true,
  );
  assert.equal(simulation.tamperCases.certificationProcessHandoffRetained, true);
  coveredRegressionIds.add(29);
  const currentEvidenceRoot = path.join(base, "evidence");
  const currentState = readCertificationState(
    path.join(currentEvidenceRoot, "certification-state.json"),
  );
  const extractedArtifactRoot = path.join(
    currentEvidenceRoot,
    "archive/extracted",
  );
  const currentManifest = JSON.parse(
    readFileSync(
      path.join(
        extractedArtifactRoot,
        ".local/production-artifact-evidence/manifest.json",
      ),
      "utf8",
    ),
  );
  const currentJournal = JSON.parse(
    readFileSync(
      path.join(
        extractedArtifactRoot,
        ".local/production-artifact-evidence/semantic-event-journal.json",
      ),
      "utf8",
    ),
  );
  const currentRawRuntime = JSON.parse(
    readFileSync(
      path.join(
        currentEvidenceRoot,
        currentState.evidenceFiles["runtime-report"].path,
      ),
      "utf8",
    ),
  );
  const currentRuntimeTiming = JSON.parse(
    readFileSync(
      path.join(
        currentEvidenceRoot,
        currentState.evidenceFiles["runtime-phase-timings"].path,
      ),
      "utf8",
    ),
  );
  const currentRuntimeEnvelope = JSON.parse(
    readFileSync(
      path.join(
        currentEvidenceRoot,
        currentState.evidenceFiles["runtime-smoke"].path,
      ),
      "utf8",
    ),
  );
  assert.equal(currentState.schema, PRODUCTION_CERTIFICATION_STATE_SCHEMA);
  assert.equal(currentManifest.schema, PRODUCTION_EVIDENCE_SCHEMA);
  assert.equal(currentJournal.schema, PRODUCTION_EVIDENCE_JOURNAL_SCHEMA);
  assert.equal(currentJournal.version, PRODUCTION_EVIDENCE_JOURNAL_VERSION);
  assert.equal(currentRuntimeTiming.failure, null);
  assert.equal(Object.hasOwn(currentRawRuntime, "runtimeSmokeFailure"), false);
  assert.equal(
    currentRawRuntime.config.metadata.productionArtifactEvidence
      .semanticJournalVersion,
    PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  );
  assert.equal(
    currentRuntimeTiming.evidenceBinding.identity.semanticJournalVersion,
    PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  );
  assert.equal(
    currentRuntimeEnvelope.journalIdentity.version,
    PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  );
  const completeFinalChild = finalSimulationChild(base);
  assert.equal(completeFinalChild.status, 0);

  {
    const baseEvidenceRoot = path.join(base, "evidence");
    const baseStatePath = path.join(
      baseEvidenceRoot,
      "certification-state.json",
    );
    const baseState = readCertificationState(baseStatePath);
    const baseReportPath = path.join(
      baseEvidenceRoot,
      baseState.evidenceFiles["runtime-report"].path,
    );
    const baseRuntimePath = path.join(
      baseEvidenceRoot,
      baseState.evidenceFiles["runtime-smoke"].path,
    );
    const baseOwnerPath = `${baseReportPath}.owner.json`;
    const originalStateBytes = readFileSync(baseStatePath);
    const originalReportBytes = readFileSync(baseReportPath);
    const originalRuntimeBytes = readFileSync(baseRuntimePath);
    const originalOwnerBytes = existsSync(baseOwnerPath)
      ? readFileSync(baseOwnerPath)
      : null;
    try {
      const projection =
        projectSimulationRuntimeReportThroughPhysicalOwnership(base);
      const rawReportBytes = readFileSync(projection.reportPath);
      assert.equal(
        Object.hasOwn(JSON.parse(rawReportBytes.toString("utf8")), "runtimeSmokeFailure"),
        false,
      );
      const child = finalSimulationChild(base);
      assert.equal(
        child.status,
        0,
        `physical runtime-report projection must pass final evidence:\n${child.stdout}\n${child.stderr}`,
      );
      assert.equal(JSON.parse(child.stdout.trim()).simulationComplete, true);
      assert.deepEqual(readFileSync(projection.reportPath), rawReportBytes);
      assert.equal(
        sha256Bytes(readFileSync(projection.reportPath)),
        projection.reportSha256,
      );
    } finally {
      writeFileSync(baseStatePath, originalStateBytes);
      writeFileSync(baseReportPath, originalReportBytes);
      writeFileSync(baseRuntimePath, originalRuntimeBytes);
      if (originalOwnerBytes === null) {
        rmSync(baseOwnerPath, { force: true });
      } else {
        writeFileSync(baseOwnerPath, originalOwnerBytes);
      }
    }
  }

  for (const mutation of [
    {
      label: "owner",
      apply(evidence) {
        evidence.ownerId = "retailer";
      },
    },
    {
      label: "worktree",
      apply(evidence) {
        evidence.worktreeIdentitySha256 = "0".repeat(64);
      },
    },
    {
      label: "passed-stage-process",
      apply(evidence) {
        evidence.process.exitCode = 1;
      },
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(
      clone,
      "browser-server-lifecycle:cart",
      (evidence) => {
        mutation.apply(evidence);
        const resealed = resealBrowserServerLifecycleEvidence(evidence);
        for (const key of Object.keys(evidence)) delete evidence[key];
        Object.assign(evidence, resealed);
      },
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /browser-server lifecycle identity is invalid: cart/,
      `browser-server lifecycle ${mutation.label} swap must be rejected`,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(
      clone,
      "build",
      (evidence) => {
        evidence.generatedOutputLifecycle.cleanup.postCleanupAbsenceProof =
          false;
        const { seal, ...payload } = evidence.generatedOutputLifecycle;
        seal.sha256 = sha256Bytes(canonicalJsonBytes(payload));
      },
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /build generated-output lifecycle:.*cleanup evidence is invalid/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(32);
  }
  const completeFinal = JSON.parse(completeFinalChild.stdout.trim());
  assert.match(completeFinal.identity.archiveInventorySha256, /^[0-9a-f]{64}$/);
  assert.match(completeFinal.identity.phase8CompletionSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    Object.keys(completeFinal.identity.browserReportSha256),
    REQUIRED_BROWSER_OWNERS.map((owner) => owner.id),
  );

  const assertFinalMutationRejected = (name, mutate, expected) => {
    const clone = cloneSimulation(base);
    try {
      mutate(clone);
      const child = finalSimulationChild(clone);
      assert.notEqual(child.status, 0, `${name} must fail current final standalone`);
      assert.match(`${child.stdout}\n${child.stderr}`, expected, name);
      return `${child.stdout}\n${child.stderr}`;
    } finally {
      rmSync(path.dirname(clone), { recursive: true, force: true });
    }
  };

  assertFinalMutationRejected(
    "current state with historical journal v1",
    (clone) =>
      mutateExtractedJournal(clone, (journal) => {
        journal.schema =
          "interior-ai.production-artifact-semantic-event-journal.v1";
        journal.version = 1;
      }),
    /unsupported semantic event journal schema or version/,
  );
  assertFinalMutationRejected(
    "current journal missing a v2-required worktree binding",
    (clone) =>
      mutateExtractedJournal(clone, (journal) => {
        delete journal.owner.worktreeIdentitySha256;
      }),
    /owner binding is malformed|journal shape is malformed/,
  );
  assertFinalMutationRejected(
    "current journal nonce mismatch",
    (clone) =>
      mutateExtractedJournal(clone, (journal) => {
        journal.runNonce = "123e4567-e89b-42d3-a456-426614174099";
      }),
    /nonce|complete candidate identity/,
  );
  assertFinalMutationRejected(
    "manifest v1 with runtime journal v2",
    (clone) =>
      mutateExtractedManifest(clone, (manifest) => {
        manifest.schema = "interior-ai.production-artifact-evidence.v1";
        manifest.validatorVersion = 1;
      }),
    /unsupported production evidence schema or validator version/,
  );
  assertFinalMutationRejected(
    "wrong semantic journal SHA",
    (clone) => {
      const statePath = path.join(
        clone,
        "evidence/certification-state.json",
      );
      const state = readCertificationState(statePath);
      state.bindings.semanticJournalSha256 = "0".repeat(64);
      writeCertificationState(statePath, state);
    },
    /journal|semantic/i,
  );

  for (const mutation of [
    {
      name: "runtime raw report journal v1",
      mutate(identity) {
        identity.semanticJournalSchema =
          "interior-ai.production-artifact-semantic-event-journal.v1";
        identity.semanticJournalVersion = 1;
      },
    },
    {
      name: "runtime raw report unknown journal schema",
      mutate(identity) {
        identity.semanticJournalSchema = "interior-ai.unknown-journal";
      },
    },
    {
      name: "runtime raw report future journal version",
      mutate(identity) {
        identity.semanticJournalVersion = PRODUCTION_EVIDENCE_JOURNAL_VERSION + 1;
      },
    },
    {
      name: "runtime raw report missing journal version",
      mutate(identity) {
        delete identity.semanticJournalVersion;
      },
    },
    {
      name: "runtime raw report malformed journal version",
      mutate(identity) {
        identity.semanticJournalVersion = "2";
      },
    },
    {
      name: "runtime raw report wrong nonce",
      mutate(identity) {
        identity.runNonce = "123e4567-e89b-42d3-a456-426614174099";
      },
    },
    {
      name: "runtime raw report wrong candidate commit",
      mutate(identity) {
        identity.sourceCommitSha = "f".repeat(40);
      },
    },
    {
      name: "runtime raw report wrong candidate tree",
      mutate(identity) {
        identity.sourceTreeSha = "e".repeat(40);
      },
    },
    {
      name: "runtime raw report wrong Build ID",
      mutate(identity) {
        identity.nextBuildId = "another-build";
      },
    },
    {
      name: "runtime raw report cross-artifact SHA",
      mutate(identity) {
        identity.artifactSha256 = "d".repeat(64);
      },
    },
    {
      name: "runtime raw report cross-candidate",
      mutate(identity) {
        identity.candidateIdentifier = "another-candidate";
      },
    },
  ]) {
    assertFinalMutationRejected(
      mutation.name,
      (clone) => mutateRuntimeReportIdentity(clone, mutation.mutate),
      /runtime-smoke raw report does not identify the certified artifact/,
    );
  }

  for (const mutation of [
    {
      name: "cross-certification runtime timing",
      mutate(identity) {
        identity.certificationId = "another-certification";
      },
    },
    {
      name: "cross-candidate runtime timing",
      mutate(identity) {
        identity.candidateId = "another-candidate";
      },
    },
    {
      name: "cross-commit runtime timing",
      mutate(identity) {
        identity.commitSha = "f".repeat(40);
      },
    },
    {
      name: "cross-tree runtime timing",
      mutate(identity) {
        identity.treeSha = "e".repeat(40);
      },
    },
    {
      name: "cross-artifact runtime timing",
      mutate(identity) {
        identity.artifactSha256 = "d".repeat(64);
      },
    },
    {
      name: "cross-manifest runtime timing",
      mutate(identity) {
        identity.productionManifestSha256 = "c".repeat(64);
      },
    },
    {
      name: "cross-run runtime timing",
      mutate(identity) {
        identity.semanticJournalNonce =
          "123e4567-e89b-42d3-a456-426614174099";
      },
    },
  ]) {
    assertFinalMutationRejected(
      mutation.name,
      (clone) => mutateRuntimeTimingIdentity(clone, mutation.mutate),
      /timing evidence is cross-run or cross-artifact/,
    );
  }

  assertFinalMutationRejected(
    "missing runtime timing identity",
    (clone) =>
      mutateRuntimeTiming(clone, (timing) => {
        delete timing.evidenceBinding.identity;
      }),
    /timing identity binding is malformed|timing evidence is cross-run or cross-artifact/,
  );
  assertFinalMutationRejected(
    "malformed runtime timing identity",
    (clone) =>
      mutateRuntimeTiming(clone, (timing) => {
        timing.evidenceBinding.identity = "malformed";
      }),
    /timing identity binding is malformed|timing evidence is cross-run or cross-artifact/,
  );

  for (const [name, evidenceName, mutate] of [
    [
      "raw runtime report hash mismatch",
      "runtime-report",
      (report) => {
        report.stats.duration += 1;
      },
    ],
    [
      "raw runtime timing hash mismatch",
      "runtime-phase-timings",
      (timing) => {
        timing.wholeTestTimeoutMs += 1;
      },
    ],
    [
      "raw runtime marker hash mismatch",
      "runtime-start",
      (marker) => {
        marker.title = "tampered runtime marker";
      },
    ],
  ]) {
    assertFinalMutationRejected(
      name,
      (clone) => {
        const evidenceRoot = path.join(clone, "evidence");
        const state = readCertificationState(
          path.join(evidenceRoot, "certification-state.json"),
        );
        const filePath = path.join(
          evidenceRoot,
          state.evidenceFiles[evidenceName].path,
        );
        const value = JSON.parse(readFileSync(filePath, "utf8"));
        mutate(value);
        writeFileSync(filePath, canonicalJsonBytes(value));
      },
      /hash mismatch/,
    );
  }

  assertFinalMutationRejected(
    "cross-attempt runtime report authorization",
    (clone) => {
      const projection =
        projectSimulationRuntimeReportThroughPhysicalOwnership(clone);
      const authorization = JSON.parse(
        readFileSync(projection.ownerPath, "utf8"),
      );
      authorization.runtimeStageAttempt += 1;
      writeFileSync(projection.ownerPath, canonicalJsonBytes(authorization));
    },
    /owned by another certification, candidate, run, attempt, path, or evidence root/,
  );

  assertFinalMutationRejected(
    "runtime timing evidence journal v1",
    (clone) =>
      mutateRuntimeTimingIdentity(clone, (identity) => {
        identity.semanticJournalSchema =
          "interior-ai.production-artifact-semantic-event-journal.v1";
        identity.semanticJournalVersion = 1;
      }),
    /timing evidence is cross-run or cross-artifact/,
  );
  assertFinalMutationRejected(
    "runtime envelope journal v1",
    (clone) =>
      mutateBoundEvidence(
        clone,
        "runtime-smoke",
        (evidence) => {
          evidence.journalIdentity.schema =
            "interior-ai.production-artifact-semantic-event-journal.v1";
          evidence.journalIdentity.version = 1;
        },
        "runtimeSmokeEvidenceSha256",
      ),
    /runtime-smoke envelope journal identity is invalid/,
  );
  const secretOutput = assertFinalMutationRejected(
    "secret-safe runtime journal error",
    (clone) =>
      mutateRuntimeReportIdentity(clone, (identity) => {
        identity.runNonce = "credential://raw-secret-must-not-print";
      }),
    /runtime-smoke raw report does not identify the certified artifact/,
  );
  assert.doesNotMatch(secretOutput, /raw-secret-must-not-print/);
  coveredRegressionIds.add(30);

  const canonicalRoot = path.join(base, "source");
  const sourceValidationRoot = path.join(
    base,
    "stage-worktrees/production-certification-v1-simulation/source-validation",
  );
  const sourceRoot = path.join(
    base,
    "stage-worktrees/production-certification-v1-simulation/final-artifact",
  );
  const evidenceRoot = path.join(base, "evidence");
  const completedState = readCertificationState(
    path.join(evidenceRoot, "certification-state.json"),
  );
  const sourceDescriptor = completedState.evidenceFiles["source-validation"];
  const sourceEvidence = JSON.parse(
    readFileSync(path.join(evidenceRoot, sourceDescriptor.path), "utf8"),
  );
  const sourceCheckSet = sourceValidationCheckSet(sourceValidationRoot);
  const validateSourceMutation = (mutate) => {
    const value = structuredClone(sourceEvidence);
    mutate(value);
    return validateSourceValidationEvidence({
      evidence: value,
      evidenceRoot,
      state: completedState,
      repositoryRoot: sourceValidationRoot,
    }).issues.join("\n");
  };
  assert.equal(
    validateSourceValidationEvidence({
      evidence: sourceEvidence,
      evidenceRoot,
      state: completedState,
      repositoryRoot: sourceValidationRoot,
    }).valid,
    true,
    "all canonical source checks must execute and validate",
  );
  assert.equal(sourceEvidence.checks.length, sourceCheckSet.checks.length);
  assert.deepEqual(
    sourceEvidence.checks.map((check) => check.id),
    sourceCheckSet.checks.map((check) => check.id),
  );
  assert.match(
    validateSourceValidationEvidence({
      evidence: {
        schema: "interior-ai.production-certification-source-identity.v1",
        candidate: completedState.candidate,
        complete: true,
      },
      evidenceRoot,
      state: completedState,
      repositoryRoot: sourceValidationRoot,
    }).issues.join("\n"),
    /schema is unsupported|check closure|completion marker/,
    "an identity-only source descriptor must be rejected",
  );
  assert.match(
    validateSourceMutation((value) => value.checks.splice(3, 1)),
    /check closure is missing or out of order/,
  );
  assert.match(
    validateSourceMutation((value) => value.checks.splice(3, 0, value.checks[2])),
    /duplicate check/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.checks[2].id = "unknown-extra-check";
    }),
    /unknown check/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.checks[2].canonicalCommand = "node weaker-substitute.mjs";
    }),
    /command or order mismatch/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.checks[2].process.exitCode = 17;
      value.checks[2].passed = false;
    }),
    /did not exit zero/,
    "a prior nonzero result must not be masked by later successes",
  );
  assert.match(
    validateSourceMutation((value) => {
      value.checks[2].invokedCommand = "sh -c 'producer | tee output.log'";
    }),
    /invoked command mismatch/,
    "a tee/wrapper substitution must not satisfy the canonical command",
  );
  assert.match(
    validateSourceMutation((value) => {
      delete value.checks[2].stdout.sha256;
    }),
    /stdout hash is missing/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.completionMarker = null;
    }),
    /completion marker is missing/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.candidate.commitSha = "0".repeat(40);
      value.candidate.treeSha = "1".repeat(40);
    }),
    /another candidate or tree/,
  );
  assert.match(
    validateSourceMutation((value) => {
      value.harness.sourceSha256 = "0".repeat(64);
      value.contractMatrixSha256 = "1".repeat(64);
    }),
    /another harness or contract matrix/,
  );
  const validateResealedSourceResultMutation = (mutate) => {
    const value = structuredClone(sourceEvidence);
    const result = value.checks.find(
      (check) => check.id === "floor-plan-upload-static-owner",
    );
    mutate(result);
    const resultPath = path.join(evidenceRoot, result.resultEvidence.path);
    const retainedResultBytes = readFileSync(resultPath);
    try {
      const retainedResult = structuredClone(result);
      delete retainedResult.resultEvidence;
      retainedResult.generatedEvidence = result.generatedEvidence.slice(0, 2);
      const resultBytes = canonicalJsonBytes(retainedResult);
      writeFileSync(resultPath, resultBytes);
      result.resultEvidence.sha256 = sha256Bytes(resultBytes);
      result.generatedEvidence[2] = structuredClone(result.resultEvidence);
      const sealed = sealSourceValidationEvidence(value);
      return validateSourceValidationEvidence({
        evidence: sealed,
        evidenceRoot,
        state: completedState,
        repositoryRoot: sourceValidationRoot,
      }).issues.join("\n");
    } finally {
      writeFileSync(resultPath, retainedResultBytes);
    }
  };
  assert.match(
    validateResealedSourceResultMutation((result) => {
      result.generatedOutputs.postCheck.producedBoundary.declaredGeneratedInventory = {
        count: 999,
        sha256: "f".repeat(64),
      };
    }),
    /boundary contradicts its lifecycle position/,
  );
  assert.match(
    validateResealedSourceResultMutation((result) => {
      result.generatedOutputs.postCheck.producedBoundary.persistentIgnoredInventory = {
        count: 999,
        sha256: "e".repeat(64),
      };
    }),
    /boundary contradicts its lifecycle position/,
  );
  assert.match(
    validateResealedSourceResultMutation((result) => {
      result.generatedOutputs.postCheck.issues = ["false passed-boundary claim"];
    }),
    /generated-output boundary mismatch/,
  );
  assert.match(
    validateResealedSourceResultMutation((result) => {
      result.startedAt = new Date(Date.parse(result.startedAt) + 1).toISOString();
    }),
    /check-boundary timestamps are contradictory/,
  );
  for (const failure of [
    {
      name: "zero-exit lifecycle failure",
      processExitCode: 0,
      lifecycleFailure: true,
      stateExitCode: 1,
    },
    {
      name: "nonzero owner-process failure",
      processExitCode: 17,
      lifecycleFailure: false,
      stateExitCode: 17,
    },
  ]) {
    const typecheckIndex = sourceEvidence.checks.findIndex(
      (check) => check.id === "typescript-typecheck",
    );
    const failedEvidence = structuredClone(sourceEvidence);
    failedEvidence.checks = failedEvidence.checks.slice(0, typecheckIndex + 1);
    const failedCheck = failedEvidence.checks.at(-1);
    const emptyInventory = { count: 0, sha256: sha256Bytes("") };
    const cleanBoundary = {
      trackedAndOrdinaryUntrackedClean: true,
      ordinaryStatusInventory: emptyInventory,
      persistentIgnoredInventory:
        failedCheck.generatedOutputs.postCheck.terminalBoundary
          .persistentIgnoredInventory,
      declaredGeneratedInventory: emptyInventory,
      undeclaredIgnoredInventory: emptyInventory,
      activeGeneratedOutputIds: [],
    };
    failedCheck.process.exitCode = failure.processExitCode;
    failedCheck.generatedOutputs.postCheck = {
      ...failedCheck.generatedOutputs.postCheck,
      generatedOutputEvidence: [],
      producedBoundary: structuredClone(cleanBoundary),
      terminalBoundary: structuredClone(cleanBoundary),
      passed: !failure.lifecycleFailure,
      issues: failure.lifecycleFailure
        ? ["required generated output is missing: tsconfig.tsbuildinfo"]
        : [],
    };
    failedCheck.passed = false;
    const resultPath = path.join(
      evidenceRoot,
      failedCheck.resultEvidence.path,
    );
    const aggregatePath = path.join(evidenceRoot, sourceDescriptor.path);
    const retainedResultBytes = readFileSync(resultPath);
    const retainedAggregateBytes = readFileSync(aggregatePath);
    try {
      const retainedResult = structuredClone(failedCheck);
      delete retainedResult.resultEvidence;
      retainedResult.generatedEvidence = failedCheck.generatedEvidence.slice(0, 2);
      const failedResultBytes = canonicalJsonBytes(retainedResult);
      writeFileSync(resultPath, failedResultBytes);
      failedCheck.resultEvidence.sha256 = sha256Bytes(failedResultBytes);
      failedCheck.generatedEvidence[2] = structuredClone(
        failedCheck.resultEvidence,
      );
      failedEvidence.generatedOutputEvidence =
        failedEvidence.generatedOutputEvidence.filter(
          (entry) => entry.outputId === "floor-plan-upload-browser-fixture",
        );
      failedEvidence.aggregateGeneratedOutputEvidenceSha256 = sha256Bytes(
        Buffer.concat([
          Buffer.from(GENERATED_OUTPUT_AGGREGATE_SEAL_DOMAIN),
          canonicalJsonBytes(failedEvidence.generatedOutputEvidence),
        ]),
      );
      failedEvidence.passed = false;
      failedEvidence.failedCheckId = failedCheck.id;
      failedEvidence.completionMarker = {
        complete: true,
        result: "failed",
        completedCheckCount: failedEvidence.checks.length,
      };
      const sealedFailedEvidence = sealSourceValidationEvidence(failedEvidence);
      const aggregateBytes = canonicalJsonBytes(sealedFailedEvidence);
      writeFileSync(aggregatePath, aggregateBytes);
      const failedDescriptor = {
        path: sourceDescriptor.path,
        sha256: sha256Bytes(aggregateBytes),
      };
      const bindingReceipt = JSON.parse(
        readFileSync(
          path.join(
            evidenceRoot,
            sealedFailedEvidence.dependencyLifecycle.bindingStateEvidence.path,
          ),
          "utf8",
        ),
      );
      const failedState = completeCertificationStage(bindingReceipt, {
        stage: "source-validation",
        passed: false,
        completedAt: sealedFailedEvidence.completedAt,
        exitCode: failure.stateExitCode,
        failureClassification: "SOURCE_CONTRACT_FAILURE",
        consumedSubstantiveGate: true,
        evidenceFiles: { "source-validation": failedDescriptor },
      });
      assert.deepEqual(
        validateSourceValidationEvidence({
          evidence: sealedFailedEvidence,
          evidenceRoot,
          state: failedState,
          repositoryRoot: sourceValidationRoot,
          requirePassed: false,
          verifyPhysicalSource: false,
        }).issues,
        [],
        `${failure.name} must remain valid failed evidence`,
      );
      const failedStateValidation = validateCertificationState({
        state: failedState,
        evidenceRoot,
        expectedCandidate: failedState.candidate,
        expectedHarnessSourceSha256: failedState.harness.sourceSha256,
        repositoryRoot: canonicalRoot,
        sourceValidationRoot,
        verifyCurrentSource: false,
      });
      assert.deepEqual(
        failedStateValidation.issues,
        [],
        `the state validator must accept the preserved ${failure.name}`,
      );
    } finally {
      writeFileSync(resultPath, retainedResultBytes);
      writeFileSync(aggregatePath, retainedAggregateBytes);
    }
  }
  {
    const clone = cloneSimulation(base);
    const cloneEvidenceRoot = path.join(clone, "evidence");
    const cloneState = readCertificationState(
      path.join(cloneEvidenceRoot, "certification-state.json"),
    );
    const stream = cloneState.evidenceFiles["source-validation"];
    const aggregate = JSON.parse(
      readFileSync(path.join(cloneEvidenceRoot, stream.path), "utf8"),
    );
    writeFileSync(
      path.join(cloneEvidenceRoot, aggregate.checks[0].stdout.path),
      "tampered source-check output\n",
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /source-validation stdout.*hash mismatch/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  {
    const manuallyPassed = structuredClone(completedState);
    delete manuallyPassed.evidenceFiles["source-validation"];
    const manualStatePath = path.join(evidenceRoot, "manual-pass-state.json");
    writeCertificationState(manualStatePath, manuallyPassed);
    const resealed = readCertificationState(manualStatePath);
    const validation = validateCertificationState({
      state: resealed,
      evidenceRoot,
      expectedCandidate: resealed.candidate,
      expectedHarnessSourceSha256: resealed.harness.sourceSha256,
      repositoryRoot: canonicalRoot,
      sourceValidationRoot,
      artifactRoot: sourceRoot,
    });
    assert.equal(validation.valid, false);
    assert.match(validation.issues.join("\n"), /missing evidence source-validation/);
    rmSync(manualStatePath);
  }

  const measureContinuity = () =>
    measureFinalContinuity({
      repositoryRoot: sourceRoot,
      evidenceRoot,
      state: completedState,
      capturedAt: "2026-08-14T00:40:00.000Z",
      writeEvidence: false,
    });
  const matchingContinuity = measureContinuity();
  assert.deepEqual(matchingContinuity.issues, []);
  const continuityValue = JSON.parse(
    readFileSync(
      path.join(evidenceRoot, completedState.evidenceFiles.continuity.path),
      "utf8",
    ),
  );
  assert.equal(new Set(Object.values(continuityValue.inputSnapshots)).size, 6);
  const copiedContinuity = structuredClone(continuityValue);
  const copiedSnapshotHash = Object.values(copiedContinuity.inputSnapshots)[0];
  for (const position of Object.keys(copiedContinuity.inputSnapshots)) {
    copiedContinuity.inputSnapshots[position] = copiedSnapshotHash;
  }
  assert.match(
    validateContinuityEvidence(
      copiedContinuity,
      completedState,
      sourceRoot,
    ).issues.join("\n"),
    /copied, duplicated/,
  );
  const unboundContinuity = structuredClone(continuityValue);
  unboundContinuity.inputSnapshots.immediateBuild = "f".repeat(64);
  assert.match(
    validateContinuityEvidence(
      unboundContinuity,
      completedState,
      sourceRoot,
    ).issues.join("\n"),
    /unbound/,
    "continuity inputs must bind to the state-owned snapshot descriptors",
  );
  const syntheticComparison = structuredClone(continuityValue);
  syntheticComparison.comparisons[0].positions = ["immediateBuild"];
  assert.match(
    validateContinuityEvidence(
      syntheticComparison,
      completedState,
      sourceRoot,
    ).issues.join("\n"),
    /partial, synthetic, or failed/,
    "continuity comparison claims must retain the canonical position sets",
  );
  const captureEvents = [];
  const snapshotPaths = [];
  for (const position of [
    "immediateBuild",
    "stagedArchive",
    "compressedArchive",
    "extractedArchive",
    "postPhase8Live",
    "postRuntimeBrowserLive",
  ]) {
    const snapshotDescriptor = completedState.evidenceFiles[
      snapshotEvidenceName(position)
    ];
    const rootDescriptor = completedState.evidenceFiles[rootEvidenceName(position)];
    const snapshot = JSON.parse(
      readFileSync(path.join(evidenceRoot, snapshotDescriptor.path), "utf8"),
    );
    const rootSidecar = JSON.parse(
      readFileSync(path.join(evidenceRoot, rootDescriptor.path), "utf8"),
    );
    assert.equal(
      validateArtifactSnapshotEvidence({
        snapshot,
        rootSidecar,
        state: completedState,
        repositoryRoot: sourceRoot,
        evidenceRoot,
        position,
        rehashPhysicalRoot: true,
      }).valid,
      true,
    );
    captureEvents.push(snapshot.captureEventId);
    snapshotPaths.push(snapshotDescriptor.path);
  }
  assert.equal(new Set(captureEvents).size, 6);
  assert.equal(new Set(snapshotPaths).size, 6);
  {
    const position = "immediateBuild";
    const snapshotDescriptor =
      completedState.evidenceFiles[snapshotEvidenceName(position)];
    const rootDescriptor = completedState.evidenceFiles[rootEvidenceName(position)];
    const snapshot = JSON.parse(
      readFileSync(path.join(evidenceRoot, snapshotDescriptor.path), "utf8"),
    );
    const rootSidecar = JSON.parse(
      readFileSync(path.join(evidenceRoot, rootDescriptor.path), "utf8"),
    );
    snapshot.identity.nextBuildId = "synthetic-build-id";
    assert.match(
      validateArtifactSnapshotEvidence({
        snapshot,
        rootSidecar,
        state: completedState,
        repositoryRoot: sourceRoot,
        evidenceRoot,
        position,
      }).issues.join("\n"),
      /identity contradicts state/,
      "nested snapshot identity must bind to certification state",
    );
  }

  const statePath = path.join(evidenceRoot, "certification-state.json");
  const retryEvidencePath = path.join(
    evidenceRoot,
    "continuity/attempt-003.json",
  );
  const continuityCliEnvironment = (startedAt, completedAt) => ({
    ...process.env,
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NODE_ENV: "production",
    CATALOG_STRICT_VALIDATION: "true",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: completedState.candidate.id,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA:
      completedState.candidate.commitSha,
    CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
    CERTIFICATION_QUALIFICATION_MODE: "1",
    CERTIFICATION_ALLOW_SIMULATION: "1",
    CERTIFICATION_EXPECTED_COMMIT_SHA: completedState.candidate.commitSha,
    CERTIFICATION_EXPECTED_TREE_SHA: completedState.candidate.treeSha,
    CERTIFICATION_EXPECTED_PARENT_SHA: completedState.candidate.parentSha,
    PRODUCTION_CERTIFICATION_STATE: statePath,
    CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
    CERTIFICATION_STAGE_STARTED_AT: startedAt,
    CERTIFICATION_STAGE_COMPLETED_AT: completedAt,
    CERTIFICATION_INVALIDATED_AT: completedAt,
  });
  const runRealContinuityTamper = ({
    name,
    mutate,
    expectedEvidenceMismatch = null,
  }) => {
    if (existsSync(retryEvidencePath)) unlinkSync(retryEvidencePath);
    const invalidatedAt = new Date(
      Date.parse(completedState.updatedAt) + 1_000,
    ).toISOString();
    const startedAt = new Date(Date.parse(invalidatedAt) + 100).toISOString();
    const completedAt = new Date(Date.parse(invalidatedAt) + 200).toISOString();
    writeCertificationState(
      statePath,
      invalidateCertificationState(completedState, {
        stage: "continuity",
        reason: `real CLI continuity tamper fixture: ${name}`,
        invalidatedAt,
      }),
    );
    const restore = mutate();
    let child;
    try {
      child = spawnSync(
        process.execPath,
        ["scripts/production-certification.mjs", "continuity"],
        {
          cwd: canonicalRoot,
          env: continuityCliEnvironment(startedAt, completedAt),
          encoding: "utf8",
        },
      );
    } finally {
      restore();
    }
    assert.notEqual(child.status, 0, `${name} must fail the real continuity CLI`);
    const failedState = readCertificationState(statePath);
    assert.notEqual(
      failedState.stages["integration-ready"].status,
      "passed",
      `${name} must prevent integration readiness`,
    );
    if (failedState.stages.continuity.status === "failed") {
      assert.equal(
        failedState.evidenceFiles.continuity.path,
        "continuity/attempt-003.json",
      );
      const failedEvidence = JSON.parse(
        readFileSync(retryEvidencePath, "utf8"),
      );
      assert.equal(failedEvidence.passed, false);
      assert.equal(failedEvidence.completionMarker.result, "failed");
      assert.ok(failedEvidence.mismatches.length > 0);
      if (expectedEvidenceMismatch) {
        assert.ok(
          failedEvidence.mismatches.some(expectedEvidenceMismatch),
          `${name} must retain its exact physical mismatch`,
        );
      }
      assert.equal(
        validateCertificationState({
          state: failedState,
          evidenceRoot,
          expectedCandidate: failedState.candidate,
          expectedHarnessSourceSha256: failedState.harness.sourceSha256,
          repositoryRoot: canonicalRoot,
          sourceValidationRoot,
          artifactRoot: sourceRoot,
        }).valid,
        true,
        `${name} failed evidence must remain a truthful sealed state`,
      );
    } else {
      assert.ok(
        CERTIFICATION_STAGE_ORDER.some(
          (stage) => failedState.stages[stage].status === "invalidated",
        ),
        `${name} must invalidate state before continuity when detected earlier`,
      );
    }
    writeCertificationState(statePath, completedState);
    if (existsSync(retryEvidencePath)) unlinkSync(retryEvidencePath);
  };
  const mutateBytes = (filePath, replacement) => {
    const original = readFileSync(filePath);
    writeFileSync(filePath, replacement);
    return () => writeFileSync(filePath, original);
  };
  const lifecycleSnapshotTamper = (position) => {
    const descriptor = completedState.evidenceFiles[snapshotEvidenceName(position)];
    return mutateBytes(
      path.join(evidenceRoot, descriptor.path),
      Buffer.concat([
        readFileSync(path.join(evidenceRoot, descriptor.path)),
        Buffer.from(" "),
      ]),
    );
  };
  for (const scenario of [
    {
      name: "immediate-post-build/pre-Phase-8 capture",
      mutate: () => lifecycleSnapshotTamper("immediateBuild"),
    },
    {
      name: "post-Phase-8 capture",
      mutate: () => lifecycleSnapshotTamper("postPhase8Live"),
    },
    {
      name: "post-runtime/browser live bytes",
      mutate: () =>
        mutateBytes(
          path.join(sourceRoot, ".next/static/chunk.js"),
          "post-browser live mutation\n",
        ),
    },
    {
      name: "staged archive file",
      mutate: () =>
        mutateBytes(
          path.join(evidenceRoot, "archive/stage/package.json"),
          "{\"stagedMutation\":true}\n",
        ),
      expectedEvidenceMismatch: (mismatch) => mismatch.path === "package.json",
    },
    {
      name: "compressed archive bytes",
      mutate: () => {
        const archiveFile = path.join(
          evidenceRoot,
          "archive/candidate.tar.gz",
        );
        const original = readFileSync(archiveFile);
        const changed = Buffer.from(original);
        changed[0] ^= 0xff;
        writeFileSync(archiveFile, changed);
        return () => writeFileSync(archiveFile, original);
      },
      expectedEvidenceMismatch: (mismatch) =>
        mismatch.scope === "compressedArchiveBytes" &&
        mismatch.path === "archive/candidate.tar.gz",
    },
    {
      name: "extracted archive file",
      mutate: () =>
        mutateBytes(
          path.join(evidenceRoot, "archive/extracted/public/asset.txt"),
          "extracted mutation\n",
        ),
    },
    {
      name: "missing staged physical root",
      mutate: () => {
        const root = path.join(evidenceRoot, "archive/stage");
        const saved = path.join(evidenceRoot, "archive/stage.cli-saved");
        renameSync(root, saved);
        return () => renameSync(saved, root);
      },
      expectedEvidenceMismatch: (mismatch) =>
        mismatch.lifecyclePosition === "stagedArchive" &&
        mismatch.kind === "unavailable-root",
    },
  ]) {
    runRealContinuityTamper(scenario);
  }
  writeCertificationState(statePath, completedState);

  const mutateFileAndMeasure = (filePath, bytes, expected) => {
    const original = readFileSync(filePath);
    try {
      writeFileSync(filePath, bytes);
      const measured = measureContinuity();
      assert.notEqual(measured.issues.length, 0);
      assert.match(measured.issues.join("\n"), expected);
    } finally {
      writeFileSync(filePath, original);
    }
  };
  const liveChunk = path.join(sourceRoot, ".next/static/chunk.js");
  mutateFileAndMeasure(
    liveChunk,
    "changed before or during the live lifecycle\n",
    /physical artifact identity contradicts|no longer matches snapshot/,
  );
  const stageRoot = path.join(evidenceRoot, "archive/stage");
  mutateFileAndMeasure(
    path.join(stageRoot, "package.json"),
    "{\"changed\":true}\n",
    /stagedArchive|no longer matches snapshot/,
  );
  const archivePath = path.join(evidenceRoot, "archive/candidate.tar.gz");
  {
    const original = readFileSync(archivePath);
    const changed = Buffer.from(original);
    changed[0] ^= 0xff;
    try {
      writeFileSync(archivePath, changed);
      assert.match(
        measureContinuity().issues.join("\n"),
        /compressedArchive|compressed archive|incorrect header check/,
      );
    } finally {
      writeFileSync(archivePath, original);
    }
  }
  const extractedRoot = path.join(evidenceRoot, "archive/extracted");
  mutateFileAndMeasure(
    path.join(extractedRoot, "public/asset.txt"),
    "changed extracted file\n",
    /extractedArchive|physical artifact identity contradicts|no longer matches snapshot/,
  );
  {
    const extraPath = path.join(extractedRoot, "archive-only-extra.txt");
    try {
      writeFileSync(extraPath, "extra extracted closure file\n");
      assert.match(
        measureContinuity().issues.join("\n"),
        /extractedArchive|no longer matches snapshot/,
      );
    } finally {
      rmSync(extraPath);
    }
  }
  {
    const missingPath = path.join(extractedRoot, "public/asset.txt");
    const savedPath = path.join(evidenceRoot, "missing-extracted-asset.tmp");
    renameSync(missingPath, savedPath);
    try {
      assert.match(
        measureContinuity().issues.join("\n"),
        /extractedArchive|physical artifact identity contradicts|no longer matches snapshot/,
      );
    } finally {
      renameSync(savedPath, missingPath);
    }
  }
  for (const [relativePath, expected] of [
    [".next/BUILD_ID", /Build|physical artifact identity contradicts/],
    [
      ".local/production-artifact-evidence/manifest.json",
      /manifest|physical artifact identity/,
    ],
    [
      ".local/production-artifact-evidence/semantic-event-journal.json",
      /journal|physical artifact identity/,
    ],
    [
      ".next/server/app.js.nft.json",
      /NFT|physical artifact identity|no longer matches snapshot/,
    ],
    [".next/required-server-files.json", /identity|no longer matches snapshot/],
    [".next/build-manifest.json", /identity|no longer matches snapshot/],
    [".next/routes-manifest.json", /identity|no longer matches snapshot/],
    [".next/prerender-manifest.json", /identity|no longer matches snapshot/],
  ]) {
    mutateFileAndMeasure(
      path.join(sourceRoot, relativePath),
      `tampered ${relativePath}\n`,
      expected,
    );
  }
  mutateFileAndMeasure(
    path.join(stageRoot, ".certification/verifier-source-closure.json"),
    "{\"closureSha256\":\"bad\"}\n",
    /verifier|stagedArchive|no longer matches snapshot/,
  );
  {
    const extraPath = path.join(stageRoot, "archive-closure-only-extra.txt");
    try {
      writeFileSync(extraPath, "archive closure differs while app artifact matches\n");
      assert.match(
        measureContinuity().issues.join("\n"),
        /stagedArchive|no longer matches snapshot/,
      );
    } finally {
      rmSync(extraPath);
    }
  }
  {
    const extractedSaved = path.join(evidenceRoot, "archive/extracted.saved");
    renameSync(extractedRoot, extractedSaved);
    try {
      assert.match(measureContinuity().issues.join("\n"), /missing|unavailable/);
    } finally {
      renameSync(extractedSaved, extractedRoot);
    }
  }
  {
    const extractedSaved = path.join(evidenceRoot, "archive/extracted.saved-alias");
    renameSync(extractedRoot, extractedSaved);
    symlinkSync(stageRoot, extractedRoot, "dir");
    try {
      assert.match(
        measureContinuity().issues.join("\n"),
        /alias|symlink|replaced after capture/,
      );
    } finally {
      unlinkSync(extractedRoot);
      renameSync(extractedSaved, extractedRoot);
    }
  }
  {
    const stageSaved = path.join(evidenceRoot, "archive/stage.saved-fallback");
    renameSync(stageRoot, stageSaved);
    symlinkSync(sourceRoot, stageRoot, "dir");
    try {
      assert.match(
        measureContinuity().issues.join("\n"),
        /source-worktree|canonical-checkout fallback/,
      );
    } finally {
      unlinkSync(stageRoot);
      renameSync(stageSaved, stageRoot);
    }
  }
  {
    const snapshotDescriptor =
      completedState.evidenceFiles[snapshotEvidenceName("stagedArchive")];
    const snapshotPath = path.join(evidenceRoot, snapshotDescriptor.path);
    const original = readFileSync(snapshotPath);
    try {
      writeFileSync(snapshotPath, Buffer.concat([original, Buffer.from(" ")]));
      assert.match(measureContinuity().issues.join("\n"), /snapshot.*hash mismatch/);
    } finally {
      writeFileSync(snapshotPath, original);
    }
  }

  {
    const child = finalSimulationChild(base, {
      artifactRoot: path.join(base, "evidence/archive/stage"),
    });
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /not canonical physical paths/,
      "the direct standalone CLI must reject staged bytes",
    );
  }

  {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(
      path.join(
        clone,
        "evidence",
        state.evidenceFiles["phase8-completion"].path,
      ),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /missing|unreadable/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  for (const [id, evidenceName] of [
    [16, "phase8"],
    [17, "runtime-smoke"],
  ]) {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(path.join(clone, "evidence", state.evidenceFiles[evidenceName].path));
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /unavailable|missing|unreadable/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(id);
  }

  for (const owner of REQUIRED_BROWSER_OWNERS) {
    const clone = cloneSimulation(base);
    const state = readCertificationState(
      path.join(clone, "evidence/certification-state.json"),
    );
    unlinkSync(
      path.join(clone, "evidence", state.evidenceFiles[`browser:${owner.id}`].path),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0, `missing ${owner.id} evidence must fail final`);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  coveredRegressionIds.add(18);

  {
    const clone = cloneSimulation(base);
    const owner = REQUIRED_BROWSER_OWNERS[0];
    mutateBoundEvidence(
      clone,
      `browser:${owner.id}`,
      (evidence) => {
        evidence.identity.commitSha = "f".repeat(40);
      },
      `browser:${owner.id}`,
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /another candidate, artifact, or harness/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(19);
  }

  for (const mutation of [
    {
      name: "phase8",
      binding: "phase8EvidenceSha256",
      mutate(evidence) {
        evidence.measurements[0].operations[0].passed = false;
      },
      expected: /Phase 8 small fingerprintCold raw evidence is incomplete/,
    },
    {
      name: "runtime-smoke",
      binding: "runtimeSmokeEvidenceSha256",
      mutate(evidence) {
        evidence.tests[0].outcome = "failed";
      },
      expected: /per-test outcomes contradict/,
    },
    {
      name: `browser:${REQUIRED_BROWSER_OWNERS[0].id}`,
      binding: `browser:${REQUIRED_BROWSER_OWNERS[0].id}`,
      mutate(evidence) {
        evidence.tests[0].skipped = true;
      },
      expected: /outcomes are not complete and clean/,
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(clone, mutation.name, mutation.mutate, mutation.binding);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, mutation.expected);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
  coveredRegressionIds.add(24);

  for (const mutation of [
    {
      name: "root-contract-hash",
      mutate(evidence) {
        evidence.phaseTimings.rootContract.sha256 = "0".repeat(64);
      },
      expected: /timing root contract|retained timing file contradicts/,
    },
    {
      name: "path-outside-root",
      mutate(evidence) {
        evidence.phaseTimings.rootContract.relativePath = "../phase-timings.json";
      },
      expected: /timing root contract|retained timing file contradicts/,
    },
    {
      name: "artifact-mismatch",
      mutate(evidence) {
        evidence.phaseTimings.identity.artifactSha256 = "0".repeat(64);
      },
      expected: /cross-run or cross-artifact|retained timing file contradicts/,
    },
    {
      name: "cross-certification-timing",
      mutate(evidence) {
        evidence.phaseTimings.identity.certificationId = "another-certification";
      },
      expected: /cross-run or cross-artifact|retained timing file contradicts/,
    },
    {
      name: "missing-completion-marker",
      mutate(evidence) {
        delete evidence.phaseTimings.completionMarker;
      },
      expected: /completion binding|retained timing file contradicts/,
    },
    {
      name: "wrong-runtime-profile",
      mutate(evidence) {
        evidence.stageEnvironment.profileId = "source-validation";
      },
      expected: /stage-environment profile binding/,
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(
      clone,
      "runtime-smoke",
      mutation.mutate,
      "runtimeSmokeEvidenceSha256",
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0, `${mutation.name} must fail final standalone`);
    assert.match(`${child.stdout}\n${child.stderr}`, mutation.expected);
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  for (const mutation of [
    {
      name: "missing-runtime-root-binding",
      mutate(timing) {
        delete timing.evidenceBinding;
      },
    },
    {
      name: "timing-completion-false",
      mutate(timing) {
        timing.complete = false;
      },
    },
  ]) {
    const clone = cloneSimulation(base);
    const cloneEvidenceRoot = path.join(clone, "evidence");
    const cloneState = readCertificationState(
      path.join(cloneEvidenceRoot, "certification-state.json"),
    );
    const timingPath = path.join(
      cloneEvidenceRoot,
      cloneState.evidenceFiles["runtime-phase-timings"].path,
    );
    const timing = JSON.parse(readFileSync(timingPath, "utf8"));
    mutation.mutate(timing);
    writeFileSync(timingPath, canonicalJsonBytes(timing));
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0, `${mutation.name} must fail final standalone`);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /hash mismatch|retained timing file contradicts/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(
      clone,
      "continuity",
      (evidence) => {
        evidence.inputSnapshots.extractedArchive = "0".repeat(64);
      },
      "continuityEvidenceSha256",
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /continuity input snapshots|continuity final seal/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(25);
  }

  {
    const child = finalSimulationChild(base, { allowSimulation: false });
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /cannot certify a real candidate/);
    coveredRegressionIds.add(26);
  }

  {
    const clone = cloneSimulation(base);
    unlinkSync(
      path.join(
        clone,
        "evidence/archive/extracted/.local/production-artifact-evidence/semantic-event-journal.json",
      ),
    );
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /semantic journal v2 is missing/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(8);
  }

  {
    const clone = cloneSimulation(base);
    mutateBoundEvidence(clone, "archive-inventory", (inventory) => {
      inventory.inventorySha256 = "f".repeat(64);
    });
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /archive inventory (?:semantic digest|evidence does not match)/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }

  for (const mutation of [
    {
      id: 7,
      mutate(manifest) {
        manifest.schema = "interior-ai.production-artifact-evidence.v2";
        manifest.validatorVersion = 2;
      },
      expected: /unsupported production evidence schema or validator version/,
    },
    {
      id: 9,
      mutate(manifest) {
        manifest.build.mtime = manifest.build.completedAt;
      },
      expected: /filesystem timestamps cannot populate portable semantic evidence/,
    },
    {
      id: 10,
      mutate(manifest) {
        manifest.generatedSourceCheck.completedAt = manifest.build.completedAt;
        manifest.build.startedAt = manifest.generatedSourceCheck.startedAt;
      },
      expected: /evidence timestamps are stale or contradictory|generated-source\/build ordering invalid/,
    },
    {
      id: 21,
      mutate(manifest) {
        manifest.generatedSourceCheck.command = "noncanonical-generated-source-check";
      },
      expected: /generated-source drift check command is not canonical/,
    },
  ]) {
    const clone = cloneSimulation(base);
    mutateExtractedManifest(clone, mutation.mutate);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, mutation.expected);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(mutation.id);
  }

  {
    const clone = cloneSimulation(base);
    const statePath = path.join(clone, "evidence/certification-state.json");
    const state = readCertificationState(statePath);
    state.stages["archive-preflight"].status = "pending";
    writeCertificationState(statePath, state);
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /requires passed stage archive-preflight/);
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(15);
  }

  {
    const child = spawnSync(
      process.execPath,
      ["scripts/production-archive.mjs", "plan"],
      {
        cwd: path.join(base, "source"),
        env: { ...process.env, PRODUCTION_ARCHIVE_PLAN: "" },
        encoding: "utf8",
      },
    );
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /archive plan path must be absolute/);
  }

  {
    const child = spawnSync(process.execPath, ["-e", "process.exit(17)"], {
      encoding: "utf8",
    });
    assert.throws(
      () =>
        assertCertificationChildPassed(
          child,
          "producer child failed",
          "ARCHIVE_FAILURE",
          true,
        ),
      (error) => {
        assert.equal(error.message, "producer child failed");
        assert.equal(error.exitCode, 17);
        assert.equal(error.classification, "ARCHIVE_FAILURE");
        assert.equal(error.consumed, true);
        return true;
      },
      "a producer child nonzero exit must propagate through the harness adapter",
    );
    coveredRegressionIds.add(23);
  }

  {
    const clone = cloneSimulation(base);
    const evidenceRoot = path.join(clone, "evidence");
    const state = readCertificationState(
      path.join(evidenceRoot, "certification-state.json"),
    );
    const owner = REQUIRED_BROWSER_OWNERS[0];
    const rawDescriptor = state.evidenceFiles[`browser-report:${owner.id}`];
    unlinkSync(path.join(evidenceRoot, rawDescriptor.path));
    const child = finalSimulationChild(clone);
    assert.notEqual(child.status, 0);
    assert.match(
      `${child.stdout}\n${child.stderr}`,
      /browser-report:|missing or unreadable/,
    );
    rmSync(path.dirname(clone), { recursive: true, force: true });
    coveredRegressionIds.add(22);
  }

  for (const target of ["package.json", ".next/BUILD_ID"]) {
    const statePath = path.join(evidenceRoot, "certification-state.json");
    const state = readCertificationState(statePath);
    const stateBytes = readFileSync(statePath);
    const mutationPath = path.join(
      target === "package.json" ? canonicalRoot : sourceRoot,
      target,
    );
    const original = readFileSync(mutationPath);
    let child;
    try {
      writeFileSync(mutationPath, `changed-${target}\n`);
      child = spawnSync(
        process.execPath,
        ["scripts/production-certification.mjs", "state:validate"],
        {
          cwd: canonicalRoot,
          env: {
            ...process.env,
            PRODUCTION_CERTIFICATION_STATE: statePath,
            CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
            PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
            CERTIFICATION_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
            CERTIFICATION_EXPECTED_TREE_SHA: state.candidate.treeSha,
            CERTIFICATION_EXPECTED_PARENT_SHA: state.candidate.parentSha,
            CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
            CERTIFICATION_QUALIFICATION_MODE: "1",
            CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:20:00.000Z",
          },
          encoding: "utf8",
        },
      );
    } finally {
      writeFileSync(mutationPath, original);
    }
    assert.notEqual(child.status, 0);
    const report = parseCertificationStageResult(child.stdout).details
      .validationReport;
    assert.equal(
      report.invalidationPlan.stage,
      target === "package.json" ? "source-validation" : "build",
    );
    assert.equal(readFileSync(statePath).equals(stateBytes), true);
    assert.equal(readCertificationState(statePath).completionState, "passed");
  }
  {
    const statePath = path.join(evidenceRoot, "certification-state.json");
    const state = readCertificationState(statePath);
    const stateBytes = readFileSync(statePath);
    const originalTracking = spawnSync(
      "git",
      ["rev-parse", "refs/remotes/origin/integration"],
      { cwd: canonicalRoot, encoding: "utf8" },
    ).stdout.trim();
    const movedTracking = spawnSync(
      "git",
      [
        "update-ref",
        "refs/remotes/origin/integration",
        state.candidate.commitSha,
      ],
      { cwd: canonicalRoot, encoding: "utf8" },
    );
    assert.equal(movedTracking.status, 0);
    let child;
    try {
      child = spawnSync(
        process.execPath,
        ["scripts/production-certification.mjs", "state:validate"],
        {
          cwd: canonicalRoot,
          env: {
            ...process.env,
            PRODUCTION_CERTIFICATION_STATE: statePath,
            CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
            PRODUCTION_EVIDENCE_CANDIDATE_ID: state.candidate.id,
            CERTIFICATION_EXPECTED_COMMIT_SHA: state.candidate.commitSha,
            CERTIFICATION_EXPECTED_TREE_SHA: state.candidate.treeSha,
            CERTIFICATION_EXPECTED_PARENT_SHA: state.candidate.parentSha,
            CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
            CERTIFICATION_QUALIFICATION_MODE: "1",
            CERTIFICATION_INVALIDATED_AT: "2026-08-14T00:30:00.000Z",
          },
          encoding: "utf8",
        },
      );
    } finally {
      spawnSync(
        "git",
        ["update-ref", "refs/remotes/origin/integration", originalTracking],
        { cwd: canonicalRoot, encoding: "utf8" },
      );
    }
    assert.notEqual(child.status, 0);
    assert.match(`${child.stdout}\n${child.stderr}`, /integration readiness/);
    assert.equal(
      readCertificationState(statePath).stages["integration-ready"].status,
      "passed",
    );
    assert.equal(readFileSync(statePath).equals(stateBytes), true);
  }

  const cleanupStatePath = path.join(evidenceRoot, "certification-state.json");
  const cleanupState = readCertificationState(cleanupStatePath);
  const cleanup = spawnSync(
    process.execPath,
    ["scripts/production-certification.mjs", "worktrees:cleanup"],
    {
      cwd: canonicalRoot,
      env: {
        ...process.env,
        PRODUCTION_CERTIFICATION_STATE: cleanupStatePath,
        CERTIFICATION_EVIDENCE_ROOT: evidenceRoot,
        PRODUCTION_EVIDENCE_CANDIDATE_ID: cleanupState.candidate.id,
        CERTIFICATION_EXPECTED_COMMIT_SHA: cleanupState.candidate.commitSha,
        CERTIFICATION_EXPECTED_TREE_SHA: cleanupState.candidate.treeSha,
        CERTIFICATION_EXPECTED_PARENT_SHA: cleanupState.candidate.parentSha,
        CERTIFICATION_EXECUTION_CLASS: "deterministic-simulation",
        CERTIFICATION_QUALIFICATION_MODE: "1",
      },
      encoding: "utf8",
    },
  );
  assert.equal(cleanup.status, 0, `${cleanup.stdout}\n${cleanup.stderr}`);
  rmSync(base, { recursive: true, force: true });
}

assert.deepEqual(
  [...coveredRegressionIds].sort((left, right) => left - right),
  Array.from({ length: 43 }, (_, index) => index + 1),
  "every documented regression must be exercised by an executable assertion",
);

assert.deepEqual(CERTIFICATION_FAILURE_CLASSIFICATIONS, [
  "PRECONDITION_ORCHESTRATION_FAILURE",
  "INFRASTRUCTURE_TRANSIENT",
  "SOURCE_CONTRACT_FAILURE",
  "BUILD_FAILURE",
  "ARCHIVE_FAILURE",
  "PERFORMANCE_GATE_FAILURE",
  "PRODUCT_ASSERTION_FAILURE",
  "ARTIFACT_CONTINUITY_FAILURE",
  "FINAL_EVIDENCE_FAILURE",
]);
assert.ok(harnessSourceIdentity(repositoryRoot).sha256.match(/^[0-9a-f]{64}$/));
assert.equal(
  CERTIFICATION_STAGE_ORDER.length,
  12,
  "Production certification harness tests passed.",
);

console.log("Production certification harness tests passed.");
