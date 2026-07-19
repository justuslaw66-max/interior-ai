import assert from "node:assert/strict";
import {
  buildAdminFloorPlanQueueWhere,
  floorPlanQueueAttention,
  parseAdminFloorPlanQueueFilter,
} from "../lib/floor-plan-imports/admin-queue";

assert.equal(parseAdminFloorPlanQueueFilter("review"), "review");
assert.equal(parseAdminFloorPlanQueueFilter("unknown"), "all");
assert.deepEqual(buildAdminFloorPlanQueueWhere({ filter: "all" }), {});

const searched = buildAdminFloorPlanQueueWhere({
  filter: "processing",
  query: "  HOME.PDF  ",
});
assert.ok(Array.isArray(searched.AND));
assert.match(JSON.stringify(searched), /HOME\.PDF/);

const now = new Date("2026-07-17T12:00:00.000Z");
assert.equal(
  floorPlanQueueAttention({
    status: "validating",
    updatedAt: new Date("2026-07-17T10:59:59.000Z"),
    now,
  }),
  "processing_overdue"
);
assert.equal(
  floorPlanQueueAttention({
    status: "needs_review",
    updatedAt: new Date("2026-07-16T11:59:59.000Z"),
    now,
  }),
  "review_overdue"
);
assert.equal(
  floorPlanQueueAttention({
    status: "needs_review",
    updatedAt: new Date("2026-07-17T11:59:59.000Z"),
    now,
  }),
  null
);
assert.equal(
  floorPlanQueueAttention({
    status: "failed",
    updatedAt: now,
    now,
  }),
  "failed"
);

console.log("floor-plan admin queue tests passed");
