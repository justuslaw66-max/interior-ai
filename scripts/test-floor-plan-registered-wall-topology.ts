import assert from "node:assert/strict";
import type {
  RegisteredPageEvidence,
  SourcePointPx,
  SourceVectorPath,
  SourceVectorSegment,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { detectRegisteredOpeningGaps } from "@/lib/floor-plan-imports/opening-gap-evidence";
import {
  assembleRegisteredPlanarFaces,
  assessRegisteredTopologyCompleteness,
} from "@/lib/floor-plan-imports/planar-face-evidence";
import { detectRegisteredWallFootprintBands } from "@/lib/floor-plan-imports/topology-evidence";
import { deriveRegisteredWallCenterlines } from "@/lib/floor-plan-imports/wall-centerline-evidence";
import { parsePdfDrawPathEvidence } from "@/lib/floor-plan-imports/pdf-vector-evidence";

const wallPoints: SourcePointPx[] = [
  { x: 100, y: 100 },
  { x: 500, y: 100 },
  { x: 500, y: 220 },
  { x: 460, y: 220 },
  { x: 460, y: 140 },
  { x: 140, y: 140 },
  { x: 140, y: 460 },
  { x: 460, y: 460 },
  { x: 460, y: 300 },
  { x: 500, y: 300 },
  { x: 500, y: 500 },
  { x: 100, y: 500 },
];

function wallSegments(): SourceVectorSegment[] {
  return wallPoints.map((start, index) => ({
    id: `wall-band-${index + 1}`,
    pageNumber: 1,
    start,
    end: wallPoints[(index + 1) % wallPoints.length],
    strokeWidthPx: 2,
    confidence: 1,
    evidenceKind: "pdf_vector",
  }));
}

function doorPaths(suffix = "") {
  const arcPoints = Array.from({ length: 9 }, (_, index) => {
    const angle = (Math.PI / 2) + (Math.PI / 2) * (index / 8);
    return {
      x: 460 + Math.cos(angle) * 80,
      y: 220 + Math.sin(angle) * 80,
    };
  });
  const arcSegments: SourceVectorSegment[] = arcPoints.slice(0, -1).map((start, index) => ({
    id: `door-arc${suffix}-s${index + 1}`,
    pageNumber: 1,
    start,
    end: arcPoints[index + 1],
    strokeWidthPx: 1,
    confidence: 1,
    evidenceKind: "pdf_vector",
  }));
  const leafPoints = [
    { x: 460, y: 220 },
    { x: 380, y: 220 },
    { x: 380, y: 225 },
    { x: 460, y: 225 },
  ];
  const leafSegments: SourceVectorSegment[] = leafPoints.map((start, index) => ({
    id: `door-leaf${suffix}-s${index + 1}`,
    pageNumber: 1,
    start,
    end: leafPoints[(index + 1) % leafPoints.length],
    strokeWidthPx: 1,
    confidence: 1,
    evidenceKind: "pdf_vector",
  }));
  const paths: SourceVectorPath[] = [
    {
      id: `door-arc${suffix}`,
      pageNumber: 1,
      closed: false,
      segmentIds: arcSegments.map((segment) => segment.id),
      bbox: { left: 380, top: 220, right: 460, bottom: 300 },
      rectilinearScore: 0,
      confidence: 1,
      evidenceKind: "pdf_vector",
      paintOperation: "stroke",
    },
    {
      id: `door-leaf${suffix}`,
      pageNumber: 1,
      closed: true,
      segmentIds: leafSegments.map((segment) => segment.id),
      bbox: { left: 380, top: 220, right: 460, bottom: 225 },
      rectilinearScore: 1,
      confidence: 1,
      evidenceKind: "pdf_vector",
      paintOperation: "stroke",
    },
  ];
  return { paths, segments: [...arcSegments, ...leafSegments] };
}

function page(options: { includeDoor?: boolean; duplicateDoor?: boolean } = {}) {
  const bandSegments = wallSegments();
  const primaryDoor = doorPaths();
  const duplicateDoor = doorPaths("-duplicate");
  const doorSegments = options.includeDoor === false
    ? []
    : [...primaryDoor.segments, ...(options.duplicateDoor ? duplicateDoor.segments : [])];
  const doorVectorPaths = options.includeDoor === false
    ? []
    : [...primaryDoor.paths, ...(options.duplicateDoor ? duplicateDoor.paths : [])];
  const evidence: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: 1000,
    heightPx: 800,
    vectorSegments: [...bandSegments, ...doorSegments],
    vectorPaths: [
      {
        id: "wall-band",
        pageNumber: 1,
        closed: true,
        segmentIds: bandSegments.map((segment) => segment.id),
        bbox: { left: 100, top: 100, right: 500, bottom: 500 },
        rectilinearScore: 1,
        confidence: 1,
        evidenceKind: "pdf_vector",
        paintOperation: "stroke",
      },
      ...doorVectorPaths,
    ],
    text: [],
    semantics: {
      roomLabels: [
        {
          label: "Bedroom",
          roomType: "bedroom",
          centerXRatio: 0.3,
          centerYRatio: 0.375,
          confidence: 0.98,
          evidenceKind: "positioned_text",
        },
      ],
      dimensionLabels: [],
      openingSymbols: options.includeDoor === false
        ? []
        : [
            {
              kind: "door",
              operation: "swing",
              centerXRatio: 0.48,
              centerYRatio: 0.325,
              confidence: 0.98,
              evidenceKind: "positioned_text",
            },
          ],
      entrance: null,
      notes: [],
    },
  };
  return evidence;
}

