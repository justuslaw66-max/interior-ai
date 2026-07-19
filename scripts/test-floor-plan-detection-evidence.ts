import assert from "node:assert/strict";
import {
  applySemanticEvidencePrior,
  registerRoomBoundaries,
  registerRoomRectangles,
  sourcePointsForClosedPath,
  solveScaleFromRegisteredEvidence,
  type RegisteredPageEvidence,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { detectRegisteredWallFootprintBands } from "@/lib/floor-plan-imports/topology-evidence";
import { registerSupportedPageTopology } from "@/lib/floor-plan-imports/pdf-raster-adapter";

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
