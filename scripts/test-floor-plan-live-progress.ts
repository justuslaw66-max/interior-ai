import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  estimateFloorPlanImportProgress,
  floorPlanStageRange,
  formatFloorPlanRemainingTime,
  type FloorPlanProgressEstimateJob,
} from "@/lib/floor-plan-imports/progress-estimate";
import { startAndPollFloorPlanImport } from "@/lib/floor-plan-import-client";
import { completeFloorPlanEtaPredictions } from "@/lib/floor-plan-imports/eta-calibration";

const baseNow = new Date("2026-07-31T09:00:00.000Z");
const activeJob: FloorPlanProgressEstimateJob = {
  status: "rendered",
  progress: 20,
  statusChangedAt: new Date(baseNow.getTime() - 60_000),
  lastAttemptAt: new Date(baseNow.getTime() - 65_000),
  nextAttemptAt: null,
  leaseExpiresAt: new Date(baseNow.getTime() + 120_000),
  heartbeatAt: new Date(baseNow.getTime() - 10_000),
  renderedPageCount: 1,
};

const live = estimateFloorPlanImportProgress({
  job: activeJob,
  samples: [],
  now: baseNow,
});
assert.equal(live.activity, "working");
assert.equal(live.confirmedPercent, 20);
assert.ok(live.estimatedPercent > 20 && live.estimatedPercent < 40);
assert.ok(live.remainingRangeMs && live.remainingRangeMs.max > live.remainingRangeMs.min);
assert.equal(live.heartbeatHealthy, true);
assert.ok(live.estimatedPercent <= live.nextMilestonePercent - 1);
assert.match(
  formatFloorPlanRemainingTime(live.remainingRangeMs, live.confidence) ?? "",
  /remaining/
);

const stale = estimateFloorPlanImportProgress({
  job: {
    ...activeJob,
    heartbeatAt: new Date(baseNow.getTime() - 80_000),
  },
  samples: [],
  now: baseNow,
});
assert.equal(stale.activity, "attention");
assert.equal(stale.heartbeatHealthy, false);
assert.equal(stale.remainingRangeMs, null);
assert.equal(stale.estimatedPercent, stale.confirmedPercent);

const queued = estimateFloorPlanImportProgress({
  job: {
    ...activeJob,
    leaseExpiresAt: null,
    heartbeatAt: null,
  },
  samples: [],
  now: baseNow,
});
assert.equal(queued.activity, "queued");
assert.equal(queued.remainingRangeMs, null);

const retrying = estimateFloorPlanImportProgress({
  job: {
    ...activeJob,
    leaseExpiresAt: null,
    heartbeatAt: null,
    nextAttemptAt: new Date(baseNow.getTime() + 5_000),
  },
  samples: [],
  now: baseNow,
});
assert.equal(retrying.activity, "retrying");
assert.equal(retrying.nextAttemptAt, "2026-07-31T09:00:05.000Z");

const ready = estimateFloorPlanImportProgress({
  job: { ...activeJob, status: "ready", progress: 100 },
  samples: [],
  now: baseNow,
});
assert.equal(ready.activity, "complete");
assert.equal(ready.estimatedPercent, 100);

const failed = estimateFloorPlanImportProgress({
  job: { ...activeJob, status: "failed", progress: 100 },
  samples: [],
  now: baseNow,
});
assert.equal(failed.activity, "failed");
assert.equal(failed.estimatedPercent, 0);

const sameBucketSamples = Array.from({ length: 8 }, (_, index) => ({
  fromStatus: "rendered" as const,
  durationMs: 80_000 + index * 1_000,
  pageCount: 1,
}));
const otherBucketSamples = Array.from({ length: 12 }, (_, index) => ({
  fromStatus: "rendered" as const,
  durationMs: 300_000 + index * 1_000,
  pageCount: 8,
}));
const bucketed = floorPlanStageRange(
  "rendered",
  [...sameBucketSamples, ...otherBucketSamples],
  1
);
assert.equal(bucketed.confidence, "medium");
assert.equal(bucketed.sampleCount, 8);
assert.ok(bucketed.max < 100_000);

