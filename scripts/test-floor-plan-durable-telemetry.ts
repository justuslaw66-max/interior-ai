import assert from "node:assert/strict";
import {
  composeFloorPlanImportTelemetryObservers,
  createPrismaFloorPlanImportTelemetryObserver,
  projectFloorPlanImportStageEvent,
  safeFloorPlanStageMetrics,
  type FloorPlanImportStageTelemetry,
} from "../lib/floor-plan-imports/telemetry";

const event: FloorPlanImportStageTelemetry = {
  jobId: "job-1",
  adapterId: "pdf-raster-v1",
  extractionVersion: "1.2.3",
  from: "rendered",
  to: "extracted",
  durationMs: 42.8,
  metrics: {
    pageCount: 2,
    scaleSolved: true,
    residual: null,
    roomName_Secret: 5,
    textCount: Number.NaN,
    entityCount: Number.POSITIVE_INFINITY,
    pathCount: 1_000_000_000_001,
    sourceFileName: "private.pdf",
  },
  reviewIssues: [
    {
      id: "private-id",
      code: "private-code",
      message: "Private room label",
      severity: "critical",
      resolved: false,
    },
  ],
};

async function main() {
assert.deepEqual(safeFloorPlanStageMetrics(event.metrics), {
  pageCount: 2,
  scaleSolved: true,
  residual: null,
});
assert.deepEqual(projectFloorPlanImportStageEvent(event), {
  jobId: "job-1",
  adapterId: "pdf-raster-v1",
  extractionVersion: "1.2.3",
  fromStatus: "rendered",
  toStatus: "extracted",
  durationMs: 43,
  issueCount: 1,
  criticalIssueCount: 1,
  warningIssueCount: 0,
  metrics: { pageCount: 2, scaleSolved: true, residual: null },
});

const writes: unknown[] = [];
const prismaObserver = createPrismaFloorPlanImportTelemetryObserver({
  floorPlanImportStageEvent: {
    create: async (args: unknown) => {
      writes.push(args);
      return { id: "event-1" };
    },
  },
} as never);
await prismaObserver.transition(event);
const persisted = JSON.stringify(writes);
assert.match(persisted, /"jobId":"job-1"/);
assert.match(persisted, /"metricsJson":\{"pageCount":2/);
assert.doesNotMatch(
  persisted,
  /Private room label|private-id|private-code|private\.pdf|sourceFileName|roomName_Secret/
);

let successfulObserverCalls = 0;
let observedErrors = 0;
await composeFloorPlanImportTelemetryObservers(
  [
    { transition: async () => void (successfulObserverCalls += 1) },
    { transition: async () => Promise.reject(new Error("database unavailable")) },
  ],
  { onError: () => void (observedErrors += 1) }
).transition(event);
assert.equal(successfulObserverCalls, 1);
assert.equal(observedErrors, 1);

console.log("floor-plan durable telemetry tests passed");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
