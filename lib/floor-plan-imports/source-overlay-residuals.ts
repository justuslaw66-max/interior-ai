import type {
  FloorPlanDocumentV2,
  FloorPlanEvidenceV2,
  FloorPlanFloorV2,
  FloorPlanOpeningV2,
  FloorPlanPointMmV2,
  FloorPlanSourceAnchorV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanSourceObservationManifest } from "./source-observation-manifest";

export const FLOOR_PLAN_SOURCE_OVERLAY_TOLERANCE_PX = 1;

type SourcePoint = { xPx: number; yPx: number };

export type { FloorPlanSourceProjection } from "./source-projection";
import type { FloorPlanSourceProjection } from "./source-projection";
export { buildFloorPlanSourceProjection } from "./source-projection";
import { buildFloorPlanSourceProjection, sourceResidualPx } from "./source-projection";

export type FloorPlanSourceOverlayEntityType = "wall" | "opening";

export type FloorPlanSourceOverlayResidual = {
  floorId: string;
  entityType: FloorPlanSourceOverlayEntityType;
  entityId: string;
  role: FloorPlanSourceAnchorV2["role"];
  sourceId: string;
  pageNumber: number;
  calibrationId: string;
  expectedSourcePx: SourcePoint;
  observedSourcePx: SourcePoint;
  residualPx: number;
  tolerancePx: number;
  withinTolerance: boolean;
};

export type FloorPlanSourceCalibrationResidual = {
  floorId: string;
  sourceId: string;
  pageNumber: number;
  calibrationId: string;
  declaredRmsErrorPx?: number;
  computedRmsErrorPx: number;
  tolerancePx: number;
  withinTolerance: boolean;
};

export type FloorPlanSourceOverlayIssueCode =
  | "MISSING_SOURCE_ANCHOR"
  | "MISSING_ANCHOR_PAGE"
  | "MISSING_ANCHOR_CALIBRATION"
  | "UNKNOWN_ANCHOR_CALIBRATION"
  | "ANCHOR_CALIBRATION_MISMATCH"
  | "INVALID_SOURCE_PROJECTION"
  | "ANCHOR_OUTSIDE_EVIDENCE_CROP"
  | "MISSING_SOURCE_OBSERVATION"
  | "OBSERVATION_CALIBRATION_MISSING_OR_AMBIGUOUS"
  | "UNRESOLVED_ENTITY_GEOMETRY"
  | "SOURCE_OVERLAY_RESIDUAL_EXCEEDED"
  | "SOURCE_CALIBRATION_RESIDUAL_EXCEEDED";

export type FloorPlanSourceOverlayIssue = {
  code: FloorPlanSourceOverlayIssueCode;
  path: string;
  floorId: string;
  pageNumber?: number;
  entityType?: FloorPlanSourceOverlayEntityType;
  entityId?: string;
  role?: FloorPlanSourceAnchorV2["role"];
  message: string;
};

export type FloorPlanSourceOverlayEvaluation = {
  tolerancePx: number;
  passed: boolean;
  residuals: FloorPlanSourceOverlayResidual[];
  calibrations: FloorPlanSourceCalibrationResidual[];
  issues: FloorPlanSourceOverlayIssue[];
  maximumResidualPx: number | null;
};

type ResidualAnchorEvidence = {
  sourceId: string;
  pageNumber?: number;
  calibrationId?: string;
  cropPx?: FloorPlanEvidenceV2["cropPx"];
  anchors: FloorPlanSourceAnchorV2[];
  anchorPath: (anchorIndex: number) => string;
};


function pointWithinCrop(
  point: FloorPlanSourceAnchorV2["sourcePx"],
  crop: NonNullable<FloorPlanEvidenceV2["cropPx"]>
) {
  return (
    point.x >= crop.xPx &&
    point.y >= crop.yPx &&
    point.x <= crop.xPx + crop.widthPx &&
    point.y <= crop.yPx + crop.heightPx
  );
}

function wallPoint(
  wall: FloorPlanWallV2,
  floor: FloorPlanFloorV2,
  role: FloorPlanSourceAnchorV2["role"]
): FloorPlanPointMmV2 | null {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return null;
  if (role === "start") return { xMm: start.xMm, zMm: start.zMm };
  if (role === "end") return { xMm: end.xMm, zMm: end.zMm };
  if (wall.path.kind === "line") {
    return { xMm: (start.xMm + end.xMm) / 2, zMm: (start.zMm + end.zMm) / 2 };
  }
  const center = vertices.get(wall.path.centerVertexId);
  if (!center) return null;
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise) {
    while (sweep >= 0) sweep -= Math.PI * 2;
  } else {
    while (sweep <= 0) sweep += Math.PI * 2;
  }
  const radius = Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
  const angle = startAngle + sweep / 2;
  return {
    xMm: center.xMm + Math.cos(angle) * radius,
    zMm: center.zMm + Math.sin(angle) * radius,
  };
}