async function assertProcessingIsNotAwaited() {
  let startCalled = false;
  const neverCompletes = new Promise<void>(() => undefined);
  type PollJob = {
    status: "received" | "rendered" | "ready";
    progress: number;
    leaseExpiresAt: string | null;
  };
  const statuses: PollJob[] = [
    {
      status: "rendered" as const,
      progress: 20,
      leaseExpiresAt: new Date(baseNow.getTime() + 120_000).toISOString(),
    },
    {
      status: "ready" as const,
      progress: 100,
      leaseExpiresAt: null,
    },
  ];
  let index = 0;
  const result = await startAndPollFloorPlanImport<PollJob>({
    initialJob: {
      status: "received" as const,
      progress: 5,
      leaseExpiresAt: null,
    },
    startProcessing: () => {
      startCalled = true;
      return neverCompletes;
    },
    loadJob: async () => statuses[index++],
    wait: async () => undefined,
  });
  assert.equal(startCalled, true);
  assert.equal(result.status, "ready");
  assert.equal(index, 2);
}

async function assertUnstartedFailureSurfaces() {
  let clock = 0;
  await assert.rejects(
    startAndPollFloorPlanImport({
      initialJob: {
        status: "received" as const,
        progress: 5,
        leaseExpiresAt: null,
      },
      startProcessing: async () => {
        throw new Error("processing unavailable");
      },
      loadJob: async () => ({
        status: "received" as const,
        progress: 5,
        leaseExpiresAt: null,
      }),
      wait: async (durationMs) => {
        clock += durationMs;
      },
      now: () => clock,
      startFailureGraceMs: 3_000,
    }),
    /processing unavailable/
  );
}

async function assertStartFailureDoesNotHideDurableProgress() {
  type FailureRecoveryJob = {
    status: "received" | "ready";
    progress: number;
    leaseExpiresAt: string | null;
  };
  const result = await startAndPollFloorPlanImport<FailureRecoveryJob>({
    initialJob: {
      status: "received" as const,
      progress: 5,
      leaseExpiresAt: null,
    },
    startProcessing: async () => {
      throw new Error("response connection closed");
    },
    loadJob: async () => ({
      status: "ready" as const,
      progress: 100,
      leaseExpiresAt: null,
    }),
    wait: async () => undefined,
  });
  assert.equal(result.status, "ready");
}

async function main() {
  await assertProcessingIsNotAwaited();
  await assertUnstartedFailureSurfaces();
  await assertStartFailureDoesNotHideDurableProgress();
  const completedPredictions: Array<Record<string, unknown>> = [];
  await completeFloorPlanEtaPredictions(
    {
      floorPlanImportEtaPrediction: {
        findMany: async () => [
          {
            id: "eta-1",
            createdAt: new Date(baseNow.getTime() - 120_000),
          },
        ],
        update: async (args: unknown) => {
          completedPredictions.push(args as Record<string, unknown>);
          return args;
        },
      },
    },
    {
      jobId: "job-1",
      outcomeStatus: "ready",
      completedAt: baseNow,
    }
  );
  assert.deepEqual(
    (completedPredictions[0]?.data as Record<string, unknown>)
      ?.actualRemainingMs,
    120_000
  );

  const root = process.cwd();
  const read = (relativePath: string) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");
  const processRoute = read(
    "app/api/floor-plan-imports/[id]/process/route.ts"
  );
  const statusRoute = read("app/api/floor-plan-imports/[id]/route.ts");
  const assistant = read("components/editor/FloorPlanImportAssistant.tsx");
  const workspace = read("components/editor/FloorPlanImportWorkspace.tsx");
  assert.doesNotMatch(
    processRoute,
    /signal:\s*request\.signal/,
    "Closing the browser must not abort the lease-owning inline worker."
  );
  assert.match(
    statusRoute,
    /\{\s*job,\s*progressEstimate\s*\}/,
    "The owner status response should expose additive ETA metadata."
  );
  assert.match(assistant, /Estimated progress/);
  assert.match(assistant, />\s*Live\s*</);
  assert.match(workspace, /activeJobSnapshot[\s\S]*?onJobUpdate/);
  console.log("Floor-plan live progress and ETA checks passed.");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
