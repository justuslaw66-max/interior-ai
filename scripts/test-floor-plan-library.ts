import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  browseFloorPlanLibrary,
  normalizeFloorPlanAddress,
  parseFloorPlanUnitNumber,
  searchFloorPlanLibrary,
} from "@/lib/floor-plan-address-search";
import {
  buildHouseRoomAdjacencyGuides,
  doesHouseRoomOverlap,
  resolveHousePlanTemplateOpeningMetrics,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import {
  buildRoomWallSegments2D,
  mergeSharedWallSegments2D,
  splitWallBandByOpenings2D,
} from "@/lib/room-renderer-2d-walls";
import { floorPlanLibraryCatalogSchema } from "@/lib/floor-plan-library-schema";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const catalogs = getAllFloorPlanLibraryCatalogs();
assert.ok(catalogs.length > 0, "Expected at least one floor-plan catalog to load.");

const pingYiCourt = catalogs.find(
  (catalog) => catalog.floor_plan.plan_id === "sg-hdb-ping-yi-court"
);
assert.ok(pingYiCourt, "Expected the Ping Yi Court floor-plan catalog to load.");
assert.equal(pingYiCourt.floor_plan.plan_id, "sg-hdb-ping-yi-court");
assert.deepEqual(
  pingYiCourt.address.buildings.map((building) => building.block),
  ["810A", "811A", "811B", "811C", "811D"]
);
assert.deepEqual(
  pingYiCourt.layouts.map((layout) => layout.source_page),
  [1, 2, 3, 4, 5, 6, 7]
);

const GEOMETRY_EPSILON = 0.01;
const geometryResults = browseFloorPlanLibrary([pingYiCourt]);
function roomOutline(room: HousePlanRoom2D): Array<{ x: number; z: number }> {
  if (room.shape === "custom_polygon" && room.polygon) {
    return room.polygon.map((point) => ({
      x: room.x + point.x,
      z: room.z + point.z,
    }));
  }
  return [
    { x: room.x - room.w / 2, z: room.z - room.d / 2 },
    { x: room.x + room.w / 2, z: room.z - room.d / 2 },
    { x: room.x + room.w / 2, z: room.z + room.d / 2 },
    { x: room.x - room.w / 2, z: room.z + room.d / 2 },
  ];
}

function pointOnRoomBoundary(
  point: { x: number; z: number },
  room: HousePlanRoom2D
): boolean {
  const outline = roomOutline(room);
  return outline.some((start, index) => {
    const end = outline[(index + 1) % outline.length];
    const cross =
      (end.x - start.x) * (point.z - start.z) -
      (end.z - start.z) * (point.x - start.x);
    return (
      Math.abs(cross) <= GEOMETRY_EPSILON &&
      point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON &&
      point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
      point.z >= Math.min(start.z, end.z) - GEOMETRY_EPSILON &&
      point.z <= Math.max(start.z, end.z) + GEOMETRY_EPSILON
    );
  });
}

for (const layout of pingYiCourt.layouts) {
  const result = geometryResults.find((candidate) => candidate.layoutId === layout.layout_id);
  assert.ok(result, `Expected converted template for ${layout.layout_id}.`);
  const rooms: HousePlanRoom2D[] = result.template.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    roomType: room.roomType,
    shape: room.shape,
    ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
    x: room.x,
    z: room.z,
    w: room.width,
    d: room.depth,
  }));
  for (const room of rooms) {
    assert.equal(
      doesHouseRoomOverlap(room.id, room.x, room.z, room.w, room.d, rooms),
      false,
      `${layout.layout_id} has overlapping source-derived room geometry at ${room.id}.`
    );
  }

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const adjacency = buildHouseRoomAdjacencyGuides(rooms, GEOMETRY_EPSILON);
  for (const doorway of result.template.doorways) {
    const from = roomById.get(doorway.fromRoomId);
    assert.ok(from, `${layout.layout_id} doorway source room is missing.`);
    const toRoomId = doorway.toRoomId;
    if (!toRoomId) {
      const isHorizontalWall = doorway.wall === "north" || doorway.wall === "south";
      const doorwayCenter =
        (isHorizontalWall ? from.x : from.z) + (doorway.offsetMeters ?? 0);
      const halfDoorwayWidth = (doorway.widthMeters ?? 0.9) / 2;
      const fixedCoordinate = isHorizontalWall
        ? from.z + (doorway.wall === "north" ? -from.d / 2 : from.d / 2)
        : from.x + (doorway.wall === "west" ? -from.w / 2 : from.w / 2);
      const doorwayStart = isHorizontalWall
        ? { x: doorwayCenter - halfDoorwayWidth, z: fixedCoordinate }
        : { x: fixedCoordinate, z: doorwayCenter - halfDoorwayWidth };
      const doorwayEnd = isHorizontalWall
        ? { x: doorwayCenter + halfDoorwayWidth, z: fixedCoordinate }
        : { x: fixedCoordinate, z: doorwayCenter + halfDoorwayWidth };
      assert.ok(
        pointOnRoomBoundary(doorwayStart, from) && pointOnRoomBoundary(doorwayEnd, from),
        `${layout.layout_id} exterior doorway does not fit the source room boundary.`
      );
      continue;
    }

    const to = roomById.get(toRoomId);
    assert.ok(to, `${layout.layout_id} doorway target room is missing.`);
    const guide = adjacency.find(
      (candidate) =>
        candidate.roomIds.includes(doorway.fromRoomId) &&
        candidate.roomIds.includes(toRoomId)
    );
    assert.ok(
      guide,
      `${layout.layout_id} doorway ${doorway.fromRoomId} -> ${doorway.toRoomId} has no shared wall.`
    );

    const isHorizontalWall = doorway.wall === "north" || doorway.wall === "south";
    const doorwayCenter =
      (isHorizontalWall ? from.x : from.z) + (doorway.offsetMeters ?? 0);
    const halfDoorwayWidth = (doorway.widthMeters ?? 0.9) / 2;
    const fixedCoordinate = isHorizontalWall
      ? from.z + (doorway.wall === "north" ? -from.d / 2 : from.d / 2)
      : from.x + (doorway.wall === "west" ? -from.w / 2 : from.w / 2);
    const doorwayStart = isHorizontalWall
      ? { x: doorwayCenter - halfDoorwayWidth, z: fixedCoordinate }
      : { x: fixedCoordinate, z: doorwayCenter - halfDoorwayWidth };
    const doorwayEnd = isHorizontalWall
      ? { x: doorwayCenter + halfDoorwayWidth, z: fixedCoordinate }
      : { x: fixedCoordinate, z: doorwayCenter + halfDoorwayWidth };
    assert.ok(
      pointOnRoomBoundary(doorwayStart, to) && pointOnRoomBoundary(doorwayEnd, to),
      `${layout.layout_id} doorway ${doorway.fromRoomId} -> ${doorway.toRoomId} does not fit on the shared wall.`
    );
  }
}