function derive(evidence: RegisteredPageEvidence) {
  const bands = detectRegisteredWallFootprintBands(evidence);
  const centerlines = deriveRegisteredWallCenterlines(evidence, bands, 10);
  return { bands, centerlines };
}

const positive = page();
const { bands, centerlines } = derive(positive);
assert.equal(bands.length, 1);
assert.equal(centerlines.diagnostics.status, "complete");
assert.ok(centerlines.centerlines.length >= 5);
assert.ok(
  centerlines.centerlines.every(
    (centerline) =>
      centerline.thicknessMm === 400 &&
      centerline.boundarySegmentIds.length === 2
  ),
  "Every centerline must come from two exact source boundaries and preserve thickness."
);
const openings = detectRegisteredOpeningGaps(
  positive,
  centerlines.centerlines,
  10
);
assert.equal(openings.diagnostics.status, "complete");
assert.equal(openings.gaps.length, 1, JSON.stringify(openings.diagnostics));
assert.equal(openings.gaps[0].kind, "door");
assert.equal(openings.gaps[0].widthMm, 800);
assert.equal(openings.gaps[0].operation, "swing");
assert.equal(openings.gaps[0].proof, "swing_arc_and_leaf");
assert.deepEqual(openings.gaps[0].supportPathIds, ["door-arc", "door-leaf"]);
const faces = assembleRegisteredPlanarFaces(
  positive,
  centerlines.centerlines,
  openings.gaps
);
assert.equal(faces.diagnostics.status, "complete");
assert.equal(faces.faces.length, 1);
assert.equal(faces.faces[0].label, "Bedroom");
assert.ok(
  faces.faces[0].edges.some((edge) => edge.kind === "supported_opening_span")
);
assert.deepEqual(
  assessRegisteredTopologyCompleteness(
    positive,
    bands,
    centerlines,
    openings,
    faces
  ),
  { complete: true, blockers: [] }
);

const unsupported = page({ includeDoor: false });
const unsupportedDerived = derive(unsupported);
const unsupportedOpenings = detectRegisteredOpeningGaps(
  unsupported,
  unsupportedDerived.centerlines.centerlines,
  10
);
assert.equal(unsupportedOpenings.gaps.length, 0);
assert.equal(
  assembleRegisteredPlanarFaces(
    unsupported,
    unsupportedDerived.centerlines.centerlines,
    unsupportedOpenings.gaps
  ).faces.length,
  0,
  "An unsupported doorway gap must keep the topology open."
);
const unsupportedFaces = assembleRegisteredPlanarFaces(
  unsupported,
  unsupportedDerived.centerlines.centerlines,
  unsupportedOpenings.gaps
);
assert.equal(
  assessRegisteredTopologyCompleteness(
    unsupported,
    unsupportedDerived.bands,
    unsupportedDerived.centerlines,
    unsupportedOpenings,
    unsupportedFaces
  ).complete,
  false
);

const ambiguous = page({ duplicateDoor: true });
const ambiguousDerived = derive(ambiguous);
const ambiguousOpenings = detectRegisteredOpeningGaps(
  ambiguous,
  ambiguousDerived.centerlines.centerlines,
  10
);
assert.equal(ambiguousOpenings.gaps.length, 0);
assert.ok(ambiguousOpenings.diagnostics.ambiguousGapCount > 0);

