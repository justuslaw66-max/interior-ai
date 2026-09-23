import type {
  FloorPlanDocumentV2,
  FloorPlanEvidenceV2,
  FloorPlanFloorV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildFloorPlanSourceProjection,
  evaluateFloorPlanSourceOverlayResiduals,
  type FloorPlanSourceOverlayIssue,
  type FloorPlanSourceOverlayResidual,
} from "./source-overlay-residuals";

type UnknownRecord = Record<string, unknown>;

export type FloorPlanAdminEvidenceOverlay = {
  entityId: string;
  basis: string;
  confidence: number;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
};

export type FloorPlanAdminWallOverlay = {
  wallId: string;
  points: Array<{ xPx: number; yPx: number }>;
};

export type FloorPlanAdminCalibrationOverlay = {
  calibrationId: string;
  points: Array<{ xPx: number; yPx: number }>;
};

export type FloorPlanAdminSourceOverlay = {
  evidence: FloorPlanAdminEvidenceOverlay[];
  walls: FloorPlanAdminWallOverlay[];
  calibrations: FloorPlanAdminCalibrationOverlay[];
  anchorResiduals: FloorPlanSourceOverlayResidual[];
  anchorIssues: FloorPlanSourceOverlayIssue[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asFloorPlanDocumentV2(value: unknown): FloorPlanDocumentV2 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.units !== "mm" ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.floors)
  ) {
    return null;
  }
  return value as unknown as FloorPlanDocumentV2;
}

export function collectFloorPlanCriticalEntityIds(value: unknown): string[] {
  const document = asFloorPlanDocumentV2(value);
  if (!document) return [];
  return document.floors.flatMap((floor) =>
    [
      ...floor.vertices,
      ...floor.walls,
      ...floor.rooms,
      ...floor.openings,
      ...floor.structures,
    ].map((entity) => entity.id)
  );
}

export function collectFloorPlanPrintedDimensionIds(value: unknown): string[] {
  const document = asFloorPlanDocumentV2(value);
  if (!document) return [];
  return document.floors.flatMap((floor) => floor.dimensions.map((dimension) => dimension.id));
}

function collectEntityEvidence(floor: FloorPlanFloorV2) {
  return [
    ...floor.vertices,
    ...floor.walls,
    ...floor.rooms,
    ...floor.openings,
    ...floor.structures,
    ...floor.annotations,
    ...floor.dimensions,
  ].flatMap((entity) =>
    entity.provenance.evidence.map((evidence) => ({ entityId: entity.id, evidence }))
  );
}

function evidenceOverlay(
  entityId: string,
  evidence: FloorPlanEvidenceV2,
  pageNumber: number
): FloorPlanAdminEvidenceOverlay | null {
  if (evidence.pageNumber !== pageNumber || !evidence.cropPx) return null;
  return {
    entityId,
    basis: evidence.basis,
    confidence: evidence.confidence,
    xPx: evidence.cropPx.xPx,
    yPx: evidence.cropPx.yPx,
    widthPx: evidence.cropPx.widthPx,
    heightPx: evidence.cropPx.heightPx,
  };
}

function projectedWalls(
  floor: FloorPlanFloorV2,
  calibration: FloorPlanSourceCalibrationV2
): FloorPlanAdminWallOverlay[] {
  const projection = buildFloorPlanSourceProjection(calibration);
  if (!projection) return [];
  const { project } = projection;
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  return floor.walls.flatMap((wall) => {
    const start = vertices.get(wall.path.startVertexId);
    const end = vertices.get(wall.path.endVertexId);
    if (!start || !end) return [];
    if (wall.path.kind === "line") {
      return [{ wallId: wall.id, points: [project(start), project(end)] }];
    }
    const center = vertices.get(wall.path.centerVertexId);
    if (!center) return [];
    const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
    let endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
    if (wall.path.clockwise) {
      while (endAngle >= startAngle) endAngle -= Math.PI * 2;
    } else {
      while (endAngle <= startAngle) endAngle += Math.PI * 2;
    }
    const radius = Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
    const points = Array.from({ length: 17 }, (_, index) => {
      const angle = startAngle + ((endAngle - startAngle) * index) / 16;
      return project({
        xMm: center.xMm + Math.cos(angle) * radius,
        zMm: center.zMm + Math.sin(angle) * radius,
      });
    });
    return [{ wallId: wall.id, points }];
  });
}

export function buildFloorPlanAdminSourceOverlay(
  value: unknown,
  pageNumber: number
): FloorPlanAdminSourceOverlay {
  const document = asFloorPlanDocumentV2(value);
  if (!document) {
    return {
      evidence: [],
      walls: [],
      calibrations: [],
      anchorResiduals: [],
      anchorIssues: [],
    };
  }
  const evidence = document.floors.flatMap((floor) =>
    collectEntityEvidence(floor).flatMap(({ entityId, evidence: item }) => {
      const overlay = evidenceOverlay(entityId, item, pageNumber);
      return overlay ? [overlay] : [];
    })
  );
  const calibrations = document.floors.flatMap((floor) =>
    floor.calibrations
      .filter((calibration) => calibration.pageNumber === pageNumber)
      .map((calibration) => ({
        calibrationId: calibration.id,
        points: calibration.controlPoints.map((point) => ({
          xPx: point.sourcePx.x,
          yPx: point.sourcePx.y,
        })),
      }))
  );
  const walls = document.floors.flatMap((floor) =>
    floor.calibrations
      .filter((calibration) => calibration.pageNumber === pageNumber)
      .flatMap((calibration) => projectedWalls(floor, calibration))
  );
  const sourceOverlay = evaluateFloorPlanSourceOverlayResiduals({ document });
  const anchorResiduals = sourceOverlay.residuals.filter(
    (residual) => residual.pageNumber === pageNumber
  );
  const anchorIssues = sourceOverlay.issues.filter(
    (issue) => issue.pageNumber === undefined || issue.pageNumber === pageNumber
  );
  return { evidence, walls, calibrations, anchorResiduals, anchorIssues };
}
