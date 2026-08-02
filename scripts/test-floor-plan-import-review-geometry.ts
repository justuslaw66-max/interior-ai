import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  analyzePointScale,
  analyzeSourceOpeningSpan,
  applyConsumerTopologyCorrection,
  applyPointScaleCalibration,
  buildReviewOverlay,
  registerEmptyPlanScaleCalibration,
  registerPointScaleCalibration,
  snapReviewSourcePoint,
  traceOpeningFromSourceSpan,
  traceRoomFromSourcePolygon,
} from "@/lib/floor-plan-import-review-geometry";
import {
  buildStructureRectangleVertices,
  getStructureRectangleBounds,
  nextFloorPlanReviewEntityId,
} from "@/lib/floor-plan-review-structure-rectangle";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import {
  applyConsumerFloorPlanCorrection,
  validateReviewIssueResolution,
} from "@/lib/floor-plan-imports/review";

const bundle = loadPingYiCourtV2ReviewSeedBundle();
const seed = bundle.fixtures.find(
  (entry) => entry.layoutId === "2-room-flexi-type-1"
);
assert.ok(seed);

const source = structuredClone(seed.document);
const floor = source.floors[0];
const sourceId =
  floor.vertices[0]?.provenance.evidence[0]?.sourceId ?? source.sources[0].id;
floor.dimensions = [];
floor.calibrations = [
  {
    id: "existing-registration",
    sourceId,
    pageNumber: 1,
    imageWidthPx: 1000,
    imageHeightPx: 800,
    controlPoints: [
      {
        sourcePx: { x: 0, y: 0 },
        planMm: { xMm: 0, zMm: 0 },
      },
      {
        sourcePx: { x: 1000, y: 0 },
        planMm: { xMm: 10000, zMm: 0 },
      },
    ],
  },
];
const opening =
  floor.openings.find((entry) => entry.offsetMm > 0) ?? floor.openings[0];
assert.ok(opening);
const hostWall = floor.walls.find((wall) => wall.id === opening.wallId);
assert.ok(hostWall && hostWall.path.kind === "line");
const byId = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
const hostStart = byId.get(hostWall.path.startVertexId)!;
const hostEnd = byId.get(hostWall.path.endVertexId)!;
const hostLength = Math.round(
  Math.hypot(hostEnd.xMm - hostStart.xMm, hostEnd.zMm - hostStart.zMm)
);
assert.ok(hostLength > 800);
floor.annotations.push({
  id: "review-span",
  kind: "note",
  text: "Review span",
  geometry: {
    kind: "wall_span",
    wallId: opening.wallId,
    offsetMm: 100,
    widthMm: 400,
  },
  provenance: structuredClone(opening.provenance),
});
compileFloorPlanDocumentV2(source);

const scaleAnalysis = analyzePointScale({
  first: { x: 0, y: 0 },
  second: { x: 500, y: 0 },
  printedMm: 10000,
  pageWidthPx: 1000,
  pageHeightPx: 800,
  calibration: floor.calibrations[0],
});
assert.equal(scaleAnalysis.valid, true);
assert.ok(
  Math.abs((scaleAnalysis.existingMillimetresPerPixel ?? 0) - 10) < 1e-9
);
assert.equal(scaleAnalysis.millimetresPerPixel, 20);
assert.ok(Math.abs((scaleAnalysis.residualMm ?? 0) + 5000) < 1e-9);

const original = structuredClone(source);
const originalFloor = original.floors[0];
const originalVertex = originalFloor.vertices.find(
  (vertex) => vertex.xMm !== 0 || vertex.zMm !== 0
)!;
const originalOpening = originalFloor.openings.find(
  (entry) => entry.id === opening.id
)!;
const sourcePixelsBefore = originalFloor.calibrations.map((calibration) =>
  calibration.controlPoints.map((point) => point.sourcePx)
);
const verticalBefore = {
  elevationMm: originalFloor.elevationMm,
  storeyHeightMm: originalFloor.storeyHeightMm,
  slabThicknessMm: originalFloor.slabThicknessMm,
  defaults: structuredClone(originalFloor.defaults),
  wallHeightMm: originalFloor.walls[0].heightMm,
  openingHeightMm: originalOpening.heightMm,
  sillHeightMm: originalOpening.sillHeightMm,
};

