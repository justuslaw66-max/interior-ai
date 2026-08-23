import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CERTIFICATION_FAILURE_CLASSIFICATIONS,
  CERTIFICATION_STAGE_ORDER,
  canonicalJsonBytes,
  isCandidateId,
  isSha256,
  isSourceSha,
} from "./production-certification-contract.mjs";
import {
  certificationStageEvidenceFiles,
  certificationStateSha256,
  certificationValidationReportIssues,
  readCertificationState,
  sealCertificationInvalidationPlan,
  sealCertificationValidationReport,
  validateCertificationState,
} from "./production-certification-state.mjs";
import { resolveRetainedExternalEvidenceFile } from "./playwright-report-path.mjs";
import { readCertificationPreStateFailureReceipt } from "./production-certification-worktrees.mjs";

export const PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA =
  "interior-ai.production-certification-stage-command-result.v1";
export const PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION = 1;
export const PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX =
  "INTERIOR_AI_CERTIFICATION_STAGE_RESULT_V1 ";
export const PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV =
  "CERTIFICATION_STAGE_RESULT_NONCE";
export const PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE =
  "production-certification-stage-wrapper";
export const PRODUCTION_CERTIFICATION_STAGE_RESULT_STATE_PATH_CLASSIFICATION =
  "authorized-external-certification-state";

const RESULT_SEAL_DOMAIN =
  "interior-ai.production-certification-stage-command-result-seal.v1\n";
const CONTRACT_SEAL_DOMAIN =
  "interior-ai.production-certification-stage-command-result-contract.v1\n";
const CONTRACT_SOURCE_PATH = fileURLToPath(import.meta.url);
const RESULT_VALUES = new Set(["passed", "failed", "precondition-failure"]);
const EVIDENCE_MARKERS = new Set([
  "complete",
  "failed",
  "invalid",
  "passed",
  "retained",
]);

function isPreStateInitializationFailure(value) {
  return (
    value?.command?.id === "state:init" &&
    value?.result === "precondition-failure" &&
    value?.details?.preStateFailure?.stateCreated === false
  );
}

export const PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS = Object.freeze([
  "state:init",
  "prepare-resources",
  "doctor",
  "database:provision",
  "database:verify-initial",
  "database:verify-final",
  "database:drop",
  "database:verify-absent",
  "database:abort-cleanup",
  "database:status",
  "source-validation",
  "state:validate",
  "build:eligibility",
  "state:reconcile",
  "resume",
  "build",
  "archive-preflight",
  "archive",
  "extracted-archive-preflight",
  "phase8",
  "runtime-smoke",
  "browser-owners",
  "final-standalone",
  "continuity",
  "integration-ready",
  "worktrees:cleanup",
]);

const COMMAND_STAGE_IDS = Object.freeze(
  Object.fromEntries([
    ...CERTIFICATION_STAGE_ORDER.map((stage) => [stage, stage]),
    ["state:init", "state-initialization"],
    ["prepare-resources", "resource-preparation"],
    ["database:provision", "database-provision"],
    ["database:verify-initial", "database-verify-initial"],
    ["database:verify-final", "database-verify-final"],
    ["database:drop", "database-drop"],
    ["database:verify-absent", "database-verify-absent"],
    ["database:abort-cleanup", "database-abort-cleanup"],
    ["database:status", "database-status"],
    ["state:validate", "state-validation"],
    ["build:eligibility", "build-eligibility"],
    ["state:reconcile", "state-reconciliation"],
    ["resume", "resume-planning"],
    ["worktrees:cleanup", "worktree-cleanup"],
  ]),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\n") === [...expected].sort().join("\n")
  );
}

function isCanonicalUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    new Date(value).toISOString() === value
  );
}

function resultPayload(value) {
  const payload = structuredClone(value);
  delete payload.aggregateSha256;
  return payload;
}

function aggregateResultSha256(value) {
  return sha256(
    Buffer.concat([
      Buffer.from(RESULT_SEAL_DOMAIN),
      canonicalJsonBytes(resultPayload(value)),
    ]),
  );
}

export function sealCertificationStageResult(value) {
  const payload = resultPayload(value);
  return Object.freeze({
    ...payload,
    aggregateSha256: aggregateResultSha256(payload),
  });
}

function contractPayload() {
  return {
    schema: PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA,
    version: PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION,
    transport: "final-framed-stdout-record",
    prefix: PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX,
    mode: PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE,
    statePathClassification:
      PRODUCTION_CERTIFICATION_STAGE_RESULT_STATE_PATH_CLASSIFICATION,
    commands: [...PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS],
  };
}

export function certificationStageResultContractIdentity() {
  const payload = contractPayload();
  return Object.freeze({
    schema: payload.schema,
    version: payload.version,
    sha256: sha256(
      Buffer.concat([
        Buffer.from(CONTRACT_SEAL_DOMAIN),
        canonicalJsonBytes(payload),
      ]),
    ),
    sourceSha256: sha256(readFileSync(CONTRACT_SOURCE_PATH)),
  });
}

export function isCertificationStageResultCommand(command) {
  return PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS.includes(command);
}

export function createCertificationStageResultNonce(environment = process.env) {
  const supplied = environment[PRODUCTION_CERTIFICATION_STAGE_RESULT_NONCE_ENV]?.trim();
  if (supplied) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(supplied)) {
      throw new Error("certification stage-result invocation nonce is malformed");
    }
    return supplied;
  }
  return randomUUID();
}

function readOptionalState(statePath) {
  if (!statePath) return null;
  try {
    return readCertificationState(statePath);
  } catch {
    return null;
  }
}

export function captureCertificationStageResultInvocation({
  command,
  environment = process.env,
} = {}) {
  if (!isCertificationStageResultCommand(command)) return null;
  const statePath = environment.PRODUCTION_CERTIFICATION_STATE?.trim() ?? null;
  const preState = readOptionalState(statePath);
  return Object.freeze({
    command,
    nonce: createCertificationStageResultNonce(environment),
    statePath,
    preState,
    preStateSha256: preState ? certificationStateSha256(preState) : null,
    capturedAt: new Date().toISOString(),
  });
}

function evidenceCompletionMarker(bytes) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return "retained";
  }
  if (value?.completionMarker?.complete === true) {
    return value.completionMarker.result === "failed" ? "failed" : "complete";
  }
  if (value?.complete === true) return "complete";
  if (value?.passed === true) return "passed";
  if (value?.passed === false) return "failed";
  if (value?.valid === true) return "passed";
  if (value?.valid === false) return "invalid";
  return "retained";
}

function evidenceReferences(state, stageId, evidenceRoot) {
  let descriptors = {};
  if (CERTIFICATION_STAGE_ORDER.includes(stageId)) {
    descriptors = certificationStageEvidenceFiles(state, stageId);
  } else if (stageId === "resource-preparation" && state.resourcePreparation?.evidence) {
    descriptors = {
      "resource-preparation": state.resourcePreparation.evidence,
    };
  } else if (stageId.startsWith("database-") && state.databaseLifecycle?.evidence) {
    descriptors = { "database-lifecycle": state.databaseLifecycle.evidence };
  }
  return Object.entries(descriptors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, descriptor]) => {
      const bytes = readFileSync(path.join(evidenceRoot, descriptor.path));
      return {
        id,
        path: descriptor.path,
        sha256: descriptor.sha256,
        completionMarker: evidenceCompletionMarker(bytes),
      };
    });
}

