import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FloorPlanDocumentValidationErrorV2,
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import {
  applyFloorPlanAddressTransformV2,
  canonicalFloorPlanToDesignSnapshot,
} from "@/lib/floor-plan-legacy-adapters";
import {
  buildHousePlan2D,
  resolveHouseRoomFloorElevationMeters,
} from "@/lib/design-page-house-plan";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import {
  addFloorElevationToItemPosition,
  removeFloorElevationFromItemPosition,
  resolveCanonicalFloorElevationMeters,
} from "@/lib/floor-plan-scene-elevation";
import {
  buildCanonicalFloorPlanRenderModel,
  resolveCanonicalFloorPlan2DActiveFloor,
} from "@/lib/floor-plan-render-model";

const sourceId = "multifloor-source";
const provenance = (): FloorPlanEntityProvenanceV2 => ({
  confidence: 0.98,
  extractionVersion: "multifloor-parity-test-1",
  evidence: [
    {
      sourceId,
      basis: "vector_traced",
      confidence: 0.98,
      extractorVersion: "multifloor-parity-test-1",
      pageNumber: 1,
    },
  ],
  reviewHistory: [],
});
const measured = (valueMm: number) => ({
  valueMm,
  evidence: "source_documented" as const,
  provenance: provenance(),
});

function makeFloor({
  prefix,
  levelIndex,
  elevationMm,
  storeyHeightMm,
  slabThicknessMm,
  wallHeightMm,
}: {
  prefix: string;
  levelIndex: number;
  elevationMm: number;
  storeyHeightMm: number;
  slabThicknessMm: number;
  wallHeightMm: number;
}): FloorPlanFloorV2 {
  const vertexIds = ["north-west", "north-east", "south-east", "south-west"].map(
    (suffix) => `${prefix}:${suffix}`
  );
  const wallIds = ["north", "east", "south", "west"].map(
    (suffix) => `${prefix}:wall:${suffix}`
  );
  const roomId = `${prefix}:room`;
  return {
    id: `${prefix}:floor`,
    name: `${prefix} floor`,
    levelIndex,
    elevationMm,
    storeyHeightMm,
    slabThicknessMm,
    defaults: {
      wallHeight: measured(wallHeightMm),
      doorHeight: measured(2100),
      windowHeight: measured(1200),
      windowSillHeight: measured(900),
    },
    calibrations: [],
    vertices: [
      [vertexIds[0], 0, 0],
      [vertexIds[1], 4000, 0],
      [vertexIds[2], 4000, 3000],
      [vertexIds[3], 0, 3000],
    ].map(([id, xMm, zMm]) => ({
      id: id as string,
      xMm: xMm as number,
      zMm: zMm as number,
      provenance: provenance(),
    })),
    walls: [
      [wallIds[0], vertexIds[0], vertexIds[1]],
      [wallIds[1], vertexIds[1], vertexIds[2]],
      [wallIds[2], vertexIds[2], vertexIds[3]],
      [wallIds[3], vertexIds[3], vertexIds[0]],
    ].map(([id, startVertexId, endVertexId]) => ({
      id,
      path: { kind: "line" as const, startVertexId, endVertexId },
      thicknessMm: 180,
      classification: "exterior" as const,
      adjacentRoomIds: [roomId],
      provenance: provenance(),
    })),
    rooms: [
      {
        id: roomId,
        name: `${prefix} room`,
        roomType: "living",
        wallLoops: [
          {
            kind: "outer",
            walls: wallIds.map((wallId) => ({
              wallId,
              direction: "forward" as const,
            })),
          },
        ],
        provenance: provenance(),
      },
    ],
    openings: [
      {
        id: `${prefix}:opening`,
        wallId: wallIds[0],
        kind: "door",
        operation: "swing",
        offsetMm: 1000,
        widthMm: 900,
        hinge: "start",
        handing: "left",
        provenance: provenance(),
      },
    ],
    structures: [
      {
        id: `${prefix}:structure`,
        name: `${prefix} structural core`,
        kind: "structural_core",
        vertexIds,
        baseOffsetMm: 0,
        heightMm: wallHeightMm,
        locked: true,
        provenance: provenance(),
      },
    ],
    annotations: [],
    dimensions: [],
  };
}

