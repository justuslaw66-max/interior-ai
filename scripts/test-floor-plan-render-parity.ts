import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildCanonicalFloorPlanRenderModel,
  compileCanonicalFloorPlanRenderModel,
} from "@/lib/floor-plan-render-model";
import {
  buildCanonicalFloorSlabPolygons,
  buildCanonicalWallUnionBands,
} from "@/lib/floor-plan-watertight-geometry";
import {
  buildPlanarUnionPolygons,
  isPointInPlanarRing,
} from "@/lib/floor-plan-planar-union";
import {
  canonicalWallCutawayKey,
  resolveCanonicalCameraCutawayWallKeys,
} from "@/lib/floor-plan-camera-cutaway";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

const provenance: FloorPlanEntityProvenanceV2 = {
  confidence: 0.95,
  extractionVersion: "parity-test-1",
  evidence: [
    {
      sourceId: "source-1",
      basis: "vector_traced",
      confidence: 0.95,
      extractorVersion: "parity-test-1",
      pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 20, heightPx: 20 },
    },
  ],
  reviewHistory: [],
};

const cloneProvenance = () => structuredClone(provenance);
const measured = (valueMm: number) => ({
  valueMm,
  evidence: "assumed" as const,
  provenance: cloneProvenance(),
});

const floor: FloorPlanFloorV2 = {
  id: "floor-1",
  name: "Level 1",
  levelIndex: 0,
  elevationMm: 0,
  storeyHeightMm: 2800,
  slabThicknessMm: 150,
  defaults: {
    wallHeight: measured(2600),
    doorHeight: measured(2100),
    windowHeight: measured(1200),
    windowSillHeight: measured(900),
  },
  calibrations: [],
  vertices: [
    { id: "v0", xMm: 0, zMm: 0, provenance: cloneProvenance() },
    { id: "v1", xMm: 5000, zMm: 0, provenance: cloneProvenance() },
    { id: "v2", xMm: 5000, zMm: 4000, provenance: cloneProvenance() },
    { id: "v3", xMm: 0, zMm: 4000, provenance: cloneProvenance() },
    { id: "arc-start", xMm: 1800, zMm: 1800, provenance: cloneProvenance() },
    { id: "arc-end", xMm: 3200, zMm: 1800, provenance: cloneProvenance() },
    { id: "arc-center", xMm: 2500, zMm: 1800, provenance: cloneProvenance() },
    { id: "shaft-v0", xMm: 4200, zMm: 3000, provenance: cloneProvenance() },
    { id: "shaft-v1", xMm: 4700, zMm: 3000, provenance: cloneProvenance() },
    { id: "shaft-v2", xMm: 4700, zMm: 3700, provenance: cloneProvenance() },
    { id: "shaft-v3", xMm: 4200, zMm: 3700, provenance: cloneProvenance() },
  ],
  walls: [
    {
      id: "wall-north",
      path: { kind: "line", startVertexId: "v0", endVertexId: "v1" },
      thicknessMm: 180,
      classification: "exterior",
      adjacentRoomIds: ["living"],
      provenance: cloneProvenance(),
    },
    {
      id: "wall-east",
      path: { kind: "line", startVertexId: "v1", endVertexId: "v2" },
      thicknessMm: 230,
      classification: "structural",
      adjacentRoomIds: ["living"],
      provenance: cloneProvenance(),
    },
    {
      id: "wall-south",
      path: { kind: "line", startVertexId: "v2", endVertexId: "v3" },
      thicknessMm: 180,
      classification: "exterior",
      adjacentRoomIds: ["living"],
      provenance: cloneProvenance(),
    },
    {
      id: "wall-west",
      path: { kind: "line", startVertexId: "v3", endVertexId: "v0" },
      thicknessMm: 180,
      classification: "exterior",
      adjacentRoomIds: ["living"],
      provenance: cloneProvenance(),
    },
    {
      id: "wall-curved-partition",
      path: {
        kind: "arc",
        startVertexId: "arc-start",
        endVertexId: "arc-end",
        centerVertexId: "arc-center",
        clockwise: true,
      },
      thicknessMm: 110,
      classification: "partition",
      adjacentRoomIds: [],
      provenance: cloneProvenance(),
    },
  ],
  rooms: [
    {
      id: "living",
      name: "Living / Dining",
      roomType: "living",
      wallLoops: [
        {
          kind: "outer",
          walls: [
            { wallId: "wall-north", direction: "forward" },
            { wallId: "wall-east", direction: "forward" },
            { wallId: "wall-south", direction: "forward" },
            { wallId: "wall-west", direction: "forward" },
          ],
        },
      ],
      provenance: cloneProvenance(),
    },
  ],
  openings: [
    {
      id: "main-door",
      wallId: "wall-north",
      kind: "door",
      operation: "swing",
      offsetMm: 1000,
      widthMm: 900,
      hinge: "start",
      handing: "left",
      provenance: cloneProvenance(),
    },
    {
      id: "east-window",
      wallId: "wall-east",
      kind: "window",
      operation: "fixed",
      offsetMm: 800,
      widthMm: 1600,
      hinge: "none",
      handing: "none",
      provenance: cloneProvenance(),
    },
  ],
  structures: [
    {
      id: "service-shaft",
      name: "Service shaft",
      kind: "shaft",
      vertexIds: ["shaft-v0", "shaft-v1", "shaft-v2", "shaft-v3"],
      baseOffsetMm: 0,
      heightMm: 2600,
      locked: true,
      provenance: cloneProvenance(),
    },
  ],
  annotations: [],
  dimensions: [],
};

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "parity-home",
  revisionId: "parity-revision-1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [
    {
      id: "source-1",
      kind: "pdf",
      name: "Parity fixture",
      mimeType: "application/pdf",
      sha256: "a".repeat(64),
      pageCount: 1,
    },
  ],
  floors: [floor],
};