function stageTransitionIdentity({ command, preState, postState }) {
  const stageId = COMMAND_STAGE_IDS[command];
  const record = CERTIFICATION_STAGE_ORDER.includes(stageId)
    ? postState?.stages?.[stageId]
    : null;
  const preAttemptCount = CERTIFICATION_STAGE_ORDER.includes(stageId)
    ? (preState?.stages?.[stageId]?.attempts?.length ?? 0)
    : 0;
  const attempt =
    record?.attempts?.length > preAttemptCount ? record.attempts.at(-1) : null;
  return {
    stageId,
    record,
    attempt,
    stageCompletionMarker:
      attempt?.status ??
      (command === "state:init" && postState
        ? "initialized"
        : command === "prepare-resources" && postState?.resourcePreparation
          ? "prepared"
          : command.startsWith("database:")
            ? (postState?.databaseLifecycle?.lifecycleState ?? "unchanged")
            : "unchanged"),
  };
}

function resultOutcome({ command, commandResult, commandError, attempt }) {
  if (attempt?.status === "passed") return "passed";
  if (attempt?.status === "failed") return "failed";
  if (commandError) return "precondition-failure";
  if (command === "database:abort-cleanup") return "failed";
  return commandResult?.valid === false ? "precondition-failure" : "passed";
}

function resultClassification({ commandResult, commandError, attempt, result }) {
  if (attempt?.failureClassification) return attempt.failureClassification;
  if (typeof commandResult?.classification === "string") {
    return commandResult.classification;
  }
  if (typeof commandError?.classification === "string") {
    return commandError.classification;
  }
  if (result === "failed" || result === "precondition-failure") {
    return "PRECONDITION_ORCHESTRATION_FAILURE";
  }
  return null;
}

function sanitizeStageResultString(value, sensitiveValues = []) {
  let sanitized = value
    .replace(
      /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^\s"'<>]+/gi,
      "<REDACTED_CONNECTION_URL>",
    )
    .replace(
      /\/(?:Users|home|private|var|tmp)\/[^\n\r"'`]+/g,
      "<REDACTED_ABSOLUTE_PATH>",
    );
  for (const sensitive of sensitiveValues.filter(
    (entry) => typeof entry === "string" && entry.length >= 8,
  )) {
    sanitized = sanitized.split(sensitive).join("<REDACTED_SENSITIVE_VALUE>");
  }
  return sanitized;
}

export function redactCertificationStageResultDiagnostic(
  value,
  sensitiveValues = certificationStageResultSensitiveValues(),
) {
  return sanitizeStageResultString(
    value instanceof Error ? value.message : String(value),
    sensitiveValues,
  ).slice(0, 1_000);
}

function sanitizeStageResultValue(value, sensitiveValues = []) {
  if (typeof value === "string") {
    return sanitizeStageResultString(value, sensitiveValues);
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeStageResultValue(entry, sensitiveValues),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeStageResultValue(entry, sensitiveValues),
      ]),
    );
  }
  return value;
}

function safeValidationReport(report, sensitiveValues) {
  const sanitized = sanitizeStageResultValue(report, sensitiveValues);
  if (sanitized?.invalidationPlan) {
    const plan = structuredClone(sanitized.invalidationPlan);
    delete plan.seal;
    sanitized.invalidationPlan = sealCertificationInvalidationPlan(plan);
  }
  delete sanitized.seal;
  return sealCertificationValidationReport(sanitized);
}

function safeCommandDetails(command, commandResult, sensitiveValues) {
  if (!commandResult || typeof commandResult !== "object") return null;
  if (command === "prepare-resources") {
    return {
      idempotent: commandResult.idempotent === true,
      destinationCount: commandResult.destinationCount,
      evidence: commandResult.evidence ?? null,
    };
  }
  if (command === "state:validate" || command === "build:eligibility") {
    return {
      validationReport: safeValidationReport(commandResult, sensitiveValues),
    };
  }
  if (command === "resume") {
    if (commandResult.valid === false) {
      return {
        validationReport: safeValidationReport(
          commandResult,
          sensitiveValues,
        ),
      };
    }
    return {
      complete: commandResult.complete,
      nextStage: commandResult.nextStage,
      canonicalCommand: commandResult.canonicalCommand,
    };
  }
  if (command === "state:reconcile") {
    return {
      invalidatedStage: commandResult.invalidatedStage,
      cascadingStages: commandResult.cascadingStages,
    };
  }
  if (command === "worktrees:cleanup") {
    return { cleanedRoles: commandResult.cleanedRoles };
  }
  if (command === "database:abort-cleanup") {
    return {
      originalFailureRetained:
        commandResult.originalFailureRetained === true,
      failedRunRehabilitated:
        commandResult.failedRunRehabilitated === true,
      originalFailure: structuredClone(commandResult.originalFailure),
    };
  }
  return null;
}

function automaticAbortDetails({
  command,
  postState,
  evidenceRoot,
  cleanupError,
  cleanupResult,
}) {
  if (
    !CERTIFICATION_STAGE_ORDER.includes(COMMAND_STAGE_IDS[command]) ||
    (!cleanupResult && !cleanupError?.databaseLifecycleResult)
  ) {
    return null;
  }
  const descriptor = postState.databaseLifecycle?.evidence;
  if (
    !descriptor ||
    typeof descriptor.path !== "string" ||
    !isSha256(descriptor.sha256)
  ) {
    throw new Error(
      "automatic database abort result is missing lifecycle evidence",
    );
  }
  const bytes = readFileSync(path.join(evidenceRoot, descriptor.path));
  if (sha256(bytes) !== descriptor.sha256) {
    throw new Error("automatic database abort lifecycle evidence changed");
  }
  const lifecycle = JSON.parse(bytes.toString("utf8"));
  const originalFailure = lifecycle.failure;
  if (!originalFailure) {
    throw new Error("automatic database abort lost the original failure");
  }
  return {
    automaticAbort: {
      outcome: cleanupError ? "failed" : "completed",
      lifecycleState: lifecycle.currentState,
      originalFailureRetained: true,
      originalFailure: {
        classification: originalFailure.classification,
        originalStage: originalFailure.originalStage,
        attempt: originalFailure.attempt ?? null,
        consumedSubstantiveGate:
          originalFailure.consumedSubstantiveGate,
        failedStateSha256: originalFailure.failedStateSha256 ?? null,
        evidenceReferences: structuredClone(
          originalFailure.evidenceReferences ?? {},
        ),
      },
      cleanupFailureClassification:
        lifecycle.cleanupFailure?.classification ?? null,
      failedRunRehabilitated: false,
      evidence: structuredClone(descriptor),
    },
  };
}

