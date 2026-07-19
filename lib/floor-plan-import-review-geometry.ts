import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanOpeningKindV2,
  FloorPlanOpeningOperationV2,
  FloorPlanPointMmV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import { applyFloorPlanAddressTransformV2 } from "@/lib/floor-plan-legacy-adapters";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-overlay-residuals";
import {
  applyFloorPlanTopologyMutationV2,
  type FloorPlanTopologyMutationV2,
} from "@/lib/floor-plan-topology-mutations";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-overlay";

export {
  buildReviewOverlay,
  buildThumbnailPaths,
  snapReviewSourcePoint,
  type ReviewOverlay,
  type ReviewOverlayPath,
  type ReviewSourcePoint,
  type ReviewSourceSnapCandidate,
  type ReviewSourceSnapResult,
} from "@/lib/floor-plan-import-review-overlay";

export type PointScaleAnalysis = {
  valid: boolean;
  /** Source dimension itself is usable even if plan registration is missing. */
  measurementValid: boolean;
  message: string;
  sourceDistancePx: number;
  millimetresPerPixel: number | null;
  existingMillimetresPerPixel: number | null;
  residualMm: number | null;
  residualPercent: number | null;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
};

export type SourceOpeningSpanAnalysis = {
  valid: boolean;
  message: string;
  wallId: string | null;
  offsetMm: number | null;
  widthMm: number | null;
  maximumDistanceMm: number | null;
  sourceStart: ReviewSourcePoint | null;
  sourceEnd: ReviewSourcePoint | null;
};

