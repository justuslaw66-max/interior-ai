import assert from "node:assert/strict";
import {
  clampToRoom,
  isFootprintInsideRoomPolygon,
  isPointInsideRoomPolygon,
} from "@/lib/design-page-geometry";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import {
  HOUSE_PLAN_TEMPLATES,
  resolveFloorPlanOpeningCancelDecision,
} from "@/lib/design-page-house-plan";
import {
  clampFloorPatternScale,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
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
import { legacyApiToSnapshot, snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import type { DesignItem, DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
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

assert.equal(normalizeFloorRotationDeg(450), 90);
assert.equal(normalizeFloorRotationDeg(-90), 270);
assert.equal(normalizeFloorRotationDeg(44), 0);
assert.equal(normalizeFloorRotationDeg(46), 90);
assert.equal(clampFloorPatternScale(0.1), 0.5);
assert.equal(clampFloorPatternScale(2.9), 2);
assert.equal(clampFloorPatternScale(null), 1);

for (const template of HOUSE_PLAN_TEMPLATES) {
  assert.ok(template.rooms.length >= 1, `${template.id} should include at least one room`);
  assert.ok(template.bestFor.length > 0, `${template.id} should describe who it is best for`);
  assert.ok(template.tags.length >= 3, `${template.id} should include useful tags`);
  assert.ok(template.zones.length >= 3, `${template.id} should include starter furniture zones`);
  assert.ok(template.doorways.length >= Math.max(1, template.rooms.length - 2), `${template.id} should include automatic doorway specs`);
  assert.equal(
    new Set(template.rooms.map((room) => room.id)).size,
    template.rooms.length,
    `${template.id} should use unique room ids`
  );

  for (let firstIndex = 0; firstIndex < template.rooms.length; firstIndex += 1) {
    const first = template.rooms[firstIndex];
    const firstBounds = {
      left: first.x - first.width / 2,
      right: first.x + first.width / 2,
      top: first.z - first.depth / 2,
      bottom: first.z + first.depth / 2,
    };

    for (let secondIndex = firstIndex + 1; secondIndex < template.rooms.length; secondIndex += 1) {
      const second = template.rooms[secondIndex];
      const secondBounds = {
        left: second.x - second.width / 2,
        right: second.x + second.width / 2,
        top: second.z - second.depth / 2,
        bottom: second.z + second.depth / 2,
      };
      const overlapWidth =
        Math.min(firstBounds.right, secondBounds.right) -
        Math.max(firstBounds.left, secondBounds.left);
      const overlapDepth =
        Math.min(firstBounds.bottom, secondBounds.bottom) -
        Math.max(firstBounds.top, secondBounds.top);

      assert.ok(
        overlapWidth <= 0.01 || overlapDepth <= 0.01,
        `${template.id} rooms ${first.id} and ${second.id} should not overlap`
      );
    }
  }
}

function getTemplate(templateId: string) {
  const template = HOUSE_PLAN_TEMPLATES.find((entry) => entry.id === templateId);
  assert.ok(template, `${templateId} template should exist`);
  return template;
}

function getTemplateBounds(templateId: string, roomId: string) {
  const template = getTemplate(templateId);
  const room = template.rooms.find((entry) => entry.id === roomId);
  assert.ok(room, `${templateId} template should include ${roomId}`);
  return {
    left: room.x - room.width / 2,
    right: room.x + room.width / 2,
    top: room.z - room.depth / 2,
    bottom: room.z + room.depth / 2,
  };
}

function assertRoomsShareWall(templateId: string, firstId: string, secondId: string) {
  const first = getTemplateBounds(templateId, firstId);
  const second = getTemplateBounds(templateId, secondId);
  const verticalTouch =
    Math.abs(first.right - second.left) <= 0.01 ||
    Math.abs(second.right - first.left) <= 0.01;
  const verticalOverlap =
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  const horizontalTouch =
    Math.abs(first.bottom - second.top) <= 0.01 ||
    Math.abs(second.bottom - first.top) <= 0.01;
  const horizontalOverlap =
    Math.min(first.right, second.right) - Math.max(first.left, second.left);

  assert.ok(
    (verticalTouch && verticalOverlap > 0.5) || (horizontalTouch && horizontalOverlap > 0.5),
    `${templateId} template rooms ${firstId} and ${secondId} should share a useful wall`
  );
}

for (const template of HOUSE_PLAN_TEMPLATES) {
  const roomIds = new Set(template.rooms.map((room) => room.id));
  for (const doorway of template.doorways) {
    assert.ok(roomIds.has(doorway.fromRoomId), `${template.id} doorway should start from a real room`);
    assert.ok(roomIds.has(doorway.toRoomId), `${template.id} doorway should point to a real room`);
    assert.notEqual(doorway.fromRoomId, doorway.toRoomId, `${template.id} doorway should connect two rooms`);
    assert.ok((doorway.widthMeters ?? 0.9) >= 0.7, `${template.id} doorway should be at least 0.7m wide`);
    assertRoomsShareWall(template.id, doorway.fromRoomId, doorway.toRoomId);
  }
}

assert.ok(HOUSE_PLAN_TEMPLATES.length >= 10, "Template library should include real-life layout categories beyond the original starters");

assert.deepEqual(
  getTemplate("studio").rooms.map((room) => room.id),
  ["living", "kitchen", "entry", "bathroom"],
  "Studio template should model an alcove living area with a compact service stack"
);
assertRoomsShareWall("studio", "living", "kitchen");
assertRoomsShareWall("studio", "living", "entry");
assertRoomsShareWall("studio", "entry", "bathroom");

assert.deepEqual(
  getTemplate("one_bedroom").rooms.map((room) => room.id),
  ["living", "kitchen", "entry", "bedroom", "bathroom"],
  "1-bedroom template should model a realistic entry/service/living/private room sequence"
);
assertRoomsShareWall("one_bedroom", "living", "kitchen");
assertRoomsShareWall("one_bedroom", "living", "entry");
assertRoomsShareWall("one_bedroom", "living", "bedroom");
assertRoomsShareWall("one_bedroom", "entry", "bathroom");

assert.deepEqual(
  getTemplate("living_dining").rooms.map((room) => room.id),
  ["living", "dining", "kitchen", "entry", "bedroom", "bathroom"],
  "Open-plan template should include public, service, and private zones"
);
assertRoomsShareWall("living_dining", "living", "dining");
assertRoomsShareWall("living_dining", "dining", "kitchen");
assertRoomsShareWall("living_dining", "kitchen", "entry");
assertRoomsShareWall("living_dining", "dining", "bathroom");
assertRoomsShareWall("living_dining", "living", "bedroom");

assert.deepEqual(
  getTemplate("compact_two_bed").rooms.map((room) => room.id),
  ["living", "kitchen", "entry", "bedroom", "bedroom_2", "bathroom"],
  "Compact 2-bed template should include an entry/service band and two private bedrooms"
);
assertRoomsShareWall("compact_two_bed", "living", "kitchen");
assertRoomsShareWall("compact_two_bed", "entry", "bathroom");
assertRoomsShareWall("compact_two_bed", "bedroom", "bathroom");
assertRoomsShareWall("compact_two_bed", "bedroom_2", "bathroom");

assert.deepEqual(
  getTemplate("three_room_flat").rooms.map((room) => room.id),
  ["living", "kitchen_dining", "hall", "bedroom", "bedroom_2", "bathroom"],
  "3-room flat template should include a public front, service side, and private rear hall"
);
assertRoomsShareWall("three_room_flat", "living", "kitchen_dining");
assertRoomsShareWall("three_room_flat", "living", "hall");
assertRoomsShareWall("three_room_flat", "hall", "bedroom");
assertRoomsShareWall("three_room_flat", "hall", "bedroom_2");
assertRoomsShareWall("three_room_flat", "hall", "bathroom");

assert.equal(plan.version, 1);
assert.equal(plan.units, "m");
assert.equal(plan.activeFloorId, "floor_1");
assert.equal(plan.activeRoomId, "floor_1_room_living");
assert.equal(floor.rooms.length, 2);
assert.equal(floor.walls.length, 7);
assert.equal(floor.openings.length, 0);
assert.equal(floor.underlays.length, 0);

assert.deepEqual(
  resolveFloorPlanOpeningCancelDecision({
    traceOpeningMode: false,
    pointCount: 0,
  }),
  {
    shouldHandle: false,
    clearOpeningPoints: false,
    exitOpeningMode: false,
  }
);
assert.deepEqual(
  resolveFloorPlanOpeningCancelDecision({
    traceOpeningMode: true,
    pointCount: 0,
  }),
  {
    shouldHandle: true,
    clearOpeningPoints: true,
    exitOpeningMode: true,
  }
);
assert.deepEqual(
  resolveFloorPlanOpeningCancelDecision({
    traceOpeningMode: true,
    pointCount: 1,
  }),
  {
    shouldHandle: true,
    clearOpeningPoints: true,
    exitOpeningMode: false,
  }
);

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

const staleLegacyItems: DesignItem[] = [
  {
    instanceId: "stale-item",
    productId: "stale-product",
    variantId: "stale-variant",
    position: [0, 0, 0],
  },
];
const snapshotFromValidApi = legacyApiToSnapshot({
  id: "design_valid_snapshot",
  title: "Valid Snapshot",
  roomWidth: 1,
  roomDepth: 1,
  items: staleLegacyItems,
  zones: [],
  savedViews: [],
  snapshot: storedSnapshot,
});
assert.equal(snapshotFromValidApi.activeRoomId, "bedroom");
assert.equal(snapshotFromValidApi.rooms.length, 2);
assert.equal(snapshotFromValidApi.rooms.find((room) => room.id === "bedroom")?.geometry.width, 4);
assert.equal(snapshotFromValidApi.rooms[0].items.length, 0);

const snapshotFromInvalidApi = legacyApiToSnapshot({
  id: "design_invalid_snapshot",
  title: "Invalid Snapshot",
  roomWidth: 8,
  roomDepth: 6,
  items: staleLegacyItems,
  zones: [],
  savedViews: [],
  snapshot: {
    ...storedSnapshot,
    activeRoomId: "missing-room",
  } as unknown as Parameters<typeof legacyApiToSnapshot>[0]["snapshot"],
});
assert.equal(snapshotFromInvalidApi.activeRoomId, "room_living");
assert.equal(snapshotFromInvalidApi.rooms.length, 1);
assert.equal(snapshotFromInvalidApi.rooms[0].geometry.width, 8);
assert.equal(snapshotFromInvalidApi.rooms[0].items[0].instanceId, "stale-item");

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
  resolveOpeningPlacementFromPoint(
    { x: -2.35, z: -1.95 },
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
    status: "invalid",
    label: "Too close to corner",
    segment: [
      { x: -2.5, z: -2 },
      { x: -1.6, z: -2 },
    ],
    labelPosition: { x: -2.05, z: -2 },
    opening: {
      roomId: "living",
      wall: "north",
      kind: "door",
      offsetMm: -2050,
      widthMm: 900,
    },
    reason: "too_close_to_corner",
  }
);
assert.deepEqual(
  resolveOpeningPlacementFromPoint(
    { x: 0.35, z: -2.02 },
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
    "window",
    [
      {
        id: "opening-existing",
        roomId: "living",
        wall: "north",
        kind: "door",
        offsetMm: 0,
        widthMm: 900,
      },
    ]
  ),
  {
    status: "invalid",
    label: "Too close to another opening",
    segment: [
      { x: -0.25, z: -2 },
      { x: 0.95, z: -2 },
    ],
    labelPosition: { x: 0.35, z: -2 },
    opening: {
      roomId: "living",
      wall: "north",
      kind: "window",
      offsetMm: 350,
      widthMm: 1200,
    },
    reason: "too_close_to_opening",
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
