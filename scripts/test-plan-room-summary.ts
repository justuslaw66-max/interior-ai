import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  buildPlanRoomSummary,
  formatPlanDimensionsLabel,
  formatPlanRoomMetricLabel,
  resolvePlanRoomSelection,
} from "@/lib/plan-room-summary";
import { getPlanRoomFloorAreaSqm, getRoomFloorAreaSqm, L_SHAPE_NOTCH_RATIO } from "@/lib/room-floor-area";

const planRoomSummarySource = readFileSync(
  join(process.cwd(), "lib/plan-room-summary.ts"),
  "utf8"
);
const roomRendererSource = readFileSync(
  join(process.cwd(), "components/editor/renderers/RoomRenderer2D.tsx"),
  "utf8"
);
const summaryCardSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/PlanRoomSummaryCard.tsx"),
  "utf8"
);
const planPanelSource = readFileSync(
  join(process.cwd(), "components/editor/DesignControlsPlanPanel.tsx"),
  "utf8"
);

const rooms: HousePlanRoom2D[] = [
  {
    id: "living",
    name: "Living / Sleep",
    roomType: "living",
    shape: "rectangle",
    x: 0,
    z: 0,
    w: 4.2,
    d: 4.8,
  },
  {
    id: "services",
    name: "Services",
    roomType: "kitchen",
    shape: "rectangle",
    x: 3.15,
    z: 0,
    w: 2.1,
    d: 5.7,
  },
];

const wholePlan = buildPlanRoomSummary(rooms);
assert.equal(wholePlan.roomCount, 2);
assert.equal(Number(wholePlan.widthMeters.toFixed(2)), 6.3);
assert.equal(Number(wholePlan.depthMeters.toFixed(2)), 5.7);
assert.equal(Number(wholePlan.areaSquareMeters.toFixed(2)), 32.13);
assert.deepEqual(
  wholePlan.rooms.map((room) => [
    room.name,
    Number(room.widthMeters.toFixed(2)),
    Number(room.depthMeters.toFixed(2)),
  ]),
  [
    ["Living / Sleep", 4.2, 4.8],
    ["Services", 2.1, 5.7],
  ]
);

const polygonPlan = buildPlanRoomSummary([
  {
    id: "notched",
    name: "Notched room",
    roomType: "custom",
    shape: "custom_polygon",
    x: 10,
    z: -3,
    w: 4,
    d: 4,
    polygon: [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 2 },
      { x: -2, z: 2 },
    ],
    holes: [[
      { x: -1, z: -1 },
      { x: 0, z: -1 },
      { x: 0, z: 0 },
      { x: -1, z: 0 },
    ]],
  },
]);
assert.equal(polygonPlan.widthMeters, 4);
assert.equal(polygonPlan.depthMeters, 4);
assert.equal(polygonPlan.areaSquareMeters, 11);