export const REVIEW_ORIENTATIONS: ReadonlyArray<{
  id: FloorPlanAddressTransform;
  label: string;
}> = [
  { id: "normal", label: "Keep" },
  { id: "rotate_90", label: "Rotate 90°" },
  { id: "rotate_180", label: "Rotate 180°" },
  { id: "rotate_270", label: "Rotate 270°" },
  { id: "mirror_x", label: "Mirror left/right" },
  { id: "mirror_z", label: "Mirror top/bottom" },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function projectReviewSourcePointToPlan(
  calibration: FloorPlanSourceCalibrationV2,
  point: ReviewSourcePoint
): FloorPlanPointMmV2 | null {
  const projection = buildFloorPlanSourceProjection(calibration);
  if (!projection) return null;
  const origin = projection.project({ xMm: 0, zMm: 0 });
  const xUnit = projection.project({ xMm: 1, zMm: 0 });
  const zUnit = projection.project({ xMm: 0, zMm: 1 });
  const a = xUnit.xPx - origin.xPx;
  const b = zUnit.xPx - origin.xPx;
  const c = xUnit.yPx - origin.yPx;
  const d = zUnit.yPx - origin.yPx;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return null;
  const x = point.x - origin.xPx;
  const y = point.y - origin.yPx;
  return {
    xMm: (d * x - b * y) / determinant,
    zMm: (-c * x + a * y) / determinant,
  };
}

/**
 * Finds the straight wall that best matches two source clicks and converts the
 * selected span into canonical opening coordinates. Wall IDs and millimetre
 * offsets stay hidden from the guided UI.
 */
export function analyzeSourceOpeningSpan(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  first: ReviewSourcePoint | null;
  second: ReviewSourcePoint | null;
}): SourceOpeningSpanAnalysis {
  const empty = (
    message: string,
    maximumDistanceMm: number | null = null
  ): SourceOpeningSpanAnalysis => ({
    valid: false,
    message,
    wallId: null,
    offsetMm: null,
    widthMm: null,
    maximumDistanceMm,
    sourceStart: null,
    sourceEnd: null,
  });
  if (!input.first || !input.second) {
    return empty("Select both ends of the visible opening on the plan.");
  }
  const floor = input.document.floors.find((item) => item.id === input.floorId);
  if (!floor) return empty("The selected floor is no longer available.");
  const calibration = floor.calibrations.find(
    (item) =>
      item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
  );
  if (!calibration) return empty("Set the drawing scale before adding openings.");
  const firstPlan = projectReviewSourcePointToPlan(calibration, input.first);
  const secondPlan = projectReviewSourcePointToPlan(calibration, input.second);
  if (!firstPlan || !secondPlan) {
    return empty("The source registration cannot place this opening.");
  }
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const candidates = floor.walls.flatMap((wall) => {
    if (wall.path.kind !== "line") return [];
    const start = vertices.get(wall.path.startVertexId);
    const end = vertices.get(wall.path.endVertexId);
    if (!start || !end) return [];
    const dx = end.xMm - start.xMm;
    const dz = end.zMm - start.zMm;
    const squaredLength = dx * dx + dz * dz;
    const length = Math.sqrt(squaredLength);
    if (length < 100) return [];
    const placement = (point: FloorPlanPointMmV2) => {
      const rawT =
        ((point.xMm - start.xMm) * dx + (point.zMm - start.zMm) * dz) /
        squaredLength;
      const t = clamp(rawT, 0, 1);
      const distanceMm = Math.hypot(
        point.xMm - (start.xMm + dx * t),
        point.zMm - (start.zMm + dz * t)
      );
      return { rawT, t, distanceMm };
    };
    const first = placement(firstPlan);
    const second = placement(secondPlan);
    const outsidePenaltyMm =
      (Math.abs(first.rawT - first.t) + Math.abs(second.rawT - second.t)) *
      length;
    return [
      {
        wall,
        length,
        first,
        second,
        scoreMm:
          Math.max(first.distanceMm, second.distanceMm) + outsidePenaltyMm,
      },
    ];
  });
  const match = candidates.sort((left, right) => left.scoreMm - right.scoreMm)[0];
  if (!match) return empty("Add the room walls before placing doors or windows.");
  const maximumDistanceMm = Math.max(
    match.first.distanceMm,
    match.second.distanceMm
  );
  const allowedDistanceMm = Math.max(500, match.wall.thicknessMm * 4);
  if (match.scoreMm > allowedDistanceMm) {
    return empty(
      "Select the two ends closer to the same wall line.",
      Math.round(maximumDistanceMm)
    );
  }
  const firstT = match.first.t;
  const secondT = match.second.t;
  const offsetMm = Math.round(Math.min(firstT, secondT) * match.length);
  const widthMm = Math.round(Math.abs(secondT - firstT) * match.length);
  if (widthMm < 100) {
    return empty("The selected ends are too close together.", Math.round(maximumDistanceMm));
  }
  const ordered =
    firstT <= secondT
      ? { sourceStart: input.first, sourceEnd: input.second }
      : { sourceStart: input.second, sourceEnd: input.first };
  return {
    valid: true,
    message: `Ready to add · approximately ${widthMm} mm wide.`,
    wallId: match.wall.id,
    offsetMm,
    widthMm,
    maximumDistanceMm: Math.round(maximumDistanceMm),
    ...ordered,
  };
}

