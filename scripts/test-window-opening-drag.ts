import assert from "node:assert/strict";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { moveDesignPageOpening } from "@/lib/useDesignPageOpeningMoveAction";
import { MIN_OPENING_CORNER_CLEARANCE_METERS, validateTracedOpeningPlacement } from "@/lib/floor-plan-tracing";
import { getWindowDragPosition, type WindowDragBounds } from "@/components/editor/renderers/house-plan-3d/windowOpeningDrag";

const start: WindowDragBounds = {
  offset: 0.25, sourceOffset: 0.25, sourceDirection: 1,
  bottom: 0.9, width: 1.4, height: 1.2, wallLength: 4.8, wallHeight: 2.6,
};
assert.deepEqual(getWindowDragPosition(start, 0, 0), { offsetMeters: 0.25, bottomMeters: 0.9 });
assert.deepEqual(getWindowDragPosition(start, 0.4, -0.3), { offsetMeters: 0.65, bottomMeters: 0.6 });
assert.deepEqual(getWindowDragPosition(start, 100, 100), { offsetMeters: 1.52, bottomMeters: 1.4 });
assert.deepEqual(getWindowDragPosition(start, -100, -100), { offsetMeters: -1.52, bottomMeters: 0 });
assert.deepEqual(
  getWindowDragPosition({ ...start, sourceOffset: -0.5, sourceDirection: -1 }, 0.4, 0.2),
  { offsetMeters: -0.9, bottomMeters: 1.1 },
  "A mirrored face with a reversed wall direction must update the source opening in the correct direction."
);
for (let index = -100; index <= 100; index++) {
  const result = getWindowDragPosition(start, index / 7, -index / 11);
  assert.ok(Math.abs(result.offsetMeters) + start.width / 2 <= start.wallLength / 2 - MIN_OPENING_CORNER_CLEARANCE_METERS + 1e-9);
  assert.ok(result.bottomMeters >= 0 && result.bottomMeters + start.height <= start.wallHeight + 1e-9);
}
const opening: RoomOpening2D = {
  id: "window", roomId: "living", kind: "window", wall: "west",
  offsetMm: 250, widthMm: 1400, heightMm: 1200, bottomMm: 900,
};
const room: HousePlanRoom2D = { id: "living", name: "Living", roomType: "living", shape: "rectangle", x: 0, z: 0, w: 4.2, d: 4.8 };
for (const offsetMm of [-1520, 1520]) {
  assert.deepEqual(validateTracedOpeningPlacement({ ...opening, offsetMm }, [room]), { valid: true },
    "A drag clamped at the exact corner clearance must not be rejected by floating-point rounding.");
}
assert.equal(validateTracedOpeningPlacement({ ...opening, offsetMm: 1521 }, [room]).valid, false);
const calls: { route: string; id: string; metrics: DesignPageOpeningMetricsPatch }[] = [];
const options = {
  openingsRef: { current: [opening] },
  canonicalTopology: undefined,
  moveOpening: (id: string, offsetMeters: number) => calls.push({ route: "move", id, metrics: { offsetMeters } }),
  updateMetrics: (id: string, metrics: DesignPageOpeningMetricsPatch) => calls.push({ route: "metrics", id, metrics }),
};
moveDesignPageOpening(options, opening.id, 0.65, 0.6);
assert.deepEqual(calls.pop(), { route: "metrics", id: "window", metrics: { offsetMeters: 0.65, bottomMeters: 0.6 } });
assert.equal(opening.widthMm, 1400);
assert.equal(opening.heightMm, 1200);
moveDesignPageOpening(options, opening.id, 0.5);
assert.equal(calls.pop()?.route, "move", "2D gestures must retain the established horizontal-only path.");
options.openingsRef.current = [{ ...opening, evidence: { sillHeight: "site_measured" } }];
moveDesignPageOpening(options, opening.id, 0.4, 0.5);
assert.deepEqual(calls.pop()?.metrics, { offsetMeters: 0.4 }, "Dragging must not override locked measurements.");
options.openingsRef.current = [{ ...opening, kind: "door" }];
moveDesignPageOpening(options, opening.id, 0.3, 0.5);
assert.deepEqual(calls.pop()?.metrics, { offsetMeters: 0.3 }, "Doors must stay on the floor.");
options.openingsRef.current = [opening];
moveDesignPageOpening({ ...options, canonicalTopology: {
  moveOpening: () => true, resizeOpening: () => true,
  updateOpeningMetrics: (id, metrics) => { calls.push({ route: "canonical", id, metrics }); return true; },
} }, opening.id, 0.5, 0.7);
assert.deepEqual(calls, [{ route: "canonical", id: "window", metrics: { offsetMeters: 0.5, bottomMeters: 0.7 } }],
  "Both axes must reach the same canonical mutation without a duplicate legacy write or a measurement-only edit.");
console.log("window opening drag bounds and mutation routing passed");
