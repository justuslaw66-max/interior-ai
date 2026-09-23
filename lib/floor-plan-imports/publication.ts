import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanReviewRecordV2,
} from "@/lib/floor-plan-document-v2";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import { hashCanonicalJson } from "./json";
import { validateFloorPlanSourceEvidenceBounds } from "./source-evidence-bounds";
import {
  evaluateFloorPlanSourceOverlayResiduals,
  type FloorPlanSourceOverlayEvaluation,
} from "./source-overlay-residuals";
import type { FloorPlanRenderedPage } from "./types";
import {
  evaluateFloorPlanSourceObservationCompleteness,
  floorPlanSourceObservationManifestSchema,
  type FloorPlanSourceObservationManifest,
} from "./source-observation-manifest";

export type FloorPlanPublicationChecks = {
  dimensionsExact: boolean;
  criticalElementsAccountedFor: boolean;
  sourceObservationsComplete: boolean;
  publicationRightsCleared: boolean;
  topologyValid: boolean;
  overlayRegistered: boolean;
  sourceOverlayAnchorsWithinOnePixel: boolean;
  renderParityVerified: boolean;
  persistenceRoundTripVerified: boolean;
  sourceBound: boolean;
  sourceEvidenceWithinBounds: boolean;
};

export type FloorPlanDimensionEvidenceMode =
  | "printed_dimensions"
  | "authoritative_cad_units";

function criticalEntities(document: FloorPlanDocumentV2) {
  return document.floors.flatMap((floor) => [
    ...floor.vertices,
    ...floor.walls,
    ...floor.rooms,
    ...floor.openings,
    ...floor.structures,
  ]);
}

function allDimensionIds(document: FloorPlanDocumentV2) {
  return document.floors.flatMap((floor) => floor.dimensions.map((dimension) => dimension.id));
}

function sameIdSet(left: string[], right: string[]) {
  return [...new Set(left)].sort().join("|") === [...new Set(right)].sort().join("|");
}

/**
 * CAD coordinates can be dimension-authoritative without containing a
 * typeset dimension entity. This branch remains deliberately narrow: the
 * durable primary source must be CAD, every floor must have a registered
 * source calibration, and all promoted wall/vertex coordinates must retain
 * direct CAD evidence from that exact source. Missing/assumed CAD units never
 * produce those calibrations or `cad` evidence and therefore cannot pass.
 */
export function hasAuthoritativeCadCoordinateEvidence(input: {
  document: FloorPlanDocumentV2;
  sourceAssetId: string;
}): boolean {
  const source = input.document.sources.find(
    (candidate) => candidate.id === input.sourceAssetId
  );
  if (source?.kind !== "cad") return false;
  return input.document.floors.every((floor) => {
    const calibrations = floor.calibrations.filter(
      (calibration) => calibration.sourceId === input.sourceAssetId
    );
    if (!calibrations.length || calibrations.some((entry) => entry.controlPoints.length < 3)) {
      return false;
    }
    if (!floor.vertices.length || !floor.walls.length) return false;
    return [...floor.vertices, ...floor.walls].every((entity) =>
      entity.provenance.evidence.some(
        (evidence) =>
          evidence.sourceId === input.sourceAssetId && evidence.basis === "cad"
      )
    );
  });
}

function appendReview(
  provenance: FloorPlanEntityProvenanceV2,
  review: FloorPlanReviewRecordV2
): FloorPlanEntityProvenanceV2 {
  return {
    ...provenance,
    reviewHistory: [
      ...provenance.reviewHistory.filter((entry) => entry.id !== review.id),
      review,
    ],
  };
}

export function stampFloorPlanApproval(input: {
  document: FloorPlanDocumentV2;
  tier: "source_verified" | "construction_verified";
  reviewerId: string;
  reviewedAt: string;
  note: string;
}) {
  const document = structuredClone(input.document);
  const review: FloorPlanReviewRecordV2 = {
    id: `approval-${input.reviewedAt.replace(/[^0-9]/g, "")}`,
    action: "approved",
    reviewerId: input.reviewerId,
    reviewedAt: input.reviewedAt,
    note: input.note,
  };
  document.verification = {
    tier: input.tier,
    criticalIssueIds: [],
    approvedBy: input.reviewerId,
    approvedAt: input.reviewedAt,
  };
  for (const floor of document.floors) {
    for (const entity of [
      ...floor.vertices,
      ...floor.walls,
      ...floor.rooms,
      ...floor.openings,
      ...floor.structures,
      ...floor.annotations,
      ...floor.dimensions,
    ]) {
      entity.provenance = appendReview(entity.provenance, review);
    }
    for (const property of Object.values(floor.defaults)) {
      property.provenance = appendReview(property.provenance, review);
    }
    if (floor.verticalEvidence) {
      for (const property of Object.values(floor.verticalEvidence)) {
        property.provenance = appendReview(property.provenance, review);
      }
    }
  }
  return document;
}

