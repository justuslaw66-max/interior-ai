import assert from "node:assert/strict";
import { resolveFloorPlanProcessingMode } from "../lib/floor-plan-imports/processing-mode";

assert.equal(
  resolveFloorPlanProcessingMode({ NODE_ENV: "production" }),
  "background",
  "production must not couple imports to the request lifecycle by default"
);
assert.equal(resolveFloorPlanProcessingMode({ NODE_ENV: "development" }), "inline");
assert.equal(
  resolveFloorPlanProcessingMode({
    NODE_ENV: "production",
    FLOOR_PLAN_PROCESSING_MODE: "inline",
  }),
  "inline"
);
assert.equal(
  resolveFloorPlanProcessingMode({
    NODE_ENV: "development",
    FLOOR_PLAN_PROCESSING_MODE: " BACKGROUND ",
  }),
  "background"
);
assert.throws(
  () =>
    resolveFloorPlanProcessingMode({
      NODE_ENV: "production",
      FLOOR_PLAN_PROCESSING_MODE: "serverless",
    }),
  /expected "background" or "inline"/
);

console.log("floor-plan processing mode tests passed");
