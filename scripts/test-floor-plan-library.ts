import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  browseReviewOnlyFloorPlanLibrary as browseFloorPlanLibrary,
  normalizeFloorPlanAddress,
  parseFloorPlanUnitNumber,
  searchReviewOnlyFloorPlanLibrary as searchFloorPlanLibrary,
} from "@/lib/floor-plan-address-search";
import {
  buildHouseRoomAdjacencyGuides,
  doesHouseRoomOverlap,
  resolveHousePlanTemplateOpeningMetrics,
  type HousePlanRoom2D,
  type HousePlanTemplateDoorway,
  type HousePlanTemplateReferenceZone,
  type HousePlanTemplateRoom,
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
  pingYiCourt.publication,
  {
    status: "draft",
    visibility: "review_only",
    accuracy_notice: pingYiCourt.publication.accuracy_notice,
  },
  "The Ping Yi compatibility catalog must remain an internal review fixture."
);
assert.equal(
  pingYiCourt.source.license_status,
  "unknown",
  "Unknown source rights must be preserved instead of fabricated as approval."
);
const falselyPublishedCatalog = structuredClone(pingYiCourt) as unknown as {
  publication: { status: string; visibility: string; accuracy_notice: string };
};
falselyPublishedCatalog.publication.status = "published";
falselyPublishedCatalog.publication.visibility = "public";
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(falselyPublishedCatalog).success,
  false,
  "A schema-v1 YAML compatibility catalog must not be able to claim public publication."
);
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
const pingYiSourceManifest = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "catalog",
      "floor-plans",
      "sg",
      "hdb",
      "ping-yi-court",
      "source-manifest.json"
    ),
    "utf8"
  )
) as {
  schema_version: number;
  fixture_kind: string;
  plan_id: string;
  coordinate_unit: string;
  verification_status: string;
  source: { url: string; sha256: string; page_count: number };
  official_brochure: {
    url: string;
    sha256: string;
    page_count: number;
    unit_distribution_pdf_pages: number[];
    unit_distribution_brochure_pages: number[];
  };
  stack_bindings: Array<{
    block: string;
    stacks: string[];
    layout_id: string;
    transform: string;
  }>;
  layouts: Array<{
    layout_id: string;
    source_page: number;
    printed_dimensions_mm: number[];
    catalog_room_assertions?: Array<Record<string, string | number>>;
    catalog_polygon_assertions?: Array<{
      room_id: string;
      global_points_mm: number[][];
      evidence: string;
    }>;
    catalog_opening_assertions?: Array<
      Record<string, string | number | null>
    >;
    catalog_reference_zone_assertions?: Array<
      Record<string, string | number>
    >;
    opening_semantics?: Array<{
      id: string;
      operation: string;
      evidence: string;
    }>;
    unresolved?: string[];
  }>;
};

function toSourceMillimetres(metres: number): number {
  return Math.round(metres * 10_000) / 10;
}

assert.equal(pingYiSourceManifest.schema_version, 2);
assert.equal(pingYiSourceManifest.fixture_kind, "floor_plan_source_manifest");
assert.equal(pingYiSourceManifest.plan_id, pingYiCourt.floor_plan.plan_id);
assert.equal(pingYiSourceManifest.coordinate_unit, "millimetre");
assert.equal(
  pingYiSourceManifest.verification_status,
  "needs_review",
  "A brochure tracing must not claim source verification before independent review."
);
assert.equal(pingYiSourceManifest.source.url, pingYiCourt.source.source_url);
assert.equal(pingYiSourceManifest.source.sha256, pingYiCourt.source.sha256);
assert.equal(pingYiSourceManifest.source.page_count, 7);
const officialBrochure = pingYiCourt.source.corroborating_sources.find(
  (source) => source.publisher === "Housing and Development Board"
);
assert.ok(officialBrochure);
assert.equal(
  pingYiSourceManifest.official_brochure.url,
  officialBrochure.source_url
);
assert.equal(
  pingYiSourceManifest.official_brochure.sha256,
  "c222a058459f0128cc8046d039b2b7559e0cb36fd030ac9160d3a1807041be00"
);
assert.equal(pingYiSourceManifest.official_brochure.sha256, officialBrochure.sha256);
assert.equal(pingYiSourceManifest.official_brochure.page_count, 24);
assert.equal(pingYiSourceManifest.official_brochure.page_count, officialBrochure.page_count);
assert.deepEqual(pingYiSourceManifest.official_brochure.unit_distribution_pdf_pages, [10, 11]);
assert.deepEqual(
  pingYiSourceManifest.official_brochure.unit_distribution_brochure_pages,
  [17, 18, 19]
);
assert.deepEqual(pingYiCourt.unit_distribution_source?.pdf_pages, [10, 11]);
assert.deepEqual(pingYiCourt.unit_distribution_source?.brochure_pages, [17, 18, 19]);
assert.equal(
  pingYiCourt.unit_distribution_source?.sha256,
  pingYiSourceManifest.official_brochure.sha256
);
assert.equal(
  pingYiCourt.unit_distribution_source?.page_count,
  pingYiSourceManifest.official_brochure.page_count
);
assert.deepEqual(
  pingYiSourceManifest.layouts.map(({ layout_id, source_page }) => ({
    layout_id,
    source_page,
  })),
  pingYiCourt.layouts.map(({ layout_id, source_page }) => ({
    layout_id,
    source_page,
  })),
  "The independent source manifest must cover every catalog layout and source page."
);

