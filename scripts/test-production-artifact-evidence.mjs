import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_SCHEMA,
  PRODUCTION_EVIDENCE_SERVER_COMMAND,
  canonicalizeProductionEvidenceReport,
  comparePortablePaths,
  createProductionEvidenceBundle,
  createProductionEvidenceManifest,
  recordProductionEvidenceTest,
  validateProductionEvidence,
  verifyRuntimeSmokeFailureEvidence,
  writeProductionEvidenceManifest,
} from "./production-artifact-evidence.mjs";
import { inspectGitTree } from "./vercel-output-manifest.mjs";
import {
  GITLEAKS_ARCHIVE_ENTRIES,
  GITLEAKS_STAGING_ROOT,
  prepareGitleaksArtifact,
  verifyCheckedOutSourceIdentity,
  verifyGitleaksArtifact,
} from "./gitleaks-artifact.mjs";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT,
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
  RUNTIME_SMOKE_PHASE_BUDGETS,
  RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokeNoProgressError,
  RuntimeSmokeOperationAttemptTimeoutError,
  RuntimeSmokeOperationTimeoutError,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
  createRuntimeSmokeOperationDeadline,
  createRuntimeSmokePhaseRecorder,
  deriveFurnishedTemplatePhaseTimeout,
  deriveRuntimeSmokeWholeTestTimeout,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeAggregateLifecycleState,
  runtimeSmokeOperationAttempt,
  runtimeSmokePhaseBudget,
  waitForRuntimeSmokeOperationDeadline,
} from "./runtime-smoke-phase-budget.mjs";
import {
  captureImmediatePostReadinessSnapshot,
  runRuntimeSmokePostReadinessOperation,
} from "./runtime-smoke-post-readiness.mjs";
import { createRuntimeSmokeReadinessObservation } from "./runtime-smoke-readiness-diagnostics.mjs";
import {
  projectRuntimeSmokeBrowserCallbackMilestone,
  projectRuntimeSmokeBrowserHeartbeat,
} from "./runtime-smoke-browser-diagnostics.mjs";

const sequentialRuntimeSmokeBudgetMs = RUNTIME_SMOKE_PHASE_BUDGETS.reduce(
  (total, phase) => total + phase.timeoutMs,
  0,
);
const runtimeSmokeOverheadBudgetMs = Object.values(
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
).reduce((total, budget) => total + budget, 0);
const boundsPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.filter(
  (phase) => phase.name === "bounds-verification",
);
assert.equal(boundsPhaseBudgets.length, 1, "bounds-verification must have one canonical budget");
assert.equal(boundsPhaseBudgets[0]?.timeoutMs, 103_000);

{
  const safeReadinessSummary = {
    schema: "interior-ai.glb-safe-readiness-summary.v1",
    reloadGeneration: 2,
    registryVersion: 41,
    activeSetHash: "fnv1a-1234abcd",
    activeRequiredCount: 1,
    includedModelCount: 1,
    omittedModelCount: 0,
    eventLoopDelayMs: { last: 7, maximum: 31 },
    cacheTotals: {
      parsedEntries: 1,
      parsedReferences: 1,
      preparedEntries: 1,
      preparedReferences: 1,
    },
    models: [
      {
        ordinal: 1,
        identityHash: "fnv1a-abcd1234",
        active: true,
        requiredForReadiness: true,
        reloadGeneration: 2,
        generationState: "current",
        loadState: "loading",
        pendingStage: "parse-decode",
        lastTransitionName: "response-complete",
        lastTransitionAtMs: 125,
        stageAtMs: {
          mounted: 10,
          requestStarted: 12,
          responseCompleted: 125,
          parseCompleted: null,
          normalizationStarted: null,
          normalizationCompleted: null,
          materialsStarted: 11,
          materialsCompleted: 13,
          boundsStarted: null,
          boundsCompleted: null,
          sceneAttached: null,
          ready: null,
          error: null,
          cancelled: null,
        },
        cache: {
          delivery: "network",
          parsedAcquisition: "miss",
          preparedAcquisition: "miss",
          resourceKind: "prepared",
          selectedEntry: { state: "pending", referenceCount: 1 },
          parsedEntry: { state: "pending", referenceCount: 1 },
          preparedEntry: { state: "pending", referenceCount: 1 },
          acquiredAtMs: 12,
          releasedAtMs: null,
        },
        counters: {
          mounts: 1,
          unmounts: 0,
          supersededMounts: 0,
          ignoredStaleTransitions: 0,
        },
      },
    ],
  };
  const observation = createRuntimeSmokeReadinessObservation({
    phaseName: "reload-1",
    snapshot: { safeReadinessSummary },
    responseTotal: 6,
    responseRequired: 6,
    requestTotal: 6,
    browserErrorCount: 0,
  });
  assert.match(observation.signature, /fnv1a-1234abcd/);
  assert.ok(observation.checkpoints.length >= 8);
  assert.equal(
    observation.checkpoints.every((name) =>
      /^[a-z0-9][a-z0-9-]{0,95}$/.test(name),
    ),
    true,
  );
  assert.equal(
    JSON.stringify(observation.diagnostic).includes("/assets/models/"),
    false,
  );
  assert.notEqual(
    createRuntimeSmokeReadinessObservation({
      phaseName: "reload-1",
      snapshot: { safeReadinessSummary },
      responseTotal: 7,
      responseRequired: 9,
      requestTotal: 7,
      browserErrorCount: 0,
    }).signature,
    observation.signature,
    "response changes must create meaningful readiness progress",
  );
  assert.notEqual(
    createRuntimeSmokeReadinessObservation({
      phaseName: "reload-1",
      snapshot: { safeReadinessSummary },
      responseTotal: 6,
      responseRequired: 6,
      requestTotal: 7,
      browserErrorCount: 0,
    }).signature,
    observation.signature,
    "request changes must retain outstanding-request progress",
  );
  assert.throws(
    () =>
      createRuntimeSmokeReadinessObservation({
        phaseName: "reload-1",
        snapshot: {
          safeReadinessSummary: {
            ...safeReadinessSummary,
            url: "https://unsafe.example.test/model.glb",
          },
        },
        responseTotal: 6,
        responseRequired: 6,
        requestTotal: 6,
        browserErrorCount: 0,
      }),
    /safe readiness summary is malformed/,
    "unknown summary fields must never reach retained diagnostics",
  );
  assert.throws(
    () =>
      createRuntimeSmokeReadinessObservation({
        phaseName: "reload-1",
        snapshot: {
          safeReadinessSummary: {
            ...safeReadinessSummary,
            models: [
              {
                ...safeReadinessSummary.models[0],
                token: "unsafe",
              },
            ],
          },
        },
        responseTotal: 6,
        responseRequired: 6,
        requestTotal: 6,
        browserErrorCount: 0,
      }),
    /safe readiness model is malformed/,
    "unknown model fields must never reach retained diagnostics",
  );
}

{
  const callback = projectRuntimeSmokeBrowserCallbackMilestone({
    schema: "interior-ai.runtime-smoke-browser-callback.v1",
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    requestId: 3,
    stage: "snapshot-complete",
  });
  assert.deepEqual(callback, {
    schema: "interior-ai.runtime-smoke-browser-callback.v1",
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    requestId: 3,
    stage: "snapshot-complete",
  });
  assert.throws(
    () =>
      projectRuntimeSmokeBrowserCallbackMilestone({
        ...callback,
        url: "https://unsafe.example.test/model.glb",
      }),
    /callback milestone is unsafe/,
  );
  for (const invalidCallback of [
    { ...callback, schema: "unsafe.callback.v1" },
    { ...callback, requestId: 0 },
    { ...callback, stage: "raw-payload-ready" },
  ]) {
    assert.throws(
      () => projectRuntimeSmokeBrowserCallbackMilestone(invalidCallback),
      /callback milestone is unsafe/,
      "invalid callback values must be rejected before host logging",
    );
  }
  const heartbeat = projectRuntimeSmokeBrowserHeartbeat({
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v1",
    kind: "interval",
    sequence: 4,
    observedAtMs: 2_000,
    eventLoopDelayMs: 7,
    maximumEventLoopDelayMs: 12,
  });
  assert.deepEqual(heartbeat, {
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v1",
    kind: "interval",
    sequence: 4,
    observedAtMs: 2_000,
    eventLoopDelayMs: 7,
    maximumEventLoopDelayMs: 12,
  });
  assert.throws(
    () => projectRuntimeSmokeBrowserHeartbeat({ ...heartbeat, token: "unsafe" }),
    /browser heartbeat is unsafe/,
  );
  for (const invalidHeartbeat of [
    { ...heartbeat, schema: "unsafe.heartbeat.v1" },
    { ...heartbeat, sequence: 0 },
    { ...heartbeat, eventLoopDelayMs: -1 },
    { ...heartbeat, maximumEventLoopDelayMs: 6 },
  ]) {
    assert.throws(
      () => projectRuntimeSmokeBrowserHeartbeat(invalidHeartbeat),
      /browser heartbeat is unsafe/,
      "invalid heartbeats must be rejected before host logging",
    );
  }
}
assert.deepEqual(RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT, {
  requiredStableSamples: 2,
  sampleIntervalMs: 500,
  firstSampleImmediate: true,
  baselineEvaluationCount: 1,
  evaluationCount: 3,
  evaluationTimeoutMs: 10_000,
  assertionAllowanceMs: 1_000,
  minimumTheoreticalCompletionMs: 1_000,
  maximumLegalSequentialEnvelopeMs: 32_000,
  orchestrationMarginMs: 10_000,
  timeoutMs: 42_000,
});
assert.ok(
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.timeoutMs >=
    RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.maximumLegalSequentialEnvelopeMs +
      RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.orchestrationMarginMs,
  "diagnostics-settle budget must contain its full sequential envelope and margin",
);
const reloadOperationEnvelopeMs = FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.reduce(
  (total, operation) => total + operation.timeoutMs,
  0,
);
assert.equal(reloadOperationEnvelopeMs, 278_000);
assert.equal(FURNISHED_TEMPLATE_RELOAD_CONTRACT.orchestrationMarginMs, 30_000);
assert.equal(
  deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT),
  308_000,
  "reload correctness timeout must equal the legal nested envelope plus margin",
);
assert.equal(FURNISHED_TEMPLATE_RELOAD_CONTRACT.performanceWarningThresholdMs, 70_000);
assert.equal(
  runtimeSmokeAggregateLifecycleState({
    expectedModelCount: 3,
    readyModelCount: 1,
    loadingModelCount: 0,
    terminalErrorModelCount: 0,
    combinedReadinessSatisfied: false,
  }),
  "loading",
  "partial ready diagnostics with missing models must not claim aggregate ready",
);
assert.equal(
  runtimeSmokeAggregateLifecycleState({
    expectedModelCount: 3,
    readyModelCount: 3,
    loadingModelCount: 0,
    terminalErrorModelCount: 0,
    combinedReadinessSatisfied: true,
  }),
  "ready",
);
assert.ok(
  FURNISHED_TEMPLATE_RELOAD_CONTRACT.performanceWarningThresholdMs <
    deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT),
  "performance observation must remain separate from correctness",
);
const operationDeadlineExports = Object.keys(
  await import("./runtime-smoke-operation-deadline.mjs"),
);
assert.equal(
  operationDeadlineExports.includes(
    "createRuntimeSmokeOperationDeadlineContext",
  ),
  false,
  "the raw canonical-budget branding factory must not be public",
);
assert.equal(
  operationDeadlineExports.includes("assertRuntimeSmokeOperationAttempt"),
  false,
  "operation-attempt branding must remain private",
);
assert.throws(
  () => new RuntimeSmokeOperationTimeoutError({
    phaseId: "reload-1",
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 65_508,
    operationBudgetMs: 65_507,
  }),
  /operation attempt is invalid/,
  "callers must not be able to construct timeout evidence from an arbitrary budget",
);
{
  let clock = 0;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "hydration-snapshot",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  clock = 4_999.75;
  assert.throws(
    () => new RuntimeSmokeOperationTimeoutError({ operationAttempt }),
    /requires a reached deadline/,
    "a valid branded attempt must not mint canonical evidence before its deadline",
  );
}
for (const phaseName of ["reload-1", "reload-2", "reload-3"]) {
  assert.equal(
    FURNISHED_TEMPLATE_PHASE_CONTRACTS[phaseName],
    FURNISHED_TEMPLATE_RELOAD_CONTRACT,
    `${phaseName} must consume the one canonical reload contract`,
  );
  assert.equal(runtimeSmokePhaseBudget(phaseName), 308_000);
}
assert.equal(runtimeSmokePhaseBudget("remount"), 165_000);
assert.ok(
  runtimeSmokePhaseBudget("bounds-verification") - 43_432 >= 25_000,
  "bounds verification needs meaningful GitHub-runner headroom",
);