const compiled = compileFloorPlanDocumentV2(document);
const fromCompiledScene = buildCanonicalFloorPlanRenderModel(compiled);
assert.equal(
  fromCompiledScene.compiledScene,
  compiled,
  "The render model must retain the single compiler scene object consumed by both views."
);
assert.equal(fromCompiledScene.geometryHash, compiled.geometryHash);

const model = compileCanonicalFloorPlanRenderModel(document, compiled.geometryHash);
assert.equal(model.geometryHash, compiled.geometryHash);
assert.equal(model.revisionId, document.revisionId);
assert.deepEqual(
  model.floors[0].structures,
  compiled.floors[0].structures,
  "Structural polygons and extrusion measurements must share the compiler scene used by both views."
);
assert.deepEqual(
  model.floors[0].walls.map(({ id, path, thicknessMm }) => ({ id, path, thicknessMm })),
  compiled.floors[0].walls.map(({ id, path, thicknessMm }) => ({ id, path, thicknessMm })),
  "Canonical wall IDs, authored paths and exact thicknesses must survive into the shared model."
);

const north = model.floors[0].walls.find((wall) => wall.id === "wall-north");
assert(north);
assert.equal(north.thicknessMm, 180);
assert.deepEqual(north.openings.map((opening) => opening.id), ["main-door"]);
assert.deepEqual(
  north.planSegments.map((segment) => [segment.startOffsetMm, segment.endOffsetMm]),
  [
    [0, 1000],
    [1900, 5000],
  ],
  "The same shared model must cut the exact 900 mm door span from its host wall."
);
assert(
  north.solids.some((solid) => solid.bottomMm === 2100 && solid.topMm === 2600),
  "The shared 3D solids must retain the door lintel above the canonical opening."
);
const northEnd = north.solids.find(
  (solid) => solid.bottomMm === 0 && solid.endOffsetMm === 5000
);
assert(northEnd);
const northDoorStartJamb = north.solids.find(
  (solid) => solid.bottomMm === 0 && solid.endOffsetMm === 1000
);
const northDoorEndJamb = north.solids.find(
  (solid) => solid.bottomMm === 0 && solid.startOffsetMm === 1900
);
assert(northDoorStartJamb && northDoorEndJamb);
assert.equal(
  northDoorStartJamb.footprint.endLeft.xMm,
  1000,
  "Door jamb footprints must stop at the exact authored opening offset."
);
assert.equal(
  northDoorEndJamb.footprint.startRight.xMm,
  1900,
  "Door jamb footprints must resume at the exact authored opening offset."
);

