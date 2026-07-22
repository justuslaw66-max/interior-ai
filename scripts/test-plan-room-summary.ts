import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  buildPlanRoomSummary,
  resolvePlanRoomSelection,
} from "@/lib/plan-room-summary";

const roomRendererSource = readFileSync(
  join(process.cwd(), "components/editor/renderers/RoomRenderer2D.tsx"),
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