export function createCertificationStageCommandResult({
  invocation,
  commandResult = null,
  commandError = null,
  cleanupError = null,
  cleanupResult = null,
  terminalSignal = null,
  wrapperExitCode = null,
  evidenceRoot,
  sensitiveValues = [],
  completedAt = new Date().toISOString(),
} = {}) {
  if (!invocation || !isCertificationStageResultCommand(invocation.command)) {
    throw new Error("certification stage-result invocation is missing or unsupported");
  }
  const postState = readOptionalState(invocation.statePath);
  if (!postState) {
    if (
      invocation.command === "state:init" &&
      commandError?.certificationPreStateFailure
    ) {
      const { receipt, descriptor } = commandError.certificationPreStateFailure;
      const contract = certificationStageResultContractIdentity();
      const details = {
        preStateFailure: {
          stateCreated: false,
          defectClassifications: structuredClone(receipt.defectClassifications),
          createdResourceInventory: structuredClone(
            receipt.createdResourceInventory,
          ),
          rollback: structuredClone(receipt.rollback),
          terminalRegistrationAbsence: structuredClone(
            receipt.terminalRegistrationAbsence,
          ),
          receipt: structuredClone(descriptor),
        },
      };
      const payload = {
        schema: PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA,
        version: PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION,
        certificationId: receipt.certificationId,
        candidate: structuredClone(receipt.candidate),
        harness: structuredClone(receipt.harness),
        contract,
        command: {
          id: invocation.command,
          mode: PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE,
        },
        stage: {
          id: COMMAND_STAGE_IDS[invocation.command],
          attemptId: null,
          attemptNumber: null,
        },
        invocationNonce: invocation.nonce,
        result: "precondition-failure",
        valid: false,
        classification: "PRECONDITION_ORCHESTRATION_FAILURE",
        details,
        consumedSubstantiveGate: false,
        process: {
          childExitCode: null,
          wrapperExitCode: wrapperExitCode ?? 1,
          signal: terminalSignal,
          spawnErrorClassification: null,
        },
        transition: {
          preStateSha256: null,
          postStateSha256: null,
          statePathClassification:
            PRODUCTION_CERTIFICATION_STAGE_RESULT_STATE_PATH_CLASSIFICATION,
        },
        evidence: [
          {
            id: "pre-state-failure",
            path: descriptor.path,
            sha256: descriptor.sha256,
            completionMarker: "failed",
          },
        ],
        stageCompletionMarker:
          receipt.rollback.outcome === "completed"
            ? "pre-state-rollback-completed"
            : "pre-state-rollback-failed",
        startedAt: receipt.completedAt,
        completedAt: receipt.completedAt,
      };
      const value = Object.freeze({
        ...payload,
        aggregateSha256: aggregateResultSha256(payload),
      });
      const publicationIssues = certificationStageResultPublicationIssues(
        value,
        { sensitiveValues },
      );
      if (publicationIssues.length > 0) {
        throw new Error(
          `certification stage result is unsafe to publish: ${publicationIssues.join("; ")}`,
        );
      }
      return value;
    }
    throw new Error("certification stage result requires a physical post-command state");
  }
  const transition = stageTransitionIdentity({
    command: invocation.command,
    preState: invocation.preState,
    postState,
  });
  const result = resultOutcome({
    command: invocation.command,
    commandResult,
    commandError,
    attempt: transition.attempt,
  });
  const classification = resultClassification({
    commandResult,
    commandError,
    attempt: transition.attempt,
    result,
  });
  const valid = result === "passed";
  const observedWrapperExitCode =
    wrapperExitCode ??
    (terminalSignal ? (terminalSignal === "SIGINT" ? 130 : 143) : valid ? 0 : 1);
  const contract = certificationStageResultContractIdentity();
  const details =
    automaticAbortDetails({
      command: invocation.command,
      postState,
      evidenceRoot,
      cleanupError,
      cleanupResult,
    }) ??
    safeCommandDetails(
      invocation.command,
      commandResult,
      sensitiveValues,
    );
  const payload = {
    schema: PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA,
    version: PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION,
    certificationId: postState.certificationId,
    candidate: {
      id: postState.candidate.id,
      commitSha: postState.candidate.commitSha,
      treeSha: postState.candidate.treeSha,
    },
    harness: structuredClone(postState.harness),
    contract,
    command: {
      id: invocation.command,
      mode: PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE,
    },
    stage: {
      id: transition.stageId,
      attemptId: transition.attempt?.id ?? null,
      attemptNumber: transition.attempt?.number ?? null,
    },
    invocationNonce: invocation.nonce,
    result,
    valid,
    classification,
    details,
    consumedSubstantiveGate:
      transition.attempt?.consumedSubstantiveGate ??
      (invocation.command === "database:abort-cleanup"
        ? commandResult?.consumedSubstantiveGate === true
        : false),
    process: {
      childExitCode: transition.attempt?.exitCode ?? null,
      wrapperExitCode: observedWrapperExitCode,
      signal: transition.attempt?.signal ?? terminalSignal ?? null,
      spawnErrorClassification:
        transition.attempt
          ? (commandError?.spawnErrorClassification ?? null)
          : null,
    },
    transition: {
      preStateSha256: invocation.preStateSha256,
      postStateSha256: certificationStateSha256(postState),
      statePathClassification:
        PRODUCTION_CERTIFICATION_STAGE_RESULT_STATE_PATH_CLASSIFICATION,
    },
    evidence: evidenceReferences(postState, transition.stageId, evidenceRoot),
    stageCompletionMarker: transition.stageCompletionMarker,
    startedAt:
      transition.attempt?.startedAt ??
      invocation.preState?.updatedAt ??
      postState.createdAt,
    completedAt:
      transition.attempt?.completedAt ?? postState.updatedAt ?? completedAt,
  };
  const value = Object.freeze({
    ...payload,
    aggregateSha256: aggregateResultSha256(payload),
  });
  const publicationIssues = certificationStageResultPublicationIssues(
    value,
    { sensitiveValues },
  );
  if (publicationIssues.length > 0) {
    throw new Error(
      `certification stage result is unsafe to publish: ${publicationIssues.join("; ")}`,
    );
  }
  return value;
}

export function formatCertificationStageResult(value) {
  return `${PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX}${JSON.stringify(value)}\n`;
}

export function parseCertificationStageResult(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  const nonEmpty = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== "");
  const framed = nonEmpty.filter(({ line }) =>
    line.startsWith(PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX),
  );
  if (framed.length === 0) {
    throw new Error("certification stage result frame is missing");
  }
  if (framed.length !== 1) {
    throw new Error("certification stage result has multiple competing frames");
  }
  if (framed[0].index !== nonEmpty.at(-1).index) {
    throw new Error("certification stage result is not the final non-empty stdout record");
  }
  const serialized = framed[0].line.slice(
    PRODUCTION_CERTIFICATION_STAGE_RESULT_PREFIX.length,
  );
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("certification stage result frame contains malformed JSON");
  }
  if (JSON.stringify(value) !== serialized) {
    throw new Error("certification stage result frame is not canonical single-line JSON");
  }
  return value;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, strings));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      strings.push(key);
      collectStrings(entry, strings);
    });
  }
  return strings;
}

function privateValueIssues(value, sensitiveValues = []) {
  const serialized = JSON.stringify(value);
  const issues = [];
  if (
    /(?:postgres(?:ql)?|mysql|mongodb):\/\//i.test(serialized) ||
    /(?:^|[^A-Za-z0-9])\/(?:Users|home|private|var|tmp)\//.test(serialized) ||
    /"(?:DATABASE_URL|password|cookie|session|oauth|authSecret|privateEnvironment)"/i.test(
      serialized,
    )
  ) {
    issues.push("certification stage result contains raw private-value material");
  }
  for (const sensitive of sensitiveValues.filter(
    (entry) => typeof entry === "string" && entry.length >= 8,
  )) {
    if (serialized.includes(sensitive)) {
      issues.push("certification stage result contains a supplied sensitive value");
      break;
    }
  }
  return issues;
}

