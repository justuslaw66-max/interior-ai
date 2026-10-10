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
  CANONICAL_CUTAWAY_DIRECTIONS,
  canonicalCutawayDirectionStep,
  canonicalCutawayStepDirection,
  canonicalCutawayTurn,
  canonicalWallCutawayKey,
  resolveCanonicalCameraCutawayWallKeys,
} from "@/lib/floor-plan-camera-cutaway";
import {
  applyCanonicalWallFootprintJoins,
  buildRectangularWallFootprint,
} from "@/lib/floor-plan-wall-footprints";
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

const shortOwnershipSegment = {
  start: { xMm: 0, zMm: 0 },
  end: { xMm: 100, zMm: 0 },
  startOffsetMm: 0,
  endOffsetMm: 100,
};
const shortOwnershipWalls = applyCanonicalWallFootprintJoins([
  {
    path: {
      kind: "line" as const,
      startVertexId: "previous-start",
      endVertexId: "short-start",
    },
    thicknessMm: 200,
    centerlineSegments: [
      {
        start: { xMm: 0, zMm: -1000 },
        end: { xMm: 0, zMm: 0 },
        startOffsetMm: 0,
        endOffsetMm: 1000,
      },
    ],
    solids: [
      {
        start: { xMm: 0, zMm: -1000 },
        end: { xMm: 0, zMm: 0 },
        startOffsetMm: 0,
        endOffsetMm: 1000,
        bottomMm: 0,
        topMm: 2600,
        footprint: buildRectangularWallFootprint(
          {
            start: { xMm: 0, zMm: -1000 },
            end: { xMm: 0, zMm: 0 },
            startOffsetMm: 0,
            endOffsetMm: 1000,
          },
          200
        ),
      },
    ],
  },
  {
    path: {
      kind: "line" as const,
      startVertexId: "short-start",
      endVertexId: "short-end",
    },
    thicknessMm: 200,
    centerlineSegments: [shortOwnershipSegment],
    solids: [
      {
        ...shortOwnershipSegment,
        bottomMm: 0,
        topMm: 2600,
        footprint: buildRectangularWallFootprint(
          shortOwnershipSegment,
          200
        ),
      },
    ],
  },
  {
    path: {
      kind: "line" as const,
      startVertexId: "short-end",
      endVertexId: "next-end",
    },
    thicknessMm: 200,
    centerlineSegments: [
      {
        start: { xMm: 100, zMm: 0 },
        end: { xMm: 100, zMm: 1000 },
        startOffsetMm: 0,
        endOffsetMm: 1000,
      },
    ],
    solids: [
      {
        start: { xMm: 100, zMm: 0 },
        end: { xMm: 100, zMm: 1000 },
        startOffsetMm: 0,
        endOffsetMm: 1000,
        bottomMm: 0,
        topMm: 2600,
        footprint: buildRectangularWallFootprint(
          {
            start: { xMm: 100, zMm: 0 },
            end: { xMm: 100, zMm: 1000 },
            startOffsetMm: 0,
            endOffsetMm: 1000,
          },
          200
        ),
      },
    ],
  },
]);
assert.deepEqual(
  shortOwnershipWalls[1].solids[0].footprint,
  buildRectangularWallFootprint(shortOwnershipSegment, 200),
  "A wall-ownership span shorter than its thickness must retain a safe swept footprint instead of an inverted miter."
);

