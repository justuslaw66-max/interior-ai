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
  planFloorPlanHorizontalCalibrationV2,
} from "@/lib/floor-plan-import-review-geometry";
import { applyFloorPlanHorizontalCalibrationV2 } from "@/lib/floor-plan-import-review-calibration";
import { createFloorPlanOpeningOverrideAuthorizationV2 } from "@/lib/floor-plan-opening-override-factory";
import { planFloorPlanOpeningKindCorrection } from "@/lib/floor-plan-opening-kind-correction";
import {
  planFloorPlanOpeningCorrectionUpdate,
  type OpeningCorrectionValues,
  type OpeningEvidence,
} from "@/components/editor/floor-plan-import-review/useFloorPlanOpeningCorrection";
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

function calibrationPreflight(document: typeof source, factor: number) {
  return planFloorPlanHorizontalCalibrationV2({
    document,
    floorId: document.floors[0].id,
    anchor: { xMm: 0, zMm: 0 },
    factor,
    actorId: "calibration-reviewer",
  });
}

function assertRejectedCalibration(document: typeof source, factor: number) {
  const before = structuredClone(document);
  const history: unknown[] = [];
  const preflight = calibrationPreflight(document, factor);
  assert.notEqual(preflight.status, "ready");
  assert.throws(() => {
    const command = applyFloorPlanHorizontalCalibrationV2({
      document,
      floorId: document.floors[0].id,
      anchor: { xMm: 0, zMm: 0 },
      factor,
      actorId: "calibration-reviewer",
      mutatedAt: "2026-09-01T13:59:00.000Z",
    });
    history.push(command);
  });
  assert.deepEqual(document, before, "Rejected calibration must not mutate its source document.");
  assert.equal(history.length, 0, "Rejected calibration must not create a history entry.");
  return preflight;
}

const microscopic = assertRejectedCalibration(source, 0.000001);
assert.equal(microscopic.status, "invalid");
assert.equal(microscopic.proposedDocumentValidation.boundary, "compileFloorPlanDocumentV2");
assert.equal(microscopic.proposedDocumentValidation.status, "invalid");
assert.equal(source.floors[0].openings.length, 9, "The reviewed microscopic-scale fixture has nine openings.");
assert.equal(source.floors[0].walls.length, 24, "The reviewed microscopic-scale fixture has 24 walls.");
assert.equal(microscopic.diagnostics.filter((entry) =>
  entry.code === "NON_POSITIVE_MEASUREMENT" && entry.path.includes(".openings[") &&
  entry.path.endsWith(".widthMm") &&
  entry.normalizedValue === 0).length, 9);
assert.equal(microscopic.diagnostics.filter((entry) =>
  entry.code === "NON_POSITIVE_MEASUREMENT" && entry.path.includes(".walls[") &&
  entry.path.endsWith(".thicknessMm") &&
  entry.normalizedValue === 0).length, 24);
assert.ok(microscopic.diagnostics.some((entry) =>
  entry.code === "NON_POSITIVE_MEASUREMENT" && entry.path.endsWith(".thicknessMm") &&
  entry.normalizedValue === 0 && typeof entry.rawProposedValue === "number"));
assert.ok(microscopic.diagnostics.some((entry) =>
  entry.code === "NON_POSITIVE_MEASUREMENT" && entry.path.endsWith(".widthMm") &&
  entry.normalizedValue === 0 && entry.affectedEntityIds.length > 0));
for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const rejected = assertRejectedCalibration(source, factor);
  assert.equal(rejected.status, "invalid");
  assert.equal(rejected.diagnostics[0]?.code, "INVALID_SCALE_FACTOR");
}
const smallValidSource = structuredClone(source);
for (const entry of smallValidSource.floors[0].openings) entry.widthEvidence = "assumed";
const smallValidFactor = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5]
  .find((factor) => calibrationPreflight(smallValidSource, factor).status === "ready");
assert.ok(smallValidFactor && smallValidFactor < 1, "The fixture must retain one small valid scale.");
const smallValid = applyFloorPlanHorizontalCalibrationV2({
  document: smallValidSource, floorId: floor.id, anchor: { xMm: 0, zMm: 0 },
  factor: smallValidFactor, actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T13:59:01.000Z",
}).document;
compileFloorPlanDocumentV2(smallValid);
const zeroThickness = assertRejectedCalibration(source, 0.001);
assert.ok(zeroThickness.diagnostics.some((entry) =>
  entry.path.endsWith(".thicknessMm") && entry.normalizedValue === 0));
