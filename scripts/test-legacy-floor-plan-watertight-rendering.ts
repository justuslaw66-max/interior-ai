import assert from "node:assert/strict";
import {
  buildHousePlan2D,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import {
  buildLegacyFloorSlabsForTest,
  buildLegacyWallBandsForTest,
  getLegacyPhysicalWallCutEndOptionsForTest,
  getLegacyWallSurfaceJoinRangesForTest,
  getLegacyWallOpeningCountsForTest,
  getLegacySharedWallMatchesForTest,
  resolveLegacyCameraCutawaySegmentKeysForTest,
} from "@/components/editor/renderers/HousePlanRenderer3D";

const rectangularRoom: HousePlanRoom2D = {
  id: "right-angle-room",
  name: "Right-angle room",
  roomType: "living",
  x: 0,
  z: 0,
  w: 4,
  d: 3,
  height: 2.6,
  wallThickness: 0.2,
  shape: "custom_polygon",
  polygon: [
    { x: -2, z: -1.5 },
    { x: 2, z: -1.5 },
    { x: 2, z: 1.5 },
    { x: -2, z: 1.5 },
  ],
};
const supportedFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [rectangularRoom],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(supportedFloorSlab);
assert.equal(
  supportedFloorSlab.thicknessMeters,
  0.1,
  "A compatibility floor without an explicit slab depth should use the architectural 100 mm default."
);
const supportedFloorOuter = supportedFloorSlab.polygons[0]?.outer ?? [];
assert.deepEqual(
  {
    minX: Math.min(...supportedFloorOuter.map((point) => point.xMm)),
    maxX: Math.max(...supportedFloorOuter.map((point) => point.xMm)),
    minZ: Math.min(...supportedFloorOuter.map((point) => point.zMm)),
    maxZ: Math.max(...supportedFloorOuter.map((point) => point.zMm)),
  },
  { minX: -2100, maxX: 2100, minZ: -1600, maxZ: 1600 },
  "Visible walls must remain fully supported to their outer face."
);
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 0 }, supportedFloorOuter),
  true,
  "A visible wall must not overhang the structural floor slab."
);
const cameraIndependentFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [rectangularRoom],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(cameraIndependentFloorSlab);
const cameraIndependentFloorOuter =
  cameraIndependentFloorSlab.polygons[0]?.outer ?? [];
assert.equal(
  isPointInPlanarRing(
    { xMm: 2090, zMm: 0 },
    cameraIndependentFloorOuter
  ),
  true,
  "The structural slab perimeter must remain continuous when camera-facing walls are cut away."
);
assert.equal(
  isPointInPlanarRing(
    { xMm: -2090, zMm: 0 },
    cameraIndependentFloorOuter
  ),
  true,
  "Both opposing wall lines must retain equal structural floor support."
);
const doorwayRoom: HousePlanRoom2D = {
  ...rectangularRoom,
  id: "doorway-room",
  shape: "rectangle",
  polygon: undefined,
};
const northRectangleCutEnds = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: [doorwayRoom],
  excludedSegmentKeys: new Set(["doorway-room-north"]),
});
for (const segmentKey of ["doorway-room-east", "doorway-room-west"]) {
  const options = northRectangleCutEnds.find(
    (entry) => entry.segmentKey === segmentKey
  );
  assert.equal(
    options?.squareStart,
    true,
    `${segmentKey} must stop flush at the north cutaway endpoint.`
  );
  assert.equal(
    options?.squareEnd,
    false,
    `${segmentKey} must retain its closed south corner.`
  );
}
const southRectangleCutEnds = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: [doorwayRoom],
  excludedSegmentKeys: new Set(["doorway-room-south"]),
});
for (const segmentKey of ["doorway-room-east", "doorway-room-west"]) {
  const options = southRectangleCutEnds.find(
    (entry) => entry.segmentKey === segmentKey
  );
  assert.equal(
    options?.squareStart,
    false,
    `${segmentKey} must retain its closed north corner.`
  );
  assert.equal(
    options?.squareEnd,
    true,
    `${segmentKey} must stop flush at the south cutaway endpoint.`
  );
}
const doorwayFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [doorwayRoom],
  openings: [
    {
      id: "east-door",
      roomId: doorwayRoom.id,
      wall: "east",
      kind: "door",
      offset: 0,
      width: 0.9,
      height: 2.1,
    },
  ],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(doorwayFloorSlab);
