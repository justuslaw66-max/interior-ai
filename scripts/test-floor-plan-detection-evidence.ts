import assert from "node:assert/strict";
import {
  applySemanticEvidencePrior,
  parsePrintedLengthMm,
  registerRoomBoundaries,
  registerRoomRectangles,
  sourcePointsForClosedPath,
  solveScaleFromRegisteredEvidence,
  type RegisteredPageEvidence,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { detectRegisteredWallFootprintBands } from "@/lib/floor-plan-imports/topology-evidence";
import { registerSupportedPageTopology } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import {
  inferRoomIdentityFromFixtures,
  registerVisionGuidedRoomBoundaries,
} from "@/lib/floor-plan-imports/vision-guided-topology";

function makePage(): RegisteredPageEvidence {
  return {
    pageNumber: 1,
    widthPx: 1000,
    heightPx: 800,
    vectorSegments: [
      {
        id: "dimension-a",
        pageNumber: 1,
        start: { x: 100, y: 80 },
        end: { x: 500, y: 80 },
        strokeWidthPx: 1,
      },
      {
        id: "dimension-b",
        pageNumber: 1,
        start: { x: 100, y: 720 },
        end: { x: 400, y: 720 },
        strokeWidthPx: 1,
      },
      {
        id: "living-1",
        pageNumber: 1,
        start: { x: 120, y: 200 },
        end: { x: 520, y: 200 },
        strokeWidthPx: 8,
      },
      {
        id: "living-2",
        pageNumber: 1,
        start: { x: 520, y: 200 },
        end: { x: 520, y: 520 },
        strokeWidthPx: 8,
      },
      {
        id: "living-3",
        pageNumber: 1,
        start: { x: 520, y: 520 },
        end: { x: 120, y: 520 },
        strokeWidthPx: 8,
      },
      {
        id: "living-4",
        pageNumber: 1,
        start: { x: 120, y: 520 },
        end: { x: 120, y: 200 },
        strokeWidthPx: 8,
      },
    ],
    vectorPaths: [
      {
        id: "living-path",
        pageNumber: 1,
        closed: true,
        segmentIds: ["living-1", "living-2", "living-3", "living-4"],
        bbox: { left: 120, top: 200, right: 520, bottom: 520 },
        rectilinearScore: 1,
        evidenceKind: "pdf_vector",
      },
      {
        id: "label-glyph-path",
        pageNumber: 1,
        closed: true,
        segmentIds: ["glyph-1", "glyph-2", "glyph-3", "glyph-4"],
        bbox: { left: 290, top: 350, right: 310, bottom: 365 },
        rectilinearScore: 1,
      },
    ],
    text: [],
    semantics: {
      roomLabels: [
        {
          label: "Living / Dining",
          roomType: "living",
          centerXRatio: 0.3,
          centerYRatio: 0.45,
          confidence: 0.96,
        },
      ],
      dimensionLabels: [
        {
          valueMm: 4000,
          centerXRatio: 0.3,
          centerYRatio: 0.1,
          orientation: "horizontal",
          confidence: 0.99,
        },
        {
          valueMm: 3000,
          centerXRatio: 0.25,
          centerYRatio: 0.9,
          orientation: "horizontal",
          confidence: 0.99,
        },
      ],
      openingSymbols: [],
      entrance: null,
      notes: [],
    },
  };
}

const page = makePage();
const visionHigh = applySemanticEvidencePrior(
  {
    ...page.semantics,
    roomLabels: [{ ...page.semantics.roomLabels[0], confidence: 1 }],
  },
  "vision"
);
const visionLow = applySemanticEvidencePrior(
  {
    ...page.semantics,
    roomLabels: [{ ...page.semantics.roomLabels[0], confidence: 0.01 }],
  },
  "vision"
);
assert.equal(visionHigh.roomLabels[0].confidence, 0.55);
assert.equal(visionLow.roomLabels[0].confidence, 0.55);
assert.equal(visionHigh.roomLabels[0].evidenceKind, "vision");
const scale = solveScaleFromRegisteredEvidence(page);
assert.ok(scale, "Two agreeing source dimensions should solve scale.");
assert.equal(scale.millimetresPerPixel, 10);
assert.equal(scale.dimensionCount, 2);
assert.equal(scale.rmsResidualMm, 0);
assert.equal(parsePrintedLengthMm("40′"), 12_192);
assert.equal(parsePrintedLengthMm("12′-8″"), 3_861);
assert.equal(parsePrintedLengthMm(`9'-0" x 12'-0"`), null);

const splitDimensionPage = makePage();
splitDimensionPage.widthPx = 1328;
splitDimensionPage.heightPx = 988;
splitDimensionPage.vectorPaths = [];
splitDimensionPage.vectorSegments = [
  {
    id: "width-left",
    pageNumber: 1,
    start: { x: 284, y: 97.5 },
    end: { x: 747.5, y: 97.5 },
    strokeWidthPx: 1,
    evidenceKind: "raster_linework",
  },
  {
    id: "width-right",
    pageNumber: 1,
    start: { x: 804, y: 97.5 },
    end: { x: 1268, y: 97.5 },
    strokeWidthPx: 1,
    evidenceKind: "raster_linework",
  },
  {
    id: "height-top",
    pageNumber: 1,
    start: { x: 216.5, y: 166 },
    end: { x: 216.5, y: 504.5 },
    strokeWidthPx: 1,
    evidenceKind: "raster_linework",
  },
  {
    id: "height-bottom",
    pageNumber: 1,
    start: { x: 216.5, y: 561.5 },
    end: { x: 216.5, y: 901 },
    strokeWidthPx: 1,
    evidenceKind: "raster_linework",
  },
];
splitDimensionPage.semantics.dimensionLabels = [
  {
    valueMm: 12_192,
    rawText: "40′",
    centerXRatio: 776 / 1328,
    centerYRatio: 58 / 988,
    orientation: "horizontal",
    extensionStart: { xRatio: 284 / 1328, yRatio: 97.5 / 988 },
    extensionEnd: { xRatio: 1268 / 1328, yRatio: 97.5 / 988 },
    confidence: 0.9,
  },
  {
    valueMm: 9_144,
    rawText: "30′",
    centerXRatio: 210 / 1328,
    centerYRatio: 533 / 988,
    orientation: "vertical",
    extensionStart: { xRatio: 216.5 / 1328, yRatio: 166 / 988 },
    extensionEnd: { xRatio: 216.5 / 1328, yRatio: 901 / 988 },
    confidence: 0.9,
  },
];
const splitScale = solveScaleFromRegisteredEvidence(splitDimensionPage);
assert.ok(
  splitScale,
  "Dimension fragments separated by printed text must reconstruct two full spans."
);
assert.equal(splitScale.dimensionCount, 2);
assert.ok((splitScale.diagnostics?.compoundSpanCandidateCount ?? 0) >= 2);
assert.ok(Math.abs(splitScale.millimetresPerPixel - 12.41) < 0.08);
const textGapOnlyPage = structuredClone(splitDimensionPage);
textGapOnlyPage.semantics.dimensionLabels =
  textGapOnlyPage.semantics.dimensionLabels.map((dimension) => ({
    ...dimension,
    extensionStart: undefined,
    extensionEnd: undefined,
  }));
const textGapOnlyScale = solveScaleFromRegisteredEvidence(textGapOnlyPage);
assert.ok(
  textGapOnlyScale,
  "Printed labels must reconstruct split spans even when semantic endpoints are absent."
);
assert.equal(textGapOnlyScale.dimensionCount, 2);
assert.equal(textGapOnlyScale.diagnostics?.compoundSpanCandidateCount, 2);
const registeredPageScale = { pageNumber: page.pageNumber, ...scale };

const registeredRooms = registerRoomRectangles(page);
assert.deepEqual(registeredRooms.map((room) => [room.label, room.pathId]), [
  ["Living / Dining", "living-path"],
]);
const unlabeledDirectPage = structuredClone(page);
unlabeledDirectPage.semantics.roomLabels = [];
assert.deepEqual(
  registerRoomBoundaries(unlabeledDirectPage).map((room) => [
    room.label,
    room.roomType,
    room.pathId,
  ]),
  [["Room 1", "other", "living-path"]],
  "A trustworthy closed room remains usable when OCR finds no room label."
);
const completeDirectTopology = registerSupportedPageTopology(
  page,
  registeredPageScale
);
assert.equal(completeDirectTopology.promotionComplete, true);
assert.deepEqual(
  completeDirectTopology.rooms.map((room) => room.pathId),
  ["living-path"],
  "A fully labelled closed source path should retain direct promotion."
);

function addAdjacentBedroom(
  target: RegisteredPageEvidence,
  leftX: number
) {
  const points = [
    { x: leftX, y: 200 },
    { x: 800, y: 200 },
    { x: 800, y: 520 },
    { x: leftX, y: 520 },
  ];
  const segments = points.map((start, index) => ({
    id: `bedroom-${index + 1}`,
    pageNumber: target.pageNumber,
    start,
    end: points[(index + 1) % points.length],
    strokeWidthPx: 8,
    evidenceKind: "pdf_vector" as const,
  }));
  target.vectorSegments.push(...segments);
  target.vectorPaths.push({
    id: "bedroom-path",
    pageNumber: target.pageNumber,
    closed: true,
    segmentIds: segments.map((segment) => segment.id),
    bbox: { left: leftX, top: 200, right: 800, bottom: 520 },
    rectilinearScore: 1,
    evidenceKind: "pdf_vector",
  });
  target.semantics.roomLabels.push({
    label: "Bedroom",
    roomType: "bedroom",
    centerXRatio: 0.66,
    centerYRatio: 0.45,
    confidence: 0.96,
  });
}

const sharedDirectPage = structuredClone(page);
addAdjacentBedroom(sharedDirectPage, 520);
const sharedDirectTopology = registerSupportedPageTopology(
  sharedDirectPage,
  registeredPageScale
);
assert.equal(sharedDirectTopology.promotionComplete, true);
assert.equal(sharedDirectTopology.rooms.length, 2);

const inconsistentSharedDirectPage = structuredClone(page);
addAdjacentBedroom(inconsistentSharedDirectPage, 500);
const inconsistentSharedDirectTopology = registerSupportedPageTopology(
  inconsistentSharedDirectPage,
  registeredPageScale
);
assert.equal(inconsistentSharedDirectTopology.promotionComplete, false);
assert.equal(inconsistentSharedDirectTopology.rooms.length, 0);
assert.ok(
  inconsistentSharedDirectTopology.promotionBlockers.includes(
    "inconsistent_shared_room_edges"
  ),
  "Partially overlapping room edges must not compile into duplicate shared walls."
);

const partialDirectPage = structuredClone(page);
partialDirectPage.semantics.roomLabels.push({
  label: "Bedroom",
  roomType: "bedroom",
  centerXRatio: 0.75,
  centerYRatio: 0.45,
  confidence: 0.96,
});
const partialDirectTopology = registerSupportedPageTopology(
  partialDirectPage,
  registeredPageScale
);
assert.equal(partialDirectTopology.promotionComplete, false);
assert.equal(partialDirectTopology.rooms.length, 0);
assert.ok(
  partialDirectTopology.promotionBlockers.includes(
    "unmapped_or_duplicate_room_labels"
  ),
  "A partial direct-path match must fail the same complete-plan room coverage gate."
);

const visionGuidedPage = makePage();
visionGuidedPage.vectorPaths = [];
visionGuidedPage.vectorSegments = visionGuidedPage.vectorSegments.map((segment) => ({
  ...segment,
  evidenceKind: "raster_linework",
  confidence: 0.92,
}));
visionGuidedPage.semantics.planRegion = {
  bbox: {
    leftRatio: 0.08,
    topRatio: 0.18,
    rightRatio: 0.56,
    bottomRatio: 0.68,
  },
  rotationDegrees: 0,
  confidence: 0.55,
  evidenceKind: "vision",
};
visionGuidedPage.semantics.roomBoundaries = [
  {
    label: "Living / Dining",
    roomType: "living",
    points: [
      { xRatio: 0.114, yRatio: 0.2425 },
      { xRatio: 0.526, yRatio: 0.2425 },
      { xRatio: 0.526, yRatio: 0.6575 },
      { xRatio: 0.114, yRatio: 0.6575 },
    ],
    confidence: 0.55,
    evidenceKind: "vision",
  },
];
const guidedRegistration = registerVisionGuidedRoomBoundaries(visionGuidedPage);
assert.equal(guidedRegistration.complete, true);
assert.equal(guidedRegistration.rooms.length, 1);
assert.equal(
  guidedRegistration.rooms[0].registrationKind,
  "vision_guided_source_snap"
);
assert.deepEqual(guidedRegistration.rooms[0].sourcePoints, [
  { x: 120, y: 200 },
  { x: 520, y: 200 },
  { x: 520, y: 520 },
  { x: 120, y: 520 },
]);
const openPlanPage = structuredClone(visionGuidedPage);
openPlanPage.semantics.roomLabels.push({
  label: "Kitchen",
  roomType: "kitchen",
  centerXRatio: 0.42,
  centerYRatio: 0.5,
  confidence: 0.55,
  evidenceKind: "vision",
});
const openPlanRegistration = registerVisionGuidedRoomBoundaries(openPlanPage);
assert.equal(openPlanRegistration.complete, true);
assert.equal(openPlanRegistration.rooms[0].label, "Open Plan");
assert.deepEqual(
  openPlanRegistration.rooms[0].sourceLabels?.map((label) => label.label),
  ["Living / Dining", "Kitchen"],
  "Several functional labels in one wall-bounded face must not invent partitions."
);
const strayLabelPage = structuredClone(visionGuidedPage);
strayLabelPage.semantics.roomLabels.push({
  label: "Closet",
  roomType: "other",
  centerXRatio: 0.9,
  centerYRatio: 0.9,
  confidence: 0.55,
  evidenceKind: "vision",
});
const strayLabelRegistration =
  registerVisionGuidedRoomBoundaries(strayLabelPage);
assert.equal(
  strayLabelRegistration.complete,
  true,
  "An unmatched printed label is optional metadata when every proposed room boundary is source-supported."
);
assert.equal(strayLabelRegistration.rooms.length, 1);
const unlabeledFacePage = structuredClone(visionGuidedPage);
unlabeledFacePage.semantics.planRegion!.bbox.rightRatio = 0.94;
const unlabeledRoomPoints = [
  { x: 600, y: 200 },
  { x: 900, y: 200 },
  { x: 900, y: 520 },
  { x: 600, y: 520 },
];
unlabeledFacePage.vectorSegments.push(
  ...unlabeledRoomPoints.map((start, index) => ({
    id: `unlabeled-wall-${index + 1}`,
    pageNumber: 1,
    start,
    end: unlabeledRoomPoints[(index + 1) % unlabeledRoomPoints.length],
    strokeWidthPx: 10,
    evidenceKind: "raster_linework" as const,
    confidence: 0.95,
  }))
);
unlabeledFacePage.semantics.roomBoundaries!.push({
  label: "Unlabeled space",
  roomType: "other",
  points: unlabeledRoomPoints.map((point) => ({
    xRatio: (point.x + (point.x === 600 ? -4 : point.x === 900 ? 4 : 0)) / 1000,
    yRatio: (point.y + (point.y === 200 ? -4 : point.y === 520 ? 4 : 0)) / 800,
  })),
  confidence: 0.55,
  evidenceKind: "vision",
});
const unlabeledFaceRegistration =
  registerVisionGuidedRoomBoundaries(unlabeledFacePage);
assert.equal(
  unlabeledFaceRegistration.complete,
  true,
  "A source-supported closed face must not be rejected only because it has no printed label."
);
assert.equal(unlabeledFaceRegistration.rooms.length, 2);
assert.ok(
  unlabeledFaceRegistration.rooms.some((room) => room.label.startsWith("Room ")),
  "Trustworthy unlabeled faces receive an editable temporary name."
);
const fixtureSeededBathroomPage = structuredClone(visionGuidedPage);
fixtureSeededBathroomPage.semantics.planRegion!.bbox.rightRatio = 0.82;
const bathroomShellPoints = [
  { x: 600, y: 200 },
  { x: 760, y: 200 },
  { x: 760, y: 520 },
  { x: 600, y: 520 },
];
fixtureSeededBathroomPage.vectorSegments.push(
  ...bathroomShellPoints.map((start, index) => ({
    id: `bathroom-wall-${index + 1}`,
    pageNumber: 1,
    start,
    end: bathroomShellPoints[(index + 1) % bathroomShellPoints.length],
    strokeWidthPx: 12,
    evidenceKind: "raster_linework" as const,
    confidence: 0.97,
  }))
);
fixtureSeededBathroomPage.semantics.fixtureSymbols = [
  {
    kind: "bathtub",
    centerXRatio: 0.68,
    centerYRatio: 0.3,
    bbox: {
      leftRatio: 0.62,
      topRatio: 0.26,
      rightRatio: 0.74,
      bottomRatio: 0.35,
    },
    confidence: 0.55,
    evidenceKind: "vision",
  },
  {
    kind: "toilet",
    centerXRatio: 0.67,
    centerYRatio: 0.45,
    bbox: {
      leftRatio: 0.63,
      topRatio: 0.39,
      rightRatio: 0.71,
      bottomRatio: 0.51,
    },
    confidence: 0.55,
    evidenceKind: "vision",
  },
  {
    kind: "basin",
    centerXRatio: 0.64,
    centerYRatio: 0.58,
    bbox: {
      leftRatio: 0.62,
      topRatio: 0.54,
      rightRatio: 0.67,
      bottomRatio: 0.61,
    },
    confidence: 0.55,
    evidenceKind: "vision",
  },
];
assert.deepEqual(
  inferRoomIdentityFromFixtures(
    fixtureSeededBathroomPage.semantics.fixtureSymbols
  ),
  { label: "Bathroom", roomType: "toilet", confidence: 0.55 }
);
const fixtureSeededBathroomRegistration =
  registerVisionGuidedRoomBoundaries(fixtureSeededBathroomPage);
assert.equal(fixtureSeededBathroomRegistration.complete, true);
assert.equal(fixtureSeededBathroomRegistration.rooms.length, 2);
const fixtureInferredBathroom =
  fixtureSeededBathroomRegistration.rooms.find(
    (room) => room.roomType === "toilet"
  );
assert.equal(fixtureInferredBathroom?.label, "Bathroom");
assert.deepEqual(fixtureInferredBathroom?.sourcePoints, bathroomShellPoints);
assert.deepEqual(
  fixtureInferredBathroom?.sourceFixtures?.map((fixture) => fixture.kind),
  ["bathtub", "toilet", "basin"],
  "A bathtub, toilet and basin cluster must seed and classify an unlabeled bathroom face without becoming furniture."
);
const optionalOutlierPage = structuredClone(unlabeledFacePage);
optionalOutlierPage.semantics.roomBoundaries!.push({
  label: "Uncertain proposal",
  roomType: "other",
  points: [
    { xRatio: 0.65, yRatio: 0.72 },
    { xRatio: 0.78, yRatio: 0.72 },
    { xRatio: 0.78, yRatio: 0.84 },
    { xRatio: 0.65, yRatio: 0.84 },
  ],
  confidence: 0.55,
  evidenceKind: "vision",
});
const optionalOutlierRegistration =
  registerVisionGuidedRoomBoundaries(optionalOutlierPage);
assert.equal(
  optionalOutlierRegistration.complete,
  true,
  "One unsupported semantic outlier must not veto two complete source-supported faces."
);
assert.equal(optionalOutlierRegistration.rooms.length, 2);
const angledRoomPage = makePage();
const angledRoomPoints = [
  { x: 200, y: 400 },
  { x: 400, y: 200 },
  { x: 600, y: 400 },
  { x: 400, y: 600 },
];
angledRoomPage.vectorPaths = [];
angledRoomPage.vectorSegments = angledRoomPoints.map((start, index) => ({
  id: `angled-wall-${index + 1}`,
  pageNumber: 1,
  start,
  end: angledRoomPoints[(index + 1) % angledRoomPoints.length],
  strokeWidthPx: 10,
  confidence: 0.95,
  evidenceKind: "raster_linework" as const,
}));
angledRoomPage.semantics.roomLabels = [
  {
    label: "Study",
    roomType: "study",
    centerXRatio: 0.4,
    centerYRatio: 0.5,
    confidence: 0.55,
    evidenceKind: "vision",
  },
];
angledRoomPage.semantics.planRegion = {
  bbox: {
    leftRatio: 0.15,
    topRatio: 0.15,
    rightRatio: 0.65,
    bottomRatio: 0.8,
  },
  rotationDegrees: 0,
  confidence: 0.55,
  evidenceKind: "vision",
};
angledRoomPage.semantics.roomBoundaries = [
  {
    label: "Study",
    roomType: "study",
    points: [
      { xRatio: 0.195, yRatio: 0.5 },
      { xRatio: 0.4, yRatio: 0.245 },
      { xRatio: 0.605, yRatio: 0.5 },
      { xRatio: 0.4, yRatio: 0.755 },
    ],
    confidence: 0.55,
    evidenceKind: "vision",
  },
];
const angledRoomRegistration =
  registerVisionGuidedRoomBoundaries(angledRoomPage);
assert.equal(angledRoomRegistration.complete, true);
assert.ok(
  angledRoomRegistration.rooms[0].sourcePoints.every(
    (point, index) =>
      Math.hypot(
        point.x - angledRoomPoints[index].x,
        point.y - angledRoomPoints[index].y
      ) <= 1
  ),
  "Straight angled walls must snap to their deterministic source centerlines."
);
const visionGuidedTopology = registerSupportedPageTopology(
  visionGuidedPage,
  registeredPageScale
);
assert.equal(visionGuidedTopology.promotionComplete, true);
assert.equal(visionGuidedTopology.rooms.length, 1);
assert.equal(
  visionGuidedTopology.rooms[0].registrationKind,
  "vision_guided_source_snap",
  "A semantic proposal may become canonical only after every edge snaps to raster linework."
);

const unsupportedVisionBoundary = structuredClone(visionGuidedPage);
unsupportedVisionBoundary.vectorSegments = unsupportedVisionBoundary.vectorSegments.filter(
  (segment) => segment.id !== "living-4"
);
const unsupportedVisionTopology = registerSupportedPageTopology(
  unsupportedVisionBoundary,
  registeredPageScale
);
assert.equal(unsupportedVisionTopology.promotionComplete, false);
assert.equal(unsupportedVisionTopology.rooms.length, 0);
assert.ok(
  unsupportedVisionTopology.promotionBlockers.includes(
    "unregistered_semantic_room_boundaries"
  ),
  "A proposal with one unsupported wall edge must remain in review."
);

const furnitureAmbiguity = structuredClone(visionGuidedPage);
const furniturePoints = [
  { x: 220, y: 300 },
  { x: 380, y: 300 },
  { x: 380, y: 420 },
  { x: 220, y: 420 },
];
furnitureAmbiguity.vectorSegments.push(
  ...furniturePoints.map((start, index) => ({
    id: `furniture-${index + 1}`,
    pageNumber: 1,
    start,
    end: furniturePoints[(index + 1) % furniturePoints.length],
    strokeWidthPx: 3,
    evidenceKind: "raster_linework" as const,
    confidence: 0.95,
  }))
);
furnitureAmbiguity.semantics.roomBoundaries!.push({
  label: "Living / Dining",
  roomType: "living",
  points: furniturePoints.map((point) => ({
    xRatio: point.x / furnitureAmbiguity.widthPx,
    yRatio: point.y / furnitureAmbiguity.heightPx,
  })),
  confidence: 0.55,
  evidenceKind: "vision",
});
const furnitureAmbiguityTopology = registerSupportedPageTopology(
  furnitureAmbiguity,
  registeredPageScale
);
assert.equal(furnitureAmbiguityTopology.promotionComplete, true);
assert.equal(furnitureAmbiguityTopology.rooms.length, 1);
assert.equal(
  furnitureAmbiguityTopology.rooms[0].label,
  "Living / Dining",
  "A contained furniture rectangle competing for the same label must be suppressed."
);

const curveBearingPath = {
  ...page.vectorPaths[0],
  containsCurves: true,
};
assert.equal(
  sourcePointsForClosedPath(page, curveBearingPath),
  null,
  "A curve-bearing PDF path must not be flattened into automatic straight walls."
);

const nonRectangular = makePage();
nonRectangular.vectorSegments = [
  ...nonRectangular.vectorSegments.slice(0, 2),
  ...[
    [120, 200, 520, 200],
    [520, 200, 520, 320],
    [520, 320, 320, 320],
    [320, 320, 320, 520],
    [320, 520, 120, 520],
    [120, 520, 120, 200],
  ].map(([x1, y1, x2, y2], index) => ({
    id: `l-${index + 1}`,
    pageNumber: 1,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    strokeWidthPx: 8,
    evidenceKind: "pdf_vector" as const,
  })),
];
nonRectangular.vectorPaths = [
  {
    id: "l-shaped-room",
    pageNumber: 1,
    closed: true,
    segmentIds: ["l-1", "l-2", "l-3", "l-4", "l-5", "l-6"],
    bbox: { left: 120, top: 200, right: 520, bottom: 520 },
    rectilinearScore: 1,
    evidenceKind: "pdf_vector",
  },
];
const [registeredLShape] = registerRoomBoundaries(nonRectangular);
assert.equal(registeredLShape.sourcePoints.length, 6);
assert.ok(
  registeredLShape.sourcePoints.some((point) => point.x === 320 && point.y === 320),
  "A non-rectangular source corner must survive registration."
);

const wallFootprintBand = makePage();
const bandPoints = [
  [100, 100],
  [500, 100],
  [500, 140],
  [140, 140],
  [140, 460],
  [500, 460],
  [500, 500],
  [100, 500],
] as const;
wallFootprintBand.vectorSegments = bandPoints.map((point, index) => {
  const next = bandPoints[(index + 1) % bandPoints.length];
  return {
    id: `band-${index + 1}`,
    pageNumber: 1,
    start: { x: point[0], y: point[1] },
    end: { x: next[0], y: next[1] },
    strokeWidthPx: 2,
    confidence: 1,
    evidenceKind: "pdf_vector" as const,
  };
});
wallFootprintBand.vectorPaths = [
  {
    id: "wall-footprint-band",
    pageNumber: 1,
    closed: true,
    segmentIds: wallFootprintBand.vectorSegments.map((segment) => segment.id),
    bbox: { left: 100, top: 100, right: 500, bottom: 500 },
    rectilinearScore: 1,
    confidence: 1,
    evidenceKind: "pdf_vector",
    paintOperation: "stroke",
  },
];
wallFootprintBand.semantics.roomLabels[0] = {
  label: "Living / Dining",
  roomType: "living",
  centerXRatio: 0.3,
  centerYRatio: 0.375,
  confidence: 0.96,
};
assert.equal(
  registerRoomBoundaries(wallFootprintBand).length,
  0,
  "A thin wall footprint whose concavity surrounds a label is not a room loop."
);
const [registeredBand] = detectRegisteredWallFootprintBands(wallFootprintBand);
assert.equal(registeredBand.pathId, "wall-footprint-band");
assert.deepEqual(registeredBand.labelIndexes, [0]);
assert.ok(registeredBand.fillRatio > 0.02 && registeredBand.fillRatio < 0.45);
assert.ok(
  !registeredLShape.sourcePoints.some((point) => point.x === 520 && point.y === 520),
  "The extractor must not invent a bounding-box corner outside the source path."
);

const contradiction = makePage();
contradiction.semantics.dimensionLabels[1].valueMm = 4200;
assert.equal(
  solveScaleFromRegisteredEvidence(contradiction),
  null,
  "Contradictory dimension systems must block automatic scale."
);

const oneDimension = makePage();
oneDimension.semantics.dimensionLabels = oneDimension.semantics.dimensionLabels.slice(0, 1);
assert.equal(
  solveScaleFromRegisteredEvidence(oneDimension),
  null,
  "A single printed dimension is not enough for automatic verification."
);

const twoScaleSystems = makePage();
twoScaleSystems.widthPx = 2000;
twoScaleSystems.heightPx = 1000;
twoScaleSystems.vectorPaths = [];
twoScaleSystems.vectorSegments = [
  [100, 100, 500, 100],
  [700, 200, 1000, 200],
  [1200, 800, 1400, 800],
  [1550, 900, 1700, 900],
].map(([x1, y1, x2, y2], index) => ({
  id: `scale-line-${index + 1}`,
  pageNumber: 1,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  strokeWidthPx: 1,
}));
twoScaleSystems.semantics.roomLabels = [];
twoScaleSystems.semantics.dimensionLabels = [
  {
    valueMm: 4000,
    centerXRatio: 0.15,
    centerYRatio: 0.1,
    orientation: "horizontal",
    confidence: 0.99,
  },
  {
    valueMm: 3000,
    centerXRatio: 0.425,
    centerYRatio: 0.2,
    orientation: "horizontal",
    confidence: 0.99,
  },
  {
    valueMm: 4000,
    centerXRatio: 0.65,
    centerYRatio: 0.8,
    orientation: "horizontal",
    confidence: 0.99,
  },
  {
    valueMm: 3000,
    centerXRatio: 0.8125,
    centerYRatio: 0.9,
    orientation: "horizontal",
    confidence: 0.99,
  },
];
assert.equal(
  solveScaleFromRegisteredEvidence(twoScaleSystems),
  null,
  "Two independently supported drawing scales on one page must block automatic scale."
);

const dominantScaleWithDistantDistractors = makePage();
dominantScaleWithDistantDistractors.widthPx = 2000;
dominantScaleWithDistantDistractors.heightPx = 1000;
dominantScaleWithDistantDistractors.vectorPaths = [];
dominantScaleWithDistantDistractors.vectorSegments = [];
dominantScaleWithDistantDistractors.semantics.roomLabels = [];
dominantScaleWithDistantDistractors.semantics.dimensionLabels = [];
for (let index = 0; index < 6; index += 1) {
  const valueMm = 2000 + index * 500;
  const lengthPx = valueMm / 10;
  const x = 100 + index * 280;
  const y = 100 + (index % 2) * 260;
  dominantScaleWithDistantDistractors.vectorSegments.push({
    id: `primary-${index}`,
    pageNumber: 1,
    start: { x, y },
    end: { x: x + lengthPx, y },
    strokeWidthPx: 1,
  });
  dominantScaleWithDistantDistractors.semantics.dimensionLabels.push({
    valueMm,
    centerXRatio: (x + lengthPx / 2) / 2000,
    centerYRatio: y / 1000,
    orientation: "horizontal",
    confidence: 0.72,
    evidenceKind: "ocr",
  });
  if (index < 2) {
    dominantScaleWithDistantDistractors.vectorSegments.push({
      id: `distant-distractor-${index}`,
      pageNumber: 1,
      start: { x, y: y + 140 },
      end: { x: x + lengthPx / 2, y: y + 140 },
      strokeWidthPx: 1,
    });
  }
}
const dominantScale = solveScaleFromRegisteredEvidence(
  dominantScaleWithDistantDistractors
);
assert.ok(dominantScale, "A dominant six-dimension scale must survive two distant repeated-length distractors.");
assert.equal(dominantScale.millimetresPerPixel, 10);
assert.equal(dominantScale.dimensionCount, 6);

const locallyAnchoredScale = makePage();
locallyAnchoredScale.widthPx = 2000;
locallyAnchoredScale.heightPx = 1000;
locallyAnchoredScale.vectorPaths = [];
locallyAnchoredScale.semantics.roomLabels = [];
locallyAnchoredScale.vectorSegments = [
  [100, 100, 300, 100],
  [500, 100, 800, 100],
  [75, 300, 325, 300],
  [462.5, 300, 837.5, 300],
  [950, 300, 1450, 300],
].map(([x1, y1, x2, y2], index) => ({
  id: `local-anchor-line-${index + 1}`,
  pageNumber: 1,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  strokeWidthPx: 1,
}));
locallyAnchoredScale.semantics.dimensionLabels = [
  { valueMm: 2000, centerXRatio: 0.1, centerYRatio: 0.1, orientation: "horizontal", confidence: 0.9 },
  { valueMm: 3000, centerXRatio: 0.325, centerYRatio: 0.1, orientation: "horizontal", confidence: 0.9 },
  { valueMm: 4000, centerXRatio: 0.6, centerYRatio: 0.1, orientation: "horizontal", confidence: 0.9 },
];
const localSolution = solveScaleFromRegisteredEvidence(locallyAnchoredScale);
assert.ok(localSolution, "Two local printed dimensions should establish scale in dense linework.");
assert.equal(localSolution.millimetresPerPixel, 10);
assert.equal(
  localSolution.dimensionCount,
  2,
  "A farther three-label ratio cluster must not outrank locally anchored dimension lines."
);

console.log("Floor-plan deterministic evidence tests passed");
