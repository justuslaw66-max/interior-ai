import { performance } from "node:perf_hooks";

import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
} from "./runtime-smoke-operation-contracts.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const operationDeadlineContexts = new WeakSet();
const operationDeadlineClocks = new WeakMap();
const operationAttempts = new WeakMap();

function nonNegativeInteger(value, description) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a non-negative integer`);
  }
  return value;
}

function nonNegativeFinite(value, description) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${description} must be a non-negative finite number`);
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

function operationClockSnapshot(operationContext) {
  if (!operationDeadlineContexts.has(operationContext)) {
    throw new Error("Runtime-smoke operation deadline context is invalid");
  }
  const monotonicNow = nonNegativeFinite(
    operationDeadlineClocks.get(operationContext)?.(),
    "Runtime-smoke monotonic operation time",
  );
  const operationElapsedPreciseMs = Math.max(
    0,
    monotonicNow - operationContext.monotonicStartedAt,
  );
  const remainingPreciseMs = Math.max(
    0,
    Math.min(
      operationContext.canonicalBudgetMs,
      operationContext.monotonicDeadlineAt - monotonicNow,
    ),
  );
  return Object.freeze({
    monotonicNow,
    operationElapsedPreciseMs,
    operationElapsedMs: Math.floor(operationElapsedPreciseMs),
    remainingPreciseMs,
    remainingMs: Math.ceil(remainingPreciseMs),
    deadlineReached: monotonicNow >= operationContext.monotonicDeadlineAt,
  });
}