const scaled = applyPointScaleCalibration({
  document: source,
  floorId: floor.id,
  sourceId,
  pageNumber: 1,
  pageWidthPx: 1000,
  pageHeightPx: 800,
  first: { x: 0, y: 0 },
  second: { x: 500, y: 0 },
  printedMm: 10000,
});
const scaledFloor = scaled.floors[0];
const scaledVertex = scaledFloor.vertices.find(
  (vertex) => vertex.id === originalVertex.id
)!;
const scaledOpening = scaledFloor.openings.find(
  (entry) => entry.id === originalOpening.id
)!;
assert.equal(scaledVertex.xMm, originalVertex.xMm * 2);
assert.equal(scaledVertex.zMm, originalVertex.zMm * 2);
assert.equal(
  scaledFloor.walls[0].thicknessMm,
  originalFloor.walls[0].thicknessMm * 2
);
assert.equal(scaledOpening.offsetMm, originalOpening.offsetMm * 2);
assert.equal(scaledOpening.widthMm, originalOpening.widthMm * 2);
const scaledSpan = scaledFloor.annotations.find(
  (annotation) => annotation.id === "review-span"
)!.geometry;
assert.equal(scaledSpan.kind, "wall_span");
if (scaledSpan.kind === "wall_span") {
  assert.equal(scaledSpan.offsetMm, 200);
  assert.equal(scaledSpan.widthMm, 800);
}
assert.deepEqual(
  scaledFloor.calibrations.map((calibration) =>
    calibration.controlPoints.map((point) => point.sourcePx)
  ),
  sourcePixelsBefore,
  "Source correspondences must never be invented or moved"
);
assert.equal(
  scaledFloor.calibrations[0].controlPoints[1].planMm.xMm,
  20000
);
assert.deepEqual(
  {
    elevationMm: scaledFloor.elevationMm,
    storeyHeightMm: scaledFloor.storeyHeightMm,
    slabThicknessMm: scaledFloor.slabThicknessMm,
    defaults: scaledFloor.defaults,
    wallHeightMm: scaledFloor.walls[0].heightMm,
    openingHeightMm: scaledOpening.heightMm,
    sillHeightMm: scaledOpening.sillHeightMm,
  },
  verticalBefore,
  "Scale calibration must not change vertical evidence"
);
assert.ok(
  buildReviewOverlay({
    document: scaled,
    floorId: scaledFloor.id,
    sourceId,
    pageNumber: 1,
  })
);

