import assert from "node:assert/strict";
import {
  createFloorPlanImportTelemetryObserver,
  safeFloorPlanStageMetrics,
} from "../lib/floor-plan-imports/telemetry";

assert.deepEqual(
  safeFloorPlanStageMetrics({
    pageCount: 3,
    scaleSolved: true,
    residual: null,
    sourceFileName: "private-home.pdf",
    "bad key": 1,
  }),
  { pageCount: 3, scaleSolved: true, residual: null }
);

const logs: string[] = [];
createFloorPlanImportTelemetryObserver({
  log: (message) => logs.push(message),
}).transition({
  jobId: "job-1",
  adapterId: "pdf-raster-v1",
  extractionVersion: "1.0.0",
  from: "rendered",
  to: "extracted",
  durationMs: 12.6,
  metrics: { pageCount: 2, privateLabel: "Main bedroom" },
  reviewIssues: [
    {
      id: "issue-1",
      code: "scale_uncertain",
      message: "private detail",
      severity: "critical",
      resolved: false,
    },
  ],
});
const output = logs.join("\n");
assert.match(output, /"pageCount":2/);
assert.match(output, /"duration_ms":13/);
assert.match(output, /"critical_issue_count":1/);
assert.doesNotMatch(output, /Main bedroom|private detail|sourceFileName|privateLabel/);

console.log("floor-plan import telemetry tests passed");