const lowerFloor = makeFloor({
  prefix: "lower",
  levelIndex: 0,
  elevationMm: 0,
  storeyHeightMm: 3000,
  slabThicknessMm: 160,
  wallHeightMm: 2700,
});
const upperFloor = makeFloor({
  prefix: "upper",
  levelIndex: 1,
  // Deliberately not derived from either floor's storey height.
  elevationMm: 3475,
  storeyHeightMm: 3225,
  slabThicknessMm: 225,
  wallHeightMm: 2875,
});
const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "multifloor-home",
  revisionId: "multifloor-home:revision:1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [
    {
      id: sourceId,
      kind: "pdf",
      name: "Multi-floor parity fixture",
      mimeType: "application/pdf",
      sha256: "d".repeat(64),
      pageCount: 1,
    },
  ],
  floors: [lowerFloor, upperFloor],
};

const offsetDocument = structuredClone(document);
for (const vertex of offsetDocument.floors[1].vertices) {
  vertex.xMm += 1000;
  vertex.zMm += 500;
}
offsetDocument.floors[0].calibrations = [
  {
    id: "lower-registration",
    sourceId,
    pageNumber: 1,
    imageWidthPx: 600,
    imageHeightPx: 400,
    controlPoints: [
      { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
      { sourcePx: { x: 400, y: 0 }, planMm: { xMm: 4000, zMm: 0 } },
    ],
    rmsErrorPx: 0,
  },
];
offsetDocument.floors[1].calibrations = [
  {
    id: "upper-registration",
    sourceId,
    pageNumber: 1,
    imageWidthPx: 600,
    imageHeightPx: 400,
    controlPoints: [
      { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 1000, zMm: 500 } },
      { sourcePx: { x: 400, y: 0 }, planMm: { xMm: 5000, zMm: 500 } },
    ],
    rmsErrorPx: 0,
  },
];
const rotatedOffsetDocument = applyFloorPlanAddressTransformV2(
  offsetDocument,
  "rotate_90"
);
const rotatedLowerOrigin = rotatedOffsetDocument.floors[0].vertices[0];
const rotatedUpperOrigin = rotatedOffsetDocument.floors[1].vertices[0];
assert.deepEqual(
  {
    xMm: rotatedUpperOrigin.xMm - rotatedLowerOrigin.xMm,
    zMm: rotatedUpperOrigin.zMm - rotatedLowerOrigin.zMm,
  },
  { xMm: -500, zMm: 1000 },
  "A document transform must preserve the rotated offset between storeys."
);
const rotatedLowerRegistration =
  rotatedOffsetDocument.floors[0].calibrations[0].controlPoints[0].planMm;
const rotatedUpperRegistration =
  rotatedOffsetDocument.floors[1].calibrations[0].controlPoints[0].planMm;
assert.deepEqual(
  {
    xMm: rotatedUpperRegistration.xMm - rotatedLowerRegistration.xMm,
    zMm: rotatedUpperRegistration.zMm - rotatedLowerRegistration.zMm,
  },
  { xMm: -500, zMm: 1000 },
  "Source registrations must retain the same inter-storey transform as geometry."
);
assert.deepEqual(
  rotatedOffsetDocument.floors[1].calibrations[0].controlPoints[0].sourcePx,
  { x: 0, y: 0 },
  "Address transforms must never mutate source-pixel evidence."
);