function resultShapeIssues(value) {
  const issues = [];
  if (
    !exactKeys(value, [
      "schema",
      "version",
      "certificationId",
      "candidate",
      "harness",
      "contract",
      "command",
      "stage",
      "invocationNonce",
      "result",
      "valid",
      "classification",
      "details",
      "consumedSubstantiveGate",
      "process",
      "transition",
      "evidence",
      "stageCompletionMarker",
      "startedAt",
      "completedAt",
      "aggregateSha256",
    ]) ||
    value.schema !== PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA ||
    value.version !== PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION ||
    !exactKeys(value.candidate, ["id", "commitSha", "treeSha"]) ||
    !exactKeys(value.harness, ["version", "sourceSha256"]) ||
    !exactKeys(value.contract, ["schema", "version", "sha256", "sourceSha256"]) ||
    !exactKeys(value.command, ["id", "mode"]) ||
    !exactKeys(value.stage, ["id", "attemptId", "attemptNumber"]) ||
    !exactKeys(value.process, [
      "childExitCode",
      "wrapperExitCode",
      "signal",
      "spawnErrorClassification",
    ]) ||
    !exactKeys(value.transition, [
      "preStateSha256",
      "postStateSha256",
      "statePathClassification",
    ]) ||
    !Array.isArray(value.evidence)
  ) {
    issues.push("certification stage result shape is malformed or unsupported");
    return issues;
  }
  if (
    !isCandidateId(value.certificationId) ||
    !isCandidateId(value.candidate.id) ||
    !isSourceSha(value.candidate.commitSha) ||
    !isSourceSha(value.candidate.treeSha) ||
    !Number.isSafeInteger(value.harness.version) ||
    value.harness.version < 1 ||
    !isSha256(value.harness.sourceSha256) ||
    value.contract.schema !== PRODUCTION_CERTIFICATION_STAGE_RESULT_SCHEMA ||
    value.contract.version !== PRODUCTION_CERTIFICATION_STAGE_RESULT_VERSION ||
    !isSha256(value.contract.sha256) ||
    !isSha256(value.contract.sourceSha256) ||
    !PRODUCTION_CERTIFICATION_STAGE_RESULT_COMMANDS.includes(value.command.id) ||
    value.command.mode !== PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE ||
    typeof value.stage.id !== "string" ||
    !value.stage.id ||
    (value.stage.attemptId !== null &&
      typeof value.stage.attemptId !== "string") ||
    (value.stage.attemptNumber !== null &&
      (!Number.isSafeInteger(value.stage.attemptNumber) ||
        value.stage.attemptNumber < 1)) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value.invocationNonce) ||
    !RESULT_VALUES.has(value.result) ||
    value.valid !== (value.result === "passed") ||
    (value.details !== null &&
      (Array.isArray(value.details) || typeof value.details !== "object")) ||
    typeof value.consumedSubstantiveGate !== "boolean" ||
    (value.transition.postStateSha256 !== null &&
      !isSha256(value.transition.postStateSha256)) ||
    (value.transition.postStateSha256 === null &&
      !isPreStateInitializationFailure(value)) ||
    (value.transition.preStateSha256 !== null &&
      !isSha256(value.transition.preStateSha256)) ||
    value.transition.statePathClassification !==
      PRODUCTION_CERTIFICATION_STAGE_RESULT_STATE_PATH_CLASSIFICATION ||
    typeof value.stageCompletionMarker !== "string" ||
    !value.stageCompletionMarker ||
    !isCanonicalUtcTimestamp(value.startedAt) ||
    !isCanonicalUtcTimestamp(value.completedAt) ||
    Date.parse(value.completedAt) < Date.parse(value.startedAt) ||
    !isSha256(value.aggregateSha256) ||
    value.aggregateSha256 !== aggregateResultSha256(value)
  ) {
    issues.push("certification stage result fields or aggregate are contradictory");
  }
  if (
    (value.result === "passed" && value.classification !== null) ||
    (value.result !== "passed" &&
      !CERTIFICATION_FAILURE_CLASSIFICATIONS.includes(value.classification)) ||
    (value.process.childExitCode !== null &&
      (!Number.isSafeInteger(value.process.childExitCode) ||
        value.process.childExitCode < 0 ||
        value.process.childExitCode > 255)) ||
    !Number.isSafeInteger(value.process.wrapperExitCode) ||
    value.process.wrapperExitCode < 0 ||
    value.process.wrapperExitCode > 255 ||
    (value.process.signal !== null && typeof value.process.signal !== "string") ||
    (value.process.spawnErrorClassification !== null &&
      value.process.spawnErrorClassification !== "child-spawn-error") ||
    (value.process.spawnErrorClassification === "child-spawn-error" &&
      (value.result !== "failed" ||
        value.classification !== "INFRASTRUCTURE_TRANSIENT" ||
        value.process.childExitCode !== 255 ||
        value.process.signal !== null)) ||
    (value.process.childExitCode === 255 &&
      value.process.spawnErrorClassification !== "child-spawn-error") ||
    (value.result === "passed" && value.process.wrapperExitCode !== 0) ||
    (value.result !== "passed" && value.process.wrapperExitCode === 0)
  ) {
    issues.push("certification stage result outcome or process status is contradictory");
  }
  for (const reference of value.evidence) {
    if (
      !exactKeys(reference, ["id", "path", "sha256", "completionMarker"]) ||
      typeof reference.id !== "string" ||
      !reference.id ||
      typeof reference.path !== "string" ||
      path.isAbsolute(reference.path) ||
      path.normalize(reference.path).startsWith("..") ||
      !isSha256(reference.sha256) ||
      !EVIDENCE_MARKERS.has(reference.completionMarker)
    ) {
      issues.push("certification stage result evidence reference is malformed");
      break;
    }
  }
  if (new Set(value.evidence.map((reference) => reference.id)).size !== value.evidence.length) {
    issues.push("certification stage result evidence inventory has duplicate IDs");
  }
  issues.push(...commandDetailsShapeIssues(value));
  issues.push(...privateValueIssues(value));
  return issues;
}

function portableEvidenceDescriptorMap(value) {
  return (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    Object.values(value).every(
      (descriptor) =>
        exactKeys(descriptor, ["path", "sha256"]) &&
        typeof descriptor.path === "string" &&
        !path.isAbsolute(descriptor.path) &&
        path.normalize(descriptor.path) === descriptor.path &&
        !descriptor.path.startsWith("..") &&
        isSha256(descriptor.sha256),
    )
  );
}