const twoRoomTypeOneResult = geometryResults.find(
  (result) => result.layoutId === "2-room-flexi-type-1"
);
assert.ok(twoRoomTypeOneResult, "Expected the source page-1 2-room Flexi Type 1 template.");
const twoRoomTypeOneById = new Map(
  twoRoomTypeOneResult.template.rooms.map((room) => [room.id, room])
);
assert.deepEqual(
  twoRoomTypeOneResult.template.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    width: room.width,
    depth: room.depth,
    x: room.x,
    z: room.z,
  })),
  [
    { id: "bedroom", name: "Bedroom", width: 2.89, depth: 3.11, x: 1.445, z: 1.555 },
    { id: "living_dining", name: "Living / Dining", width: 2.895, depth: 6.69, x: 4.3375, z: 3.345 },
    { id: "bathroom", name: "Bath / WC", width: 1.78, depth: 1.78, x: 2, z: 4 },
    { id: "shelter", name: "Household Shelter", width: 1.18, depth: 1.15, x: 4.8, z: 4.09 },
    { id: "kitchen", name: "Kitchen", width: 2.265, depth: 2.495, x: 1.7575, z: 6.1375 },
  ],
  "Page 1 should retain the printed 2890/2895 mm width and 3110/1780/2495 mm depth chains."
);
assert.deepEqual(
  twoRoomTypeOneById.get("living_dining")?.planPolygon,
  [
    { x: -1.4475, z: -3.345 },
    { x: 1.4475, z: -3.345 },
    { x: 1.4475, z: 0.17 },
    { x: -0.1275, z: 0.17 },
    { x: -0.1275, z: 1.545 },
    { x: -0.2475, z: 1.545 },
    { x: -0.2475, z: 3.345 },
    { x: -1.4475, z: 3.345 },
  ],
  "The Living / Dining room should follow the 1320 mm hall and 1200 mm entrance shown on page 1."
);

