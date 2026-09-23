import {
  PHASE8_OPERATION_ORDER,
  PHASE8_PERCENTILE_ALGORITHM,
  PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA,
  PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION,
  PHASE8_SAMPLE_COUNTS,
  PHASE8_SCALE_ORDER,
  PHASE8_SUMMARY_TOLERANCE_MS,
  PHASE8_TIMER,
  PHASE8_UNITS,
  PHASE8_WARMUP_COUNT,
  isFiniteNonnegative,
  isSha256,
  samplesSha256,
  summarizePhase8Samples,
  type Phase8BenchmarkCommand,
  type Phase8BenchmarkEvidence,
  type Phase8FixtureSummary,
  type Phase8ProjectBenchmarkBudgets,
  type Phase8SourceBinding,
} from "./phase8-project-benchmark-contract";

export type Phase8CompletionMarker = {
  schema: string;
  nonce: string;
  reportFile: string;
  reportSha256: string;
};

export type Phase8EvidenceExpectation = {
  nonce: string;
  sourceCommitSha: string;
  sourceTreeSha: string;
  childPid: number;
  parentPid: number;
  command: Phase8BenchmarkCommand;
  sourceBindings: Phase8SourceBinding[];
  fixtures: Phase8FixtureSummary[];
  thresholds: Phase8ProjectBenchmarkBudgets;
  invocationStartedAtMs: number;
  invocationEndedAtMs: number;
  childReportSha256: string;
  completionMarker: Phase8CompletionMarker | null;
};

export type Phase8EvidenceValidation = {
  valid: boolean;
  issues: string[];
  recomputedThresholdPassed: boolean;
};

export type Phase8ChildInvocationValidation = Phase8EvidenceValidation & {
  evidence: Phase8BenchmarkEvidence | null;
  childReportedPassed: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasDuplicate(values: readonly unknown[]): boolean {
  return new Set(values).size !== values.length;
}

function exactStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string") &&
    sameJson(value, expected)
  );
}

function timingAgreement(actual: unknown, expected: number): boolean {
  return (
    typeof actual === "number" &&
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <= PHASE8_SUMMARY_TOLERANCE_MS
  );
}

function validateRun(
  run: unknown,
  expected: Phase8EvidenceExpectation,
  issues: string[],
): void {
  if (!isRecord(run)) {
    issues.push("run identity is missing");
    return;
  }
  if (run.id !== expected.nonce || run.nonce !== expected.nonce) {
    issues.push("run nonce mismatch");
  }
  if (run.sourceCommitSha !== expected.sourceCommitSha) issues.push("source SHA mismatch");
  if (run.sourceTreeSha !== expected.sourceTreeSha) issues.push("source tree SHA mismatch");
  if (run.childPid !== expected.childPid) issues.push("child PID mismatch");
  if (run.parentPid !== expected.parentPid) issues.push("parent PID mismatch");
  if (!sameJson(run.command, expected.command)) issues.push("benchmark command or mode mismatch");
  if (!Number.isInteger(run.processExitCode) || (run.processExitCode as number) < 0) {
    issues.push("reported process exit code is invalid");
  }
  if (!isFiniteNonnegative(run.monotonicDurationMs)) issues.push("monotonic duration is invalid");
  const startedAt = typeof run.startedAtUtc === "string" ? Date.parse(run.startedAtUtc) : NaN;
  const completedAt = typeof run.completedAtUtc === "string" ? Date.parse(run.completedAtUtc) : NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    issues.push("run UTC interval is invalid");
  } else if (
    startedAt < expected.invocationStartedAtMs - 1_000 ||
    completedAt > expected.invocationEndedAtMs + 1_000
  ) {
    issues.push("report is stale or outside the current invocation");
  }
  if (typeof run.nodeVersion !== "string" || run.nodeVersion.length === 0) {
    issues.push("Node version is missing");
  }
  if (run.npmVersion !== null && typeof run.npmVersion !== "string") {
    issues.push("npm version is invalid");
  }
  if (typeof run.branch !== "string" || run.branch.length === 0) issues.push("branch marker is missing");
  if (typeof run.platform !== "string" || typeof run.architecture !== "string") {
    issues.push("platform identity is incomplete");
  }
  if (!isRecord(run.cpu) || typeof run.cpu.model !== "string" || !Number.isInteger(run.cpu.logicalCoreCount)) {
    issues.push("CPU identity is incomplete");
  }
  if (!isFiniteNonnegative(run.totalMemoryBytes)) issues.push("total memory is invalid");
}

