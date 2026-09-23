import assert from "node:assert/strict";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceV2,
  FloorPlanFloorV2,
  FloorPlanSourceAnchorV2,
} from "@/lib/floor-plan-document-v2";
import {
  assertFloorPlanPublicationChecks,
  computeFloorPlanPublicationChecks,
} from "@/lib/floor-plan-imports/publication";
import type { FloorPlanSourceObservationManifest } from "@/lib/floor-plan-imports/source-observation-manifest";
import { evaluateFloorPlanSourceOverlayResiduals } from "@/lib/floor-plan-imports/source-overlay-residuals";

const reviewedAt = "2026-07-16T00:00:00.000Z";
const approval = {
  id: "approval-1",
  action: "approved" as const,
  reviewerId: "reviewer@example.com",
  reviewedAt,
};

function evidence(input: {
  sourceId: string;
  pageNumber: number;
  calibrationId: string;
  anchors?: FloorPlanSourceAnchorV2[];
  crop?: { xPx: number; yPx: number; widthPx: number; heightPx: number };
}): FloorPlanEvidenceV2 {
  return {
    sourceId: input.sourceId,
    basis: "vector_traced",
    confidence: 1,
    extractorVersion: "overlay-residual-test-1",
    pageNumber: input.pageNumber,
    calibrationId: input.calibrationId,
    cropPx: input.crop ?? { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
    ...(input.anchors ? { sourceAnchors: input.anchors } : {}),
  };
}

function provenance(item: FloorPlanEvidenceV2): FloorPlanEntityProvenanceV2 {
  return {
    confidence: 1,
    extractionVersion: "overlay-residual-test-1",
    evidence: [item],
    reviewHistory: [approval],
  };
}

function lineFloor(input: {
  floorId: string;
  sourceId: string;
  pageNumber: number;
  calibrationId: string;
  scale: number;
  translateX: number;
  translateY: number;
}): FloorPlanFloorV2 {
  const point = (xMm: number, zMm: number) => ({
    x: input.translateX + xMm * input.scale,
    y: input.translateY + zMm * input.scale,
  });
  const baseEvidence = evidence({
    sourceId: input.sourceId,
    pageNumber: input.pageNumber,
    calibrationId: input.calibrationId,
  });
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "source_documented" as const,
    provenance: provenance(baseEvidence),
  });
  return {
    id: input.floorId,
    name: input.floorId,
    levelIndex: input.pageNumber - 1,
    elevationMm: (input.pageNumber - 1) * 3000,
    storeyHeightMm: 3000,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: measured(2700),
      doorHeight: measured(2100),
      windowHeight: measured(1200),
      windowSillHeight: measured(900),
    },
    calibrations: [
      {
        id: input.calibrationId,
        sourceId: input.sourceId,
        pageNumber: input.pageNumber,
        imageWidthPx: 1000,
        imageHeightPx: 1000,
        controlPoints: [
          { planMm: { xMm: 0, zMm: 0 }, sourcePx: point(0, 0) },
          { planMm: { xMm: 1000, zMm: 0 }, sourcePx: point(1000, 0) },
        ],
        rmsErrorPx: 0,
      },
    ],
    vertices: [
      { id: `${input.floorId}-v0`, xMm: 0, zMm: 0, provenance: provenance(baseEvidence) },
      { id: `${input.floorId}-v1`, xMm: 1000, zMm: 0, provenance: provenance(baseEvidence) },
    ],
    walls: [
      {
        id: `${input.floorId}-wall`,
        path: {
          kind: "line",
          startVertexId: `${input.floorId}-v0`,
          endVertexId: `${input.floorId}-v1`,
        },
        thicknessMm: 100,
        classification: "interior",
        adjacentRoomIds: [],
        provenance: provenance(
          evidence({
            sourceId: input.sourceId,
            pageNumber: input.pageNumber,
            calibrationId: input.calibrationId,
            anchors: [
              { role: "start", sourcePx: point(0, 0) },
              { role: "end", sourcePx: point(1000, 0) },
            ],
          })
        ),
      },
    ],
    rooms: [],
    openings: [
      {
        id: `${input.floorId}-opening`,
        wallId: `${input.floorId}-wall`,
        kind: "door",
        operation: "swing",
        offsetMm: 200,
        widthMm: 400,
        hinge: "start",
        handing: "left",
        provenance: provenance(
          evidence({
            sourceId: input.sourceId,
            pageNumber: input.pageNumber,
            calibrationId: input.calibrationId,
            anchors: [
              { role: "start", sourcePx: point(200, 0) },
              { role: "end", sourcePx: point(600, 0) },
            ],
          })
        ),
      },
    ],
    structures: [],
    annotations: [],
    dimensions: [],
  };
}