function confidenceLabel(
  confidence: number
): PointScaleAnalysis["confidenceLabel"] {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export function analyzePointScale(input: {
  first: ReviewSourcePoint | null;
  second: ReviewSourcePoint | null;
  printedMm: number;
  pageWidthPx: number;
  pageHeightPx: number;
  calibration?: FloorPlanSourceCalibrationV2 | null;
}): PointScaleAnalysis {
  const sourceDistancePx =
    input.first && input.second
      ? Math.hypot(
          input.second.x - input.first.x,
          input.second.y - input.first.y
        )
      : 0;
  const printedMm = Math.round(input.printedMm);
  const diagonal = Math.hypot(input.pageWidthPx, input.pageHeightPx);
  const oldStart =
    input.calibration && input.first
      ? projectReviewSourcePointToPlan(input.calibration, input.first)
      : null;
  const oldEnd =
    input.calibration && input.second
      ? projectReviewSourcePointToPlan(input.calibration, input.second)
      : null;
  const oldDistanceMm =
    oldStart && oldEnd
      ? Math.hypot(oldEnd.xMm - oldStart.xMm, oldEnd.zMm - oldStart.zMm)
      : null;
  const existingMillimetresPerPixel =
    oldDistanceMm !== null && sourceDistancePx > 0
      ? oldDistanceMm / sourceDistancePx
      : null;
  const millimetresPerPixel =
    sourceDistancePx > 0 && printedMm > 0
      ? printedMm / sourceDistancePx
      : null;
  const residualMm =
    oldDistanceMm === null || printedMm <= 0
      ? null
      : oldDistanceMm - printedMm;
  const residualPercent =
    residualMm === null || printedMm <= 0
      ? null
      : (Math.abs(residualMm) / printedMm) * 100;
  const coverage = clamp(sourceDistancePx / Math.max(diagonal * 0.2, 1), 0, 1);
  const agreement =
    residualPercent === null ? 0 : clamp(1 - residualPercent / 10, 0, 1);
  const confidence = clamp(
    input.calibration
      ? 0.25 + coverage * 0.45 + agreement * 0.2
      : 0.1 + coverage * 0.35,
    0,
    input.calibration ? 0.9 : 0.45
  );
  const base = {
    sourceDistancePx,
    millimetresPerPixel,
    existingMillimetresPerPixel,
    residualMm,
    residualPercent,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
  };
  if (!input.first || !input.second) {
    return {
      ...base,
      valid: false,
      measurementValid: false,
      message: "Pick both ends of one printed dimension.",
    };
  }
  if (
    ![input.first.x, input.first.y, input.second.x, input.second.y].every(
      Number.isFinite
    )
  ) {
    return {
      ...base,
      valid: false,
      measurementValid: false,
      message: "Scale points must be finite.",
    };
  }
  if (
    [input.first, input.second].some(
      (point) =>
        point.x < 0 ||
        point.y < 0 ||
        point.x > input.pageWidthPx ||
        point.y > input.pageHeightPx
    )
  ) {
    return {
      ...base,
      valid: false,
      measurementValid: false,
      message: "Scale points must remain inside the source page.",
    };
  }
  if (!Number.isSafeInteger(printedMm) || printedMm < 100 || printedMm > 1_000_000) {
    return {
      ...base,
      valid: false,
      measurementValid: false,
      message: "Enter an integer distance between 100 and 1,000,000 mm.",
    };
  }
  if (sourceDistancePx < Math.max(8, diagonal * 0.01)) {
    return {
      ...base,
      valid: false,
      measurementValid: false,
      message: "The points are too close together for reliable scale.",
    };
  }
  if (
    !input.calibration ||
    !buildFloorPlanSourceProjection(input.calibration) ||
    !oldStart ||
    !oldEnd
  ) {
    return {
      ...base,
      valid: false,
      measurementValid: true,
      message:
        "Scale measured. Map both source endpoints to two plan vertices to register origin and orientation.",
    };
  }
  return {
    ...base,
    valid: true,
    measurementValid: true,
    message: "Compare the registered-scale residual before applying.",
  };
}

function rescaleFloorHorizontalGeometry(
  floor: FloorPlanDocumentV2["floors"][number],
  anchor: FloorPlanPointMmV2,
  factor: number
) {
  const scaleCoordinate = (value: number, origin: number) =>
    Math.round(origin + (value - origin) * factor);
  const scaleLength = (value: number) => Math.round(value * factor);
  for (const vertex of floor.vertices) {
    vertex.xMm = scaleCoordinate(vertex.xMm, anchor.xMm);
    vertex.zMm = scaleCoordinate(vertex.zMm, anchor.zMm);
  }
  for (const wall of floor.walls) wall.thicknessMm = scaleLength(wall.thicknessMm);
  for (const opening of floor.openings) {
    opening.offsetMm = scaleLength(opening.offsetMm);
    opening.widthMm = scaleLength(opening.widthMm);
  }
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind !== "wall_span") continue;
    annotation.geometry.offsetMm = scaleLength(annotation.geometry.offsetMm);
    annotation.geometry.widthMm = scaleLength(annotation.geometry.widthMm);
  }
  for (const calibration of floor.calibrations) {
    calibration.controlPoints = calibration.controlPoints.map((control) => ({
      ...control,
      planMm: {
        xMm: scaleCoordinate(control.planMm.xMm, anchor.xMm),
        zMm: scaleCoordinate(control.planMm.zMm, anchor.zMm),
      },
    }));
    calibration.rmsErrorPx = undefined;
  }
}