const allowedEvidence = new Set([
  "explicit_dimension",
  "derived_dimension",
  "scale_traced",
  "official_specification",
]);
for (const manifestLayout of pingYiSourceManifest.layouts) {
  assert.ok(
    manifestLayout.printed_dimensions_mm.every(
      (dimension) => Number.isInteger(dimension) && dimension > 0
    ),
    `${manifestLayout.layout_id} printed dimensions must remain positive integer millimetres.`
  );
  const result = geometryResults.find(
    (candidate) => candidate.layoutId === manifestLayout.layout_id
  );
  assert.ok(result, `Missing runtime template for ${manifestLayout.layout_id}.`);

  for (const expectation of manifestLayout.catalog_room_assertions ?? []) {
    assert.ok(allowedEvidence.has(String(expectation.evidence)));
    const room: HousePlanTemplateRoom | undefined = result.template.rooms.find(
      (candidate) => candidate.id === expectation.room_id
    );
    assert.ok(room, `${manifestLayout.layout_id} is missing room ${expectation.room_id}.`);
    const actualByManifestKey: Record<string, number> = {
      width_mm: toSourceMillimetres(room.width),
      depth_mm: toSourceMillimetres(room.depth),
      center_x_mm: toSourceMillimetres(room.x),
      center_z_mm: toSourceMillimetres(room.z),
    };
    for (const key of ["width_mm", "depth_mm", "center_x_mm", "center_z_mm"]) {
      if (expectation[key] === undefined) continue;
      assert.equal(
        actualByManifestKey[key],
        expectation[key],
        `${manifestLayout.layout_id}:${expectation.room_id} ${key} diverges from its source manifest.`
      );
    }
  }

  for (const expectation of manifestLayout.catalog_polygon_assertions ?? []) {
    assert.ok(allowedEvidence.has(expectation.evidence));
    const room: HousePlanTemplateRoom | undefined = result.template.rooms.find(
      (candidate) => candidate.id === expectation.room_id
    );
    assert.ok(room?.planPolygon);
    assert.deepEqual(
      room.planPolygon.map((point) => [
        toSourceMillimetres(room.x + point.x),
        toSourceMillimetres(room.z + point.z),
      ]),
      expectation.global_points_mm,
      `${manifestLayout.layout_id}:${expectation.room_id} polygon diverges from the registered source anchors.`
    );
  }

  for (const expectation of manifestLayout.catalog_opening_assertions ?? []) {
    assert.ok(allowedEvidence.has(String(expectation.evidence)));
    const opening: HousePlanTemplateDoorway | undefined = result.template.doorways.find(
      (candidate) =>
        candidate.fromRoomId === expectation.from_room_id &&
        (candidate.toRoomId ?? null) === expectation.to_room_id &&
        candidate.wall === expectation.wall &&
        candidate.kind === expectation.kind
    );
    assert.ok(
      opening,
      `${manifestLayout.layout_id} is missing source opening ${expectation.from_room_id} -> ${expectation.to_room_id ?? "outside"}.`
    );
    assert.equal(toSourceMillimetres(opening.widthMeters ?? 0.9), expectation.width_mm);
    assert.equal(toSourceMillimetres(opening.offsetMeters ?? 0), expectation.offset_mm);
  }

  for (const expectation of manifestLayout.catalog_reference_zone_assertions ?? []) {
    assert.ok(allowedEvidence.has(String(expectation.evidence)));
    const zone: HousePlanTemplateReferenceZone | undefined = result.template.referenceZones?.find(
      (candidate) => candidate.id === expectation.zone_id
    );
    assert.ok(
      zone,
      `${manifestLayout.layout_id} is missing source reference zone ${expectation.zone_id}.`
    );
    if (expectation.width_mm !== undefined) {
      assert.equal(toSourceMillimetres(zone.width), expectation.width_mm);
    }
    if (expectation.depth_mm !== undefined) {
      assert.equal(toSourceMillimetres(zone.depth), expectation.depth_mm);
    }
    assert.equal(zone.locked, true, "Source-only structural zones must not be furnishable rooms.");
  }

  if (
    [
      ...(manifestLayout.catalog_room_assertions ?? []),
      ...(manifestLayout.catalog_reference_zone_assertions ?? []),
    ].some((expectation) => expectation.evidence === "scale_traced")
  ) {
    assert.ok(
      (manifestLayout.unresolved?.length ?? 0) > 0,
      `${manifestLayout.layout_id} must disclose scale-traced, unprinted measurements.`
    );
  }

  const expectedOperations = manifestLayout.opening_semantics ?? [];
  for (const operation of ["sliding", "folding", "fixed", "open"] as const) {
    const expectedCount = expectedOperations.filter(
      (semantic) => semantic.operation === operation
    ).length;
    if (expectedCount === 0) continue;
    const actualCount = result.template.doorways.filter(
      (doorway) => doorway.operation === operation
    ).length;
    assert.ok(
      actualCount >= expectedCount,
      `${manifestLayout.layout_id} must preserve its ${operation} opening semantics in the runtime template.`
    );
  }
  if (expectedOperations.some((semantic) => semantic.operation === "louvre")) {
    assert.ok(
      result.template.windows.some(
        (window) => window.kind === "louvre" && window.operation === "fixed"
      ),
      `${manifestLayout.layout_id} must preserve its source-supported fixed louvre.`
    );
  }
}