const twoRoomTypeOneDoorways = twoRoomTypeOneResult.template.doorways;
assert.deepEqual(
  twoRoomTypeOneDoorways.slice(0, 3).map((doorway) => [
    doorway.fromRoomId,
    doorway.offsetMeters,
    doorway.widthMeters,
  ]),
  [
    ["bedroom", 0.955, 1.2],
    ["bathroom", -0.29, 0.8],
    ["shelter", 0, 0.7],
  ],
  "The bedroom partition and the 700 mm shelter door should retain their page-1 positions."
);
assert.ok(
  twoRoomTypeOneDoorways.some(
    (doorway) =>
      doorway.fromRoomId === "kitchen" &&
      doorway.toRoomId === "living_dining" &&
      doorway.wall === "east" &&
      doorway.kind === "opening" &&
      doorway.offsetMeters === -0.3475 &&
      doorway.widthMeters === 1.8
  ),
  "The Kitchen must keep its full 1.8 m open edge to the entrance hall."
);
assert.ok(
  twoRoomTypeOneDoorways.some(
    (doorway) =>
      doorway.fromRoomId === "living_dining" &&
      doorway.toRoomId === undefined &&
      doorway.wall === "south" &&
      doorway.offsetMeters === -0.8475 &&
      doorway.widthMeters === 1.2
  ),
  "The source-drawn 1.2 m exterior entrance must be retained."
);
assert.deepEqual(
  twoRoomTypeOneResult.template.referenceZones?.map((zone) => [
    zone.id,
    zone.depth,
    zone.locked,
  ]),
  [
    ["aircon_ledge", 1.78, true],
    ["entry_structure", 1.8, true],
  ],
  "The Air-con Ledge and entry structural core should remain locked source-reference zones."
);

const twoRoomTypeOneWallRooms = twoRoomTypeOneResult.template.rooms.map((room) => ({
  id: room.id,
  x: room.x,
  z: room.z,
  w: room.width,
  d: room.depth,
  shape: room.shape,
  ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
}));
const twoRoomTypeOneWallSegments = mergeSharedWallSegments2D(
  buildRoomWallSegments2D(twoRoomTypeOneWallRooms)
);
const twoRoomKitchenOpenWall = twoRoomTypeOneWallSegments.find(
  (segment) =>
    segment.orientation === "vertical" &&
    Math.abs(segment.x1 - 2.89) < GEOMETRY_EPSILON &&
    Math.abs(segment.z1 - 4.89) < GEOMETRY_EPSILON &&
    Math.abs(segment.z2 - 6.69) < GEOMETRY_EPSILON
);
assert.ok(twoRoomKitchenOpenWall);
const twoRoomKitchenOpenCut = splitWallBandByOpenings2D(twoRoomKitchenOpenWall, [
  {
    roomId: "kitchen",
    wall: "east",
    offset: -0.3475,
    width: 1.8,
    kind: "door",
  },
]);
assert.equal(
  twoRoomKitchenOpenCut.parts.length,
  0,
  "The page-1 Kitchen edge should render as an open passage, not a hinged doorway."
);

