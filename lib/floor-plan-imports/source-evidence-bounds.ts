import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanRenderedPage } from "./types";

export type FloorPlanSourceEvidenceBoundsIssue = {
  code:
    | "SOURCE_PAGE_COUNT_MISMATCH"
    | "SOURCE_METADATA_UNAVAILABLE"
    | "SOURCE_PAGE_NOT_RENDERED"
    | "SOURCE_PAGE_DIMENSIONS_MISMATCH"
    | "SOURCE_POINT_OUT_OF_BOUNDS"
    | "SOURCE_CROP_OUT_OF_BOUNDS"
    | "SOURCE_ANCHOR_OUT_OF_BOUNDS"
    | "SOURCE_ANCHOR_OUTSIDE_CROP";
  path: string;
  message: string;
};

function provenanceEntries(document: FloorPlanDocumentV2) {
  const entries: Array<{ path: string; provenance: FloorPlanEntityProvenanceV2 }> = [];
  for (const [floorIndex, floor] of document.floors.entries()) {
    const floorPath = `floors[${floorIndex}]`;
    for (const [name, property] of Object.entries(floor.defaults)) {
      entries.push({
        path: `${floorPath}.defaults.${name}.provenance`,
        provenance: property.provenance,
      });
    }
    for (const [collectionName, entities] of Object.entries({
      vertices: floor.vertices,
      walls: floor.walls,
      rooms: floor.rooms,
      openings: floor.openings,
      structures: floor.structures,
      annotations: floor.annotations,
      dimensions: floor.dimensions,
    })) {
      for (const [entityIndex, entity] of entities.entries()) {
        entries.push({
          path: `${floorPath}.${collectionName}[${entityIndex}].provenance`,
          provenance: entity.provenance,
        });
      }
    }
  }
  return entries;
}

function isWithinPage(point: { x: number; y: number }, page: FloorPlanRenderedPage) {
  return point.x >= 0 && point.y >= 0 && point.x <= page.widthPx && point.y <= page.heightPx;
}

/**
 * Cross-checks authored page references against the renderer metadata persisted
 * by the import job. Document-provided width/height values are never trusted as
 * the coordinate authority for publication.
 */