export function applyPointScaleCalibration(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  first: ReviewSourcePoint;
  second: ReviewSourcePoint;
  printedMm: number;
}): FloorPlanDocumentV2 {
  const next = structuredClone(input.document);
  const floor = next.floors.find((item) => item.id === input.floorId);
  if (!floor) throw new Error("The selected floor is no longer available.");
  const existing = floor.calibrations.find(
    (item) =>
      item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
  );
  if (!existing) {
    throw new Error(
      "Two source points solve scale only. Register source origin and orientation with guided tracing first."
    );
  }
  const analysis = analyzePointScale({
    first: input.first,
    second: input.second,
    printedMm: input.printedMm,
    pageWidthPx: input.pageWidthPx,
    pageHeightPx: input.pageHeightPx,
    calibration: existing,
  });
  if (!analysis.valid) throw new Error(analysis.message);
  const oldStart = projectReviewSourcePointToPlan(existing, input.first);
  const oldEnd = projectReviewSourcePointToPlan(existing, input.second);
  if (!oldStart || !oldEnd) {
    throw new Error(
      "The existing source registration cannot inverse-project these points."
    );
  }
  const oldDistance = Math.hypot(
    oldEnd.xMm - oldStart.xMm,
    oldEnd.zMm - oldStart.zMm
  );
  if (oldDistance < 1) {
    throw new Error("The registered points are too close together.");
  }
  const factor = Math.round(input.printedMm) / oldDistance;
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("The requested scale is invalid.");
  }
  rescaleFloorHorizontalGeometry(floor, oldStart, factor);
  next.verification = {
    tier: "needs_review",
    criticalIssueIds: [...next.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}

/**
 * Registers an uncalibrated source by asking the reviewer to map two source
 * endpoints to two existing plan vertices. This supplies scale, rotation and
 * translation explicitly; no coordinate correspondence is inferred.
 */
export function registerPointScaleCalibration(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  first: ReviewSourcePoint;
  second: ReviewSourcePoint;
  firstVertexId: string;
  secondVertexId: string;
  printedMm: number;
}): FloorPlanDocumentV2 {
  const next = structuredClone(input.document);
  const floor = next.floors.find((item) => item.id === input.floorId);
  if (!floor) throw new Error("The selected floor is no longer available.");
  if (
    floor.calibrations.some(
      (item) =>
        item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
    )
  ) {
    throw new Error("This source page is already registered; update its scale instead.");
  }
  if (!next.sources.some((source) => source.id === input.sourceId)) {
    throw new Error("The selected source is no longer part of this floor plan.");
  }
  const analysis = analyzePointScale({
    first: input.first,
    second: input.second,
    printedMm: input.printedMm,
    pageWidthPx: input.pageWidthPx,
    pageHeightPx: input.pageHeightPx,
  });
  if (!analysis.measurementValid) throw new Error(analysis.message);
  if (input.firstVertexId === input.secondVertexId) {
    throw new Error("Choose two different plan vertices for the dimension endpoints.");
  }
  const firstVertex = floor.vertices.find((item) => item.id === input.firstVertexId);
  const secondVertex = floor.vertices.find((item) => item.id === input.secondVertexId);
  if (!firstVertex || !secondVertex) {
    throw new Error("One of the selected plan vertices is no longer available.");
  }
  const oldDistance = Math.hypot(
    secondVertex.xMm - firstVertex.xMm,
    secondVertex.zMm - firstVertex.zMm
  );
  if (oldDistance < 1) throw new Error("The selected plan vertices are too close together.");
  const factor = Math.round(input.printedMm) / oldDistance;
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("The requested source registration is invalid.");
  }
  const anchor = { xMm: firstVertex.xMm, zMm: firstVertex.zMm };
  rescaleFloorHorizontalGeometry(floor, anchor, factor);
  const registeredFirst = floor.vertices.find(
    (item) => item.id === input.firstVertexId
  )!;
  const registeredSecond = floor.vertices.find(
    (item) => item.id === input.secondVertexId
  )!;
  const usedIds = new Set(floor.calibrations.map((item) => item.id));
  let suffix = 1;
  while (usedIds.has(`consumer-registration-${input.pageNumber}-${suffix}`)) suffix += 1;
  floor.calibrations.push({
    id: `consumer-registration-${input.pageNumber}-${suffix}`,
    sourceId: input.sourceId,
    pageNumber: input.pageNumber,
    imageWidthPx: input.pageWidthPx,
    imageHeightPx: input.pageHeightPx,
    controlPoints: [
      {
        sourcePx: { x: input.first.x, y: input.first.y },
        planMm: { xMm: registeredFirst.xMm, zMm: registeredFirst.zMm },
      },
      {
        sourcePx: { x: input.second.x, y: input.second.y },
        planMm: { xMm: registeredSecond.xMm, zMm: registeredSecond.zMm },
      },
    ],
  });
  next.verification = {
    tier: "needs_review",
    criticalIssueIds: [...next.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}

/**
 * Starts an empty manual trace from a printed source dimension. Because there
 * is no candidate geometry to align yet, the picked dimension becomes the
 * plan x-axis; subsequent source clicks are inverse-projected through this
 * exact registration.
 */
export function registerEmptyPlanScaleCalibration(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  first: ReviewSourcePoint;
  second: ReviewSourcePoint;
  printedMm: number;
}): FloorPlanDocumentV2 {
  const next = structuredClone(input.document);
  const floor = next.floors.find((item) => item.id === input.floorId);
  if (!floor) throw new Error("The selected floor is no longer available.");
  if (floor.vertices.length || floor.walls.length || floor.rooms.length) {
    throw new Error(
      "Existing geometry must be aligned to two matching wall corners."
    );
  }
  if (
    floor.calibrations.some(
      (item) =>
        item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
    )
  ) {
    throw new Error("This source page is already registered.");
  }
  if (!next.sources.some((source) => source.id === input.sourceId)) {
    throw new Error("The selected source is no longer part of this floor plan.");
  }
  const analysis = analyzePointScale({
    first: input.first,
    second: input.second,
    printedMm: input.printedMm,
    pageWidthPx: input.pageWidthPx,
    pageHeightPx: input.pageHeightPx,
  });
  if (!analysis.measurementValid) throw new Error(analysis.message);
  const usedIds = new Set(floor.calibrations.map((item) => item.id));
  let suffix = 1;
  while (usedIds.has(`manual-registration-${input.pageNumber}-${suffix}`)) {
    suffix += 1;
  }
  floor.calibrations.push({
    id: `manual-registration-${input.pageNumber}-${suffix}`,
    sourceId: input.sourceId,
    pageNumber: input.pageNumber,
    imageWidthPx: input.pageWidthPx,
    imageHeightPx: input.pageHeightPx,
    controlPoints: [
      {
        sourcePx: { x: input.first.x, y: input.first.y },
        planMm: { xMm: 0, zMm: 0 },
      },
      {
        sourcePx: { x: input.second.x, y: input.second.y },
        planMm: { xMm: Math.round(input.printedMm), zMm: 0 },
      },
    ],
  });
  next.verification = {
    tier: "needs_review",
    criticalIssueIds: [...next.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}

function nextOrdinalId(document: FloorPlanDocumentV2, prefix: string) {
  const ids = new Set<string>();
  for (const floor of document.floors) {
    for (const collection of [
      floor.vertices,
      floor.walls,
      floor.rooms,
      floor.openings,
      floor.structures,
      floor.annotations,
      floor.dimensions,
    ]) {
      for (const entity of collection) ids.add(entity.id);
    }
  }
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/** Adds one reviewer-traced closed room against an already registered page. */
export function traceRoomFromSourcePolygon(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  points: ReviewSourcePoint[];
  roomName?: string;
  roomType?: string;
  wallThicknessMm?: number;
  at?: string;
}): FloorPlanDocumentV2 {
  if (input.points.length < 3 || input.points.length > 64) {
    throw new Error("Trace between 3 and 64 room corners.");
  }
  const next = structuredClone(input.document);
  const floor = next.floors.find((item) => item.id === input.floorId);
  if (!floor) throw new Error("The selected floor is no longer available.");
  const calibration = floor.calibrations.find(
    (item) =>
      item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
  );
  if (!calibration) {
    throw new Error("Set the drawing scale before tracing rooms.");
  }
  const planPoints = input.points.map((point) => {
    const projected = projectReviewSourcePointToPlan(calibration, point);
    if (!projected) throw new Error("The source registration is invalid.");
    return { xMm: Math.round(projected.xMm), zMm: Math.round(projected.zMm) };
  });
  for (let index = 0; index < planPoints.length; index += 1) {
    const nextIndex = (index + 1) % planPoints.length;
    if (
      Math.hypot(
        planPoints[nextIndex].xMm - planPoints[index].xMm,
        planPoints[nextIndex].zMm - planPoints[index].zMm
      ) < 50
    ) {
      throw new Error("Two room corners are too close together.");
    }
  }
  const at = input.at ?? new Date().toISOString();
  const roomId = nextOrdinalId(next, "room");
  const basis: FloorPlanEvidenceBasisV2 = next.sources.find(
    (source) => source.id === input.sourceId
  )?.kind === "cad"
    ? "vector_traced"
    : "raster_traced";
  const crop = {
    xPx: Math.max(0, Math.floor(Math.min(...input.points.map((point) => point.x)))),
    yPx: Math.max(0, Math.floor(Math.min(...input.points.map((point) => point.y)))),
    widthPx: Math.max(
      1,
      Math.ceil(Math.max(...input.points.map((point) => point.x))) -
        Math.floor(Math.min(...input.points.map((point) => point.x)))
    ),
    heightPx: Math.max(
      1,
      Math.ceil(Math.max(...input.points.map((point) => point.y))) -
        Math.floor(Math.min(...input.points.map((point) => point.y)))
    ),
  };
  const provenance = (note: string): FloorPlanEntityProvenanceV2 => ({
    confidence: 0.95,
    extractionVersion: "admin-guided-tracing-v1",
    evidence: [
      {
        sourceId: input.sourceId,
        basis,
        confidence: 0.95,
        extractorVersion: "admin-guided-tracing-v1",
        pageNumber: input.pageNumber,
        cropPx: crop,
        calibrationId: calibration.id,
        note,
      },
    ],
    reviewHistory: [
      {
        id: `trace-${roomId}-${note.startsWith("Wall") ? "wall" : "entity"}`,
        action: "created" as const,
        reviewerId: "admin-guided-tracing",
        reviewedAt: at,
        note,
      },
    ],
  });
  const vertexIds = planPoints.map((point, index) => {
    const existing = floor.vertices.find(
      (vertex) =>
        Math.hypot(vertex.xMm - point.xMm, vertex.zMm - point.zMm) <= 30
    );
    if (existing) return existing.id;
    const id = nextOrdinalId(next, "vertex");
    floor.vertices.push({
      id,
      ...point,
      provenance: provenance(`Room corner ${index + 1} traced from the source.`),
    });
    return id;
  });
  if (new Set(vertexIds).size !== vertexIds.length) {
    throw new Error("The traced room reuses the same corner more than once.");
  }
  const wallReferences = vertexIds.map((startVertexId, index) => {
    const endVertexId = vertexIds[(index + 1) % vertexIds.length];
    const existing = floor.walls.find(
      (wall) =>
        wall.path.kind === "line" &&
        ((wall.path.startVertexId === startVertexId &&
          wall.path.endVertexId === endVertexId) ||
          (wall.path.startVertexId === endVertexId &&
            wall.path.endVertexId === startVertexId))
    );
    if (existing) {
      if (!existing.adjacentRoomIds.includes(roomId)) {
        existing.adjacentRoomIds.push(roomId);
      }
      return {
        wallId: existing.id,
        direction:
          existing.path.startVertexId === startVertexId
            ? ("forward" as const)
            : ("reverse" as const),
      };
    }
    const id = nextOrdinalId(next, "wall");
    const sourceStart = input.points[index];
    const sourceEnd = input.points[(index + 1) % input.points.length];
    const wallProvenance = provenance(`Wall ${index + 1} traced from the source.`);
    wallProvenance.evidence[0].sourceAnchors = [
      { role: "start" as const, sourcePx: { x: sourceStart.x, y: sourceStart.y } },
      {
        role: "midpoint" as const,
        sourcePx: {
          x: (sourceStart.x + sourceEnd.x) / 2,
          y: (sourceStart.y + sourceEnd.y) / 2,
        },
      },
      { role: "end" as const, sourcePx: { x: sourceEnd.x, y: sourceEnd.y } },
    ];
    floor.walls.push({
      id,
      path: { kind: "line", startVertexId, endVertexId },
      thicknessMm: Math.max(
        50,
        Math.min(1000, Math.round(input.wallThicknessMm ?? 120))
      ),
      classification: "partition",
      adjacentRoomIds: [roomId],
      provenance: wallProvenance,
    });
    return { wallId: id, direction: "forward" as const };
  });
  floor.rooms.push({
    id: roomId,
    name: input.roomName?.trim().slice(0, 120) || `Room ${floor.rooms.length + 1}`,
    roomType: input.roomType?.trim() || "other",
    wallLoops: [{ kind: "outer", walls: wallReferences }],
    provenance: provenance("Closed room boundary traced from the source."),
  });
  next.verification = {
    tier: "needs_review",
    criticalIssueIds: [...next.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}

function openingOperationForKind(
  kind: FloorPlanOpeningKindV2
): FloorPlanOpeningOperationV2 {
  if (kind === "door" || kind === "gate") return "swing";
  if (kind === "open_passage") return "open";
  return "fixed";
}

/** Adds a source-supported opening from two clicks without exposing wall IDs. */
export function traceOpeningFromSourceSpan(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
  first: ReviewSourcePoint;
  second: ReviewSourcePoint;
  kind: FloorPlanOpeningKindV2;
  at?: string;
}): FloorPlanDocumentV2 {
  const analysis = analyzeSourceOpeningSpan(input);
  if (
    !analysis.valid ||
    !analysis.wallId ||
    analysis.offsetMm === null ||
    analysis.widthMm === null ||
    !analysis.sourceStart ||
    !analysis.sourceEnd
  ) {
    throw new Error(analysis.message);
  }
  const openingId = nextOrdinalId(input.document, "opening");
  const at = input.at ?? new Date().toISOString();
  const next = applyConsumerTopologyCorrection({
    document: input.document,
    mutationId: `guided-opening-${openingId}`,
    at,
    operation: {
      kind: "add_opening",
      floorId: input.floorId,
      opening: {
        id: openingId,
        wallId: analysis.wallId,
        kind: input.kind,
        operation: openingOperationForKind(input.kind),
        offsetMm: analysis.offsetMm,
        widthMm: analysis.widthMm,
        hinge:
          input.kind === "door" || input.kind === "gate" ? "unknown" : "none",
        handing: "unknown",
      },
    },
  });
  const floor = next.floors.find((item) => item.id === input.floorId);
  const calibration = floor?.calibrations.find(
    (item) =>
      item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
  );
  const opening = floor?.openings.find((item) => item.id === openingId);
  if (!floor || !calibration || !opening) {
    throw new Error("The opening could not be added to the selected floor.");
  }
  const basis: FloorPlanEvidenceBasisV2 = next.sources.find(
    (source) => source.id === input.sourceId
  )?.kind === "cad"
    ? "vector_traced"
    : "raster_traced";
  const paddingPx = 12;
  const minX = Math.min(analysis.sourceStart.x, analysis.sourceEnd.x);
  const minY = Math.min(analysis.sourceStart.y, analysis.sourceEnd.y);
  const maxX = Math.max(analysis.sourceStart.x, analysis.sourceEnd.x);
  const maxY = Math.max(analysis.sourceStart.y, analysis.sourceEnd.y);
  const cropX = Math.max(0, Math.floor(minX - paddingPx));
  const cropY = Math.max(0, Math.floor(minY - paddingPx));
  const cropMaxX = Math.min(
    calibration.imageWidthPx,
    Math.ceil(maxX + paddingPx)
  );
  const cropMaxY = Math.min(
    calibration.imageHeightPx,
    Math.ceil(maxY + paddingPx)
  );
  opening.provenance = {
    confidence: 0.95,
    extractionVersion: "admin-guided-opening-v1",
    evidence: [
      {
        sourceId: input.sourceId,
        basis,
        confidence: 0.95,
        extractorVersion: "admin-guided-opening-v1",
        pageNumber: input.pageNumber,
        calibrationId: calibration.id,
        cropPx: {
          xPx: cropX,
          yPx: cropY,
          widthPx: Math.max(1, cropMaxX - cropX),
          heightPx: Math.max(1, cropMaxY - cropY),
        },
        sourceAnchors: [
          {
            role: "start",
            sourcePx: {
              x: analysis.sourceStart.x,
              y: analysis.sourceStart.y,
            },
          },
          {
            role: "midpoint",
            sourcePx: {
              x: (analysis.sourceStart.x + analysis.sourceEnd.x) / 2,
              y: (analysis.sourceStart.y + analysis.sourceEnd.y) / 2,
            },
          },
          {
            role: "end",
            sourcePx: {
              x: analysis.sourceEnd.x,
              y: analysis.sourceEnd.y,
            },
          },
        ],
        note: `${input.kind.replace("_", " ")} traced from the source plan.`,
      },
    ],
    reviewHistory: [
      {
        id: `trace-${openingId}`,
        action: "created",
        reviewerId: "admin-guided-tracing",
        reviewedAt: at,
        note: "Opening endpoints selected directly on the source plan.",
      },
    ],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}

export function applyConsumerTopologyCorrection(input: {
  document: FloorPlanDocumentV2;
  operation: FloorPlanTopologyMutationV2;
  mutationId: string;
  at?: string;
}): FloorPlanDocumentV2 {
  const result = applyFloorPlanTopologyMutationV2(
    input.document,
    input.operation,
    {
      mutationId: input.mutationId,
      nextRevisionId: `${input.document.revisionId}:review:${input.mutationId}`,
      actorId: "pending-consumer-review",
      mutatedAt: input.at ?? new Date().toISOString(),
      extractionVersion: "consumer-visual-review-v1",
      note: "Consumer corrected geometry against the private source overlay.",
    }
  );
  const document = result.document;
  document.revisionId = input.document.revisionId;
  if (input.document.parentRevisionId) {
    document.parentRevisionId = input.document.parentRevisionId;
  } else {
    delete document.parentRevisionId;
  }
  document.createdAt = input.document.createdAt;
  document.verification = {
    tier: "needs_review",
    criticalIssueIds: [...input.document.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(document);
  return document;
}

export function applyConsumerOrientation(
  document: FloorPlanDocumentV2,
  transform: FloorPlanAddressTransform
) {
  const next = applyFloorPlanAddressTransformV2(document, transform);
  next.verification = {
    tier: "needs_review",
    criticalIssueIds: [...document.verification.criticalIssueIds],
  };
  compileFloorPlanDocumentV2(next);
  return next;
}