const fourRoomResult = geometryResults.find((result) => result.layoutId === "4-room");
assert.ok(fourRoomResult, "Expected the source page-5 4-room template.");
const fourRoomById = new Map(fourRoomResult.template.rooms.map((room) => [room.id, room]));
assert.deepEqual(
  {
    mainBath: fourRoomById.get("main_bath"),
    commonBath: fourRoomById.get("common_bath"),
    serviceYard: fourRoomById.get("service_yard"),
    shelter: fourRoomById.get("shelter"),
  },
  {
    mainBath: {
      id: "main_bath", name: "Bath / WC", roomType: "toilet", shape: "rectangle",
      width: 2.815, depth: 1.83, x: 2.8075, z: 5.415,
    },
    commonBath: {
      id: "common_bath", name: "Bath / WC 2", roomType: "toilet", shape: "rectangle",
      width: 2.055, depth: 1.83, x: 5.2425, z: 5.415,
    },
    serviceYard: {
      id: "service_yard", name: "Service Yard", roomType: "custom", shape: "rectangle",
      width: 2.055, depth: 2.4, x: 5.2425, z: 7.53,
    },
    shelter: {
      id: "shelter", name: "Household Shelter", roomType: "custom", shape: "rectangle",
      width: 1.23, depth: 2.305, x: 12.15, z: 6.7225,
    },
  },
  "Page-5 bathroom, service, and shelter blocks should retain the source-traced coordinates."
);

const fourRoomDoorways = fourRoomResult.template.doorways;
assert.ok(
  fourRoomDoorways.some(
    (doorway) => doorway.fromRoomId === "service_yard" && doorway.toRoomId === "kitchen" && doorway.wall === "east"
  ),
  "The Service Yard must open east into the Kitchen."
);
assert.ok(
  fourRoomDoorways.some(
    (doorway) => doorway.fromRoomId === "kitchen" && doorway.toRoomId === "living_dining" && doorway.kind === "opening" && doorway.widthMeters === 2.815
  ),
  "The Kitchen/Dining boundary must be a full-width open passage, not a hinged door."
);
assert.ok(
  fourRoomDoorways.some(
    (doorway) => doorway.fromRoomId === "living_dining" && doorway.toRoomId === undefined && doorway.widthMeters === 1.2
  ),
  "The source-drawn 1.2 m exterior entrance must be retained."
);
assert.equal(
  fourRoomDoorways.find((doorway) => doorway.fromRoomId === "bedroom_1")?.offsetMeters,
  1.0675,
  "Bedroom 1's 900 mm door belongs at the east end of its south wall."
);
assert.deepEqual(
  fourRoomResult.template.referenceZones?.map((zone) => [zone.id, zone.locked]),
  [["aircon_ledge", true], ["entry_structure", true]],
  "Exterior and structural source zones should remain locked and outside room counts."
);
assert.deepEqual(
  resolveHousePlanTemplateOpeningMetrics(3.035, 0.9, 1.0675),
  { widthMeters: 0.9, offsetMeters: 1.0675 },
  "Applying a source template must not silently move a valid edge-aligned opening."
);

