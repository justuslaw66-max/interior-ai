import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanReviewIssue } from "./types";

const READINESS_ISSUE_IDS = new Set([
  "source-registration-incomplete",
  "canonical-room-coverage-incomplete",
  "source-room-coverage-incomplete",
  "source-dimension-coverage-incomplete",
  "source-dimension-missing",
  "unlabeled-room-review",
]);

type SourceManifestPageCounts = {
  pageNumber: number;
  selectedForSemanticClassification: boolean;
  selectedForGeometry: boolean;
  semanticRoomLabelCount: number;
  semanticDimensionCount: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function sourceManifestPageCounts(
  sourceManifest: Record<string, unknown> | null
): SourceManifestPageCounts[] {
  if (!Array.isArray(sourceManifest?.pages)) return [];
  return sourceManifest.pages.flatMap((value) => {
    const page = record(value);
    if (!page || !Number.isSafeInteger(page.pageNumber) || Number(page.pageNumber) < 1) {
      return [];
    }
    return [{
      pageNumber: Number(page.pageNumber),
      selectedForSemanticClassification:
        page.selectedForSemanticClassification === true,
      selectedForGeometry: page.selectedForGeometry === true,
      semanticRoomLabelCount: count(page.semanticRoomLabelCount),
      semanticDimensionCount: count(page.semanticDimensionCount),
    }];
  });
}

function issue(
  id: string,
  code: string,
  message: string,
  entityIds?: string[],
  severity: FloorPlanReviewIssue["severity"] = "critical"
): FloorPlanReviewIssue {
  return {
    id,
    code,
    message,
    severity,
    resolved: false,
    ...(entityIds?.length ? { entityIds } : {}),
  };
}

/**
 * Recomputed readiness gate for a consumer import. Geometry and a measured
 * scale remain mandatory; optional naming and complete label reconciliation
 * are surfaced as suggestions.
 */
export function collectFloorPlanImportReadinessIssues(input: {
  document: FloorPlanDocumentV2;
  sourceManifest: Record<string, unknown> | null;
}): FloorPlanReviewIssue[] {
  const issues: FloorPlanReviewIssue[] = [];
  const unregisteredFloors = input.document.floors.filter(
    (floor) => floor.calibrations.length === 0
  );
  if (unregisteredFloors.length) {
    issues.push(issue(
      "source-registration-incomplete",
      "source_registration_incomplete",
      `Every imported floor must have an explicit source-to-millimetre calibration. Missing: ${unregisteredFloors
        .map((floor) => floor.name || floor.id)
        .join(", ")}.`,
      unregisteredFloors.map((floor) => floor.id)
    ));
  }

  const emptyFloors = input.document.floors.filter(
    (floor) => floor.rooms.length === 0 || floor.walls.length === 0
  );
  if (emptyFloors.length) {
    issues.push(issue(
      "canonical-room-coverage-incomplete",
      "canonical_room_coverage_incomplete",
      `Every imported floor must contain closed rooms and their canonical bounding walls. Missing: ${emptyFloors
        .map((floor) => floor.name || floor.id)
        .join(", ")}.`,
      emptyFloors.map((floor) => floor.id)
    ));
  }

  const manifestPages = sourceManifestPageCounts(input.sourceManifest);
  const registeredPageNumbers = new Set(
    input.document.floors.flatMap((floor) =>
      floor.calibrations.map((calibration) => calibration.pageNumber)
    )
  );
  const relevantPages = registeredPageNumbers.size
    ? manifestPages.filter((page) => registeredPageNumbers.has(page.pageNumber))
    : manifestPages.some((page) => page.selectedForGeometry)
      ? manifestPages.filter((page) => page.selectedForGeometry)
    : manifestPages.filter((page) => page.selectedForSemanticClassification);
  const expectedRoomCount = relevantPages.reduce(
    (total, page) => total + page.semanticRoomLabelCount,
    0
  );
  const expectedDimensionCount = relevantPages.reduce(
    (total, page) => total + page.semanticDimensionCount,
    0
  );
  const roomIds = input.document.floors.flatMap((floor) =>
    floor.rooms.map((room) => room.id)
  );
  const dimensionIds = input.document.floors.flatMap((floor) =>
    floor.dimensions.map((dimension) => dimension.id)
  );
  const genericRoomIds = input.document.floors.flatMap((floor) =>
    floor.rooms
      .filter((room) => /^Room \d+$/i.test(room.name.trim()))
      .map((room) => room.id)
  );

  if (genericRoomIds.length) {
    issues.push(issue(
      "unlabeled-room-review",
      "unlabeled_rooms_require_name",
      `${genericRoomIds.length} enclosed ${
        genericRoomIds.length === 1 ? "space has" : "spaces have"
      } no unambiguous source label. You can name ${
        genericRoomIds.length === 1 ? "it" : "them"
      } after creating the design.`,
      genericRoomIds,
      "warning"
    ));
  }

  if (dimensionIds.length === 0) {
    issues.push(issue(
      "source-dimension-missing",
      "source_dimension_missing",
      "At least one exact source dimension must be preserved in the editable plan.",
      []
    ));
  }

  if (roomIds.length < expectedRoomCount) {
    issues.push(issue(
      "source-room-coverage-incomplete",
      "source_room_coverage_incomplete",
      `Source analysis found ${expectedRoomCount} area labels across ${roomIds.length} enclosed rooms. Open-plan labels are preserved separately and can be edited later.`,
      roomIds,
      "warning"
    ));
  }
  if (dimensionIds.length < expectedDimensionCount) {
    issues.push(issue(
      "source-dimension-coverage-incomplete",
      "source_dimension_coverage_incomplete",
      dimensionIds.length
        ? `Source analysis found ${expectedDimensionCount} printed dimensions, but ${dimensionIds.length} are reconciled exactly. The remaining labels are suggested verification checks.`
        : `Source analysis found ${expectedDimensionCount} printed dimensions, but none are registered as exact dimensions. At least one exact dimension and a solved scale are required.`,
      dimensionIds,
      dimensionIds.length ? "warning" : "critical"
    ));
  }

  return issues;
}

/** Recompute hard readiness issues instead of trusting a resolved checkbox. */
export function reconcileFloorPlanImportReadinessIssues(input: {
  document: FloorPlanDocumentV2;
  sourceManifest: Record<string, unknown> | null;
  reviewIssues: FloorPlanReviewIssue[];
}) {
  return [
    ...input.reviewIssues.filter((entry) => !READINESS_ISSUE_IDS.has(entry.id)),
    ...collectFloorPlanImportReadinessIssues(input),
  ];
}
