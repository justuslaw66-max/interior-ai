import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { getSerializedDesignDocumentByteLength } from "../lib/design-document-contract";
import { snapshotToStored } from "../lib/room-persistence";
import {
  PHASE8_OPERATION_ORDER,
  PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA,
  PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION,
  PHASE8_SAMPLE_COUNTS,
  PHASE8_SCALE_ORDER,
  PHASE8_SUMMARY_TOLERANCE_MS,
  PHASE8_TIMER,
  PHASE8_UNITS,
  PHASE8_WARMUP_COUNT,
  samplesSha256,
  sha256Bytes,
  summarizePhase8Samples,
  type Phase8BenchmarkEvidence,
  type Phase8FixtureSummary,
  type Phase8OperationMeasurement,
  type Phase8ProjectBenchmarkBudgets,
  type Phase8SourceBinding,
} from "./phase8-project-benchmark-contract";
import {
  assertCapturedOutputPath,
  atomicWriteJson,
  canonicalJsonBytes,
  prunePhase8EvidenceRuns,
  sanitizePhase8Diagnostic,
  writeCapturedOutput,
  writeHashedEvidence,
} from "./phase8-project-benchmark-evidence-io";
import {
  parsePhase8EvidenceJson,
  validatePhase8BenchmarkEvidence,
  validatePhase8ChildInvocation,
  validatePhase8ExitAgreement,
  type Phase8EvidenceExpectation,
} from "./phase8-project-benchmark-validator";
import { createAllPhase8RepresentativeProjects } from "./phase8-representative-projects";

function legacyPercentile(values: readonly number[], fraction: number): number {
  assert(values.length > 0);
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[Math.min(index, ordered.length - 1)];
}

