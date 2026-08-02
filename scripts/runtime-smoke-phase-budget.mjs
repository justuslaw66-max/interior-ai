import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RUNTIME_SMOKE_PHASE_TIMING_SCHEMA =
  "interior-ai.runtime-smoke-phase-timings.v2";

function freezePhaseContract({
  operations,
  orchestrationMarginMs,
  noProgressTimeoutMs,
  performanceWarningThresholdMs,
}) {
  return Object.freeze({
    operations: Object.freeze(
      operations.map((operation) => Object.freeze({ ...operation })),
    ),
    orchestrationMarginMs,
    noProgressTimeoutMs,
    performanceWarningThresholdMs,
  });
}

export function deriveFurnishedTemplatePhaseTimeout(contract) {
  return sumNonNegativeIntegers(
    [
      ...contract.operations.map((operation) => operation.timeoutMs),
      contract.orchestrationMarginMs,
    ],
    "furnished-template phase contract",
  );
}

export function runtimeSmokeAggregateLifecycleState({
  expectedModelCount,
  readyModelCount,
  loadingModelCount,
  terminalErrorModelCount,
  combinedReadinessSatisfied,
}) {
  if (terminalErrorModelCount > 0) return "error";
  if (
    combinedReadinessSatisfied &&
    readyModelCount === expectedModelCount &&
    loadingModelCount === 0
  ) {
    return "ready";
  }
  return "loading";
}

export const FURNISHED_TEMPLATE_RELOAD_CONTRACT = freezePhaseContract({
  operations: [
    { name: "navigation", timeoutMs: 60_000 },
    { name: "bootstrap-readiness", timeoutMs: 30_000 },
    { name: "hydration-snapshot", timeoutMs: 5_000 },
    { name: "view-state-read", timeoutMs: 30_000 },
    { name: "view-activation", timeoutMs: 30_000 },
    { name: "model-responses-and-readiness", timeoutMs: 70_000 },
    { name: "body-state-assertion", timeoutMs: 5_000 },
    { name: "diagnostics-settle", timeoutMs: 10_000 },
    { name: "post-settle-observation", timeoutMs: 1_000 },
    { name: "final-diagnostics-snapshot", timeoutMs: 5_000 },
  ],
  orchestrationMarginMs: 30_000,
  noProgressTimeoutMs: 75_000,
  performanceWarningThresholdMs: 70_000,
});

const FURNISHED_TEMPLATE_BOUNDS_CONTRACT = freezePhaseContract({
  operations: [
    { name: "diagnostics-settle", timeoutMs: 10_000 },
    { name: "post-settle-observation", timeoutMs: 1_000 },
    { name: "diagnostic-snapshot-and-assertions", timeoutMs: 30_000 },
  ],
  orchestrationMarginMs: 30_000,
  noProgressTimeoutMs: 60_000,
  performanceWarningThresholdMs: 45_000,
});

const FURNISHED_TEMPLATE_REMOUNT_CONTRACT = freezePhaseContract({
  operations: [
    { name: "activate-2d", timeoutMs: 30_000 },
    { name: "verify-2d", timeoutMs: 5_000 },
    { name: "activate-3d", timeoutMs: 30_000 },
    { name: "verify-3d", timeoutMs: 5_000 },
    { name: "verify-selection", timeoutMs: 5_000 },
    { name: "model-readiness", timeoutMs: 60_000 },
  ],
  orchestrationMarginMs: 30_000,
  noProgressTimeoutMs: 75_000,
  performanceWarningThresholdMs: 60_000,
});