const compiled = compileFloorPlanDocumentV2(document);
const renderModel = buildCanonicalFloorPlanRenderModel(compiled);
const lower2DFloor = resolveCanonicalFloorPlan2DActiveFloor(renderModel, {
  floorId: lowerFloor.id,
  floorLevel: lowerFloor.levelIndex + 1,
});
const upper2DFloor = resolveCanonicalFloorPlan2DActiveFloor(renderModel, {
  floorId: upperFloor.id,
  floorLevel: upperFloor.levelIndex + 1,
});
assert.equal(lower2DFloor?.id, lowerFloor.id);
assert.equal(upper2DFloor?.id, upperFloor.id);
assert.deepEqual(
  lower2DFloor?.walls.map((wall) => wall.id),
  lowerFloor.walls.map((wall) => wall.id).sort(),
  "The lower-floor 2D scene must expose lower-floor wall IDs only."
);
assert.deepEqual(
  upper2DFloor?.walls.map((wall) => wall.id),
  upperFloor.walls.map((wall) => wall.id).sort(),
  "Switching floors must replace every overlapping 2D wall with the upper-floor IDs."
);
assert.deepEqual(
  lower2DFloor?.structures.map((structure) => structure.id),
  lowerFloor.structures.map((structure) => structure.id),
  "Hidden-floor structures must not enter the active 2D render set."
);
assert.deepEqual(
  upper2DFloor?.walls.flatMap((wall) =>
    wall.openings.map((opening) => opening.id)
  ),
  upperFloor.openings.map((opening) => opening.id),
  "Hidden-floor openings must not enter the active 2D hit-target set."
);
assert.equal(
  resolveCanonicalFloorPlan2DActiveFloor(renderModel, {
    floorId: lowerFloor.id,
    floorLevel: upperFloor.levelIndex + 1,
  }),
  null,
  "Conflicting floor ID and level must fail closed instead of rendering two overlapping floors."
);
assert.equal(
  resolveCanonicalFloorPlan2DActiveFloor(renderModel, {}),
  null,
  "A multi-floor 2D scene must never choose an implicit first floor."
);
assert.equal(
  resolveCanonicalFloorPlan2DActiveFloor(
    { ...renderModel, floors: [renderModel.floors[0]] },
    {}
  )?.id,
  lowerFloor.id,
  "Legacy single-floor snapshots retain a safe compatibility fallback."
);
const compiledUpper = compiled.floors.find((floor) => floor.id === upperFloor.id)!;
assert.equal(compiledUpper.elevationMm, 3475);
assert.equal(compiledUpper.storeyHeightMm, 3225);
assert.equal(compiledUpper.slabThicknessMm, 225);
assert.equal(compiledUpper.walls[0].heightMm, 2875);

const { snapshot } = canonicalFloorPlanToDesignSnapshot(document);
const upperRoom = snapshot.rooms.find((room) => room.id === "upper:room")!;
assert.equal(upperRoom.floorLevel, 2);
assert.equal(upperRoom.floorElevationMm, 3475);
assert.equal(upperRoom.floorStoreyHeightMm, 3225);
assert.equal(upperRoom.floorSlabThicknessMm, 225);
assert.equal(upperRoom.geometry.height, 2.875);
assert.equal(upperRoom.geometry.slabThickness, 0.225);

upperRoom.items = [
  {
    instanceId: "upper-chair",
    productId: "test-chair",
    variantId: "default",
    position: [0.25, 0.125, -0.5],
  },
];
const restored = storedToSnapshot(
  JSON.parse(JSON.stringify(snapshotToStored(snapshot)))
);
const restoredUpperRoom = restored.rooms.find((room) => room.id === "upper:room")!;
assert.equal(restoredUpperRoom.floorElevationMm, 3475);
assert.equal(restoredUpperRoom.floorStoreyHeightMm, 3225);
assert.equal(restoredUpperRoom.floorSlabThicknessMm, 225);

const housePlan = buildHousePlan2D(restored.rooms, 4, 3);
const upperHouseRoom = housePlan.rooms.find((room) => room.id === "upper:room")!;
assert.equal(upperHouseRoom.floorElevationMm, 3475);
assert.equal(upperHouseRoom.floorStoreyHeightMm, 3225);
assert.equal(upperHouseRoom.floorSlabThicknessMm, 225);
assert.equal(upperHouseRoom.slabThickness, 0.225);
assert.equal(
  resolveHouseRoomFloorElevationMeters(upperHouseRoom, 2.875, false),
  3.475,
  "Canonical elevation must align room floors with canonical walls even outside legacy stacked mode."
);
assert.equal(
  resolveHouseRoomFloorElevationMeters(upperHouseRoom, 2.875, true),
  3.475,
  "Non-uniform canonical elevations must never be replaced by display spacing."
);
assert.equal(3.475 + upperHouseRoom.height!, 6.35);

