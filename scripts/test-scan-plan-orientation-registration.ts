import assert from "node:assert/strict";
import { calibratedScaleFixture, scaleMeasurement } from "./fixtures/scan-to-editable-plan/scale-review";
import { authoredRegisteredUnderlayDocument, authoredSourcePoint } from "./fixtures/scan-to-editable-plan/registered-underlay";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { applyFloorPlanAddressTransformV2, canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-overlay-residuals";
import { registeredImportUnderlay } from "@/lib/floor-plan-imports/registered-underlay";
import { mapUnderlayWorldPointToPixels } from "@/lib/floor-plan-calibration";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";

// Independent normalized transforms for the authored 9260 x 6000 mm envelope.
const orientations: Record<FloorPlanAddressTransform, (x: number, z: number) => [number, number]> = {
  normal: (x, z) => [x, z], mirror_x: (x, z) => [9260 - x, z], mirror_z: (x, z) => [x, 6000 - z],
  rotate_90: (x, z) => [6000 - z, x], rotate_180: (x, z) => [9260 - x, 6000 - z], rotate_270: (x, z) => [z, 9260 - x],
  mirror_x_rotate_90: (x, z) => [6000 - z, 9260 - x], mirror_x_rotate_270: (x, z) => [z, x],
};

function testOrientationRegistration() {
  const collinear = calibratedScaleFixture();
  collinear.floors[0].calibrations[0].controlPoints.push({ sourcePx: { x: 500, y: 0 }, planMm: { xMm: 5000, zMm: 0 } });
  for (const [source, pointInPlan] of [
    [calibratedScaleFixture(), (x: number, y: number) => ({ xMm: 10 * x, zMm: 10 * y })],
    [collinear, (x: number, y: number) => ({ xMm: 10 * x, zMm: 10 * y })],
    [authoredRegisteredUnderlayDocument(), authoredSourcePoint],
  ] as const) {
    source.floors[0].calibrations[0].independentMeasurements = [scaleMeasurement()];
    const original = JSON.stringify(source);
    for (const transform of Object.keys(orientations) as FloorPlanAddressTransform[]) {
      const oriented = applyFloorPlanAddressTransformV2(source, transform);
      const calibration = oriented.floors[0].calibrations[0];
      const projection = buildFloorPlanSourceProjection(calibration)!;
      const underlay = registeredImportUnderlay({ document: oriented, jobId: "authored-orientation",
        renderedPages: [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "authored-page" }],
        sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "authored.png", mimeType: "image/png" } })!;
      for (const [x, y] of [[100, 200], [900, 700], [0, 800], [1000, 0]]) {
        const before = pointInPlan(x, y), [xMm, zMm] = orientations[transform](before.xMm, before.zMm);
        const actual = projection.project({ xMm, zMm });
        assert.ok(Math.hypot(actual.xPx - x, actual.yPx - y) < 1e-7, `${transform}: source point ${x},${y} moved to ${actual.xPx},${actual.yPx}`);
        const pixels = mapUnderlayWorldPointToPixels(underlay, { x: xMm / 1000, z: zMm / 1000 })!;
        assert.equal(Math.hypot(pixels.x - x, pixels.y - y), 0, "Pixel coordinates must remain exact after the existing 0.01 px rounding, including signed zero.");
      }
      assert.deepEqual(calibration.independentMeasurements, source.floors[0].calibrations[0].independentMeasurements);
      const reloaded = storedToSnapshot(snapshotToStored(canonicalFloorPlanToDesignSnapshot(oriented, { underlay }).snapshot));
      assert.deepEqual(reloaded.floorPlan!.canonicalDocument!.floors[0].calibrations, oriented.floors[0].calibrations);
      const twice = applyFloorPlanAddressTransformV2(applyFloorPlanAddressTransformV2(oriented, "mirror_x"), "mirror_x");
      assert.deepEqual(twice.floors[0].calibrations[0].controlPoints, calibration.controlPoints);
      const after = buildFloorPlanSourceProjection(twice.floors[0].calibrations[0])!;
      assert.deepEqual(after.project({ xMm: 1234, zMm: 4321 }), projection.project({ xMm: 1234, zMm: 4321 }));
    }
    assert.equal(JSON.stringify(source), original, "Orientation must preserve the original source document.");
  }
  const invalid = calibratedScaleFixture();
  Object.assign(invalid.floors[0].calibrations[0], { reflected: "yes" });
  assert.throws(() => compileFloorPlanDocumentV2(invalid), /validation/i);
}

testOrientationRegistration();
console.log("PASS: off-axis registration through all eight orientations, two-point and collinear fallback, affine reflection, private underlay, persistence and double mirror.");