{
  let clock = 0;
  let fireTimeout;
  let clearedHandle = null;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "hydration-snapshot",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 5_000);
      fireTimeout = callback;
      return 17;
    },
    clearTimer: (handle) => {
      clearedHandle = handle;
    },
  });
  clock = 5_000;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.phaseId === "reload-1" &&
      error.operationId === "hydration-snapshot" &&
      error.operationBudgetMs === 5_000 &&
      error.operationElapsedMs === 5_000 &&
      error.operationElapsedPreciseMs === 5_000 &&
      error.attemptTimeoutMs === 5_000 &&
      error.remainingAtAttemptStartMs === 5_000 &&
      error.deadlineReached === true,
  );
  assert.equal(clearedHandle, 17);
}

{
  let clock = 0;
  let fireTimeout;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  assert.equal(operationContext.monotonicStartedAt, 0);
  assert.equal(operationContext.monotonicDeadlineAt, 70_000);
  clock = 1_000;
  const firstPollingAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(firstPollingAttempt.attemptTimeoutMs, 69_000);
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  clock = 4_493;
  const cappedPollingAttempt = runtimeSmokeOperationAttempt(
    operationContext,
    500,
  );
  assert.equal(cappedPollingAttempt.attemptTimeoutMs, 500);
  assert.equal(cappedPollingAttempt.remainingAtAttemptStartMs, 65_507);
  assert.equal(operationContext.canonicalBudgetMs, 70_000);
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(operationAttempt.attemptTimeoutMs, 65_507);
  assert.equal(operationAttempt.remainingAtAttemptStartMs, 65_507);
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 65_507);
      fireTimeout = callback;
      return 23;
    },
    clearTimer: () => {},
  });
  clock = 70_001;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationBudgetMs === 70_000 &&
      error.operationElapsedMs === 70_001 &&
      error.operationElapsedPreciseMs === 70_001 &&
      error.attemptTimeoutMs === 65_507 &&
      error.remainingAtAttemptStartMs === 65_507 &&
      error.deadlineReached === true,
    "a dynamic attempt allowance must not replace the canonical operation budget",
  );
}

{
  let clock = 0;
  let nextHandle = 0;
  const timers = new Map();
  const scheduledDelays = [];
  const setTimer = (callback, delayMs) => {
    const handle = ++nextHandle;
    timers.set(handle, callback);
    scheduledDelays.push(delayMs);
    return handle;
  };
  const clearTimer = (handle) => timers.delete(handle);
  const fireLatestTimer = () => {
    const handle = Math.max(...timers.keys());
    const callback = timers.get(handle);
    assert.equal(typeof callback, "function");
    timers.delete(handle);
    callback();
  };
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  clock = 4_542;
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(operationAttempt.attemptTimeoutMs, 65_458);
  assert.equal(operationAttempt.remainingAtAttemptStartMs, 65_458);
  let settled = false;
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer,
    clearTimer,
  }).finally(() => {
    settled = true;
  });
  clock = 69_999.75;
  fireLatestTimer();
  await Promise.resolve();
  assert.equal(
    settled,
    false,
    "an integer display boundary must not emit an early canonical timeout",
  );
  assert.deepEqual(scheduledDelays, [65_458, 1]);
  clock = 70_000.25;
  fireLatestTimer();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationBudgetMs === 70_000 &&
      error.operationElapsedMs === 70_000 &&
      error.operationElapsedPreciseMs === 70_000.25 &&
      error.attemptTimeoutMs === 65_458 &&
      error.remainingAtAttemptStartMs === 65_458 &&
      error.deadlineReached === true,
    "the producer must wait for the monotonic deadline before persisting a timeout",
  );
}

{
  let clock = 0;
  let fireTimeout;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  const operationAttempt = runtimeSmokeOperationAttempt(
    operationContext,
    500,
  );
  const operation = runRuntimeSmokeBoundedOperation({
    operationAttempt,
    task: () => new Promise(() => {}),
    setTimer: (callback, timeoutMs) => {
      assert.equal(timeoutMs, 500);
      fireTimeout = callback;
      return 31;
    },
    clearTimer: () => {},
  });
  clock = 500;
  fireTimeout();
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationAttemptTimeoutError &&
      !(error instanceof RuntimeSmokeOperationTimeoutError) &&
      error.attemptTimeoutMs === 500 &&
      error.remainingAtAttemptStartMs === 70_000 &&
      error.deadlineReached === false,
    "a materially early capped attempt must not impersonate canonical expiration",
  );
}

{
  let clock = 0;
  let fireTimeout;
  const recorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "reload-1", timeoutMs: 308_000 }],
  });
  await assert.rejects(
    recorder.run(
      "reload-1",
      () => {
        const operationContext = createRuntimeSmokeOperationDeadline({
          phaseName: "reload-1",
          operationName: "model-responses-and-readiness",
          now: () => clock,
        });
        const operation = runRuntimeSmokeBoundedOperation({
          operationAttempt: runtimeSmokeOperationAttempt(
            operationContext,
            500,
          ),
          task: () => new Promise(() => {}),
          setTimer: (callback) => {
            fireTimeout = callback;
            return 37;
          },
          clearTimer: () => {},
        });
        clock = 500;
        fireTimeout();
        return operation;
      },
      () => "loading",
    ),
    RuntimeSmokeOperationAttemptTimeoutError,
  );
  const failure = recorder.records[0]?.failure;
  assert.equal(recorder.records[0]?.outcome, "failed");
  assert.equal(recorder.records[0]?.timeoutBudgetMs, 308_000);
  assert.equal(failure?.failureKind, "unexpected-error");
  assert.equal(failure?.operationId, null);
  assert.equal(failure?.operationBudgetMs, null);
  assert.equal(failure?.operationElapsedMs, null);
  assert.equal(failure?.operationElapsedPreciseMs, null);
  assert.equal(failure?.deadlineReached, null);
}

{
  let clock = 10.25;
  const operationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "reload-1",
    operationName: "model-responses-and-readiness",
    now: () => clock,
  });
  assert.equal(operationContext.monotonicStartedAt, 10.25);
  assert.equal(operationContext.monotonicDeadlineAt, 70_010.25);
  clock = 4_552.5;
  const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
  assert.equal(
    operationAttempt.remainingAtAttemptStartMs,
    65_458,
    "remaining allowance must round up so integer conversion cannot shorten the deadline",
  );
  assert.equal(operationAttempt.attemptTimeoutMs, 65_458);
}

{
  let clock = 0;
  let nextHandle = 0;
  const timers = new Map();
  const scheduledDelays = [];
  const setTimer = (callback, delayMs) => {
    const handle = ++nextHandle;
    timers.set(handle, callback);
    scheduledDelays.push(delayMs);
    return handle;
  };
  const clearTimer = (handle) => timers.delete(handle);
  const fireLatestTimer = () => {
    const handle = Math.max(...timers.keys());
    const callback = timers.get(handle);
    assert.equal(typeof callback, "function");
    timers.delete(handle);
    callback();
  };
  const settleContext = createRuntimeSmokeOperationDeadline({
    phaseName: "bounds-verification",
    operationName: "diagnostics-settle",
    now: () => clock,
  });
  clock = 35_000;
  const settleAttempt = runtimeSmokeOperationAttempt(
    settleContext,
    RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.evaluationTimeoutMs,
  );
  assert.equal(settleAttempt.attemptTimeoutMs, 7_000);
  const evaluationContext = createRuntimeSmokeOperationDeadline({
    phaseName: "bounds-verification",
    operationName: "diagnostics-settle-evaluation",
    now: () => clock,
  });
  const evaluationAttempt = runtimeSmokeOperationAttempt(
    evaluationContext,
    settleAttempt.attemptTimeoutMs,
  );
  const evaluation = runRuntimeSmokeBoundedOperation({
    operationAttempt: evaluationAttempt,
    task: () => new Promise(() => {}),
    setTimer,
    clearTimer,
  });
  let evaluationSettled = false;
  evaluation.finally(() => {
    evaluationSettled = true;
  }).catch(() => {});
  clock = 41_999.75;
  fireLatestTimer();
  await Promise.resolve();
  assert.equal(
    evaluationSettled,
    false,
    "a capped leaf attempt must not expire before its monotonic attempt deadline",
  );
  clock = 42_000.25;
  fireLatestTimer();
  const attemptError = await evaluation.catch((error) => error);
  assert.ok(attemptError instanceof RuntimeSmokeOperationAttemptTimeoutError);
  assert.equal(attemptError.deadlineReached, false);
  const operation = waitForRuntimeSmokeOperationDeadline({
    operationAttempt: settleAttempt,
    cause: attemptError,
    setTimer,
    clearTimer,
  });
  await assert.rejects(
    operation,
    (error) =>
      error instanceof RuntimeSmokeOperationTimeoutError &&
      error.operationId === "diagnostics-settle" &&
      error.operationBudgetMs === 42_000 &&
      error.operationElapsedMs === 42_000 &&
      error.operationElapsedPreciseMs === 42_000.25 &&
      error.attemptTimeoutMs === 7_000 &&
      error.deadlineReached === true &&
      error.cause === attemptError,
    "a capped diagnostics leaf timeout must retain its expired parent provenance",
  );
  assert.deepEqual(scheduledDelays, [7_000, 1]);
}