const doorwayFloorOuter = doorwayFloorSlab.polygons[0]?.outer ?? [];
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 0 }, doorwayFloorOuter),
  false,
  "Door gaps must not expose a raised strip of structural slab across the finished floor."
);
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 1000 }, doorwayFloorOuter),
  true,
  "The wall beside a doorway must remain supported to its outer face."
);
const adjacentPolygonRooms: HousePlanRoom2D[] = [
  {
    ...rectangularRoom,
    id: "polygon-left",
    name: "Polygon left",
    x: -2,
  },
  {
    ...rectangularRoom,
    id: "polygon-right",
    name: "Polygon right",
    x: 2,
  },
];
const polygonSharedWallMatches = getLegacySharedWallMatchesForTest(
  adjacentPolygonRooms
);
assert.deepEqual(
  polygonSharedWallMatches.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.matches,
  [{ roomId: "polygon-right", segmentKey: "polygon-right-3" }],
  "Coincident custom-polygon edges must resolve as one shared physical wall."
);
assert.deepEqual(
  polygonSharedWallMatches.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.matches,
  [{ roomId: "polygon-left", segmentKey: "polygon-left-1" }],
  "Custom-polygon shared-wall matching must be symmetric."
);
const physicalCutEndOptions = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: adjacentPolygonRooms,
  excludedSegmentKeys: new Set(["polygon-left-2"]),
});
assert.equal(
  physicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.squareEnd,
  true,
  "A surviving wall should stop flush where its own neighboring wall is cut away."
);
assert.equal(
  physicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.squareStart,
  true,
  "Every copy of a shared physical wall must inherit the same flush cutaway endpoint."
);
const mirroredPhysicalCutEndOptions =
  getLegacyPhysicalWallCutEndOptionsForTest({
    rooms: adjacentPolygonRooms,
    excludedSegmentKeys: new Set(["polygon-left-0"]),
  });