function validateCompletionMarker(
  marker: Phase8CompletionMarker | null,
  expected: Phase8EvidenceExpectation,
  issues: string[],
): void {
  if (!marker) {
    issues.push("completion marker is missing");
    return;
  }
  if (marker.schema !== "interior-ai.phase8-project-benchmark-completion.v1") {
    issues.push("completion marker schema mismatch");
  }
  if (marker.nonce !== expected.nonce) issues.push("completion marker nonce mismatch");
  if (marker.reportFile !== "child-evidence.json") issues.push("completion marker report mismatch");
  if (marker.reportSha256 !== expected.childReportSha256) {
    issues.push("completion marker report hash mismatch");
  }
}

function validateSourceBindings(
  sourceBindings: unknown,
  expected: readonly Phase8SourceBinding[],
  issues: string[],
): void {
  if (!Array.isArray(sourceBindings)) {
    issues.push("source bindings are missing");
    return;
  }
  const identities = sourceBindings.map((binding) =>
    isRecord(binding) ? `${String(binding.role)}:${String(binding.path)}` : "invalid",
  );
  if (hasDuplicate(identities)) issues.push("source bindings contain a duplicate");
  if (!sameJson(sourceBindings, expected)) issues.push("source-file hash mismatch");
  for (const binding of sourceBindings) {
    if (!isRecord(binding) || !isSha256(binding.sha256)) {
      issues.push("source binding SHA-256 is invalid");
      break;
    }
  }
}

function validateExecutionContract(
  contract: unknown,
  expected: Phase8EvidenceExpectation,
  issues: string[],
): void {
  if (!isRecord(contract)) {
    issues.push("execution contract is missing");
    return;
  }
  if (!exactStringArray(contract.scaleOrder, PHASE8_SCALE_ORDER)) issues.push("scale order mismatch");
  if (!exactStringArray(contract.operationOrder, PHASE8_OPERATION_ORDER)) {
    issues.push("operation order mismatch");
  }
  if (!sameJson(contract.sampleCountByScale, PHASE8_SAMPLE_COUNTS)) {
    issues.push("sample-count contract mismatch");
  }
  if (contract.warmupCount !== PHASE8_WARMUP_COUNT) issues.push("warmup count mismatch");
  if (contract.timer !== PHASE8_TIMER || contract.units !== PHASE8_UNITS) {
    issues.push("timer or units mismatch");
  }
  if (!sameJson(contract.thresholds, expected.thresholds)) issues.push("threshold contract mismatch");
  if (!sameJson(contract.fixtures, expected.fixtures)) issues.push("fixture identity mismatch");
  if (!isRecord(contract.percentile)) {
    issues.push("percentile contract is missing");
  } else if (
    contract.percentile.algorithm !== PHASE8_PERCENTILE_ALGORITHM ||
    contract.percentile.p50Fraction !== 0.5 ||
    contract.percentile.p95Fraction !== 0.95 ||
    contract.percentile.largeP95SortedSampleOrdinal !== 29 ||
    contract.percentile.serializedSummaryToleranceMs !== PHASE8_SUMMARY_TOLERANCE_MS
  ) {
    issues.push("percentile contract mismatch");
  }
}

function validateSamples(
  operation: Record<string, unknown>,
  expectedCount: number,
  issues: string[],
  identity: string,
): number[] | null {
  if (!Array.isArray(operation.samplesMs) || operation.samplesMs.length === 0) {
    issues.push(`${identity} raw samples are empty or missing`);
    return null;
  }
  if (operation.samplesMs.length !== expectedCount) {
    issues.push(`${identity} sample count mismatch`);
  }
  if (!operation.samplesMs.every(isFiniteNonnegative)) {
    issues.push(`${identity} contains a nonfinite or negative sample`);
    return null;
  }
  if (operation.samplesSha256 !== samplesSha256(operation.samplesMs)) {
    issues.push(`${identity} raw sample order hash mismatch`);
  }
  return operation.samplesMs;
}