{
  let clock = 0;
  const nestedTimeoutRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 103_000 }],
  });
  await assert.rejects(
    nestedTimeoutRecorder.run(
      "bounds-verification",
      () => {
        const operationContext = createRuntimeSmokeOperationDeadline({
          phaseName: "bounds-verification",
          operationName: "diagnostics-settle",
          now: () => clock,
        });
        const operationAttempt = runtimeSmokeOperationAttempt(operationContext);
        clock = 42_000;
        throw new RuntimeSmokeOperationTimeoutError({
          operationAttempt,
        });
      },
      () => "ready",
    ),
    RuntimeSmokeOperationTimeoutError,
  );
  const record = nestedTimeoutRecorder.records[0];
  assert.equal(record?.outcome, "failed");
  assert.equal(record?.timeoutBudgetMs, 103_000);
  assert.equal(record?.failure?.failureKind, "nested-operation-timeout");
  assert.equal(record?.failure?.operationId, "diagnostics-settle");
  assert.equal(record?.failure?.operationOutcome, "timed-out");
  assert.equal(record?.failure?.operationBudgetMs, 42_000);
  assert.equal(record?.failure?.operationElapsedPreciseMs, 42_000);
  assert.equal(record?.failure?.attemptTimeoutMs, 42_000);
  assert.equal(record?.failure?.remainingAtAttemptStartMs, 42_000);
  assert.equal(record?.failure?.deadlineReached, true);
  assert.equal(record?.failure?.phaseBudgetMs, 103_000);
}
assert.ok(
  runtimeSmokePhaseBudget("remount") - 53_769 >= 100_000,
  "remount needs meaningful GitHub-runner headroom",
);
assert.equal(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  sequentialRuntimeSmokeBudgetMs + runtimeSmokeOverheadBudgetMs,
  "the whole-test timeout must equal all sequential phase budgets plus explicit overhead",
);
assert.ok(
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS > sequentialRuntimeSmokeBudgetMs,
  "the whole-test timeout must leave explicit setup, teardown, assertion, and orchestration headroom",
);
const increasedPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase) =>
  phase.name === "bounds-verification"
    ? { ...phase, timeoutMs: phase.timeoutMs + 7_000 }
    : phase,
);

const changedReloadContract = {
  ...FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  operations: FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.map((operation) =>
    operation.name === "model-responses-and-readiness"
      ? { ...operation, timeoutMs: operation.timeoutMs + 11_000 }
      : operation,
  ),
};
assert.equal(
  deriveFurnishedTemplatePhaseTimeout(changedReloadContract),
  deriveFurnishedTemplatePhaseTimeout(FURNISHED_TEMPLATE_RELOAD_CONTRACT) + 11_000,
);
const changedReloadPhaseBudgets = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase) =>
  phase.name.startsWith("reload-")
    ? { ...phase, timeoutMs: deriveFurnishedTemplatePhaseTimeout(changedReloadContract) }
    : phase,
);
assert.equal(
  deriveRuntimeSmokeWholeTestTimeout({ phases: changedReloadPhaseBudgets }),
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS + 33_000,
  "one reload-contract change must update all three reloads and the whole envelope",
);
assert.equal(
  deriveRuntimeSmokeWholeTestTimeout({ phases: increasedPhaseBudgets }),
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS + 7_000,
  "changing one canonical phase budget must mechanically update the whole-test timeout",
);

{
  const terminalRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 1_000 }],
  });
  let attempts = 0;
  const terminalStartedAt = Date.now();
  await assert.rejects(
    terminalRecorder.run("bounds-verification", async () => {
      attempts += 1;
      throw new RuntimeSmokeTerminalError("bounds-verification");
    }, () => "error"),
    /bounds-verification reached terminal lifecycle state error/,
  );
  assert.equal(attempts, 1, "a terminal lifecycle error must fail immediately");
  assert.ok(Date.now() - terminalStartedAt < 1_000, "terminal error must beat the phase timeout");
  assert.deepEqual(
    terminalRecorder.records.map(({ outcome, finalLifecycleState, failure }) => ({
      outcome,
      finalLifecycleState,
      failureKind: failure?.failureKind,
    })),
    [{
      outcome: "terminal-error",
      finalLifecycleState: "error",
      failureKind: "terminal-lifecycle-error",
    }],
  );
}

{
  const timeoutRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 5 }],
  });
  await assert.rejects(
    timeoutRecorder.run(
      "bounds-verification",
      () => new Promise(() => {}),
      () => "loading",
    ),
    (error) =>
      error instanceof RuntimeSmokePhaseTimeoutError &&
      error.phaseId === "bounds-verification" &&
      error.phaseBudgetMs === 5,
  );
  assert.equal(timeoutRecorder.records[0]?.outcome, "timed-out");
  assert.equal(timeoutRecorder.records[0]?.name, "bounds-verification");
  assert.equal(timeoutRecorder.records[0]?.timeoutBudgetMs, 5);
  assert.equal(timeoutRecorder.records[0]?.finalLifecycleState, "loading");
  assert.equal(timeoutRecorder.records[0]?.failure?.failureKind, "phase-timeout");
  assert.equal(timeoutRecorder.records[0]?.failure?.operationId, null);
}

{
  const assertionRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 1_000 }],
  });
  await assert.rejects(
    assertionRecorder.run("bounds-verification", () => assert.fail("fixture assertion")),
    /fixture assertion/,
  );
  assert.equal(assertionRecorder.records[0]?.outcome, "failed");
  assert.equal(
    assertionRecorder.records[0]?.failure?.failureKind,
    "assertion-failure",
  );
}

{
  const playwrightAssertionRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "remount", timeoutMs: 165_000 }],
  });
  const matcherError = new Error("structured matcher fixture");
  matcherError.matcherResult = { pass: false };
  await assert.rejects(
    playwrightAssertionRecorder.run("remount", () => {
      throw matcherError;
    }),
    /structured matcher fixture/,
  );
  assert.equal(
    playwrightAssertionRecorder.records[0]?.failure?.failureKind,
    "assertion-failure",
  );
}

{
  let clock = 0;
  const unexpectedRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock,
    phaseBudgets: [{ name: "bounds-verification", timeoutMs: 103_000 }],
  });
  await assert.rejects(
    unexpectedRecorder.run(
      "bounds-verification",
      () => {
        clock = 12_088;
        throw new Error("unexpected structured fixture");
      },
      () => "loading",
    ),
    /unexpected structured fixture/,
  );
  assert.equal(unexpectedRecorder.records[0]?.outcome, "failed");
  assert.equal(
    unexpectedRecorder.records[0]?.failure?.failureKind,
    "unexpected-error",
  );
}

{
  const warnings = [];
  let clock = 0;
  const progressRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    now: () => clock++,
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 20 }],
        orchestrationMarginMs: 80,
        noProgressTimeoutMs: 50,
        performanceWarningThresholdMs: 0,
      },
    },
    writePerformanceWarning: (message) => warnings.push(message),
  });
  await progressRecorder.run("reload-1", async ({ checkpoint }) => {
    checkpoint("navigation-complete", "loading");
    checkpoint("models-ready", "ready");
  }, () => "ready");
  assert.equal(progressRecorder.records[0]?.outcome, "passed");
  assert.equal(progressRecorder.records[0]?.performanceWarningExceeded, true);
  assert.equal(warnings.length, 1);
  assert.deepEqual(
    progressRecorder.records[0]?.progressCheckpoints.map(({ name }) => name),
    ["phase-start", "navigation-complete", "models-ready", "phase-complete"],
  );
}

{
  let lateCheckpoint;
  const noProgressRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 5 }],
        orchestrationMarginMs: 95,
        noProgressTimeoutMs: 5,
        performanceWarningThresholdMs: 70,
      },
    },
    writePerformanceWarning: () => undefined,
  });
  await assert.rejects(
    noProgressRecorder.run(
      "reload-1",
      ({ checkpoint }) => {
        lateCheckpoint = checkpoint;
        return new Promise(() => {});
      },
      () => "loading",
    ),
    RuntimeSmokeNoProgressError,
  );
  assert.equal(noProgressRecorder.records[0]?.outcome, "stalled");
  assert.equal(
    noProgressRecorder.records[0]?.failure?.failureKind,
    "no-progress-watchdog",
  );
  lateCheckpoint("late-task-progress", "ready");
  assert.deepEqual(
    noProgressRecorder.records[0]?.progressCheckpoints.map(({ name }) => name),
    ["phase-start"],
    "a task that outlives its failed phase must not mutate retained progress",
  );
}

{
  const postReadinessRecorder = createRuntimeSmokePhaseRecorder({
    repositoryRoot: process.cwd(),
    phaseBudgets: [{ name: "reload-1", timeoutMs: 100 }],
    phaseContracts: {
      "reload-1": {
        operations: [{ name: "work", timeoutMs: 5 }],
        orchestrationMarginMs: 95,
        noProgressTimeoutMs: 5,
        performanceWarningThresholdMs: 70,
      },
    },
    writePerformanceWarning: () => undefined,
  });
  await assert.rejects(
    postReadinessRecorder.run(
      "reload-1",
      ({ checkpoint }) =>
        runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "post-ready-settle-started",
          completedCheckpoint: "post-ready-settle-complete",
          task: () => new Promise(() => {}),
        }),
      () => "ready",
    ),
    RuntimeSmokeNoProgressError,
  );
  assert.equal(postReadinessRecorder.records[0]?.outcome, "stalled");
  assert.equal(
    postReadinessRecorder.records[0]?.failure?.failureKind,
    "no-progress-watchdog",
  );
  assert.equal(
    postReadinessRecorder.records[0]?.failure?.lastSafeCheckpoint,
    "post-ready-settle-started",
  );
  assert.deepEqual(
    postReadinessRecorder.records[0]?.progressCheckpoints.map(
      ({ name }) => name,
    ),
    ["phase-start", "post-ready-settle-started"],
    "a stalled post-readiness await must retain its exact started checkpoint",
  );
}

{
  const checkpoints = [];
  const diagnostics = [];
  const sourceSnapshot = {
    schema: "interior-ai.glb-required-snapshot.v1",
    reloadGeneration: 2,
    registryEntryCount: 1,
    activeRequiredCount: 1,
    activeRequiredModelIds: ["runtime-smoke-model-1"],
    models: [
      {
        key: "runtime-smoke-model-1",
        active: true,
        requiredForReadiness: true,
        loadState: "ready",
        generationState: "current",
        lastTransitionName: "ready",
        lastTransitionAtMs: 123.4,
      },
    ],
    caches: {
      parsed: { entryCount: 1, activeReferenceCount: 1 },
      prepared: {
        entryCount: 1,
        activeReferenceCount: 1,
        zeroReferenceEntryCount: 0,
      },
    },
  };
  const detachedSnapshot = captureImmediatePostReadinessSnapshot({
    checkpoint: (name, lifecycleState) =>
      checkpoints.push({ name, lifecycleState }),
    phaseName: "reload-1",
    responseTotal: 6,
    snapshot: sourceSnapshot,
    timing: {
      hostRequestStartedAtUnixMs: 99,
      schedulingDelayMs: 1,
      computationDurationMs: 2,
      serializationDurationMs: 3,
      transferDurationMs: 4,
    },
    writeDiagnostic: (message) => diagnostics.push(message),
  });
  sourceSnapshot.models[0].loadState = "error";
  assert.equal(detachedSnapshot.models[0].loadState, "ready");
  assert.deepEqual(
    checkpoints.map(({ name }) => name),
    [
      "immediate-snapshot-captured",
      "immediate-generation-2",
      "immediate-registry-1-required-1-ready-1-loading-0-error-0-stale-0",
      "immediate-cache-parsed-1-refs-1-prepared-1-refs-1-retained-0",
      "immediate-response-total-6",
      "immediate-active-key-1-runtime-smoke-model-1",
      "immediate-model-1-transition-ready-at-123",
      "immediate-snapshot-wait-1-compute-2-serialize-3-transfer-4",
    ],
  );
  assert.equal(
    diagnostics[0]?.startsWith(
      "[runtime-smoke-immediate-post-readiness-snapshot] ",
    ),
    true,
  );
  assert.doesNotMatch(
    diagnostics[0],
    /hostRequestStartedAtUnixMs/,
    "immediate evidence must retain relative timing only",
  );
}