const multiPageDocument: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "multiple-pages",
  revisionId: "multiple-pages-r1",
  createdAt: reviewedAt,
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [
    { id: "source-a", kind: "pdf", name: "a.pdf", mimeType: "application/pdf" },
    { id: "source-b", kind: "pdf", name: "b.pdf", mimeType: "application/pdf" },
  ],
  floors: [
    lineFloor({
      floorId: "floor-a",
      sourceId: "source-a",
      pageNumber: 1,
      calibrationId: "calibration-a",
      scale: 0.1,
      translateX: 10,
      translateY: 20,
    }),
    lineFloor({
      floorId: "floor-b",
      sourceId: "source-b",
      pageNumber: 2,
      calibrationId: "calibration-b",
      scale: 0.2,
      translateX: 300,
      translateY: 400,
    }),
  ],
};

const multiPageResult = evaluateFloorPlanSourceOverlayResiduals({
  document: multiPageDocument,
});
assert.equal(multiPageResult.passed, true);
assert.equal(multiPageResult.residuals.length, 8);
assert.equal(multiPageResult.calibrations.length, 2);
assert.deepEqual(
  [...new Set(multiPageResult.residuals.map((item) => item.pageNumber))],
  [1, 2]
);

const exactBoundary = structuredClone(multiPageDocument);
exactBoundary.floors[0].openings[0].provenance.evidence[0].sourceAnchors![1].sourcePx.x += 1;
assert.equal(
  evaluateFloorPlanSourceOverlayResiduals({ document: exactBoundary }).passed,
  true,
  "A residual of exactly one registered source pixel must pass."
);

const overBoundary = structuredClone(multiPageDocument);
overBoundary.floors[0].openings[0].provenance.evidence[0].sourceAnchors![1].sourcePx.x += 1.01;
const overBoundaryResult = evaluateFloorPlanSourceOverlayResiduals({ document: overBoundary });
assert.equal(overBoundaryResult.passed, false);
assert(
  overBoundaryResult.issues.some(
    (issue) => issue.code === "SOURCE_OVERLAY_RESIDUAL_EXCEEDED"
  )
);

const missingAnchor = structuredClone(multiPageDocument);
missingAnchor.floors[1].walls[0].provenance.evidence[0].sourceAnchors = [
  missingAnchor.floors[1].walls[0].provenance.evidence[0].sourceAnchors![0],
];
const missingAnchorResult = evaluateFloorPlanSourceOverlayResiduals({
  document: missingAnchor,
});
assert.equal(missingAnchorResult.passed, false);
assert(
  missingAnchorResult.issues.some(
    (issue) =>
      issue.code === "MISSING_SOURCE_ANCHOR" &&
      issue.entityId === "floor-b-wall" &&
      issue.role === "end"
  )
);

const wrongCalibration = structuredClone(multiPageDocument);
wrongCalibration.floors[1].openings[0].provenance.evidence[0].calibrationId = "calibration-a";
assert(
  evaluateFloorPlanSourceOverlayResiduals({ document: wrongCalibration }).issues.some(
    (issue) => issue.code === "UNKNOWN_ANCHOR_CALIBRATION"
  )
);