// Level and plumb walls meet in a square corner whatever their thicknesses. A plain L of two long walls keeps its
// mitre (above: the north and east walls share both corner points). Where a mitre cannot close the corner - a T or X
// junction, or an L with a wall shorter than the other is thick, as the ownership steps and jogs of imported plans
// have - each wall runs on past the vertex by half the thickness of the thickest wall crossing it, so the united
// footprints close the corner with no spike and no notch. A vertex with a slanted wall keeps the mitre.
{
  type JoinWall = Parameters<typeof applyCanonicalWallFootprintJoins>[0][number];
  const point = (xMm: number, zMm: number) => ({ xMm, zMm });
  const joinWall = (
    start: { xMm: number; zMm: number },
    end: { xMm: number; zMm: number },
    thicknessMm: number,
    startVertexId: string,
    endVertexId: string
  ): JoinWall => {
    const segment = {
      start,
      end,
      startOffsetMm: 0,
      endOffsetMm: Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm),
    };
    return {
      path: { kind: "line" as const, startVertexId, endVertexId },
      thicknessMm,
      centerlineSegments: [segment],
      solids: [
        {
          ...segment,
          bottomMm: 0,
          topMm: 2600,
          footprint: buildRectangularWallFootprint(segment, thicknessMm),
        },
      ],
    } as unknown as JoinWall;
  };
  const corners = (wall: JoinWall) => {
    const footprint = wall.solids[0].footprint;
    return [footprint.startLeft, footprint.endLeft, footprint.endRight, footprint.startRight];
  };
  const box = (wall: JoinWall) => {
    const points = corners(wall);
    return {
      minX: Math.min(...points.map((entry) => entry.xMm)),
      maxX: Math.max(...points.map((entry) => entry.xMm)),
      minZ: Math.min(...points.map((entry) => entry.zMm)),
      maxZ: Math.max(...points.map((entry) => entry.zMm)),
    };
  };
  const hasCorner = (wall: JoinWall, target: { xMm: number; zMm: number }) =>
    corners(wall).some((entry) => Math.hypot(entry.xMm - target.xMm, entry.zMm - target.zMm) < 0.01);

  // A plain L of a thick and a thin wall, both long: the mitre, sharing the outer and the inner corner.
  const [lThick, lThin] = applyCanonicalWallFootprintJoins([
    joinWall(point(0, 0), point(1000, 0), 200, "l-corner", "l-a"),
    joinWall(point(0, 0), point(0, 1000), 100, "l-corner", "l-b"),
  ]);
  for (const target of [point(-50, -100), point(50, 100)]) {
    assert(
      hasCorner(lThick, target) && hasCorner(lThin, target),
      "A plain L of two long walls must keep one shared mitre at its outer and inner corner."
    );
  }

  // A jog: a thick wall, a step shorter than that wall is thick, and the next thick wall. The walls each side run
  // on past the step by half its thickness and close the corner; the step itself stays its plain rectangle.
  const [jogBefore, jogStep, jogAfter] = applyCanonicalWallFootprintJoins([
    joinWall(point(-1000, 0), point(0, 0), 200, "jog-a", "jog-b"),
    joinWall(point(0, 0), point(0, 60), 100, "jog-b", "jog-c"),
    joinWall(point(0, 60), point(1000, 60), 200, "jog-c", "jog-d"),
  ]);
  assert.deepEqual(box(jogBefore), { minX: -1000, maxX: 50, minZ: -100, maxZ: 100 });
  assert.deepEqual(box(jogAfter), { minX: -50, maxX: 1000, minZ: -40, maxZ: 160 });
  assert.deepEqual(
    jogStep.solids[0].footprint,
    buildRectangularWallFootprint(jogStep.centerlineSegments[0], 100),
    "A jog's step shorter than its thickness keeps its plain rectangle; the walls each side close the corner."
  );

  // A T of a thick through wall and a thin stem: the through wall's halves run on into each other by half the stem's
  // thickness, and the stem reaches the through wall's far face - never past it.
  const [tLeft, tRight, tStem] = applyCanonicalWallFootprintJoins([
    joinWall(point(-1000, 0), point(0, 0), 200, "t-l", "t-joint"),
    joinWall(point(0, 0), point(1000, 0), 200, "t-joint", "t-r"),
    joinWall(point(0, 0), point(0, 1000), 100, "t-joint", "t-s"),
  ]);
  assert.deepEqual(box(tLeft), { minX: -1000, maxX: 50, minZ: -100, maxZ: 100 });
  assert.deepEqual(box(tRight), { minX: -50, maxX: 1000, minZ: -100, maxZ: 100 });
  assert.deepEqual(
    box(tStem),
    { minX: -50, maxX: 50, minZ: -100, maxZ: 1000 },
    "A T junction's walls must close the junction in square corners without a mitre spike."
  );

  // Two walls straight on, of different thickness, nothing crossing: plain ends, as before.
  const [straightThick, straightThin] = applyCanonicalWallFootprintJoins([
    joinWall(point(-1000, 0), point(0, 0), 200, "s-a", "s-joint"),
    joinWall(point(0, 0), point(1000, 0), 100, "s-joint", "s-b"),
  ]);
  assert.deepEqual(box(straightThick), { minX: -1000, maxX: 0, minZ: -100, maxZ: 100 });
  assert.deepEqual(box(straightThin), { minX: 0, maxX: 1000, minZ: -50, maxZ: 50 });

  // A slanted wall at the vertex: the mitre, the two walls sharing the corner where their faces meet.
  const [slantLevel, slantWall] = applyCanonicalWallFootprintJoins([
    joinWall(point(0, 0), point(1000, 0), 200, "x-corner", "x-a"),
    joinWall(point(0, 0), point(700, 700), 200, "x-corner", "x-b"),
  ]);
  assert(
    corners(slantLevel).some((entry) => hasCorner(slantWall, entry)),
    "A vertex with a slanted wall must keep the shared mitre point."
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
  !bedroomCameraCutaway.has(canonicalWallCutawayKey(fourRoomFloor.id, "wall:9")),
  "A shared partition between the camera and the active room must remain visible."
);
assert(
  !bedroomCameraCutaway.has(canonicalWallCutawayKey(fourRoomFloor.id, "wall:8")),
  "A side partition that does not block the active room must remain visible."
);
assert(
  bedroomCameraCutaway.has(canonicalWallCutawayKey(fourRoomFloor.id, "wall:18")),
  "A camera-facing exterior wall should retain the established dollhouse cutaway."
);
const zoomedBedroomCameraCutaway = resolveCanonicalCameraCutawayWallKeys(
  fourRoomModel,
  { x: 4.55, z: 30 },
  { x: 4.55, z: 1.68, width: 3.035, depth: 3.355 },
  { viewDirection: { x: 0, z: -1 } }
);
const nearBedroomCameraCutaway = resolveCanonicalCameraCutawayWallKeys(
  fourRoomModel,
  { x: 4.55, z: 9 },
  { x: 4.55, z: 1.68, width: 3.035, depth: 3.355 },
  { viewDirection: { x: 0, z: -1 } }
);
assert.deepEqual(
  [...zoomedBedroomCameraCutaway],
  [...nearBedroomCameraCutaway],
  "Dolly zoom must not change the canonical exterior cutaway set."
);
const pinnedBedroomCameraCutaway = resolveCanonicalCameraCutawayWallKeys(
  fourRoomModel,
  { x: 4.55, z: 15 },
  { x: 4.55, z: 1.68, width: 3.035, depth: 3.355 },
  { pinnedWallIds: new Set(["wall:18"]) }
);
assert(
  !pinnedBedroomCameraCutaway.has(
    canonicalWallCutawayKey(fourRoomFloor.id, "wall:18")
  ),
  "A selected exterior wall must remain visible instead of becoming a paper-thin cutaway remnant."
);
// The cutaway follows whole-degree compass steps of the view: atan2(view.x, view.z),
// wrapping at a full turn, and none when looking straight down.
const degree = Math.PI / 180;
const viewAt = (degrees: number) => ({ x: Math.sin(degrees * degree), z: Math.cos(degrees * degree) });
assert.deepEqual([0, 90, 180, 270].map((degrees) => canonicalCutawayDirectionStep(viewAt(degrees))), [0, 90, 180, 270]);
assert.equal(canonicalCutawayDirectionStep(viewAt(41.4)), 41);
assert.equal(canonicalCutawayDirectionStep(viewAt(41.6)), 42);
assert.equal(canonicalCutawayDirectionStep(viewAt(359.6)), 0, "Steps wrap at a full turn.");
assert.equal(canonicalCutawayDirectionStep(viewAt(-90)), 270);
assert.equal(canonicalCutawayDirectionStep({ x: 0.0005, z: -0.0005 }), null, "Straight down has no compass step.");
for (const step of [0, 1, 89, 180, 359]) {
  assert.equal(canonicalCutawayDirectionStep(canonicalCutawayStepDirection(step)), step);
}
// Every cut set an orbit around the bedroom can show, which the renderer builds in
// idle time: one per compass step, nearest to the current view first, each new set
// yielded once, and exactly the sets the resolver gives at the steps.
const bedroomTarget = { x: 4.55, z: 1.68, width: 3.035, depth: 3.355 };
const cutawayAtStep = (step: number) =>
  resolveCanonicalCameraCutawayWallKeys(fourRoomModel, { x: 0, z: 0 }, bedroomTarget, {
    viewDirection: canonicalCutawayStepDirection(step),
  });