function automaticAbortDetailsShapeIssues(details) {
  const automaticAbort = details?.automaticAbort;
  const originalFailure = automaticAbort?.originalFailure;
  const outcomeValid = new Set(["completed", "failed"]).has(
    automaticAbort?.outcome,
  );
  const cleanupClassificationValid =
    automaticAbort?.outcome === "failed"
      ? automaticAbort.cleanupFailureClassification ===
        "DATABASE_LIFECYCLE_FAILURE"
      : automaticAbort?.cleanupFailureClassification === null;
  return exactKeys(details, ["automaticAbort"]) &&
    exactKeys(automaticAbort, [
      "outcome",
      "lifecycleState",
      "originalFailureRetained",
      "originalFailure",
      "cleanupFailureClassification",
      "failedRunRehabilitated",
      "evidence",
    ]) &&
    outcomeValid &&
    typeof automaticAbort.lifecycleState === "string" &&
    automaticAbort.lifecycleState.length > 0 &&
    automaticAbort.originalFailureRetained === true &&
    automaticAbort.failedRunRehabilitated === false &&
    cleanupClassificationValid &&
    exactKeys(originalFailure, [
      "classification",
      "originalStage",
      "attempt",
      "consumedSubstantiveGate",
      "failedStateSha256",
      "evidenceReferences",
    ]) &&
    CERTIFICATION_FAILURE_CLASSIFICATIONS.includes(
      originalFailure.classification,
    ) &&
    typeof originalFailure.originalStage === "string" &&
    originalFailure.originalStage.length > 0 &&
    (originalFailure.attempt === null ||
      (Number.isSafeInteger(originalFailure.attempt) &&
        originalFailure.attempt >= 1)) &&
    typeof originalFailure.consumedSubstantiveGate === "boolean" &&
    (originalFailure.failedStateSha256 === null ||
      isSha256(originalFailure.failedStateSha256)) &&
    portableEvidenceDescriptorMap(originalFailure.evidenceReferences) &&
    portableEvidenceDescriptorMap({ evidence: automaticAbort.evidence })
    ? []
    : ["automatic database abort result details are malformed"];
}

function commandDetailsShapeIssues(value) {
  const command = value.command?.id;
  const details = value.details;
  if (isPreStateInitializationFailure(value)) {
    const failure = details.preStateFailure;
    return exactKeys(details, ["preStateFailure"]) &&
      exactKeys(failure, [
        "stateCreated",
        "defectClassifications",
        "createdResourceInventory",
        "rollback",
        "terminalRegistrationAbsence",
        "receipt",
      ]) &&
      failure.stateCreated === false &&
      Array.isArray(failure.defectClassifications) &&
      failure.defectClassifications.length === 3 &&
      failure.rollback?.createdResourceInventory &&
      JSON.stringify(failure.createdResourceInventory) ===
        JSON.stringify(failure.rollback.createdResourceInventory) &&
      JSON.stringify(failure.terminalRegistrationAbsence) ===
        JSON.stringify(failure.rollback.terminalRegistrationAbsence) &&
      portableEvidenceDescriptorMap({ receipt: failure.receipt })
      ? []
      : ["pre-state initialization failure result details are malformed"];
  }
  if (value.result === "precondition-failure" && details === null) {
    return [];
  }
  if (
    CERTIFICATION_STAGE_ORDER.includes(COMMAND_STAGE_IDS[command]) &&
    Object.hasOwn(details ?? {}, "automaticAbort")
  ) {
    return automaticAbortDetailsShapeIssues(details);
  }
  if (new Set(["state:validate", "build:eligibility"]).has(command)) {
    return exactKeys(details, ["validationReport"]) &&
      certificationValidationReportIssues(details.validationReport).length === 0
      ? []
      : ["certification validation result details are malformed"];
  }
  if (command === "database:abort-cleanup") {
    const failure = details?.originalFailure;
    return exactKeys(details, [
      "originalFailureRetained",
      "failedRunRehabilitated",
      "originalFailure",
    ]) &&
      details.originalFailureRetained === true &&
      details.failedRunRehabilitated === false &&
      exactKeys(failure, [
        "classification",
        "originalStage",
        "attempt",
        "consumedSubstantiveGate",
        "failedStateSha256",
        "evidenceReferences",
      ]) &&
      CERTIFICATION_FAILURE_CLASSIFICATIONS.includes(failure.classification) &&
      (failure.originalStage === null ||
        typeof failure.originalStage === "string") &&
      (failure.attempt === null ||
        (Number.isSafeInteger(failure.attempt) && failure.attempt >= 1)) &&
      typeof failure.consumedSubstantiveGate === "boolean" &&
      (failure.failedStateSha256 === null ||
        isSha256(failure.failedStateSha256)) &&
      portableEvidenceDescriptorMap(failure.evidenceReferences)
      ? []
      : ["database abort-cleanup result details are malformed"];
  }
  if (command === "prepare-resources") {
    return exactKeys(details, ["idempotent", "destinationCount", "evidence"]) &&
      typeof details.idempotent === "boolean" &&
      Number.isSafeInteger(details.destinationCount) &&
      details.destinationCount >= 0 &&
      (details.evidence === null ||
        portableEvidenceDescriptorMap({ evidence: details.evidence }))
      ? []
      : ["resource-preparation result details are malformed"];
  }
  if (command === "resume") {
    if (exactKeys(details, ["validationReport"])) {
      return value.result === "precondition-failure" &&
        certificationValidationReportIssues(details.validationReport).length ===
          0
        ? []
        : ["resume validation result details are malformed"];
    }
    return exactKeys(details, ["complete", "nextStage", "canonicalCommand"]) &&
        typeof details.complete === "boolean" &&
        (details.nextStage === null || typeof details.nextStage === "string") &&
        (details.canonicalCommand === null ||
          typeof details.canonicalCommand === "string")
      ? []
      : ["resume result details are malformed"];
  }
  if (command === "state:reconcile") {
    return exactKeys(details, ["invalidatedStage", "cascadingStages"]) &&
      CERTIFICATION_STAGE_ORDER.includes(details.invalidatedStage) &&
      Array.isArray(details.cascadingStages) &&
      details.cascadingStages.every((stage) =>
        CERTIFICATION_STAGE_ORDER.includes(stage)
      )
      ? []
      : ["state-reconciliation result details are malformed"];
  }
  if (command === "worktrees:cleanup") {
    return exactKeys(details, ["cleanedRoles"]) &&
      Array.isArray(details.cleanedRoles) &&
      details.cleanedRoles.every((role) => typeof role === "string" && role)
      ? []
      : ["worktree-cleanup result details are malformed"];
  }
  return details === null
    ? []
    : ["certification stage result has unsupported command details"];
}

export function certificationStageResultPublicationIssues(
  value,
  { sensitiveValues = [] } = {},
) {
  return [
    ...new Set([
      ...resultShapeIssues(value),
      ...privateValueIssues(value, sensitiveValues),
    ]),
  ];
}

function physicalEvidenceReferences(state, stageId, evidenceRoot) {
  return evidenceReferences(state, stageId, evidenceRoot);
}

function databaseAbortCleanupStateIssues(value, state, evidenceRoot) {
  const issues = [];
  try {
    const descriptor = state.databaseLifecycle?.evidence;
    const bytes = readFileSync(path.join(evidenceRoot, descriptor.path));
    if (sha256(bytes) !== descriptor.sha256) {
      throw new Error("lifecycle evidence hash mismatch");
    }
    const lifecycle = JSON.parse(bytes.toString("utf8"));
    const failure = lifecycle.failure;
    const expectedOriginalFailure = {
      classification: failure?.classification ?? null,
      originalStage: failure?.originalStage ?? null,
      attempt: failure?.attempt ?? null,
      consumedSubstantiveGate:
        failure?.consumedSubstantiveGate ?? false,
      failedStateSha256: failure?.failedStateSha256 ?? null,
      evidenceReferences: structuredClone(
        failure?.evidenceReferences ?? {},
      ),
    };
    if (
      lifecycle.currentState !== "abort-absence-verified" ||
      lifecycle.cleanup?.originalFailureRetained !== true ||
      lifecycle.cleanup?.failedRunRehabilitated !== false ||
      value.result !== "failed" ||
      value.classification !== expectedOriginalFailure.classification ||
      value.consumedSubstantiveGate !==
        expectedOriginalFailure.consumedSubstantiveGate ||
      value.details?.originalFailureRetained !== true ||
      value.details?.failedRunRehabilitated !== false ||
      JSON.stringify(value.details?.originalFailure) !==
        JSON.stringify(expectedOriginalFailure)
    ) {
      issues.push(
        "database abort-cleanup result does not retain the physical original failure",
      );
    }
    if (CERTIFICATION_STAGE_ORDER.includes(failure?.originalStage)) {
      const record = state.stages?.[failure.originalStage];
      const attempt = record?.attempts?.at(-1);
      const physicalEvidence = certificationStageEvidenceFiles(
        state,
        failure.originalStage,
      );
      if (
        record?.status !== "failed" ||
        attempt?.status !== "failed" ||
        attempt?.number !== failure.attempt ||
        attempt?.failureClassification !== failure.classification ||
        attempt?.consumedSubstantiveGate !==
          failure.consumedSubstantiveGate ||
        !isSha256(failure.failedStateSha256) ||
        JSON.stringify(physicalEvidence) !==
          JSON.stringify(failure.evidenceReferences ?? {})
      ) {
        issues.push(
          "database abort-cleanup original failure contradicts the physical failed stage",
        );
      }
    }
  } catch {
    issues.push(
      "database abort-cleanup result is missing authoritative lifecycle evidence",
    );
  }
  return issues;
}