function makeArcDocument(): FloorPlanDocumentV2 {
  const sourceId = "arc-source";
  const calibrationId = "arc-calibration";
  const sourcePoint = (xMm: number, zMm: number) => ({
    x: 10 + xMm * 0.1,
    y: 20 + zMm * 0.1,
  });
  const baseEvidence = evidence({ sourceId, pageNumber: 1, calibrationId });
  const radius = 1000;
  const sweep = Math.PI / 2;
  const openingOffsetMm = 100;
  const openingWidthMm = 400;
  const pointAtDistance = (distanceMm: number) => {
    const angle = distanceMm / radius;
    return sourcePoint(Math.cos(angle) * radius, Math.sin(angle) * radius);
  };
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "source_documented" as const,
    provenance: provenance(baseEvidence),
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "arc-document",
    revisionId: "arc-document-r1",
    createdAt: reviewedAt,
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{ id: sourceId, kind: "pdf", name: "arc.pdf", mimeType: "application/pdf" }],
    floors: [
      {
        id: "arc-floor",
        name: "Arc floor",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: 3000,
        slabThicknessMm: 150,
        defaults: {
          wallHeight: measured(2700),
          doorHeight: measured(2100),
          windowHeight: measured(1200),
          windowSillHeight: measured(900),
        },
        calibrations: [
          {
            id: calibrationId,
            sourceId,
            pageNumber: 1,
            imageWidthPx: 1000,
            imageHeightPx: 1000,
            controlPoints: [
              { planMm: { xMm: 0, zMm: 0 }, sourcePx: sourcePoint(0, 0) },
              { planMm: { xMm: 1000, zMm: 0 }, sourcePx: sourcePoint(1000, 0) },
              { planMm: { xMm: 0, zMm: 1000 }, sourcePx: sourcePoint(0, 1000) },
            ],
            rmsErrorPx: 0,
          },
        ],
        vertices: [
          { id: "arc-start", xMm: 1000, zMm: 0, provenance: provenance(baseEvidence) },
          { id: "arc-end", xMm: 0, zMm: 1000, provenance: provenance(baseEvidence) },
          { id: "arc-center", xMm: 0, zMm: 0, provenance: provenance(baseEvidence) },
        ],
        walls: [
          {
            id: "arc-wall",
            path: {
              kind: "arc",
              startVertexId: "arc-start",
              endVertexId: "arc-end",
              centerVertexId: "arc-center",
              clockwise: false,
            },
            thicknessMm: 100,
            classification: "exterior",
            adjacentRoomIds: [],
            provenance: provenance(
              evidence({
                sourceId,
                pageNumber: 1,
                calibrationId,
                anchors: [
                  { role: "start", sourcePx: sourcePoint(1000, 0) },
                  {
                    role: "midpoint",
                    sourcePx: sourcePoint(Math.cos(sweep / 2) * radius, Math.sin(sweep / 2) * radius),
                  },
                  { role: "end", sourcePx: sourcePoint(0, 1000) },
                ],
              })
            ),
          },
        ],
        rooms: [],
        openings: [
          {
            id: "arc-opening",
            wallId: "arc-wall",
            kind: "open_passage",
            operation: "open",
            offsetMm: openingOffsetMm,
            widthMm: openingWidthMm,
            hinge: "none",
            handing: "none",
            provenance: provenance(
              evidence({
                sourceId,
                pageNumber: 1,
                calibrationId,
                anchors: [
                  { role: "start", sourcePx: pointAtDistance(openingOffsetMm) },
                  { role: "end", sourcePx: pointAtDistance(openingOffsetMm + openingWidthMm) },
                ],
              })
            ),
          },
        ],
        structures: [],
        annotations: [],
        dimensions: [],
      },
    ],
  };
}