const unregistered = structuredClone(original);
unregistered.floors[0].calibrations = [];
assert.throws(
  () =>
    applyPointScaleCalibration({
      document: unregistered,
      floorId: floor.id,
      sourceId,
      pageNumber: 1,
      pageWidthPx: 1000,
      pageHeightPx: 800,
      first: { x: 0, y: 0 },
      second: { x: 500, y: 0 },
      printedMm: 10000,
    }),
  /Two source points solve scale only|register/i
);
const newlyRegistered = registerPointScaleCalibration({
  document: unregistered,
  floorId: floor.id,
  sourceId,
  pageNumber: 1,
  pageWidthPx: 1000,
  pageHeightPx: 800,
  first: { x: 0, y: 0 },
  second: { x: 500, y: 0 },
  firstVertexId: hostStart.id,
  secondVertexId: hostEnd.id,
  printedMm: hostLength * 2,
});
const newRegistration = newlyRegistered.floors[0].calibrations[0];
assert.deepEqual(newRegistration.controlPoints.map((point) => point.sourcePx), [
  { x: 0, y: 0 },
  { x: 500, y: 0 },
]);
const registeredVertices = new Map(
  newlyRegistered.floors[0].vertices.map((vertex) => [vertex.id, vertex])
);
const registeredHostStart = registeredVertices.get(hostStart.id)!;
const registeredHostEnd = registeredVertices.get(hostEnd.id)!;
assert.equal(
  Math.round(
    Math.hypot(
      registeredHostEnd.xMm - registeredHostStart.xMm,
      registeredHostEnd.zMm - registeredHostStart.zMm
    )
  ),
  hostLength * 2,
  "Explicit source-to-plan endpoint mapping must establish the requested scale."
);
assert.throws(
  () =>
    registerPointScaleCalibration({
      document: unregistered,
      floorId: floor.id,
      sourceId,
      pageNumber: 1,
      pageWidthPx: 1000,
      pageHeightPx: 800,
      first: { x: 0, y: 0 },
      second: { x: 500, y: 0 },
      firstVertexId: hostStart.id,
      secondVertexId: hostStart.id,
      printedMm: hostLength,
    }),
  /different plan vertices/i
);

const emptyTrace = structuredClone(original);
const emptyTraceFloor = emptyTrace.floors[0];
emptyTraceFloor.calibrations = [];
emptyTraceFloor.vertices = [];
emptyTraceFloor.walls = [];
emptyTraceFloor.rooms = [];
emptyTraceFloor.openings = [];
emptyTraceFloor.structures = [];
emptyTraceFloor.annotations = [];
emptyTraceFloor.dimensions = [];
compileFloorPlanDocumentV2(emptyTrace);
const emptyTraceRegistered = registerEmptyPlanScaleCalibration({
  document: emptyTrace,
  floorId: emptyTraceFloor.id,
  sourceId,
  pageNumber: 1,
  pageWidthPx: 1000,
  pageHeightPx: 800,
  first: { x: 100, y: 100 },
  second: { x: 300, y: 100 },
  printedMm: 4000,
});
assert.equal(emptyTraceRegistered.floors[0].calibrations.length, 1);
assert.equal(
  emptyTraceRegistered.floors[0].dimensions.length,
  1,
  "Manual two-point calibration must preserve the printed source dimension."
);
assert.equal(emptyTraceRegistered.floors[0].dimensions[0].measuredMm, 4000);
assert.equal(emptyTraceRegistered.floors[0].dimensions[0].axis, "aligned");
const firstTracedRoom = traceRoomFromSourcePolygon({
  document: emptyTraceRegistered,
  floorId: emptyTraceFloor.id,
  sourceId,
  pageNumber: 1,
  points: [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ],
  roomName: "Room 1",
  roomType: "other",
  wallThicknessMm: 120,
  at: "2026-07-18T00:00:00.000Z",
});
assert.equal(firstTracedRoom.floors[0].rooms.length, 1);
assert.equal(firstTracedRoom.floors[0].walls.length, 4);
assert.equal(firstTracedRoom.floors[0].vertices.length, 4);
assert.ok(
  buildReviewOverlay({
    document: firstTracedRoom,
    floorId: emptyTraceFloor.id,
    sourceId,
    pageNumber: 1,
  })
);
const openingAnalysis = analyzeSourceOpeningSpan({
  document: firstTracedRoom,
  floorId: emptyTraceFloor.id,
  sourceId,
  pageNumber: 1,
  first: { x: 150, y: 100 },
  second: { x: 195, y: 100 },
});
assert.equal(openingAnalysis.valid, true);
assert.equal(openingAnalysis.offsetMm, 1000);
assert.equal(openingAnalysis.widthMm, 900);
assert.ok(openingAnalysis.wallId);
const firstGuidedOpening = traceOpeningFromSourceSpan({
  document: firstTracedRoom,
  floorId: emptyTraceFloor.id,
  sourceId,
  pageNumber: 1,
  first: { x: 150, y: 100 },
  second: { x: 195, y: 100 },
  kind: "door",
  at: "2026-07-18T00:00:30.000Z",
});
assert.equal(firstGuidedOpening.floors[0].openings.length, 1);
assert.equal(firstGuidedOpening.floors[0].openings[0].widthMm, 900);
assert.equal(firstGuidedOpening.floors[0].openings[0].operation, "swing");
assert.equal(
  firstGuidedOpening.floors[0].openings[0].provenance.evidence[0].basis,
  "raster_traced"
);
assert.deepEqual(
  firstGuidedOpening.floors[0].openings[0].provenance.evidence[0]
    .sourceAnchors?.map((anchor) => anchor.role),
  ["start", "midpoint", "end"]
);
assert.equal(
  buildReviewOverlay({
    document: firstGuidedOpening,
    floorId: emptyTraceFloor.id,
    sourceId,
    pageNumber: 1,
  })?.openings.length,
  1
);
assert.equal(
  analyzeSourceOpeningSpan({
    document: firstTracedRoom,
    floorId: emptyTraceFloor.id,
    sourceId,
    pageNumber: 1,
    first: { x: 150, y: 500 },
    second: { x: 195, y: 500 },
  }).valid,
  false,
  "Opening endpoints far from every wall must be rejected"
);