function wallLength(wall: FloorPlanWallV2, floor: FloorPlanFloorV2): number | null {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return null;
  if (wall.path.kind === "line") {
    return Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  }
  const center = vertices.get(wall.path.centerVertexId);
  if (!center) return null;
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise) {
    while (sweep >= 0) sweep -= Math.PI * 2;
  } else {
    while (sweep <= 0) sweep += Math.PI * 2;
  }
  return Math.abs(sweep) * Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
}

function openingPoint(
  opening: FloorPlanOpeningV2,
  floor: FloorPlanFloorV2,
  role: FloorPlanSourceAnchorV2["role"]
): FloorPlanPointMmV2 | null {
  const wall = floor.walls.find((candidate) => candidate.id === opening.wallId);
  if (!wall) return null;
  const length = wallLength(wall, floor);
  if (!length || length <= 0) return null;
  const distance =
    role === "start"
      ? opening.offsetMm
      : role === "end"
        ? opening.offsetMm + opening.widthMm
        : opening.offsetMm + opening.widthMm / 2;
  const fraction = distance / length;
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return null;
  if (wall.path.kind === "line") {
    return {
      xMm: start.xMm + (end.xMm - start.xMm) * fraction,
      zMm: start.zMm + (end.zMm - start.zMm) * fraction,
    };
  }
  const center = vertices.get(wall.path.centerVertexId);
  if (!center) return null;
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise) {
    while (sweep >= 0) sweep -= Math.PI * 2;
  } else {
    while (sweep <= 0) sweep += Math.PI * 2;
  }
  const radius = Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
  const angle = startAngle + sweep * fraction;
  return {
    xMm: center.xMm + Math.cos(angle) * radius,
    zMm: center.zMm + Math.sin(angle) * radius,
  };
}

function requiredRoles(entityType: FloorPlanSourceOverlayEntityType, wall?: FloorPlanWallV2) {
  if (entityType === "wall" && wall?.path.kind === "arc") {
    return ["start", "midpoint", "end"] as const;
  }
  return ["start", "end"] as const;
}

function entityPath(entityType: FloorPlanSourceOverlayEntityType, index: number) {
  return `${entityType === "wall" ? "walls" : "openings"}[${index}]`;
}

/**
 * Independently compares canonical walls/opening spans with direct source
 * pixels. Publication supplies the immutable reviewer observation manifest,
 * making those independently entered pixels authoritative for residuals.
 * Candidate provenance remains the preview fallback only. A declared
 * calibration RMS or in-bounds crop can never make this pass: every required
 * source anchor must be present and no observed anchor may exceed tolerance.
 */
