import assert from "node:assert/strict";
import { extractFloorPlanDesignReference } from "../lib/floor-plan-design-reference";

assert.equal(extractFloorPlanDesignReference(null), null);
assert.equal(extractFloorPlanDesignReference({ version: 3 }), null);

assert.deepEqual(
  extractFloorPlanDesignReference({
    floorPlan: {
      revisionId: " revision-1 ",
      sourceRevisionGeometryHash: "A".repeat(64),
      addressTransform: "mirror_x",
      addressBinding: { bindingId: "binding-1" },
      underlay: {
        sourceJobId: "job-1",
        sourceAssetSha256: "b".repeat(64),
      },
    },
  }),
  {
    revisionId: "revision-1",
    sourceJobId: "job-1",
    sourceAssetSha256: "b".repeat(64),
    geometryHash: "a".repeat(64),
    addressBindingId: "binding-1",
    transform: "mirror_x",
  }
);

assert.deepEqual(
  extractFloorPlanDesignReference({
    floorPlan: {
      revisionId: "x".repeat(192),
      canonicalGeometryHash: "not-a-hash",
      addressTransform: "turn_left",
    },
  }),
  null
);

console.log("floor-plan design reference tests passed");