const reviewCurrent = structuredClone(firstGuidedOpening);
reviewCurrent.verification = { tier: "needs_review", criticalIssueIds: [] };
const reviewNext = structuredClone(reviewCurrent);
reviewNext.revisionId = "client-guided-revision";
reviewNext.parentRevisionId = "client-guided-parent";
const reviewSourceSha = reviewCurrent.sources.find(
  (entry) => entry.id === sourceId
)?.sha256;
assert.ok(reviewSourceSha);
const reviewed = applyConsumerFloorPlanCorrection({
  current: reviewCurrent,
  next: reviewNext,
  currentIssues: [],
  submittedIssues: [],
  sourceId,
  sourceSha256: reviewSourceSha,
  userId: "reviewer",
  note: "Reviewer confirmed the guided correction.",
  at: "2026-07-18T00:01:00.000Z",
});
assert.equal(
  reviewed.document.revisionId,
  reviewCurrent.revisionId,
  "The server must retain canonical revision identity after guided client edits."
);
assert.equal(reviewed.document.parentRevisionId, reviewCurrent.parentRevisionId);
const secondTracedRoom = traceRoomFromSourcePolygon({
  document: firstTracedRoom,
  floorId: emptyTraceFloor.id,
  sourceId,
  pageNumber: 1,
  points: [
    { x: 300, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 250 },
    { x: 300, y: 250 },
  ],
  roomName: "Room 2",
  roomType: "other",
  wallThicknessMm: 120,
  at: "2026-07-18T00:01:00.000Z",
});
assert.equal(secondTracedRoom.floors[0].rooms.length, 2);
assert.equal(secondTracedRoom.floors[0].walls.length, 7);
assert.equal(
  secondTracedRoom.floors[0].walls.filter(
    (wall) => wall.adjacentRoomIds.length === 2
  ).length,
  1,
  "Adjacent traced rooms must reuse their shared wall"
);
compileFloorPlanDocumentV2(secondTracedRoom);

const cornerSnap = snapReviewSourcePoint({
  point: { x: 208, y: 205 },
  pageWidthPx: 1000,
  pageHeightPx: 800,
  viewportWidthPx: 500,
  viewportHeightPx: 400,
  candidates: [{ id: "saved-corner", x: 200, y: 200 }],
  previousPoint: { x: 208, y: 100 },
});
assert.deepEqual(cornerSnap, {
  point: { x: 200, y: 200 },
  kind: "corner",
  label: "Snapped to saved corner",
  targetId: "saved-corner",
});