assert.deepEqual(
  pingYiSourceManifest.stack_bindings.find(
    (binding) => binding.block === "810A" && binding.layout_id === "3gen"
  ),
  {
    block: "810A",
    stacks: ["509", "527"],
    floor_ranges: [{ from: 2, to: 15 }],
    layout_id: "3gen",
    evidence: "official_unit_distribution",
    transform: "needs_review",
  },
  "The source fixture must preserve the corrected 3Gen stack mapping without inventing a transform."
);
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
    doorway.operation,
  ]),
  [
    ["bedroom", 0.955, 1.2, "sliding"],
    ["bathroom", -0.29, 0.8, "folding"],
    ["shelter", 0, 0.7, "swing"],
  ],
  "The bedroom partition, folding bathroom door, and 700 mm shelter door should retain their page-1 semantics and positions."
);
assert.ok(
  twoRoomTypeOneDoorways.some(
    (doorway) =>
      doorway.fromRoomId === "kitchen" &&
      doorway.toRoomId === "living_dining" &&
      doorway.wall === "east" &&
      doorway.kind === "opening" &&
      doorway.operation === "open" &&
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
      width: 1.425, depth: 2.4, x: 5.5575, z: 7.53,
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
  [["aircon_ledge", true], ["service_strip", true], ["entry_structure", true]],
  "Exterior, service-strip, and structural source zones should remain locked and outside room counts."
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

const validWideOpenPassage = structuredClone(pingYiCourt);
const validWideOpening = validWideOpenPassage.layouts[0].template.doorways.find(
  (doorway) => doorway.kind === "opening"
);
assert.ok(validWideOpening);
validWideOpening.width_meters = 5.065;
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(validWideOpenPassage).success,
  true,
  "The catalog schema must support full-width open-plan boundaries wider than a conventional door."
);

const invalidWidePhysicalDoor = structuredClone(pingYiCourt);
invalidWidePhysicalDoor.layouts[0].template.doorways[0].width_meters = 5.065;
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidWidePhysicalDoor).success,
  false,
  "A physical door must remain capped at 4 metres even though open passages may be wider."
);

const invalidOversizedPassage = structuredClone(pingYiCourt);
const invalidOversizedOpening = invalidOversizedPassage.layouts[0].template.doorways.find(
  (doorway) => doorway.kind === "opening"
);
assert.ok(invalidOversizedOpening);
invalidOversizedOpening.width_meters = 12.001;
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidOversizedPassage).success,
  false,
  "Unbounded opening widths must still be rejected."
);

const invalidOpeningOperation = structuredClone(pingYiCourt);
const openingWithSwing = invalidOpeningOperation.layouts[0].template.doorways.find(
  (doorway) => doorway.kind === "opening"
);
assert.ok(openingWithSwing);
openingWithSwing.operation = "swing";
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidOpeningOperation).success,
  false,
  "An open passage must not claim a hinged-door operation."
);