const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
assert.match(
  runtimeSmokeSource,
  /test\.setTimeout\(RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS\)/,
  "the required identity must consume the derived timeout without duplicating a number",
);
assert.doesNotMatch(runtimeSmokeSource, /test\.slow\(|test\.skip\(|retries\s*:/);
const heartbeatHandlerSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const browserHeartbeatPrefix"),
  runtimeSmokeSource.indexOf('if (message.type() === "error")'),
);
assert.match(
  heartbeatHandlerSource,
  /projectRuntimeSmokeBrowserHeartbeat/,
  "browser heartbeats must cross an exact safe projection boundary",
);
assert.doesNotMatch(
  heartbeatHandlerSource,
  /fatalErrors\.push|checkpoint\(/,
  "invalid or delayed heartbeats must never fail or reset progress",
);
assert.match(
  runtimeSmokeSource,
  /projectRuntimeSmokeBrowserCallbackMilestone/,
  "browser callback milestones must be projected before host logging",
);
const reloadLoop = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("for (let reloadIndex"),
  runtimeSmokeSource.indexOf('await phaseRecorder.run("persistence-assertions"'),
);
assert.match(reloadLoop, /waitForReloadModelsReady/);
assert.match(reloadLoop, /reloadIndex\s*<\s*3/);
assert.match(
  reloadLoop,
  /MODEL_FIXTURES\.length\s*\*\s*\(reloadIndex\s*\+\s*2\)/,
  "three reloads must retain cumulative response totals 6, 9, and 12",
);
assert.doesNotMatch(reloadLoop, /waitForModelResponsesOrTerminal/);
assert.doesNotMatch(reloadLoop, /waitForModelDiagnosticsReady/);
assert.match(reloadLoop, /Promise\.all\(\[/);
assert.doesNotMatch(
  reloadLoop,
  /await\s+readModelDiagnostics\(\)/,
  "reload diagnostics must not bypass a named wall-clock operation bound",
);
assert.doesNotMatch(
  reloadLoop,
  /expect\(page\.locator\(["']body["']\)\)\.not\.toContainText/,
  "reload body verification must use the canonical hard-bounded host operation",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /__INTERIOR_AI_GLB_DIAGNOSTICS__/,
  "runtime smoke must not invoke the legacy rich diagnostics global",
);
const postReadinessCaptureIndex = reloadLoop.indexOf(
  "captureImmediatePostReadinessSnapshot",
);
const postReadinessResponseIndex = reloadLoop.lastIndexOf(
  "const responseTotal =",
  postReadinessCaptureIndex,
);
assert.ok(postReadinessResponseIndex >= 0 && postReadinessCaptureIndex >= 0);
assert.doesNotMatch(
  reloadLoop.slice(postReadinessResponseIndex, postReadinessCaptureIndex),
  /\bawait\b/,
  "the immediate snapshot must be captured before any later awaited action",
);
const orderedPostReadinessTokens = [
  "captureImmediatePostReadinessSnapshot",
  "response-total-verification-started",
  "response-total-verification-complete",
  "generation-verification-started",
  "generation-verification-complete",
  "active-key-verification-started",
  "active-key-verification-complete",
  "body-state-verification-started",
  "body-state-verification-complete",
  "post-ready-settle-started",
  "post-ready-settle-complete",
  "post-settle-observation-started",
  "post-settle-observation-complete",
  "required-snapshot-requested",
  "required-snapshot-returned",
  "required-snapshot-assertions-complete",
];
let previousPostReadinessTokenIndex = -1;
for (const token of orderedPostReadinessTokens) {
  const tokenIndex = reloadLoop.indexOf(token);
  assert.ok(
    tokenIndex > previousPostReadinessTokenIndex,
    `${token} must retain ordered post-readiness control flow`,
  );
  previousPostReadinessTokenIndex = tokenIndex;
}
const bodyStateOperationSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const verifyBodyStateAfterReadiness"),
  runtimeSmokeSource.indexOf("const waitForReloadModelsReady"),
);
assert.match(bodyStateOperationSource, /runRuntimeSmokeBoundedOperation/);
assert.match(bodyStateOperationSource, /operationName:\s*["']body-state-assertion["']/);
assert.match(bodyStateOperationSource, /performance\.now\(\)/);
assert.doesNotMatch(
  bodyStateOperationSource,
  /page\.evaluate/,
  "the body-state assertion must not require a second post-readiness browser admission",
);
for (const milestone of [
  "entered-browser",
  "callback-exited",
  "serialization-complete",
]) {
  assert.match(bodyStateOperationSource, new RegExp(milestone));
}
const diagnosticSnapshotSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const readModelDiagnostics ="),
  runtimeSmokeSource.indexOf("let expectedLifecycleRegistrySize"),
);
assert.match(
  diagnosticSnapshotSource,
  /document\.body\.textContent\?\.includes/,
  "body state must be observed inside the atomic readiness callback",
);
assert.match(
  diagnosticSnapshotSource,
  /operation:\s*\{\s*phaseName:\s*string;\s*operationName:\s*string\s*\}/,
  "every diagnostic callback must carry its canonical phase and operation identity",
);
assert.match(
  diagnosticSnapshotSource,
  /interior-ai\.runtime-smoke-browser-callback\.v1/,
  "diagnostic callbacks must expose fixed-stage browser timing observations",
);
assert.match(
  diagnosticSnapshotSource,
  /runtime-smoke-browser-callback-requested[\s\S]*page\.evaluate/,
  "host evidence must identify callback requests before browser admission",
);
assert.match(
  diagnosticSnapshotSource,
  /browserCallbackEnteredMs[\s\S]*browserCallbackExitedMs[\s\S]*serializationCompletedMs[\s\S]*resultReceivedMs/,
  "host and browser timing attribution must remain separate and relative",
);
assert.match(reloadLoop, /recordRequiredSnapshotProof\(phaseName, checkpoint\)/);
assert.match(runtimeSmokeSource, /expect\(immediatePostReadinessSnapshots\)\.toHaveLength\(3\)/);
assert.doesNotMatch(
  runtimeSmokeSource,
  /maximumSamples/,
  "diagnostics settling must enforce elapsed wall time rather than sample count",
);
assert.match(runtimeSmokeSource, /createRuntimeSmokeOperationDeadline/);
assert.match(runtimeSmokeSource, /runtimeSmokeOperationAttempt/);
assert.match(runtimeSmokeSource, /runRuntimeSmokeBoundedOperation/);
assert.match(runtimeSmokeSource, /RuntimeSmokeOperationTimeoutError/);
const settleSampleSource = runtimeSmokeSource.slice(
  runtimeSmokeSource.indexOf("const readSettleSample"),
  runtimeSmokeSource.indexOf("let previous = await readSettleSample"),
);
assert.match(
  settleSampleSource,
  /RuntimeSmokeOperationAttemptTimeoutError/,
  "a capped settle leaf must be distinguished from canonical expiration",
);
assert.match(
  settleSampleSource,
  /waitForRuntimeSmokeOperationDeadline/,
  "a capped settle leaf at the parent boundary must retain parent provenance",
);
assert.match(
  settleSampleSource,
  /settleContext\.deadlineReached\(\)/,
  "settle timeout conversion must prove the parent monotonic deadline",
);
assert.doesNotMatch(runtimeSmokeSource, /operationBudgetMs\s*:/);
assert.doesNotMatch(runtimeSmokeSource, /remainingOperationTimeout/);
assert.doesNotMatch(
  runtimeSmokeSource,
  /RuntimeSmokePhaseTimeoutError/,
  "nested operation exhaustion must not be flattened into a parent phase timeout",
);
for (const operation of FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.filter(
  ({ name }) => ![
    "hydration-snapshot",
    "model-responses-and-readiness",
    "body-state-assertion",
    "diagnostics-settle",
    "final-diagnostics-snapshot",
  ].includes(name),
)) {
  const uses = runtimeSmokeSource.match(
    new RegExp(
      `reloadOperationTimeout\\(\\s*["']${operation.name}["']\\s*,?\\s*\\)`,
      "g",
    ),
  ) ?? [];
  assert.equal(
    uses.length,
    1,
    `${operation.name} must be consumed once per reload implementation`,
  );
}
const phaseOperationUseCount = (phaseName, operationName) =>
  runtimeSmokeSource.match(
    new RegExp(
      `phaseOperationTimeout\\(\\s*["']${phaseName}["']\\s*,\\s*` +
        `["']${operationName}["']\\s*,?\\s*\\)`,
      "g",
    ),
  )?.length ?? 0;
for (const phaseName of [
  "initial-glb-loading-and-selection-verification",
  "bounds-verification",
  "remount",
]) {
  for (const operation of FURNISHED_TEMPLATE_PHASE_CONTRACTS[
    phaseName
  ].operations.filter(({ name }) => ![
    "model-responses",
    "model-readiness",
    "diagnostics-settle",
    "diagnostic-snapshot-and-assertions",
  ].includes(name))) {
    assert.equal(
      phaseOperationUseCount(phaseName, operation.name),
      1,
      `${phaseName}/${operation.name} must own exactly one sequential call budget`,
    );
  }
}
for (const operationName of [
  "model-readiness",
  "diagnostics-settle",
  "diagnostics-settle-evaluation",
  "model-responses-and-readiness",
  "body-state-assertion",
  "model-responses",
  "diagnostic-snapshot-and-assertions",
  "hydration-snapshot",
  "final-diagnostics-snapshot",
]) {
  assert.match(
    runtimeSmokeSource,
    new RegExp(`operationName:\\s*["']${operationName}["']`),
    `${operationName} must derive its deadline from the canonical contract`,
  );
}
assert.match(
  reloadLoop,
  /finalLifecycleState\s*=\s*["']not-observed["'];\s*await phaseRecorder\.run/,
  "every reload phase must reset lifecycle evidence before phase-start",
);
for (const checkpoint of [
  "route-design-loaded",
  "local-fixture-hydrated",
  "view-3d-active",
  "models-ready",
  "bounds-settled",
  "reload-assertions-complete",
]) {
  assert.match(runtimeSmokeSource, new RegExp(checkpoint));
}
for (const modelPath of [
  "public/assets/models/sofa-real-castlery-dawson-ottoman.glb",
  "public/assets/models/sofa-real-castlery-jaron-3s.glb",
  "public/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb",
]) {
  assert.equal(
    existsSync(path.join(process.cwd(), modelPath)),
    true,
    `${modelPath} must remain a repository-controlled production fixture`,
  );
}

if (process.argv.includes("--deadline-boundary-contract-only")) {
  console.log("CH-0017 runtime-smoke deadline-boundary contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--post-readiness-contract-only")) {
  console.log("CH-0028 runtime-smoke post-readiness contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--readiness-diagnostics-contract-only")) {
  console.log("CH-0028 runtime-smoke readiness diagnostic contract tests passed.");
  process.exit(0);
}

if (process.argv.includes("--phase-budget-contract-only")) {
  console.log("CH-0017 runtime-smoke phase-budget contract tests passed.");
  process.exit(0);
}

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0017-gitleaks-artifact-"));
  git(root, ["init"]);
  git(root, ["config", "user.name", "CH-0017 Fixture"]);
  git(root, ["config", "user.email", "ch-0017@example.test"]);
  const sarifBytes = Buffer.from(
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "gitleaks" } }, results: [] }],
    }, null, 2)}\n`,
  );
  write(root, "results.sarif", sarifBytes);
  write(root, "unrelated-runner-file.txt", "must not enter the artifact\n");
  git(root, ["add", "results.sarif", "unrelated-runner-file.txt"]);
  git(root, ["commit", "-m", "fixture"]);
  const testedSourceSha = git(root, ["rev-parse", "HEAD"]);
  const workflowContextSha = "8".repeat(40);
  const githubOutputPath = path.join(root, "github-output");
  writeFileSync(githubOutputPath, "");
  assert.equal(
    verifyCheckedOutSourceIdentity({
      repositoryRoot: root,
      expectedSourceSha: testedSourceSha,
      githubOutputPath,
    }),
    testedSourceSha,
  );
  assert.equal(readFileSync(githubOutputPath, "utf8"), `tested_source_sha=${testedSourceSha}\n`);
  assert.throws(
    () =>
      verifyCheckedOutSourceIdentity({
        repositoryRoot: root,
        expectedSourceSha: "9".repeat(40),
        githubOutputPath,
      }),
    /does not match/,
  );
  for (const malformed of [undefined, "not-a-sha"] ) {
    assert.throws(
      () =>
        verifyCheckedOutSourceIdentity({
          repositoryRoot: root,
          expectedSourceSha: malformed,
          githubOutputPath,
        }),
      /expected source SHA is missing or malformed/,
    );
  }
  const manifest = prepareGitleaksArtifact({
    repositoryRoot: root,
    testedSourceSha,
    workflowContextSha,
    runId: "30684560486",
    runAttempt: "1",
  });
  assert.deepEqual(
    readdirSync(path.join(root, GITLEAKS_STAGING_ROOT)).sort(),
    [...GITLEAKS_ARCHIVE_ENTRIES],
    "the staging tree must contain only deterministic root-level entries",
  );
  assert.deepEqual(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "results.sarif")),
    sarifBytes,
    "portable staging must preserve the already-scanned SARIF bytes",
  );
  assert.equal(manifest.testedSourceSha, testedSourceSha);
  assert.equal(manifest.workflowContextSha, workflowContextSha);
  assert.equal(manifest.sarif.archiveEntry, "results.sarif");
  assert.equal(
    readFileSync(path.join(root, GITLEAKS_STAGING_ROOT, "artifact-manifest.json"), "utf8")
      .includes("work/interior-ai/interior-ai"),
    false,
  );
  assert.doesNotThrow(() =>
    verifyGitleaksArtifact({
      repositoryRoot: root,
      expectedTestedSourceSha: testedSourceSha,
    }),
  );
  write(root, `${GITLEAKS_STAGING_ROOT}/extra.txt`, "unexpected\n");
  assert.throws(
    () =>
      verifyGitleaksArtifact({
        repositoryRoot: root,
        expectedTestedSourceSha: testedSourceSha,
      }),
    /archive entries are not exact/,
  );
  rmSync(path.join(root, GITLEAKS_STAGING_ROOT, "extra.txt"));
  const manifestPath = path.join(root, GITLEAKS_STAGING_ROOT, "artifact-manifest.json");
  const storedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  storedManifest.testedSourceSha = "a".repeat(40);
  storedManifest.workflowContextSha = testedSourceSha;
  writeFileSync(manifestPath, `${JSON.stringify(storedManifest, null, 2)}\n`);
  assert.throws(
    () =>
      verifyGitleaksArtifact({
        repositoryRoot: root,
        expectedTestedSourceSha: testedSourceSha,
      }),
    /testedSourceSha does not match/,
    "workflowContextSha must never compensate for a wrong testedSourceSha",
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () =>
      prepareGitleaksArtifact({
        repositoryRoot: root,
        testedSourceSha: "7".repeat(40),
        workflowContextSha,
        runId: "30684560486",
        runAttempt: "1",
      }),
    /does not match the checked-out source SHA/,
  );
  for (const malformed of [undefined, "merge-sha"] ) {
    assert.throws(
      () =>
        prepareGitleaksArtifact({
          repositoryRoot: root,
          testedSourceSha,
          workflowContextSha: malformed,
          runId: "30684560486",
          runAttempt: "1",
        }),
      /workflow-context SHA is missing or malformed/,
    );
  }

  write(
    root,
    "results.sarif",
    `${JSON.stringify({
      version: "2.1.0",
      runs: [{ artifacts: [{ location: { uri: "/home/runner/work/repo/results" } }] }],
    })}\n`,
  );
  assert.throws(
    () =>
      prepareGitleaksArtifact({
        repositoryRoot: root,
        testedSourceSha,
        workflowContextSha,
        runId: "30684560486",
        runAttempt: "1",
      }),
    /contains runner paths/,
  );
  assert.equal(existsSync(path.join(root, GITLEAKS_STAGING_ROOT)), false);
  assert.equal(existsSync(path.join(root, `${GITLEAKS_STAGING_ROOT}.staging`)), false);
}

assert.deepEqual(
  ["é", "a", "Z", "!"].sort(comparePortablePaths),
  ["!", "Z", "a", "é"],
  "artifact paths must use locale-independent code-unit ordering",
);

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture({ environmentOverrides = {}, publicArtifactText = "public artifact\n" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-evidence-"));
  write(root, ".gitignore", ".next/\n.local/\nnode_modules/\n*.local.js\n");
  write(root, "package.json", `${JSON.stringify({
    name: "evidence-fixture",
    private: true,
    packageManager: "npm@11.6.2",
  }, null, 2)}\n`);
  write(root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  write(root, ".nvmrc", "24.13.0\n");
  write(
    root,
    "scripts/production-artifact-evidence.mjs",
    readFileSync(path.join(process.cwd(), "scripts/production-artifact-evidence.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/required-test-truthfulness.mjs",
    readFileSync(path.join(process.cwd(), "scripts/required-test-truthfulness.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/runtime-smoke-phase-budget.mjs",
    readFileSync(path.join(process.cwd(), "scripts/runtime-smoke-phase-budget.mjs"), "utf8"),
  );
  write(
    root,
    "scripts/runtime-smoke-failure-evidence.mjs",
    readFileSync(
      path.join(process.cwd(), "scripts/runtime-smoke-failure-evidence.mjs"),
      "utf8",
    ),
  );
  for (const sourceName of [
    "runtime-smoke-operation-contracts.mjs",
    "runtime-smoke-operation-deadline.mjs",
  ]) {
    write(
      root,
      `scripts/${sourceName}`,
      readFileSync(path.join(process.cwd(), "scripts", sourceName), "utf8"),
    );
  }
  write(
    root,
    "scripts/required-test-manifest.json",
    readFileSync(path.join(process.cwd(), "scripts/required-test-manifest.json"), "utf8"),
  );
  write(root, "generated/runtime.ts", "export const generated = true;\n");
  write(root, "public/asset.txt", publicArtifactText);
  write(root, ".next/BUILD_ID", "build-fixture-001\n");
  write(root, ".next/build-manifest.json", "{}\n");
  write(root, ".next/required-server-files.json", "{}\n");
  write(root, ".next/static/chunk.js", "static chunk\n");
  write(root, ".next/server/app.js", "server output\n");
  write(root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../package.json", "../../node_modules/.package-lock.json"],
  })}\n`);
  symlinkSync("../../public/asset.txt", path.join(root, ".next/server/public-asset-link"));
  write(root, ".next/cache/excluded.txt", "mutable cache\n");
  write(root, ".next/dev/excluded.txt", "development output\n");
  write(root, ".next/diagnostics/excluded.txt", "diagnostics\n");
  write(root, ".next/trace/excluded.txt", "trace\n");
  write(root, "node_modules/.package-lock.json", "installed dependency identity\n");

  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, [
    "add",
    ".gitignore",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
    "generated/runtime.ts",
    "public/asset.txt",
  ]);
  git(root, ["commit", "-qm", "fixture"]);

  const evidenceDirectory = ".local/production-artifact-evidence";
  const manifestPath = `${evidenceDirectory}/manifest.json`;
  const reportPath = `${evidenceDirectory}/runtime-smoke.json`;
  const phaseTimingPath = `${evidenceDirectory}/runtime-smoke-phases.json`;
  const manifest = await createProductionEvidenceManifest({
    repositoryRoot: root,
    candidateIdentifier: "ch-0016-fixture",
    evidenceDirectory,
    dependencyInstall: {
      command: "npm ci --include=dev",
      startedAt: "2026-07-31T00:00:00.000Z",
      completedAt: "2026-07-31T00:00:01.000Z",
    },
    generatedSourceCheck: {
      command:
        "npx ts-node --transpile-only --compiler-options '{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}' scripts/generate-surface-material-runtime.ts --check",
      status: "passed",
      completedAt: "2026-07-31T00:00:02.000Z",
    },
    build: {
      command: "npm run build",
      startedAt: "2026-07-31T00:00:03.000Z",
      completedAt: "2026-07-31T00:00:04.000Z",
      applicationEnvironment: "staging",
      catalogStrictValidation: true,
    },
    toolchain: { nodeVersion: "v24.13.0", npmVersion: "11.6.2" },
    environment: {
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      NODE_ENV: "production",
      CATALOG_STRICT_VALIDATION: "true",
      DATABASE_URL: "postgresql://test:test@localhost:5432/evidence_fixture",
      OPENAI_API_KEY: "fixture-openai-placeholder",
      SHOPIFY_STORE_DOMAIN: "fixture.myshopify.example",
      SHOPIFY_STOREFRONT_TOKEN: "fixture-shopify-placeholder",
      POSTHOG_KEY: "fixture-posthog-placeholder",
      STRIPE_SECRET_KEY: "sk_test_fixture_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture_placeholder",
      STRIPE_PRICE_PRO_MONTHLY: "price_fixture_monthly",
      STRIPE_PRICE_PRO_YEARLY: "price_fixture_yearly",
      AUTH_SECRET: "fixture-auth-secret-at-least-32-characters",
      GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-fixture-placeholder",
      APP_ORIGIN: "http://127.0.0.1:3000",
      ADMIN_EMAILS: "fixture-admin@example.test",
      ...environmentOverrides,
    },
  });
  await writeProductionEvidenceManifest({ repositoryRoot: root, manifestPath, manifest });
  const report = {
    config: {
      configFile: path.join(root, "playwright.config.ts"),
      rootDir: path.join(root, "tests/e2e"),
      forbidOnly: true,
      grep: {},
      grepInvert: null,
      shard: null,
      projects: [
        {
          name: "chromium",
          retries: 0,
          repeatEach: 1,
          outputDir: path.join(root, ".local/production-artifact-evidence/playwright-output"),
          testDir: path.join(root, "tests/e2e"),
          snapshotDir: null,
        },
      ],
      webServer: {
        command: PRODUCTION_EVIDENCE_SERVER_COMMAND,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
      },
      metadata: {
        productionArtifactEvidence: {
          schema: PRODUCTION_EVIDENCE_SCHEMA,
          sourceCommitSha: manifest.source.commitSha,
          artifactSha256: manifest.artifact.sha256,
          nextBuildId: manifest.build.nextBuildId,
          serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
          buildMode: "production",
        },
      },
    },
    suites: [
      {
        title: "00-runtime-smoke.spec.ts",
        file: "00-runtime-smoke.spec.ts",
        specs: [
          {
            title: "furnished template remains stable without a render loop",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{ status: "passed", retry: 0, annotations: [] }],
              },
            ],
          },
          {
            title: "health and catalog endpoints report ready",
            file: "00-runtime-smoke.spec.ts",
            ok: true,
            tests: [
              {
                projectId: "chromium",
                projectName: "chromium",
                status: "expected",
                annotations: [],
                results: [{ status: "passed", retry: 0, annotations: [] }],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
    runtimeSmokeFailure: null,
    stats: {
      startTime: "2026-07-31T00:00:04.500Z",
      duration: 400,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
  write(root, reportPath, `${JSON.stringify(report, null, 2)}\n`);
  write(
    root,
    phaseTimingPath,
    `${JSON.stringify({
      schema: RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
      testIdentity: "runtime.template-stability",
      wholeTestTimeoutMs: RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
      sequentialPhaseBudgetMs: sequentialRuntimeSmokeBudgetMs,
      overheadBudgets: RUNTIME_SMOKE_OVERHEAD_BUDGETS,
      phaseBudgets: RUNTIME_SMOKE_PHASE_BUDGETS,
      phases: RUNTIME_SMOKE_PHASE_BUDGETS.map((phase, index) => ({
        name: phase.name,
        startTimeRelativeMs: index * 10,
        elapsedMs: 10,
        outcome: "passed",
        timeoutBudgetMs: phase.timeoutMs,
        performanceWarningThresholdMs:
          FURNISHED_TEMPLATE_PHASE_CONTRACTS[phase.name]
            ?.performanceWarningThresholdMs ?? null,
        performanceWarningExceeded: false,
        finalLifecycleState: index < 5 ? "loading" : "stable",
        failure: null,
        progressCheckpoints: [
          {
            name: "phase-start",
            elapsedMs: 0,
            finalLifecycleState: index < 5 ? "loading" : "stable",
          },
          {
            name: "phase-complete",
            elapsedMs: 10,
            finalLifecycleState: index < 5 ? "loading" : "stable",
          },
        ],
      })),
      failure: null,
      complete: true,
    }, null, 2)}\n`,
  );
  canonicalizeProductionEvidenceReport(root, reportPath);
  const canonicalReport = readFileSync(path.join(root, reportPath), "utf8");
  assert.equal(canonicalReport.includes(root), false);
  assert.match(canonicalReport, /<repository-root>/);
  await recordProductionEvidenceTest({
    repositoryRoot: root,
    manifestPath,
    reportPath,
    phaseTimingPath,
    name: "runtime-smoke",
    command: "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium",
    processExitCode: 0,
    completedAt: "2026-07-31T00:00:05.000Z",
  });
  return { root, manifestPath, reportPath, phaseTimingPath };
}

function readManifest(root, manifestPath) {
  return JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
}

async function rewriteManifest(root, manifestPath, mutate) {
  const manifest = readManifest(root, manifestPath);
  mutate(manifest);
  await writeProductionEvidenceManifest({ repositoryRoot: root, manifestPath, manifest });
}

async function rewritePhaseTimings(context, mutate) {
  const absolutePath = path.join(context.root, context.phaseTimingPath);
  const timing = JSON.parse(readFileSync(absolutePath, "utf8"));
  mutate(timing);
  const bytes = Buffer.from(`${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(absolutePath, bytes);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].phaseTimings.sha256 = createHash("sha256").update(bytes).digest("hex");
  });
}

async function rewriteFailurePair(context, mutate) {
  const absoluteReportPath = path.join(context.root, context.reportPath);
  const absoluteTimingPath = path.join(context.root, context.phaseTimingPath);
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const timing = JSON.parse(readFileSync(absoluteTimingPath, "utf8"));
  mutate({ report, timing });
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const timingBytes = Buffer.from(`${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(absoluteReportPath, reportBytes);
  writeFileSync(absoluteTimingPath, timingBytes);
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    const test = manifest.tests[0];
    test.report.sha256 = createHash("sha256").update(reportBytes).digest("hex");
    test.phaseTimings.sha256 = createHash("sha256").update(timingBytes).digest("hex");
    test.phaseTimings.phaseCount = timing.phases.length;
    test.phaseTimings.totalElapsedMs = timing.phases.reduce(
      (total, phase) => total + phase.elapsedMs,
      0,
    );
    test.stats = report.stats;
  });
}

async function runtimeFailureFixture({
  phaseName = "bounds-verification",
  phaseElapsedMs = 42_000,
  operationId = "diagnostics-settle",
  operationElapsedMs = 42_000,
  operationElapsedPreciseMs = operationElapsedMs,
  operationBudgetMs = 42_000,
  attemptTimeoutMs = 42_000,
  remainingAtAttemptStartMs = 42_000,
  deadlineReached = true,
} = {}) {
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests = [];
    manifest.repositoryEvidence.status = "pending_tests";
  });
  const absoluteReportPath = path.join(context.root, context.reportPath);
  const absoluteTimingPath = path.join(context.root, context.phaseTimingPath);
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const timing = JSON.parse(readFileSync(absoluteTimingPath, "utf8"));
  const furnishedSpec = report.suites[0].specs[0];
  furnishedSpec.ok = false;
  furnishedSpec.tests[0].status = "unexpected";
  furnishedSpec.tests[0].results[0].status = "failed";
  furnishedSpec.tests[0].results[0].error = {
    name: "RuntimeSmokeOperationTimeoutError",
    message: "Structured fixture failure",
  };
  report.stats.expected = 1;
  report.stats.unexpected = 1;
  const failurePhaseIndex = timing.phases.findIndex(
    (phase) => phase.name === phaseName,
  );
  assert.notEqual(failurePhaseIndex, -1);
  const failurePhase = timing.phases[failurePhaseIndex];
  failurePhase.elapsedMs = phaseElapsedMs;
  failurePhase.outcome = "failed";
  failurePhase.performanceWarningExceeded =
    failurePhase.performanceWarningThresholdMs !== null &&
    phaseElapsedMs > failurePhase.performanceWarningThresholdMs;
  failurePhase.finalLifecycleState = "ready";
  failurePhase.progressCheckpoints = [failurePhase.progressCheckpoints[0]];
  failurePhase.failure = {
    failureKind: "nested-operation-timeout",
    phaseId: phaseName,
    phaseElapsedMs,
    phaseBudgetMs: failurePhase.timeoutBudgetMs,
    operationId,
    operationOutcome: "timed-out",
    operationElapsedMs,
    operationElapsedPreciseMs,
    operationBudgetMs,
    attemptTimeoutMs,
    remainingAtAttemptStartMs,
    deadlineReached,
    watchdogBudgetMs: null,
    lastSafeCheckpoint: "phase-start",
    safeLifecycleState: "ready",
    progressObserved: false,
    originalCause: null,
  };
  timing.phases = timing.phases.slice(0, failurePhaseIndex + 1);
  timing.complete = false;
  timing.failure = failurePhase.failure;
  report.runtimeSmokeFailure = failurePhase.failure;
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(absoluteTimingPath, `${JSON.stringify(timing, null, 2)}\n`);
  await recordProductionEvidenceTest({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
    name: "runtime-smoke",
    command: "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium",
    processExitCode: 1,
  });
  return context;
}

async function expectRejected(context, expectedText) {
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.equal(result.valid, false, `expected rejection containing ${expectedText}`);
  assert.ok(
    result.issues.some((issue) => issue.includes(expectedText)),
    `missing rejection ${JSON.stringify(expectedText)} in ${JSON.stringify(result.issues)}`,
  );
}

{
  const context = await fixture();
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
  assert.equal(result.manifest.repositoryEvidence.status, "valid");
  assert.equal(result.manifest.repositoryEvidence.releaseReady, false);
}

{
  const context = await runtimeFailureFixture();
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.operationId, "diagnostics-settle");
  assert.equal(verified.failure.operationBudgetMs, 42_000);
  assert.equal(verified.failure.phaseBudgetMs, 103_000);
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
  const stableResult = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.equal(stableResult.valid, false, "failed smoke must withhold stable evidence");
  assert.ok(
    stableResult.issues.some((issue) =>
      issue.includes("failed evidence validation cannot produce an approval-ready result")
    ),
  );
}

{
  const context = await runtimeFailureFixture({
    phaseName: "reload-1",
    phaseElapsedMs: 70_001,
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 70_000,
    operationElapsedPreciseMs: 70_000.25,
    operationBudgetMs: 70_000,
    attemptTimeoutMs: 65_458,
    remainingAtAttemptStartMs: 65_458,
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.phaseId, "reload-1");
  assert.equal(verified.failure.phaseBudgetMs, 308_000);
  assert.equal(verified.failure.operationId, "model-responses-and-readiness");
  assert.equal(verified.failure.operationBudgetMs, 70_000);
  assert.equal(verified.failure.operationElapsedMs, 70_000);
  assert.equal(verified.failure.operationElapsedPreciseMs, 70_000.25);
  assert.equal(verified.failure.attemptTimeoutMs, 65_458);
  assert.equal(verified.failure.remainingAtAttemptStartMs, 65_458);
  assert.equal(verified.failure.deadlineReached, true);
  assert.equal(verified.timing.schema, "interior-ai.runtime-smoke-phase-timings.v3");
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
  assert.notEqual(verified.timing.phases.at(-1).outcome, "timed-out");
  const failedManifest = readManifest(context.root, context.manifestPath);
  assert.equal(failedManifest.tests[0].processExitCode, 1);
  const stableResult = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
  });
  assert.equal(stableResult.valid, false, "forced failure must withhold stable evidence");

  const evidenceRoot = path.dirname(path.join(context.root, context.manifestPath));
  const failureUploadRoot = path.join(evidenceRoot, "failure-upload");
  mkdirSync(failureUploadRoot);
  const safeFiles = [
    [context.manifestPath, "manifest.json"],
    [context.phaseTimingPath, "runtime-smoke-phases.json"],
    [context.reportPath, "runtime-smoke.json"],
  ];
  for (const [sourcePath, stagedName] of safeFiles) {
    copyFileSync(
      path.join(context.root, sourcePath),
      path.join(failureUploadRoot, stagedName),
    );
  }
  assert.deepEqual(
    readdirSync(failureUploadRoot).sort(),
    ["manifest.json", "runtime-smoke-phases.json", "runtime-smoke.json"],
  );
  const safeContent = readdirSync(failureUploadRoot)
    .map((name) => {
      const text = readFileSync(path.join(failureUploadRoot, name), "utf8");
      JSON.parse(text);
      return text;
    })
    .join("\n");
  assert.doesNotMatch(
    safeContent,
    /(?:^|[\s"'(])\/(?:home|Users|private\/tmp|tmp|var\/tmp|var\/folders)\//im,
  );
  assert.equal(
    existsSync(path.join(evidenceRoot, "upload")),
    false,
    "forced failure must not stage stable release evidence",
  );
}

{
  const context = await runtimeFailureFixture({
    phaseName: "reload-1",
    phaseElapsedMs: 70_001,
    operationId: "model-responses-and-readiness",
    operationElapsedMs: 70_001,
    operationElapsedPreciseMs: 70_001.25,
    operationBudgetMs: 70_000,
    attemptTimeoutMs: 65_507,
    remainingAtAttemptStartMs: 65_507,
  });
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.phaseElapsedMs = 65_508;
    failure.operationElapsedMs = 65_508;
    failure.operationElapsedPreciseMs = 65_508;
    failure.operationBudgetMs = 65_507;
    timing.phases.at(-1).elapsedMs = 65_508;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /runtime-smoke nested operation timeout is non-canonical/,
    "the external dynamic-allowance-as-budget record must remain rejected",
  );
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.phaseElapsedMs = 12_088;
    failure.operationId = "diagnostics-settle-evaluation";
    failure.operationElapsedMs = 10_000;
    failure.operationElapsedPreciseMs = 10_000.5;
    failure.operationBudgetMs = 10_000;
    failure.attemptTimeoutMs = 10_000;
    failure.remainingAtAttemptStartMs = 10_000;
    timing.phases.at(-1).elapsedMs = 12_088;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "nested-operation-timeout");
  assert.equal(verified.failure.operationId, "diagnostics-settle-evaluation");
  assert.equal(verified.failure.operationBudgetMs, 10_000);
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "no-progress-watchdog";
    failure.phaseElapsedMs = 60_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    failure.watchdogBudgetMs = 60_000;
    timing.phases.at(-1).elapsedMs = 60_000;
    timing.phases.at(-1).outcome = "stalled";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "no-progress-watchdog");
  assert.equal(verified.failure.watchdogBudgetMs, 60_000);
  assert.equal(verified.timing.phases.at(-1).outcome, "stalled");
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "unexpected-error";
    failure.phaseElapsedMs = 12_088;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 12_088;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "unexpected-error");
  assert.equal(verified.timing.phases.at(-1).outcome, "failed");
}