const alignedSnap = snapReviewSourcePoint({
  point: { x: 211, y: 360 },
  pageWidthPx: 1000,
  pageHeightPx: 800,
  viewportWidthPx: 500,
  viewportHeightPx: 400,
  previousPoint: { x: 200, y: 100 },
});
assert.equal(alignedSnap.kind, "aligned_x");
assert.deepEqual(alignedSnap.point, { x: 200, y: 360 });

const outsideZoomedSnapRange = snapReviewSourcePoint({
  point: { x: 211, y: 360 },
  pageWidthPx: 1000,
  pageHeightPx: 800,
  viewportWidthPx: 2000,
  viewportHeightPx: 1600,
  previousPoint: { x: 200, y: 100 },
});
assert.equal(outsideZoomedSnapRange.kind, "none");
assert.deepEqual(outsideZoomedSnapRange.point, { x: 211, y: 360 });

const contradiction = structuredClone(original);
const contradictionVertices = new Map(
  contradiction.floors[0].vertices.map((vertex) => [vertex.id, vertex])
);
const dimensionWall = contradiction.floors[0].walls.find((wall) => {
  if (wall.path.kind !== "line") return false;
  const start = contradictionVertices.get(wall.path.startVertexId)!;
  const end = contradictionVertices.get(wall.path.endVertexId)!;
  return start.xMm === end.xMm || start.zMm === end.zMm;
})!;
assert.ok(dimensionWall && dimensionWall.path.kind === "line");
const dimensionStart = contradictionVertices.get(
  dimensionWall.path.startVertexId
)!;
const dimensionEnd = contradictionVertices.get(dimensionWall.path.endVertexId)!;
const measuredMm = Math.round(
  Math.hypot(
    dimensionEnd.xMm - dimensionStart.xMm,
    dimensionEnd.zMm - dimensionStart.zMm
  )
);
contradiction.floors[0].dimensions.push({
  id: "fixed-source-dimension",
  axis: "aligned",
  fromVertexId: dimensionStart.id,
  toVertexId: dimensionEnd.id,
  measuredMm,
  provenance: structuredClone(dimensionWall.provenance),
});
compileFloorPlanDocumentV2(contradiction);
const matching = applyPointScaleCalibration({
  document: contradiction,
  floorId: floor.id,
  sourceId,
  pageNumber: 1,
  pageWidthPx: 1000,
  pageHeightPx: 800,
  first: { x: 0, y: 0 },
  second: { x: 500, y: 0 },
  printedMm: 5000,
});
assert.equal(
  matching.floors[0].dimensions.find(
    (dimension) => dimension.id === "fixed-source-dimension"
  )?.measuredMm,
  measuredMm,
  "Printed dimension values must never be rescaled"
);
assert.throws(
  () =>
    applyPointScaleCalibration({
      document: contradiction,
      floorId: floor.id,
      sourceId,
      pageNumber: 1,
      pageWidthPx: 1000,
      pageHeightPx: 800,
      first: { x: 0, y: 0 },
      second: { x: 500, y: 0 },
      printedMm: 10000,
    }),
  /dimension|validation|invalid/i,
  "Printed dimensions must reject a contradictory global scale"
);

const corrected = applyConsumerTopologyCorrection({
  document: original,
  mutationId: "review-opening-1",
  at: "2026-07-17T00:00:00.000Z",
  operation: {
    kind: "update_opening",
    floorId: floor.id,
    openingId: originalOpening.id,
    changes: { widthMm: originalOpening.widthMm - 1 },
  },
});
assert.equal(corrected.revisionId, original.revisionId);
assert.equal(corrected.verification.tier, "needs_review");
assert.equal(
  corrected.floors[0].openings.find((entry) => entry.id === originalOpening.id)!
    .provenance.evidence[0].basis,
  "inferred"
);
assert.throws(
  () =>
    applyConsumerTopologyCorrection({
      document: original,
      mutationId: "review-opening-bad",
      operation: {
        kind: "update_opening",
        floorId: floor.id,
        openingId: originalOpening.id,
        changes: { widthMm: 999999 },
      },
    }),
  /rejected|bounds|invalid/i
);