const fourRoomWallRooms = fourRoomResult.template.rooms.map((room) => ({
  id: room.id,
  x: room.x,
  z: room.z,
  w: room.width,
  d: room.depth,
  shape: room.shape,
  ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
}));
const fourRoomWallSegments = mergeSharedWallSegments2D(
  buildRoomWallSegments2D(fourRoomWallRooms)
);
const bedroomOneSharedWall = fourRoomWallSegments.find(
  (segment) =>
    segment.orientation === "horizontal" &&
    Math.abs(segment.z1 - 3.355) < GEOMETRY_EPSILON &&
    Math.abs(segment.x1 - 3.035) < GEOMETRY_EPSILON &&
    Math.abs(segment.x2 - 6.07) < GEOMETRY_EPSILON
);
assert.ok(bedroomOneSharedWall);
assert.deepEqual(
  bedroomOneSharedWall.roomIds,
  ["bedroom_1", "living_dining"],
  "A partially shared room boundary should become one wall with both owners."
);
const bedroomDoorCut = splitWallBandByOpenings2D(bedroomOneSharedWall, [
  {
    roomId: "bedroom_1",
    wall: "south",
    offset: 1.0675,
    width: 0.9,
    kind: "door",
  },
]);
assert.ok(
  bedroomDoorCut.parts.every((part) => Math.max(part.x1, part.x2) <= 5.17 + GEOMETRY_EPSILON),
  "The east-aligned bedroom door must cut the shared wall instead of leaving a duplicate wall behind it."
);

const kitchenOpenWall = fourRoomWallSegments.find(
  (segment) =>
    segment.orientation === "horizontal" &&
    Math.abs(segment.z1 - 6.33) < GEOMETRY_EPSILON &&
    Math.abs(segment.x1 - 6.27) < GEOMETRY_EPSILON &&
    Math.abs(segment.x2 - 9.085) < GEOMETRY_EPSILON
);
assert.ok(kitchenOpenWall);
const kitchenOpenCut = splitWallBandByOpenings2D(kitchenOpenWall, [
  {
    roomId: "kitchen",
    wall: "north",
    offset: 0,
    width: 2.815,
    kind: "door",
  },
]);
assert.equal(kitchenOpenCut.parts.length, 0, "The source-open Kitchen edge must render with no wall band.");

const expectedSourceRoomCounts: Record<string, number> = {
  "2-room-flexi-type-1": 5,
  "2-room-flexi-type-2-open": 5,
  "2-room-flexi-type-2-partitioned": 6,
  "3-room": 7,
  "4-room": 9,
  "5-room": 9,
  "3gen": 11,
};
for (const result of geometryResults) {
  assert.equal(
    result.template.rooms.length,
    expectedSourceRoomCounts[result.layoutId],
    `${result.layoutId} should create source rooms, not invented hall/entry subdivisions.`
  );
  assert.ok(
    result.template.rooms.every(
      (room) => !/\b(?:hall|passage|entry|suggested study)\b/i.test(room.name)
    ),
    `${result.layoutId} should not expose circulation or an optional study as rooms.`
  );
}

const threeRoomTemplate = geometryResults.find((result) => result.layoutId === "3-room")?.template;
assert.ok(threeRoomTemplate);
assert.deepEqual(
  threeRoomTemplate.rooms.map((room) => room.name),
  [
    "Main Bedroom",
    "Bedroom",
    "Living / Dining",
    "Bath / WC",
    "Bath / WC 2",
    "Kitchen / Utility",
    "Household Shelter",
  ],
  "Room names should be derived from the labels printed on source page 4."
);
assert.equal(threeRoomTemplate.rooms.find((room) => room.id === "living_dining")?.shape, "custom_polygon");
assert.ok(
  (threeRoomTemplate.rooms.find((room) => room.id === "living_dining")?.planPolygon
    ?.length ?? 0) >= 8,
  "The open Living / Dining area should retain its traced polygon."
);

const invalidMissingLabel = structuredClone(pingYiCourt);
invalidMissingLabel.layouts[0].template.rooms[0].source_label = undefined;
invalidMissingLabel.layouts[0].template.rooms[0].name = undefined;
invalidMissingLabel.layouts[0].template.rooms[0].room_type = undefined;
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidMissingLabel).success,
  false,
  "A room without a detected source label or explicit inferred identity must be rejected."
);