const east = model.floors[0].walls.find((wall) => wall.id === "wall-east");
assert(east);
assert.equal(east.thicknessMm, 230);
assert.deepEqual(east.openings.map((opening) => opening.id), ["east-window"]);
assert(
  east.solids.some((solid) => solid.bottomMm === 0 && solid.topMm === 900),
  "The shared solids must retain the canonical wall below a window sill."
);
assert(
  east.solids.some((solid) => solid.bottomMm === 2100 && solid.topMm === 2600),
  "The shared solids must retain the canonical window lintel."
);
const eastStart = east.solids.find(
  (solid) => solid.bottomMm === 0 && solid.startOffsetMm === 0
);
assert(eastStart);
assert.deepEqual(
  northEnd.footprint.endLeft,
  eastStart.footprint.startLeft,
  "Connected wall faces must share one inner miter point instead of leaving a hollow corner."
);
assert.deepEqual(
  northEnd.footprint.endRight,
  eastStart.footprint.startRight,
  "Connected wall faces must share one outer miter point instead of overlapping square boxes."
);
assert.deepEqual(northEnd.footprint.endLeft, { xMm: 4885, zMm: 90 });
assert.deepEqual(northEnd.footprint.endRight, { xMm: 5115, zMm: -90 });

const northCameraCutaway = resolveCanonicalCameraCutawayWallKeys(model, {
  x: 2.5,
  z: -10,
});
assert.deepEqual(
  [...northCameraCutaway],
  [canonicalWallCutawayKey("floor-1", "wall-north")],
  "Canonical 3D cutaway should remove only the exterior wall between the camera and the room."
);
const northCutawayBands = buildCanonicalWallUnionBands(model.floors[0], {
  excludedWallIds: new Set(["wall-north"]),
});
assert(
  northCutawayBands.every((band) =>
    band.polygons.every(
      (polygon) =>
        !isPointInPlanarRing({ xMm: 2500, zMm: 0 }, polygon.outer)
    )
  ),
  "A cutaway wall must be absent from every unioned height band instead of leaving an opaque base behind."
);

const curved = model.floors[0].walls.find(
  (wall) => wall.id === "wall-curved-partition"
);
assert(curved);
assert.equal(curved.path.kind, "arc");
assert.equal(curved.thicknessMm, 110);
assert(
  curved.centerlineSegments.length > 1 &&
    curved.solids.length === curved.centerlineSegments.length,
  "Authored arcs should be tessellated once into the shared path used by both renderer branches."
);
for (let index = 0; index < curved.solids.length - 1; index += 1) {
  assert.deepEqual(
    curved.solids[index].footprint.endLeft,
    curved.solids[index + 1].footprint.startLeft,
    "Adjacent arc extrusions must share their left miter point without a pixelated seam."
  );
  assert.deepEqual(
    curved.solids[index].footprint.endRight,
    curved.solids[index + 1].footprint.startRight,
    "Adjacent arc extrusions must share their right miter point without a pixelated seam."
  );
}

assert.throws(
  () => compileCanonicalFloorPlanRenderModel(document, "0".repeat(64)),
  /CANONICAL_GEOMETRY_HASH_MISMATCH/,
  "A stale or tampered persisted hash must reject the canonical render path."
);

const overlappingRectangles = buildPlanarUnionPolygons([
  {
    outer: [
      { xMm: 0, zMm: 0 },
      { xMm: 1000, zMm: 0 },
      { xMm: 1000, zMm: 400 },
      { xMm: 0, zMm: 400 },
    ],
  },
  {
    outer: [
      { xMm: 800, zMm: 0 },
      { xMm: 1800, zMm: 0 },
      { xMm: 1800, zMm: 400 },
      { xMm: 800, zMm: 400 },
    ],
  },
]);
assert.equal(overlappingRectangles.length, 1);
assert.equal(
  overlappingRectangles[0].outer.length,
  4,
  "Coplanar wall footprints must union into one outline without an internal cap seam."
);

const fourRoomSeed = loadPingYiCourtV2ReviewSeedBundle().fixtures.find(
  (fixture) => fixture.layoutId === "4-room"
);
assert.ok(fourRoomSeed, "Expected the Ping Yi 4-room visual regression fixture.");
const fourRoomModel = compileCanonicalFloorPlanRenderModel(
  fourRoomSeed.document,
  fourRoomSeed.geometryHash
);
const fourRoomFloor = fourRoomModel.floors[0];
const fourRoomSlab = buildCanonicalFloorSlabPolygons(fourRoomFloor);
assert.equal(
  fourRoomSlab.length,
  1,
  "The complete 4-room apartment must render on one continuous slab instead of hollow room bands."
);
assert.equal(
  fourRoomSlab[0].holes.length,
  0,
  "The reviewed 4-room footprint must not acquire artificial floor holes at doors or room boundaries."
);
const slabContainsPoint = (
  polygons: ReturnType<typeof buildCanonicalFloorSlabPolygons>,
  point: { xMm: number; zMm: number }
) =>
  polygons.some(
    (polygon) =>
      isPointInPlanarRing(point, polygon.outer) &&
      !polygon.holes.some((hole) => isPointInPlanarRing(point, hole))
  );