{
  const context = await runtimeFailureFixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    const substitutedSource = "f".repeat(40);
    const substitutedArtifact = "e".repeat(64);
    const substitutedBuildId = "substituted-build-id";
    manifest.source.commitSha = substitutedSource;
    manifest.artifact.sha256 = substitutedArtifact;
    manifest.build.nextBuildId = substitutedBuildId;
    manifest.tests[0].sourceCommitSha = substitutedSource;
    manifest.tests[0].artifactSha256 = substitutedArtifact;
    manifest.tests[0].nextBuildId = substitutedBuildId;
  });
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /source|artifact|build|metadata/i,
  );
}

{
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "phase-timeout";
    failure.phaseElapsedMs = 103_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 103_000;
    timing.phases.at(-1).outcome = "timed-out";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
    timing.phases.at(-1).performanceWarningExceeded = true;
  });
  const verified = await verifyRuntimeSmokeFailureEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
    phaseTimingPath: context.phaseTimingPath,
  });
  assert.equal(verified.failure.failureKind, "phase-timeout");
  assert.equal(verified.failure.operationId, null);
}

for (const mutate of [
  ({ report, timing }) => {
    timing.failure.operationId = null;
    timing.phases.at(-1).failure.operationId = null;
    report.runtimeSmokeFailure.operationId = null;
  },
  ({ report, timing }) => {
    timing.failure.operationBudgetMs = 10_000;
    timing.phases.at(-1).failure.operationBudgetMs = 10_000;
    report.runtimeSmokeFailure.operationBudgetMs = 10_000;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedMs = 69_999;
    timing.failure.operationElapsedPreciseMs = 69_999.75;
    timing.failure.deadlineReached = false;
    timing.phases.at(-1).failure.operationElapsedMs = 69_999;
    timing.phases.at(-1).failure.operationElapsedPreciseMs = 69_999.75;
    timing.phases.at(-1).failure.deadlineReached = false;
    report.runtimeSmokeFailure.operationElapsedMs = 69_999;
    report.runtimeSmokeFailure.operationElapsedPreciseMs = 69_999.75;
    report.runtimeSmokeFailure.deadlineReached = false;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedPreciseMs = 42_999.5;
    timing.phases.at(-1).failure.operationElapsedPreciseMs = 42_999.5;
    report.runtimeSmokeFailure.operationElapsedPreciseMs = 42_999.5;
  },
  ({ report, timing }) => {
    delete timing.failure.deadlineReached;
    delete timing.phases.at(-1).failure.deadlineReached;
    delete report.runtimeSmokeFailure.deadlineReached;
  },
  ({ timing }) => {
    timing.phases.at(-1).outcome = "timed-out";
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "phase-timeout";
    failure.phaseBudgetMs = 42_000;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).outcome = "timed-out";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report }) => {
    report.runtimeSmokeFailure.operationId = "final-diagnostics-snapshot";
  },
  ({ timing }) => {
    timing.failure = null;
  },
  ({ report, timing }) => {
    timing.failure.failureKind = "unknown-failure";
    timing.phases.at(-1).failure.failureKind = "unknown-failure";
    report.runtimeSmokeFailure.failureKind = "unknown-failure";
  },
  ({ report, timing }) => {
    timing.failure.phaseId = "reload-1";
    timing.phases.at(-1).failure.phaseId = "reload-1";
    report.runtimeSmokeFailure.phaseId = "reload-1";
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "no-progress-watchdog";
    failure.phaseElapsedMs = 59_999;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    failure.watchdogBudgetMs = 60_000;
    timing.phases.at(-1).elapsedMs = 59_999;
    timing.phases.at(-1).outcome = "stalled";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "terminal-lifecycle-error";
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).outcome = "terminal-error";
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    const failure = timing.phases.at(-1).failure;
    failure.failureKind = "unexpected-error";
    failure.phaseElapsedMs = 103_001;
    failure.operationId = null;
    failure.operationOutcome = null;
    failure.operationElapsedMs = null;
    failure.operationElapsedPreciseMs = null;
    failure.operationBudgetMs = null;
    failure.attemptTimeoutMs = null;
    failure.remainingAtAttemptStartMs = null;
    failure.deadlineReached = null;
    timing.phases.at(-1).elapsedMs = 103_001;
    timing.phases.at(-1).outcome = "failed";
    timing.phases.at(-1).performanceWarningExceeded = true;
    timing.failure = failure;
    report.runtimeSmokeFailure = failure;
  },
  ({ report, timing }) => {
    timing.failure.operationElapsedMs = 41_999;
    timing.phases.at(-1).failure.operationElapsedMs = 41_999;
    report.runtimeSmokeFailure.operationElapsedMs = 41_999;
  },
  ({ report, timing }) => {
    timing.failure.attemptTimeoutMs = 42_001;
    timing.phases.at(-1).failure.attemptTimeoutMs = 42_001;
    report.runtimeSmokeFailure.attemptTimeoutMs = 42_001;
  },
  ({ report, timing }) => {
    timing.failure.remainingAtAttemptStartMs = 42_001;
    timing.phases.at(-1).failure.remainingAtAttemptStartMs = 42_001;
    report.runtimeSmokeFailure.remainingAtAttemptStartMs = 42_001;
  },
  ({ report, timing }) => {
    const unsafeCause = {
      name: "RuntimeSmokeOperationTimeoutError",
      operationId: "diagnostics-settle-evaluation",
      operationElapsedMs: 9_999,
      operationElapsedPreciseMs: 9_999.75,
      operationBudgetMs: 10_000,
      attemptTimeoutMs: 10_000,
      remainingAtAttemptStartMs: 10_000,
      deadlineReached: false,
      message: "unbounded cause text is not portable evidence",
    };
    timing.failure.originalCause = unsafeCause;
    timing.phases.at(-1).failure.originalCause = unsafeCause;
    report.runtimeSmokeFailure.originalCause = unsafeCause;
  },
]) {
  const context = await runtimeFailureFixture();
  await rewriteFailurePair(context, mutate);
  await assert.rejects(
    () => verifyRuntimeSmokeFailureEvidence({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      reportPath: context.reportPath,
      phaseTimingPath: context.phaseTimingPath,
    }),
    /runtime-smoke/,
  );
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[1].startTimeRelativeMs =
      timing.phases[0].startTimeRelativeMs + timing.phases[0].elapsedMs - 1;
  });
  await expectRejected(context, "phase timing timeline is overlapping");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    const finalPhase = timing.phases.at(-1);
    finalPhase.startTimeRelativeMs = timing.wholeTestTimeoutMs - finalPhase.elapsedMs + 1;
  });
  await expectRejected(context, "exceeds the whole-test timeout");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].message = "private diagnostic text must not be retained";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].finalLifecycleState = "credential-bearing-private-state";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].performanceWarningThresholdMs += 1;
    timing.phases[0].performanceWarningExceeded = true;
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].progressCheckpoints[1].name = "unsafe checkpoint/name";
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const context = await fixture();
  await rewritePhaseTimings(context, (timing) => {
    timing.phases[0].progressCheckpoints.pop();
  });
  await expectRejected(context, "phase timing outcomes are invalid");
}

