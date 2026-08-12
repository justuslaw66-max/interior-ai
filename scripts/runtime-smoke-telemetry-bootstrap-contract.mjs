export const RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_EVIDENCE_SCHEMA =
  "interior-ai.runtime-smoke-telemetry-bootstrap-evidence.v1";
export const RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_SUMMARY_SCHEMA =
  "interior-ai.runtime-smoke-telemetry-bootstrap-summary.v1";
export const RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT =
  "runtime-smoke-telemetry-bootstrap-evidence";
export const RUNTIME_SMOKE_TELEMETRY_PHASES = [
  "initial-document",
  "reload-1",
  "reload-2",
  "reload-3",
];

const IMPORT_STATES = ["not-requested", "pending", "active", "failed"];
const ACTIVATION_MODES = [
  "hydrated-bootstrap",
  "direct-empty-bootstrap",
];
const COUNTER_KEYS = [
  "lifecycleTransitions",
  "diagnosticStoreUpdates",
  "reactRenders",
  "sceneAttachments",
  "rendererCalls",
];
const TELEMETRY_KEYS = [
  "schema",
  "snapshotHookPresent",
  "collectorImportState",
  "collectorActivationMode",
  "collectorActivationGeneration",
  "bootstrapRecordsQueuedAtActivation",
  "bootstrapEventsFlushed",
  "bootstrapFlushCompleted",
  "directModeActive",
  "directTelemetryObserved",
  "timingCount",
  "counters",
];
const EVIDENCE_KEYS = [
  "schema",
  "phaseName",
  "expectedCollectorActivationGeneration",
  "expectedReadyModelCount",
  "observedReadyModelCount",
  "telemetry",
  "valid",
  "issues",
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort());
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function issue(issues, invariant, description) {
  issues.push(`${invariant}: ${description}`);
}