const arcDocument = makeArcDocument();
const arcResult = evaluateFloorPlanSourceOverlayResiduals({ document: arcDocument });
assert.equal(arcResult.passed, true);
assert.equal(arcResult.residuals.length, 5);
assert(arcResult.maximumResidualPx !== null && arcResult.maximumResidualPx < 1e-8);

const arcWithoutMidpoint = structuredClone(arcDocument);
arcWithoutMidpoint.floors[0].walls[0].provenance.evidence[0].sourceAnchors =
  arcWithoutMidpoint.floors[0].walls[0].provenance.evidence[0].sourceAnchors!.filter(
    (anchor) => anchor.role !== "midpoint"
  );
assert(
  evaluateFloorPlanSourceOverlayResiduals({ document: arcWithoutMidpoint }).issues.some(
    (issue) => issue.code === "MISSING_SOURCE_ANCHOR" && issue.role === "midpoint"
  )
);

function makePublishableDocument(): FloorPlanDocumentV2 {
  const sourceId = "source-asset-1";
  const calibrationId = "publish-calibration";
  const sourcePoint = (xMm: number, zMm: number) => ({ x: 50 + xMm * 0.1, y: 50 + zMm * 0.1 });
  const baseEvidence = evidence({ sourceId, pageNumber: 1, calibrationId });
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "source_documented" as const,
    provenance: provenance(baseEvidence),
  });
  const vertex = (id: string, xMm: number, zMm: number) => ({
    id,
    xMm,
    zMm,
    provenance: provenance(baseEvidence),
  });
  const wall = (id: string, startVertexId: string, endVertexId: string, start: [number, number], end: [number, number]) => ({
    id,
    path: { kind: "line" as const, startVertexId, endVertexId },
    thicknessMm: 200,
    classification: "exterior" as const,
    adjacentRoomIds: ["room-1"],
    provenance: provenance(
      evidence({
        sourceId,
        pageNumber: 1,
        calibrationId,
        anchors: [
          { role: "start", sourcePx: sourcePoint(...start) },
          { role: "end", sourcePx: sourcePoint(...end) },
        ],
      })
    ),
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "publishable",
    revisionId: "publishable-r1",
    createdAt: reviewedAt,
    verification: {
      tier: "source_verified",
      criticalIssueIds: [],
      approvedBy: approval.reviewerId,
      approvedAt: reviewedAt,
    },
    sources: [
      {
        id: sourceId,
        kind: "pdf",
        name: "publishable.pdf",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        pageCount: 1,
      },
    ],
    floors: [
      {
        id: "publish-floor",
        name: "Publish floor",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: 3000,
        slabThicknessMm: 150,
        defaults: {
          wallHeight: measured(2700),
          doorHeight: measured(2100),
          windowHeight: measured(1200),
          windowSillHeight: measured(900),
        },
        calibrations: [
          {
            id: calibrationId,
            sourceId,
            pageNumber: 1,
            imageWidthPx: 1000,
            imageHeightPx: 1000,
            controlPoints: [
              { planMm: { xMm: 0, zMm: 0 }, sourcePx: sourcePoint(0, 0) },
              { planMm: { xMm: 4000, zMm: 0 }, sourcePx: sourcePoint(4000, 0) },
              { planMm: { xMm: 0, zMm: 3000 }, sourcePx: sourcePoint(0, 3000) },
            ],
            rmsErrorPx: 0,
          },
        ],
        vertices: [
          vertex("v0", 0, 0),
          vertex("v1", 4000, 0),
          vertex("v2", 4000, 3000),
          vertex("v3", 0, 3000),
        ],
        walls: [
          wall("w0", "v0", "v1", [0, 0], [4000, 0]),
          wall("w1", "v1", "v2", [4000, 0], [4000, 3000]),
          wall("w2", "v2", "v3", [4000, 3000], [0, 3000]),
          wall("w3", "v3", "v0", [0, 3000], [0, 0]),
        ],
        rooms: [
          {
            id: "room-1",
            name: "Living Room",
            roomType: "living",
            wallLoops: [
              {
                kind: "outer",
                walls: ["w0", "w1", "w2", "w3"].map((wallId) => ({
                  wallId,
                  direction: "forward" as const,
                })),
              },
            ],
            provenance: provenance(baseEvidence),
          },
        ],
        openings: [
          {
            id: "opening-1",
            wallId: "w0",
            kind: "door",
            operation: "swing",
            offsetMm: 1000,
            widthMm: 900,
            heightMm: 2100,
            hinge: "start",
            handing: "left",
            provenance: provenance(
              evidence({
                sourceId,
                pageNumber: 1,
                calibrationId,
                anchors: [
                  { role: "start", sourcePx: sourcePoint(1000, 0) },
                  { role: "end", sourcePx: sourcePoint(1900, 0) },
                ],
              })
            ),
          },
        ],
        structures: [],
        annotations: [],
        dimensions: [
          {
            id: "dimension-1",
            fromVertexId: "v0",
            toVertexId: "v1",
            axis: "horizontal",
            measuredMm: 4000,
            provenance: provenance(baseEvidence),
          },
        ],
      },
    ],
  };
}