const notch = [
  { x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 },
  { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 },
];
assert.equal(
  getRoomFloorAreaSqm({ shape: "rectangle", width: 2, depth: 2, polygon: notch }),
  4,
  "A stale polygon on a rectangle room must not change its floor area."
);
assert.equal(
  getRoomFloorAreaSqm({ shape: "custom_polygon", width: 5, depth: 5, polygon: notch.slice(0, 2) }),
  25,
  "A degenerate custom polygon must fall back to width × depth."
);
assert.equal(
  getRoomFloorAreaSqm({
    shape: "custom_polygon", width: 4, depth: 4, polygon: notch,
    holes: [[{ x: -1, z: -1 }, { x: 0, z: -1 }], [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }]],
  }),
  0,
  "Degenerate holes are ignored and oversized holes clamp the floor area at zero."
);
assert.equal(getRoomFloorAreaSqm({ shape: "rectangle", width: -3, depth: 2 }), 0);
assert.equal(
  getPlanRoomFloorAreaSqm({ shape: "custom_polygon", w: 4, d: 4, polygon: notch }),
  12,
  "2D plan rooms (w × d) must share the snapshot floor-area rule."
);
const stalePolygonPlan = buildPlanRoomSummary([
  { id: "stale", name: "Stale", roomType: "custom", shape: "rectangle", x: 0, z: 0, w: 2, d: 3, polygon: notch },
]);
assert.deepEqual(
  [stalePolygonPlan.widthMeters, stalePolygonPlan.depthMeters, stalePolygonPlan.areaSquareMeters],
  [2, 3, 6],
  "A stale polygon on a rectangle room must change neither its summary dimensions nor its area."
);
// A 5 m × 4 m L-shape loses the 2.1 m × 1.68 m notch every renderer draws: 20 − 3.528 = 16.472 m².
assert.equal(
  getRoomFloorAreaSqm({ shape: "l_shape", width: 5, depth: 4 }),
  16.472,
  "An L-shape room's floor area must exclude the drawn notch."
);
assert.equal(
  getRoomFloorAreaSqm({
    shape: "l_shape", width: 5, depth: 4, polygon: notch,
    holes: [[{ x: -2, z: -1 }, { x: -1.5, z: -1 }, { x: -1.5, z: -0.5 }, { x: -2, z: -0.5 }]],
  }),
  16.222,
  "An L-shape ignores a stale polygon and subtracts its holes like every other shape."
);
const lShapePlan = buildPlanRoomSummary([
  { id: "l_room", name: "L Living", roomType: "living", shape: "l_shape", x: 1, z: 2, w: 5, d: 4 },
]);
assert.deepEqual(
  [lShapePlan.widthMeters, lShapePlan.depthMeters, lShapePlan.areaSquareMeters, lShapePlan.rooms[0].areaSquareMeters],
  [5, 4, 16.472, 16.472],
  "The plan summary keeps an L-shape's bounding dimensions and reports the area without the notch."
);
assert.equal(
  formatPlanRoomMetricLabel(lShapePlan.rooms[0], "cm"),
  "500 cm × 400 cm · 16.5 m²",
  "The plan summary card must show the L-shape area without the notch."
);
// Every copy of the L-shape outline must cut the notch the floor-area owner subtracts.
for (const file of [
  "components/editor/renderers/house-plan-3d/geometry.ts",
  "components/editor/renderers/RoomRenderer2D.tsx",
  "lib/room-renderer-2d-walls.ts",
  "lib/floor-plan-types.ts",
  "lib/design-page-geometry.ts",
  "lib/design-page-house-plan.ts",
  "lib/catalog-placement.ts",
]) {
  const notchRatios = [...readFileSync(join(process.cwd(), file), "utf8").matchAll(
    /const notchW = [\w.]+ \* ([\d.]+);\s*const notchD = [\w.]+ \* ([\d.]+);/g
  )].flatMap((match) => [Number(match[1]), Number(match[2])]);
  assert.ok(notchRatios.length > 0, `${file} must still draw the L-shape notch from width and depth.`);
  for (const ratio of notchRatios) {
    assert.equal(ratio, L_SHAPE_NOTCH_RATIO, `${file} must cut the L-shape notch at L_SHAPE_NOTCH_RATIO.`);
  }
}
// Client-facing plan drawings label rooms with this area, so they draw the notched house-plan outline.
for (const file of ["app/share/[shareToken]/export/page.tsx", "components/ShareFloorPlanPreview.tsx"]) {
  const drawingSource = readFileSync(join(process.cwd(), file), "utf8");
  assert.match(drawingSource, /getHouseRoomPlanPolygon\(room\)/, `${file} must draw rooms with the shared house-plan outline.`);
  assert.doesNotMatch(
    drawingSource,
    /room\.shape === "custom_polygon"/,
    `${file} must not keep a private room outline that drops the L-shape notch.`
  );
}
assert.doesNotMatch(
  planRoomSummarySource,
  /function polygonArea|function getRoomArea\b/,
  "The plan summary must read room area from lib/room-floor-area.ts."
);
// Every consumer-facing room floor-area readout reads lib/room-floor-area.ts
// (directly, or through the SurfaceRoomSummary.floorAreaSqm it projects).
const roomAreaReadouts: Array<[string, RegExp]> = [
  ["components/editor/DesignControlsPlanPanel.tsx",
    /const activeRoomArea = getActiveSurfaceRoomFloorAreaSqm\(surfaceRooms, activeRoomId\);[\s\S]*?<ConsumerRoomSetupCard[\s\S]*?activeRoomFloorAreaSqm=\{activeRoomArea\}/],
  ["components/editor/DesignControlsAiPanel.tsx", /roomFloorAreaSqm: roomArea,/],
  ["components/editor/ConsumerRoomSetupCard.tsx", /roomFloorAreaSqm=\{activeRoomFloorAreaSqm\}/],
  ["components/editor/ConsumerMeasurementPreferenceRegion.tsx",
    /formatDisplayArea\(hasRooms \? roomFloorAreaSqm : \(widthMm \* depthMm\) \/ 1_000_000, measurementUnit\)/],
  ["components/editor/DesignControlsPanel.tsx",
    /roomFloorAreaSqm=\{getActiveSurfaceRoomFloorAreaSqm\(surfaceRooms, activeRoomId\)\}/],
  ["lib/design-page-viewport-workspace-read-model.ts",
    /activeRoomFloorAreaSqm: getActiveSurfaceRoomFloorAreaSqm\(\s*roomRead\.surfaceRoomSummaries,/],
  ["components/editor/FloorPropertiesPanel.tsx", /formatDisplayArea\(activeRoomFloorAreaSqm, measurementUnit\)/],
  ["lib/useDesignPageSelectionInspectorModel.ts",
    /room · \$\{formatDisplayArea\(getPlanRoomFloorAreaSqm\(selectedPlanRoom\), planMeasurementUnit\)\}/],
  ["lib/useDesignPageSurfaceInspector.ts",
    /Room area \$\{formatDisplayArea\(getPlanRoomFloorAreaSqm\(selectedPlanRoom\), planMeasurementUnit\)\}/],
  ["lib/floor-plan-quality.ts", /Number\(getPlanRoomFloorAreaSqm\(room\)\.toFixed\(2\)\)/],
  ["components/editor/renderers/RoomRenderer2D.tsx",
    /\{formatDisplayArea\(getPlanRoomFloorAreaSqm\(room\), measurementUnit\)\}/],
  ["app/share/[shareToken]/page.tsx", /const areaSqm = getRoomSnapshotFloorAreaSqm\(room\);/],
  ["app/share/[shareToken]/export/page.tsx", /const areaSqm = getRoomSnapshotFloorAreaSqm\(room\);/],
  ["app/share/[shareToken]/export/pdf/route.ts", /const areaSqm = getRoomSnapshotFloorAreaSqm\(room\);/],
];
for (const [file, ownerRead] of roomAreaReadouts) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  assert.match(source, ownerRead, `${file} must read room floor area from lib/room-floor-area.ts.`);
  assert.doesNotMatch(
    source,
    /roomWidth \* roomDepth|\.w \* [a-zA-Z]+\.d\b|geometry\.width \* [a-zA-Z]+\.geometry\.depth|function getPolygonArea/,
    `${file} must not compute a room floor area as width × depth or with a private polygon helper.`
  );
}