function automaticAbortStateIssues(value, state, evidenceRoot) {
  const details = value.details?.automaticAbort;
  if (!details) return [];
  const issues = [];
  try {
    const descriptor = state.databaseLifecycle?.evidence;
    if (
      details.evidence?.path !== descriptor?.path ||
      details.evidence?.sha256 !== descriptor?.sha256
    ) {
      throw new Error("automatic abort evidence descriptor mismatch");
    }
    const bytes = readFileSync(path.join(evidenceRoot, descriptor.path));
    if (sha256(bytes) !== descriptor.sha256) {
      throw new Error("automatic abort evidence hash mismatch");
    }
    const lifecycle = JSON.parse(bytes.toString("utf8"));
    const failure = lifecycle.failure;
    const expectedOriginalFailure = {
      classification: failure?.classification ?? null,
      originalStage: failure?.originalStage ?? null,
      attempt: failure?.attempt ?? null,
      consumedSubstantiveGate:
        failure?.consumedSubstantiveGate ?? false,
      failedStateSha256: failure?.failedStateSha256 ?? null,
      evidenceReferences: structuredClone(
        failure?.evidenceReferences ?? {},
      ),
    };
    const expectedCleanupClassification =
      lifecycle.cleanupFailure?.classification ?? null;
    const expectedOutcome = expectedCleanupClassification
      ? "failed"
      : "completed";
    if (
      state.databaseLifecycle?.lifecycleState !== lifecycle.currentState ||
      details.lifecycleState !== lifecycle.currentState ||
      details.outcome !== expectedOutcome ||
      details.cleanupFailureClassification !==
        expectedCleanupClassification ||
      details.originalFailureRetained !== true ||
      details.failedRunRehabilitated !== false ||
      JSON.stringify(details.originalFailure) !==
        JSON.stringify(expectedOriginalFailure) ||
      (expectedOutcome === "failed" && lifecycle.currentState !== "failed") ||
      (expectedOutcome === "completed" &&
        (lifecycle.currentState !== "abort-absence-verified" ||
          lifecycle.cleanup?.originalFailureRetained !== true ||
          lifecycle.cleanup?.failedRunRehabilitated !== false))
    ) {
      issues.push(
        "automatic database abort result does not match physical lifecycle evidence",
      );
    }
    if (
      CERTIFICATION_STAGE_ORDER.includes(failure?.originalStage) &&
      failure?.attempt !== null
    ) {
      const record = state.stages?.[failure.originalStage];
      const attempt = record?.attempts?.at(-1);
      if (
        record?.status !== "failed" ||
        attempt?.status !== "failed" ||
        attempt?.number !== failure.attempt ||
        attempt?.failureClassification !== failure.classification ||
        attempt?.consumedSubstantiveGate !==
          failure.consumedSubstantiveGate ||
        !isSha256(failure.failedStateSha256) ||
        JSON.stringify(
          certificationStageEvidenceFiles(state, failure.originalStage),
        ) !== JSON.stringify(failure.evidenceReferences ?? {})
      ) {
        issues.push(
          "automatic database abort original failure contradicts the physical failed stage",
        );
      }
    }
  } catch {
    issues.push(
      "automatic database abort result is missing authoritative lifecycle evidence",
    );
  }
  return issues;
}

