import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { getSerializedDesignDocumentByteLength } from "../lib/design-document-contract";
import {
  fingerprintDesignSnapshot,
  serializeDesignSnapshotFingerprint,
} from "../lib/snapshot-fingerprint";
import {
  sanitizeStoredDesign,
  snapshotToStored,
  storedToSnapshot,
} from "../lib/room-persistence";
import {
  PHASE8_CHILD_COMPLETION_FILE,
  PHASE8_CHILD_REPORT_FILE,
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
  samplesSha256,
  summarizePhase8Samples,
  type Phase8BenchmarkEvidence,
  type Phase8BenchmarkMode,
  type Phase8OperationMeasurement,
  type Phase8OperationName,
  type Phase8OperationSummary,
  type Phase8ProcessObservations,
  type Phase8ScaleMeasurement,
} from "./phase8-project-benchmark-contract";
import {
  PHASE8_EXPECTED_FINGERPRINTS,
  phase8BenchmarkCommand,
  phase8ProjectBenchmarkBudgets,
  readPhase8GitIdentity,
  readPhase8SourceBindings,
} from "./phase8-project-benchmark-context";
import {
  atomicWriteJson,
  sanitizePhase8Diagnostic,
  writeHashedEvidence,
} from "./phase8-project-benchmark-evidence-io";
import {
  createAllPhase8RepresentativeProjects,
  type Phase8RepresentativeProject,
  type Phase8ProjectScale,
} from "./phase8-representative-projects";

export type Phase8ProjectBenchmark = {
  scale: Phase8ProjectScale;
  roomCount: number;
  itemCount: number;
  serializedBytes: number;
  operations: Record<Phase8OperationName, Phase8OperationSummary>;
};

type ChildArguments = {
  nonce: string;
  runDirectory: string;
  expectedSourceCommitSha: string;
  expectedSourceTreeSha: string;
  expectedParentPid: number;
  npmVersion: string | null;
  mode: Phase8BenchmarkMode;
  jsonOutput: boolean;
};

