import assert from "node:assert/strict";
import {
  clampToRoom,
  isFootprintInsideRoomPolygon,
  isPointInsideRoomPolygon,
} from "@/lib/design-page-geometry";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import {
  lockFloorPlanWallDrawAngle,
  resolveOpeningPlacementFromPoint,
  resolveExactWallDrawPoint,
  resolveArcWallDrawPreview,
  resolveClosedWallDrawRectangle,
  resolveClosedWallDrawRoom,
  resolveRoomDrawPreview,
  resolveTracedOpening,
  resolveTracedOpeningPreview,
  resolveTracedRoomRectangle,
  snapFloorPlanPointForWallDraw,
  snapFloorPlanPointForRoomDraw,
  snapFloorPlanPointToRoomEdges,
  snapFloorPlanPointToGrid,
  validateTracedOpeningPlacement,
} from "@/lib/floor-plan-tracing";
import {
  buildFloorPlanFromDesignSnapshot,
  buildFloorPlanFromRooms,
  buildFloorPlanRoomPolygon,
  calculateFloorPlanPolygonAreaSqm,
} from "@/lib/floor-plan-types";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";

function makeRoom(
  id: string,
  name: string,
  width: number,
  depth: number,
  x: number,
  z: number,
  planShape: RoomSnapshot["planShape"] = "rectangle"
): RoomSnapshot {
  return {
    id,
    name,
    roomType: id.includes("bed") ? "bedroom" : "living",
    geometry: { width, depth, wallThickness: 0.12, height: 2.6 },
    planPosition: { x, z },
    planShape,
    items: [],
    zones: [],
    savedViews: [],
  };
}

const living = makeRoom("living", "Living Room", 5, 4, 0, 0);
const bedroom = makeRoom("bedroom", "Bedroom", 4, 4, 4.5, 0);
const plan = buildFloorPlanFromRooms([living, bedroom]);
const floor = plan.floors[0];

assert.equal(plan.version, 1);
assert.equal(plan.units, "m");
assert.equal(plan.activeFloorId, "floor_1");
assert.equal(plan.activeRoomId, "floor_1_room_living");
assert.equal(floor.rooms.length, 2);
assert.equal(floor.walls.length, 7);
assert.equal(floor.openings.length, 0);
assert.equal(floor.underlays.length, 0);

const livingPlanRoom = floor.rooms.find((room) => room.sourceRoomId === "living");
assert.ok(livingPlanRoom);
assert.equal(livingPlanRoom.areaSqm, 20);
assert.deepEqual(livingPlanRoom.polygon, [
  { x: -2.5, z: -2 },
  { x: 2.5, z: -2 },
  { x: 2.5, z: 2 },
  { x: -2.5, z: 2 },
]);

const sharedWall = floor.walls.find((wall) => wall.roomIds.length === 2);
assert.ok(sharedWall);
assert.deepEqual(sharedWall.roomIds, ["bedroom", "living"]);
assert.deepEqual(sharedWall.start, { x: 2.5, z: -2 });
assert.deepEqual(sharedWall.end, { x: 2.5, z: 2 });

const lRoom = makeRoom("living_l", "L Living", 5, 4, 0, 0, "l_shape");
const lPolygon = buildFloorPlanRoomPolygon(lRoom);
assert.equal(lPolygon.length, 6);
assert.equal(calculateFloorPlanPolygonAreaSqm(lPolygon), 16.472);

const customRoom = makeRoom("custom_plan", "Custom Plan", 4, 3, 2, 1.5, "custom_polygon");
customRoom.planPolygon = [
  { x: -2, z: -1.5 },
  { x: 2, z: -1.5 },
  { x: 2, z: 1.5 },
  { x: 0, z: 1.5 },
  { x: 0, z: -0.5 },
  { x: -2, z: -0.5 },
];
assert.deepEqual(buildFloorPlanRoomPolygon(customRoom), [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 2, z: 3 },
  { x: 2, z: 1 },
  { x: 0, z: 1 },
]);
assert.equal(calculateFloorPlanPolygonAreaSqm(buildFloorPlanRoomPolygon(customRoom)), 8);
assert.equal(
  isPointInsideRoomPolygon({ x: 1, z: 2 }, buildFloorPlanRoomPolygon(customRoom)),
  false
);
assert.equal(
  isPointInsideRoomPolygon({ x: 1, z: 0.5 }, buildFloorPlanRoomPolygon(customRoom)),
  true
);