export function evaluateRuntimeSmokeTelemetryBootstrapContract({
  telemetry,
  expectedCollectorActivationGeneration,
  expectedReadyModelCount,
  observedReadyModelCount,
}) {
  const issues = [];
  if (!hasExactKeys(telemetry, TELEMETRY_KEYS)) {
    issue(
      issues,
      "telemetry.schema.keys",
      "telemetry provenance fields are missing or unknown",
    );
  }
  const counters = isObject(telemetry?.counters) ? telemetry.counters : {};
  if (!hasExactKeys(counters, COUNTER_KEYS)) {
    issue(
      issues,
      "telemetry.counters.keys",
      "substantive counter fields are missing or unknown",
    );
  }
  if (telemetry?.schema !== "interior-ai.glb-main-thread-telemetry.v2") {
    issue(issues, "telemetry.schema.version", "collector snapshot schema is not v2");
  }
  if (telemetry?.snapshotHookPresent !== true) {
    issue(issues, "collector.snapshot-hook", "snapshot hook is not present");
  }
  if (!IMPORT_STATES.includes(telemetry?.collectorImportState)) {
    issue(issues, "collector.import-state.enum", "collector import state is unknown");
  } else if (telemetry.collectorImportState !== "active") {
    issue(
      issues,
      "collector.import-state.active",
      `collector import is ${telemetry.collectorImportState}`,
    );
  }
  if (
    telemetry?.collectorActivationMode !== null &&
    !ACTIVATION_MODES.includes(telemetry?.collectorActivationMode)
  ) {
    issue(issues, "collector.activation-mode.enum", "activation mode is unknown");
  }
  for (const [name, value] of [
    ["collectorActivationGeneration", telemetry?.collectorActivationGeneration],
    [
      "bootstrapRecordsQueuedAtActivation",
      telemetry?.bootstrapRecordsQueuedAtActivation,
    ],
    ["bootstrapEventsFlushed", telemetry?.bootstrapEventsFlushed],
    ["timingCount", telemetry?.timingCount],
  ]) {
    if (!isNonnegativeInteger(value)) {
      issue(issues, `telemetry.${name}.integer`, `${name} is not a nonnegative integer`);
    }
  }
  for (const counter of COUNTER_KEYS) {
    if (!isNonnegativeInteger(counters[counter])) {
      issue(
        issues,
        `telemetry.counters.${counter}.integer`,
        `${counter} is not a nonnegative integer`,
      );
    }
  }
  for (const name of [
    "bootstrapFlushCompleted",
    "directModeActive",
    "directTelemetryObserved",
  ]) {
    if (typeof telemetry?.[name] !== "boolean") {
      issue(issues, `telemetry.${name}.boolean`, `${name} is not boolean`);
    }
  }
  if (!isPositiveInteger(expectedCollectorActivationGeneration)) {
    issue(
      issues,
      "realm.expected-generation",
      "expected collector activation generation is not positive",
    );
  } else if (
    telemetry?.collectorActivationGeneration !==
    expectedCollectorActivationGeneration
  ) {
    issue(
      issues,
      "realm.current-generation",
      "collector snapshot is stale or belongs to another realm generation",
    );
  }
  if (!isPositiveInteger(expectedReadyModelCount)) {
    issue(issues, "models.expected-count", "expected ready model count is not positive");
  }
  if (!isNonnegativeInteger(observedReadyModelCount)) {
    issue(issues, "models.observed-count", "observed ready model count is malformed");
  } else if (observedReadyModelCount !== expectedReadyModelCount) {
    issue(issues, "models.readiness", "semantic model readiness is incomplete");
  }

  const queued = telemetry?.bootstrapRecordsQueuedAtActivation;
  const flushed = telemetry?.bootstrapEventsFlushed;
  const mode = telemetry?.collectorActivationMode;
  const active = telemetry?.collectorImportState === "active";
  if (active && mode === null) {
    issue(issues, "bootstrap.activation-mode.present", "active collector has no activation mode");
  }
  if (active && telemetry?.bootstrapFlushCompleted !== true) {
    issue(issues, "bootstrap.flush-completed", "active collector did not complete bootstrap hydration");
  }
  if (active && telemetry?.directModeActive !== true) {
    issue(issues, "collector.direct-mode", "direct mode is not active after hydration");
  }
  if (telemetry?.directModeActive === true && telemetry?.bootstrapFlushCompleted !== true) {
    issue(issues, "bootstrap.ordering", "direct mode became active before hydration completed");
  }
  if (isNonnegativeInteger(queued) && isNonnegativeInteger(flushed) && queued !== flushed) {
    issue(
      issues,
      "bootstrap.accounting",
      `queued ${queued} bootstrap records but flushed ${flushed}`,
    );
  }
  if (mode === "hydrated-bootstrap") {
    if (!(isNonnegativeInteger(queued) && queued > 0)) {
      issue(issues, "bootstrap.nonempty-mode", "hydrated mode has no queued records");
    }
  } else if (mode === "direct-empty-bootstrap") {
    if (queued !== 0 || flushed !== 0) {
      issue(issues, "bootstrap.empty-mode", "empty mode reports queued or flushed records");
    }
    if (telemetry?.directTelemetryObserved !== true) {
      issue(
        issues,
        "bootstrap.empty-direct-activity",
        "empty activation has no later direct telemetry",
      );
    }
  }
  if ((telemetry?.timingCount ?? 0) <= 0) {
    issue(issues, "activity.timing", "no timing telemetry was observed");
  }
  if ((counters.lifecycleTransitions ?? 0) <= 0) {
    issue(issues, "activity.lifecycle", "no lifecycle telemetry was observed");
  }
  if ((counters.rendererCalls ?? 0) <= 0) {
    issue(issues, "activity.renderer", "no renderer telemetry was observed");
  }

  return {
    valid: issues.length === 0,
    issues,
    details: {
      collectorState: telemetry?.collectorImportState ?? null,
      activationMode: telemetry?.collectorActivationMode ?? null,
      queuedAtActivation: queued ?? null,
      flushed: flushed ?? null,
      directModeActive: telemetry?.directModeActive ?? null,
      directTelemetryObserved: telemetry?.directTelemetryObserved ?? null,
      collectorActivationGeneration:
        telemetry?.collectorActivationGeneration ?? null,
      expectedCollectorActivationGeneration,
      timingCount: telemetry?.timingCount ?? null,
      counters,
      expectedReadyModelCount,
      observedReadyModelCount,
    },
  };
}