type MeasuredPhase8Project = {
  project: Phase8RepresentativeProject;
  serializedBytes: number;
  samples: Record<Phase8OperationName, number[]>;
  summaries: Record<Phase8OperationName, Phase8OperationSummary>;
};

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing required ${name} argument`);
  return value;
}

function parseChildArguments(): ChildArguments {
  const mode = requiredArgument("--mode");
  if (mode !== "report" && mode !== "check") throw new Error(`unsupported benchmark mode ${mode}`);
  const expectedParentPid = Number(requiredArgument("--parent-pid"));
  if (!Number.isInteger(expectedParentPid) || expectedParentPid <= 0) {
    throw new Error("invalid expected parent PID");
  }
  const npmVersion = requiredArgument("--npm-version");
  return {
    nonce: requiredArgument("--nonce"),
    runDirectory: path.resolve(requiredArgument("--run-directory")),
    expectedSourceCommitSha: requiredArgument("--source-commit"),
    expectedSourceTreeSha: requiredArgument("--source-tree"),
    expectedParentPid,
    npmVersion: npmVersion === "unavailable" ? null : npmVersion,
    mode,
    jsonOutput: process.argv.includes("--json"),
  };
}

function sample(iterations: number, operation: () => void): number[] {
  operation();
  return Array.from({ length: iterations }, () => {
    const startedAt = performance.now();
    operation();
    return performance.now() - startedAt;
  });
}

function measurement(
  operation: Phase8OperationName,
  samplesMs: number[],
  thresholdMs: number,
  summary = summarizePhase8Samples(samplesMs),
): Phase8OperationMeasurement {
  return {
    operation,
    samplesMs,
    samplesSha256: samplesSha256(samplesMs),
    ...summary,
    thresholdMs,
    passed: summary.p95Ms <= thresholdMs,
  };
}

export function runPhase8ProjectBenchmarks(): MeasuredPhase8Project[] {
  return createAllPhase8RepresentativeProjects().map((project, projectIndex) => {
    const stored = snapshotToStored(project.snapshot);
    const serialized = JSON.stringify(stored);
    const iterations = PHASE8_SAMPLE_COUNTS[project.scale];
    assert.equal(project.scale, PHASE8_SCALE_ORDER[projectIndex]);
    assert.equal(
      fingerprintDesignSnapshot(project.snapshot),
      PHASE8_EXPECTED_FINGERPRINTS[project.scale],
      `${project.scale} representative fingerprint changed.`,
    );

    const coldFingerprintSamples = sample(iterations, () => {
      const fingerprint = fingerprintDesignSnapshot({ ...project.snapshot });
      assert.match(fingerprint, /^[a-f0-9]{8}$/);
    });
    const cachedFingerprintSamples = sample(iterations, () => {
      const fingerprint = fingerprintDesignSnapshot(project.snapshot);
      assert.match(fingerprint, /^[a-f0-9]{8}$/);
    });
    const saveSamples = sample(iterations, () => {
      const candidate = JSON.stringify(snapshotToStored(project.snapshot));
      assert(candidate.length > 0);
    });
    const loadSamples = sample(iterations, () => {
      const candidate = sanitizeStoredDesign(JSON.parse(serialized));
      assert(candidate);
      const restored = storedToSnapshot(candidate);
      assert.equal(restored.rooms.length, project.roomCount);
    });

    const restored = storedToSnapshot(stored);
    assert.equal(
      serializeDesignSnapshotFingerprint(restored),
      serializeDesignSnapshotFingerprint(storedToSnapshot(snapshotToStored(restored))),
      `${project.scale} fingerprint serialization must be stable after canonical save/load.`,
    );

    const samplesByOperation: Record<Phase8OperationName, number[]> = {
      fingerprintCold: coldFingerprintSamples,
      fingerprintCached: cachedFingerprintSamples,
      save: saveSamples,
      load: loadSamples,
    };
    return {
      project,
      serializedBytes: getSerializedDesignDocumentByteLength(serialized),
      samples: samplesByOperation,
      summaries: Object.fromEntries(
        PHASE8_OPERATION_ORDER.map((operation) => [
          operation,
          summarizePhase8Samples(samplesByOperation[operation]),
        ]),
      ) as Record<Phase8OperationName, Phase8OperationSummary>,
    };
  });
}

function materializeMeasurements(
  measuredProjects: readonly MeasuredPhase8Project[],
): Phase8ScaleMeasurement[] {
  const budgets = phase8ProjectBenchmarkBudgets();
  return measuredProjects.map(
    ({ project, serializedBytes, samples, summaries }, projectIndex) => {
      const rooms = project.snapshot.rooms;
      const scale = project.scale;
      const budget = budgets[scale];
      const fixture = {
        scale,
        rooms: rooms.length,
        items: project.itemCount,
        views: rooms.reduce((total, room) => total + room.savedViews.length, 0),
        zones: rooms.reduce((total, room) => total + room.zones.length, 0),
        openings: project.snapshot.floorPlan?.openings?.length ?? 0,
        serializedBytes,
        fingerprint: PHASE8_EXPECTED_FINGERPRINTS[scale],
      };
      assert.equal(scale, PHASE8_SCALE_ORDER[projectIndex]);
      return {
        scale,
        fixture,
        maxSerializedBytes: budget.maxSerializedBytes,
        serializedSizePassed: serializedBytes <= budget.maxSerializedBytes,
        operations: PHASE8_OPERATION_ORDER.map((operation) =>
          measurement(
            operation,
            samples[operation],
            budget.maxP95Ms[operation],
            summaries[operation],
          ),
        ),
      };
    },
  );
}

function numericDelta<T extends object>(before: T, after: T): Record<keyof T, number> {
  return Object.fromEntries(
    Object.keys(before).map((key) => {
      const typedKey = key as keyof T;
      return [key, Number(after[typedKey]) - Number(before[typedKey])];
    }),
  ) as Record<keyof T, number>;
}

function observeBenchmarkRun(run: () => MeasuredPhase8Project[]): {
  measuredProjects: MeasuredPhase8Project[];
  processObservations: Phase8ProcessObservations;
} {
  const cpuBefore = process.cpuUsage();
  const resourceBefore = process.resourceUsage();
  const memoryBefore = process.memoryUsage();
  const eventLoopBefore = performance.eventLoopUtilization();
  const processWallStartedAt = performance.now();
  const loadAverageStart = os.loadavg();
  const freeMemoryBytesStart = os.freemem();

  const measuredProjects = run();

  const processWallTimeMs = performance.now() - processWallStartedAt;
  const cpuAfter = process.cpuUsage();
  const resourceAfter = process.resourceUsage();
  const memoryAfter = process.memoryUsage();
  const eventLoopAfter = performance.eventLoopUtilization();
  return {
    measuredProjects,
    processObservations: {
      cpuUsage: {
        before: cpuBefore,
        after: cpuAfter,
        delta: numericDelta(cpuBefore, cpuAfter),
      },
      resourceUsage: {
        before: resourceBefore,
        after: resourceAfter,
        delta: numericDelta(resourceBefore, resourceAfter),
      },
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        delta: numericDelta(memoryBefore, memoryAfter),
      },
      eventLoopUtilization: {
        before: eventLoopBefore,
        after: eventLoopAfter,
        delta: performance.eventLoopUtilization(eventLoopAfter, eventLoopBefore),
      },
      processWallTimeMs,
      host: {
        loadAverageStart,
        loadAverageEnd: os.loadavg(),
        freeMemoryBytesStart,
        freeMemoryBytesEnd: os.freemem(),
      },
      gcTelemetry: {
        available: false,
        reason:
          "No GC observer or trace flag was activated because it would change the required benchmark process; the current runtime exposes no equivalent passive per-run GC total.",
      },
    },
  };
}

function thresholdFailures(measurements: readonly Phase8ScaleMeasurement[]): string[] {
  return measurements.flatMap((result) => {
    const failures = result.serializedSizePassed
      ? []
      : [
          `${result.scale} serialized size ${result.fixture.serializedBytes} exceeds ${result.maxSerializedBytes}.`,
        ];
    return failures.concat(
      result.operations
        .filter((operation) => !operation.passed)
        .map(
          (operation) =>
            `${result.scale} ${operation.operation} p95 ${operation.p95Ms} ms exceeds ${operation.thresholdMs} ms.`,
        ),
    );
  });
}

function legacyResults(measurements: readonly Phase8ScaleMeasurement[]): Phase8ProjectBenchmark[] {
  return measurements.map((result) => ({
    scale: result.scale,
    roomCount: result.fixture.rooms,
    itemCount: result.fixture.items,
    serializedBytes: result.fixture.serializedBytes,
    operations: Object.fromEntries(
      result.operations.map(({ operation, p50Ms, p95Ms, maxMs }) => [
        operation,
        { p50Ms, p95Ms, maxMs },
      ]),
    ) as Record<Phase8OperationName, Phase8OperationSummary>,
  }));
}

function writeChildEvidence(
  argumentsValue: ChildArguments,
  evidence: Phase8BenchmarkEvidence,
): void {
  const reportPath = path.join(argumentsValue.runDirectory, PHASE8_CHILD_REPORT_FILE);
  const { sha256 } = writeHashedEvidence(reportPath, evidence);
  atomicWriteJson(path.join(argumentsValue.runDirectory, PHASE8_CHILD_COMPLETION_FILE), {
    schema: "interior-ai.phase8-project-benchmark-completion.v1",
    nonce: argumentsValue.nonce,
    reportFile: PHASE8_CHILD_REPORT_FILE,
    reportSha256: sha256,
  });
}

function printResults(
  measurements: readonly Phase8ScaleMeasurement[],
  jsonOutput: boolean,
): void {
  const results = legacyResults(measurements);
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const result of results) {
    console.log(
      `${result.scale}: ${result.roomCount} rooms, ${result.itemCount} items, ` +
        `${result.serializedBytes} bytes; ` +
        `cold fingerprint p50 ${result.operations.fingerprintCold.p50Ms} ms / p95 ${result.operations.fingerprintCold.p95Ms} ms; ` +
        `cached fingerprint p50 ${result.operations.fingerprintCached.p50Ms} ms / p95 ${result.operations.fingerprintCached.p95Ms} ms; ` +
        `save p50 ${result.operations.save.p50Ms} ms / p95 ${result.operations.save.p95Ms} ms; ` +
        `load p50 ${result.operations.load.p50Ms} ms / p95 ${result.operations.load.p95Ms} ms`,
    );
  }
}

function main(): void {
  const repositoryRoot = process.cwd();
  let benchmarkExitCode = 2;
  let calculatedFailures: string[] = [];
  try {
    const argumentsValue = parseChildArguments();
    const startedAtUtc = new Date().toISOString();
    const monotonicStartedAt = performance.now();
    const { measuredProjects, processObservations } = observeBenchmarkRun(
      runPhase8ProjectBenchmarks,
    );
    const measurements = materializeMeasurements(measuredProjects);
    const gitIdentity = readPhase8GitIdentity(repositoryRoot);
    assert.equal(gitIdentity.sourceCommitSha, argumentsValue.expectedSourceCommitSha);
    assert.equal(gitIdentity.sourceTreeSha, argumentsValue.expectedSourceTreeSha);
    assert.equal(process.ppid, argumentsValue.expectedParentPid);
    const sourceBindings = readPhase8SourceBindings(repositoryRoot);
    const fixtures = measurements.map((measurementValue) => measurementValue.fixture);
    const thresholds = phase8ProjectBenchmarkBudgets();
    const failures = thresholdFailures(measurements);
    calculatedFailures = failures;
    const thresholdPassed = failures.length === 0;
    const passed = argumentsValue.mode === "check" ? thresholdPassed : true;
    benchmarkExitCode = passed ? 0 : 1;
    const completedAtUtc = new Date().toISOString();
    const evidence: Phase8BenchmarkEvidence = {
      schema: PHASE8_PROJECT_BENCHMARK_EVIDENCE_SCHEMA,
      schemaVersion: PHASE8_PROJECT_BENCHMARK_SCHEMA_VERSION,
      run: {
        id: argumentsValue.nonce,
        nonce: argumentsValue.nonce,
        sourceCommitSha: gitIdentity.sourceCommitSha,
        sourceTreeSha: gitIdentity.sourceTreeSha,
        branch: gitIdentity.branch,
        startedAtUtc,
        completedAtUtc,
        monotonicDurationMs: performance.now() - monotonicStartedAt,
        childPid: process.pid,
        parentPid: process.ppid,
        processExitCode: benchmarkExitCode,
        command: phase8BenchmarkCommand(argumentsValue.mode, argumentsValue.jsonOutput),
        nodeVersion: process.version,
        npmVersion: argumentsValue.npmVersion,
        platform: process.platform,
        architecture: process.arch,
        cpu: {
          model: os.cpus()[0]?.model ?? "unknown",
          logicalCoreCount: os.cpus().length,
        },
        totalMemoryBytes: os.totalmem(),
      },
      sourceBindings,
      executionContract: {
        scaleOrder: PHASE8_SCALE_ORDER,
        operationOrder: PHASE8_OPERATION_ORDER,
        sampleCountByScale: PHASE8_SAMPLE_COUNTS,
        warmupCount: PHASE8_WARMUP_COUNT,
        percentile: {
          algorithm: PHASE8_PERCENTILE_ALGORITHM,
          p50Fraction: 0.5,
          p95Fraction: 0.95,
          largeP95SortedSampleOrdinal: 29,
          serializedSummaryToleranceMs: PHASE8_SUMMARY_TOLERANCE_MS,
        },
        timer: PHASE8_TIMER,
        units: PHASE8_UNITS,
        thresholds,
        fixtures,
      },
      measurements,
      processObservations,
      integrity: {
        childCalculated: {
          passed,
          thresholdPassed,
          failureKind: thresholdPassed ? "none" : "threshold",
          failures,
        },
        parentValidated: null,
        reportComplete: true,
        childStdoutSha256: null,
        childStderrSha256: null,
        evidenceSha256Sidecar: `${PHASE8_CHILD_REPORT_FILE}.sha256`,
        finalPassed: null,
      },
    };
    writeChildEvidence(argumentsValue, evidence);
    printResults(measurements, argumentsValue.jsonOutput);
    if (argumentsValue.mode === "check" && thresholdPassed) {
      console.log("Phase 8 representative project budgets passed.");
    }
    for (const failure of failures) console.error(failure);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.stack ?? error.message : String(error);
    const message = sanitizePhase8Diagnostic(rawMessage, repositoryRoot);
    for (const failure of calculatedFailures) console.error(failure);
    console.error(`Phase 8 benchmark process/evidence failure: ${message}`);
  }
  process.exitCode = benchmarkExitCode;
}

main();
