import assert from "node:assert/strict";

import {
  RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
  createRuntimeSmokeTelemetryBootstrapEvidence,
  evaluateRuntimeSmokeTelemetryBootstrapContract,
  summarizeRuntimeSmokeTelemetryBootstrapEvidence,
  validateRuntimeSmokeTelemetryBootstrapEvidence,
  validateRuntimeSmokeTelemetryBootstrapSequence,
} from "./runtime-smoke-telemetry-bootstrap-contract.mjs";

assert.equal(
  RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
  "runtime-smoke-telemetry-bootstrap-evidence",
);

function telemetry(overrides = {}) {
  return {
    schema: "interior-ai.glb-main-thread-telemetry.v2",
    snapshotHookPresent: true,
    collectorImportState: "active",
    collectorActivationMode: "direct-empty-bootstrap",
    collectorActivationGeneration: 1,
    bootstrapRecordsQueuedAtActivation: 0,
    bootstrapEventsFlushed: 0,
    bootstrapFlushCompleted: true,
    directModeActive: true,
    directTelemetryObserved: true,
    timingCount: 3,
    counters: {
      lifecycleTransitions: 4,
      diagnosticStoreUpdates: 4,
      reactRenders: 1,
      sceneAttachments: 2,
      rendererCalls: 6,
    },
    ...overrides,
  };
}

function evaluate(snapshot, generation = 1) {
  return evaluateRuntimeSmokeTelemetryBootstrapContract({
    telemetry: snapshot,
    expectedCollectorActivationGeneration: generation,
    expectedReadyModelCount: 8,
    observedReadyModelCount: 8,
  });
}

assert.equal(evaluate(telemetry()).valid, true, "empty activation is valid");
assert.equal(
  evaluate(
    telemetry({
      collectorActivationMode: "hydrated-bootstrap",
      bootstrapRecordsQueuedAtActivation: 5,
      bootstrapEventsFlushed: 5,
    }),
  ).valid,
  true,
  "nonempty activation is valid when the exact batch is accounted for",
);

for (const [name, snapshot, expectedInvariant] of [
  [
    "lost bootstrap",
    telemetry({
      collectorActivationMode: "hydrated-bootstrap",
      bootstrapRecordsQueuedAtActivation: 5,
      bootstrapEventsFlushed: 0,
    }),
    "bootstrap.accounting",
  ],
  [
    "pending import",
    telemetry({
      collectorImportState: "pending",
      collectorActivationMode: null,
      bootstrapFlushCompleted: false,
      directModeActive: false,
      directTelemetryObserved: false,
      timingCount: 0,
    }),
    "collector.import-state.active",
  ],
  [
    "failed import",
    telemetry({
      snapshotHookPresent: false,
      collectorImportState: "failed",
      collectorActivationMode: null,
      bootstrapFlushCompleted: false,
      directModeActive: false,
      directTelemetryObserved: false,
      timingCount: 0,
    }),
    "collector.snapshot-hook",
  ],
  [
    "empty activation without direct activity",
    telemetry({ directTelemetryObserved: false }),
    "bootstrap.empty-direct-activity",
  ],
  [
    "empty activation without substantive activity",
    telemetry({
      directTelemetryObserved: false,
      timingCount: 0,
      counters: {
        lifecycleTransitions: 0,
        diagnosticStoreUpdates: 0,
        reactRenders: 0,
        sceneAttachments: 0,
        rendererCalls: 0,
      },
    }),
    "activity.timing",
  ],
  [
    "stale realm",
    telemetry({ collectorActivationGeneration: 2 }),
    "realm.current-generation",
  ],
  [
    "contradictory empty mode",
    telemetry({
      bootstrapRecordsQueuedAtActivation: 1,
      bootstrapEventsFlushed: 1,
    }),
    "bootstrap.empty-mode",
  ],
  [
    "malformed queue",
    telemetry({ bootstrapRecordsQueuedAtActivation: Number.NaN }),
    "telemetry.bootstrapRecordsQueuedAtActivation.integer",
  ],
]) {
  const result = evaluate(snapshot);
  assert.equal(result.valid, false, `${name} must be rejected`);
  assert.ok(
    result.issues.some((entry) => entry.startsWith(expectedInvariant)),
    `${name} must report ${expectedInvariant}`,
  );
}

const observations = [1, 2, 3, 4].map((generation, index) =>
  createRuntimeSmokeTelemetryBootstrapEvidence({
    phaseName: index === 0 ? "initial-document" : `reload-${index}`,
    expectedCollectorActivationGeneration: generation,
    expectedReadyModelCount: 8,
    observedReadyModelCount: 8,
    telemetry: telemetry({ collectorActivationGeneration: generation }),
  }),
);
assert.equal(
  validateRuntimeSmokeTelemetryBootstrapSequence(observations).valid,
  true,
  "initial document and three consecutive reload realms must validate",
);
assert.equal(
  validateRuntimeSmokeTelemetryBootstrapEvidence(observations[0]).valid,
  true,
);
assert.deepEqual(
  summarizeRuntimeSmokeTelemetryBootstrapEvidence(observations).observations.map(
    (entry) => entry.collectorActivationGeneration,
  ),
  [1, 2, 3, 4],
);
assert.equal(
  validateRuntimeSmokeTelemetryBootstrapSequence([
    observations[0],
    observations[2],
  ]).valid,
  false,
  "missing or nonconsecutive realms must be rejected",
);

const contradictoryEvidence = structuredClone(observations[0]);
contradictoryEvidence.valid = false;
assert.equal(
  validateRuntimeSmokeTelemetryBootstrapEvidence(contradictoryEvidence).valid,
  false,
  "portable evidence cannot contradict the pure validator",
);

console.log("Runtime-smoke telemetry bootstrap contract tests passed.");