const zeroOpeningWidth = assertRejectedCalibration(source, 0.0001);
assert.ok(zeroOpeningWidth.diagnostics.some((entry) =>
  entry.path.endsWith(".widthMm") && entry.normalizedValue === 0));

const stalePlan = calibrationPreflight(source, 2);
assert.equal(stalePlan.status, "ready");
const staleSource = structuredClone(source);
staleSource.floors[0].annotations[0].text = "Source changed after calibration preflight";
const staleSourceBefore = structuredClone(staleSource);
assert.throws(() => applyFloorPlanHorizontalCalibrationV2({
  document: staleSource, floorId: staleSource.floors[0].id,
  anchor: { xMm: 0, zMm: 0 }, factor: 2, actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T13:59:02.000Z", validatedPreflightPlan: stalePlan,
}), /stale/);
assert.deepEqual(staleSource, staleSourceBefore);

const protectedCalibration = structuredClone(original);
const protectedFloor = protectedCalibration.floors[0];
const protectedWidth = protectedFloor.openings.find((entry) => entry.id === originalOpening.id)!;
protectedWidth.widthEvidence = "source_documented";
protectedWidth.offsetMm = 0;
protectedWidth.widthMm = Math.floor(hostLength * 0.55);
protectedFloor.openings = protectedFloor.openings.filter(
  (entry) => entry.wallId !== protectedWidth.wallId || entry.id === protectedWidth.id
);
const secondOpening = protectedFloor.openings.find(
  (entry) => entry.id !== protectedWidth.id && entry.wallId !== protectedWidth.wallId
);
assert.ok(secondOpening, "The mixed calibration fixture requires an unprotected opening.");
for (const entry of protectedFloor.openings) {
  if (entry.id !== protectedWidth.id) entry.widthEvidence = "assumed";
}
const protectedPreflight = planFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: 2,
  actorId: "calibration-reviewer",
});
assert.equal(protectedPreflight.status, "ready");
assert.equal(
  protectedPreflight.protectedFields.find((entry) => entry.openingId === protectedWidth.id)?.disposition,
  "preserved"
);
const protectedApplied = applyFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: 2,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:00:00.000Z",
}).document;
assert.equal(
  protectedApplied.floors[0].openings.find((entry) => entry.id === protectedWidth.id)?.widthMm,
  protectedWidth.widthMm,
  "A source-documented real-world width remains authoritative during traced-geometry scaling."
);
assert.equal(
  protectedApplied.floors[0].openings.find((entry) => entry.id === protectedWidth.id)?.widthEvidence,
  "source_documented"
);
assert.equal(
  protectedApplied.floors[0].openings.find((entry) => entry.id === secondOpening.id)?.widthMm,
  secondOpening.widthMm * 2,
  "Unprotected traced width rescales on the same mixed floor."
);

const siteProtected = structuredClone(protectedCalibration);
siteProtected.floors[0].openings.find((entry) => entry.id === protectedWidth.id)!.widthEvidence = "site_measured";
const siteApplied = applyFloorPlanHorizontalCalibrationV2({
  document: siteProtected,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: 2,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:01:00.000Z",
}).document;
assert.equal(
  siteApplied.floors[0].openings.find((entry) => entry.id === protectedWidth.id)?.widthMm,
  protectedWidth.widthMm
);
assert.equal(
  siteApplied.floors[0].openings.find((entry) => entry.id === protectedWidth.id)?.widthEvidence,
  "site_measured"
);

const arcConstraintDocument = structuredClone(protectedCalibration);
const arcFloor = arcConstraintDocument.floors[0];
const arcOpening = arcFloor.openings.find((entry) => entry.id === protectedWidth.id)!;
arcFloor.openings = arcFloor.openings.filter(
  (entry) => entry.wallId !== arcOpening.wallId || entry.id === arcOpening.id
);
const arcWall = arcFloor.walls.find((entry) => entry.id === arcOpening.wallId)!;
assert.equal(arcWall.path.kind, "line");
if (arcWall.path.kind !== "line") throw new Error("Arc constraint fixture requires a line wall.");
const arcVertices = new Map(arcFloor.vertices.map((entry) => [entry.id, entry]));
const arcStart = arcVertices.get(arcWall.path.startVertexId)!;
const arcEnd = arcVertices.get(arcWall.path.endVertexId)!;
const arcDx = arcEnd.xMm - arcStart.xMm;
const arcDz = arcEnd.zMm - arcStart.zMm;
arcFloor.vertices.push({
  id: "calibration-arc-center",
  xMm: Math.round((arcStart.xMm + arcEnd.xMm - arcDz) / 2),
  zMm: Math.round((arcStart.zMm + arcEnd.zMm + arcDx) / 2),
  provenance: structuredClone(arcStart.provenance),
});
arcWall.path = {
  kind: "arc",
  startVertexId: arcWall.path.startVertexId,
  endVertexId: arcWall.path.endVertexId,
  centerVertexId: "calibration-arc-center",
  clockwise: false,
};
compileFloorPlanDocumentV2(arcConstraintDocument);
const arcBefore = structuredClone(arcConstraintDocument);
const arcConstraint = calibrationPreflight(arcConstraintDocument, 0.1);
assert.equal(arcConstraint.status, "invalid");
assert.ok(arcConstraint.diagnostics.some((entry) =>
  entry.code === "OPENING_OUT_OF_BOUNDS" && entry.affectedEntityIds.includes(arcOpening.id)));