const duplicateLabelPage = page();
duplicateLabelPage.semantics.roomLabels.push({
  ...duplicateLabelPage.semantics.roomLabels[0],
  label: "Duplicate OCR label",
  centerXRatio: 0.31,
});
const duplicateLabelDerived = derive(duplicateLabelPage);
const duplicateLabelOpenings = detectRegisteredOpeningGaps(
  duplicateLabelPage,
  duplicateLabelDerived.centerlines.centerlines,
  10
);
const duplicateLabelFaces = assembleRegisteredPlanarFaces(
  duplicateLabelPage,
  duplicateLabelDerived.centerlines.centerlines,
  duplicateLabelOpenings.gaps
);
assert.equal(duplicateLabelFaces.faces.length, 0);
assert.ok(
  assessRegisteredTopologyCompleteness(
    duplicateLabelPage,
    duplicateLabelDerived.bands,
    duplicateLabelDerived.centerlines,
    duplicateLabelOpenings,
    duplicateLabelFaces
  ).blockers.includes("unmapped_or_duplicate_room_labels")
);

const unlabeledPage = page();
unlabeledPage.semantics.roomLabels = [];
const unlabeledDerived = derive(unlabeledPage);
const unlabeledOpenings = detectRegisteredOpeningGaps(
  unlabeledPage,
  unlabeledDerived.centerlines.centerlines,
  10
);
const unlabeledFaces = assembleRegisteredPlanarFaces(
  unlabeledPage,
  unlabeledDerived.centerlines.centerlines,
  unlabeledOpenings.gaps
);
assert.equal(unlabeledFaces.faces.length, 1);
assert.equal(unlabeledFaces.faces[0].label, "Room 1");
assert.equal(unlabeledFaces.faces[0].roomType, "other");
assert.equal(
  assessRegisteredTopologyCompleteness(
    unlabeledPage,
    unlabeledDerived.bands,
    unlabeledDerived.centerlines,
    unlabeledOpenings,
    unlabeledFaces
  ).complete,
  true,
  "Missing room labels must not block a complete measured topology."
);

function sourcePath(
  id: string,
  segments: SourceVectorSegment[],
  closed = false
): SourceVectorPath {
  return {
    id,
    pageNumber: 1,
    closed,
    segmentIds: segments.map((segment) => segment.id),
    bbox: {
      left: Math.min(...segments.flatMap((segment) => [segment.start.x, segment.end.x])),
      top: Math.min(...segments.flatMap((segment) => [segment.start.y, segment.end.y])),
      right: Math.max(...segments.flatMap((segment) => [segment.start.x, segment.end.x])),
      bottom: Math.max(...segments.flatMap((segment) => [segment.start.y, segment.end.y])),
    },
    rectilinearScore: 1,
    confidence: 1,
    evidenceKind: "pdf_vector",
    paintOperation: "stroke",
  };
}

function line(id: string, start: SourcePointPx, end: SourcePointPx): SourceVectorSegment {
  return {
    id,
    pageNumber: 1,
    start,
    end,
    strokeWidthPx: 1,
    confidence: 1,
    evidenceKind: "pdf_vector",
  };
}

const singleJambRectangle = page({ includeDoor: false });
const jambSegments = [
  line("jamb-1", { x: 460, y: 220 }, { x: 500, y: 220 }),
  line("jamb-2", { x: 500, y: 220 }, { x: 500, y: 300 }),
  line("jamb-3", { x: 500, y: 300 }, { x: 460, y: 300 }),
  line("jamb-4", { x: 460, y: 300 }, { x: 460, y: 220 }),
];
singleJambRectangle.vectorSegments.push(...jambSegments);
singleJambRectangle.vectorPaths.push(sourcePath("single-jamb", jambSegments, true));
const singleJambDerived = derive(singleJambRectangle);
assert.equal(
  detectRegisteredOpeningGaps(
    singleJambRectangle,
    singleJambDerived.centerlines.centerlines,
    10
  ).gaps.length,
  0,
  "Two sides of one closed jamb rectangle must not be misclassified as a fixed window."
);

const fixedWindow = page({ includeDoor: false });
const fixedLines = [
  line("fixed-a", { x: 468, y: 220 }, { x: 468, y: 300 }),
  line("fixed-b", { x: 492, y: 220 }, { x: 492, y: 300 }),
];
fixedWindow.vectorSegments.push(...fixedLines);
fixedWindow.vectorPaths.push(
  sourcePath("fixed-frame-a", [fixedLines[0]]),
  sourcePath("fixed-frame-b", [fixedLines[1]])
);
const fixedDerived = derive(fixedWindow);
const fixedOpenings = detectRegisteredOpeningGaps(
  fixedWindow,
  fixedDerived.centerlines.centerlines,
  10
);
assert.equal(fixedOpenings.gaps.length, 1);
assert.equal(fixedOpenings.gaps[0].operation, "fixed");
assert.equal(fixedOpenings.gaps[0].proof, "paired_fixed_frame_lines");

