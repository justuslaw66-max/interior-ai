import assert from "node:assert/strict";
import {
  buildHousePlan2D,
  buildHouseRoomAdjacencyGuides,
  buildHouseRoomConnectionChecklist,
  buildHouseRoomDoorwaySuggestions,
  clampRoomDimension,
  doesHouseRoomOverlap,
  getActiveRoomPlanOffset,
  getNextRoomPlanPosition,
  resolveFloorPlanDrawCancelDecision,
  resolvePlanFitZoom,
  resolveHouseRoomSnapPreview,
  resolveNewRoomName,
  roundPlanCoordinate,
  shouldReplaceStarterRoomWithDrawnRoom,
  snapHouseRoomMove,
} from "@/lib/design-page-house-plan";
import {
  clampPlanOpeningMetrics,
  movePlanOpening,
  updatePlanOpeningMetrics,
} from "@/lib/design-page-plan-overlays";
import {
  isWallFacingCamera,
  isWallBetweenCameraAndTarget,
  isWallOnCameraSideOfTarget,
  resolveDominantCameraCutawayWall,
  resolveCutawayWallOpacity,
} from "@/lib/design-page-wall-cutaway";
import type { RoomSnapshot } from "@/lib/room-types";

function makeRoom(
  id: string,
  name: string,
  width: number,
  depth: number,
  planPosition?: { x: number; z: number }
): RoomSnapshot {
  return {
    id,
    name,
    roomType: id.includes("bed") ? "bedroom" : "living",
    geometry: { width, depth, wallThickness: 0.12 },
    planPosition,
    planShape: "rectangle",
    items: [],
    zones: [],
    savedViews: [],
  };
}

const living = makeRoom("living", "Living Room", 5, 4, { x: 0, z: 0 });
const bedroom = makeRoom("bedroom", "Bedroom", 4, 3);

const plan = buildHousePlan2D([living, bedroom], 5, 4);
assert.equal(plan.rooms.length, 2);
assert.deepEqual(plan.rooms[0], {
  id: "living",
  name: "Living Room",
  roomType: "living",
  shape: "rectangle",
  x: 0,
  z: 0,
  w: 5,
  d: 4,
});
assert.equal(plan.rooms[1].x, 4.5);
assert.equal(plan.width, 13);
assert.equal(plan.depth, 4);

assert.deepEqual(getActiveRoomPlanOffset(plan.rooms, "bedroom"), { x: 4.5, z: 0 });
assert.deepEqual(getActiveRoomPlanOffset(plan.rooms, "missing"), { x: 0, z: 0 });

assert.equal(resolveNewRoomName([living], "bedroom"), "Bedroom");
assert.equal(resolveNewRoomName([living, bedroom], "bedroom"), "Bedroom 2");

assert.deepEqual(getNextRoomPlanPosition(plan.rooms, 5, 3), { x: 8, z: 0 });

assert.deepEqual(
  resolveFloorPlanDrawCancelDecision({
    traceRoomMode: true,
    drawMode: "straight_wall",
    pointCount: 2,
  }),
  {
    shouldHandle: true,
    clearRoomPoints: true,
    clearRoomPreview: true,
    exitRoomDrawMode: false,
  }
);
assert.deepEqual(
  resolveFloorPlanDrawCancelDecision({
    traceRoomMode: true,
    drawMode: "rectangle_wall",
    pointCount: 1,
  }),
  {
    shouldHandle: true,
    clearRoomPoints: true,
    clearRoomPreview: true,
    exitRoomDrawMode: false,
  }
);
assert.deepEqual(
  resolveFloorPlanDrawCancelDecision({
    traceRoomMode: true,
    drawMode: "arc_wall",
    pointCount: 0,
  }),
  {
    shouldHandle: true,
    clearRoomPoints: true,
    clearRoomPreview: true,
    exitRoomDrawMode: true,
  }
);
assert.deepEqual(
  resolveFloorPlanDrawCancelDecision({
    traceRoomMode: false,
    drawMode: "straight_wall",
    pointCount: 0,
  }),
  {
    shouldHandle: false,
    clearRoomPoints: false,
    clearRoomPreview: false,
    exitRoomDrawMode: false,
  }
);