assert.throws(() => applyFloorPlanHorizontalCalibrationV2({
  document: arcConstraintDocument, floorId: arcFloor.id,
  anchor: { xMm: 0, zMm: 0 }, factor: 0.1,
  actorId: "calibration-reviewer", mutatedAt: "2026-09-01T14:01:30.000Z",
}));
assert.deepEqual(arcConstraintDocument, arcBefore);

const overlapDocument = structuredClone(protectedCalibration);
const overlapFloor = overlapDocument.floors[0];
const firstOverlap = overlapFloor.openings.find((entry) => entry.id === protectedWidth.id)!;
overlapFloor.openings = overlapFloor.openings.filter(
  (entry) => entry.wallId !== firstOverlap.wallId || entry.id === firstOverlap.id
);
firstOverlap.offsetMm = 0;
firstOverlap.widthMm = Math.floor(hostLength * 0.3);
firstOverlap.widthEvidence = "source_documented";
overlapFloor.openings.push({
  ...structuredClone(firstOverlap),
  id: "calibration-overlap-second",
  offsetMm: firstOverlap.widthMm + 500,
});
compileFloorPlanDocumentV2(overlapDocument);
const overlapBefore = structuredClone(overlapDocument);
const overlapPreflight = calibrationPreflight(overlapDocument, 0.5);
assert.equal(overlapPreflight.status, "invalid");
assert.ok(overlapPreflight.diagnostics.some((entry) => entry.code === "OVERLAPPING_OPENINGS"));
assert.throws(() => applyFloorPlanHorizontalCalibrationV2({
  document: overlapDocument, floorId: overlapFloor.id,
  anchor: { xMm: 0, zMm: 0 }, factor: 0.5,
  actorId: "calibration-reviewer", mutatedAt: "2026-09-01T14:01:31.000Z",
}));
assert.deepEqual(overlapDocument, overlapBefore);

const clampFactor = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
  .find((factor) => planFloorPlanHorizontalCalibrationV2({
    document: protectedCalibration,
    floorId: protectedFloor.id,
    anchor: { xMm: 0, zMm: 0 },
    factor,
    actorId: "calibration-reviewer",
  }).status === "requires_override");
assert.ok(clampFactor, "The protected fixture requires one schema-valid clamp scale.");
const clampPreflight = planFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: clampFactor,
  actorId: "calibration-reviewer",
});
assert.equal(clampPreflight.status, "requires_override");
const protectedClamp = clampPreflight.protectedFields.find(
  (entry) => entry.openingId === protectedWidth.id
)!;
assert.ok(protectedClamp.proposedRawValueMm < protectedClamp.currentRawValueMm);
assert.ok(clampPreflight.clamps.some(
  (entry) => entry.entityId === protectedWidth.id && entry.field === "widthMm"
));
const beforeRejectedCalibration = JSON.stringify(protectedCalibration);
assert.throws(() => applyFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: clampFactor,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:02:00.000Z",
}));
assert.equal(JSON.stringify(protectedCalibration), beforeRejectedCalibration);

const calibrationAuthorization = createFloorPlanOpeningOverrideAuthorizationV2({
  opening: protectedWidth,
  changes: { widthMm: protectedClamp.proposedRawValueMm },
  mutationPurpose: "scale_calibration",
  actorId: "calibration-reviewer",
  reason: "Pro reviewer accepted the required protected-width clamp.",
  auditNote: "Scale calibration shortened the host below the documented opening width.",
});
const approvedPreflight = planFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: clampFactor,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:03:00.000Z",
  overrideAuthorizations: [calibrationAuthorization],
});
assert.equal(approvedPreflight.status, "ready");
assert.equal(approvedPreflight.proposedDocumentValidation.status, "valid");
const approvedCalibrationCommand = applyFloorPlanHorizontalCalibrationV2({
  document: protectedCalibration,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: clampFactor,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:03:00.000Z",
  overrideAuthorizations: [calibrationAuthorization],
  validatedPreflightPlan: approvedPreflight,
});
const approvedCalibrationHistory = [approvedCalibrationCommand];
assert.equal(approvedCalibrationHistory.length, 1,
  "An approved calibration is represented by one atomic undoable command.");
