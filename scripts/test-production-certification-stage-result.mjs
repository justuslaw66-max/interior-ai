import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import {
  createCertificationStageCommandResult,
  formatCertificationStageResult,
  parseCertificationStageResult,
  sealCertificationStageResult,
  validateCertificationStageResult,
} from "./production-certification-stage-result-contract.mjs";
import { runCertificationStageCommand } from "./production-certification-stage-result-consumer.mjs";
import {
  certificationStateSha256,
  certificationValidationReportIssues,
  completeCertificationStage,
  createCertificationValidationReport,
  createCertificationState,
  replaceCertificationDatabaseLifecycle,
  sealCertificationState,
  startCertificationStage,
  writeCertificationState,
} from "./production-certification-state.mjs";

const CERTIFICATION_ID = "stage-result-certification-fixture";
const CANDIDATE_ID = "stage-result-candidate-fixture";
const COMMIT_SHA = "1".repeat(40);
const TREE_SHA = "2".repeat(40);
const PARENT_SHA = "3".repeat(40);
const HARNESS_SHA = "4".repeat(64);
const NONCE = "stage-result-invocation-0001";
const CREATED_AT = "2026-08-19T00:00:00.000Z";
const STARTED_AT = "2026-08-19T00:00:01.000Z";
const COMPLETED_AT = "2026-08-19T00:00:02.000Z";