function legacySummary(values: readonly number[]) {
  const round = (value: number) => Number(value.toFixed(6));
  return {
    p50Ms: round(legacyPercentile(values, 0.5)),
    p95Ms: round(legacyPercentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
  };
}

const benchmarkSource = readFileSync("scripts/benchmark-phase8-projects.ts", "utf8");
const fixtureSource = readFileSync("scripts/phase8-representative-projects.ts", "utf8");
const contractSource = readFileSync("scripts/phase8-project-benchmark-contract.ts", "utf8");
const contextSource = readFileSync("scripts/phase8-project-benchmark-context.ts", "utf8");
assert.match(fixtureSource, /\["small", "medium", "large"\]/);
assert.ok(
  benchmarkSource.indexOf("coldFingerprintSamples") <
    benchmarkSource.indexOf("cachedFingerprintSamples") &&
    benchmarkSource.indexOf("cachedFingerprintSamples") < benchmarkSource.indexOf("saveSamples") &&
    benchmarkSource.indexOf("saveSamples") < benchmarkSource.indexOf("loadSamples"),
  "Phase 8 operations must remain cold fingerprint, cached fingerprint, save, then load",
);
assert.match(contractSource, /large:\s*30/);
assert.match(benchmarkSource, /performance\.now\(\)/);
assert.match(benchmarkSource, /fingerprintDesignSnapshot\(\{ \.\.\.project\.snapshot \}\)/);
assert.match(benchmarkSource, /fingerprintDesignSnapshot\(project\.snapshot\)/);
assert.match(contextSource, /"rev-parse", "HEAD\^\{tree\}"/);
assert.match(contextSource, /"diff", "--cached", "--quiet"/);
assert.match(contextSource, /"ls-files", "--others", "--exclude-standard"/);

const budgets = JSON.parse(
  readFileSync("config/phase8-performance-budgets.json", "utf8"),
) as { projectBenchmarks: { large: { maxP95Ms: { fingerprintCold: number } } } };
assert.equal(budgets.projectBenchmarks.large.maxP95Ms.fingerprintCold, 6);

const fixedSamples = Array.from({ length: 30 }, (_, index) => 30 - index);
assert.deepEqual(legacySummary(fixedSamples), { p50Ms: 15, p95Ms: 29, maxMs: 30 });
assert.deepEqual(
  summarizePhase8Samples(fixedSamples),
  legacySummary(fixedSamples),
  "shared and legacy summary logic must remain identical",
);

const fixtureSummaries = createAllPhase8RepresentativeProjects().map((project) => {
  const rooms = project.snapshot.rooms;
  const serialized = JSON.stringify(snapshotToStored(project.snapshot));
  return {
    scale: project.scale,
    rooms: rooms.length,
    items: rooms.reduce((total, room) => total + room.items.length, 0),
    views: rooms.reduce((total, room) => total + room.savedViews.length, 0),
    zones: rooms.reduce((total, room) => total + room.zones.length, 0),
    openings: project.snapshot.floorPlan?.openings?.length ?? 0,
    serializedBytes: getSerializedDesignDocumentByteLength(serialized),
  };
});
assert.deepEqual(fixtureSummaries, [
  { scale: "small", rooms: 1, items: 6, views: 1, zones: 1, openings: 1, serializedBytes: 6606 },
  { scale: "medium", rooms: 4, items: 120, views: 12, zones: 8, openings: 4, serializedBytes: 103606 },
  { scale: "large", rooms: 12, items: 720, views: 72, zones: 48, openings: 12, serializedBytes: 612481 },
]);

const fixtureIdentities: Phase8FixtureSummary[] = fixtureSummaries.map((fixture, index) => ({
  ...fixture,
  fingerprint: ["3acd8307", "8064c579", "c76918bc"][index],
}));
const thresholds: Phase8ProjectBenchmarkBudgets = {
  small: {
    maxSerializedBytes: 8000,
    maxP95Ms: { fingerprintCold: 0.25, fingerprintCached: 0.05, save: 0.1, load: 0.5 },
  },
  medium: {
    maxSerializedBytes: 120000,
    maxP95Ms: { fingerprintCold: 1.5, fingerprintCached: 0.05, save: 0.5, load: 2.5 },
  },
  large: {
    maxSerializedBytes: 700000,
    maxP95Ms: { fingerprintCold: 6, fingerprintCached: 0.05, save: 2.5, load: 10 },
  },
};
const sourceBindings: Phase8SourceBinding[] = [
  { role: "benchmark", path: "scripts/benchmark-phase8-projects.ts", sha256: "1".repeat(64) },
];
const now = Date.now();

function syntheticOperation(
  operation: (typeof PHASE8_OPERATION_ORDER)[number],
  scale: (typeof PHASE8_SCALE_ORDER)[number],
  failing = false,
): Phase8OperationMeasurement {
  const samplesMs = Array.from({ length: PHASE8_SAMPLE_COUNTS[scale] }, () => 0.001);
  if (failing && scale === "large" && operation === "fingerprintCold") {
    samplesMs.splice(0, samplesMs.length, ...Array(28).fill(0.001), 7, 8);
  }
  const summary = summarizePhase8Samples(samplesMs);
  const thresholdMs = thresholds[scale].maxP95Ms[operation];
  return {
    operation,
    samplesMs,
    samplesSha256: samplesSha256(samplesMs),
    ...summary,
    thresholdMs,
    passed: summary.p95Ms <= thresholdMs,
  };
}

function syntheticEvidence(thresholdFailure = false): Phase8BenchmarkEvidence {
  const measurements = PHASE8_SCALE_ORDER.map((scale, scaleIndex) => ({
    scale,
    fixture: fixtureIdentities[scaleIndex],
    maxSerializedBytes: thresholds[scale].maxSerializedBytes,
    serializedSizePassed: true,
    operations: PHASE8_OPERATION_ORDER.map((operation) =>
      syntheticOperation(operation, scale, thresholdFailure),
    ),
  }));
  const thresholdPassed = measurements.every(
    (measurement) =>
      measurement.serializedSizePassed && measurement.operations.every((operation) => operation.passed),
  );
  return {
    schema: PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA,
    schemaVersion: PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION,
    run: {
      id: "test-nonce",
      nonce: "test-nonce",
      sourceCommitSha: "a".repeat(40),
      sourceTreeSha: "b".repeat(40),
      branch: "test/phase8-evidence",
      startedAtUtc: new Date(now - 50).toISOString(),
      completedAtUtc: new Date(now).toISOString(),
      monotonicDurationMs: 50,
      childPid: 1234,
      parentPid: 1233,
      processExitCode: thresholdPassed ? 0 : 1,
      command: { packageScript: "benchmark:phase8:projects", mode: "check", jsonOutput: true },
      nodeVersion: "v24.13.0",
      npmVersion: "11.6.2",
      platform: process.platform,
      architecture: process.arch,
      cpu: { model: "synthetic", logicalCoreCount: 8 },
      totalMemoryBytes: 16_000_000_000,
    },
    sourceBindings: clone(sourceBindings),
    executionContract: {
      scaleOrder: PHASE8_SCALE_ORDER,
      operationOrder: PHASE8_OPERATION_ORDER,
      sampleCountByScale: PHASE8_SAMPLE_COUNTS,
      warmupCount: PHASE8_WARMUP_COUNT,
      percentile: {
        algorithm: "nearest-rank",
        p50Fraction: 0.5,
        p95Fraction: 0.95,
        largeP95SortedSampleOrdinal: 29,
        serializedSummaryToleranceMs: PHASE8_SUMMARY_TOLERANCE_MS,
      },
      timer: PHASE8_TIMER,
      units: PHASE8_UNITS,
      thresholds: clone(thresholds),
      fixtures: clone(fixtureIdentities),
    },
    measurements,
    processObservations: {
      cpuUsage: {
        before: { user: 1, system: 1 },
        after: { user: 2, system: 2 },
        delta: { user: 1, system: 1 },
      },
      resourceUsage: {
        before: syntheticResourceUsage(1),
        after: syntheticResourceUsage(2),
        delta: syntheticResourceUsage(1),
      },
      memoryUsage: {
        before: syntheticMemoryUsage(1),
        after: syntheticMemoryUsage(2),
        delta: syntheticMemoryUsage(1),
      },
      eventLoopUtilization: {
        before: { idle: 1, active: 1, utilization: 0.5 },
        after: { idle: 2, active: 2, utilization: 0.5 },
        delta: { idle: 1, active: 1, utilization: 0.5 },
      },
      processWallTimeMs: 50,
      host: {
        loadAverageStart: [0, 0, 0],
        loadAverageEnd: [0, 0, 0],
        freeMemoryBytesStart: 8_000_000_000,
        freeMemoryBytesEnd: 8_000_000_000,
      },
      gcTelemetry: {
        available: false,
        reason: "Synthetic runtime exposes no passive GC total.",
      },
    },
    integrity: {
      childCalculated: {
        passed: thresholdPassed,
        thresholdPassed,
        failureKind: thresholdPassed ? "none" : "threshold",
        failures: thresholdPassed ? [] : ["large fingerprintCold p95 exceeds 6 ms"],
      },
      parentValidated: null,
      reportComplete: true,
      childStdoutSha256: null,
      childStderrSha256: null,
      evidenceSha256Sidecar: "child-evidence.json.sha256",
      finalPassed: null,
    },
  };
}

function syntheticResourceUsage(value: number): NodeJS.ResourceUsage {
  return {
    userCPUTime: value,
    systemCPUTime: value,
    maxRSS: value,
    sharedMemorySize: value,
    unsharedDataSize: value,
    unsharedStackSize: value,
    minorPageFault: value,
    majorPageFault: value,
    swappedOut: value,
    fsRead: value,
    fsWrite: value,
    ipcSent: value,
    ipcReceived: value,
    signalsCount: value,
    voluntaryContextSwitches: value,
    involuntaryContextSwitches: value,
  };
}

function syntheticMemoryUsage(value: number): NodeJS.MemoryUsage {
  return {
    rss: value,
    heapTotal: value,
    heapUsed: value,
    external: value,
    arrayBuffers: value,
  };
}

function expectation(report: Phase8BenchmarkEvidence): Phase8EvidenceExpectation {
  const reportSha256 = sha256Bytes(canonicalJsonBytes(report));
  return {
    nonce: "test-nonce",
    sourceCommitSha: "a".repeat(40),
    sourceTreeSha: "b".repeat(40),
    childPid: 1234,
    parentPid: 1233,
    command: { packageScript: "benchmark:phase8:projects", mode: "check", jsonOutput: true },
    sourceBindings: clone(sourceBindings),
    fixtures: clone(fixtureIdentities),
    thresholds: clone(thresholds),
    invocationStartedAtMs: now - 100,
    invocationEndedAtMs: now + 100,
    childReportSha256: reportSha256,
    completionMarker: {
      schema: "interior-ai.phase8-project-benchmark-completion.v1",
      nonce: "test-nonce",
      reportFile: "child-evidence.json",
      reportSha256,
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function issuesFor(
  mutate: (report: Phase8BenchmarkEvidence, expected: Phase8EvidenceExpectation) => void,
  thresholdFailure = false,
): string[] {
  const report = syntheticEvidence(thresholdFailure);
  const expected = expectation(report);
  mutate(report, expected);
  return validatePhase8BenchmarkEvidence(report, expected).issues;
}

function expectIssue(issues: readonly string[], fragment: string): void {
  assert.ok(
    issues.some((issue) => issue.includes(fragment)),
    `expected issue containing ${JSON.stringify(fragment)}, received ${JSON.stringify(issues)}`,
  );
}

const passingReport = syntheticEvidence();
assert.deepEqual(validatePhase8BenchmarkEvidence(passingReport, expectation(passingReport)).issues, []);
assert.deepEqual(
  validatePhase8ChildInvocation({
    value: passingReport,
    expected: expectation(passingReport),
    childExitCode: 0,
    childSignal: null,
  }).issues,
  [],
);
const failingReport = syntheticEvidence(true);
assert.deepEqual(validatePhase8BenchmarkEvidence(failingReport, expectation(failingReport)).issues, []);
assert.deepEqual(
  validatePhase8ChildInvocation({
    value: failingReport,
    expected: expectation(failingReport),
    childExitCode: 1,
    childSignal: null,
  }).issues,
  [],
);
assert.equal(failingReport.measurements[2].operations[0].samplesMs.length, 30);
assert.equal(failingReport.measurements[2].operations[0].p95Ms, 7);
const processFailureReport = syntheticEvidence();
processFailureReport.run.processExitCode = 2;
processFailureReport.integrity.childCalculated = {
  passed: false,
  thresholdPassed: true,
  failureKind: "process",
  failures: ["synthetic process failure"],
};
assert.deepEqual(
  validatePhase8BenchmarkEvidence(processFailureReport, expectation(processFailureReport)).issues,
  [],
);

expectIssue(parsePhase8EvidenceJson(null).issues, "report is missing");
expectIssue(parsePhase8EvidenceJson(Buffer.from('{"schema":')).issues, "truncated or malformed");
expectIssue(issuesFor((report) => report.measurements[0].operations[0].samplesMs.splice(0)), "empty");
for (const sampleCount of [29, 31]) {
  expectIssue(
    issuesFor((report) => {
      const operation = report.measurements[2].operations[0];
      operation.samplesMs = Array(sampleCount).fill(0.001);
      operation.samplesSha256 = samplesSha256(operation.samplesMs);
      Object.assign(operation, summarizePhase8Samples(operation.samplesMs));
    }),
    "sample count mismatch",
  );
}
expectIssue(issuesFor((report) => void (report.run.nonce = "wrong")), "nonce mismatch");
expectIssue(issuesFor((report) => void (report.run.nonce = "")), "nonce mismatch");
expectIssue(issuesFor((report) => void (report.run.sourceCommitSha = "c".repeat(40))), "source SHA");
expectIssue(issuesFor((report) => void (report.run.sourceTreeSha = "c".repeat(40))), "tree SHA");
expectIssue(issuesFor((report) => void (report.sourceBindings[0].sha256 = "2".repeat(64))), "source-file hash");
expectIssue(issuesFor((report) => void (report.schemaVersion = 2 as 1)), "numeric schema version");
expectIssue(
  issuesFor(
    (report) =>
      void (report.schema = "interior-ai.phase8-project-benchmark-evidence.v2" as typeof report.schema),
  ),
  "unexpected schema version",
);
expectIssue(issuesFor((_report, expected) => void (expected.completionMarker = null)), "completion marker");
assert.deepEqual(
  validatePhase8ExitAgreement({ childExitCode: 0, childSignal: null, childReportedPassed: false }),
  ["child passed but report failed"],
);
assert.deepEqual(
  validatePhase8ExitAgreement({ childExitCode: 1, childSignal: null, childReportedPassed: true }),
  ["child failed but report passed"],
);
const childPassReportFail = syntheticEvidence(true);
expectIssue(
  validatePhase8ChildInvocation({
    value: childPassReportFail,
    expected: expectation(childPassReportFail),
    childExitCode: 0,
    childSignal: null,
  }).issues,
  "child passed but report failed",
);
const childFailReportPass = syntheticEvidence();
childFailReportPass.run.processExitCode = 1;
expectIssue(
  validatePhase8ChildInvocation({
    value: childFailReportPass,
    expected: expectation(childFailReportPass),
    childExitCode: 1,
    childSignal: null,
  }).issues,
  "child failed but report passed",
);
const malformedInvocation = validatePhase8ChildInvocation({
  value: {},
  expected: expectation(syntheticEvidence()),
  childExitCode: 2,
  childSignal: null,
});
assert.equal(malformedInvocation.evidence, null);
expectIssue(malformedInvocation.issues, "run identity");
expectIssue(
  issuesFor((report) => {
    report.integrity.childCalculated.passed = true;
    report.integrity.childCalculated.failureKind = "none";
    report.integrity.childCalculated.failures = [];
  }, true),
  "child pass result",
);
expectIssue(
  issuesFor((report) => {
    report.integrity.childCalculated.passed = false;
    report.integrity.childCalculated.failureKind = "threshold";
    report.integrity.childCalculated.failures = ["synthetic contradiction"];
  }),
  "child pass result",
);
expectIssue(issuesFor((report) => void (report.measurements[0].operations[0].p50Ms += 1)), "p50");
expectIssue(issuesFor((report) => void (report.measurements[0].operations[0].p95Ms += 1)), "p95");
expectIssue(issuesFor((report) => void (report.measurements[0].operations[0].maxMs += 1)), "maximum");
expectIssue(issuesFor((report) => void (report.measurements[0].operations[0].samplesMs[0] = NaN)), "nonfinite");
expectIssue(
  issuesFor((report) => void (report.measurements[0].operations[0].samplesMs[0] = Infinity)),
  "nonfinite",
);
expectIssue(issuesFor((report) => void (report.measurements[0].operations[0].samplesMs[0] = -1)), "negative");
expectIssue(
  issuesFor((report) => report.measurements.push(clone(report.measurements[0]))),
  "duplicate scale",
);
expectIssue(
  issuesFor((report) => report.measurements[0].operations.push(clone(report.measurements[0].operations[0]))),
  "duplicate operation",
);
expectIssue(issuesFor((report) => void report.measurements.pop()), "scale is missing");
expectIssue(issuesFor((report) => void report.measurements[0].operations.pop()), "missing or out-of-order");
expectIssue(
  issuesFor((report) => {
    report.run.startedAtUtc = new Date(now - 10_000).toISOString();
    report.run.completedAtUtc = new Date(now - 9_000).toISOString();
  }),
  "stale",
);
assert.throws(
  () => assertCapturedOutputPath(path.join("run", "child-evidence.json")),
  /cannot replace/,
);
assert.equal(sha256Bytes(Buffer.alloc(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
assert.equal(
  validatePhase8BenchmarkEvidence(passingReport, expectation(passingReport)).valid,
  true,
  "empty stdout is independent from a valid evidence report",
);
assert.equal(passingReport.processObservations.gcTelemetry.available, false);
expectIssue(
  issuesFor((report) => void (report.processObservations.cpuUsage.delta.user += 1)),
  "cpuUsage user delta",
);
expectIssue(
  issuesFor(
    (report) =>
      void (report.processObservations.memoryUsage = {} as typeof report.processObservations.memoryUsage),
  ),
  "memoryUsage before/after/delta",
);
expectIssue(
  issuesFor((report) => {
    const operation = report.measurements[0].operations[0];
    operation.samplesMs[0] = 0.002;
    operation.samplesSha256 = samplesSha256(operation.samplesMs);
    operation.samplesMs.reverse();
  }),
  "sample order hash",
);
expectIssue(issuesFor((report) => void (report.run.childPid = 999)), "child PID");
expectIssue(
  issuesFor((report) => void (report.run.command.mode = "report")),
  "command or mode",
);
assert.deepEqual(
  validatePhase8ExitAgreement({ childExitCode: null, childSignal: "SIGTERM", childReportedPassed: false }),
  ["benchmark child terminated by signal SIGTERM"],
);
const signalReport = syntheticEvidence();
signalReport.run.processExitCode = 2;
expectIssue(
  validatePhase8ChildInvocation({
    value: signalReport,
    expected: expectation(signalReport),
    childExitCode: null,
    childSignal: "SIGTERM",
  }).issues,
  "terminated by signal",
);

const artifactRoot = mkdtempSync(path.join(os.tmpdir(), "phase8-evidence-contract-"));
try {
  const reportPath = path.join(artifactRoot, "evidence.json");
  const result = writeHashedEvidence(reportPath, passingReport);
  atomicWriteJson(path.join(artifactRoot, "complete.json"), {
    schema: "interior-ai.phase8-project-benchmark-parent-completion.v1",
    nonce: passingReport.run.nonce,
    reportFile: "evidence.json",
    reportSha256: result.sha256,
  });
  const emptyStdoutHash = writeCapturedOutput(
    path.join(artifactRoot, "child.stdout.txt"),
    Buffer.alloc(0),
  );
  assert.equal(emptyStdoutHash, sha256Bytes(Buffer.alloc(0)));
  assert.equal(existsSync(`${reportPath}.sha256`), true);
  assert.equal(existsSync(path.join(artifactRoot, "complete.json")), true);
  assert.deepEqual(parsePhase8EvidenceJson(readFileSync(reportPath)).issues, []);
  const historyRoot = path.join(artifactRoot, "history");
  mkdirSync(historyRoot);
  for (let index = 0; index < 10; index += 1) {
    mkdirSync(
      path.join(
        historyRoot,
        `20260810T000000${String(index).padStart(3, "0")}Z-${index + 1}-${String(index).repeat(12)}`,
      ),
    );
  }
  prunePhase8EvidenceRuns(historyRoot, 7);
  assert.equal(readdirSync(historyRoot).length, 7);
  assert.equal(
    sanitizePhase8Diagnostic(
      `${process.cwd()}/scripts/benchmark-phase8-projects.ts:1`,
      process.cwd(),
    ),
    "<WORKSPACE>/scripts/benchmark-phase8-projects.ts:1",
  );
} finally {
  rmSync(artifactRoot, { recursive: true, force: true });
}

console.log("Phase 8 project benchmark characterization and evidence negative tests passed.");