function commandStateIssues(value, state, evidenceRoot) {
  const issues = [];
  const expectedStageId = COMMAND_STAGE_IDS[value.command.id];
  if (value.stage.id !== expectedStageId) {
    issues.push("certification stage result command/mode stage identity mismatch");
    return issues;
  }
  if (!CERTIFICATION_STAGE_ORDER.includes(expectedStageId)) {
    if (value.stage.attemptId !== null || value.stage.attemptNumber !== null) {
      issues.push("non-stage certification result carries an attempt identity");
    }
    if (
      value.result === "precondition-failure" &&
      value.transition.preStateSha256 !== value.transition.postStateSha256
    ) {
      issues.push("precondition failure changed the physical certification state");
    }
    if (
      value.process.childExitCode !== null ||
      value.process.spawnErrorClassification !== null ||
      (value.process.signal !== null &&
        !new Set(["SIGINT", "SIGTERM"]).has(value.process.signal)) ||
      (value.process.signal === "SIGINT" &&
        value.process.wrapperExitCode !== 130) ||
      (value.process.signal === "SIGTERM" &&
        value.process.wrapperExitCode !== 143) ||
      (value.process.signal === null &&
        value.process.wrapperExitCode !== (value.valid ? 0 : 1)) ||
      (value.command.id !== "database:abort-cleanup" &&
        value.consumedSubstantiveGate !== false)
    ) {
      issues.push(
        "non-stage certification result process or consumption semantics are contradictory",
      );
    }
    const expectedMarker =
      value.command.id === "state:init"
        ? "initialized"
        : value.command.id === "prepare-resources"
          ? state.resourcePreparation
            ? "prepared"
            : "unchanged"
          : value.command.id.startsWith("database:")
            ? (state.databaseLifecycle?.lifecycleState ?? "unchanged")
            : "unchanged";
    if (value.stageCompletionMarker !== expectedMarker) {
      issues.push("non-stage certification result completion marker mismatch");
    }
    if (
      new Set(["state:validate", "build:eligibility"]).has(value.command.id) &&
      value.details !== null
    ) {
      const report = value.details?.validationReport;
      const reportIssues = certificationValidationReportIssues(report);
      if (
        reportIssues.length > 0 ||
        report?.command !== value.command.id ||
        report?.stateSha256 !== value.transition.postStateSha256 ||
        report?.valid !== value.valid ||
        report?.classification !== value.classification ||
        report?.consumedSubstantiveGate !== false
      ) {
        issues.push("certification validation result details are contradictory");
      }
    }
    if (
      value.command.id === "resume" &&
      Object.hasOwn(value.details ?? {}, "validationReport")
    ) {
      const report = value.details.validationReport;
      if (
        certificationValidationReportIssues(report).length > 0 ||
        report.command !== "state:validate" ||
        report.stateSha256 !== value.transition.postStateSha256 ||
        report.valid !== false ||
        report.classification !== value.classification ||
        report.consumedSubstantiveGate !== false
      ) {
        issues.push("resume validation result details are contradictory");
      }
    }
    if (
      value.command.id === "prepare-resources" &&
      (value.details?.evidence?.path !==
        state.resourcePreparation?.evidence?.path ||
        value.details?.evidence?.sha256 !==
          state.resourcePreparation?.evidence?.sha256)
    ) {
      issues.push("resource-preparation result details do not match state");
    }
    if (value.command.id === "database:abort-cleanup") {
      issues.push(
        ...databaseAbortCleanupStateIssues(value, state, evidenceRoot),
      );
    }
    return issues;
  }
  const record = state.stages?.[expectedStageId];
  const attempt = record?.attempts?.at(-1);
  const automaticAbortIssues = automaticAbortStateIssues(
    value,
    state,
    evidenceRoot,
  );
  issues.push(...automaticAbortIssues);
  if (value.result === "precondition-failure") {
    const validAutomaticAbort =
      value.details?.automaticAbort && automaticAbortIssues.length === 0;
    const automaticOriginalFailure =
      value.details?.automaticAbort?.originalFailure;
    if (
      value.stage.attemptId !== null ||
      value.stage.attemptNumber !== null ||
      (value.transition.preStateSha256 !== value.transition.postStateSha256 &&
        !validAutomaticAbort) ||
      (validAutomaticAbort &&
        (automaticOriginalFailure.originalStage !== expectedStageId ||
          automaticOriginalFailure.attempt !== null ||
          automaticOriginalFailure.failedStateSha256 !== null ||
          automaticOriginalFailure.classification !== value.classification ||
          automaticOriginalFailure.consumedSubstantiveGate !== false)) ||
      value.consumedSubstantiveGate !== false ||
      value.process.childExitCode !== null ||
      value.process.spawnErrorClassification !== null ||
      (value.process.signal !== null &&
        !new Set(["SIGINT", "SIGTERM"]).has(value.process.signal)) ||
      (value.process.signal === "SIGINT" &&
        value.process.wrapperExitCode !== 130) ||
      (value.process.signal === "SIGTERM" &&
        value.process.wrapperExitCode !== 143) ||
      (value.process.signal === null && value.process.wrapperExitCode !== 1)
    ) {
      issues.push(
        "stage precondition failure carries a transition, attempt, or consumed process result",
      );
    }
    return issues;
  }
  if (
    !attempt ||
    value.stage.attemptId !== attempt.id ||
    value.stage.attemptNumber !== attempt.number ||
    value.result !== record.status ||
    value.stageCompletionMarker !== record.status ||
    value.consumedSubstantiveGate !== record.consumedSubstantiveGate ||
    value.process.childExitCode !== record.exitCode ||
    value.process.signal !== record.signal ||
    value.process.spawnErrorClassification !==
      (attempt.exitCode === 255 &&
      attempt.signal === null &&
      attempt.failureClassification === "INFRASTRUCTURE_TRANSIENT"
        ? "child-spawn-error"
        : null) ||
    value.classification !== record.failureClassification ||
    value.startedAt !== attempt.startedAt ||
    value.completedAt !== attempt.completedAt
  ) {
    issues.push(
      "certification stage result does not match physical stage/attempt/status/consumption",
    );
  }
  return issues;
}

function sourceCompletionIssues(value, state, evidenceRoot) {
  if (
    value.stage.id !== "source-validation" ||
    value.result !== "passed"
  ) {
    return [];
  }
  try {
    const descriptor = state.evidenceFiles?.["source-validation"];
    const evidence = JSON.parse(
      readFileSync(path.join(evidenceRoot, descriptor.path), "utf8"),
    );
    if (
      evidence.passed !== true ||
      evidence.completionMarker?.complete !== true ||
      evidence.completionMarker?.result !== "passed" ||
      !Array.isArray(evidence.orderedCheckIds) ||
      !Array.isArray(evidence.checks) ||
      evidence.checks.length !== evidence.orderedCheckIds.length ||
      evidence.checks.some((check, index) =>
        check.id !== evidence.orderedCheckIds[index] || check.passed !== true
      )
    ) {
      return ["passed source-validation result contains a failed or incomplete check"];
    }
  } catch {
    return ["passed source-validation result is missing its aggregate evidence"];
  }
  return [];
}