const localCustomPolygon = customRoom.planPolygon ?? [];
assert.deepEqual(
  clampToRoom(0.8, -0.9, 0.6, 0.5, 4, 3, 0.12, 0, "custom_polygon", localCustomPolygon),
  [0.8, -0.9]
);
const clampedFromNotch = clampToRoom(
  -1,
  0.8,
  0.6,
  0.5,
  4,
  3,
  0.12,
  0,
  "custom_polygon",
  localCustomPolygon
);
assert.ok(
  isFootprintInsideRoomPolygon(
    clampedFromNotch[0],
    clampedFromNotch[1],
    0.6 / 2 + 0.12,
    0.5 / 2 + 0.12,
    localCustomPolygon
  )
);
assert.notDeepEqual(clampedFromNotch, [-1, 0.8]);

const snapshot: DesignSnapshot = {
  version: 3,
  rooms: [living, bedroom],
  activeRoomId: "bedroom",
};
const snapshotPlan = buildFloorPlanFromDesignSnapshot(snapshot);
assert.equal(snapshotPlan.activeRoomId, "floor_1_room_bedroom");

const persistedSnapshot: DesignSnapshot = {
  ...snapshot,
  floorPlan: {
    underlay: {
      id: "underlay_1",
      floorId: "floor_1",
      name: "architect-plan.png",
      assetUrl: "data:image/png;base64,abc",
      mimeType: "image/png",
      widthPx: 1200,
      heightPx: 900,
      position: { x: 0, z: 0 },
      widthMeters: 6,
      depthMeters: 4.5,
      opacity: 0.45,
      rotationDeg: 0,
      locked: true,
      calibration: {
        pixelsPerMeter: 200,
        referenceLengthMeters: 2,
        referencePointsPx: [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
        ],
      },
    },
    openings: [
      {
        id: "opening_1",
        roomId: "living",
        wall: "north",
        kind: "door",
        offsetMm: 0,
        widthMm: 900,
      },
    ],
  },
};
const storedSnapshot = snapshotToStored(persistedSnapshot);
assert.equal(storedSnapshot.floorPlan?.underlay?.name, "architect-plan.png");
assert.equal(storedSnapshot.floorPlan?.openings?.[0]?.roomId, "living");
const restoredSnapshot = storedToSnapshot(storedSnapshot);
assert.equal(restoredSnapshot.floorPlan?.underlay?.calibration?.pixelsPerMeter, 200);
assert.equal(restoredSnapshot.floorPlan?.openings?.[0]?.kind, "door");

const underlay: FloorPlanUnderlay = {
  id: "underlay",
  floorId: "floor_1",
  name: "plan.png",
  assetUrl: "blob:plan",
  mimeType: "image/png",
  widthPx: 1000,
  heightPx: 500,
  position: { x: 0, z: 0 },
  widthMeters: 10,
  depthMeters: 5,
  opacity: 0.45,
  rotationDeg: 0,
  locked: true,
};
const calibrated = applyFloorPlanScaleCalibration({
  underlay,
  points: [
    { x: -5, z: 0 },
    { x: 5, z: 0 },
  ],
  referenceLengthMeters: 5,
});
assert.ok(calibrated);
assert.equal(calibrated.calibration?.pixelsPerMeter, 200);
assert.equal(calibrated.widthMeters, 5);
assert.equal(calibrated.depthMeters, 2.5);
assert.equal(
  applyFloorPlanScaleCalibration({
    underlay,
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ],
    referenceLengthMeters: 5,
  }),
  null
);

assert.deepEqual(
  resolveTracedRoomRectangle([
    { x: -2, z: -1 },
    { x: 3, z: 2 },
  ]),
  {
    x: 0.5,
    z: 0.5,
    width: 5,
    depth: 3,
  }
);
assert.deepEqual(
  resolveTracedRoomRectangle([
    { x: 3, z: 2 },
    { x: -2, z: -1 },
  ]),
  {
    x: 0.5,
    z: 0.5,
    width: 5,
    depth: 3,
  }
);
assert.equal(
  resolveTracedRoomRectangle([
    { x: 0, z: 0 },
    { x: 1, z: 1 },
  ]),
  null
);
assert.deepEqual(snapFloorPlanPointToGrid({ x: 1.234, z: -0.944 }), {
  x: 1.2,
  z: -0.9,
});
assert.deepEqual(
  snapFloorPlanPointToRoomEdges(
    { x: 2.62, z: -1.86 },
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ]
  ),
  {
    x: 2.5,
    z: -2,
  }
);
assert.deepEqual(
  snapFloorPlanPointForRoomDraw(
    { x: 2.56, z: 2.04 },
    {
      rooms: [
        {
          id: "living",
          name: "Living Room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: 5,
          d: 4,
        },
      ],
    }
  ),
  {
    x: 2.5,
    z: 2,
  }
);
assert.deepEqual(
  snapFloorPlanPointForRoomDraw(
    { x: 2.78, z: -2.22 },
    {
      rooms: [
        {
          id: "living",
          name: "Living Room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: 5,
          d: 4,
        },
      ],
    }
  ),
  {
    x: 2.5,
    z: -2,
  }
);
assert.deepEqual(
  snapFloorPlanPointForRoomDraw(
    { x: 2.79, z: 0.74 },
    {
      rooms: [
        {
          id: "living",
          name: "Living Room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: 5,
          d: 4,
        },
      ],
    }
  ),
  {
    x: 2.5,
    z: 0.7,
  }
);
assert.deepEqual(
  resolveRoomDrawPreview(
    { x: -2.04, z: -1.03 },
    { x: 3.04, z: 2.06 }
  ),
  {
    start: { x: -2, z: -1 },
    end: { x: 3, z: 2.1 },
    width: 5,
    depth: 3.1,
    areaSqm: 15.5,
    rectangle: {
      x: 0.5,
      z: 0.55,
      width: 5,
      depth: 3.1,
    },
  }
);
assert.deepEqual(
  resolveRoomDrawPreview(
    { x: 2.54, z: -2.01 },
    { x: 6.51, z: 1.98 },
    {
      rooms: [
        {
          id: "living",
          name: "Living Room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: 5,
          d: 4,
        },
      ],
    }
  ).start,
  { x: 2.5, z: -2 }
);
assert.equal(
  resolveRoomDrawPreview(
    { x: 0, z: 0 },
    { x: 1, z: 1 }
  ).rectangle,
  null
);