{
  const openAiSecret = "gate-a3-ci-openai-placeholder";
  const context = await fixture({
    environmentOverrides: { OPENAI_API_KEY: openAiSecret },
    publicArtifactText: `embedded ${openAiSecret}\n`,
  });
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        environment: { OPENAI_API_KEY: openAiSecret },
      }),
    /production artifact contains sensitive environment values: OPENAI_API_KEY/,
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  rmSync(path.join(context.root, ".git"), { recursive: true, force: true });
  rmSync(path.join(context.root, "node_modules"), { recursive: true, force: true });
  const result = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
    standalone: true,
    expectedSourceCommitSha: manifest.source.commitSha,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true, "downloaded evidence must verify without Git or node_modules");

  const mismatched = await validateProductionEvidence({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    requireTests: true,
    standalone: true,
    expectedSourceCommitSha: "f".repeat(40),
  });
  assert.equal(mismatched.valid, false);
  assert.ok(
    mismatched.issues.includes("standalone evidence belongs to another source commit"),
  );
}

{
  const context = await fixture();
  const manifest = readManifest(context.root, context.manifestPath);
  const bundle = await createProductionEvidenceBundle({
    repositoryRoot: context.root,
    manifestPath: context.manifestPath,
    reportPath: context.reportPath,
  });
  const absoluteBundlePath = path.join(context.root, bundle.bundlePath);
  const archiveBytes = readFileSync(absoluteBundlePath);
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  assert.equal(bundle.bundleSha256, archiveSha256);
  assert.equal(
    readFileSync(`${absoluteBundlePath}.sha256`, "utf8"),
    `${archiveSha256}  ${path.basename(absoluteBundlePath)}\n`,
  );

  const archiveEntries = execFileSync("tar", ["-tzf", absoluteBundlePath], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((entry) => entry.replace(/\/$/, ""));
  const allowedFiles = new Set([
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
    context.manifestPath,
    `${context.manifestPath}.sha256`,
    context.reportPath,
    ".local/production-artifact-evidence/runtime-smoke-phases.json",
  ]);
  const allowedDirectories = new Set([
    ".next",
    "public",
    "scripts",
    ".local",
    ".local/production-artifact-evidence",
  ]);
  for (const entry of archiveEntries) {
    assert.ok(
      allowedFiles.has(entry) ||
        allowedDirectories.has(entry) ||
        entry.startsWith(".next/") ||
        entry.startsWith("public/"),
      `standalone archive contains non-allowlisted input ${entry}`,
    );
    assert.equal(
      /^(?:\.next\/(?:cache|dev|diagnostics|trace))(?:\/|$)/.test(entry),
      false,
      `standalone archive contains mutable artifact path ${entry}`,
    );
  }

  const extractedRoot = mkdtempSync(path.join(tmpdir(), "ch-0016-bundle-roundtrip-"));
  execFileSync("tar", ["-xzf", absoluteBundlePath, "-C", extractedRoot]);
  const extractedLink = path.join(extractedRoot, ".next/server/public-asset-link");
  assert.equal(lstatSync(extractedLink).isSymbolicLink(), true);
  assert.equal(readlinkSync(extractedLink), "../../public/asset.txt");
  const standaloneOutput = execFileSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-standalone"],
    {
      cwd: extractedRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
      },
    },
  );
  assert.match(standaloneOutput, /Standalone production artifact evidence valid/);
}