export const FURNISHED_TEMPLATE_PHASE_CONTRACTS = Object.freeze({
  "test-body-setup": freezePhaseContract({
    operations: [{ name: "instrumentation-registration", timeoutMs: 30_000 }],
    orchestrationMarginMs: 5_000,
    noProgressTimeoutMs: 30_000,
    performanceWarningThresholdMs: 5_000,
  }),
  "initial-navigation": freezePhaseContract({
    operations: [
      { name: "navigation", timeoutMs: 60_000 },
      { name: "scene-readiness", timeoutMs: 30_000 },
    ],
    orchestrationMarginMs: 15_000,
    noProgressTimeoutMs: 75_000,
    performanceWarningThresholdMs: 45_000,
  }),
  "fixture-creation": freezePhaseContract({
    operations: [
      { name: "entry-selection-branch", timeoutMs: 40_000 },
      { name: "template-application", timeoutMs: 73_000 },
      { name: "room-and-item-readiness", timeoutMs: 30_000 },
      { name: "local-backup-readiness", timeoutMs: 30_000 },
      { name: "fixture-mutation", timeoutMs: 30_000 },
    ],
    orchestrationMarginMs: 30_000,
    noProgressTimeoutMs: 90_000,
    performanceWarningThresholdMs: 50_000,
  }),
  "fixture-reload-2d-readiness": freezePhaseContract({
    operations: [
      { name: "navigation", timeoutMs: 60_000 },
      { name: "bootstrap-readiness", timeoutMs: 30_000 },
      { name: "view-2d-readiness", timeoutMs: 30_000 },
      { name: "selection-readiness", timeoutMs: 30_000 },
    ],
    orchestrationMarginMs: 30_000,
    noProgressTimeoutMs: 75_000,
    performanceWarningThresholdMs: 60_000,
  }),
  "initial-glb-loading-and-selection-verification": freezePhaseContract({
    operations: [
      { name: "plan-selection-click", timeoutMs: 35_000 },
      { name: "plan-selection-assertion", timeoutMs: 35_000 },
      { name: "view-activation-click", timeoutMs: 35_000 },
      { name: "view-activation-assertion", timeoutMs: 35_000 },
      { name: "model-responses", timeoutMs: 45_000 },
      { name: "selection-verification", timeoutMs: 5_000 },
    ],
    orchestrationMarginMs: 30_000,
    noProgressTimeoutMs: 60_000,
    performanceWarningThresholdMs: 45_000,
  }),
  "semantic-readiness": freezePhaseContract({
    operations: [{ name: "model-readiness", timeoutMs: 65_000 }],
    orchestrationMarginMs: 15_000,
    noProgressTimeoutMs: 70_000,
    performanceWarningThresholdMs: 65_000,
  }),
  "bounds-verification": FURNISHED_TEMPLATE_BOUNDS_CONTRACT,
  "render-loop-assertions": freezePhaseContract({
    operations: [{ name: "render-count-assertions", timeoutMs: 5_000 }],
    orchestrationMarginMs: 5_000,
    noProgressTimeoutMs: 8_000,
    performanceWarningThresholdMs: 5_000,
  }),
  remount: FURNISHED_TEMPLATE_REMOUNT_CONTRACT,
  "reload-1": FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  "reload-2": FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  "reload-3": FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  "persistence-assertions": freezePhaseContract({
    operations: [
      { name: "local-backup-read", timeoutMs: 30_000 },
      { name: "identity-assertion", timeoutMs: 5_000 },
    ],
    orchestrationMarginMs: 10_000,
    noProgressTimeoutMs: 35_000,
    performanceWarningThresholdMs: 10_000,
  }),
  "final-body-state-assertions": freezePhaseContract({
    operations: [{ name: "final-assertions", timeoutMs: 5_000 }],
    orchestrationMarginMs: 10_000,
    noProgressTimeoutMs: 10_000,
    performanceWarningThresholdMs: 10_000,
  }),
});

export const RUNTIME_SMOKE_PHASE_BUDGETS = Object.freeze(
  Object.entries(FURNISHED_TEMPLATE_PHASE_CONTRACTS).map(([name, contract]) => ({
    name,
    timeoutMs: deriveFurnishedTemplatePhaseTimeout(contract),
  })),
);

export const RUNTIME_SMOKE_OVERHEAD_BUDGETS = Object.freeze({
  fixtureSetupMs: 15_000,
  fixtureTeardownMs: 15_000,
  assertionSchedulingMs: 15_000,
  orchestrationMarginMs: 30_000,
});