export function createRuntimeSmokeOperationDeadline({
  phaseName,
  operationName,
  now = performance.now.bind(performance),
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
  const monotonicStartedAt = nonNegativeFinite(
    now(),
    "Runtime-smoke monotonic operation start time",
  );
  const monotonicDeadlineAt = monotonicStartedAt + canonicalBudgetMs;
  if (!Number.isFinite(monotonicDeadlineAt)) {
    throw new Error("Runtime-smoke monotonic operation deadline must be finite");
  }
  const context = Object.freeze({
    phaseId: safePhaseId,
    operationId: safeOperationId,
    canonicalBudgetMs,
    monotonicStartedAt,
    monotonicDeadlineAt,
    preciseElapsedMs: () =>
      operationClockSnapshot(context).operationElapsedPreciseMs,
    elapsedMs: () => operationClockSnapshot(context).operationElapsedMs,
    remainingMs: () => operationClockSnapshot(context).remainingMs,
    deadlineReached: () => operationClockSnapshot(context).deadlineReached,
  });
  operationDeadlineClocks.set(context, now);
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
  const clock = operationClockSnapshot(operationContext);
  const remainingAtAttemptStartMs = clock.remainingMs;
  const monotonicAttemptDeadlineAt = Math.min(
    operationContext.monotonicDeadlineAt,
    clock.monotonicNow + (maximumAttemptMs ?? remainingAtAttemptStartMs),
  );
  const attemptTimeoutMs = Math.min(
    remainingAtAttemptStartMs,
    maximumAttemptMs ?? remainingAtAttemptStartMs,
  );
  const attempt = Object.freeze({
    operationContext,
    attemptTimeoutMs,
    remainingAtAttemptStartMs,
    coversCanonicalDeadline:
      monotonicAttemptDeadlineAt >= operationContext.monotonicDeadlineAt,
  });
  operationAttempts.set(attempt, Object.freeze({ monotonicAttemptDeadlineAt }));
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

function operationAttemptClockSnapshot(operationAttempt) {
  const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
  const clock = operationClockSnapshot(safeAttempt.operationContext);
  const monotonicAttemptDeadlineAt = operationAttempts.get(
    safeAttempt,
  ).monotonicAttemptDeadlineAt;
  return Object.freeze({
    ...clock,
    attemptDeadlineReached: clock.monotonicNow >= monotonicAttemptDeadlineAt,
    attemptRemainingMs: Math.ceil(
      Math.max(0, monotonicAttemptDeadlineAt - clock.monotonicNow),
    ),
  });
}

export class RuntimeSmokeOperationTimeoutError extends Error {
  constructor({ operationAttempt, cause }) {
    const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
    const operationContext = safeAttempt.operationContext;
    const clock = operationClockSnapshot(operationContext);
    if (!clock.deadlineReached) {
      throw new Error(
        "Runtime-smoke canonical operation timeout requires a reached deadline",
      );
    }
    const operationElapsedMs = nonNegativeInteger(
      clock.operationElapsedMs,
      "Runtime-smoke operation elapsed time",
    );
    if (operationElapsedMs < operationContext.canonicalBudgetMs) {
      throw new Error(
        "Runtime-smoke persisted operation elapsed time precedes its reached deadline",
      );
    }
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
    this.operationElapsedPreciseMs = clock.operationElapsedPreciseMs;
    this.operationBudgetMs = operationContext.canonicalBudgetMs;
    this.attemptTimeoutMs = safeAttempt.attemptTimeoutMs;
    this.remainingAtAttemptStartMs = safeAttempt.remainingAtAttemptStartMs;
    this.deadlineReached = true;
  }
}

export class RuntimeSmokeOperationAttemptTimeoutError extends Error {
  constructor({ operationAttempt }) {
    const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
    const operationContext = safeAttempt.operationContext;
    const clock = operationAttemptClockSnapshot(safeAttempt);
    if (clock.deadlineReached) {
      throw new Error(
        "Runtime-smoke internal attempt timeout cannot represent a reached canonical deadline",
      );
    }
    if (!clock.attemptDeadlineReached) {
      throw new Error(
        "Runtime-smoke internal attempt timeout requires a reached attempt deadline",
      );
    }
    super(
      `Runtime-smoke phase ${operationContext.phaseId} operation ` +
        `${operationContext.operationId} exhausted its ${safeAttempt.attemptTimeoutMs}ms ` +
        `internal attempt before the canonical deadline`,
    );
    this.name = "RuntimeSmokeOperationAttemptTimeoutError";
    this.phaseId = operationContext.phaseId;
    this.operationId = operationContext.operationId;
    this.attemptTimeoutMs = safeAttempt.attemptTimeoutMs;
    this.remainingAtAttemptStartMs = safeAttempt.remainingAtAttemptStartMs;
    this.deadlineReached = false;
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
  const scheduleTimeout = (reject, delayMs) => {
    timeoutHandle = setTimer(() => {
      try {
        const clock = operationAttemptClockSnapshot(safeAttempt);
        if (clock.deadlineReached) {
          reject(new RuntimeSmokeOperationTimeoutError({
            operationAttempt: safeAttempt,
          }));
          return;
        }
        if (clock.attemptDeadlineReached) {
          reject(new RuntimeSmokeOperationAttemptTimeoutError({
            operationAttempt: safeAttempt,
          }));
          return;
        }
        scheduleTimeout(
          reject,
          Math.max(1, Math.min(clock.remainingMs, clock.attemptRemainingMs)),
        );
      } catch (error) {
        reject(error);
      }
    }, delayMs);
  };
  const timeout = new Promise((_, reject) => {
    scheduleTimeout(reject, safeAttempt.attemptTimeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(task), timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
  }
}

export async function waitForRuntimeSmokeOperationDeadline({
  operationAttempt,
  cause,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const safeAttempt = assertRuntimeSmokeOperationAttempt(operationAttempt);
  if (!safeAttempt.coversCanonicalDeadline) {
    throw new Error(
      "Runtime-smoke canonical deadline wait requires an attempt that covers the deadline",
    );
  }
  let timeoutHandle;
  const deadline = new Promise((_, reject) => {
    const scheduleDeadline = () => {
      try {
        const clock = operationClockSnapshot(safeAttempt.operationContext);
        if (clock.deadlineReached) {
          reject(new RuntimeSmokeOperationTimeoutError({
            operationAttempt: safeAttempt,
            cause,
          }));
          return;
        }
        timeoutHandle = setTimer(
          scheduleDeadline,
          Math.max(1, clock.remainingMs),
        );
      } catch (error) {
        reject(error);
      }
    };
    scheduleDeadline();
  });
  try {
    await deadline;
  } finally {
    if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
  }
}
