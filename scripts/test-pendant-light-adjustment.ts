import assert from "node:assert/strict";
import {
  calculatePendantCableDeformation,
  clampPendantHeightCm,
  getAdjustablePendantHeight,
} from "@/lib/pendant-light-adjustment";

const config = {
  minCm: 31.4,
  maxCm: 206.4,
  defaultCm: 120,
  cableStartRatio: 0.05,
  cableEndRatio: 0.7,
};

assert.equal(clampPendantHeightCm(10, config), 31.4);
assert.equal(clampPendantHeightCm(300, config), 206.4);
assert.equal(clampPendantHeightCm(118.26, config), 118.3);

const adjustment = getAdjustablePendantHeight(
  { metadata: { adjustablePendantHeight: config } },
  { hangingHeightCm: 80 }
);
assert.equal(adjustment?.currentCm, 80);

const shortened = calculatePendantCableDeformation({
  adjustment: { ...config, currentCm: config.minCm },
  naturalHeightMeters: 0.754,
  axisMin: -1,
  axisLength: 2,
});
assert(shortened);
assert(shortened.cableScale > 0 && shortened.cableScale < 1);
assert(shortened.cableDelta < 0);

const extended = calculatePendantCableDeformation({
  adjustment: { ...config, currentCm: config.maxCm },
  naturalHeightMeters: 0.754,
  axisMin: -1,
  axisLength: 2,
});
assert(extended);
assert(extended.cableScale > 1);
assert(extended.cableDelta > 0);

console.log("Pendant light adjustment checks passed");