export function computeFloorPlanPublicationChecks(input: {
  document: FloorPlanDocumentV2;
  observationManifest: FloorPlanSourceObservationManifest;
  sourceAssetId: string;
  sourceSha256: string;
  sourceMimeType: string;
  renderedPages: readonly FloorPlanRenderedPage[];
}): {
  checks: FloorPlanPublicationChecks;
  geometryHash: string;
  dimensionEvidenceMode: FloorPlanDimensionEvidenceMode | null;
  sourceOverlayVerification: FloorPlanSourceOverlayEvaluation;
} {
  const parsedObservationManifest = floorPlanSourceObservationManifestSchema.safeParse(
    input.observationManifest
  );
  if (!parsedObservationManifest.success) {
    throw new Error(
      "FLOOR_PLAN_SOURCE_OBSERVATIONS_REQUIRED: a valid independently recorded manifest is required"
    );
  }
  const observationManifest = parsedObservationManifest.data;
  const issues = validateFloorPlanDocumentV2(input.document);
  const errors = issues.filter((issue) => issue.severity === "error");
  const scene = compileFloorPlanDocumentV2(input.document);
  const dimensionIds = allDimensionIds(input.document);
  const observationEvaluation = evaluateFloorPlanSourceObservationCompleteness({
    document: input.document,
    manifest: observationManifest,
    sourceAsset: {
      id: input.sourceAssetId,
      sha256: input.sourceSha256,
      mimeType: input.sourceMimeType,
    },
    renderedPages: input.renderedPages,
  });
  const publicationRightsCleared = !observationEvaluation.issues.some(
    (issue) => issue.code === "PUBLICATION_RIGHTS_EXPIRED"
  );
  const sourceObservationsComplete = observationEvaluation.issues.every(
    (issue) => issue.code === "PUBLICATION_RIGHTS_EXPIRED"
  );
  const observedDimensionIds = observationManifest.observations
    .filter((observation) => observation.kind === "dimension")
    .map((observation) => observation.canonicalEntityId);
  const printedDimensionsExact =
    dimensionIds.length > 0 &&
    sameIdSet(dimensionIds, observedDimensionIds) &&
    sourceObservationsComplete &&
    !issues.some((issue) => issue.code === "DIMENSION_MISMATCH");
  const authoritativeCadUnits =
    dimensionIds.length === 0 &&
    observedDimensionIds.length === 0 &&
    sourceObservationsComplete &&
    hasAuthoritativeCadCoordinateEvidence({
      document: input.document,
      sourceAssetId: input.sourceAssetId,
    });
  const dimensionsExact = printedDimensionsExact || authoritativeCadUnits;
  const dimensionEvidenceMode: FloorPlanDimensionEvidenceMode | null =
    printedDimensionsExact
      ? "printed_dimensions"
      : authoritativeCadUnits
        ? "authoritative_cad_units"
        : null;
  const criticalElementsAccountedFor =
    sourceObservationsComplete &&
    observationManifest.observations.length > 0 &&
    criticalEntities(input.document).every((entity) =>
      entity.provenance.reviewHistory.some((review) => review.action === "approved")
    );
  const sourceOverlayVerification = evaluateFloorPlanSourceOverlayResiduals({
    document: input.document,
    sourceId: input.sourceAssetId,
    observationManifest,
  });
  const calibrationResiduals = new Map(
    sourceOverlayVerification.calibrations.map((calibration) => [
      `${calibration.floorId}:${calibration.calibrationId}`,
      calibration,
    ])
  );
  const observedPageNumbers = new Set(
    observationManifest.observations.map((observation) => observation.pageNumber)
  );
  const overlayRegistered = input.document.floors.every((floor) => {
    const sourceCalibrations = floor.calibrations.filter(
      (calibration) => calibration.sourceId === input.sourceAssetId
    );
    return (
      sourceCalibrations.length > 0 &&
      sourceCalibrations.every((calibration) => {
        const computed = calibrationResiduals.get(`${floor.id}:${calibration.id}`);
        return (
          observedPageNumbers.has(calibration.pageNumber) &&
          computed?.withinTolerance === true
        );
      })
    );
  });
  const roundTrip = JSON.parse(JSON.stringify(input.document)) as FloorPlanDocumentV2;
  const roundTripScene = compileFloorPlanDocumentV2(roundTrip);
  const sourceBound = input.document.sources.some(
    (source) =>
      source.id === input.sourceAssetId &&
      source.sha256 === input.sourceSha256 &&
      source.mimeType === input.sourceMimeType &&
      (input.sourceMimeType === "application/pdf"
        ? source.kind === "pdf"
        : ["image/png", "image/jpeg", "image/webp"].includes(input.sourceMimeType)
          ? source.kind === "raster"
          : true)
  );
  const renderedPageNumbers = new Set(input.renderedPages.map((page) => page.pageNumber));
  const sourceEvidenceBoundsIssues = validateFloorPlanSourceEvidenceBounds({
    document: input.document,
    sourceId: input.sourceAssetId,
    renderedPages: input.renderedPages,
  });
  const checks: FloorPlanPublicationChecks = {
    dimensionsExact,
    criticalElementsAccountedFor,
    sourceObservationsComplete,
    publicationRightsCleared,
    topologyValid: errors.length === 0,
    overlayRegistered,
    sourceOverlayAnchorsWithinOnePixel:
      sourceOverlayVerification.passed &&
      sourceOverlayVerification.residuals.length > 0,
    renderParityVerified:
      scene.geometryHash === roundTripScene.geometryHash &&
      hashCanonicalJson(scene.floors) === hashCanonicalJson(roundTripScene.floors),
    persistenceRoundTripVerified: scene.geometryHash === roundTripScene.geometryHash,
    sourceBound,
    sourceEvidenceWithinBounds:
      input.renderedPages.length > 0 &&
      [...observedPageNumbers].every((pageNumber) => renderedPageNumbers.has(pageNumber)) &&
      sourceEvidenceBoundsIssues.length === 0,
  };
  return {
    checks,
    geometryHash: scene.geometryHash,
    dimensionEvidenceMode,
    sourceOverlayVerification,
  };
}

