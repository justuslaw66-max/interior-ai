import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
} from "./runtime-smoke-operation-contracts.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const operationDeadlineContexts = new WeakSet();
const operationAttempts = new WeakSet();

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

function runtimeSmokeOperationContract(phaseName, operationName) {
  const phaseContract = FURNISHED_TEMPLATE_PHASE_CONTRACTS[phaseName];
  if (!phaseContract) {
    throw new Error(`Unknown runtime-smoke phase: ${phaseName}`);
  }
  const operation = [
    ...phaseContract.operations,
    ...phaseContract.nestedOperations,
  ].find((candidate) => candidate.name === operationName);
  if (!operation) {
    throw new Error(
      `Unknown runtime-smoke operation ${operationName} for phase ${phaseName}`,
    );
  }
  return operation;
}

export function createRuntimeSmokeOperationDeadline({
  phaseName,
  operationName,
  now = Date.now,
}) {
  const safePhaseId = safeId(phaseName, "Runtime-smoke phase ID");
  const safeOperationId = safeId(operationName, "Runtime-smoke operation ID");
  if (typeof now !== "function") {
    throw new Error("Runtime-smoke operation clock must be callable");
  }
  const canonicalBudgetMs = runtimeSmokeOperationContract(
    safePhaseId,
    safeOperationId,
  ).timeoutMs;
  const operationStartedAt = nonNegativeInteger(
    now(),
    "Runtime-smoke operation start time",
  );
  const operationDeadlineAt = operationStartedAt + canonicalBudgetMs;
  if (!Number.isSafeInteger(operationDeadlineAt)) {
    throw new Error("Runtime-smoke operation deadline must be a safe integer");
  }
  const context = Object.freeze({
    phaseId: safePhaseId,
    operationId: safeOperationId,
    canonicalBudgetMs,
    operationStartedAt,
    operationDeadlineAt,
    elapsedMs: () => Math.max(0, now() - operationStartedAt),
    remainingMs: () => Math.max(
      0,
      Math.min(canonicalBudgetMs, operationDeadlineAt - now()),
    ),
  });
  operationDeadlineContexts.add(context);
  return context;
}

export function runtimeSmokeOperationAttempt(
  operationContext,
  maximumAttemptMs,
) {
  if (!operationDeadlineContexts.has(operationContext)) {
    throw new Error("Runtime-smoke operation deadline context is invalid");
  }
  if (
    maximumAttemptMs !== undefined &&
    (!Number.isSafeInteger(maximumAttemptMs) || maximumAttemptMs <= 0)
  ) {
    throw new Error("Runtime-smoke maximum attempt timeout must be a positive integer");
  }
  const remainingAtAttemptStartMs = nonNegativeInteger(
    operationContext.remainingMs(),
    "Runtime-smoke remaining operation allowance",
  );
  const attemptTimeoutMs = Math.min(
    remainingAtAttemptStartMs,
    maximumAttemptMs ?? remainingAtAttemptStartMs,
  );
  const attempt = Object.freeze({
    operationContext,
    attemptTimeoutMs,
    remainingAtAttemptStartMs,
  });
  operationAttempts.add(attempt);
  if (attemptTimeoutMs === 0) {
    throw new RuntimeSmokeOperationTimeoutError({ operationAttempt: attempt });
  }
  return attempt;
}

function assertRuntimeSmokeOperationAttempt(operationAttempt) {
  if (!operationAttempts.has(operationAttempt)) {
    throw new Error("Runtime-smoke operation attempt is invalid");
  }
  return operationAttempt;
}

export class RuntimeSmokeOperationTimeoutError extends Error {
  constructor({ operationAttempt, cause }) {
    const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
    const operationContext = safeAttempt.operationContext;
    const operationElapsedMs = nonNegativeInteger(
      operationContext.elapsedMs(),
      "Runtime-smoke operation elapsed time",
    );
    super(
      `Runtime-smoke phase ${operationContext.phaseId} operation ` +
        `${operationContext.operationId} timed out after ${operationElapsedMs}ms ` +
        `against its ${operationContext.canonicalBudgetMs}ms canonical budget ` +
        `(attempt allowance ${safeAttempt.attemptTimeoutMs}ms)`,
      cause instanceof Error ? { cause } : undefined,
    );
    this.name = "RuntimeSmokeOperationTimeoutError";
    this.phaseId = operationContext.phaseId;
    this.operationId = operationContext.operationId;
    this.operationElapsedMs = operationElapsedMs;
    this.operationBudgetMs = operationContext.canonicalBudgetMs;
    this.attemptTimeoutMs = safeAttempt.attemptTimeoutMs;
    this.remainingAtAttemptStartMs = safeAttempt.remainingAtAttemptStartMs;
  }
}

export async function runRuntimeSmokeBoundedOperation({
  operationAttempt,
  task,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
  if (typeof task !== "function") {
    throw new Error("Runtime-smoke bounded operation task must be callable");
  }
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimer(
      () => reject(
        new RuntimeSmokeOperationTimeoutError({
          operationAttempt: safeAttempt,
        }),
      ),
      safeAttempt.attemptTimeoutMs,
    );
  });
  try {
    return await Promise.race([Promise.resolve().then(task), timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
  }
}