export function createRuntimeSmokeTelemetryBootstrapEvidence({
  phaseName,
  expectedCollectorActivationGeneration,
  expectedReadyModelCount,
  observedReadyModelCount,
  telemetry,
}) {
  const validation = evaluateRuntimeSmokeTelemetryBootstrapContract({
    telemetry,
    expectedCollectorActivationGeneration,
    expectedReadyModelCount,
    observedReadyModelCount,
  });
  return {
    schema: RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_EVIDENCE_SCHEMA,
    phaseName,
    expectedCollectorActivationGeneration,
    expectedReadyModelCount,
    observedReadyModelCount,
    telemetry,
    valid: validation.valid,
    issues: validation.issues,
  };
}

export function validateRuntimeSmokeTelemetryBootstrapEvidence(
  evidence,
  { requireValid = true } = {},
) {
  const issues = [];
  if (!hasExactKeys(evidence, EVIDENCE_KEYS)) {
    issues.push("runtime telemetry evidence fields are missing or unknown");
  }
  if (evidence?.schema !== RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_EVIDENCE_SCHEMA) {
    issues.push("runtime telemetry evidence schema is unsupported");
  }
  if (!RUNTIME_SMOKE_TELEMETRY_PHASES.includes(evidence?.phaseName)) {
    issues.push("runtime telemetry evidence phase is unknown");
  }
  if (typeof evidence?.valid !== "boolean") {
    issues.push("runtime telemetry evidence validity is not boolean");
  }
  if (
    !Array.isArray(evidence?.issues) ||
    evidence.issues.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    issues.push("runtime telemetry evidence issues are malformed");
  }
  const contract = evaluateRuntimeSmokeTelemetryBootstrapContract({
    telemetry: evidence?.telemetry,
    expectedCollectorActivationGeneration:
      evidence?.expectedCollectorActivationGeneration,
    expectedReadyModelCount: evidence?.expectedReadyModelCount,
    observedReadyModelCount: evidence?.observedReadyModelCount,
  });
  if (
    evidence?.valid !== contract.valid ||
    JSON.stringify(evidence?.issues) !== JSON.stringify(contract.issues)
  ) {
    issues.push("runtime telemetry evidence validity contradicts its provenance");
  }
  if (requireValid && !contract.valid) {
    issues.push(...contract.issues);
  }
  return { valid: issues.length === 0, issues, contract };
}

export function summarizeRuntimeSmokeTelemetryBootstrapEvidence(observations) {
  return {
    schema: RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_SUMMARY_SCHEMA,
    observations: observations.map((observation) => ({
      phaseName: observation?.phaseName ?? null,
      collectorActivationGeneration:
        observation?.telemetry?.collectorActivationGeneration ?? null,
      collectorActivationMode:
        observation?.telemetry?.collectorActivationMode ?? null,
      bootstrapRecordsQueuedAtActivation:
        observation?.telemetry?.bootstrapRecordsQueuedAtActivation ?? null,
      bootstrapEventsFlushed:
        observation?.telemetry?.bootstrapEventsFlushed ?? null,
      valid: observation?.valid ?? false,
    })),
  };
}

export function validateRuntimeSmokeTelemetryBootstrapSequence(
  observations,
  { requireComplete = true, requireValid = true } = {},
) {
  const issues = [];
  if (!Array.isArray(observations)) {
    return { valid: false, issues: ["runtime telemetry observations are missing"] };
  }
  for (const observation of observations) {
    const result = validateRuntimeSmokeTelemetryBootstrapEvidence(observation, {
      requireValid,
    });
    issues.push(...result.issues.map((entry) => `${observation?.phaseName ?? "unknown"}: ${entry}`));
  }
  const phases = observations.map((entry) => entry.phaseName);
  if (new Set(phases).size !== phases.length) {
    issues.push("runtime telemetry observations contain duplicate phases");
  }
  if (
    requireComplete &&
    JSON.stringify(phases) !== JSON.stringify(RUNTIME_SMOKE_TELEMETRY_PHASES)
  ) {
    issues.push("runtime telemetry observations do not cover the initial realm and three reloads");
  }
  const generations = observations.map(
    (entry) => entry.telemetry?.collectorActivationGeneration,
  );
  if (
    generations.some(
      (generation, index) =>
        !isPositiveInteger(generation) ||
        (index > 0 && generation !== generations[index - 1] + 1),
    )
  ) {
    issues.push("runtime telemetry observations do not prove fresh consecutive realms");
  }
  return { valid: issues.length === 0, issues };
}