const cutawaySignature = (keys: ReadonlySet<string>) => [...keys].sort().join("|");
const turnSteps = [...canonicalCutawayTurn(fourRoomModel, bedroomTarget, new Set(), 57)];
const turnSets = turnSteps.filter((keys): keys is ReadonlySet<string> => keys !== undefined);
assert.equal(turnSteps.length, CANONICAL_CUTAWAY_DIRECTIONS, "The turn should try every compass step.");
assert.equal(cutawaySignature(turnSets[0]), cutawaySignature(cutawayAtStep(57)), "The current view's set comes first.");
assert.equal(new Set(turnSets.map(cutawaySignature)).size, turnSets.length, "Each cut set appears once.");
const everyStep = new Set(
  Array.from({ length: CANONICAL_CUTAWAY_DIRECTIONS }, (_, step) => cutawaySignature(cutawayAtStep(step)))
);
assert.ok(turnSets.length >= 2, "A full turn around the bedroom changes the cut set.");
assert.equal(turnSets.length, everyStep.size, "The turn finds every set the compass steps give.");
assert.ok(turnSets.every((keys) => everyStep.has(cutawaySignature(keys))));
const bedroomExcludedWallIds = new Set(
  fourRoomFloor.walls
    .filter((wall) =>
      bedroomCameraCutaway.has(
        canonicalWallCutawayKey(fourRoomFloor.id, wall.id)
      )
    )
    .map((wall) => wall.id)
);
const bedroomCutawayBands = buildCanonicalWallUnionBands(fourRoomFloor, {
  excludedWallIds: bedroomExcludedWallIds,
});
for (const wall of fourRoomFloor.walls) {
  if (bedroomExcludedWallIds.has(wall.id)) continue;
  for (const solid of wall.solids) {
    const heightMm = (solid.bottomMm + solid.topMm) / 2;
    const band = bedroomCutawayBands.find(
      (candidate) =>
        candidate.bottomMm <= heightMm && candidate.topMm >= heightMm
    );
    assert(band, `Expected a wall height band for ${solid.id}.`);
    for (const amount of [0.25, 0.5, 0.75]) {
      assert.equal(
        slabContainsPoint(band.polygons, {
          xMm:
            solid.start.xMm +
            (solid.end.xMm - solid.start.xMm) * amount,
          zMm:
            solid.start.zMm +
            (solid.end.zMm - solid.start.zMm) * amount,
        }),
        true,
        `Cutaway wall union must retain the source centerline for ${solid.id}.`
      );
    }
  }
}

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
  /const canonicalResolution = useMemo\([\s\S]*?resolveCanonicalSceneModel\([\s\S]*?state\.plan\.canonicalDocument,[\s\S]*?state\.plan\.canonicalGeometryHash/,
  "The scene boundary should compile a canonical snapshot exactly once."
);
assert.match(read("lib/floor-plan-scene-model-resolution.ts"),
  /compileCanonicalFloorPlanRenderModel\(document, geometryHash\)/,
  "The shared scene resolver must preserve the canonical hash integrity check.");
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
  /<extrudeGeometry args=\{\[shape, stableExtrudeOptions\(heightMeters\)\]\}/,
  "3D structural elements must extrude the same canonical polygon instead of a legacy bounding box."
);
assert.match(
  canonicalRenderer,
  /useCanonicalWallBands\(floor, cutawayWallKeys\)[\s\S]*?testId: "canonical-wall-body-3d"[\s\S]*?<extrudeGeometry/,
  "Canonical 3D walls must extrude unioned height bands instead of independent overlapping solids."
);
assert.match(
  read("components/editor/renderers/canonical-floor-plan/useCanonicalWallBands.ts"),
  /buildCanonicalWallUnionBands\(floor, \{ excludedWallIds \}\)/,
  "The wall bands are the canonical union bands without the cut-away walls."
);
assert.match(
  canonicalRenderer,
  /useCanonicalCameraCutawayWallKeys\(\s*model,\s*cutawayTarget,\s*pinnedWallIds\s*\)[\s\S]*?cutawayWallKeys\.has\(canonicalWallCutawayKey\(floor\.id, wall\.id\)\)/,
  "Canonical exterior walls should follow the camera-aware dollhouse cutaway instead of blocking the floor plan."
);
assert.doesNotMatch(
  canonicalRenderer,
  /cutawayWallKeys\.has\(canonicalWallCutawayKey\(floor\.id, wall\.id\)\)\)\s*\{\s*return \[\];|cutawayWallKeys\.has\(canonicalWallCutawayKey\(floor\.id, wall\.id\)\)\s*\?\s*\[\]/,
  "Cut-away walls and their openings must stay mounted: unmounting them re-created meshes and shaders on every cutaway change."
);
assert.equal(
  (canonicalRenderer.match(/const cutAway = cutawayWallKeys\.has\(canonicalWallCutawayKey\(floor\.id, wall\.id\)\);/g) ?? []).length,
  2,
  "Walls and openings should both read whether their wall is cut away."
);
assert.equal(
  (canonicalRenderer.match(/interactive=\{interactive && !cutAway\}/g) ?? []).length,
  2,
  "Cut-away wall surfaces and openings should take no pointer events."
);
assert.equal(
  (canonicalRenderer.match(/visible=\{!cutAway\}/g) ?? []).length,
  3,
  "The wall hit mesh, the wall surfaces and the openings should hide while cut away."
);
assert.match(
  canonicalRenderer,
  /visible=\{!cutAway\}\s*raycast=\{cutAway \? noRaycast : meshRaycast\}/,
  "A hidden wall hit mesh should take no pointer rays (three.js raycasts invisible objects)."
);
assert.doesNotMatch(
  canonicalRenderer,
  /raycast=\{interactive \? undefined/,
  "R3F 9 ignores a prop that becomes undefined, so a surface or opening that becomes pickable again needs meshRaycast."
);
assert.match(canonicalRenderer, /const meshRaycast = Mesh\.prototype\.raycast;/);
assert.match(
  canonicalRenderer,
  /usePrebuiltCanonicalWallBands\(model, cutawayTarget, pinnedWallIds, !focusRoomId\);/,
  "The 3D walls should build the bands for an orbit's cut sets in idle time, except in a focused room."
);
const cutawayHook = read("components/editor/renderers/canonical-floor-plan/useCameraCutaway.ts");
assert.doesNotMatch(cutawayHook, /\.sort\(\)\.join/, "The per-frame cutaway hook should not build signature strings.");
assert.match(
  cutawayHook,
  /if \(sameKeys\(next, resolved\.keys\)\) return;/,
  "The cutaway hook should keep its state when the cut set is unchanged."
);
assert.match(
  cutawayHook,
  /viewDirection: step === null \? viewDirection : canonicalCutawayStepDirection\(step\)[\s\S]*?const step = canonicalCutawayDirectionStep\(viewDirection\);[\s\S]*?resolved\.step === step &&/,
  "The cutaway hook should resolve once per compass step, at the step's direction."
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
  /useRoomRendererPlanOverlays\(state\.plan\.scene, state\.plan\.rooms, Boolean\(canonicalPlan\)\)/,
  "Canonical structures must not also render as legacy rectangular reference zones."
);
assert.match(
  read("lib/useRoomRendererPlanOverlays.ts"),
  /hideCanonicalFixedElements\s*\? fixedElements\.filter\(\(element\) => !element\.canonicalKind\)/,
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