assert.equal(
  mirroredPhysicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.squareStart,
  true,
  "The opposite end of a surviving wall must also stop flush at a cutaway."
);
assert.equal(
  mirroredPhysicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.squareEnd,
  true,
  "Reversed shared-wall copies must inherit the flush endpoint on both sides."
);
const leftCameraPolygonCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: adjacentPolygonRooms,
  activeRoomId: "polygon-left",
  cameraX: -12,
  cameraZ: 0,
  viewDirectionX: 1,
  viewDirectionZ: 0,
});
const rightCameraPolygonCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: adjacentPolygonRooms,
  activeRoomId: "polygon-left",
  cameraX: 12,
  cameraZ: 0,
  viewDirectionX: -1,
  viewDirectionZ: 0,
});
for (const cutawayKeys of [leftCameraPolygonCutawayKeys, rightCameraPolygonCutawayKeys]) {
  assert.equal(
    cutawayKeys.has("polygon-left-1") || cutawayKeys.has("polygon-right-3"),
    false,
    "The shared middle wall must remain visible from both opposing camera directions."
  );
}
const tJunctionRooms: HousePlanRoom2D[] = [
  {
    ...rectangularRoom,
    id: "t-top-left",
    name: "T top left",
    x: -1,
    z: -1,
    w: 2,
    d: 2,
    polygon: [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ],
  },
  {
    ...rectangularRoom,
    id: "t-top-right",
    name: "T top right",
    x: 1,
    z: -1,
    w: 2,
    d: 2,
    polygon: [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ],
  },
  {
    ...rectangularRoom,
    id: "t-bottom",
    name: "T bottom",
    x: 0,
    z: 1,
    w: 4,
    d: 2,
    polygon: [
      { x: -2, z: -1 },
      { x: 2, z: -1 },
      { x: 2, z: 1 },
      { x: -2, z: 1 },
    ],
  },
];
const tJunctionBands = buildLegacyWallBandsForTest({
  rooms: tJunctionRooms,
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.equal(tJunctionBands.length, 1);
assert.equal(tJunctionBands[0].polygons.length, 1);
assert.equal(
  tJunctionBands[0].polygons[0].outer.length,
  4,
  "A T-junction wall union should keep one rectangular exterior without protruding miter spikes."
);
assert.equal(tJunctionBands[0].polygons[0].holes.length, 3);
assert(
  tJunctionBands[0].polygons[0].holes.every((hole) => hole.length === 4),
  "A T-junction should leave three clean rectangular room interiors without intersecting wall ends."
);
const rectangularBands = buildLegacyWallBandsForTest({
  rooms: [rectangularRoom],
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.deepEqual(
  rectangularBands[0].polygons[0].outer,
  [
    { xMm: 2100, zMm: -1600 },
    { xMm: 2100, zMm: 1600 },
    { xMm: -2100, zMm: 1600 },
    { xMm: -2100, zMm: -1600 },
  ],
  "A rectangular room must have four clean unioned exterior corners without stepped end caps."
);
assert.deepEqual(rectangularBands[0].polygons[0].holes, [[
  { xMm: -1900, zMm: -1400 },
  { xMm: -1900, zMm: 1400 },
  { xMm: 1900, zMm: 1400 },
  { xMm: 1900, zMm: -1400 },
]]);
const firstSurfaceJoin = getLegacyWallSurfaceJoinRangesForTest(
  rectangularRoom,
  0.2
)[0];
assert.equal(firstSurfaceJoin.plus.length, 4.2);
assert.equal(firstSurfaceJoin.minus.length, 4.2);
assert.equal(firstSurfaceJoin.plus.centerDelta, 0);
assert.equal(firstSurfaceJoin.minus.centerDelta, 0);

const rectangularCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 6,
  cameraZ: 5,
});
assert.deepEqual(
  [...rectangularCutawayKeys].sort(),
  ["right-angle-room-1", "right-angle-room-2"],
  "A south-east dollhouse camera should remove the east and south wall segments."
);
const zoomedCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 0.25,
  cameraZ: 0.2,
  viewDirectionX: -6,
  viewDirectionZ: -5,
});
const distantCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 60,
  cameraZ: 50,
  viewDirectionX: -6,
  viewDirectionZ: -5,
});
assert.deepEqual(
  [...zoomedCutawayKeys].sort(),
  [...distantCutawayKeys].sort(),
  "Dolly zoom must not change the cutaway wall set when the viewing direction is unchanged."
);
const cutawaySurfaceJoins = getLegacyWallSurfaceJoinRangesForTest(
  rectangularRoom,
  0.2,
  rectangularCutawayKeys
);
const retainedNorthSurfaceJoin = cutawaySurfaceJoins.find(
  (join) => join.segmentKey === "right-angle-room-0"
);
assert.ok(retainedNorthSurfaceJoin);
assert.equal(retainedNorthSurfaceJoin.plus.length, 4.1);
assert.equal(retainedNorthSurfaceJoin.minus.length, 4.1);
const retainedWestSurfaceJoin = cutawaySurfaceJoins.find(
  (join) => join.segmentKey === "right-angle-room-3"
);
assert.ok(retainedWestSurfaceJoin);
assert.equal(retainedWestSurfaceJoin.plus.length, 3.1);
assert.equal(retainedWestSurfaceJoin.minus.length, 3.1);
const rectangularCutawayBands = buildLegacyWallBandsForTest({
  rooms: [rectangularRoom],
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
  excludedSegmentKeys: rectangularCutawayKeys,
});
const cutawayContains = (xMm: number, zMm: number) =>
  rectangularCutawayBands[0].polygons.some(
    (polygon) =>
      isPointInPlanarRing({ xMm, zMm }, polygon.outer) &&
      !polygon.holes.some((hole) => isPointInPlanarRing({ xMm, zMm }, hole))
  );