const fiveByFour = { widthMeters: 5, depthMeters: 4, areaSquareMeters: 20 };
assert.equal(
  formatPlanRoomMetricLabel(fiveByFour, "cm"),
  "500 cm × 400 cm · 20.0 m²",
  "Plan summary dimensions should follow a metric display-unit preference."
);
assert.equal(
  formatPlanRoomMetricLabel(fiveByFour, "ft-in"),
  "16′ 4.9″ × 13′ 1.5″ · 215.3 ft²",
  "Plan summary dimensions should show feet/inches and ft² in ft+in mode."
);
assert.equal(
  formatPlanRoomMetricLabel(fiveByFour, "in"),
  "196.85 in × 157.48 in · 215.3 ft²",
  "Plan summary dimensions should show inches and ft² in inch mode."
);
for (const pattern of [
  /formatPlanRoomMetricLabel\(wholePlan, configuration\.measurementUnit\)/,
  /formatPlanRoomMetricLabel\(selection, configuration\.measurementUnit\)/,
  /formatPlanRoomMetricLabel\(room, configuration\.measurementUnit\)/,
]) {
  assert.match(summaryCardSource, pattern, "Every plan summary measurement should use the display-unit label.");
}
assert.doesNotMatch(summaryCardSource, / m²|\} m</, "The plan summary card must not hard-code metric units.");
assert.equal(
  formatPlanDimensionsLabel(4.2, 4.8, "cm"),
  "420 cm × 480 cm",
  "Plan panel room dimensions should follow a metric display-unit preference."
);
assert.equal(
  formatPlanDimensionsLabel(4.2, 4.8, "ft-in"),
  "13′ 9.4″ × 15′ 9.0″",
  "Plan panel room dimensions should show feet/inches in ft+in mode."
);
assert.doesNotMatch(
  planPanelSource,
  /\.toFixed\(\d\)\}?\s?(?:m2|m²|sqm|m)(?![A-Za-z0-9])|\}\s?(?:m2|m²|sqm)(?![A-Za-z0-9])|\{template\.(?:width|depth)\}/,
  "Plan panel lengths and areas must use the display-unit formatters, not hard-coded metres."
);

assert.deepEqual(resolvePlanRoomSelection([], "living", false), {
  ids: ["living"],
  primaryId: "living",
});
assert.deepEqual(resolvePlanRoomSelection(["living"], "services", true), {
  ids: ["living", "services"],
  primaryId: "services",
});
assert.deepEqual(
  resolvePlanRoomSelection(["living", "services"], "services", true),
  { ids: ["living"], primaryId: "living" }
);
assert.deepEqual(resolvePlanRoomSelection(["living"], "living", true), {
  ids: [],
  primaryId: null,
});

assert.match(
  roomRendererSource,
  /function HouseRoomComparisonOverlay2D\([\s\S]*?<meshBasicMaterial[\s\S]*?depthTest=\{false\}[\s\S]*?<Line[\s\S]*?depthTest=\{false\}[\s\S]*?renderOrder=\{18\}/,
  "Selected rooms should receive a dedicated fill and high-priority outline that cannot be hidden by structural rendering."
);
assert.match(
  roomRendererSource,
  /\{isSelectedRoom && !isDraggingRoom && \(\s*<HouseRoomComparisonOverlay2D room=\{room\} active=\{isActiveRoom\} \/>\s*\)\}/,
  "Every selected room should receive the independent comparison overlay."
);
assert.match(
  roomRendererSource,
  /data-selection-visual=\{isSelectedRoom \? "comparison" : "none"\}[\s\S]*?data-testid="house-room-2d-selection-badge"/,
  "Selected room labels should expose a visible, testable comparison badge."
);

console.log("Plan room summary checks passed.");
