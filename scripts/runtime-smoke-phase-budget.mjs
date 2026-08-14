import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolvePlaywrightReportPath } from "./playwright-report-path.mjs";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
} from "./runtime-smoke-operation-contracts.mjs";
import {
  RuntimeSmokeNoProgressError,
  RuntimeSmokePhaseTimeoutError,
  createRuntimeSmokeFailureProvenance,
  runtimeSmokeFailureDisposition,
} from "./runtime-smoke-failure-evidence.mjs";

export {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT,
} from "./runtime-smoke-operation-contracts.mjs";
export {
  RuntimeSmokeOperationAttemptTimeoutError,
  RuntimeSmokeOperationTimeoutError,
  createRuntimeSmokeOperationDeadline,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeOperationAttempt,
  waitForRuntimeSmokeOperationDeadline,
} from "./runtime-smoke-operation-deadline.mjs";
export {
  RuntimeSmokeNoProgressError,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
} from "./runtime-smoke-failure-evidence.mjs";

export const RUNTIME_SMOKE_PHASE_TIMING_SCHEMA =
  "interior-ai.runtime-smoke-phase-timings.v3";

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


function safeLifecycleState(value) {
  return ["not-observed", "loading", "ready", "error", "stable", "persisted"].includes(
    value,
  )
    ? value
    : "not-observed";
}

function resolveTimingPath(repositoryRoot, relativePath) {
  if (!relativePath) {
    throw new Error("runtime-smoke phase timing path is required");
  }
  if (path.isAbsolute(relativePath)) {
    return resolvePlaywrightReportPath({
      requestedPath: relativePath,
      repositoryRoot,
      authorizedExternalRoot: process.env.CERTIFICATION_EVIDENCE_ROOT,
    }).outputPath;
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
      failure: records.find((record) => record.failure !== null)?.failure ?? null,
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
          () => reject(
            new RuntimeSmokePhaseTimeoutError({
              phaseId: phaseName,
              phaseBudgetMs: timeoutMs,
            }),
          ),
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
            new RuntimeSmokeNoProgressError({
              phaseId: phaseName,
              noProgressBudgetMs: phaseContract.noProgressTimeoutMs,
            }),
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
      const createRecord = ({ outcome, error = null }) => {
        const elapsedMs = Math.max(0, now() - startedAt);
        const finalState = safeLifecycleState(finalLifecycleState());
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
          finalLifecycleState: finalState,
          failure: error
            ? createRuntimeSmokeFailureProvenance({
                error,
                phaseId: phaseName,
                phaseElapsedMs: elapsedMs,
                phaseBudgetMs: timeoutMs,
                progressCheckpoints,
                safeLifecycleState: finalState,
              })
            : null,
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
        }));
        completedNames.add(phaseName);
        write();
        return result;
      } catch (error) {
        const disposition = runtimeSmokeFailureDisposition(error);
        records.push(createRecord({
          outcome: disposition.phaseOutcome,
          error,
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