{
  const context = await fixture();
  const packagePath = path.join(context.root, "package.json");
  const packageBefore = readFileSync(packagePath, "utf8");
  await assert.rejects(
    () =>
      createProductionEvidenceBundle({
        repositoryRoot: context.root,
        manifestPath: context.manifestPath,
        reportPath: context.reportPath,
        bundlePath: "bundle.tar.gz",
      }),
    /evidence bundle path must be exactly/,
  );
  assert.equal(
    readFileSync(packagePath, "utf8"),
    packageBefore,
    "an unsafe bundle override must be rejected before any repository mutation",
  );
}

{
  const context = await fixture();
  write(context.root, "generated/runtime.ts", "export const generated = false;\n");
  await expectRejected(context, "working tree is not clean");
}

{
  const context = await fixture();
  write(context.root, "untracked-source.js", "throw new Error('untracked build influence');\n");
  await expectRejected(context, "untracked source files are present");
}

{
  const context = await fixture();
  write(context.root, "next.config.local.js", "throw new Error('ignored build influence');\n");
  await expectRejected(context, "ignored files could influence the build");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.source.commitSha = "f".repeat(40);
  });
  await expectRejected(context, "source commit does not match HEAD");
}

{
  const context = await fixture();
  write(context.root, "package-lock.json", `${JSON.stringify({
    name: "evidence-fixture-changed",
    lockfileVersion: 3,
    packages: {},
  }, null, 2)}\n`);
  await expectRejected(context, "lockfile SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, "package-lock.json"));
  await expectRejected(context, "required lockfile is missing");
}

{
  const context = await fixture();
  write(context.root, "node_modules/.package-lock.json", "tampered installed identity\n");
  await expectRejected(context, "installed dependency identity does not match");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.generatedSourceCheck.status = "failed";
  });
  await expectRejected(context, "generated-source drift check did not pass");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js", "tampered server output\n");
  await expectRejected(context, "artifact SHA-256 mismatch");
}