function sumNonNegativeIntegers(values, description) {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${description} must contain non-negative integer milliseconds`);
    }
    return total + value;
  }, 0);
}

export function deriveRuntimeSmokeWholeTestTimeout({
  phases = RUNTIME_SMOKE_PHASE_BUDGETS,
  overhead = RUNTIME_SMOKE_OVERHEAD_BUDGETS,
} = {}) {
  const phaseBudgetMs = sumNonNegativeIntegers(
    phases.map((phase) => phase.timeoutMs),
    "runtime-smoke phase budgets",
  );
  const overheadBudgetMs = sumNonNegativeIntegers(
    Object.values(overhead),
    "runtime-smoke overhead budgets",
  );
  return phaseBudgetMs + overheadBudgetMs;
}

export const RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS =
  deriveRuntimeSmokeWholeTestTimeout();

export function runtimeSmokePhaseBudget(
  phaseName,
  phases = RUNTIME_SMOKE_PHASE_BUDGETS,
) {
  const phase = phases.find(
    (candidate) => candidate.name === phaseName,
  );
  if (!phase) throw new Error(`Unknown runtime-smoke phase: ${phaseName}`);
  return phase.timeoutMs;
}

export class RuntimeSmokeTerminalError extends Error {
  constructor(phaseName, safeCategory = "glb-terminal-error") {
    super(`Runtime-smoke phase ${phaseName} reached terminal lifecycle state error`);
    this.name = "RuntimeSmokeTerminalError";
    this.safeCategory = safeCategory;
  }
}

export class RuntimeSmokePhaseTimeoutError extends Error {
  constructor(phaseName, timeoutMs, operationName = null) {
    super(
      operationName
        ? `Runtime-smoke phase ${phaseName} operation ${operationName} exceeded its ${timeoutMs}ms budget`
        : `Runtime-smoke phase ${phaseName} exceeded its ${timeoutMs}ms budget`,
    );
    this.name = "RuntimeSmokePhaseTimeoutError";
    this.phaseName = phaseName;
    this.timeoutMs = timeoutMs;
    this.operationName = operationName;
  }
}

export async function runRuntimeSmokeBoundedOperation({
  phaseName,
  operationName,
  timeoutMs,
  task,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(operationName)) {
    throw new Error("Runtime-smoke operation name is unsafe");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Runtime-smoke operation timeout must be a positive integer");
  }
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimer(
      () => reject(
        new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs, operationName),
      ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([Promise.resolve().then(task), timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
  }
}

export class RuntimeSmokeNoProgressError extends Error {
  constructor(phaseName, timeoutMs) {
    super(`Runtime-smoke phase ${phaseName} made no progress for ${timeoutMs}ms`);
    this.name = "RuntimeSmokeNoProgressError";
    this.phaseName = phaseName;
    this.timeoutMs = timeoutMs;
  }
}

function diagnosticCategory(error) {
  if (error instanceof RuntimeSmokeTerminalError) return error.safeCategory;
  if (error instanceof RuntimeSmokePhaseTimeoutError) return "phase-timeout";
  if (error instanceof RuntimeSmokeNoProgressError) return "lack-of-progress";
  if (error?.name === "AssertionError") return "assertion-failure";
  return "unexpected-test-error";
}

function safeLifecycleState(value) {
  return ["not-observed", "loading", "ready", "error", "stable", "persisted"].includes(
    value,
  )
    ? value
    : "not-observed";
}

function resolveTimingPath(repositoryRoot, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("runtime-smoke phase timing path must be repository-relative");
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("runtime-smoke phase timing path must remain inside the repository");
  }
  return resolved;
}

export function createRuntimeSmokePhaseRecorder({
  repositoryRoot,
  timingPath,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  phaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS,
  phaseContracts = FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  writePerformanceWarning = (message) => console.warn(message),
}) {
  const testStartedAt = now();
  const records = [];
  const completedNames = new Set();
  const absoluteTimingPath = timingPath
    ? resolveTimingPath(repositoryRoot, timingPath)
    : null;

  const write = () => {
    if (!absoluteTimingPath) return;
    const payload = {
      schema: RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
      testIdentity: "runtime.template-stability",
      wholeTestTimeoutMs: deriveRuntimeSmokeWholeTestTimeout({ phases: phaseBudgets }),
      sequentialPhaseBudgetMs: sumNonNegativeIntegers(
        phaseBudgets.map((phase) => phase.timeoutMs),
        "runtime-smoke phase budgets",
      ),
      overheadBudgets: RUNTIME_SMOKE_OVERHEAD_BUDGETS,
      phaseBudgets,
      phases: records,
      complete: records.length === phaseBudgets.length &&
        records.every((record) => record.outcome === "passed"),
    };
    mkdirSync(path.dirname(absoluteTimingPath), { recursive: true });
    const stagingPath = `${absoluteTimingPath}.staging`;
    writeFileSync(stagingPath, `${JSON.stringify(payload, null, 2)}\n`);
    renameSync(stagingPath, absoluteTimingPath);
  };

  return {
    async run(phaseName, task, finalLifecycleState = () => "not-observed") {
      if (completedNames.has(phaseName)) {
        throw new Error(`Runtime-smoke phase ${phaseName} was recorded more than once`);
      }
      const timeoutMs = runtimeSmokePhaseBudget(phaseName, phaseBudgets);
      const phaseContract = phaseContracts[phaseName] ?? null;
      const startedAt = now();
      let timeoutHandle;
      let noProgressHandle;
      let rejectNoProgress;
      let acceptsProgressCheckpoints = true;
      const progressCheckpoints = [];
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimer(
          () => reject(new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs)),
          timeoutMs,
        );
      });
      const noProgress = phaseContract
        ? new Promise((_, reject) => {
            rejectNoProgress = reject;
          })
        : null;
      const scheduleNoProgressTimeout = () => {
        if (!phaseContract || !rejectNoProgress) return;
        if (noProgressHandle !== undefined) clearTimer(noProgressHandle);
        noProgressHandle = setTimer(
          () => rejectNoProgress(
            new RuntimeSmokeNoProgressError(
              phaseName,
              phaseContract.noProgressTimeoutMs,
            ),
          ),
          phaseContract.noProgressTimeoutMs,
        );
      };
      const checkpoint = (
        name,
        lifecycleState = safeLifecycleState(finalLifecycleState()),
      ) => {
        if (!acceptsProgressCheckpoints) return;
        if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(name)) {
          throw new Error("Runtime-smoke progress checkpoint name is unsafe");
        }
        progressCheckpoints.push({
          name,
          elapsedMs: Math.max(0, now() - startedAt),
          finalLifecycleState: safeLifecycleState(lifecycleState),
        });
        scheduleNoProgressTimeout();
      };
      const createRecord = ({ outcome, safeDiagnosticCategory }) => {
        const elapsedMs = Math.max(0, now() - startedAt);
        const performanceWarningThresholdMs =
          phaseContract?.performanceWarningThresholdMs ?? null;
        const performanceWarningExceeded =
          performanceWarningThresholdMs !== null &&
          elapsedMs > performanceWarningThresholdMs;
        if (performanceWarningExceeded) {
          writePerformanceWarning(
            `Runtime-smoke phase ${phaseName} completed in ${elapsedMs}ms; ` +
              `the non-failing performance observation threshold is ` +
              `${performanceWarningThresholdMs}ms.`,
          );
        }
        return {
          name: phaseName,
          startTimeRelativeMs: startedAt - testStartedAt,
          elapsedMs,
          outcome,
          timeoutBudgetMs: timeoutMs,
          performanceWarningThresholdMs,
          performanceWarningExceeded,
          finalLifecycleState: safeLifecycleState(finalLifecycleState()),
          safeDiagnosticCategory,
          progressCheckpoints,
        };
      };
      checkpoint("phase-start");
      try {
        const racers = [
          Promise.resolve().then(() => task({ checkpoint })),
          timeout,
        ];
        if (noProgress) racers.push(noProgress);
        const result = await Promise.race(racers);
        checkpoint("phase-complete");
        records.push(createRecord({
          outcome: "passed",
          safeDiagnosticCategory: "none",
        }));
        completedNames.add(phaseName);
        write();
        return result;
      } catch (error) {
        records.push(createRecord({
          outcome:
            error instanceof RuntimeSmokePhaseTimeoutError
              ? "timed-out"
              : error instanceof RuntimeSmokeNoProgressError
                ? "stalled"
              : error instanceof RuntimeSmokeTerminalError
                ? "terminal-error"
                : "failed",
          safeDiagnosticCategory: diagnosticCategory(error),
        }));
        completedNames.add(phaseName);
        write();
        throw error;
      } finally {
        acceptsProgressCheckpoints = false;
        if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
        if (noProgressHandle !== undefined) clearTimer(noProgressHandle);
      }
    },
    records,
  };
}
