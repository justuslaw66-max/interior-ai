import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { Phase8ProjectScale } from "./phase8-representative-projects";

export const PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA =
  "interior-ai.phase8-project-benchmark-evidence.v1";
export const PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION = 1;
export const PHASE8_SCALE_ORDER = ["small", "medium", "large"] as const;
export const PHASE8_OPERATION_ORDER = [
  "fingerprintCold",
  "fingerprintCached",
  "save",
  "load",
] as const;
export const PHASE8_SAMPLE_COUNTS: Record<Phase8ProjectScale, number> = {
  small: 160,
  medium: 80,
  large: 30,
};
export const PHASE8_WARMUP_COUNT = 1;
export const PHASE8_TIMER = "performance.now";
export const PHASE8_UNITS = "milliseconds";
export const PHASE8_PERCENTILE_ALGORITHM = "nearest-rank";
export const PHASE8_SUMMARY_TOLERANCE_MS = 0.000000000001;
export const PHASE8_CHILD_REPORT_FILE = "child-evidence.json";
export const PHASE8_CHILD_COMPLETION_FILE = "child-complete.json";
export const PHASE8_FINAL_REPORT_FILE = "evidence.json";
export const PHASE8_FINAL_COMPLETION_FILE = "complete.json";
export const PHASE8_SAMPLING_STARTED_FILE = "sampling-started.json";
export const PHASE8_VALIDATION_FAILURE_FILE = "validation-failure.json";
export const PHASE8_STDOUT_FILE = "child.stdout.txt";
export const PHASE8_STDERR_FILE = "child.stderr.txt";
export const PHASE8_MAX_REPORT_BYTES = 2 * 1024 * 1024;
export const PHASE8_MAX_OUTPUT_BYTES = 256 * 1024;
export const PHASE8_MAX_RETAINED_RUN_DIRECTORIES = 8;

export const PHASE8_SOURCE_BINDINGS = [
  { role: "benchmark", path: "scripts/benchmark-phase8-projects.ts" },
  { role: "representativeFixtures", path: "scripts/phase8-representative-projects.ts" },
  { role: "snapshotFingerprint", path: "lib/snapshot-fingerprint.ts" },
  { role: "performanceBudgets", path: "config/phase8-performance-budgets.json" },
  { role: "packageManifest", path: "package.json" },
  { role: "packageLock", path: "package-lock.json" },
  { role: "evidenceSchema", path: "scripts/phase8-project-benchmark-contract.ts" },
  { role: "evidenceValidator", path: "scripts/phase8-project-benchmark-validator.ts" },
  { role: "benchmarkContext", path: "scripts/phase8-project-benchmark-context.ts" },
  { role: "evidenceIo", path: "scripts/phase8-project-benchmark-evidence-io.ts" },
  { role: "benchmarkWrapper", path: "scripts/run-phase8-project-benchmark.ts" },
] as const;

export type Phase8OperationName = (typeof PHASE8_OPERATION_ORDER)[number];
export type Phase8BenchmarkMode = "report" | "check";

export type Phase8ProjectBenchmarkBudgets = Record<
  Phase8ProjectScale,
  {
    maxSerializedBytes: number;
    maxP95Ms: Record<Phase8OperationName, number>;
  }
>;