const invalidDoorOperation = structuredClone(pingYiCourt);
invalidDoorOperation.layouts[0].template.doorways[0].operation = "open";
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidDoorOperation).success,
  false,
  "The open operation must not be attached to a physical door."
);

const threeRoomLouvre = geometryResults
  .find((result) => result.layoutId === "3-room")
  ?.template.windows.find((window) => window.roomId === "kitchen_utility");
assert.deepEqual(
  threeRoomLouvre,
  {
    roomId: "kitchen_utility",
    wall: "west",
    offsetMeters: 0.4,
    widthMeters: 0.8,
    kind: "louvre",
    operation: "fixed",
  },
  "The source-supported service-strip aperture must remain a fixed louvre, not a generic window."
);

const invalidMovingLouvre = structuredClone(pingYiCourt);
const louvre = invalidMovingLouvre.layouts
  .find((layout) => layout.layout_id === "3-room")
  ?.template.windows.find((window) => window.kind === "louvre");
assert.ok(louvre);
louvre.operation = "sliding";
assert.equal(
  floorPlanLibraryCatalogSchema.safeParse(invalidMovingLouvre).success,
  false,
  "Louvres and vents must stay fixed in the v1 compatibility schema."
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
  assert.equal(results.length, expectedCount, `${block} should resolve its review-fixture flat types.`);
  assert.ok(
    results.every((result) => result.matchedBlocks.length === 1 && result.matchedBlocks[0] === block),
    `${block} results should not claim another block.`
  );
  assert.ok(results.every((result) => result.matchLevel === "block"));
  assert.ok(results.every((result) => result.unitMatches.length === 0));
}

const streetResults = searchFloorPlanLibrary(catalogs, "Chai Chee Street");
assert.equal(streetResults.length, 7, "Internal review should resolve all seven brochure variants.");
assert.ok(streetResults.every((result) => result.matchLevel === "street"));

const browsableResults = browseFloorPlanLibrary(catalogs);
assert.equal(
  browsableResults.length,
  7,
  "Internal review should expose every Ping Yi Court fixture without an address query."
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
  searchFloorPlanLibrary(catalogs, "810A Chai Chee St #12-501").map(
    (result) => result.configuration
  ),
  [
    {
      groupId: "2-room-flexi-type-2",
      optionId: "open-flex",
      label: "Open dining configuration",
      defaultSelected: true,
    },
    {
      groupId: "2-room-flexi-type-2",
      optionId: "partitioned-flex",
      label: "Partitioned flex-room configuration",
      defaultSelected: false,
    },
  ],
  "Source-supported configurations should be explicit before a consumer applies one."
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
const addressFieldsSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "FloorPlanAddressFields.tsx"),
  "utf8"
);
const resultListSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "FloorPlanCatalogResultList.tsx"),
  "utf8"
);
assert.match(
  addressSearchSource,
  /new URLSearchParams\(\{ browse: "1", limit: "12" \}\)[\s\S]*?fetch\(`\/api\/floor-plans\?\$\{params\}`\)/,
  "The address library should load and expose a visible approved-floor-plan browser."
);
assert.match(addressFieldsSource, /Browse approved floor plans/);
assert.doesNotMatch(
  addressSearchSource,
  /onApplyPlanTemplate\(result\.template\)/,
  "Consumer UI must not retain a direct apply path for review-only YAML templates."
);
assert.match(
  addressSearchSource,
  /const sourceResults = hasSearchQuery \? results : browseOpen \? browseResults : \[\][\s\S]*?<FloorPlanCatalogResultList/,
  "The approved library browser should render its browse results without requiring a search query."
);
assert.match(
  resultListSource,
  /data-testid=\{testId\}[\s\S]*?Start a new design[\s\S]*?Replace current plan/,
  "Extracted result cards should keep non-destructive start-new as the primary action."
);

const adminQueueSource = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "floor-plans", "page.tsx"),
  "utf8"
);
const adminFixturePanelSource = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "floor-plans", "AdminFloorPlanFixturePanel.tsx"),
  "utf8"
);
assert.match(adminQueueSource, /<AdminFloorPlanFixturePanel/);
assert.match(adminFixturePanelSource, /Review-only YAML fixtures/);
assert.match(adminFixturePanelSource, /getAllFloorPlanLibraryCatalogs/);
assert.match(adminFixturePanelSource, /catalog\.layouts\.map/);

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