const slidingDoor = page({ includeDoor: false });
const slidingLines = [
  line("sliding-a", { x: 468, y: 220 }, { x: 468, y: 270 }),
  line("sliding-b", { x: 492, y: 250 }, { x: 492, y: 300 }),
];
slidingDoor.vectorSegments.push(...slidingLines);
slidingDoor.vectorPaths.push(
  sourcePath("sliding-panel-a", [slidingLines[0]]),
  sourcePath("sliding-panel-b", [slidingLines[1]])
);
const slidingDerived = derive(slidingDoor);
const slidingOpenings = detectRegisteredOpeningGaps(
  slidingDoor,
  slidingDerived.centerlines.centerlines,
  10
);
assert.equal(slidingOpenings.gaps.length, 1);
assert.equal(slidingOpenings.gaps[0].operation, "sliding");
assert.equal(slidingOpenings.gaps[0].proof, "sliding_staggered_panels");

const foldingDoor = page({ includeDoor: false });
const foldingLines = [
  line("folding-a", { x: 480, y: 220 }, { x: 440, y: 260 }),
  line("folding-b", { x: 440, y: 260 }, { x: 480, y: 300 }),
];
foldingDoor.vectorSegments.push(...foldingLines);
foldingDoor.vectorPaths.push(sourcePath("folding-leaves", foldingLines));
const foldingDerived = derive(foldingDoor);
const foldingOpenings = detectRegisteredOpeningGaps(
  foldingDoor,
  foldingDerived.centerlines.centerlines,
  10
);
assert.equal(foldingOpenings.gaps.length, 1);
assert.equal(foldingOpenings.gaps[0].operation, "folding");
assert.equal(foldingOpenings.gaps[0].proof, "folding_connected_leaves");

const parsedPath = parsePdfDrawPathEvidence({
  data: [
    0, 0, 0,
    1, 20, 0,
    4,
    0, 50, 50,
    2, 60, 50, 70, 60, 80, 80,
  ],
  matrix: [2, 0, 0, -2, 10, 100],
  pageNumber: 3,
  pathIndex: 7,
  strokeWidthPx: 2,
  paintOperation: "stroke",
  sourceOperatorIndex: 42,
  graphicsStateDepth: 3,
  sourceFormPath: ["p3-form1", "p3-form2"],
  maxSegments: 20,
});
assert.ok(parsedPath);
assert.equal(parsedPath.path.sourceOperatorIndex, 42);
assert.equal(parsedPath.path.graphicsStateDepth, 3);
assert.deepEqual(parsedPath.path.sourceFormPath, ["p3-form1", "p3-form2"]);
assert.equal(parsedPath.path.subpaths?.length, 2);
assert.equal(parsedPath.path.subpaths?.[0].closed, true);
assert.equal(parsedPath.path.subpaths?.[1].closed, false);
assert.equal(parsedPath.path.curves?.length, 1);
assert.equal(parsedPath.path.curves?.[0].command, "cubic");
assert.equal(parsedPath.path.closed, false);
assert.ok(parsedPath.segments.every((segment) => segment.sourceSubpathId));

const boundedCenterlines = deriveRegisteredWallCenterlines(
  positive,
  bands,
  10,
  { maxAtomicIntervals: 1 }
);
assert.equal(boundedCenterlines.diagnostics.status, "bounded_out");
assert.equal(boundedCenterlines.centerlines.length, 0);
const boundedOpenings = detectRegisteredOpeningGaps(
  positive,
  centerlines.centerlines,
  10,
  { maxSupportChecks: 1 }
);
assert.equal(boundedOpenings.diagnostics.status, "bounded_out");
assert.equal(boundedOpenings.gaps.length, 0);
const boundedFaces = assembleRegisteredPlanarFaces(
  positive,
  centerlines.centerlines,
  openings.gaps,
  { maxIntersectionChecks: 1 }
);
assert.equal(boundedFaces.diagnostics.status, "bounded_out");
assert.equal(boundedFaces.faces.length, 0);

console.log("Registered wall topology evidence tests passed");