function descriptor(evidenceRoot, relativePath, value) {
  const filePath = path.join(evidenceRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = canonicalJsonBytes(value);
  writeFileSync(filePath, bytes);
  return { path: relativePath, sha256: sha256Bytes(bytes) };
}

function pendingState() {
  return createCertificationState({
    certificationId: CERTIFICATION_ID,
    candidateId: CANDIDATE_ID,
    commitSha: COMMIT_SHA,
    treeSha: TREE_SHA,
    parentSha: PARENT_SHA,
    harnessSourceSha256: HARNESS_SHA,
    executionClass: "deterministic-simulation",
    createdAt: CREATED_AT,
  });
}

function invocation(statePath, preState, command = "doctor") {
  return {
    command,
    nonce: NONCE,
    statePath,
    preState,
    preStateSha256: certificationStateSha256(preState),
    capturedAt: CREATED_AT,
  };
}

function doctorFixture(
  root,
  {
    passed = true,
    consumed = false,
    exitCode = passed ? 0 : 17,
    signal = null,
    spawnErrorClassification = null,
  } = {},
) {
  const evidenceRoot = path.join(root, "evidence");
  mkdirSync(evidenceRoot, { recursive: true });
  const statePath = path.join(evidenceRoot, "state.json");
  const preState = pendingState();
  const running = startCertificationStage(preState, {
    stage: "doctor",
    startedAt: STARTED_AT,
  });
  const doctor = descriptor(evidenceRoot, "doctor/evidence.json", {
    schema: "interior-ai.production-certification-doctor-fixture.v1",
    certificationId: CERTIFICATION_ID,
    candidateId: CANDIDATE_ID,
    valid: passed,
    complete: true,
  });
  const failureClassification = spawnErrorClassification
    ? "INFRASTRUCTURE_TRANSIENT"
    : "SOURCE_CONTRACT_FAILURE";
  const postState = completeCertificationStage(running, {
    stage: "doctor",
    passed,
    completedAt: COMPLETED_AT,
    exitCode,
    signal,
    failureClassification: passed ? null : failureClassification,
    consumedSubstantiveGate: consumed,
    outputHashes: passed ? { doctor: doctor.sha256 } : {},
    evidenceFiles: { doctor },
  });
  writeCertificationState(statePath, postState);
  const value = createCertificationStageCommandResult({
    invocation: invocation(statePath, preState),
    commandResult: passed ? { valid: true } : null,
    commandError: passed
      ? null
      : {
          classification: failureClassification,
          spawnErrorClassification,
        },
    wrapperExitCode: passed ? 0 : 1,
    evidenceRoot,
  });
  return { evidenceRoot, statePath, preState, postState, doctor, value };
}

function validateFixture(fixture, value = fixture.value, overrides = {}) {
  return validateCertificationStageResult({
    value,
    statePath: fixture.statePath,
    evidenceRoot: fixture.evidenceRoot,
    expectedCommand: "doctor",
    expectedInvocationNonce: NONCE,
    expectedPreStateSha256: certificationStateSha256(fixture.preState),
    expectedCertificationId: CERTIFICATION_ID,
    expectedCandidate: {
      id: CANDIDATE_ID,
      commitSha: COMMIT_SHA,
      treeSha: TREE_SHA,
    },
    expectedHarnessSourceSha256: HARNESS_SHA,
    verifyCurrentSource: false,
    ...overrides,
  });
}

function rejected(action, pattern) {
  assert.throws(action, pattern);
}

const root = mkdtempSync(path.join(tmpdir(), "stage-result-contract-"));
const passedCases = [];

try {
  const baseline = doctorFixture(path.join(root, "baseline"));
  const frame = formatCertificationStageResult(baseline.value);
  const npmNoise = [
    "> interior-ai@0.1.0 certification:source-validation",
    "> node scripts/production-certification.mjs source-validation",
  ].join("\n");
  const prismaNoise = [
    "Prisma schema loaded from prisma/schema.prisma",
    "Datasource db: PostgreSQL database certification_fixture",
  ].join("\n");

  assert.equal(
    parseCertificationStageResult(`${npmNoise}\n${frame}`).aggregateSha256,
    baseline.value.aggregateSha256,
  );
  passedCases.push("npm-prose-before-valid-frame");

  assert.equal(
    parseCertificationStageResult(`${prismaNoise}\n${frame}`).aggregateSha256,
    baseline.value.aggregateSha256,
  );
  passedCases.push("multiline-prisma-before-valid-frame");

  assert.equal(
    parseCertificationStageResult(
      `${JSON.stringify({ valid: false, stale: true })}\n${frame}`,
    ).aggregateSha256,
    baseline.value.aggregateSha256,
  );
  passedCases.push("earlier-unframed-json-ignored");

  assert.equal(validateFixture(baseline).valid, true);
  passedCases.push("matching-state-and-evidence-accepted");

  rejected(() => parseCertificationStageResult(npmNoise), /frame is missing/);
  passedCases.push("missing-frame-rejected");

  rejected(
    () =>
      parseCertificationStageResult(
        "INTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 {malformed}\n",
      ),
    /malformed JSON/,
  );
  passedCases.push("malformed-frame-rejected");

  rejected(
    () =>
      parseCertificationStageResult(
        `${JSON.stringify(baseline.value)}\nINTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 {malformed}\n`,
      ),
    /malformed JSON/,
  );
  passedCases.push("malformed-trailing-result-rejected");

  rejected(
    () => parseCertificationStageResult(`${frame}${frame}`),
    /multiple competing/,
  );
  passedCases.push("competing-frames-rejected");

  rejected(
    () => parseCertificationStageResult(`${frame}trailing log\n`),
    /final non-empty/,
  );
  passedCases.push("trailing-output-rejected");

  const pendingRoot = path.join(root, "pending");
  mkdirSync(pendingRoot, { recursive: true });
  const pendingStatePath = path.join(pendingRoot, "state.json");
  writeCertificationState(pendingStatePath, baseline.preState);
  assert.equal(
    validateFixture(baseline, baseline.value, { statePath: pendingStatePath })
      .valid,
    false,
  );
  passedCases.push("zero-exit-pending-state-rejected");

  const missingEvidenceState = structuredClone(baseline.postState);
  delete missingEvidenceState.evidenceFiles.doctor;
  const resealedMissingEvidence = sealCertificationState(missingEvidenceState);
  writeCertificationState(baseline.statePath, resealedMissingEvidence);
  assert.equal(validateFixture(baseline).valid, false);
  writeCertificationState(baseline.statePath, baseline.postState);
  passedCases.push("passed-stage-missing-evidence-rejected");

  const sourceRoot = path.join(root, "source-failed-check");
  const sourceEvidenceRoot = path.join(sourceRoot, "evidence");
  mkdirSync(sourceEvidenceRoot, { recursive: true });
  const sourceStatePath = path.join(sourceEvidenceRoot, "state.json");
  const sourcePre = pendingState();
  const sourceDoctorDescriptor = descriptor(
    sourceEvidenceRoot,
    "doctor/evidence.json",
    { valid: true, complete: true },
  );
  const sourceDoctorRunning = startCertificationStage(sourcePre, {
    stage: "doctor",
    startedAt: STARTED_AT,
  });
  const doctorPassed = completeCertificationStage(sourceDoctorRunning, {
    stage: "doctor",
    passed: true,
    completedAt: COMPLETED_AT,
    exitCode: 0,
    outputHashes: { doctor: sourceDoctorDescriptor.sha256 },
    evidenceFiles: { doctor: sourceDoctorDescriptor },
  });
  const sourceRunning = startCertificationStage(doctorPassed, {
    stage: "source-validation",
    startedAt: "2026-08-19T00:00:03.000Z",
  });
  const orderedCheckIds = Array.from(
    { length: 19 },
    (_, index) => `source-check-${String(index + 1).padStart(2, "0")}`,
  );
  const sourceDescriptor = descriptor(
    sourceEvidenceRoot,
    "source-validation/evidence.json",
    {
      schema: "interior-ai.production-certification-source-validation.v4",
      orderedCheckIds,
      checks: orderedCheckIds.map((id, index) => ({
        id,
        passed: index !== 7,
      })),
      passed: true,
      completionMarker: { complete: true, result: "passed" },
    },
  );
  const sourcePost = completeCertificationStage(sourceRunning, {
    stage: "source-validation",
    passed: true,
    completedAt: "2026-08-19T00:00:04.000Z",
    exitCode: 0,
    consumedSubstantiveGate: true,
    outputHashes: { sourceValidation: sourceDescriptor.sha256 },
    evidenceFiles: { "source-validation": sourceDescriptor },
  });
  writeCertificationState(sourceStatePath, sourcePost);
  const sourceValue = createCertificationStageCommandResult({
    invocation: invocation(sourceStatePath, doctorPassed, "source-validation"),
    commandResult: { valid: true },
    wrapperExitCode: 0,
    evidenceRoot: sourceEvidenceRoot,
  });
  assert.equal(
    validateCertificationStageResult({
      value: sourceValue,
      statePath: sourceStatePath,
      evidenceRoot: sourceEvidenceRoot,
      expectedCommand: "source-validation",
      expectedInvocationNonce: NONCE,
      expectedPreStateSha256: certificationStateSha256(doctorPassed),
      verifyCurrentSource: false,
    }).valid,
    false,
  );
  passedCases.push("passed-source-check-failure-rejected");

  writeFileSync(
    path.join(baseline.evidenceRoot, baseline.doctor.path),
    "tampered\n",
  );
  assert.equal(validateFixture(baseline).valid, false);
  writeFileSync(
    path.join(baseline.evidenceRoot, baseline.doctor.path),
    canonicalJsonBytes({
      schema: "interior-ai.production-certification-doctor-fixture.v1",
      certificationId: CERTIFICATION_ID,
      candidateId: CANDIDATE_ID,
      valid: true,
      complete: true,
    }),
  );
  passedCases.push("evidence-hash-mismatch-rejected");

  const wrongStateSha = structuredClone(baseline.value);
  wrongStateSha.transition.postStateSha256 = "f".repeat(64);
  assert.equal(validateFixture(baseline, wrongStateSha).valid, false);
  passedCases.push("physical-state-sha-mismatch-rejected");

  const crossCandidate = structuredClone(baseline.value);
  crossCandidate.certificationId = "another-certification";
  crossCandidate.candidate.id = "another-candidate";
  crossCandidate.candidate.commitSha = "a".repeat(40);
  assert.equal(validateFixture(baseline, crossCandidate).valid, false);
  passedCases.push("cross-certification-candidate-commit-rejected");

  const wrongAttempt = structuredClone(baseline.value);
  wrongAttempt.stage.attemptId = "doctor:999";
  wrongAttempt.stage.attemptNumber = 999;
  assert.equal(validateFixture(baseline, wrongAttempt).valid, false);
  passedCases.push("stage-attempt-mismatch-rejected");

  const wrongConsumed = structuredClone(baseline.value);
  wrongConsumed.consumedSubstantiveGate = true;
  assert.equal(validateFixture(baseline, wrongConsumed).valid, false);
  passedCases.push("consumed-gate-mismatch-rejected");

  const failure = doctorFixture(path.join(root, "failure"), {
    passed: false,
    consumed: true,
    exitCode: 17,
  });
  assert.equal(validateFixture(failure).valid, true);
  assert.equal(failure.value.process.childExitCode, 17);
  assert.equal(failure.value.consumedSubstantiveGate, true);
  passedCases.push("nonzero-consumed-failure-retained");

  const cleanupRoot = path.join(root, "abort-cleanup");
  const cleanupFailure = doctorFixture(cleanupRoot, {
    passed: false,
    consumed: true,
    exitCode: 17,
  });
  const cleanupOriginalFailure = {
    classification: "SOURCE_CONTRACT_FAILURE",
    originalStage: "doctor",
    attempt: 1,
    consumedSubstantiveGate: true,
    failedStateSha256: certificationStateSha256(cleanupFailure.postState),
    evidenceReferences: { doctor: cleanupFailure.doctor },
  };
  const cleanupLifecycle = {
    currentState: "abort-absence-verified",
    cleanup: {
      originalFailureRetained: true,
      failedRunRehabilitated: false,
    },
    failure: cleanupOriginalFailure,
    valid: false,
  };
  const cleanupDescriptor = descriptor(
    cleanupFailure.evidenceRoot,
    "database/lifecycle.json",
    cleanupLifecycle,
  );
  const cleanupPostState = replaceCertificationDatabaseLifecycle(
    cleanupFailure.postState,
    {
      schema:
        "interior-ai.production-certification-database-lifecycle-binding.v1",
      certificationId: CERTIFICATION_ID,
      candidateId: CANDIDATE_ID,
      candidateCommitSha: COMMIT_SHA,
      candidateTreeSha: TREE_SHA,
      databaseName: "pc_stage_result_fixture",
      databaseNameSha256: "5".repeat(64),
      databaseIdentitySha256: "6".repeat(64),
      lifecycleState: "abort-absence-verified",
      evidence: cleanupDescriptor,
      updatedAt: COMPLETED_AT,
    },
  );
  writeCertificationState(cleanupFailure.statePath, cleanupPostState);
  const cleanupValue = createCertificationStageCommandResult({
    invocation: invocation(
      cleanupFailure.statePath,
      cleanupFailure.postState,
      "database:abort-cleanup",
    ),
    commandResult: {
      valid: false,
      classification: "SOURCE_CONTRACT_FAILURE",
      consumedSubstantiveGate: true,
      lifecycleState: "abort-absence-verified",
      originalFailureRetained: true,
      originalFailure: cleanupOriginalFailure,
      failedRunRehabilitated: false,
      targetAbsent: true,
      evidenceSha256: cleanupDescriptor.sha256,
    },
    wrapperExitCode: 1,
    evidenceRoot: cleanupFailure.evidenceRoot,
  });
  const cleanupValidationOptions = {
    statePath: cleanupFailure.statePath,
    evidenceRoot: cleanupFailure.evidenceRoot,
    expectedCommand: "database:abort-cleanup",
    expectedInvocationNonce: NONCE,
    expectedPreStateSha256: certificationStateSha256(
      cleanupFailure.postState,
    ),
    verifyCurrentSource: false,
  };
  assert.equal(
    validateCertificationStageResult({
      value: cleanupValue,
      ...cleanupValidationOptions,
    }).valid,
    true,
  );
  const cleanupWrongConsumed = sealCertificationStageResult({
    ...structuredClone(cleanupValue),
    consumedSubstantiveGate: false,
  });
  assert.equal(
    validateCertificationStageResult({
      value: cleanupWrongConsumed,
      ...cleanupValidationOptions,
    }).valid,
    false,
  );
  passedCases.push("abort-cleanup-retains-consumed-original-failure");

  const automaticAbortFixture = doctorFixture(
    path.join(root, "automatic-abort-precondition"),
  );
  const activeLifecycleDescriptor = descriptor(
    automaticAbortFixture.evidenceRoot,
    "database/active-lifecycle.json",
    { currentState: "active" },
  );
  const preAutomaticAbortState = replaceCertificationDatabaseLifecycle(
    automaticAbortFixture.postState,
    {
      schema:
        "interior-ai.production-certification-database-lifecycle-binding.v1",
      certificationId: CERTIFICATION_ID,
      candidateId: CANDIDATE_ID,
      candidateCommitSha: COMMIT_SHA,
      candidateTreeSha: TREE_SHA,
      databaseName: "pc_stage_result_automatic_abort_fixture",
      databaseNameSha256: "7".repeat(64),
      databaseIdentitySha256: "8".repeat(64),
      lifecycleState: "active",
      evidence: activeLifecycleDescriptor,
      updatedAt: COMPLETED_AT,
    },
  );
  writeCertificationState(
    automaticAbortFixture.statePath,
    preAutomaticAbortState,
  );
  const automaticAbortInvocation = invocation(
    automaticAbortFixture.statePath,
    preAutomaticAbortState,
    "archive-preflight",
  );
  const automaticOriginalFailure = {
    classification: "SOURCE_CONTRACT_FAILURE",
    originalStage: "archive-preflight",
    attempt: null,
    consumedSubstantiveGate: false,
    failedStateSha256: null,
    evidenceReferences: {},
  };
  const failedLifecycleDescriptor = descriptor(
    automaticAbortFixture.evidenceRoot,
    "database/failed-lifecycle.json",
    {
      currentState: "failed",
      failure: automaticOriginalFailure,
      cleanupFailure: {
        classification: "DATABASE_LIFECYCLE_FAILURE",
      },
    },
  );
  const postAutomaticAbortState = replaceCertificationDatabaseLifecycle(
    preAutomaticAbortState,
    {
      ...preAutomaticAbortState.databaseLifecycle,
      lifecycleState: "failed",
      evidence: failedLifecycleDescriptor,
      updatedAt: "2026-08-14T00:00:00.500Z",
    },
  );
  writeCertificationState(
    automaticAbortFixture.statePath,
    postAutomaticAbortState,
  );
  const automaticAbortValue = createCertificationStageCommandResult({
    invocation: automaticAbortInvocation,
    commandError: {
      classification: "SOURCE_CONTRACT_FAILURE",
    },
    cleanupError: Object.assign(new Error("database cleanup denied"), {
      databaseLifecycleResult: {},
    }),
    wrapperExitCode: 1,
    evidenceRoot: automaticAbortFixture.evidenceRoot,
  });
  const automaticAbortValidationOptions = {
    statePath: automaticAbortFixture.statePath,
    evidenceRoot: automaticAbortFixture.evidenceRoot,
    expectedCommand: "archive-preflight",
    expectedInvocationNonce: NONCE,
    expectedPreStateSha256: certificationStateSha256(
      preAutomaticAbortState,
    ),
    verifyCurrentSource: false,
  };
  assert.equal(automaticAbortValue.result, "precondition-failure");
  assert.equal(automaticAbortValue.stage.attemptNumber, null);
  assert.equal(automaticAbortValue.consumedSubstantiveGate, false);
  assert.equal(
    automaticAbortValue.details.automaticAbort.originalFailure.originalStage,
    "archive-preflight",
  );
  assert.equal(
    automaticAbortValue.details.automaticAbort.cleanupFailureClassification,
    "DATABASE_LIFECYCLE_FAILURE",
  );
  assert.equal(
    validateCertificationStageResult({
      value: automaticAbortValue,
      ...automaticAbortValidationOptions,
    }).valid,
    true,
  );
  const lostOriginalAttribution = sealCertificationStageResult({
    ...structuredClone(automaticAbortValue),
    details: {
      automaticAbort: {
        ...structuredClone(automaticAbortValue.details.automaticAbort),
        originalFailure: {
          ...structuredClone(
            automaticAbortValue.details.automaticAbort.originalFailure,
          ),
          originalStage: null,
        },
      },
    },
  });
  assert.equal(
    validateCertificationStageResult({
      value: lostOriginalAttribution,
      ...automaticAbortValidationOptions,
    }).valid,
    false,
  );
  const completedLifecycleDescriptor = descriptor(
    automaticAbortFixture.evidenceRoot,
    "database/completed-lifecycle.json",
    {
      currentState: "abort-absence-verified",
      failure: automaticOriginalFailure,
      cleanup: {
        originalFailureRetained: true,
        failedRunRehabilitated: false,
      },
    },
  );
  const completedAutomaticAbortState = replaceCertificationDatabaseLifecycle(
    preAutomaticAbortState,
    {
      ...preAutomaticAbortState.databaseLifecycle,
      lifecycleState: "abort-absence-verified",
      evidence: completedLifecycleDescriptor,
      updatedAt: "2026-08-14T00:00:00.600Z",
    },
  );
  writeCertificationState(
    automaticAbortFixture.statePath,
    completedAutomaticAbortState,
  );
  const completedAutomaticAbortValue = createCertificationStageCommandResult({
    invocation: automaticAbortInvocation,
    commandError: {
      classification: "SOURCE_CONTRACT_FAILURE",
    },
    cleanupResult: { currentState: "abort-absence-verified" },
    wrapperExitCode: 1,
    evidenceRoot: automaticAbortFixture.evidenceRoot,
  });
  assert.equal(
    completedAutomaticAbortValue.details.automaticAbort.outcome,
    "completed",
  );
  assert.equal(
    completedAutomaticAbortValue.details.automaticAbort
      .cleanupFailureClassification,
    null,
  );
  assert.equal(
    validateCertificationStageResult({
      value: completedAutomaticAbortValue,
      ...automaticAbortValidationOptions,
    }).valid,
    true,
  );
  passedCases.push(
    "automatic-abort-denial-retains-precondition-and-cleanup-attribution",
  );

  const signaled = doctorFixture(path.join(root, "signal"), {
    passed: false,
    consumed: true,
    exitCode: null,
    signal: "SIGTERM",
  });
  assert.equal(validateFixture(signaled).valid, true);
  assert.equal(signaled.value.process.signal, "SIGTERM");
  const spawnFailed = doctorFixture(path.join(root, "spawn"), {
    passed: false,
    consumed: false,
    exitCode: 255,
    spawnErrorClassification: "child-spawn-error",
  });
  assert.equal(validateFixture(spawnFailed).valid, true);
  assert.equal(
    spawnFailed.value.process.spawnErrorClassification,
    "child-spawn-error",
  );
  const forgedCompletedSpawn = sealCertificationStageResult({
    ...structuredClone(failure.value),
    process: {
      ...failure.value.process,
      spawnErrorClassification: "child-spawn-error",
    },
  });
  assert.equal(validateFixture(failure, forgedCompletedSpawn).valid, false);
  passedCases.push("signal-and-spawn-failure-retained");

  const wrapperSource = readFileSync(
    path.join(process.cwd(), "scripts/production-certification.mjs"),
    "utf8",
  );
  const consumerSource = readFileSync(
    path.join(
      process.cwd(),
      "scripts/production-certification-stage-result-consumer.mjs",
    ),
    "utf8",
  );
  const simulationSource = readFileSync(
    path.join(process.cwd(), "scripts/production-certification-simulation.mjs"),
    "utf8",
  );
  assert.match(wrapperSource, /formatCertificationStageResult/);
  assert.doesNotMatch(
    wrapperSource,
    /console\.log\(JSON\.stringify\(commandError\.certificationResult\)\)/,
  );
  assert.doesNotMatch(consumerSource, /parseCertificationChildJson|parseLastJson/);
  assert.match(simulationSource, /runCertificationStageCommand/);
  assert.match(simulationSource, /sourceValidationCheckCount/);
  const actualWrapperConsumption = await runCertificationStageCommand({
    command: "state:validate",
    repositoryRoot: process.cwd(),
    environment: {
      ...process.env,
      CERTIFICATION_EVIDENCE_ROOT: baseline.evidenceRoot,
      PRODUCTION_CERTIFICATION_STATE: baseline.statePath,
      CERTIFICATION_STAGE_RESULT_NONCE:
        "actual-wrapper-stage-result-0001",
    },
    verifyCurrentSource: false,
  });
  assert.equal(actualWrapperConsumption.result.result, "precondition-failure");
  assert.equal(
    actualWrapperConsumption.nextStateSha256,
    certificationStateSha256(baseline.postState),
  );
  passedCases.push("real-source-wrapper-consumer-build-boundary-registered");

  const wrongPreconditionConsumption = sealCertificationStageResult({
    ...structuredClone(actualWrapperConsumption.result),
    consumedSubstantiveGate: true,
  });
  assert.equal(
    validateCertificationStageResult({
      value: wrongPreconditionConsumption,
      statePath: baseline.statePath,
      evidenceRoot: baseline.evidenceRoot,
      expectedCommand: "state:validate",
      expectedInvocationNonce: "actual-wrapper-stage-result-0001",
      expectedPreStateSha256: certificationStateSha256(baseline.postState),
      verifyCurrentSource: false,
    }).valid,
    false,
  );
  const wrongPreconditionSpawn = sealCertificationStageResult({
    ...structuredClone(actualWrapperConsumption.result),
    process: {
      ...actualWrapperConsumption.result.process,
      spawnErrorClassification: "manually-injected-spawn-result",
    },
  });
  assert.equal(
    validateCertificationStageResult({
      value: wrongPreconditionSpawn,
      statePath: baseline.statePath,
      evidenceRoot: baseline.evidenceRoot,
      expectedCommand: "state:validate",
      expectedInvocationNonce: "actual-wrapper-stage-result-0001",
      expectedPreStateSha256: certificationStateSha256(baseline.postState),
      verifyCurrentSource: false,
    }).valid,
    false,
  );
  passedCases.push("resealed-precondition-consumption-and-spawn-rejected");

  const privatePath = "/private/tmp/production-certification-secret/state.json";
  const privateToken = "stage-result-sensitive-value-0001";
  const unsafeReport = createCertificationValidationReport({
    state: baseline.postState,
    command: "state:validate",
    valid: false,
    classification: "SOURCE_CONTRACT_FAILURE",
    issues: [
      `evidence is unavailable at ${privatePath}`,
      `sensitive comparator ${privateToken}`,
    ],
  });
  const sanitizedValue = createCertificationStageCommandResult({
    invocation: invocation(
      baseline.statePath,
      baseline.postState,
      "state:validate",
    ),
    commandResult: unsafeReport,
    wrapperExitCode: 1,
    evidenceRoot: baseline.evidenceRoot,
    sensitiveValues: [privateToken],
  });
  const serializedSanitizedValue = JSON.stringify(sanitizedValue);
  assert.doesNotMatch(serializedSanitizedValue, /\/private\/tmp/);
  assert.doesNotMatch(serializedSanitizedValue, new RegExp(privateToken));
  assert.equal(
    certificationValidationReportIssues(
      sanitizedValue.details.validationReport,
    ).length,
    0,
  );
  passedCases.push("producer-redacts-and-reseals-private-validation-details");

  rmSync(path.join(baseline.evidenceRoot, baseline.doctor.path));
  const missingEvidenceConsumption = await runCertificationStageCommand({
    command: "state:validate",
    repositoryRoot: process.cwd(),
    environment: {
      ...process.env,
      CERTIFICATION_EVIDENCE_ROOT: baseline.evidenceRoot,
      PRODUCTION_CERTIFICATION_STATE: baseline.statePath,
      CERTIFICATION_STAGE_RESULT_NONCE:
        "missing-evidence-stage-result-0001",
    },
    verifyCurrentSource: false,
  });
  assert.equal(
    missingEvidenceConsumption.result.result,
    "precondition-failure",
  );
  assert.equal(
    missingEvidenceConsumption.nextStateSha256,
    certificationStateSha256(baseline.postState),
  );
  assert.doesNotMatch(
    missingEvidenceConsumption.stdout,
    /\/(?:Users|home|private|var|tmp)\//,
  );
  passedCases.push("invalid-state-result-is-redacted-and-consumable");

  assert.equal(
    passedCases.length,
    25,
    "Production certification stage-result consumer tests passed.",
  );
  process.stdout.write(
    `CERTIFICATION_STAGE_RESULT_REGRESSION_RESULT ${JSON.stringify({
      schema:
        "interior-ai.production-certification-stage-result-regression.v1",
      passed: true,
      passedCases,
    })}\n`,
  );
  console.log("Production certification stage-result consumer tests passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