export function validateCertificationStageResult({
  value,
  statePath,
  evidenceRoot,
  repositoryRoot = process.cwd(),
  expectedCommand,
  expectedMode = PRODUCTION_CERTIFICATION_STAGE_RESULT_MODE,
  expectedInvocationNonce,
  expectedPreStateSha256,
  expectedCertificationId,
  expectedCandidate,
  expectedHarnessSourceSha256,
  sensitiveValues = [],
  verifyCurrentSource = true,
} = {}) {
  const issues = [
    ...resultShapeIssues(value),
    ...privateValueIssues(value, sensitiveValues),
  ];
  if (issues.length > 0) return { valid: false, issues, state: null };
  const contract = certificationStageResultContractIdentity();
  if (JSON.stringify(value.contract) !== JSON.stringify(contract)) {
    issues.push("certification stage result contract identity is stale or unknown");
  }
  if (
    value.command.id !== expectedCommand ||
    value.command.mode !== expectedMode
  ) {
    issues.push("certification stage result command/mode mismatch");
  }
  if (value.invocationNonce !== expectedInvocationNonce) {
    issues.push("certification stage result invocation nonce is stale");
  }
  if (
    expectedPreStateSha256 !== undefined &&
    value.transition.preStateSha256 !== expectedPreStateSha256
  ) {
    issues.push("certification stage result pre-transition state SHA mismatch");
  }
  if (isPreStateInitializationFailure(value)) {
    const requestedStateTarget = path.resolve(statePath);
    let stateTarget = requestedStateTarget;
    let root;
    try {
      root = realpathSync(evidenceRoot);
      stateTarget = path.join(
        realpathSync(path.dirname(requestedStateTarget)),
        path.basename(requestedStateTarget),
      );
    } catch {
      root = null;
    }
    if (
      !root ||
      (stateTarget !== root && !stateTarget.startsWith(`${root}${path.sep}`)) ||
      existsSync(stateTarget)
    ) {
      issues.push("pre-state initialization result contradicts physical state absence");
    }
    let receipt = null;
    try {
      receipt = readCertificationPreStateFailureReceipt({
        evidenceRoot,
        descriptor: value.details.preStateFailure.receipt,
        expectedInvocationNonce: expectedInvocationNonce,
      });
    } catch {
      issues.push("pre-state initialization failure receipt is unavailable or invalid");
    }
    if (receipt) {
      const expectedDetails = {
        stateCreated: false,
        defectClassifications: receipt.defectClassifications,
        createdResourceInventory: receipt.createdResourceInventory,
        rollback: receipt.rollback,
        terminalRegistrationAbsence: receipt.terminalRegistrationAbsence,
        receipt: value.details.preStateFailure.receipt,
      };
      if (
        JSON.stringify(value.details.preStateFailure) !==
          JSON.stringify(expectedDetails) ||
        value.certificationId !== receipt.certificationId ||
        JSON.stringify(value.candidate) !== JSON.stringify(receipt.candidate) ||
        JSON.stringify(value.harness) !== JSON.stringify(receipt.harness) ||
        value.completedAt !== receipt.completedAt ||
        value.stage.id !== "state-initialization" ||
        value.stage.attemptId !== null ||
        value.stage.attemptNumber !== null ||
        value.transition.preStateSha256 !== null ||
        value.transition.postStateSha256 !== null ||
        value.classification !== "PRECONDITION_ORCHESTRATION_FAILURE" ||
        value.consumedSubstantiveGate !== false ||
        value.process.childExitCode !== null ||
        value.process.wrapperExitCode !== 1 ||
        value.process.signal !== null ||
        value.process.spawnErrorClassification !== null ||
        value.stageCompletionMarker !==
          (receipt.rollback.outcome === "completed"
            ? "pre-state-rollback-completed"
            : "pre-state-rollback-failed") ||
        JSON.stringify(value.evidence) !==
          JSON.stringify([
            {
              id: "pre-state-failure",
              path: value.details.preStateFailure.receipt.path,
              sha256: value.details.preStateFailure.receipt.sha256,
              completionMarker: "failed",
            },
          ])
      ) {
        issues.push("pre-state initialization result contradicts its receipt");
      }
      if (
        expectedCertificationId &&
        value.certificationId !== expectedCertificationId
      ) {
        issues.push("certification stage result belongs to another certification");
      }
      if (
        expectedCandidate &&
        JSON.stringify(value.candidate) !== JSON.stringify(expectedCandidate)
      ) {
        issues.push("certification stage result candidate/commit/tree mismatch");
      }
      if (
        expectedHarnessSourceSha256 &&
        value.harness.sourceSha256 !== expectedHarnessSourceSha256
      ) {
        issues.push("certification stage result harness identity mismatch");
      }
    }
    return {
      valid: issues.length === 0,
      issues,
      state: null,
      nextStateSha256: null,
      evidence: value.evidence,
    };
  }
  let retainedState;
  try {
    retainedState = resolveRetainedExternalEvidenceFile({
      filePath: statePath,
      authorizedExternalRoot: evidenceRoot,
      repositoryRoot,
    });
  } catch {
    return {
      valid: false,
      issues: [
        ...issues,
        "physical certification state path is unauthorized",
      ],
      state: null,
    };
  }
  let bytes;
  try {
    bytes = readFileSync(retainedState.absolutePath);
  } catch {
    return {
      valid: false,
      issues: [...issues, "physical certification state is unavailable"],
      state: null,
    };
  }
  const physicalSha256 = sha256(bytes);
  let state;
  try {
    state = JSON.parse(bytes.toString("utf8"));
  } catch {
    return {
      valid: false,
      issues: [...issues, "physical certification state is malformed JSON"],
      state: null,
    };
  }
  if (!bytes.equals(canonicalJsonBytes(state))) {
    issues.push("physical certification state is not canonical JSON");
  }
  if (
    physicalSha256 !== certificationStateSha256(state) ||
    physicalSha256 !== value.transition.postStateSha256
  ) {
    issues.push("certification stage result post-transition state SHA mismatch");
  }
  if (
    value.certificationId !== state.certificationId ||
    (expectedCertificationId && value.certificationId !== expectedCertificationId)
  ) {
    issues.push("certification stage result belongs to another certification");
  }
  const stateCandidate = {
    id: state.candidate?.id,
    commitSha: state.candidate?.commitSha,
    treeSha: state.candidate?.treeSha,
  };
  if (
    JSON.stringify(value.candidate) !== JSON.stringify(stateCandidate) ||
    (expectedCandidate &&
      JSON.stringify(value.candidate) !== JSON.stringify(expectedCandidate))
  ) {
    issues.push("certification stage result candidate/commit/tree mismatch");
  }
  if (
    JSON.stringify(value.harness) !== JSON.stringify(state.harness) ||
    (expectedHarnessSourceSha256 &&
      value.harness.sourceSha256 !== expectedHarnessSourceSha256)
  ) {
    issues.push("certification stage result harness identity mismatch");
  }
  const validation = validateCertificationState({
    state,
    evidenceRoot,
    expectedCandidate: state.candidate,
    expectedHarnessSourceSha256: state.harness.sourceSha256,
    repositoryRoot,
    sourceValidationRoot: repositoryRoot,
    artifactRoot: repositoryRoot,
    verifyCurrentSource,
  });
  const physicalStateIssues = validation.issues.map((issue) =>
    sanitizeStageResultString(issue, sensitiveValues),
  );
  if (
    (new Set(["state:validate", "build:eligibility"]).has(
      value.command.id,
    ) ||
      (value.command.id === "resume" &&
        Object.hasOwn(value.details ?? {}, "validationReport"))) &&
    value.result === "precondition-failure"
  ) {
    const reportedIssues = value.details?.validationReport?.issues ?? [];
    if (
      physicalStateIssues.some((issue) => !reportedIssues.includes(issue))
    ) {
      issues.push(
        "certification validation result omits a physical state-validation issue",
      );
    }
  } else {
    issues.push(...physicalStateIssues);
  }
  issues.push(...commandStateIssues(value, state, evidenceRoot));
  issues.push(...sourceCompletionIssues(value, state, evidenceRoot));
  let physicalReferences = [];
  try {
    physicalReferences = physicalEvidenceReferences(
      state,
      value.stage.id,
      evidenceRoot,
    );
    if (JSON.stringify(value.evidence) !== JSON.stringify(physicalReferences)) {
      issues.push("certification stage result evidence inventory mismatch");
    }
    for (const reference of value.evidence) {
      const bytes = readFileSync(path.join(evidenceRoot, reference.path));
      if (
        sha256(bytes) !== reference.sha256 ||
        evidenceCompletionMarker(bytes) !== reference.completionMarker
      ) {
        issues.push(`certification stage result evidence mismatch: ${reference.id}`);
      }
    }
  } catch {
    issues.push("certification stage result evidence is unavailable");
  }
  return {
    valid: issues.length === 0,
    issues,
    state,
    nextStateSha256: issues.length === 0 ? physicalSha256 : null,
    evidence: physicalReferences,
  };
}

export function consumeCertificationStageResult({
  stdout,
  stderr = "",
  process: processResult,
  ...validationOptions
} = {}) {
  const value = parseCertificationStageResult(stdout);
  if (
    processResult &&
    (value.process.wrapperExitCode !== processResult.exitCode ||
      (processResult.signal ?? null) !== null)
  ) {
    throw new Error("certification stage result wrapper process identity mismatch");
  }
  const validation = validateCertificationStageResult({
    value,
    ...validationOptions,
  });
  if (!validation.valid) {
    throw new Error(
      `certification stage result validation failed: ${validation.issues.join("; ")}`,
    );
  }
  return Object.freeze({
    stdout: String(stdout),
    stderr: String(stderr),
    process: processResult ?? null,
    result: value,
    nextStateSha256: validation.nextStateSha256,
  });
}

export function certificationStageResultSensitiveValues(environment = process.env) {
  return [
    ...new Set(
      Object.entries(environment)
        .filter(([name, value]) =>
          /(?:SECRET|PASSWORD|PASSWD|TOKEN|COOKIE|DATABASE.*URL|AUTH.*KEY|OAUTH)/i.test(
            name,
          ) &&
          typeof value === "string" &&
          value.length >= 8
        )
        .map(([, value]) => value),
    ),
  ];
}

export function resultContainsPrivatePath(value) {
  return collectStrings(value).some((entry) =>
    /^\/(?:Users|home|private|var|tmp)\//.test(entry),
  );
}
