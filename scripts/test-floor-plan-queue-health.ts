import assert from "node:assert/strict";
import { assessFloorPlanQueueHealth } from "../lib/floor-plan-imports/queue-health";

const now = new Date("2026-07-17T00:00:00.000Z");
const base = {
  active: 0,
  expiredLeases: 0,
  failedLast24Hours: 0,
  oldestQueuedAt: null,
};

assert.equal(
  assessFloorPlanQueueHealth({ snapshot: { ...base, queued: 0 }, now }).status,
  "ok"
);

const waiting = assessFloorPlanQueueHealth({
  snapshot: {
    ...base,
    queued: 2,
    oldestQueuedAt: new Date(now.getTime() - 61_000),
  },
  now,
  environment: { FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS: "120" },
});
assert.equal(waiting.status, "degraded");
assert.match(waiting.reasons.join(" "), /no active worker lease/);

const overdue = assessFloorPlanQueueHealth({
  snapshot: {
    ...base,
    queued: 1,
    active: 1,
    oldestQueuedAt: new Date(now.getTime() - 61_000),
  },
  now,
  environment: { FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS: "60" },
});
assert.equal(overdue.status, "degraded");
assert.match(overdue.reasons.join(" "), /processing SLO/);

assert.equal(
  assessFloorPlanQueueHealth({
    snapshot: { ...base, queued: 0, expiredLeases: 1 },
    now,
  }).status,
  "error"
);

assert.throws(
  () =>
    assessFloorPlanQueueHealth({
      snapshot: { ...base, queued: 0 },
      now,
      environment: { FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS: "2" },
    }),
  /between 30 and 86400/
);

console.log("floor-plan queue health tests passed");