function validateOperation(
  operation: unknown,
  scale: (typeof PHASE8_SCALE_ORDER)[number],
  expectedName: (typeof PHASE8_OPERATION_ORDER)[number],
  expected: Phase8EvidenceExpectation,
  issues: string[],
): boolean {
  const identity = `${scale} ${expectedName}`;
  if (!isRecord(operation) || operation.operation !== expectedName) {
    issues.push(`${identity} operation is missing or out of order`);
    return false;
  }
  const samples = validateSamples(operation, PHASE8_SAMPLE_COUNTS[scale], issues, identity);
  if (!samples) return false;
  const summary = summarizePhase8Samples(samples);
  if (!timingAgreement(operation.p50Ms, summary.p50Ms)) issues.push(`${identity} p50 mismatch`);
  if (!timingAgreement(operation.p95Ms, summary.p95Ms)) issues.push(`${identity} p95 mismatch`);
  if (!timingAgreement(operation.maxMs, summary.maxMs)) issues.push(`${identity} maximum mismatch`);
  const threshold = expected.thresholds[scale].maxP95Ms[expectedName];
  if (operation.thresholdMs !== threshold) issues.push(`${identity} threshold mismatch`);
  const passed = summary.p95Ms <= threshold;
  if (operation.passed !== passed) issues.push(`${identity} threshold decision mismatch`);
  return passed;
}

function validateMeasurements(
  measurements: unknown,
  expected: Phase8EvidenceExpectation,
  issues: string[],
): boolean {
  if (!Array.isArray(measurements)) {
    issues.push("measurements are missing");
    return false;
  }
  const scaleNames = measurements.map((measurement) =>
    isRecord(measurement) ? measurement.scale : undefined,
  );
  if (hasDuplicate(scaleNames)) issues.push("measurements contain a duplicate scale");
  if (!sameJson(scaleNames, PHASE8_SCALE_ORDER)) issues.push("a scale is missing or out of order");
  let thresholdsPassed = true;
  for (const [scaleIndex, scale] of PHASE8_SCALE_ORDER.entries()) {
    const measurement = measurements[scaleIndex];
    if (!isRecord(measurement) || measurement.scale !== scale) continue;
    if (!sameJson(measurement.fixture, expected.fixtures[scaleIndex])) {
      issues.push(`${scale} fixture summary mismatch`);
    }
    const budget = expected.thresholds[scale];
    const fixture = expected.fixtures[scaleIndex];
    const sizePassed = fixture.serializedBytes <= budget.maxSerializedBytes;
    if (measurement.maxSerializedBytes !== budget.maxSerializedBytes) {
      issues.push(`${scale} serialized-size threshold mismatch`);
    }
    if (measurement.serializedSizePassed !== sizePassed) {
      issues.push(`${scale} serialized-size decision mismatch`);
    }
    thresholdsPassed = thresholdsPassed && sizePassed;
    if (!Array.isArray(measurement.operations)) {
      issues.push(`${scale} operations are missing`);
      thresholdsPassed = false;
      continue;
    }
    const operationNames = measurement.operations.map((operation) =>
      isRecord(operation) ? operation.operation : undefined,
    );
    if (hasDuplicate(operationNames)) issues.push(`${scale} contains a duplicate operation`);
    if (!sameJson(operationNames, PHASE8_OPERATION_ORDER)) {
      issues.push(`${scale} has a missing or out-of-order operation`);
    }
    for (const [operationIndex, operationName] of PHASE8_OPERATION_ORDER.entries()) {
      thresholdsPassed =
        validateOperation(
          measurement.operations[operationIndex],
          scale,
          operationName,
          expected,
          issues,
        ) && thresholdsPassed;
    }
  }
  return thresholdsPassed;
}