const approvedCalibration = approvedCalibrationCommand.document;
const approvedProtectedWidth = approvedCalibration.floors[0].openings.find(
  (entry) => entry.id === protectedWidth.id
)!;
assert.equal(approvedProtectedWidth.widthMm, protectedClamp.proposedRawValueMm);
assert.equal(approvedProtectedWidth.widthEvidence, "user_confirmed");
assert.equal(approvedProtectedWidth.provenance.reviewHistory.at(-1)?.action, "approved");
assert.deepEqual(
  approvedCalibrationCommand.undoDocument,
  protectedCalibration,
  "Undo restores the complete pre-calibration geometry, evidence, and audit state."
);
const redoneCalibration = applyFloorPlanHorizontalCalibrationV2({
  document: approvedCalibrationCommand.undoDocument,
  floorId: protectedFloor.id,
  anchor: { xMm: 0, zMm: 0 },
  factor: clampFactor,
  actorId: "calibration-reviewer",
  mutatedAt: "2026-09-01T14:03:00.000Z",
  overrideAuthorizations: [calibrationAuthorization],
}).document;
assert.deepEqual(
  redoneCalibration,
  approvedCalibration,
  "Redo reproduces the complete approved calibration atomically."
);
assert.equal(
  JSON.parse(JSON.stringify(approvedCalibration)).floors[0].openings.find(
    (entry: { id: string }) => entry.id === protectedWidth.id
  ).widthEvidence,
  "user_confirmed"
);
compileFloorPlanDocumentV2(approvedCalibration);

function correctionValues(openingValue: typeof protectedWidth): OpeningCorrectionValues {
  return {
    openingOffset: openingValue.offsetMm,
    openingWidth: openingValue.widthMm,
    openingKind: openingValue.kind,
    openingOperation: openingValue.operation,
    heightMm: openingValue.heightMm ?? "",
    sillHeightMm: openingValue.sillHeightMm ?? "",
    hinge: openingValue.hinge,
    handing: openingValue.handing,
  };
}

function correctionEvidence(openingValue: typeof protectedWidth): OpeningEvidence {
  return {
    width: openingValue.widthEvidence ?? "assumed",
    height: openingValue.heightEvidence ?? "assumed",
    sill: openingValue.sillHeightEvidence ?? "assumed",
  };
}

const allProtectedOpening = structuredClone(protectedWidth);
allProtectedOpening.widthEvidence = "source_documented";
allProtectedOpening.heightEvidence = "source_documented";
allProtectedOpening.sillHeightEvidence = "site_measured";
const unchangedValues = correctionValues(allProtectedOpening);
const unchangedKind = planFloorPlanOpeningKindCorrection(
  allProtectedOpening, unchangedValues.openingKind
);
let overrideFactoryCalls = 0;
const unexpectedFactory = () => {
  overrideFactoryCalls += 1;
  throw new Error("Override factory must not be called.");
};
const unlockedNoop = planFloorPlanOpeningCorrectionUpdate({
  values: unchangedValues, opening: allProtectedOpening,
  evidence: correctionEvidence(allProtectedOpening),
  measurementOverrides: new Set(["width"]), kindCorrection: unchangedKind,
  kindOverrideApproved: false, authorizationFactory: unexpectedFactory,
});
assert.equal(unlockedNoop.status, "noop");
assert.equal(overrideFactoryCalls, 0);
const offsetOnly = planFloorPlanOpeningCorrectionUpdate({
  values: { ...unchangedValues, openingOffset: unchangedValues.openingOffset + 10 },
  opening: allProtectedOpening, evidence: correctionEvidence(allProtectedOpening),
  measurementOverrides: new Set(["width"]), kindCorrection: unchangedKind,
  kindOverrideApproved: false, authorizationFactory: unexpectedFactory,
});
assert.equal(offsetOnly.status, "ready");
assert.deepEqual(offsetOnly.requiredOverrideFields, []);
assert.equal(offsetOnly.reviewedEvidenceOverride, undefined);
assert.equal(overrideFactoryCalls, 0);
const operationOpening = structuredClone(allProtectedOpening);
operationOpening.kind = "door";
operationOpening.operation = "swing";
const operationValues = correctionValues(operationOpening);
const operationOnly = planFloorPlanOpeningCorrectionUpdate({
  values: { ...operationValues, openingOperation: "sliding" },
  opening: operationOpening, evidence: correctionEvidence(operationOpening),
  measurementOverrides: new Set(["width"]),
  kindCorrection: planFloorPlanOpeningKindCorrection(operationOpening, operationOpening.kind),
  kindOverrideApproved: false, authorizationFactory: unexpectedFactory,
});
assert.equal(operationOnly.status, "ready");
assert.deepEqual(operationOnly.requiredOverrideFields, []);
const unprotectedOpening = structuredClone(allProtectedOpening);
unprotectedOpening.widthEvidence = "assumed";
const unprotectedValues = correctionValues(unprotectedOpening);
const unprotectedDimension = planFloorPlanOpeningCorrectionUpdate({
  values: { ...unprotectedValues, openingWidth: unprotectedValues.openingWidth + 10 },
  opening: unprotectedOpening, evidence: correctionEvidence(unprotectedOpening),
  measurementOverrides: new Set(),
  kindCorrection: planFloorPlanOpeningKindCorrection(unprotectedOpening, unprotectedOpening.kind),
  kindOverrideApproved: false, authorizationFactory: unexpectedFactory,
});
assert.equal(unprotectedDimension.status, "ready");
assert.deepEqual(unprotectedDimension.requiredOverrideFields, []);