const unusedWall = originalFloor.walls.find((wall) => {
  if (wall.path.kind !== "line") return false;
  if (originalFloor.openings.some((entry) => entry.wallId === wall.id)) return false;
  const start = new Map(originalFloor.vertices.map((vertex) => [vertex.id, vertex])).get(
    wall.path.startVertexId
  )!;
  const end = new Map(originalFloor.vertices.map((vertex) => [vertex.id, vertex])).get(
    wall.path.endVertexId
  )!;
  return Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm) > 1000;
});
assert.ok(unusedWall);
const withMissingOpeningAdded = applyConsumerTopologyCorrection({
  document: original,
  mutationId: "review-opening-add",
  operation: {
    kind: "add_opening",
    floorId: floor.id,
    opening: {
      id: "consumer-opening-test",
      wallId: unusedWall.id,
      kind: "door",
      operation: "swing",
      offsetMm: 100,
      widthMm: 700,
      hinge: "unknown",
      handing: "unknown",
    },
  },
});
assert.ok(
  withMissingOpeningAdded.floors[0].openings.some(
    (entry) => entry.id === "consumer-opening-test"
  )
);
const withOpeningRemoved = applyConsumerTopologyCorrection({
  document: withMissingOpeningAdded,
  mutationId: "review-opening-remove",
  operation: {
    kind: "remove_opening",
    floorId: floor.id,
    openingId: "consumer-opening-test",
  },
});
assert.ok(
  !withOpeningRemoved.floors[0].openings.some(
    (entry) => entry.id === "consumer-opening-test"
  )
);
const withWallEvidenceCorrected = applyConsumerTopologyCorrection({
  document: original,
  mutationId: "review-wall-update",
  operation: {
    kind: "update_wall",
    floorId: floor.id,
    wallId: unusedWall.id,
    changes: {
      thicknessMm: unusedWall.thicknessMm + 1,
      classification:
        unusedWall.classification === "structural" ? "interior" : "structural",
    },
  },
});
assert.equal(
  withWallEvidenceCorrected.floors[0].walls.find(
    (entry) => entry.id === unusedWall.id
  )?.thicknessMm,
  unusedWall.thicknessMm + 1
);

const reviewStructureId = nextFloorPlanReviewEntityId(
  original,
  "consumer-structure"
);
const reviewStructureShape = buildStructureRectangleVertices({
  document: original,
  floor: originalFloor,
  bounds: { xMm: 123, zMm: 456, widthMm: 600, depthMm: 450 },
  idPrefix: `${reviewStructureId}-shape`,
});
assert.equal(reviewStructureShape.vertexIds.length, 4);
assert.equal(reviewStructureShape.vertices.length, 4);
const withReviewStructure = applyConsumerTopologyCorrection({
  document: original,
  mutationId: "review-structure-add",
  at: "2026-07-17T00:00:00.000Z",
  operation: {
    kind: "add_structure",
    floorId: floor.id,
    structure: {
      id: reviewStructureId,
      name: "Missing shaft",
      kind: "shaft",
      vertexIds: reviewStructureShape.vertexIds,
      baseOffsetMm: 0,
      heightMm: 2500,
      locked: true,
    },
    vertices: reviewStructureShape.vertices,
  },
});
const reviewStructure = withReviewStructure.floors[0].structures.find(
  (structure) => structure.id === reviewStructureId
)!;
assert.deepEqual(getStructureRectangleBounds(withReviewStructure.floors[0], reviewStructure), {
  xMm: 123,
  zMm: 456,
  widthMm: 600,
  depthMm: 450,
});
assert.equal(reviewStructure.provenance.evidence[0].basis, "inferred");