{
  const context = await fixture();
  const outside = path.join(tmpdir(), `ch-0016-symlink-${process.pid}.txt`);
  writeFileSync(outside, "outside repository\n");
  symlinkSync(outside, path.join(context.root, ".next/server/outside-link"));
  await expectRejected(context, "Production artifact symlink .next/server/outside-link escapes");
  rmSync(outside);
}

{
  const context = await fixture();
  symlinkSync(
    path.join(context.root, ".git/config"),
    path.join(context.root, ".next/server/prohibited-link"),
  );
  await expectRejected(context, "targets prohibited path .git/config");
}

{
  const context = await fixture();
  write(context.root, context.reportPath, "{\"tampered\":true}\n");
  await expectRejected(context, "test report SHA-256 mismatch");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.reportPath));
  await expectRejected(context, "required test report is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, context.manifestPath));
  await expectRejected(context, "production evidence manifest is missing");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, ".next/build-manifest.json"));
  await expectRejected(context, "Required production artifact path is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.applicationEnvironment = "development";
  });
  await expectRejected(context, "production evidence environment must be staging or production");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.mode = "development";
  });
  await expectRejected(context, "development-mode evidence is not accepted");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.environmentIdentity.nextPublicAppEnv = "production";
  });
  await expectRejected(context, "recorded application environment identity is contradictory");
}

await assert.rejects(
  () => fixture({ environmentOverrides: { NEXT_PUBLIC_APP_ENV: "production" } }),
  /NEXT_PUBLIC_APP_ENV must exactly match APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { VERCEL_ENV: "production" } }),
  /VERCEL_ENV contradicts APP_ENV/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: "unknown" } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { APP_ENV: undefined } }),
  /APP_ENV must exactly match the recorded production evidence environment/,
);

await assert.rejects(
  () => fixture({ environmentOverrides: { OPENAI_API_KEY: undefined } }),
  /required staging configuration shape is incomplete/,
);

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.catalogStrictValidation = false;
  });
  await expectRejected(context, "strict catalog validation was not enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.developmentOnlyFlags.NEXT_PUBLIC_ENABLE_TEST_FIXTURES = true;
  });
  await expectRejected(context, "development-only flags are enabled");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.unexpected = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].processExitCode = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "production smoke command exited nonzero");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.flaky = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains failures or flaky tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.expected = 0;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "required test report contains zero passing tests");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].stats.skipped = 1;
    manifest.repositoryEvidence.status = "failed";
  });
  await expectRejected(context, "critical production smoke contains skipped tests");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.forbidOnly = false;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "focused .only execution is forbidden");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.suites[0].specs.pop();
  report.stats.expected = 1;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "requirement runtime.health-catalog-ready is missing");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.projects[0].name = "webkit";
  report.suites[0].specs.forEach((spec) => {
    spec.tests[0].projectId = "webkit";
    spec.tests[0].projectName = "webkit";
  });
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "required project chromium is missing");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].artifactSha256 = "0".repeat(64);
  });
  await expectRejected(context, "test report is bound to another artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.build.serverCommand = "npm run dev";
  });
  await expectRejected(context, "build or production-server command is not canonical");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.command = "npm run dev";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.webServer.reuseExistingServer = true;
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report does not prove the canonical non-reused production server");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T00:00:03.000Z";
  });
  await expectRejected(context, "test evidence predates the recorded artifact");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.createdAt = "July 31 2026 00:00:04 UTC";
  });
  await expectRejected(context, "evidence timestamps must use valid UTC ISO 8601 values");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.tests[0].completedAt = "2026-07-31T08:00:05+08:00";
  });
  await expectRejected(context, "test evidence timestamp must use valid UTC ISO 8601 format");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.externalControls[0].status = "verified";
  });
  await expectRejected(context, "external controls must remain not_verified");
}

{
  const context = await fixture();
  await rewriteManifest(context.root, context.manifestPath, (manifest) => {
    manifest.repositoryEvidence.statement =
      "Repository evidence proves the Vercel production deployment is verified.";
  });
  await expectRejected(context, "repository evidence claim is not canonical");
}

{
  const context = await fixture();
  write(context.root, ".next/server/app.js.nft.json", `${JSON.stringify({
    version: 1,
    files: ["../../../missing-runtime-file"],
  })}\n`);
  await expectRejected(context, "traced output contains missing files");
}

{
  const context = await fixture();
  rmSync(path.join(context.root, ".next/server/app.js.nft.json"));
  await expectRejected(context, "traced output inventory is empty");
}

{
  const context = await fixture();
  const manifestAbsolutePath = path.join(context.root, context.manifestPath);
  writeFileSync(manifestAbsolutePath, `${readFileSync(manifestAbsolutePath, "utf8")} `);
  await expectRejected(context, "manifest SHA-256 sidecar mismatch");
}

{
  const secretFixture = "postgresql://secret-user:secret-password@example.test/private";
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = secretFixture;
  try {
    const context = await fixture();
    const manifestBytes = readFileSync(path.join(context.root, context.manifestPath), "utf8");
    assert.equal(manifestBytes.includes(secretFixture), false);
    assert.equal(manifestBytes.includes("secret-password"), false);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.metadata.productionArtifactEvidence.authToken = "not-recordable";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains prohibited secret-bearing fields");
}

{
  const context = await fixture();
  const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
  report.config.configFile = "/home/runner/substituted/playwright.config.ts";
  write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await expectRejected(context, "test report contains non-canonical or machine-local Playwright paths");
}

{
  const root = mkdtempSync(path.join(tmpdir(), "ch-0016-vercel-source-"));
  write(root, ".gitignore", "*.local.js\n");
  write(root, "tracked.js", "export const tracked = true;\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "CH-0016 test"]);
  git(root, ["config", "user.email", "ch-0016@example.test"]);
  git(root, ["add", ".gitignore", "tracked.js"]);
  git(root, ["commit", "-qm", "fixture"]);
  assert.equal((await inspectGitTree(root)).clean, true);
  write(root, "untracked.js", "export const untracked = true;\n");
  assert.equal((await inspectGitTree(root)).clean, false);
  rmSync(path.join(root, "untracked.js"));
  write(root, "next.config.local.js", "throw new Error('ignored');\n");
  const ignoredResult = await inspectGitTree(root);
  assert.equal(ignoredResult.clean, false);
  assert.deepEqual(ignoredResult.ignoredInfluentialFiles, ["next.config.local.js"]);
}

{
  const context = await fixture();
  const secretFixture = "fixture-report-secret-value";
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = secretFixture;
  try {
    const manifest = readManifest(context.root, context.manifestPath);
    const report = JSON.parse(readFileSync(path.join(context.root, context.reportPath), "utf8"));
    report.config.metadata.productionArtifactEvidence.note = secretFixture;
    write(context.root, context.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    manifest.tests[0].report.sha256 = "0".repeat(64);
    await writeProductionEvidenceManifest({
      repositoryRoot: context.root,
      manifestPath: context.manifestPath,
      manifest,
    });
    await expectRejected(context, "test report contains sensitive environment values");
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
}

assert.equal(PRODUCTION_EVIDENCE_SERVER_COMMAND, "npm run evidence:production:serve");
const playwrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.config.ts"),
  "utf8",
);
assert.match(
  playwrightConfiguration,
  /command: productionArtifactEvidence[\s\S]{0,160}"npm run evidence:production:serve"[\s\S]{0,160}useProductionServer[\s\S]{0,100}"npm run start"[\s\S]{0,100}"npm run dev"/,
  "production artifact evidence must select its verified server before any dev fallback",
);
assert.match(
  playwrightConfiguration,
  /reuseExistingServer: productionArtifactEvidence \? false/,
  "production artifact evidence must never reuse an unrelated listener",
);
assert.match(
  playwrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "portable reports must not capture a source diff that can contain configured secrets",
);
const proVisualPlaywrightConfiguration = readFileSync(
  path.join(process.cwd(), "playwright.pro-visual.config.ts"),
  "utf8",
);
assert.match(
  proVisualPlaywrightConfiguration,
  /captureGitInfo:\s*\{\s*commit:\s*false,\s*diff:\s*false\s*\}/,
  "the required Pro visual report must not capture a secret-bearing CI diff",
);
const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
assert.equal(workflow.includes('CATALOG_STRICT_VALIDATION: "false"'), false);
assert.match(workflow, /npm run evidence:production:build/);
assert.match(workflow, /npm run evidence:production:smoke/);
assert.match(workflow, /npm run evidence:production:bundle/);
assert.match(workflow, /\.local\/production-artifact-evidence\/upload\//);
const vercelManifestSource = readFileSync(
  path.join(process.cwd(), "scripts/vercel-output-manifest.mjs"),
  "utf8",
);
assert.match(vercelManifestSource, /--untracked-files=all/);
assert.match(vercelManifestSource, /--ignored/);
assert.match(vercelManifestSource, /gitUntrackedFilesChecked: true/);
assert.match(vercelManifestSource, /gitIgnoredInfluentialFilesChecked: true/);
const nextConfiguration = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
for (const requiredExclusion of ["./.env*", "./.git/**/*", "./.local/**/*", "./.vercel/**/*", "./release-evidence-private/**/*"]) {
  assert.ok(
    nextConfiguration.includes(requiredExclusion),
    `missing traced-output exclusion ${requiredExclusion}`,
  );
}
const catalogRuntime = readFileSync(path.join(process.cwd(), "lib/catalog-runtime.ts"), "utf8");
const rootLayout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
assert.match(catalogRuntime, /isProdLike \|\| process\.env\.CATALOG_STRICT_VALIDATION === "true"/);
assert.match(rootLayout, /validateCatalogOrThrow\(\)/);
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "ts-node",
    "--transpile-only",
    "--compiler-options",
    '{"module":"CommonJS","moduleResolution":"node"}',
    "-e",
    'import assert from "node:assert/strict"; import { CatalogValidator } from "./lib/catalog-validation"; const result = new CatalogValidator().validateCatalog({ invalid: { id: "invalid" } }); assert.equal(result.valid, false); assert.ok(result.summary.invalid > 0);',
  ],
  { cwd: process.cwd(), stdio: "pipe" },
);
console.log("CH-0016 production artifact evidence tests passed.");