function validateProcessObservations(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("process observations are missing");
    return;
  }
  validateNumericObservation(
    value.cpuUsage,
    "cpuUsage",
    ["user", "system"],
    issues,
  );
  validateNumericObservation(
    value.resourceUsage,
    "resourceUsage",
    [
      "userCPUTime",
      "systemCPUTime",
      "maxRSS",
      "sharedMemorySize",
      "unsharedDataSize",
      "unsharedStackSize",
      "minorPageFault",
      "majorPageFault",
      "swappedOut",
      "fsRead",
      "fsWrite",
      "ipcSent",
      "ipcReceived",
      "signalsCount",
      "voluntaryContextSwitches",
      "involuntaryContextSwitches",
    ],
    issues,
  );
  validateNumericObservation(
    value.memoryUsage,
    "memoryUsage",
    ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"],
    issues,
  );
  validateEventLoopObservation(value.eventLoopUtilization, issues);
  if (!isFiniteNonnegative(value.processWallTimeMs)) issues.push("process wall time is invalid");
  if (!isRecord(value.host)) {
    issues.push("host observations are missing");
  } else if (
    !Array.isArray(value.host.loadAverageStart) ||
    value.host.loadAverageStart.length !== 3 ||
    !value.host.loadAverageStart.every(isFiniteNonnegative) ||
    !Array.isArray(value.host.loadAverageEnd) ||
    value.host.loadAverageEnd.length !== 3 ||
    !value.host.loadAverageEnd.every(isFiniteNonnegative) ||
    !isFiniteNonnegative(value.host.freeMemoryBytesStart) ||
    !isFiniteNonnegative(value.host.freeMemoryBytesEnd)
  ) {
    issues.push("host observations are incomplete or invalid");
  }
  if (!isRecord(value.gcTelemetry)) {
    issues.push("GC telemetry availability is missing");
  } else if (value.gcTelemetry.available === false) {
    if (typeof value.gcTelemetry.reason !== "string" || value.gcTelemetry.reason.length === 0) {
      issues.push("unavailable GC telemetry needs a reason");
    }
  } else if (value.gcTelemetry.available === true) {
    if (
      typeof value.gcTelemetry.source !== "string" ||
      !Array.isArray(value.gcTelemetry.observations)
    ) {
      issues.push("available GC telemetry is incomplete");
    }
  } else {
    issues.push("GC telemetry availability is invalid");
  }
}