const invalidPolygon = structuredClone(pingYiCourt);
const invalidLiving = invalidPolygon.layouts[0].template.rooms.find(
  (room) => room.id === "living_dining"
);
assert.ok(invalidLiving);
invalidLiving.plan_polygon = [
  { x: -1, z: -1 },
  { x: 1, z: 1 },
  { x: -1, z: 1 },
  { x: 1, z: -1 },
];
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidPolygon).success,
  false,
  "Self-intersecting detected room polygons must be rejected."
);

assert.equal(
  normalizeFloorPlanAddress("Blk 810A, Chai Chee St Unit #12 / 509"),
  "810a chai chee street"
);
assert.deepEqual(parseFloorPlanUnitNumber("#12-509"), {
  floor: 12,
  stack: "509",
  label: "#12-509",
});
assert.deepEqual(parseFloorPlanUnitNumber("Unit 02 / 519"), {
  floor: 2,
  stack: "519",
  label: "#02-519",
});
assert.deepEqual(parseFloorPlanUnitNumber("unit 2-50a"), {
  floor: 2,
  stack: "50A",
  label: "#02-50A",
});
assert.equal(parseFloorPlanUnitNumber("12-509"), null);
assert.equal(parseFloorPlanUnitNumber("#12"), null);

const expectedBlockUnitTotals: Record<string, number> = {
  "810A": 250,
  "811A": 152,
  "811B": 124,
  "811C": 140,
  "811D": 196,
};
const expectedFlatTypeUnitTotals: Record<string, number> = {
  "2-room Flexi Type 1": 54,
  "2-room Flexi Type 2": 140,
  "3-room": 84,
  "4-room": 294,
  "5-room": 262,
  "3Gen": 28,
};
const calculatedFlatTypeTotals = new Map<string, number>();
let calculatedProjectUnitTotal = 0;

for (const building of pingYiCourt.address.buildings) {
  const distribution = building.unit_distribution;
  assert.ok(distribution, `${building.block} should have unit-distribution data.`);
  assert.equal(distribution.status, "verified");
  let blockUnitTotal = 0;

  for (const group of distribution.groups) {
    const flatTypes: Set<string> = new Set(
      group.layout_ids.map((layoutId): string => {
        const mappedLayout = pingYiCourt.layouts.find(
          (candidate) => candidate.layout_id === layoutId
        );
        if (!mappedLayout) {
          throw new Error(`${building.block} references missing layout ${layoutId}.`);
        }
        return mappedLayout.flat_type;
      })
    );
    assert.equal(
      flatTypes.size,
      1,
      `${building.block} unit group must represent one physical flat type.`
    );
    const floorCount = group.floor_ranges.reduce(
      (total, range) => total + range.to - range.from + 1,
      0
    );
    const unitCount = group.stacks.length * floorCount;
    const [flatType] = flatTypes;
    blockUnitTotal += unitCount;
    calculatedFlatTypeTotals.set(
      flatType,
      (calculatedFlatTypeTotals.get(flatType) ?? 0) + unitCount
    );
  }

  assert.equal(
    blockUnitTotal,
    expectedBlockUnitTotals[building.block],
    `${building.block} unit total must match the official brochure.`
  );
  calculatedProjectUnitTotal += blockUnitTotal;
}

assert.equal(calculatedProjectUnitTotal, 862);
assert.deepEqual(
  Object.fromEntries(calculatedFlatTypeTotals),
  expectedFlatTypeUnitTotals,
  "Flat-type totals must match the official 862-unit summary."
);

const expectedLayoutCounts: Record<string, number> = {
  "810A": 6,
  "811A": 3,
  "811B": 3,
  "811C": 3,
  "811D": 5,
};

for (const [block, expectedCount] of Object.entries(expectedLayoutCounts)) {
  const results = searchFloorPlanLibrary(catalogs, `Block ${block}, Chai Chee St`);
  assert.equal(results.length, expectedCount, `${block} should return its published flat types.`);
  assert.ok(
    results.every((result) => result.matchedBlocks.length === 1 && result.matchedBlocks[0] === block),
    `${block} results should not claim another block.`
  );
  assert.ok(results.every((result) => result.matchLevel === "block"));
  assert.ok(results.every((result) => result.unitMatches.length === 0));
}