export function assertFloorPlanPublicationChecks(checks: FloorPlanPublicationChecks) {
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length) {
    throw new Error(`Floor-plan publication gates failed: ${failed.join(", ")}`);
  }
}

export function buildIndependentFloorPlanSourceManifest(input: {
  document: FloorPlanDocumentV2;
  observationManifest: FloorPlanSourceObservationManifest;
  checks: FloorPlanPublicationChecks;
  geometryHash: string;
  dimensionEvidenceMode?: FloorPlanDimensionEvidenceMode | null;
  sourceOverlayVerification: FloorPlanSourceOverlayEvaluation;
  reviewerId: string;
  reviewedAt: string;
  renderedPages: readonly FloorPlanRenderedPage[];
}) {
  return {
    schemaVersion: 3,
    generatedAt: input.reviewedAt,
    reviewerId: input.reviewerId,
    geometryHash: input.geometryHash,
    sources: input.document.sources,
    renderedSourcePages: input.renderedPages.map((page) => ({
      pageNumber: page.pageNumber,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      assetKey: page.assetKey,
      normalization: page.normalization ?? null,
    })),
    sourceOverlayVerification: input.sourceOverlayVerification,
    floors: input.document.floors.map((floor) => ({
      id: floor.id,
      sourceRegistration: floor.calibrations,
      geometry: {
        vertexIds: floor.vertices.map((entity) => entity.id),
        wallIds: floor.walls.map((entity) => entity.id),
        roomIds: floor.rooms.map((entity) => entity.id),
        openingIds: floor.openings.map((entity) => entity.id),
        structureIds: floor.structures.map((entity) => entity.id),
      },
      labels: floor.rooms.map((room) => ({ id: room.id, name: room.name, roomType: room.roomType })),
      dimensions: floor.dimensions.map((dimension) => ({
        id: dimension.id,
        measuredMm: dimension.measuredMm,
        fromVertexId: dimension.fromVertexId,
        toVertexId: dimension.toVertexId,
        evidence: dimension.provenance.evidence,
      })),
      evidence: criticalEntities({ ...input.document, floors: [floor] }).map((entity) => ({
        id: entity.id,
        confidence: entity.provenance.confidence,
        evidence: entity.provenance.evidence,
        reviewerHistory: entity.provenance.reviewHistory,
      })),
    })),
    sourceObservationManifest: input.observationManifest,
    // Kept as a server-derived compatibility summary for existing catalog
    // projections. It is never accepted as publication evidence.
    sourceInventory: {
      pageNumbers: [...new Set(
        input.observationManifest.observations.map((observation) => observation.pageNumber)
      )].sort((left, right) => left - right),
      visibleCriticalEntityIds: input.observationManifest.observations
        .filter((observation) => observation.kind !== "dimension")
        .map((observation) => observation.canonicalEntityId),
      printedDimensionIds: input.observationManifest.observations
        .filter((observation) => observation.kind === "dimension")
        .map((observation) => observation.canonicalEntityId),
      licenseStatus: input.observationManifest.rightsEvidence.status,
      reviewerNotes: input.observationManifest.reviewerNotes,
    },
    dimensionEvidenceMode: input.dimensionEvidenceMode ?? null,
    reviewerMetadata: {
      sourceObservationVersion: input.observationManifest.schemaVersion,
      recordedByReviewerId: input.observationManifest.recordedByReviewerId,
      recordedAt: input.observationManifest.recordedAt,
    },
    publicationChecks: input.checks,
  };
}