const withReviewDimension = applyConsumerTopologyCorrection({
  document: original,
  mutationId: "review-dimension-add",
  at: "2026-07-17T00:00:00.000Z",
  operation: {
    kind: "add_dimension",
    floorId: floor.id,
    dimension: {
      id: "consumer-dimension-test",
      label: "Checked source span",
      fromVertexId: dimensionStart.id,
      toVertexId: dimensionEnd.id,
      axis: "aligned",
      measuredMm,
    },
  },
});
assert.equal(withReviewDimension.floors[0].dimensions.at(-1)?.measuredMm, measuredMm);
assert.throws(
  () =>
    applyConsumerTopologyCorrection({
      document: withReviewDimension,
      mutationId: "review-dimension-contradiction",
      operation: {
        kind: "update_dimension",
        floorId: floor.id,
        dimensionId: "consumer-dimension-test",
        changes: { measuredMm: measuredMm + 1 },
      },
    }),
  /rejected|dimension|invalid/i
);

const reviewUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanOpeningCorrectionFields.tsx"
  ),
  "utf8"
);
const openingAddUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanOpeningAddFields.tsx"
  ),
  "utf8"
);
assert.match(openingAddUi, /kind: "add_opening"/);
assert.match(reviewUi, /kind: "remove_opening"/);
assert.match(reviewUi, /kind: "update_opening"/);
assert.match(reviewUi, /Height \(mm, optional\)/);
assert.match(reviewUi, /Hinge/);
assert.match(reviewUi, /Handing/);
const wallReviewUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanWallCorrectionFields.tsx"
  ),
  "utf8"
);
assert.match(wallReviewUi, /kind: "update_wall"/);
const structureReviewUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanStructureCorrectionFields.tsx"
  ),
  "utf8"
);
assert.match(structureReviewUi, /kind: "add_structure"/);
assert.match(structureReviewUi, /kind: "update_structure"/);
assert.match(structureReviewUi, /kind: "remove_structure"/);
assert.match(structureReviewUi, /service_strip/);
const dimensionReviewUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanDimensionCorrectionFields.tsx"
  ),
  "utf8"
);
assert.match(dimensionReviewUi, /kind: "add_dimension"/);
assert.match(dimensionReviewUi, /kind: "update_dimension"/);
assert.match(dimensionReviewUi, /kind: "remove_dimension"/);
assert.match(dimensionReviewUi, /Use current geometry/);
const topologyReviewUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanTopologyCorrectionPanel.tsx"
  ),
  "utf8"
);
assert.match(topologyReviewUi, /FloorPlanStructureCorrectionFields/);
assert.match(topologyReviewUi, /FloorPlanDimensionCorrectionFields/);
const criticalIssue = {
  id: "critical-review-note",
  code: "canonical_document_invalid",
  message: "Repair the invalid canonical wall topology.",
  severity: "critical" as const,
  resolved: false,
};
assert.throws(
  () =>
    validateReviewIssueResolution([criticalIssue], [
      { ...criticalIssue, resolved: true, resolution: "Checked" },
    ]),
  /descriptive resolution note/i,
  "A generic critical checkbox must not resolve source uncertainty."
);
const openingSuggestion = {
  ...criticalIssue,
  id: "opening-suggestion",
  code: "openings_confirmation",
  message: "Confirm every opening when available.",
};
assert.doesNotThrow(() =>
  validateReviewIssueResolution([openingSuggestion], [
    { ...openingSuggestion, resolved: true },
  ])
);
assert.equal(
  validateReviewIssueResolution([criticalIssue], [
    {
      ...criticalIssue,
      resolved: true,
      resolution: "Added and checked every visible source opening.",
    },
  ])[0].resolved,
  true
);
const reviewPanelUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx"
  ),
  "utf8"
);
assert.match(reviewPanelUi, /What did you verify or correct\?/);

console.log("Floor-plan consumer visual review geometry tests passed.");