const arcPreview = resolveArcWallDrawPreview(
  { x: -2, z: 0 },
  { x: 2, z: 2 }
);
assert.equal(arcPreview.width, 4);
assert.equal(arcPreview.depth, 2);
assert.equal(arcPreview.angleDeg, 180);
assert.ok(arcPreview.arcLengthMeters > 4);
assert.equal(arcPreview.resolvedRoom?.shape, "custom_polygon");
assert.equal(arcPreview.resolvedRoom?.bounds.width, 4);
assert.equal(arcPreview.resolvedRoom?.bounds.depth, 2);
assert.ok((arcPreview.resolvedRoom?.planPolygon?.length ?? 0) > 12);

assert.deepEqual(
  snapFloorPlanPointForWallDraw(
    { x: 2.78, z: -2.22 },
    {
      rooms: [
        {
          id: "living",
          name: "Living Room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: 5,
          d: 4,
        },
      ],
    }
  ),
  {
    x: 2.5,
    z: -2,
  }
);
assert.deepEqual(
  snapFloorPlanPointForWallDraw(
    { x: 6.03, z: -1.91 },
    {
      previousPoint: { x: 2.5, z: -2 },
      firstPoint: { x: 2.5, z: -2 },
      pointCount: 1,
    }
  ),
  {
    x: 6,
    z: -2,
  }
);
assert.deepEqual(
  lockFloorPlanWallDrawAngle({ x: 4.2, z: 1.1 }, { x: 0, z: 0 }, "free"),
  { x: 4.2, z: 1.1 }
);
assert.deepEqual(
  lockFloorPlanWallDrawAngle({ x: 4.2, z: 1.1 }, { x: 0, z: 0 }, "ortho"),
  { x: 4.2, z: 0 }
);
assert.deepEqual(
  lockFloorPlanWallDrawAngle({ x: 1.1, z: 4.2 }, { x: 0, z: 0 }, "ortho"),
  { x: 0, z: 4.2 }
);
assert.deepEqual(
  lockFloorPlanWallDrawAngle({ x: 3, z: 2.6 }, { x: 0, z: 0 }, "forty_five"),
  { x: 2.807, z: 2.807 }
);
assert.deepEqual(
  resolveExactWallDrawPoint({
    previousPoint: { x: 0, z: 0 },
    previewPoint: { x: 3, z: 4 },
    lengthMeters: 2.5,
  }),
  { x: 1.5, z: 2 }
);
assert.deepEqual(
  resolveExactWallDrawPoint({
    previousPoint: { x: 0, z: 0 },
    previewPoint: { x: 3, z: 1 },
    lengthMeters: 3.5,
    angleLockMode: "ortho",
  }),
  { x: 3.5, z: 0 }
);
assert.deepEqual(
  resolveExactWallDrawPoint({
    previousPoint: { x: 0, z: 0 },
    previewPoint: { x: 3, z: 2.6 },
    lengthMeters: 2,
    angleLockMode: "forty_five",
  }),
  { x: 1.414, z: 1.414 }
);
assert.deepEqual(
  resolveExactWallDrawPoint({
    previousPoint: { x: 2, z: 0 },
    previousSegmentStart: { x: 0, z: 0 },
    lengthMeters: 3,
  }),
  { x: 5, z: 0 }
);
assert.equal(
  resolveExactWallDrawPoint({
    previousPoint: { x: 0, z: 0 },
    lengthMeters: 0,
  }),
  null
);
assert.deepEqual(
  snapFloorPlanPointForWallDraw(
    { x: 6.2, z: -0.8 },
    {
      previousPoint: { x: 2.5, z: -2 },
      firstPoint: { x: 2.5, z: -2 },
      pointCount: 1,
      angleLockMode: "ortho",
    }
  ),
  {
    x: 6.2,
    z: -2,
  }
);
assert.deepEqual(
  resolveClosedWallDrawRectangle([
    { x: 2.5, z: -2 },
    { x: 6, z: -2 },
    { x: 6, z: 1.5 },
    { x: 2.5, z: 1.5 },
    { x: 2.5, z: -2 },
  ]),
  {
    x: 4.25,
    z: -0.25,
    width: 3.5,
    depth: 3.5,
  }
);
assert.deepEqual(
  resolveClosedWallDrawRoom([
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 2, z: 3 },
    { x: 2, z: 1 },
    { x: 0, z: 1 },
    { x: 0, z: 0 },
  ]),
  {
    bounds: {
      x: 2,
      z: 1.5,
      width: 4,
      depth: 3,
    },
    shape: "custom_polygon",
    planPolygon: [
      { x: -2, z: -1.5 },
      { x: 2, z: -1.5 },
      { x: 2, z: 1.5 },
      { x: 0, z: 1.5 },
      { x: 0, z: -0.5 },
      { x: -2, z: -0.5 },
    ],
  }
);
assert.equal(
  resolveClosedWallDrawRectangle([
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 2, z: 3 },
    { x: 2, z: 1 },
    { x: 0, z: 1 },
    { x: 0, z: 0 },
  ]),
  null
);