assert(cutawayContains(0, -1550), "The rear wall should remain after cutaway.");
assert(cutawayContains(-2050, 0), "The left wall should remain after cutaway.");
assert(!cutawayContains(2050, 0), "The camera-facing right wall body must be removed.");
assert(!cutawayContains(0, 1550), "The camera-facing front wall body must be removed.");

const seed = loadPingYiCourtV2ReviewSeedBundle().fixtures.find(
  (fixture) => fixture.layoutId === "4-room"
);
assert.ok(seed, "Expected the Ping Yi 4-room compatibility fixture.");

const adapted = canonicalFloorPlanToDesignSnapshot(seed.document);
const compatibilityFloorPlan = { ...adapted.snapshot.floorPlan };
delete compatibilityFloorPlan.canonicalDocument;
delete compatibilityFloorPlan.canonicalGeometryHash;
const stored = snapshotToStored({
  ...adapted.snapshot,
  floorPlan: compatibilityFloorPlan,
});
const refreshed = storedToSnapshot(JSON.parse(JSON.stringify(stored)));
assert.equal(
  refreshed.floorPlan?.canonicalDocument,
  undefined,
  "The regression fixture must exercise the refreshed compatibility renderer, not the canonical branch."
);

const plan = buildHousePlan2D(refreshed.rooms, 5, 4);
const refreshedSharedPolygonWalls = getLegacySharedWallMatchesForTest(
  plan.rooms
).filter((entry) => entry.matches.length > 0);
assert.equal(
  refreshedSharedPolygonWalls.length,
  32,
  "The refreshed nine-room compatibility plan must deduplicate every shared polygon-wall representation."
);
assert(
  refreshedSharedPolygonWalls.every((entry) => entry.matches.length === 1),
  "Every refreshed shared wall segment should resolve to exactly one physical counterpart."
);
const openings = adapted.openings.map((opening) => ({
  id: opening.id,
  roomId: opening.roomId,
  wall: opening.wall,
  kind: opening.kind,
  offset: opening.offsetMm / 1000,
  width: opening.widthMm / 1000,
  height:
    typeof opening.heightMm === "number" ? opening.heightMm / 1000 : undefined,
  bottom:
    typeof opening.bottomMm === "number" ? opening.bottomMm / 1000 : undefined,
}));
const slabs = buildLegacyFloorSlabsForTest({
  rooms: plan.rooms,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.equal(slabs.length, 1);
assert.equal(
  slabs[0].polygons.length,
  1,
  "A refreshed compatibility import must keep the apartment on one continuous slab."
);
assert.equal(slabs[0].polygons[0].holes.length, 0);

const openingHosts = getLegacyWallOpeningCountsForTest(plan.rooms, openings)
  .flatMap((room) => room.segments)
  .flat();
for (const windowNumber of [1, 2, 3, 4, 5, 6, 7]) {
  assert(
    openingHosts.some((id) => id.startsWith(`window:${windowNumber}:`)),
    `Compatibility wall projection must retain window ${windowNumber} on its polygon edge.`
  );
}

const wallBands = buildLegacyWallBandsForTest({
  rooms: plan.rooms,
  openings,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.deepEqual(
  wallBands.map(({ bottomMeters, topMeters }) => [bottomMeters, topMeters]),
  [
    [0, 0.9],
    [0.9, 2.1],
    [2.1, 2.6],
  ],
  "Window sills and lintels must survive refresh instead of becoming floor-to-ceiling wall gaps."
);
assert.equal(wallBands[0].polygons.length, 1);
assert.equal(wallBands[2].polygons.length, 1);

console.log("Legacy refreshed floor-plan watertight rendering checks passed.");