const publishable = makePublishableDocument();
function independentlyObservedAnchors(
  entity: { provenance: FloorPlanEntityProvenanceV2 }
) {
  const anchors = entity.provenance.evidence
    .find((entry) => entry.sourceId === "source-asset-1")
    ?.sourceAnchors;
  assert.ok(anchors);
  return anchors.map((anchor) => ({
    role: anchor.role,
    xPx: anchor.sourcePx.x,
    yPx: anchor.sourcePx.y,
  }));
}
const observationManifest: FloorPlanSourceObservationManifest = {
  schemaVersion: 1,
  source: {
    assetId: "source-asset-1",
    sha256: "a".repeat(64),
    mimeType: "application/pdf",
  },
  candidateVersion: 1,
  recordedByReviewerId: approval.reviewerId,
  recordedAt: "2030-01-01T00:00:00.000Z",
  rightsEvidence: {
    status: "permission_confirmed",
    basis: "Written permission permits publication of derived floor-plan geometry.",
    evidenceReference: "permission-record-1",
    permitsDerivedFloorPlanPublication: true,
    sourceAssetRedistributionAllowed: false,
    expiresAt: null,
  },
  reviewerNotes: "Reviewed against every direct source anchor.",
  observations: publishable.floors.flatMap((floor) => [
    ...floor.walls.map((entity) => ({
      id: `observation-${entity.id}`, kind: "wall" as const, floorId: floor.id,
      canonicalEntityId: entity.id, pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
      anchorsPx: independentlyObservedAnchors(entity),
    })),
    ...floor.openings.map((entity) => ({
      id: `observation-${entity.id}`, kind: "opening" as const, floorId: floor.id,
      canonicalEntityId: entity.id, pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
      anchorsPx: independentlyObservedAnchors(entity),
    })),
    ...floor.structures.map((entity) => ({
      id: `observation-${entity.id}`, kind: "structure" as const, floorId: floor.id,
      canonicalEntityId: entity.id, pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
      anchorsPx: [{ role: "center" as const, xPx: 150, yPx: 150 }],
    })),
    ...floor.rooms.map((entity) => ({
      id: `observation-${entity.id}`, kind: "label" as const, floorId: floor.id,
      canonicalEntityId: entity.id, pageNumber: 1, observedText: entity.name,
      cropPx: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
      anchorsPx: [{ role: "label" as const, xPx: 150, yPx: 150 }],
    })),
    ...floor.dimensions.map((entity) => ({
      id: `observation-${entity.id}`, kind: "dimension" as const, floorId: floor.id,
      canonicalEntityId: entity.id, pageNumber: 1, observedText: `${entity.measuredMm}`,
      measuredMm: entity.measuredMm,
      cropPx: { xPx: 0, yPx: 0, widthPx: 1000, heightPx: 1000 },
      anchorsPx: [{ role: "start" as const, xPx: 100, yPx: 100 }, { role: "end" as const, xPx: 200, yPx: 100 }],
    })),
  ]),
};
const publicationInput = {
  observationManifest,
  sourceAssetId: "source-asset-1",
  sourceSha256: "a".repeat(64),
  sourceMimeType: "application/pdf",
  renderedPages: [{ pageNumber: 1, widthPx: 1000, heightPx: 1000, assetKey: "page-1" }],
};
const publication = computeFloorPlanPublicationChecks({
  document: publishable,
  ...publicationInput,
});
assert.equal(publication.checks.overlayRegistered, true);
assert.equal(publication.checks.sourceOverlayAnchorsWithinOnePixel, true);
assertFloorPlanPublicationChecks(publication.checks);