assert.deepEqual(
  resolveTracedOpening(
    [
      { x: -0.45, z: -2 },
      { x: 0.45, z: -2 },
    ],
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "door"
  ),
  {
    roomId: "living",
    wall: "north",
    kind: "door",
    offsetMm: 0,
    widthMm: 900,
  }
);
assert.deepEqual(
  resolveTracedOpeningPreview(
    [
      { x: -0.45, z: -2 },
      { x: 0.45, z: -2 },
    ],
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "door"
  ),
  {
    status: "valid",
    label: "Door snaps to north wall",
    segment: [
      { x: -0.45, z: -2 },
      { x: 0.45, z: -2 },
    ],
    labelPosition: { x: 0, z: -2 },
    opening: {
      roomId: "living",
      wall: "north",
      kind: "door",
      offsetMm: 0,
      widthMm: 900,
    },
  }
);
assert.deepEqual(
  resolveOpeningPlacementFromPoint(
    { x: 0.2, z: -1.92 },
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "door"
  ),
  {
    status: "valid",
    label: "Door snaps to north wall",
    segment: [
      { x: -0.25, z: -2 },
      { x: 0.65, z: -2 },
    ],
    labelPosition: { x: 0.2, z: -2 },
    opening: {
      roomId: "living",
      wall: "north",
      kind: "door",
      offsetMm: 200,
      widthMm: 900,
    },
  }
);
assert.deepEqual(
  resolveOpeningPlacementFromPoint(
    { x: 0, z: 0 },
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "window"
  ),
  {
    status: "invalid",
    label: "Click closer to a wall",
    segment: [
      { x: -0.6, z: 0 },
      { x: 0.6, z: 0 },
    ],
    labelPosition: { x: 0, z: 0 },
    opening: null,
    reason: "opening_too_wide",
  }
);
assert.deepEqual(
  resolveTracedOpening(
    [
      { x: 2.5, z: -0.6 },
      { x: 2.5, z: 0.6 },
    ],
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "window"
  ),
  {
    roomId: "living",
    wall: "east",
    kind: "window",
    offsetMm: 0,
    widthMm: 1200,
  }
);
assert.equal(
  resolveTracedOpening(
    [
      { x: 0, z: 0 },
      { x: 0.2, z: 0 },
    ],
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    "door"
  ),
  null
);
assert.deepEqual(
  validateTracedOpeningPlacement(
    {
      roomId: "living",
      wall: "north",
      kind: "door",
      offsetMm: -2200,
      widthMm: 900,
    },
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ]
  ),
  {
    valid: false,
    reason: "too_close_to_corner",
    label: "Too close to corner",
  }
);
assert.deepEqual(
  validateTracedOpeningPlacement(
    {
      roomId: "living",
      wall: "north",
      kind: "window",
      offsetMm: 500,
      widthMm: 1200,
    },
    [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        x: 0,
        z: 0,
        w: 5,
        d: 4,
      },
    ],
    [
      {
        id: "opening-existing",
        roomId: "living",
        wall: "north",
        offsetMm: 0,
        widthMm: 900,
      },
    ]
  ),
  {
    valid: false,
    reason: "too_close_to_opening",
    label: "Too close to another opening",
  }
);

console.log("Floor plan foundation checks passed.");