export function evaluateFloorPlanSourceOverlayResiduals(input: {
  document: FloorPlanDocumentV2;
  sourceId?: string;
  tolerancePx?: number;
  observationManifest?: FloorPlanSourceObservationManifest;
}): FloorPlanSourceOverlayEvaluation {
  const tolerancePx = input.tolerancePx ?? FLOOR_PLAN_SOURCE_OVERLAY_TOLERANCE_PX;
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new Error("Source-overlay tolerance must be a finite non-negative number");
  }
  const residuals: FloorPlanSourceOverlayResidual[] = [];
  const calibrations: FloorPlanSourceCalibrationResidual[] = [];
  const issues: FloorPlanSourceOverlayIssue[] = [];
  const projectionByCalibration = new Map<string, FloorPlanSourceProjection | null>();

  for (const floor of input.document.floors) {
    for (const calibration of floor.calibrations) {
      if (input.sourceId && calibration.sourceId !== input.sourceId) continue;
      const projection = buildFloorPlanSourceProjection(calibration);
      projectionByCalibration.set(`${floor.id}:${calibration.id}`, projection);
      if (!projection) {
        issues.push({
          code: "INVALID_SOURCE_PROJECTION",
          path: `floors[${input.document.floors.indexOf(floor)}].calibrations[${floor.calibrations.indexOf(calibration)}]`,
          floorId: floor.id,
          pageNumber: calibration.pageNumber,
          message: `Calibration ${calibration.id} cannot produce a deterministic source projection.`,
        });
        continue;
      }
      const withinTolerance = projection.computedRmsErrorPx <= tolerancePx + 1e-9;
      calibrations.push({
        floorId: floor.id,
        sourceId: calibration.sourceId,
        pageNumber: calibration.pageNumber,
        calibrationId: calibration.id,
        declaredRmsErrorPx: calibration.rmsErrorPx,
        computedRmsErrorPx: projection.computedRmsErrorPx,
        tolerancePx,
        withinTolerance,
      });
      if (!withinTolerance) {
        issues.push({
          code: "SOURCE_CALIBRATION_RESIDUAL_EXCEEDED",
          path: `floors[${input.document.floors.indexOf(floor)}].calibrations[${floor.calibrations.indexOf(calibration)}]`,
          floorId: floor.id,
          pageNumber: calibration.pageNumber,
          message: `Calibration ${calibration.id} has a server-computed RMS residual of ${projection.computedRmsErrorPx.toFixed(3)} px (limit ${tolerancePx} px).`,
        });
      }
    }

    const entities: Array<{
      entityType: FloorPlanSourceOverlayEntityType;
      entity: FloorPlanWallV2 | FloorPlanOpeningV2;
      index: number;
      wall?: FloorPlanWallV2;
    }> = [
      ...floor.walls.map((entity, index) => ({
        entityType: "wall" as const,
        entity,
        index,
        wall: entity,
      })),
      ...floor.openings.map((entity, index) => ({
        entityType: "opening" as const,
        entity,
        index,
        wall: floor.walls.find((wall) => wall.id === entity.wallId),
      })),
    ];

    for (const { entityType, entity, index, wall } of entities) {
      const basePath = `floors[${input.document.floors.indexOf(floor)}].${entityPath(entityType, index)}`;
      const foundRoles = new Set<FloorPlanSourceAnchorV2["role"]>();
      let residualPageNumbers: number[] = [];
      let anchorEvidence: ResidualAnchorEvidence[];
      if (input.observationManifest) {
        const matches = input.observationManifest.observations
          .map((observation, observationIndex) => ({ observation, observationIndex }))
          .filter(({ observation }) =>
            observation.floorId === floor.id &&
            observation.canonicalEntityId === entity.id &&
            observation.kind === entityType
          );
        if (matches.length !== 1) {
          issues.push({
            code: "MISSING_SOURCE_OBSERVATION",
            path: "sourceObservationManifest.observations",
            floorId: floor.id,
            entityType,
            entityId: entity.id,
            message: `${entityType} ${entity.id} must have exactly one independent source observation.`,
          });
          anchorEvidence = [];
        } else {
          const { observation, observationIndex } = matches[0];
          residualPageNumbers = [observation.pageNumber];
          const sourceId = input.observationManifest.source.assetId;
          const matchingCalibrations = floor.calibrations.filter(
            (calibration) =>
              calibration.sourceId === sourceId &&
              calibration.pageNumber === observation.pageNumber
          );
          if (matchingCalibrations.length !== 1) {
            issues.push({
              code: "OBSERVATION_CALIBRATION_MISSING_OR_AMBIGUOUS",
              path: `sourceObservationManifest.observations[${observationIndex}]`,
              floorId: floor.id,
              pageNumber: observation.pageNumber,
              entityType,
              entityId: entity.id,
              message: `${entityType} ${entity.id}'s observation must resolve to exactly one primary-source calibration on page ${observation.pageNumber}.`,
            });
          }
          anchorEvidence = [{
            sourceId,
            pageNumber: observation.pageNumber,
            calibrationId: matchingCalibrations.length === 1
              ? matchingCalibrations[0].id
              : undefined,
            cropPx: observation.cropPx,
            anchors: observation.anchorsPx.flatMap((anchor) =>
              ["start", "midpoint", "end"].includes(anchor.role)
                ? [{
                    role: anchor.role as FloorPlanSourceAnchorV2["role"],
                    sourcePx: { x: anchor.xPx, y: anchor.yPx },
                  }]
                : []
            ),
            anchorPath: (anchorIndex) =>
              `sourceObservationManifest.observations[${observationIndex}].anchorsPx[${anchorIndex}]`,
          }];
        }
      } else {
        anchorEvidence = entity.provenance.evidence.flatMap((evidence, evidenceIndex) => {
          if (input.sourceId && evidence.sourceId !== input.sourceId) return [];
          if (evidence.pageNumber !== undefined) residualPageNumbers.push(evidence.pageNumber);
          return [{
            sourceId: evidence.sourceId,
            pageNumber: evidence.pageNumber,
            calibrationId: evidence.calibrationId,
            cropPx: evidence.cropPx,
            anchors: evidence.sourceAnchors ?? [],
            anchorPath: (anchorIndex: number) =>
              `${basePath}.provenance.evidence[${evidenceIndex}].sourceAnchors[${anchorIndex}]`,
          }];
        });
      }
      for (const evidence of anchorEvidence) {
        for (const [anchorIndex, anchor] of evidence.anchors.entries()) {
          const path = evidence.anchorPath(anchorIndex);
          if (evidence.pageNumber === undefined) {
            issues.push({
              code: "MISSING_ANCHOR_PAGE",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Source anchor ${anchor.role} for ${entity.id} has no page number.`,
            });
            continue;
          }
          if (!evidence.calibrationId) {
            issues.push({
              code: "MISSING_ANCHOR_CALIBRATION",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Source anchor ${anchor.role} for ${entity.id} is not bound to a calibration.`,
            });
            continue;
          }
          const calibration = floor.calibrations.find(
            (candidate) => candidate.id === evidence.calibrationId
          );
          if (!calibration) {
            issues.push({
              code: "UNKNOWN_ANCHOR_CALIBRATION",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Source anchor ${anchor.role} for ${entity.id} references unknown calibration ${evidence.calibrationId}.`,
            });
            continue;
          }
          if (
            calibration.sourceId !== evidence.sourceId ||
            calibration.pageNumber !== evidence.pageNumber
          ) {
            issues.push({
              code: "ANCHOR_CALIBRATION_MISMATCH",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Source anchor ${anchor.role} for ${entity.id} does not match calibration ${calibration.id}'s source and page.`,
            });
            continue;
          }
          if (!evidence.cropPx || !pointWithinCrop(anchor.sourcePx, evidence.cropPx)) {
            issues.push({
              code: "ANCHOR_OUTSIDE_EVIDENCE_CROP",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Source anchor ${anchor.role} for ${entity.id} is not contained by its evidence crop.`,
            });
            continue;
          }
          const projection = projectionByCalibration.get(`${floor.id}:${calibration.id}`);
          if (!projection) continue;
          const planPoint =
            entityType === "wall"
              ? wallPoint(entity as FloorPlanWallV2, floor, anchor.role)
              : openingPoint(entity as FloorPlanOpeningV2, floor, anchor.role);
          if (!planPoint) {
            issues.push({
              code: "UNRESOLVED_ENTITY_GEOMETRY",
              path: basePath,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `Canonical geometry for ${entity.id}'s ${anchor.role} anchor cannot be resolved.`,
            });
            continue;
          }
          const expected = projection.project(planPoint);
          const residualPx = sourceResidualPx(calibration,{x:expected.xPx,y:expected.yPx},anchor.sourcePx);
          const withinTolerance = residualPx <= tolerancePx + 1e-9;
          residuals.push({
            floorId: floor.id,
            entityType,
            entityId: entity.id,
            role: anchor.role,
            sourceId: evidence.sourceId,
            pageNumber: evidence.pageNumber,
            calibrationId: calibration.id,
            expectedSourcePx: expected,
            observedSourcePx: { xPx: anchor.sourcePx.x, yPx: anchor.sourcePx.y },
            residualPx,
            tolerancePx,
            withinTolerance,
          });
          foundRoles.add(anchor.role);
          if (!withinTolerance) {
            issues.push({
              code: "SOURCE_OVERLAY_RESIDUAL_EXCEEDED",
              path,
              floorId: floor.id,
              pageNumber: evidence.pageNumber,
              entityType,
              entityId: entity.id,
              role: anchor.role,
              message: `${entityType} ${entity.id}'s ${anchor.role} source anchor has a ${residualPx.toFixed(3)} px residual (limit ${tolerancePx} px).`,
            });
          }
        }
      }
      for (const role of requiredRoles(entityType, wall)) {
        if (foundRoles.has(role)) continue;
        const sourcePageNumbers = [...new Set(residualPageNumbers)];
        issues.push({
          code: "MISSING_SOURCE_ANCHOR",
          path: input.observationManifest
            ? "sourceObservationManifest.observations"
            : `${basePath}.provenance.evidence`,
          floorId: floor.id,
          ...(sourcePageNumbers.length === 1 ? { pageNumber: sourcePageNumbers[0] } : {}),
          entityType,
          entityId: entity.id,
          role,
          message: `${entityType} ${entity.id} is missing its required ${role} source anchor.`,
        });
      }
    }
  }

  const maximumResidualPx = residuals.length
    ? Math.max(...residuals.map((residual) => residual.residualPx))
    : null;
  issues.sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
  residuals.sort((left, right) =>
    left.floorId.localeCompare(right.floorId) ||
    left.entityType.localeCompare(right.entityType) ||
    left.entityId.localeCompare(right.entityId) ||
    left.role.localeCompare(right.role) ||
    left.pageNumber - right.pageNumber
  );
  calibrations.sort((left, right) =>
    left.floorId.localeCompare(right.floorId) ||
    left.pageNumber - right.pageNumber ||
    left.calibrationId.localeCompare(right.calibrationId)
  );
  return {
    tolerancePx,
    passed: issues.length === 0,
    residuals,
    calibrations,
    issues,
    maximumResidualPx,
  };
}
