import { RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT } from "./runtime-smoke-render-idle.mjs";

function freezePhaseContract({
  operations,
  nestedOperations = [],
  orchestrationMarginMs,
  noProgressTimeoutMs,
  performanceWarningThresholdMs,
}) {
  return Object.freeze({
    operations: Object.freeze(
      operations.map((operation) => Object.freeze({ ...operation })),
    ),
    nestedOperations: Object.freeze(
      nestedOperations.map((operation) => Object.freeze({ ...operation })),
    ),
    orchestrationMarginMs,
    noProgressTimeoutMs,
    performanceWarningThresholdMs,
  });
}

const DIAGNOSTICS_SETTLE_MAXIMUM_OBSERVATION_ATTEMPTS = 2;
const DIAGNOSTICS_SETTLE_FINAL_READBACK_EVALUATIONS = 1;
const DIAGNOSTICS_SETTLE_EVALUATION_TIMEOUT_MS = 10_000;
const DIAGNOSTICS_SETTLE_ASSERTION_ALLOWANCE_MS = 2_000;
const DIAGNOSTICS_SETTLE_ORCHESTRATION_MARGIN_MS = 10_000;
const DIAGNOSTICS_SETTLE_EVALUATION_COUNT =
  DIAGNOSTICS_SETTLE_MAXIMUM_OBSERVATION_ATTEMPTS +
  DIAGNOSTICS_SETTLE_FINAL_READBACK_EVALUATIONS;
const DIAGNOSTICS_SETTLE_MAXIMUM_LEGAL_SEQUENTIAL_ENVELOPE_MS =
  DIAGNOSTICS_SETTLE_EVALUATION_COUNT *
    DIAGNOSTICS_SETTLE_EVALUATION_TIMEOUT_MS +
  DIAGNOSTICS_SETTLE_ASSERTION_ALLOWANCE_MS;

export const RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT = Object.freeze({
  observation: RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT,
  maximumObservationAttempts: DIAGNOSTICS_SETTLE_MAXIMUM_OBSERVATION_ATTEMPTS,
  finalReadbackEvaluationCount:
    DIAGNOSTICS_SETTLE_FINAL_READBACK_EVALUATIONS,
  firstSampleImmediate: true,
  evaluationCount: DIAGNOSTICS_SETTLE_EVALUATION_COUNT,
  evaluationTimeoutMs: DIAGNOSTICS_SETTLE_EVALUATION_TIMEOUT_MS,
  assertionAllowanceMs: DIAGNOSTICS_SETTLE_ASSERTION_ALLOWANCE_MS,
  minimumTheoreticalCompletionMs:
    RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT.observationDurationMs,
  maximumLegalSequentialEnvelopeMs:
    DIAGNOSTICS_SETTLE_MAXIMUM_LEGAL_SEQUENTIAL_ENVELOPE_MS,
  orchestrationMarginMs: DIAGNOSTICS_SETTLE_ORCHESTRATION_MARGIN_MS,
  timeoutMs:
    DIAGNOSTICS_SETTLE_MAXIMUM_LEGAL_SEQUENTIAL_ENVELOPE_MS +
    DIAGNOSTICS_SETTLE_ORCHESTRATION_MARGIN_MS,
});

export const FURNISHED_TEMPLATE_RELOAD_CONTRACT = freezePhaseContract({
  operations: [
    { name: "navigation", timeoutMs: 60_000 },
    { name: "bootstrap-readiness", timeoutMs: 30_000 },
    { name: "hydration-snapshot", timeoutMs: 5_000 },
    { name: "view-state-read", timeoutMs: 30_000 },
    { name: "view-activation", timeoutMs: 30_000 },
    { name: "model-responses-and-readiness", timeoutMs: 70_000 },
    { name: "body-state-assertion", timeoutMs: 5_000 },
    {
      name: "diagnostics-settle",
      timeoutMs: RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.timeoutMs,
    },
    { name: "post-settle-observation", timeoutMs: 1_000 },
    { name: "final-diagnostics-snapshot", timeoutMs: 5_000 },
  ],
  nestedOperations: [
    {
      name: "diagnostics-settle-evaluation",
      parentOperationName: "diagnostics-settle",
      timeoutMs: RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.evaluationTimeoutMs,
    },
  ],
  orchestrationMarginMs: 30_000,
  noProgressTimeoutMs: 75_000,
  performanceWarningThresholdMs: 70_000,
});

const FURNISHED_TEMPLATE_BOUNDS_CONTRACT = freezePhaseContract({
  operations: [
    {
      name: "diagnostics-settle",
      timeoutMs: RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.timeoutMs,
    },
    { name: "post-settle-observation", timeoutMs: 1_000 },
    { name: "diagnostic-snapshot-and-assertions", timeoutMs: 30_000 },
  ],
  nestedOperations: [
    {
      name: "diagnostics-settle-evaluation",
      parentOperationName: "diagnostics-settle",
      timeoutMs: RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.evaluationTimeoutMs,
    },
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