function validateNumericObservation(
  value: unknown,
  identity: string,
  keys: readonly string[],
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${identity} observations are missing`);
    return;
  }
  const before = value.before;
  const after = value.after;
  const delta = value.delta;
  if (!isRecord(before) || !isRecord(after) || !isRecord(delta)) {
    issues.push(`${identity} before/after/delta observations are missing`);
    return;
  }
  for (const key of keys) {
    if (!isFiniteNonnegative(before[key]) || !isFiniteNonnegative(after[key])) {
      issues.push(`${identity} ${key} snapshot is invalid`);
      continue;
    }
    const deltaValue = delta[key];
    if (
      typeof deltaValue !== "number" ||
      !Number.isFinite(deltaValue) ||
      Math.abs(deltaValue - (after[key] - before[key])) > Number.EPSILON
    ) {
      issues.push(`${identity} ${key} delta is invalid`);
    }
  }
}

function validateEventLoopObservation(value: unknown, issues: string[]): void {
  if (!isRecord(value) || !isRecord(value.before) || !isRecord(value.after) || !isRecord(value.delta)) {
    issues.push("eventLoopUtilization before/after/delta observations are missing");
    return;
  }
  for (const point of [value.before, value.after, value.delta]) {
    if (
      !isFiniteNonnegative(point.idle) ||
      !isFiniteNonnegative(point.active) ||
      !isFiniteNonnegative(point.utilization) ||
      point.utilization > 1
    ) {
      issues.push("eventLoopUtilization observation is invalid");
      return;
    }
  }
  for (const key of ["idle", "active"] as const) {
    if (
      Math.abs(
        Number(value.delta[key]) - (Number(value.after[key]) - Number(value.before[key])),
      ) > 0.000001
    ) {
      issues.push(`eventLoopUtilization ${key} delta is invalid`);
    }
  }
}

function validateChildResult(
  integrity: unknown,
  mode: Phase8BenchmarkCommand["mode"],
  recomputedThresholdPassed: boolean,
  issues: string[],
): void {
  if (!isRecord(integrity) || !isRecord(integrity.childCalculated)) {
    issues.push("child-calculated result is missing");
    return;
  }
  if (integrity.reportComplete !== true) issues.push("report completeness marker is false");
  if (integrity.parentValidated !== null) issues.push("child report claimed parent validation");
  if (integrity.childStdoutSha256 !== null || integrity.childStderrSha256 !== null) {
    issues.push("child report claimed parent-owned stream hashes");
  }
  if (integrity.finalPassed !== null) issues.push("child report claimed a final result");
  if (integrity.evidenceSha256Sidecar !== "child-evidence.json.sha256") {
    issues.push("child evidence sidecar identity mismatch");
  }
  const child = integrity.childCalculated;
  if (child.thresholdPassed !== recomputedThresholdPassed) {
    issues.push("child threshold result disagrees with raw samples");
  }
  const processFailure = child.failureKind === "process";
  const expectedPassed = processFailure
    ? false
    : mode === "check"
      ? recomputedThresholdPassed
      : true;
  if (child.passed !== expectedPassed) issues.push("child pass result disagrees with recomputation");
  if (!Array.isArray(child.failures) || child.failures.some((entry) => typeof entry !== "string")) {
    issues.push("child failure inventory is invalid");
  } else if (processFailure) {
    if (child.failures.length === 0) issues.push("process failure has no diagnostic");
  } else if (recomputedThresholdPassed) {
    if (child.failureKind !== "none" || child.failures.length !== 0) {
      issues.push("passing raw samples have a contradictory child failure");
    }
  } else if (child.failureKind !== "threshold" || child.failures.length === 0) {
    issues.push("failing raw samples lack a threshold failure");
  }
}

export function validatePhase8BenchmarkEvidence(
  value: unknown,
  expected: Phase8EvidenceExpectation,
): Phase8EvidenceValidation {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["evidence report is not an object"], recomputedThresholdPassed: false };
  }
  if (value.schema !== PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA) {
    issues.push("unexpected schema version");
  }
  if (value.schemaVersion !== PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION) {
    issues.push("unexpected numeric schema version");
  }
  validateRun(value.run, expected, issues);
  validateCompletionMarker(expected.completionMarker, expected, issues);
  validateSourceBindings(value.sourceBindings, expected.sourceBindings, issues);
  validateExecutionContract(value.executionContract, expected, issues);
  const recomputedThresholdPassed = validateMeasurements(value.measurements, expected, issues);
  validateProcessObservations(value.processObservations, issues);
  validateChildResult(value.integrity, expected.command.mode, recomputedThresholdPassed, issues);
  return { valid: issues.length === 0, issues, recomputedThresholdPassed };
}

export function validatePhase8ExitAgreement({
  childExitCode,
  childSignal,
  childReportedPassed,
}: {
  childExitCode: number | null;
  childSignal: NodeJS.Signals | null;
  childReportedPassed: boolean;
}): string[] {
  if (childSignal) return [`benchmark child terminated by signal ${childSignal}`];
  if (childExitCode === null) return ["benchmark child exit code is missing"];
  if (childExitCode === 0 && !childReportedPassed) return ["child passed but report failed"];
  if (childExitCode !== 0 && childReportedPassed) return ["child failed but report passed"];
  return [];
}

export function validatePhase8ChildInvocation({
  value,
  expected,
  childExitCode,
  childSignal,
}: {
  value: unknown;
  expected: Phase8EvidenceExpectation;
  childExitCode: number | null;
  childSignal: NodeJS.Signals | null;
}): Phase8ChildInvocationValidation {
  const validation = validatePhase8BenchmarkEvidence(value, expected);
  const issues = [...validation.issues];
  const report = isRecord(value) ? value : null;
  const run = report && isRecord(report.run) ? report.run : null;
  const integrity = report && isRecord(report.integrity) ? report.integrity : null;
  const childCalculated = integrity && isRecord(integrity.childCalculated)
    ? integrity.childCalculated
    : null;
  const childReportedPassed = typeof childCalculated?.passed === "boolean"
    ? childCalculated.passed
    : null;
  if (run?.processExitCode !== childExitCode) {
    issues.push("actual child exit code disagrees with the report");
  }
  if (childReportedPassed === null) {
    issues.push("child result is missing");
  } else {
    issues.push(
      ...validatePhase8ExitAgreement({ childExitCode, childSignal, childReportedPassed }),
    );
  }
  return {
    ...validation,
    valid: issues.length === 0,
    issues,
    evidence: issues.length === 0 ? (value as Phase8BenchmarkEvidence) : null,
    childReportedPassed,
  };
}

export function parsePhase8EvidenceJson(bytes: Buffer | null): {
  value: Phase8BenchmarkEvidence | null;
  issues: string[];
} {
  if (!bytes) return { value: null, issues: ["benchmark child report is missing"] };
  try {
    return { value: JSON.parse(bytes.toString("utf8")) as Phase8BenchmarkEvidence, issues: [] };
  } catch {
    return { value: null, issues: ["evidence report is truncated or malformed JSON"] };
  }
}
