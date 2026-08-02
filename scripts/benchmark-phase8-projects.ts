import assert from "node:assert/strict";
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
  createAllPhase8RepresentativeProjects,
  type Phase8ProjectScale,
} from "./phase8-representative-projects";
import performanceBudgets from "../config/phase8-performance-budgets.json";

type OperationName = "fingerprintCold" | "fingerprintCached" | "save" | "load";

type OperationSummary = {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type Phase8ProjectBenchmark = {
  scale: Phase8ProjectScale;
  roomCount: number;
  itemCount: number;
  serializedBytes: number;
  operations: Record<OperationName, OperationSummary>;
};

const ITERATIONS: Record<Phase8ProjectScale, number> = {
  small: 160,
  medium: 80,
  large: 30,
};

const EXPECTED_FINGERPRINTS: Record<Phase8ProjectScale, string> = {
  small: "3acd8307",
  medium: "8064c579",
  large: "c76918bc",
};

function percentile(values: readonly number[], fraction: number): number {
  assert(values.length > 0);
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[Math.min(index, ordered.length - 1)];
}

function summarize(values: readonly number[]): OperationSummary {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
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

function round(value: number): number {
  return Number(value.toFixed(6));
}

function roundedSummary(summary: OperationSummary): OperationSummary {
  return {
    p50Ms: round(summary.p50Ms),
    p95Ms: round(summary.p95Ms),
    maxMs: round(summary.maxMs),
  };
}

export function runPhase8ProjectBenchmarks(): Phase8ProjectBenchmark[] {
  return createAllPhase8RepresentativeProjects().map((project) => {
    const stored = snapshotToStored(project.snapshot);
    const serialized = JSON.stringify(stored);
    const iterations = ITERATIONS[project.scale];
    assert.equal(
      fingerprintDesignSnapshot(project.snapshot),
      EXPECTED_FINGERPRINTS[project.scale],
      `${project.scale} representative fingerprint changed.`
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
      `${project.scale} fingerprint serialization must be stable after canonical save/load.`
    );

    return {
      scale: project.scale,
      roomCount: project.roomCount,
      itemCount: project.itemCount,
      serializedBytes: getSerializedDesignDocumentByteLength(serialized),
      operations: {
        fingerprintCold: roundedSummary(summarize(coldFingerprintSamples)),
        fingerprintCached: roundedSummary(summarize(cachedFingerprintSamples)),
        save: roundedSummary(summarize(saveSamples)),
        load: roundedSummary(summarize(loadSamples)),
      },
    };
  });
}

const results = runPhase8ProjectBenchmarks();
if (process.argv.includes("--check")) {
  for (const result of results) {
    const budget = performanceBudgets.projectBenchmarks[result.scale];
    assert(
      result.serializedBytes <= budget.maxSerializedBytes,
      `${result.scale} serialized size ${result.serializedBytes} exceeds ${budget.maxSerializedBytes}.`
    );
    for (const operation of Object.keys(result.operations) as OperationName[]) {
      const actual = result.operations[operation].p95Ms;
      const limit = budget.maxP95Ms[operation];
      assert(
        actual <= limit,
        `${result.scale} ${operation} p95 ${actual} ms exceeds ${limit} ms.`
      );
    }
  }
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    console.log(
      `${result.scale}: ${result.roomCount} rooms, ${result.itemCount} items, ` +
        `${result.serializedBytes} bytes; ` +
        `cold fingerprint p50 ${result.operations.fingerprintCold.p50Ms} ms / p95 ${result.operations.fingerprintCold.p95Ms} ms; ` +
        `cached fingerprint p50 ${result.operations.fingerprintCached.p50Ms} ms / p95 ${result.operations.fingerprintCached.p95Ms} ms; ` +
        `save p50 ${result.operations.save.p50Ms} ms / p95 ${result.operations.save.p95Ms} ms; ` +
        `load p50 ${result.operations.load.p50Ms} ms / p95 ${result.operations.load.p95Ms} ms`
    );
  }
}
if (process.argv.includes("--check")) {
  console.log("Phase 8 representative project budgets passed.");
}