assert.equal(
  slabContainsPoint(
    buildCanonicalFloorSlabPolygons(model.floors[0]),
    { xMm: 5090, zMm: 2000 }
  ),
  true,
  "A visible canonical exterior wall must retain slab support to its outer face."
);
assert.equal(
  slabContainsPoint(
    buildCanonicalFloorSlabPolygons(model.floors[0]),
    { xMm: 4990, zMm: 2000 }
  ),
  true,
  "The canonical slab must preserve the finished room floor up to the exterior wall."
);
const fourRoomWallBands = buildCanonicalWallUnionBands(fourRoomFloor);
assert.deepEqual(
  fourRoomWallBands.map(({ bottomMm, topMm }) => [bottomMm, topMm]),
  [
    [0, 900],
    [900, 2100],
    [2100, 2600],
  ],
  "Door, window, and lintel transitions must be unioned into exact non-overlapping height bands."
);
assert(
  fourRoomWallBands.every((band) => band.polygons.length > 0),
  "Every occupied wall height band must retain a watertight plan footprint."
);
const bedroomCameraCutaway = resolveCanonicalCameraCutawayWallKeys(
  fourRoomModel,
  { x: 4.55, z: 15 },
  { x: 4.55, z: 1.68, width: 3.035, depth: 3.355 }
);
assert(
  bedroomCameraCutaway.has(canonicalWallCutawayKey(fourRoomFloor.id, "wall:9")),
  "A shared partition between the camera and the active room must join the dollhouse cutaway."
);
assert(
  !bedroomCameraCutaway.has(canonicalWallCutawayKey(fourRoomFloor.id, "wall:8")),
  "A side partition that does not block the active room must remain visible."
);

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const structureLayer = read("components/editor/design-page/DesignSceneStructureLayer.tsx");
const renderer2d = read("components/editor/renderers/RoomRenderer2D.tsx");
const renderer3d = read("components/editor/renderers/HousePlanRenderer3D.tsx");
const canonicalRenderer = read("components/editor/renderers/CanonicalFloorPlanStructure.tsx");
const sceneRegionRegistration = read(
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);