const streetResults = searchFloorPlanLibrary(catalogs, "Chai Chee Street");
assert.equal(streetResults.length, 7, "A street search should expose all seven brochure variants.");
assert.ok(streetResults.every((result) => result.matchLevel === "street"));

const browsableResults = browseFloorPlanLibrary(catalogs);
assert.equal(
  browsableResults.length,
  7,
  "Browsing should expose every published Ping Yi Court layout without an address query."
);
assert.deepEqual(
  browsableResults.map((result) => result.layoutId),
  pingYiCourt.layouts.map((layout) => layout.layout_id),
  "Browse order should follow the brochure's source pages."
);
assert.ok(
  browsableResults.every(
    (result) =>
      result.projectName === "Ping Yi Court" &&
      result.addressLabel.includes("Chai Chee Street") &&
      result.matchedBlocks.length > 0 &&
      result.unitMatches.length === 0
  ),
  "Browse results should include project and applicable-block context."
);
assert.equal(
  browseFloorPlanLibrary(catalogs, { limit: 2 }).length,
  2,
  "The browse limit should cap the returned library layouts."
);
assert.equal(
  searchFloorPlanLibrary(catalogs, "Chai Chee Street", { limit: 2 }).length,
  2,
  "The search limit should be applied to the returned editable layouts."
);
assert.equal(
  searchFloorPlanLibrary(catalogs, "810 Chai Chee Street").length,
  0,
  "An incomplete block number must not match 810A."
);

const typeOneAt810A = searchFloorPlanLibrary(catalogs, "810a chai chee st").find(
  (result) => result.layoutId === "2-room-flexi-type-1"
);
assert.ok(typeOneAt810A, "810A should include 2-room Flexi Type 1.");
assert.ok(typeOneAt810A.template.id.startsWith("library_"));
assert.equal(typeOneAt810A.template.rooms.length, 5);
assert.equal(typeOneAt810A.template.furnishingPacks.length, 0);

for (const building of pingYiCourt.address.buildings) {
  const distribution = building.unit_distribution;
  assert.ok(distribution);
  for (const group of distribution.groups) {
    for (const stack of group.stacks) {
      const results = searchFloorPlanLibrary(
        catalogs,
        `Block ${building.block}, Chai Chee St #12-${stack}`
      );
      assert.deepEqual(
        results.map((result) => result.layoutId).sort(),
        [...group.layout_ids].sort(),
        `${building.block} #12-${stack} should return only its mapped layouts.`
      );
      assert.ok(results.every((result) => result.matchLevel === "unit"));
      assert.ok(
        results.every(
          (result) =>
            result.matchedBlocks.length === 1 &&
            result.matchedBlocks[0] === building.block &&
            result.unitMatches.length === 1 &&
            result.unitMatches[0].floor === 12 &&
            result.unitMatches[0].stack === stack &&
            result.unitMatches[0].label === `#12-${stack}` &&
            result.unitMatches[0].distributionStatus === "verified"
        ),
        `${building.block} #12-${stack} should expose an exact verified unit match.`
      );

      assert.equal(
        searchFloorPlanLibrary(
          catalogs,
          `Block ${building.block}, Chai Chee St #01-${stack}`
        ).length,
        0,
        `${building.block} #01-${stack} should not exist.`
      );
      assert.equal(
        searchFloorPlanLibrary(
          catalogs,
          `Block ${building.block}, Chai Chee St #16-${stack}`
        ).length,
        0,
        `${building.block} #16-${stack} should not exist.`
      );
    }
  }
}

for (const stack of ["509", "527"]) {
  const results = searchFloorPlanLibrary(
    catalogs,
    `810A Chai Chee Street #12-${stack}`
  );
  assert.deepEqual(
    results.map((result) => result.layoutId),
    ["3gen"],
    `810A stack ${stack} is 3Gen despite the subtle brochure colour.`
  );
}