const floorElevationMeters = resolveCanonicalFloorElevationMeters(restoredUpperRoom);
assert.equal(floorElevationMeters, 3.475);
const localItemPosition = restoredUpperRoom.items[0].position;
const worldItemPosition = addFloorElevationToItemPosition(
  localItemPosition,
  floorElevationMeters!
);
assert.deepEqual(worldItemPosition, [0.25, 3.6, -0.5]);
assert.deepEqual(
  removeFloorElevationFromItemPosition(worldItemPosition, floorElevationMeters!),
  localItemPosition,
  "Furniture world elevation must round-trip without changing room-local saved coordinates."
);

const source = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const houseRenderer = source("components/editor/renderers/HousePlanRenderer3D.tsx");
assert.match(
  houseRenderer,
  /const floorYOffset = resolveHouseRoomFloorElevationMeters\(/,
  "Room floors and ceilings must use the same exact canonical elevation as canonical walls."
);
const sceneReadModel = source("lib/useDesignPageSceneReadModel.ts");
assert.match(
  sceneReadModel,
  /roomFloorElevationMeters:\s*resolveCanonicalFloorElevationMeters\(/,
  "Furniture scene entries must carry the canonical room elevation."
);
const itemsLayer = source("components/editor/design-page/SceneItemsLayer.tsx");
assert.match(
  itemsLayer,
  /addFloorElevationToItemPosition/,
  "3D furniture must add the exact canonical finished-floor elevation."
);
assert.match(
  itemsLayer,
  /removeFloorElevationFromItemPosition/,
  "Furniture edits must convert world Y back to room-local Y before persistence."
);
const canonicalRenderer = source(
  "components/editor/renderers/CanonicalFloorPlanStructure.tsx"
);
const canonical2DRenderer = canonicalRenderer.slice(
  canonicalRenderer.indexOf("export function CanonicalFloorPlanWalls2D"),
  canonicalRenderer.indexOf("type CanonicalFloorPlanWalls3DProps")
);
assert.match(
  canonical2DRenderer,
  /resolveCanonicalFloorPlan2DActiveFloor\(model/,
  "The 2D renderer must resolve one explicit active canonical floor."
);
assert.doesNotMatch(
  canonical2DRenderer,
  /model\.floors\.flatMap/,
  "The 2D renderer must not emit geometry or interactions from every floor."
);
assert.match(
  canonical2DRenderer,
  /activeFloor\?\.structures\.map/,
  "Only active-floor structures may be emitted in 2D."
);
assert.match(
  canonical2DRenderer,
  /activeFloor\?\.walls\.flatMap/,
  "Only active-floor walls and openings may be emitted or hit-tested in 2D."
);
assert.match(
  canonicalRenderer.slice(
    canonicalRenderer.indexOf("export function CanonicalFloorPlanWalls3D")
  ),
  /model\.floors\.flatMap/,
  "3D must continue preserving every canonical floor and its authored elevation."
);

const duplicateCollections = [
  "vertices",
  "walls",
  "rooms",
  "openings",
  "structures",
] as const;
for (const collection of duplicateCollections) {
  const duplicate = structuredClone(document);
  duplicate.floors[1][collection][0].id = duplicate.floors[0][collection][0].id;
  const issues = validateFloorPlanDocumentV2(duplicate);
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "DUPLICATE_GLOBAL_ENTITY_ID" &&
        issue.path === `floors[1].${collection}[0].id`
    ),
    `${collection} IDs must be document-global.`
  );
  assert.throws(
    () => compileFloorPlanDocumentV2(duplicate),
    FloorPlanDocumentValidationErrorV2
  );
}

console.log("Floor-plan multi-floor parity checks passed.");