const singleRoomPlan = buildHousePlan2D([living], 5, 4);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: living,
    rooms: singleRoomPlan.rooms,
    x: 0,
    z: 0,
    w: 5,
    d: 4,
  }),
  true
);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: living,
    rooms: singleRoomPlan.rooms,
    x: 5,
    z: 0,
    w: 5,
    d: 4,
  }),
  false
);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: living,
    rooms: singleRoomPlan.rooms,
    x: 2.3,
    z: 0,
    w: 5,
    d: 4,
  }),
  false
);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: living,
    rooms: singleRoomPlan.rooms,
    x: 2,
    z: 0,
    w: 5,
    d: 4,
  }),
  true
);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: {
      ...living,
      items: [
        {
          instanceId: "item-1",
          productId: "chair",
          variantId: "default",
          position: [0, 0, 0],
        },
      ],
    },
    rooms: singleRoomPlan.rooms,
    x: 0,
    z: 0,
    w: 5,
    d: 4,
  }),
  false
);
assert.equal(
  shouldReplaceStarterRoomWithDrawnRoom({
    activeRoom: living,
    rooms: plan.rooms,
    x: 0,
    z: 0,
    w: 5,
    d: 4,
  }),
  false
);

const snapped = snapHouseRoomMove("bedroom", 4.68, 0, plan.rooms);
assert.deepEqual(snapped, { x: 4.5, z: 0 });
assert.deepEqual(snapHouseRoomMove("bedroom", 4.68, 0.24, plan.rooms), { x: 4.5, z: 0 });
assert.deepEqual(snapHouseRoomMove("bedroom", 4.68, -0.34, plan.rooms), { x: 4.5, z: -0.5 });
const snapPreview = resolveHouseRoomSnapPreview("bedroom", 4.68, 0, plan.rooms);
assert.equal(snapPreview?.x, 4.5);
assert.equal(snapPreview?.z, 0);
assert.equal(snapPreview?.targetRoomName, "Living Room");
assert.equal(snapPreview?.label, "Align to Living Room wall");
assert.deepEqual(snapPreview?.points, [
  [2.5, -1.5],
  [2.5, 1.5],
]);
assert.equal(resolveHouseRoomSnapPreview("missing", 1, 1, plan.rooms), null);
assert.equal(snapHouseRoomMove("missing", 1, 1, plan.rooms), null);
assert.equal(doesHouseRoomOverlap("bedroom", 4.5, 0, 4, 3, plan.rooms), false);
assert.equal(doesHouseRoomOverlap("bedroom", 1.5, 0, 4, 3, plan.rooms), true);
assert.deepEqual(snapHouseRoomMove("bedroom", 1.5, 0, plan.rooms), { x: 4.5, z: 0 });