const provenanceManifestMismatch = structuredClone(observationManifest);
provenanceManifestMismatch.observations.find((entry) => entry.kind === "wall")!
  .anchorsPx[0].xPx += 0.5;
const mismatchedPublication = computeFloorPlanPublicationChecks({
  document: publishable,
  ...publicationInput,
  observationManifest: provenanceManifestMismatch,
});
const independentlyMeasuredResidual = mismatchedPublication.sourceOverlayVerification.residuals
  .find((entry) => entry.entityId === "w0" && entry.role === "start");
assert.equal(
  independentlyMeasuredResidual?.observedSourcePx.xPx,
  provenanceManifestMismatch.observations.find((entry) => entry.canonicalEntityId === "w0")
    ?.anchorsPx.find((anchor) => anchor.role === "start")?.xPx,
  "Publication residuals must use the immutable observation manifest, not candidate provenance"
);
assert.equal(
  mismatchedPublication.checks.sourceOverlayAnchorsWithinOnePixel,
  true,
  "A sub-pixel observation remains geometrically within tolerance"
);
assert.equal(
  mismatchedPublication.checks.sourceObservationsComplete,
  false,
  "Exact independent-observation/provenance disagreement must still block publication"
);
assert.throws(
  () => assertFloorPlanPublicationChecks(mismatchedPublication.checks),
  /sourceObservationsComplete/
);

const publishableWithoutAnchor = structuredClone(publishable);
publishableWithoutAnchor.floors[0].walls[0].provenance.evidence[0].sourceAnchors = undefined;
const blockedPublication = computeFloorPlanPublicationChecks({
  document: publishableWithoutAnchor,
  ...publicationInput,
});
assert.equal(blockedPublication.checks.overlayRegistered, true);
assert.equal(blockedPublication.checks.sourceOverlayAnchorsWithinOnePixel, true);
assert.equal(blockedPublication.checks.sourceObservationsComplete, false);
assert.throws(
  () => assertFloorPlanPublicationChecks(blockedPublication.checks),
  /sourceObservationsComplete/
);

const dishonestCalibration = structuredClone(publishable);
dishonestCalibration.floors[0].calibrations[0].controlPoints.push({
  planMm: { xMm: 4000, zMm: 3000 },
  sourcePx: { x: 475, y: 375 },
});
dishonestCalibration.floors[0].calibrations[0].rmsErrorPx = 0;
const dishonestResult = computeFloorPlanPublicationChecks({
  document: dishonestCalibration,
  ...publicationInput,
});
assert.equal(dishonestResult.checks.overlayRegistered, false);
assert(
  dishonestResult.sourceOverlayVerification.issues.some(
    (issue) => issue.code === "SOURCE_CALIBRATION_RESIDUAL_EXCEEDED"
  ),
  "The server must compute calibration residuals instead of trusting a declared zero RMS."
);

console.log("floor-plan source-overlay residual gates: ok");