for (const [block, stack] of [
  ["810A", "519"],
  ["810A", "521"],
  ["811A", "555"],
  ["811A", "557"],
  ["811B", "559"],
  ["811B", "561"],
] as const) {
  assert.equal(
    searchFloorPlanLibrary(catalogs, `${block} Chai Chee St #02-${stack}`).length,
    0,
    `${block} stack ${stack} starts at floor 3.`
  );
  assert.ok(
    searchFloorPlanLibrary(catalogs, `${block} Chai Chee St #03-${stack}`).length > 0,
    `${block} stack ${stack} should exist from floor 3.`
  );
}

assert.deepEqual(
  searchFloorPlanLibrary(catalogs, "810A Chai Chee St #12-501").map(
    (result) => result.layoutId
  ),
  ["2-room-flexi-type-2-open", "2-room-flexi-type-2-partitioned"],
  "A Type 2 unit should retain both editable flex variants."
);
assert.deepEqual(
  searchFloorPlanLibrary(catalogs, "Chai Chee Street #12-509").map(
    (result) => `${result.matchedBlocks[0]}:${result.layoutId}`
  ),
  ["810A:3gen"],
  "A street plus exact unit should resolve the matching block."
);

for (const unavailableAddress of [
  "810A Chai Chee St #12-541",
  "811A Chai Chee St #12-509",
  "810A Chai Chee St #12-999",
  "810A Chai Chee St #16-509",
]) {
  assert.equal(
    searchFloorPlanLibrary(catalogs, unavailableAddress).length,
    0,
    `${unavailableAddress} must not fall back to block-wide layouts.`
  );
}
assert.equal(
  searchFloorPlanLibrary(catalogs, "#12-509").length,
  0,
  "A unit number without an address must not search every development."
);

const postalCatalog = {
  ...pingYiCourt,
  address: {
    ...pingYiCourt.address,
    buildings: pingYiCourt.address.buildings.map((building) =>
      building.block === "810A" ? { ...building, postal_code: "999999" } : building
    ),
  },
};
assert.equal(
  searchFloorPlanLibrary(
    [postalCatalog],
    "810A Chai Chee St, Singapore 999999 #12-509"
  ).length,
  1,
  "A full pasted address should support country, postal code, and exact unit number."
);

for (const catalog of catalogs) {
  for (const layout of catalog.layouts) {
    const previewPath = path.join(
      process.cwd(),
      "public",
      layout.preview_url.replace(/^\//, "")
    );
    assert.ok(
      fs.existsSync(previewPath),
      `Missing floor-plan preview: ${layout.preview_url}`
    );
    assert.ok(
      layout.template.rooms.every((room) => room.width > 0 && room.depth > 0),
      `${catalog.floor_plan.plan_id}:${layout.layout_id} has invalid room dimensions.`
    );
  }
}

const addressSearchSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "FloorPlanAddressSearch.tsx"),
  "utf8"
);
assert.match(
  addressSearchSource,
  /fetch\("\/api\/floor-plans\?browse=1&limit=50"[\s\S]*?data-testid="floor-plan-library-browse-toggle"[\s\S]*?data-testid="floor-plan-library-browse-result-count"/,
  "The address library should load and expose a visible imported-floor-plan browser."
);
assert.match(
  addressSearchSource,
  /const visibleResults = hasSearchQuery[\s\S]*?browseOpen[\s\S]*?browseResults[\s\S]*?data-testid=\{[\s\S]*?floor-plan-library-browse-results/,
  "The imported library browser should render its browse results without requiring a search query."
);

const planPanelSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx"),
  "utf8"
);
assert.match(
  planPanelSource,
  /\{filteredPlanTemplates\.length\} starter layouts[\s\S]*?Or browse starter layouts/,
  "The picker should distinguish starter-layout counts from imported floor plans."
);

console.log("Floor-plan library and address search checks passed.");