const stackedPlan = buildHousePlan2D(
  [
    living,
    makeRoom("study", "Study", 5, 3, { x: 0, z: 3.5 }),
  ],
  5,
  4
);
assert.deepEqual(snapHouseRoomMove("study", 0.22, 3.66, stackedPlan.rooms), {
  x: 0,
  z: 3.5,
});
assert.deepEqual(buildHouseRoomAdjacencyGuides(plan.rooms), [
  {
    id: "living-bedroom-vertical-east-west",
    roomIds: ["living", "bedroom"],
    orientation: "vertical",
    points: [
      [2.5, -1.5],
      [2.5, 1.5],
    ],
    labelPosition: { x: 2.5, z: 0 },
    lengthMeters: 3,
  },
]);
assert.deepEqual(buildHouseRoomDoorwaySuggestions(plan.rooms, "bedroom"), [
  {
    id: "living-bedroom-vertical-east-west-bedroom-doorway",
    roomId: "bedroom",
    adjacentRoomId: "living",
    adjacentRoomName: "Living Room",
    wall: "west",
    offsetMeters: 0,
    widthMeters: 0.9,
    points: [
      [2.5, -1.5],
      [2.5, 1.5],
    ],
    labelPosition: { x: 2.5, z: 0 },
    label: "Add doorway",
  },
]);
assert.deepEqual(buildHouseRoomDoorwaySuggestions(plan.rooms, "living")[0], {
  id: "living-bedroom-vertical-east-west-living-doorway",
  roomId: "living",
  adjacentRoomId: "bedroom",
  adjacentRoomName: "Bedroom",
  wall: "east",
  offsetMeters: 0,
  widthMeters: 0.9,
  points: [
    [2.5, -1.5],
    [2.5, 1.5],
  ],
  labelPosition: { x: 2.5, z: 0 },
  label: "Add doorway",
});
assert.deepEqual(buildHouseRoomConnectionChecklist(plan.rooms, [], "bedroom"), [
  {
    id: "living-bedroom-vertical-east-west",
    roomIds: ["living", "bedroom"],
    roomNames: ["Living Room", "Bedroom"],
    sharedWallLengthMeters: 3,
    status: "needs_doorway",
    doorwaySuggestion: {
      id: "living-bedroom-vertical-east-west-bedroom-doorway",
      roomId: "bedroom",
      adjacentRoomId: "living",
      adjacentRoomName: "Living Room",
      wall: "west",
      offsetMeters: 0,
      widthMeters: 0.9,
      points: [
        [2.5, -1.5],
        [2.5, 1.5],
      ],
      labelPosition: { x: 2.5, z: 0 },
      label: "Add doorway",
    },
  },
]);
assert.deepEqual(
  buildHouseRoomConnectionChecklist(
    plan.rooms,
    [
      {
        roomId: "bedroom",
        wall: "west",
        offsetMm: 0,
        widthMm: 900,
        kind: "door",
      },
    ],
    "bedroom"
  ),
  [
    {
      id: "living-bedroom-vertical-east-west",
      roomIds: ["living", "bedroom"],
      roomNames: ["Living Room", "Bedroom"],
      sharedWallLengthMeters: 3,
      status: "connected",
      doorwaySuggestion: undefined,
    },
  ]
);
assert.deepEqual(
  clampPlanOpeningMetrics(
    {
      id: "opening-oversized",
      roomId: "bedroom",
      wall: "west",
      kind: "door",
      offsetMm: 5000,
      widthMm: 4000,
    },
    {
      rooms: plan.rooms,
      planWidthMeters: plan.width,
      planDepthMeters: plan.depth,
    }
  ),
  {
    id: "opening-oversized",
    roomId: "bedroom",
    wall: "west",
    kind: "door",
    offsetMm: 0,
    widthMm: 2940,
  }
);
assert.deepEqual(
  updatePlanOpeningMetrics(
    [
      {
        id: "opening-editable",
        roomId: "bedroom",
        wall: "west",
        kind: "door",
        offsetMm: 0,
        widthMm: 900,
      },
    ],
    "opening-editable",
    { widthMeters: 1.1, offsetMeters: 0.2 },
    {
      rooms: plan.rooms,
      planWidthMeters: plan.width,
      planDepthMeters: plan.depth,
    }
  ),
  [
    {
      id: "opening-editable",
      roomId: "bedroom",
      wall: "west",
      kind: "door",
      offsetMm: 200,
      widthMm: 1100,
    },
  ]
);
assert.deepEqual(
  movePlanOpening(
    [
      {
        id: "opening-move",
        roomId: "bedroom",
        wall: "west",
        kind: "door",
        offsetMm: 0,
        widthMm: 1100,
      },
    ],
    "opening-move",
    5,
    {
      rooms: plan.rooms,
      planWidthMeters: plan.width,
      planDepthMeters: plan.depth,
    }
  ),
  [
    {
      id: "opening-move",
      roomId: "bedroom",
      wall: "west",
      kind: "door",
      offsetMm: 920,
      widthMm: 1100,
    },
  ]
);
assert.equal(
  isWallFacingCamera({
    cameraX: 0,
    cameraZ: -3,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    wall: "north",
  }),
  true
);
assert.equal(
  isWallFacingCamera({
    cameraX: 0,
    cameraZ: -3,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    wall: "south",
  }),
  false
);
assert.equal(
  resolveCutawayWallOpacity({
    cameraX: 4,
    cameraZ: -3,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    wall: "east",
    baseOpacity: 1,
  }),
  0.08
);
assert.equal(
  isWallBetweenCameraAndTarget({
    cameraX: 8,
    cameraZ: 0,
    targetX: 0,
    targetZ: 0,
    targetWidth: 5,
    targetDepth: 4,
    roomX: 4.5,
    roomZ: 0,
    roomWidth: 4,
    roomDepth: 3,
    wall: "west",
    wallCenterX: 2.5,
    wallCenterZ: 0,
    wallAxis: "z",
    wallLength: 3,
    baseOpacity: 1,
  }),
  true
);
assert.equal(
  isWallOnCameraSideOfTarget({
    cameraX: 0,
    cameraZ: 8,
    targetX: 0,
    targetZ: 0,
    targetWidth: 5,
    targetDepth: 4,
    roomX: 0,
    roomZ: 3,
    roomWidth: 5,
    roomDepth: 3,
    wallCenterX: 0,
    wallCenterZ: 2.6,
    wallAxis: "x",
    wallLength: 5,
    baseOpacity: 1,
  }),
  true
);
assert.equal(
  resolveCutawayWallOpacity({
    cameraX: 8,
    cameraZ: 0,
    targetX: 0,
    targetZ: 0,
    targetWidth: 5,
    targetDepth: 4,
    roomX: 4.5,
    roomZ: 0,
    roomWidth: 4,
    roomDepth: 3,
    wall: "west",
    wallCenterX: 2.5,
    wallCenterZ: 0,
    wallAxis: "z",
    wallLength: 3,
    baseOpacity: 1,
    cutawayOpacity: 0.04,
  }),
  0.04
);
assert.equal(
  resolveCutawayWallOpacity({
    cameraX: 8,
    cameraZ: 4,
    targetX: 0,
    targetZ: 0,
    targetWidth: 5,
    targetDepth: 4,
    roomX: 4.5,
    roomZ: 0,
    roomWidth: 4,
    roomDepth: 3,
    wall: "south",
    wallCenterX: 4.5,
    wallCenterZ: 1.5,
    wallAxis: "x",
    wallLength: 4,
    baseOpacity: 0.78,
    cutawayOpacity: 0,
  }),
  0
);
assert.equal(
  resolveDominantCameraCutawayWall({
    cameraX: 4,
    cameraZ: 5,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    eligibleWalls: ["south", "east", "north"],
  }),
  "south"
);
assert.equal(
  resolveDominantCameraCutawayWall({
    cameraX: 8,
    cameraZ: 0,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    eligibleWalls: ["south", "east", "north"],
  }),
  "east"
);
assert.equal(
  resolveDominantCameraCutawayWall({
    cameraX: -5,
    cameraZ: 4,
    roomX: 0,
    roomZ: 0,
    roomWidth: 5,
    roomDepth: 4,
    eligibleWalls: ["south", "east"],
  }),
  "south"
);
assert.equal(
  resolveCutawayWallOpacity({
    cameraX: 8,
    cameraZ: 0,
    roomX: 4.5,
    roomZ: 0,
    roomWidth: 4,
    roomDepth: 3,
    wall: "west",
    baseOpacity: 1,
    cutawayOpacity: 0.04,
    cutawayEligible: false,
  }),
  1
);
assert.equal(
  resolveCutawayWallOpacity({
    cameraX: 0,
    cameraZ: 0,
    roomX: 6,
    roomZ: 0,
    roomWidth: 4,
    roomDepth: 3,
    wall: "east",
    baseOpacity: 0.78,
    cutawayOpacity: 0.04,
    forceCutaway: true,
  }),
  0.04
);
assert.deepEqual(
  buildHouseRoomAdjacencyGuides(
    buildHousePlan2D(
      [living, makeRoom("bedroom_far", "Bedroom Far", 4, 3, { x: 8, z: 0 })],
      5,
      4
    ).rooms
  ),
  []
);

assert.equal(clampRoomDimension(1), 1.8);
assert.equal(clampRoomDimension(25), 20);
assert.equal(clampRoomDimension(6.25), 6.25);
assert.equal(roundPlanCoordinate(1.23456), 1.235);
assert.equal(
  resolvePlanFitZoom({
    viewportWidthPx: 1200,
    viewportHeightPx: 800,
    planWidthMeters: 10,
    planDepthMeters: 6,
  }),
  1200 / 11.2
);
assert.equal(
  resolvePlanFitZoom({
    viewportWidthPx: 1200,
    viewportHeightPx: 800,
    planWidthMeters: 100,
    planDepthMeters: 100,
  }),
  24
);
assert.equal(
  resolvePlanFitZoom({
    viewportWidthPx: 1200,
    viewportHeightPx: 800,
    planWidthMeters: 1,
    planDepthMeters: 1,
  }),
  220
);

console.log("Design page house-plan helper checks passed.");