function protectedCorrection(fields: Array<"width" | "height" | "sill">) {
  const values = correctionValues(allProtectedOpening);
  if (fields.includes("width")) values.openingWidth += 10;
  if (fields.includes("height")) values.heightMm = (allProtectedOpening.heightMm ?? 1200) + 10;
  if (fields.includes("sill")) values.sillHeightMm = (allProtectedOpening.sillHeightMm ?? 900) + 10;
  return planFloorPlanOpeningCorrectionUpdate({
    values, opening: allProtectedOpening, evidence: correctionEvidence(allProtectedOpening),
    measurementOverrides: new Set(fields), kindCorrection: unchangedKind,
    kindOverrideApproved: false,
  });
}
for (const field of ["width", "height", "sill"] as const) {
  const plan = protectedCorrection([field]);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.requiredOverrideFields, [field]);
  assert.deepEqual(plan.reviewedEvidenceOverride?.fields.map((entry) => entry.field), [field]);
}
const multiProtected = protectedCorrection(["width", "sill"]);
assert.deepEqual(multiProtected.requiredOverrideFields, ["width", "sill"]);
assert.deepEqual(multiProtected.reviewedEvidenceOverride?.fields.map((entry) => entry.field),
  ["width", "sill"]);
const blockedProtected = planFloorPlanOpeningCorrectionUpdate({
  values: { ...unchangedValues, openingWidth: unchangedValues.openingWidth + 10 },
  opening: allProtectedOpening, evidence: correctionEvidence(allProtectedOpening),
  measurementOverrides: new Set(), kindCorrection: unchangedKind,
  kindOverrideApproved: false,
});
assert.equal(blockedProtected.status, "blocked");
assert.equal(blockedProtected.reviewedEvidenceOverride, undefined);
const mutationHistory: unknown[] = [];
assert.equal(mutationHistory.length, 0);
assert.throws(() => planFloorPlanOpeningCorrectionUpdate({
  values: { ...unchangedValues, openingWidth: unchangedValues.openingWidth + 10 },
  opening: allProtectedOpening, evidence: correctionEvidence(allProtectedOpening),
  measurementOverrides: new Set(["width"]), kindCorrection: unchangedKind,
  kindOverrideApproved: false,
  authorizationFactory: () => { throw new Error("unexpected authorization failure"); },
}), /unexpected authorization failure/);
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
  /dimension|validation|invalid|authored geometry/i,
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

const openingReviewPaths = [
  "components/editor/floor-plan-import-review/FloorPlanOpeningCorrectionFields.tsx",
  "components/editor/floor-plan-import-review/useFloorPlanOpeningCorrection.ts",
  "components/editor/floor-plan-import-review/FloorPlanOpeningEvidenceLockNotice.tsx",
];
const reviewUi = openingReviewPaths.map((relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8")
).join("\n");
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
assert.match(reviewUi, /floorPlanPropertyEvidenceIsEditable/);
assert.match(reviewUi, /other\s+opening fields remain editable/);
assert.match(reviewUi, /reviewedEvidenceOverride/);
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