export function validateFloorPlanSourceEvidenceBounds(input: {
  document: FloorPlanDocumentV2;
  sourceId: string;
  renderedPages: readonly FloorPlanRenderedPage[];
}): FloorPlanSourceEvidenceBoundsIssue[] {
  const issues: FloorPlanSourceEvidenceBoundsIssue[] = [];
  const pages = new Map(input.renderedPages.map((page) => [page.pageNumber, page]));
  const source = input.document.sources.find((entry) => entry.id === input.sourceId);

  if (source?.pageCount !== undefined && source.pageCount !== pages.size) {
    issues.push({
      code: "SOURCE_PAGE_COUNT_MISMATCH",
      path: `sources[${input.document.sources.indexOf(source)}].pageCount`,
      message: `The document declares ${source.pageCount} pages but the import rendered ${pages.size}.`,
    });
  }

  for (const [floorIndex, floor] of input.document.floors.entries()) {
    for (const [calibrationIndex, calibration] of floor.calibrations.entries()) {
      const path = `floors[${floorIndex}].calibrations[${calibrationIndex}]`;
      const calibrationSource = input.document.sources.find(
        (entry) => entry.id === calibration.sourceId
      );
      if (calibration.sourceId !== input.sourceId) {
        if (calibrationSource && ["pdf", "raster"].includes(calibrationSource.kind)) {
          issues.push({
            code: "SOURCE_METADATA_UNAVAILABLE",
            path: `${path}.sourceId`,
            message: `No stored rendered-page metadata is available for source ${calibration.sourceId}.`,
          });
        }
        continue;
      }
      const page = pages.get(calibration.pageNumber);
      if (!page) {
        issues.push({
          code: "SOURCE_PAGE_NOT_RENDERED",
          path: `${path}.pageNumber`,
          message: `Source page ${calibration.pageNumber} was not rendered by this import job.`,
        });
        continue;
      }
      if (
        calibration.imageWidthPx !== page.widthPx ||
        calibration.imageHeightPx !== page.heightPx
      ) {
        issues.push({
          code: "SOURCE_PAGE_DIMENSIONS_MISMATCH",
          path,
          message: `Calibration dimensions ${calibration.imageWidthPx}x${calibration.imageHeightPx} do not match rendered page ${page.widthPx}x${page.heightPx}.`,
        });
      }
      for (const [pointIndex, point] of calibration.controlPoints.entries()) {
        if (!isWithinPage(point.sourcePx, page)) {
          issues.push({
            code: "SOURCE_POINT_OUT_OF_BOUNDS",
            path: `${path}.controlPoints[${pointIndex}].sourcePx`,
            message: `Calibration point (${point.sourcePx.x}, ${point.sourcePx.y}) is outside rendered page ${page.widthPx}x${page.heightPx}.`,
          });
        }
      }
    }
  }

  for (const entry of provenanceEntries(input.document)) {
    for (const [evidenceIndex, evidence] of entry.provenance.evidence.entries()) {
      const path = `${entry.path}.evidence[${evidenceIndex}]`;
      const evidenceSource = input.document.sources.find(
        (sourceEntry) => sourceEntry.id === evidence.sourceId
      );
      if (evidence.sourceId !== input.sourceId) {
        if (evidenceSource && ["pdf", "raster"].includes(evidenceSource.kind)) {
          issues.push({
            code: "SOURCE_METADATA_UNAVAILABLE",
            path: `${path}.sourceId`,
            message: `No stored rendered-page metadata is available for source ${evidence.sourceId}.`,
          });
        }
        continue;
      }
      if (evidence.pageNumber === undefined) continue;
      const page = pages.get(evidence.pageNumber);
      if (!page) {
        issues.push({
          code: "SOURCE_PAGE_NOT_RENDERED",
          path: `${path}.pageNumber`,
          message: `Evidence page ${evidence.pageNumber} was not rendered by this import job.`,
        });
        continue;
      }
      const crop = evidence.cropPx;
      if (
        crop &&
        (crop.xPx < 0 ||
          crop.yPx < 0 ||
          crop.xPx + crop.widthPx > page.widthPx ||
          crop.yPx + crop.heightPx > page.heightPx)
      ) {
        issues.push({
          code: "SOURCE_CROP_OUT_OF_BOUNDS",
          path: `${path}.cropPx`,
          message: `Evidence crop (${crop.xPx}, ${crop.yPx}, ${crop.widthPx}, ${crop.heightPx}) is outside rendered page ${page.widthPx}x${page.heightPx}.`,
        });
      }
      for (const [anchorIndex, anchor] of (evidence.sourceAnchors ?? []).entries()) {
        const anchorPath = `${path}.sourceAnchors[${anchorIndex}].sourcePx`;
        if (!isWithinPage(anchor.sourcePx, page)) {
          issues.push({
            code: "SOURCE_ANCHOR_OUT_OF_BOUNDS",
            path: anchorPath,
            message: `Evidence anchor (${anchor.sourcePx.x}, ${anchor.sourcePx.y}) is outside rendered page ${page.widthPx}x${page.heightPx}.`,
          });
        }
        if (
          !crop ||
          anchor.sourcePx.x < crop.xPx ||
          anchor.sourcePx.y < crop.yPx ||
          anchor.sourcePx.x > crop.xPx + crop.widthPx ||
          anchor.sourcePx.y > crop.yPx + crop.heightPx
        ) {
          issues.push({
            code: "SOURCE_ANCHOR_OUTSIDE_CROP",
            path: anchorPath,
            message: `Evidence anchor (${anchor.sourcePx.x}, ${anchor.sourcePx.y}) is not contained by its source crop.`,
          });
        }
      }
    }
  }

  return issues;
}
