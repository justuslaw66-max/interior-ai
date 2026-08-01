import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RUNTIME_SMOKE_PHASE_TIMING_SCHEMA =
  "interior-ai.runtime-smoke-phase-timings.v1";

export const RUNTIME_SMOKE_PHASE_BUDGETS = Object.freeze([
  { name: "test-body-setup", timeoutMs: 5_000 },
  { name: "initial-navigation", timeoutMs: 45_000 },
  { name: "fixture-creation", timeoutMs: 50_000 },
  { name: "fixture-reload-2d-readiness", timeoutMs: 60_000 },
  { name: "initial-glb-loading-and-selection-verification", timeoutMs: 45_000 },
  { name: "semantic-readiness", timeoutMs: 65_000 },
  { name: "bounds-verification", timeoutMs: 45_000 },
  { name: "render-loop-assertions", timeoutMs: 5_000 },
  { name: "remount", timeoutMs: 60_000 },
  { name: "reload-1", timeoutMs: 70_000 },
  { name: "reload-2", timeoutMs: 70_000 },
  { name: "reload-3", timeoutMs: 70_000 },
  { name: "persistence-assertions", timeoutMs: 10_000 },
  { name: "final-body-state-assertions", timeoutMs: 10_000 },
]);

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
  constructor(phaseName, timeoutMs) {
    super(`Runtime-smoke phase ${phaseName} exceeded its ${timeoutMs}ms budget`);
    this.name = "RuntimeSmokePhaseTimeoutError";
    this.phaseName = phaseName;
    this.timeoutMs = timeoutMs;
  }
}

function diagnosticCategory(error) {
  if (error instanceof RuntimeSmokeTerminalError) return error.safeCategory;
  if (error instanceof RuntimeSmokePhaseTimeoutError) return "phase-timeout";
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
      const startedAt = now();
      let timeoutHandle;
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimer(
          () => reject(new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs)),
          timeoutMs,
        );
      });
      try {
        const result = await Promise.race([Promise.resolve().then(task), timeout]);
        records.push({
          name: phaseName,
          startTimeRelativeMs: startedAt - testStartedAt,
          elapsedMs: Math.max(0, now() - startedAt),
          outcome: "passed",
          timeoutBudgetMs: timeoutMs,
          finalLifecycleState: safeLifecycleState(finalLifecycleState()),
          safeDiagnosticCategory: "none",
        });
        completedNames.add(phaseName);
        write();
        return result;
      } catch (error) {
        records.push({
          name: phaseName,
          startTimeRelativeMs: startedAt - testStartedAt,
          elapsedMs: Math.max(0, now() - startedAt),
          outcome:
            error instanceof RuntimeSmokePhaseTimeoutError
              ? "timed-out"
              : error instanceof RuntimeSmokeTerminalError
                ? "terminal-error"
                : "failed",
          timeoutBudgetMs: timeoutMs,
          finalLifecycleState: safeLifecycleState(finalLifecycleState()),
          safeDiagnosticCategory: diagnosticCategory(error),
        });
        completedNames.add(phaseName);
        write();
        throw error;
      } finally {
        if (timeoutHandle !== undefined) clearTimer(timeoutHandle);
      }
    },
    records,
  };
}