export type Phase8OperationSummary = {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type Phase8OperationMeasurement = Phase8OperationSummary & {
  operation: Phase8OperationName;
  samplesMs: number[];
  samplesSha256: string;
  thresholdMs: number;
  passed: boolean;
};

export type Phase8FixtureSummary = {
  scale: Phase8ProjectScale;
  rooms: number;
  items: number;
  views: number;
  zones: number;
  openings: number;
  serializedBytes: number;
  fingerprint: string;
};

export type Phase8ScaleMeasurement = {
  scale: Phase8ProjectScale;
  fixture: Phase8FixtureSummary;
  maxSerializedBytes: number;
  serializedSizePassed: boolean;
  operations: Phase8OperationMeasurement[];
};

export type Phase8SourceBinding = {
  role: string;
  path: string;
  sha256: string;
};

export type Phase8BenchmarkCommand = {
  packageScript: "benchmark:phase8:projects";
  mode: Phase8BenchmarkMode;
  jsonOutput: boolean;
};

export type Phase8ChildCalculatedResult = {
  passed: boolean;
  thresholdPassed: boolean;
  failureKind: "none" | "threshold" | "process";
  failures: string[];
};

export type Phase8ParentValidatedResult = {
  passed: boolean;
  issues: string[];
  recomputedThresholdPassed: boolean;
};

export type Phase8EvidenceIntegrity = {
  childCalculated: Phase8ChildCalculatedResult;
  parentValidated: Phase8ParentValidatedResult | null;
  reportComplete: boolean;
  childStdoutSha256: string | null;
  childStderrSha256: string | null;
  evidenceSha256Sidecar: string;
  finalPassed: boolean | null;
};

export type Phase8ProcessObservations = {
  cpuUsage: {
    before: NodeJS.CpuUsage;
    after: NodeJS.CpuUsage;
    delta: NodeJS.CpuUsage;
  };
  resourceUsage: {
    before: NodeJS.ResourceUsage;
    after: NodeJS.ResourceUsage;
    delta: Record<keyof NodeJS.ResourceUsage, number>;
  };
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: Record<keyof NodeJS.MemoryUsage, number>;
  };
  eventLoopUtilization: {
    before: { idle: number; active: number; utilization: number };
    after: { idle: number; active: number; utilization: number };
    delta: { idle: number; active: number; utilization: number };
  };
  processWallTimeMs: number;
  host: {
    loadAverageStart: number[];
    loadAverageEnd: number[];
    freeMemoryBytesStart: number;
    freeMemoryBytesEnd: number;
  };
  gcTelemetry:
    | { available: false; reason: string }
    | { available: true; source: string; observations: unknown[] };
};

export type Phase8BenchmarkEvidence = {
  schema: typeof PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA;
  schemaVersion: typeof PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION;
  run: {
    id: string;
    nonce: string;
    sourceCommitSha: string;
    sourceTreeSha: string;
    branch: string;
    startedAtUtc: string;
    completedAtUtc: string;
    monotonicDurationMs: number;
    childPid: number;
    parentPid: number | null;
    processExitCode: number;
    command: Phase8BenchmarkCommand;
    nodeVersion: string;
    npmVersion: string | null;
    platform: NodeJS.Platform;
    architecture: string;
    cpu: { model: string; logicalCoreCount: number };
    totalMemoryBytes: number;
  };
  sourceBindings: Phase8SourceBinding[];
  executionContract: {
    scaleOrder: readonly Phase8ProjectScale[];
    operationOrder: readonly Phase8OperationName[];
    sampleCountByScale: Record<Phase8ProjectScale, number>;
    warmupCount: number;
    percentile: {
      algorithm: typeof PHASE8_PERCENTILE_ALGORITHM;
      p50Fraction: 0.5;
      p95Fraction: 0.95;
      largeP95SortedSampleOrdinal: 29;
      serializedSummaryToleranceMs: number;
    };
    timer: typeof PHASE8_TIMER;
    units: typeof PHASE8_UNITS;
    thresholds: Phase8ProjectBenchmarkBudgets;
    fixtures: Phase8FixtureSummary[];
  };
  measurements: Phase8ScaleMeasurement[];
  processObservations: Phase8ProcessObservations;
  integrity: Phase8EvidenceIntegrity;
};

export function roundPhase8Timing(value: number): number {
  return Number(value.toFixed(6));
}

export function phase8Percentile(values: readonly number[], fraction: number): number {
  assert(values.length > 0);
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[Math.min(index, ordered.length - 1)];
}

export function summarizePhase8Samples(
  values: readonly number[],
): Phase8OperationSummary {
  return {
    p50Ms: roundPhase8Timing(phase8Percentile(values, 0.5)),
    p95Ms: roundPhase8Timing(phase8Percentile(values, 0.95)),
    maxMs: roundPhase8Timing(Math.max(...values)),
  };
}

export function sha256Bytes(value: string | NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(value).digest("hex");
}

export function samplesSha256(values: readonly number[]): string {
  return sha256Bytes(JSON.stringify(values));
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