assert.match(
  structureLayer,
  /const canonicalResolution = useMemo\([\s\S]*?compileCanonicalFloorPlanRenderModel\([\s\S]*?state\.plan\.canonicalDocument,[\s\S]*?state\.plan\.canonicalGeometryHash/,
  "The scene boundary should compile a canonical snapshot exactly once."
);
assert.match(
  structureLayer,
  /<RoomRenderer2D[\s\S]*?canonicalPlan=\{canonicalPlan\}/,
  "The 2D renderer should receive the shared canonical model."
);
assert.match(
  structureLayer,
  /<HousePlanRenderer3D[\s\S]*?canonicalPlan=\{canonicalPlan\}/,
  "The 3D renderer should receive the same shared canonical model."
);
assert.match(
  renderer2d,
  /canonicalPlan && \([\s\S]*?<CanonicalFloorPlanWalls2D[\s\S]*?model=\{canonicalPlan\}/,
  "2D canonical walls must use the shared canonical structure renderer."
);
assert.match(
  renderer3d,
  /canonicalPlan && \([\s\S]*?<CanonicalFloorPlanWalls3D[\s\S]*?model=\{canonicalPlan\}/,
  "3D canonical walls must use the shared canonical structure renderer."
);
assert.match(canonicalRenderer, /testId: "canonical-structure-2d"/);
assert.match(canonicalRenderer, /testId: "canonical-structure-3d"/);
assert.match(
  canonicalRenderer,
  /<extrudeGeometry args=\{\[shape, \{ depth: heightMeters, bevelEnabled: false \}\]\}/,
  "3D structural elements must extrude the same canonical polygon instead of a legacy bounding box."
);
assert.match(
  canonicalRenderer,
  /buildCanonicalWallUnionBands\(floor, \{ excludedWallIds \}\)[\s\S]*?testId: "canonical-wall-body-3d"[\s\S]*?<extrudeGeometry/,
  "Canonical 3D walls must extrude unioned height bands instead of independent overlapping solids."
);
assert.match(
  canonicalRenderer,
  /useCanonicalCameraCutawayWallKeys\(\s*model,\s*cutawayTarget\s*\)[\s\S]*?cutawayWallKeys\.has\(canonicalWallCutawayKey\(floor\.id, wall\.id\)\)/,
  "Canonical exterior walls should follow the camera-aware dollhouse cutaway instead of blocking the floor plan."
);
assert.doesNotMatch(
  canonicalRenderer,
  /testId: "canonical-wall-3d"[\s\S]{0,1800}<boxGeometry/,
  "Canonical wall solids must not regress to hollow or overlapping box joins."
);
assert.match(
  canonicalRenderer,
  /buildCanonicalFloorSlabPolygons\(floor\)[\s\S]*?testId: "canonical-floor-slab-3d"/,
  "Canonical rooms must share one clean floor-level slab independent of the camera wall cutaway."
);
const canonicalFloorSlabRendererSource = canonicalRenderer.slice(
  canonicalRenderer.indexOf("function CanonicalFloorSlab3D"),
  canonicalRenderer.indexOf("function CanonicalWallBodies3D")
);
assert.doesNotMatch(
  canonicalFloorSlabRendererSource,
  /cutawayWallKeys|excludedWallIds/,
  "Camera wall cutaways must never carve wall-shaped steps into the structural slab perimeter."
);
assert.match(
  canonicalFloorSlabRendererSource,
  /<meshBasicMaterial[\s\S]*?opacity=\{0\}[\s\S]*?depthWrite=\{false\}[\s\S]*?colorWrite=\{false\}/,
  "The canonical support slab must not introduce a second floor color around room finishes."
);
assert.match(
  renderer3d,
  /showEdgeBand=\{!canonicalPlan && !hasLegacyMergedSlab\}/,
  "Canonical and merged legacy room finishes must not reintroduce one slab edge band per room."
);
assert.match(
  structureLayer,
  /canonicalPlan\s*\? plan\.scene\.fixedElements\.filter\(\(element\) => !element\.canonicalKind\)/,
  "Canonical structures must not also render as legacy rectangular reference zones."
);
assert.match(renderer2d, /showOpenings && !canonicalStructureExpected/);
assert.match(renderer3d, /!canonicalStructureExpected && wallSegments\.flatMap/);
assert.match(
  renderer2d,
  /const canEditRoomGeometry = canEditPlan && !canonicalStructureExpected/,
  "Legacy room resize/move gestures must not drift an authoritative canonical wall graph."
);
assert.match(
  structureLayer,
  /onMoveRoom=\{[\s\S]*?canonicalStructureExpected \? undefined : actions\.rooms\.move[\s\S]*?onResizeRoom=\{[\s\S]*?canonicalStructureExpected \? undefined : actions\.rooms\.resize/,
  "Canonical structure should remain read-only until wall-loop mutations write back to FloorPlanDocumentV2."
);
assert.match(
  structureLayer,
  /canonical-floor-plan-integrity-warning[\s\S]*?Canonical walls are hidden/,
  "A failed canonical hash check must block legacy wall reconstruction visibly."
);
assert.doesNotMatch(renderer2d, /compileFloorPlanDocumentV2/);
assert.doesNotMatch(renderer3d, /compileFloorPlanDocumentV2/);
assert.equal(
  (canonicalRenderer.match(/canonicalGeometryHash: model\.geometryHash/g) ?? []).length >= 2,
  true,
  "Both canonical renderer branches should expose the same geometry hash for diagnostics."
);
assert.match(
  sceneRegionRegistration,
  /canonicalDocument:[\s\S]*?designSnapshot\.floorPlan\?\.canonicalDocument \?\? null,[\s\S]*?canonicalGeometryHash:[\s\S]*?designSnapshot\.floorPlan\?\.canonicalGeometryHash \?\? null/,
  "Saved canonical documents and hashes should enter the shared scene boundary."
);

console.log("Canonical 2D/3D floor-plan render parity checks passed.");
