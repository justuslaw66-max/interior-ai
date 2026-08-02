const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,95}$/;

export const RUNTIME_SMOKE_FAILURE_KINDS = Object.freeze([
  "phase-timeout",
  "nested-operation-timeout",
  "no-progress-watchdog",
  "terminal-lifecycle-error",
  "assertion-failure",
  "unexpected-error",
]);

function positiveInteger(value, description) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${description} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value, description) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a non-negative integer`);
  }
  return value;
}

function safeId(value, description) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error(`${description} is unsafe`);
  }
  return value;
}

export class RuntimeSmokeOperationTimeoutError extends Error {
  constructor({
    phaseId,
    operationId,
    operationElapsedMs,
    operationBudgetMs,
    cause,
  }) {
    const safePhaseId = safeId(phaseId, "Runtime-smoke phase ID");
    const safeOperationId = safeId(operationId, "Runtime-smoke operation ID");
    const safeElapsedMs = nonNegativeInteger(
      operationElapsedMs,
      "Runtime-smoke operation elapsed time",
    );
    const safeBudgetMs = positiveInteger(
      operationBudgetMs,
      "Runtime-smoke operation budget",
    );
    super(
      `Runtime-smoke phase ${safePhaseId} operation ${safeOperationId} ` +
        `timed out after ${safeElapsedMs}ms against its ${safeBudgetMs}ms budget`,
      cause instanceof Error ? { cause } : undefined,
    );
    this.name = "RuntimeSmokeOperationTimeoutError";
    this.phaseId = safePhaseId;
    this.operationId = safeOperationId;
    this.operationElapsedMs = safeElapsedMs;
    this.operationBudgetMs = safeBudgetMs;
  }
}

export class RuntimeSmokePhaseTimeoutError extends Error {
  constructor({ phaseId, phaseBudgetMs }) {
    const safePhaseId = safeId(phaseId, "Runtime-smoke phase ID");
    const safeBudgetMs = positiveInteger(
      phaseBudgetMs,
      "Runtime-smoke phase budget",
    );
    super(`Runtime-smoke phase ${safePhaseId} exceeded its ${safeBudgetMs}ms budget`);
    this.name = "RuntimeSmokePhaseTimeoutError";
    this.phaseId = safePhaseId;
    this.phaseBudgetMs = safeBudgetMs;
  }
}

export class RuntimeSmokeNoProgressError extends Error {
  constructor({ phaseId, noProgressBudgetMs }) {
    const safePhaseId = safeId(phaseId, "Runtime-smoke phase ID");
    const safeBudgetMs = positiveInteger(
      noProgressBudgetMs,
      "Runtime-smoke no-progress budget",
    );
    super(`Runtime-smoke phase ${safePhaseId} made no progress for ${safeBudgetMs}ms`);
    this.name = "RuntimeSmokeNoProgressError";
    this.phaseId = safePhaseId;
    this.noProgressBudgetMs = safeBudgetMs;
  }
}

export class RuntimeSmokeTerminalError extends Error {
  constructor(phaseId, safeCategory = "glb-terminal-error") {
    const safePhaseId = safeId(phaseId, "Runtime-smoke phase ID");
    const safeFailureCategory = safeId(
      safeCategory,
      "Runtime-smoke terminal category",
    );
    super(`Runtime-smoke phase ${safePhaseId} reached terminal lifecycle state error`);
    this.name = "RuntimeSmokeTerminalError";
    this.phaseId = safePhaseId;
    this.safeCategory = safeFailureCategory;
  }
}

function safeOriginalCause(error) {
  const cause = error instanceof Error && error.cause instanceof Error
    ? error.cause
    : null;
  if (!cause) return null;
  const originalCause = { name: cause.name || "Error" };
  if (cause instanceof RuntimeSmokeOperationTimeoutError) {
    originalCause.operationId = cause.operationId;
    originalCause.operationElapsedMs = cause.operationElapsedMs;
    originalCause.operationBudgetMs = cause.operationBudgetMs;
  }
  return originalCause;
}

export function runtimeSmokeFailureDisposition(error) {
  if (error instanceof RuntimeSmokeOperationTimeoutError) {
    return { failureKind: "nested-operation-timeout", phaseOutcome: "failed" };
  }
  if (error instanceof RuntimeSmokePhaseTimeoutError) {
    return { failureKind: "phase-timeout", phaseOutcome: "timed-out" };
  }
  if (error instanceof RuntimeSmokeNoProgressError) {
    return { failureKind: "no-progress-watchdog", phaseOutcome: "stalled" };
  }
  if (error instanceof RuntimeSmokeTerminalError) {
    return { failureKind: "terminal-lifecycle-error", phaseOutcome: "terminal-error" };
  }
  if (
    error?.name === "AssertionError" ||
    (error?.matcherResult !== null && typeof error?.matcherResult === "object")
  ) {
    return { failureKind: "assertion-failure", phaseOutcome: "failed" };
  }
  return { failureKind: "unexpected-error", phaseOutcome: "failed" };
}

export function createRuntimeSmokeFailureProvenance({
  error,
  phaseId,
  phaseElapsedMs,
  phaseBudgetMs,
  progressCheckpoints,
  safeLifecycleState,
}) {
  const disposition = runtimeSmokeFailureDisposition(error);
  const operationTimeout = error instanceof RuntimeSmokeOperationTimeoutError
    ? error
    : null;
  const noProgressFailure = error instanceof RuntimeSmokeNoProgressError
    ? error
    : null;
  const structuredPhaseId =
    error instanceof RuntimeSmokeOperationTimeoutError ||
    error instanceof RuntimeSmokePhaseTimeoutError ||
    error instanceof RuntimeSmokeNoProgressError ||
    error instanceof RuntimeSmokeTerminalError
      ? error.phaseId
      : phaseId;
  return {
    failureKind: disposition.failureKind,
    phaseId: safeId(structuredPhaseId, "Runtime-smoke failure phase ID"),
    phaseElapsedMs: nonNegativeInteger(
      phaseElapsedMs,
      "Runtime-smoke failure phase elapsed time",
    ),
    phaseBudgetMs: positiveInteger(
      error instanceof RuntimeSmokePhaseTimeoutError
        ? error.phaseBudgetMs
        : phaseBudgetMs,
      "Runtime-smoke failure phase budget",
    ),
    operationId: operationTimeout?.operationId ?? null,
    operationOutcome: operationTimeout ? "timed-out" : null,
    operationElapsedMs: operationTimeout?.operationElapsedMs ?? null,
    operationBudgetMs: operationTimeout?.operationBudgetMs ?? null,
    watchdogBudgetMs: noProgressFailure?.noProgressBudgetMs ?? null,
    lastSafeCheckpoint: progressCheckpoints.at(-1)?.name ?? null,
    safeLifecycleState,
    progressObserved: progressCheckpoints.length > 1,
    originalCause: safeOriginalCause(error),
  };
}

export function runtimeSmokeFailureExactKeys() {
  return [
    "failureKind",
    "phaseId",
    "phaseElapsedMs",
    "phaseBudgetMs",
    "operationId",
    "operationOutcome",
    "operationElapsedMs",
    "operationBudgetMs",
    "watchdogBudgetMs",
    "lastSafeCheckpoint",
    "safeLifecycleState",
    "progressObserved",
    "originalCause",
  ];
}

export function validateRuntimeSmokeFailureProvenance({
  failure,
  phase,
  phaseContract,
}) {
  const issues = [];
  const exactKeys = runtimeSmokeFailureExactKeys();
  if (
    failure === null ||
    typeof failure !== "object" ||
    Array.isArray(failure) ||
    JSON.stringify(Object.keys(failure).sort()) !== JSON.stringify([...exactKeys].sort())
  ) {
    return ["runtime-smoke failure provenance is missing or stale"];
  }
  if (!RUNTIME_SMOKE_FAILURE_KINDS.includes(failure.failureKind)) {
    issues.push("runtime-smoke failure kind is unknown");
  }
  if (
    typeof failure.phaseId !== "string" ||
    !SAFE_ID.test(failure.phaseId) ||
    !Number.isSafeInteger(failure.phaseElapsedMs) ||
    failure.phaseElapsedMs < 0 ||
    !Number.isSafeInteger(failure.phaseBudgetMs) ||
    failure.phaseBudgetMs <= 0 ||
    (failure.lastSafeCheckpoint !== null &&
      (typeof failure.lastSafeCheckpoint !== "string" ||
        !SAFE_ID.test(failure.lastSafeCheckpoint))) ||
    !["not-observed", "loading", "ready", "error", "stable", "persisted"].includes(
      failure.safeLifecycleState,
    ) ||
    typeof failure.progressObserved !== "boolean"
  ) {
    issues.push("runtime-smoke failure provenance contains unsafe values");
  }
  if (failure.originalCause !== null) {
    const causeKeys = Object.keys(failure.originalCause ?? {}).sort();
    const basicCauseKeys = ["name"].sort();
    const operationCauseKeys = [
      "name",
      "operationId",
      "operationElapsedMs",
      "operationBudgetMs",
    ].sort();
    const isBasicCause =
      JSON.stringify(causeKeys) === JSON.stringify(basicCauseKeys);
    const isOperationCause =
      JSON.stringify(causeKeys) === JSON.stringify(operationCauseKeys);
    const causeOperation = isOperationCause
      ? (phaseContract?.nestedOperations ?? []).find(
          (candidate) => candidate.name === failure.originalCause.operationId,
        )
      : null;
    if (
      typeof failure.originalCause !== "object" ||
      Array.isArray(failure.originalCause) ||
      (!isBasicCause && !isOperationCause) ||
      typeof failure.originalCause.name !== "string" ||
      !SAFE_ERROR_NAME.test(failure.originalCause.name) ||
      (isOperationCause &&
        (typeof failure.originalCause.operationId !== "string" ||
          !SAFE_ID.test(failure.originalCause.operationId) ||
          !causeOperation ||
          !Number.isSafeInteger(failure.originalCause.operationElapsedMs) ||
          failure.originalCause.operationElapsedMs <
            failure.originalCause.operationBudgetMs ||
          !Number.isSafeInteger(failure.originalCause.operationBudgetMs) ||
          failure.originalCause.operationBudgetMs !== causeOperation?.timeoutMs ||
          failure.originalCause.operationElapsedMs > failure.phaseElapsedMs))
    ) {
      issues.push("runtime-smoke original cause is not safely serializable");
    }
  }
  if (
    failure.phaseId !== phase?.name ||
    failure.phaseElapsedMs !== phase?.elapsedMs ||
    failure.phaseBudgetMs !== phase?.timeoutBudgetMs
  ) {
    issues.push("runtime-smoke failure phase identity or budget is contradictory");
  }
  if (
    failure.lastSafeCheckpoint !== phase?.progressCheckpoints?.at(-1)?.name ||
    failure.safeLifecycleState !== phase?.finalLifecycleState ||
    failure.progressObserved !== (phase?.progressCheckpoints?.length > 1)
  ) {
    issues.push("runtime-smoke failure progress provenance is contradictory");
  }
  if (failure.failureKind === "nested-operation-timeout") {
    const operation = [
      ...(phaseContract?.operations ?? []),
      ...(phaseContract?.nestedOperations ?? []),
    ].find(
      (candidate) => candidate.name === failure.operationId,
    );
    if (
      phase?.outcome !== "failed" ||
      failure.operationOutcome !== "timed-out" ||
      !operation ||
      failure.operationBudgetMs !== operation.timeoutMs ||
      !Number.isSafeInteger(failure.operationElapsedMs) ||
      failure.operationElapsedMs < failure.operationBudgetMs ||
      failure.operationElapsedMs > failure.phaseElapsedMs ||
      failure.phaseElapsedMs > failure.phaseBudgetMs
    ) {
      issues.push("runtime-smoke nested operation timeout is non-canonical");
    }
  } else if (
    failure.operationId !== null ||
    failure.operationOutcome !== null ||
    failure.operationElapsedMs !== null ||
    failure.operationBudgetMs !== null
  ) {
    issues.push("runtime-smoke non-operation failure invents operation provenance");
  }
  if (failure.failureKind === "no-progress-watchdog") {
    if (
      !Number.isSafeInteger(failure.watchdogBudgetMs) ||
      failure.watchdogBudgetMs !== phaseContract?.noProgressTimeoutMs ||
      failure.phaseElapsedMs < failure.watchdogBudgetMs ||
      failure.phaseElapsedMs > failure.phaseBudgetMs
    ) {
      issues.push("runtime-smoke no-progress watchdog provenance is non-canonical");
    }
  } else if (failure.watchdogBudgetMs !== null) {
    issues.push("runtime-smoke non-watchdog failure invents a watchdog budget");
  }
  if (
    failure.failureKind === "phase-timeout" &&
    (phase?.outcome !== "timed-out" || failure.phaseElapsedMs < failure.phaseBudgetMs)
  ) {
    issues.push("runtime-smoke phase timeout does not exhaust its parent phase budget");
  }
  if (
    failure.failureKind !== "phase-timeout" &&
    Number.isSafeInteger(failure.phaseElapsedMs) &&
    Number.isSafeInteger(failure.phaseBudgetMs) &&
    failure.phaseElapsedMs > failure.phaseBudgetMs
  ) {
    issues.push("runtime-smoke non-phase failure exceeds its parent phase budget");
  }
  if (
    failure.failureKind === "terminal-lifecycle-error" &&
    failure.safeLifecycleState !== "error"
  ) {
    issues.push("runtime-smoke terminal failure lacks terminal lifecycle state");
  }
  const expectedOutcome = {
    "nested-operation-timeout": "failed",
    "phase-timeout": "timed-out",
    "no-progress-watchdog": "stalled",
    "terminal-lifecycle-error": "terminal-error",
    "assertion-failure": "failed",
    "unexpected-error": "failed",
  }[failure.failureKind];
  if (expectedOutcome && phase?.outcome !== expectedOutcome) {
    issues.push("runtime-smoke failure kind contradicts the parent phase outcome");
  }
  return issues;
}
