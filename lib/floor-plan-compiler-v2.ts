import type {
  FloorPlanAnnotationGeometryV2,
  FloorPlanAnnotationV2,
  FloorPlanDimensionV2,
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanFloorV2,
  FloorPlanFloorVerticalEvidenceV2,
  FloorPlanMeasuredPropertyV2,
  FloorPlanOpeningV2,
  FloorPlanPointMmV2,
  FloorPlanPropertyEvidenceV2,
  FloorPlanRoomV2,
  FloorPlanRoomWallLoopV2,
  FloorPlanStructureV2,
  FloorPlanVertexV2,
  FloorPlanWallPathV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import {
  FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS,
  findCanonicalWallIntersectionProblems,
  floorPlanLineSegmentsIntersect,
  floorPlanPointOnLineSegment,
  type FloorPlanValidationCanonicalWallSegment,
} from "@/lib/floor-plan-geometry-validation";

export type FloorPlanValidationSeverityV2 = "error" | "warning";

export type FloorPlanValidationIssueV2 = {
  code: string;
  path: string;
  message: string;
  severity: FloorPlanValidationSeverityV2;
};

export type CompiledFloorPlanWallV2 = {
  id: string;
  path: FloorPlanWallPathV2;
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
  center?: FloorPlanPointMmV2;
  sweepRadians?: number;
  lengthMm: number;
  thicknessMm: number;
  heightMm: number;
  heightEvidence: FloorPlanPropertyEvidenceV2;
  baseOffsetMm: number;
  baseOffsetEvidence: FloorPlanPropertyEvidenceV2;
  classification: FloorPlanWallV2["classification"];
  adjacentRoomIds: string[];
};

export type CompiledFloorPlanRoomWallV2 = {
  wallId: string;
  direction: "forward" | "reverse";
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
};

export type CompiledFloorPlanRoomLoopV2 = {
  kind: "outer" | "hole";
  walls: CompiledFloorPlanRoomWallV2[];
  signedAreaSquareMm: number;
};

export type CompiledFloorPlanRoomV2 = {
  id: string;
  name: string;
  roomType: string;
  wallLoops: CompiledFloorPlanRoomLoopV2[];
  areaSquareMm: number;
};

export type CompiledFloorPlanOpeningV2 = {
  id: string;
  wallId: string;
  kind: FloorPlanOpeningV2["kind"];
  operation: FloorPlanOpeningV2["operation"];
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  heightEvidence: FloorPlanPropertyEvidenceV2;
  sillHeightMm: number;
  sillHeightEvidence: FloorPlanPropertyEvidenceV2;
  bottomMm: number;
  topMm: number;
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
  hinge: FloorPlanOpeningV2["hinge"];
  handing: FloorPlanOpeningV2["handing"];
};

export type CompiledFloorPlanStructureV2 = Omit<
  FloorPlanStructureV2,
  "vertexIds" | "provenance" | "baseOffsetEvidence" | "heightEvidence"
> & {
  points: FloorPlanPointMmV2[];
  baseOffsetEvidence: FloorPlanPropertyEvidenceV2;
  heightEvidence: FloorPlanPropertyEvidenceV2;
};

export type CompiledFloorPlanAnnotationGeometryV2 =
  | { kind: "point"; point: FloorPlanPointMmV2 }
  | { kind: "polygon"; points: FloorPlanPointMmV2[] }
  | {
      kind: "wall_span";
      wallId: string;
      offsetMm: number;
      widthMm: number;
      start: FloorPlanPointMmV2;
      end: FloorPlanPointMmV2;
    };

export type CompiledFloorPlanAnnotationV2 = Omit<
  FloorPlanAnnotationV2,
  "geometry" | "provenance"
> & {
  geometry: CompiledFloorPlanAnnotationGeometryV2;
};

export type CompiledFloorPlanDimensionV2 = Omit<
  FloorPlanDimensionV2,
  "provenance"
> & {
  from: FloorPlanPointMmV2;
  to: FloorPlanPointMmV2;
  actualMm: number;
};

export type CompiledFloorPlanFloorV2 = {
  id: string;
  name: string;
  levelIndex: number;
  elevationMm: number;
  elevationEvidence: FloorPlanPropertyEvidenceV2;
  storeyHeightMm: number;
  storeyHeightEvidence: FloorPlanPropertyEvidenceV2;
  slabThicknessMm: number;
  slabThicknessEvidence: FloorPlanPropertyEvidenceV2;
  defaults: Record<keyof FloorPlanFloorV2["defaults"], {
    valueMm: number;
    evidence: FloorPlanPropertyEvidenceV2;
  }>;
  vertices: Array<Omit<FloorPlanVertexV2, "provenance">>;
  walls: CompiledFloorPlanWallV2[];
  rooms: CompiledFloorPlanRoomV2[];
  openings: CompiledFloorPlanOpeningV2[];
  structures: CompiledFloorPlanStructureV2[];
  annotations: CompiledFloorPlanAnnotationV2[];
  dimensions: CompiledFloorPlanDimensionV2[];
};

export type CompiledFloorPlanSceneV2 = {
  schemaVersion: 2;
  units: "mm";
  documentId: string;
  revisionId: string;
  verificationTier: FloorPlanDocumentV2["verification"]["tier"];
  geometryHash: string;
  floors: CompiledFloorPlanFloorV2[];
  warnings: FloorPlanValidationIssueV2[];
};

type FloorMaps = {
  vertices: Map<string, FloorPlanVertexV2>;
  walls: Map<string, FloorPlanWallV2>;
  rooms: Map<string, FloorPlanRoomV2>;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONSTRUCTION_BASES = new Set<FloorPlanEvidenceBasisV2>([
  "site_measured",
  "cad",
  "as_built",
]);
const SOURCE_OBSERVED_BASES = new Set<FloorPlanEvidenceBasisV2>([
  "explicit_dimension",
  "vector_traced",
  "raster_traced",
  "site_measured",
  "cad",
  "as_built",
]);
const PROPERTY_EVIDENCE_STATES = new Set<FloorPlanPropertyEvidenceV2>([
  "assumed",
  "source_documented",
  "user_confirmed",
  "site_measured",
]);

function roundDerived(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function addIssue(
  issues: FloorPlanValidationIssueV2[],
  code: string,
  path: string,
  message: string,
  severity: FloorPlanValidationSeverityV2 = "error"
): void {
  issues.push({ code, path, message, severity });
}

function validateId(
  value: string,
  path: string,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (!ID_PATTERN.test(value)) {
    addIssue(issues, "INVALID_ID", path, "IDs must be stable, non-empty ASCII identifiers.");
  }
}

function validateInteger(
  value: number,
  path: string,
  issues: FloorPlanValidationIssueV2[],
  options: { positive?: boolean; nonnegative?: boolean } = {}
): void {
  if (!Number.isSafeInteger(value)) {
    addIssue(issues, "NON_INTEGER_MILLIMETRES", path, "Authored millimetre values must be safe integers.");
    return;
  }
  if (options.positive && value <= 0) {
    addIssue(issues, "NON_POSITIVE_MEASUREMENT", path, "The measurement must be greater than zero.");
  }
  if (options.nonnegative && value < 0) {
    addIssue(issues, "NEGATIVE_MEASUREMENT", path, "The measurement cannot be negative.");
  }
}

function validateFinite(
  value: number,
  path: string,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (!Number.isFinite(value)) {
    addIssue(issues, "NON_FINITE_NUMBER", path, "The value must be finite.");
  }
}

function validateIsoDate(
  value: string,
  path: string,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    addIssue(issues, "INVALID_TIMESTAMP", path, "Expected an ISO-compatible timestamp.");
  }
}

function validateUniqueIds<T extends { id: string }>(
  values: T[],
  path: string,
  issues: FloorPlanValidationIssueV2[]
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    validateId(value.id, `${path}[${index}].id`, issues);
    if (seen.has(value.id)) {
      addIssue(issues, "DUPLICATE_ID", `${path}[${index}].id`, `Duplicate ID: ${value.id}.`);
    }
    seen.add(value.id);
  });
}

/**
 * Canonical entity IDs are document-scoped, even though their geometry and
 * references remain floor-scoped. Downstream editor projections flatten rooms,
 * openings, and structures, while review/provenance tools address every entity
 * by its stable ID. Allowing the same ID on two floors would therefore make a
 * valid document ambiguous after compilation.
 */
function validateGloballyUniqueFloorEntityIds<T extends { id: string }>(
  document: FloorPlanDocumentV2,
  collectionName:
    | "calibrations"
    | "vertices"
    | "walls"
    | "rooms"
    | "openings"
    | "structures"
    | "annotations"
    | "dimensions",
  select: (floor: FloorPlanFloorV2) => T[],
  issues: FloorPlanValidationIssueV2[]
): void {
  const firstPathById = new Map<string, string>();
  const entityName = collectionName === "vertices"
    ? "vertex"
    : collectionName.slice(0, -1);
  document.floors.forEach((floor, floorIndex) => {
    select(floor).forEach((entity, entityIndex) => {
      const path = `floors[${floorIndex}].${collectionName}[${entityIndex}].id`;
      const firstPath = firstPathById.get(entity.id);
      if (firstPath) {
        addIssue(
          issues,
          "DUPLICATE_GLOBAL_ENTITY_ID",
          path,
          `${entityName} ID ${entity.id} is already used at ${firstPath}; canonical entity IDs must be unique across the document.`
        );
      } else {
        firstPathById.set(entity.id, path);
      }
    });
  });
}

function validateProvenance(
  provenance: FloorPlanEntityProvenanceV2,
  path: string,
  sourceIds: Set<string>,
  issues: FloorPlanValidationIssueV2[]
): void {
  validateFinite(provenance.confidence, `${path}.confidence`, issues);
  if (provenance.confidence < 0 || provenance.confidence > 1) {
    addIssue(issues, "INVALID_CONFIDENCE", `${path}.confidence`, "Confidence must be between 0 and 1.");
  }
  if (!provenance.extractionVersion.trim()) {
    addIssue(issues, "MISSING_EXTRACTION_VERSION", `${path}.extractionVersion`, "Extraction version is required.");
  }
  provenance.evidence.forEach((evidence, index) => {
    const evidencePath = `${path}.evidence[${index}]`;
    if (!sourceIds.has(evidence.sourceId)) {
      addIssue(issues, "UNKNOWN_SOURCE", `${evidencePath}.sourceId`, `Unknown source: ${evidence.sourceId}.`);
    }
    validateFinite(evidence.confidence, `${evidencePath}.confidence`, issues);
    if (evidence.confidence < 0 || evidence.confidence > 1) {
      addIssue(issues, "INVALID_CONFIDENCE", `${evidencePath}.confidence`, "Confidence must be between 0 and 1.");
    }
    if (!evidence.extractorVersion.trim()) {
      addIssue(issues, "MISSING_EXTRACTION_VERSION", `${evidencePath}.extractorVersion`, "Extraction version is required.");
    }
    if (evidence.pageNumber !== undefined) {
      validateInteger(evidence.pageNumber, `${evidencePath}.pageNumber`, issues, { positive: true });
    }
    if (evidence.cropPx) {
      validateFinite(evidence.cropPx.xPx, `${evidencePath}.cropPx.xPx`, issues);
      validateFinite(evidence.cropPx.yPx, `${evidencePath}.cropPx.yPx`, issues);
      validateFinite(evidence.cropPx.widthPx, `${evidencePath}.cropPx.widthPx`, issues);
      validateFinite(evidence.cropPx.heightPx, `${evidencePath}.cropPx.heightPx`, issues);
      if (evidence.cropPx.widthPx <= 0 || evidence.cropPx.heightPx <= 0) {
        addIssue(issues, "INVALID_SOURCE_CROP", `${evidencePath}.cropPx`, "Source crops need positive dimensions.");
      }
    }
    if (evidence.calibrationId !== undefined) {
      validateId(evidence.calibrationId, `${evidencePath}.calibrationId`, issues);
    }
    const anchorRoles = new Set<string>();
    evidence.sourceAnchors?.forEach((anchor, anchorIndex) => {
      const anchorPath = `${evidencePath}.sourceAnchors[${anchorIndex}]`;
      if (!["start", "midpoint", "end"].includes(anchor.role)) {
        addIssue(
          issues,
          "INVALID_SOURCE_ANCHOR_ROLE",
          `${anchorPath}.role`,
          "Source anchors must identify the start, midpoint, or end of their owning entity."
        );
      }
      if (anchorRoles.has(anchor.role)) {
        addIssue(
          issues,
          "DUPLICATE_SOURCE_ANCHOR_ROLE",
          `${anchorPath}.role`,
          "A single evidence record cannot repeat a source-anchor role."
        );
      }
      anchorRoles.add(anchor.role);
      validateFinite(anchor.sourcePx.x, `${anchorPath}.sourcePx.x`, issues);
      validateFinite(anchor.sourcePx.y, `${anchorPath}.sourcePx.y`, issues);
    });
    if (evidence.sourceAnchors?.length) {
      if (evidence.pageNumber === undefined) {
        addIssue(
          issues,
          "MISSING_SOURCE_ANCHOR_PAGE",
          `${evidencePath}.pageNumber`,
          "Source anchors must identify their rendered source page."
        );
      }
      if (!evidence.cropPx) {
        addIssue(
          issues,
          "MISSING_SOURCE_ANCHOR_CROP",
          `${evidencePath}.cropPx`,
          "Source anchors must remain auditable inside a source crop."
        );
      }
      if (!evidence.calibrationId) {
        addIssue(
          issues,
          "MISSING_SOURCE_ANCHOR_CALIBRATION",
          `${evidencePath}.calibrationId`,
          "Source anchors must identify the registration used for residual checks."
        );
      }
    }
  });
  validateUniqueIds(provenance.reviewHistory, `${path}.reviewHistory`, issues);
  provenance.reviewHistory.forEach((review, index) => {
    if (!review.reviewerId.trim()) {
      addIssue(issues, "MISSING_REVIEWER", `${path}.reviewHistory[${index}].reviewerId`, "Reviewer ID is required.");
    }
    validateIsoDate(review.reviewedAt, `${path}.reviewHistory[${index}].reviewedAt`, issues);
  });
}

function validateMeasuredProperty(
  property: FloorPlanMeasuredPropertyV2,
  path: string,
  sourceIds: Set<string>,
  issues: FloorPlanValidationIssueV2[]
): void {
  validateInteger(property.valueMm, `${path}.valueMm`, issues, { positive: true });
  if (!PROPERTY_EVIDENCE_STATES.has(property.evidence)) {
    addIssue(
      issues,
      "INVALID_PROPERTY_EVIDENCE",
      `${path}.evidence`,
      "Measured properties need an assumed, source-documented, user-confirmed, or site-measured evidence state."
    );
  }
  validateProvenance(property.provenance, `${path}.provenance`, sourceIds, issues);
}

function validatePropertyEvidence(
  evidence: FloorPlanPropertyEvidenceV2 | undefined,
  path: string,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (evidence !== undefined && !PROPERTY_EVIDENCE_STATES.has(evidence)) {
    addIssue(
      issues,
      "INVALID_PROPERTY_EVIDENCE",
      path,
      "Measured properties need an assumed, source-documented, user-confirmed, or site-measured evidence state."
    );
  }
}

function validateFloorVerticalEvidence(
  floor: FloorPlanFloorV2,
  path: string,
  sourceIds: Set<string>,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (!floor.verticalEvidence) return;
  const records = floor.verticalEvidence as Partial<FloorPlanFloorVerticalEvidenceV2>;
  for (const propertyName of ["elevation", "storeyHeight", "slabThickness"] as const) {
    const record = records[propertyName];
    const propertyPath = `${path}.verticalEvidence.${propertyName}`;
    if (!record || typeof record !== "object") {
      addIssue(
        issues,
        "MISSING_VERTICAL_PROPERTY_EVIDENCE",
        propertyPath,
        `Vertical evidence must include ${propertyName}.`
      );
      continue;
    }
    validatePropertyEvidence(record.evidence, `${propertyPath}.evidence`, issues);
    validateProvenance(record.provenance, `${propertyPath}.provenance`, sourceIds, issues);
  }
}

function resolveFloorVerticalEvidence(
  floor: FloorPlanFloorV2,
  propertyName: keyof FloorPlanFloorVerticalEvidenceV2
): FloorPlanPropertyEvidenceV2 {
  return floor.verticalEvidence?.[propertyName]?.evidence ?? "assumed";
}

function getVertexPoint(vertex: FloorPlanVertexV2): FloorPlanPointMmV2 {
  return { xMm: vertex.xMm, zMm: vertex.zMm };
}

function samePoint(left: FloorPlanPointMmV2, right: FloorPlanPointMmV2): boolean {
  return left.xMm === right.xMm && left.zMm === right.zMm;
}

function distance(left: FloorPlanPointMmV2, right: FloorPlanPointMmV2): number {
  return Math.hypot(right.xMm - left.xMm, right.zMm - left.zMm);
}

function getArcSweepRadians(
  path: Extract<FloorPlanWallPathV2, { kind: "arc" }>,
  vertices: Map<string, FloorPlanVertexV2>
): number | undefined {
  const start = vertices.get(path.startVertexId);
  const end = vertices.get(path.endVertexId);
  const center = vertices.get(path.centerVertexId);
  if (!start || !end || !center) return undefined;

  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (path.clockwise) {
    while (sweep >= 0) sweep -= Math.PI * 2;
  } else {
    while (sweep <= 0) sweep += Math.PI * 2;
  }
  return sweep;
}

function getWallLength(
  wall: FloorPlanWallV2,
  vertices: Map<string, FloorPlanVertexV2>
): number | undefined {
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return undefined;
  if (wall.path.kind === "line") return distance(start, end);
  const center = vertices.get(wall.path.centerVertexId);
  const sweep = getArcSweepRadians(wall.path, vertices);
  if (!center || sweep === undefined) return undefined;
  return distance(start, center) * Math.abs(sweep);
}

function directedWallEndpoints(
  reference: { wallId: string; direction: "forward" | "reverse" },
  maps: FloorMaps
): { startVertexId: string; endVertexId: string } | undefined {
  const wall = maps.walls.get(reference.wallId);
  if (!wall) return undefined;
  return reference.direction === "forward"
    ? { startVertexId: wall.path.startVertexId, endVertexId: wall.path.endVertexId }
    : { startVertexId: wall.path.endVertexId, endVertexId: wall.path.startVertexId };
}

function wallAreaContribution(
  wall: FloorPlanWallV2,
  direction: "forward" | "reverse",
  vertices: Map<string, FloorPlanVertexV2>
): number {
  const authoredStart = vertices.get(wall.path.startVertexId);
  const authoredEnd = vertices.get(wall.path.endVertexId);
  if (!authoredStart || !authoredEnd) return 0;
  const start = direction === "forward" ? authoredStart : authoredEnd;
  const end = direction === "forward" ? authoredEnd : authoredStart;
  if (wall.path.kind === "line") {
    return (start.xMm * end.zMm - end.xMm * start.zMm) / 2;
  }
  const center = vertices.get(wall.path.centerVertexId);
  const authoredSweep = getArcSweepRadians(wall.path, vertices);
  if (!center || authoredSweep === undefined) return 0;
  const sweep = direction === "forward" ? authoredSweep : -authoredSweep;
  const radius = distance(authoredStart, center);
  return (
    radius * radius * sweep +
    center.xMm * (end.zMm - start.zMm) -
    center.zMm * (end.xMm - start.xMm)
  ) / 2;
}

function roomLoopSignedArea(
  loop: FloorPlanRoomWallLoopV2,
  maps: FloorMaps
): number {
  return loop.walls.reduce((total, reference) => {
    const wall = maps.walls.get(reference.wallId);
    return total + (wall ? wallAreaContribution(wall, reference.direction, maps.vertices) : 0);
  }, 0);
}

function polygonSignedArea(points: FloorPlanPointMmV2[]): number {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.xMm * next.zMm - next.xMm * point.zMm;
  }, 0) / 2;
}

function polygonSelfIntersects(points: FloorPlanPointMmV2[]): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (floorPlanLineSegmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
        return true;
      }
    }
  }
  return false;
}

function pointInPolygon(point: FloorPlanPointMmV2, polygon: FloorPlanPointMmV2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (floorPlanPointOnLineSegment(point, previousPoint, currentPoint)) return true;
    const crosses =
      (currentPoint.zMm > point.zMm) !== (previousPoint.zMm > point.zMm) &&
      point.xMm <
        ((previousPoint.xMm - currentPoint.xMm) * (point.zMm - currentPoint.zMm)) /
          (previousPoint.zMm - currentPoint.zMm) +
          currentPoint.xMm;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointAlongWall(
  wall: FloorPlanWallV2,
  offsetMm: number,
  vertices: Map<string, FloorPlanVertexV2>
): FloorPlanPointMmV2 {
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return { xMm: 0, zMm: 0 };
  const length = getWallLength(wall, vertices) ?? 0;
  const ratio = length > 0 ? Math.min(1, Math.max(0, offsetMm / length)) : 0;
  if (wall.path.kind === "line") {
    return {
      xMm: roundDerived(start.xMm + (end.xMm - start.xMm) * ratio),
      zMm: roundDerived(start.zMm + (end.zMm - start.zMm) * ratio),
    };
  }
  const center = vertices.get(wall.path.centerVertexId);
  const sweep = getArcSweepRadians(wall.path, vertices);
  if (!center || sweep === undefined) return getVertexPoint(start);
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const radius = distance(start, center);
  const angle = startAngle + sweep * ratio;
  return {
    xMm: roundDerived(center.xMm + Math.cos(angle) * radius),
    zMm: roundDerived(center.zMm + Math.sin(angle) * radius),
  };
}

function sampleRoomLoop(loop: FloorPlanRoomWallLoopV2, maps: FloorMaps): FloorPlanPointMmV2[] {
  const points: FloorPlanPointMmV2[] = [];
  loop.walls.forEach((reference) => {
    const wall = maps.walls.get(reference.wallId);
    if (!wall) return;
    const length = getWallLength(wall, maps.vertices) ?? 0;
    const authoredSweep = wall.path.kind === "arc" ? getArcSweepRadians(wall.path, maps.vertices) : 0;
    const segmentCount = wall.path.kind === "arc"
      ? Math.max(2, Math.ceil(Math.abs(authoredSweep ?? 0) / (Math.PI / 16)))
      : 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const directedDistance = (length * index) / segmentCount;
      const authoredDistance = reference.direction === "forward"
        ? directedDistance
        : length - directedDistance;
      const point = pointAlongWall(wall, authoredDistance, maps.vertices);
      if (!points.length || !samePoint(points[points.length - 1], point)) points.push(point);
    }
  });
  return points;
}

function wallGeometryKey(wall: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>): string {
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return `invalid:${wall.id}`;
  const startKey = `${start.xMm}:${start.zMm}`;
  const endKey = `${end.xMm}:${end.zMm}`;
  const endpoints = [startKey, endKey].sort().join("|");
  if (wall.path.kind === "line") return `line:${endpoints}`;
  const center = vertices.get(wall.path.centerVertexId);
  const sweep = getArcSweepRadians(wall.path, vertices);
  const length = getWallLength(wall, vertices) ?? 0;
  const midpoint = pointAlongWall(wall, length / 2, vertices);
  return `arc:${center?.xMm}:${center?.zMm}:${endpoints}:${midpoint.xMm}:${midpoint.zMm}:${roundDerived(Math.abs(sweep ?? 0))}`;
}

function resolveOpeningHeight(opening: FloorPlanOpeningV2, floor: FloorPlanFloorV2): number {
  return opening.heightMm ??
    (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
      ? floor.defaults.windowHeight.valueMm
      : floor.defaults.doorHeight.valueMm);
}

function resolveOpeningSill(opening: FloorPlanOpeningV2, floor: FloorPlanFloorV2): number {
  if (opening.sillHeightMm !== undefined) return opening.sillHeightMm;
  return opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
    ? floor.defaults.windowSillHeight.valueMm
    : 0;
}

function validateWallPath(
  wall: FloorPlanWallV2,
  path: string,
  maps: FloorMaps,
  issues: FloorPlanValidationIssueV2[]
): void {
  const start = maps.vertices.get(wall.path.startVertexId);
  const end = maps.vertices.get(wall.path.endVertexId);
  if (!start) addIssue(issues, "UNKNOWN_VERTEX", `${path}.path.startVertexId`, `Unknown vertex: ${wall.path.startVertexId}.`);
  if (!end) addIssue(issues, "UNKNOWN_VERTEX", `${path}.path.endVertexId`, `Unknown vertex: ${wall.path.endVertexId}.`);
  if (start && end && samePoint(start, end)) {
    addIssue(issues, "ZERO_LENGTH_WALL", `${path}.path`, "A wall cannot start and end at the same point.");
  }
  if (wall.path.kind === "arc") {
    const center = maps.vertices.get(wall.path.centerVertexId);
    if (!center) {
      addIssue(issues, "UNKNOWN_VERTEX", `${path}.path.centerVertexId`, `Unknown vertex: ${wall.path.centerVertexId}.`);
    } else if (start && end) {
      const startRadius = distance(start, center);
      const endRadius = distance(end, center);
      if (startRadius === 0 || Math.abs(startRadius - endRadius) > 0.5) {
        addIssue(issues, "INVALID_ARC_RADIUS", `${path}.path`, "Arc endpoints must be equidistant from their centre within 0.5 mm.");
      }
    }
  }
}

function validateRoomLoop(
  room: FloorPlanRoomV2,
  loop: FloorPlanRoomWallLoopV2,
  path: string,
  maps: FloorMaps,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (loop.walls.length < 2) {
    addIssue(issues, "ROOM_LOOP_TOO_SHORT", `${path}.walls`, "A room loop needs at least two directed wall paths.");
    return;
  }
  const seenWalls = new Set<string>();
  loop.walls.forEach((reference, index) => {
    const referencePath = `${path}.walls[${index}]`;
    const wall = maps.walls.get(reference.wallId);
    if (!wall) {
      addIssue(issues, "UNKNOWN_WALL", `${referencePath}.wallId`, `Unknown wall: ${reference.wallId}.`);
      return;
    }
    if (seenWalls.has(reference.wallId)) {
      addIssue(issues, "DUPLICATE_LOOP_WALL", `${referencePath}.wallId`, `Wall ${reference.wallId} appears twice in the same loop.`);
    }
    seenWalls.add(reference.wallId);
    if (!wall.adjacentRoomIds.includes(room.id)) {
      addIssue(issues, "ROOM_WALL_ADJACENCY_MISMATCH", referencePath, `Wall ${reference.wallId} does not name room ${room.id} as a neighbour.`);
    }
    const current = directedWallEndpoints(reference, maps);
    const next = directedWallEndpoints(loop.walls[(index + 1) % loop.walls.length], maps);
    if (current && next && current.endVertexId !== next.startVertexId) {
      addIssue(issues, "OPEN_ROOM_LOOP", referencePath, `Wall ${reference.wallId} does not connect to the next wall by vertex ID.`);
    }
  });
  if (Math.abs(roomLoopSignedArea(loop, maps)) < 0.5) {
    addIssue(issues, "ZERO_AREA_ROOM_LOOP", path, "The room loop has no usable enclosed area.");
  }
  const sampled = sampleRoomLoop(loop, maps);
  if (sampled.length >= 3 && polygonSelfIntersects(sampled)) {
    addIssue(issues, "SELF_INTERSECTING_ROOM_LOOP", path, "The room loop crosses itself.");
  }
}

function validateAnnotationGeometry(
  geometry: FloorPlanAnnotationGeometryV2,
  path: string,
  maps: FloorMaps,
  issues: FloorPlanValidationIssueV2[]
): void {
  if (geometry.kind === "point") {
    if (!maps.vertices.has(geometry.vertexId)) {
      addIssue(issues, "UNKNOWN_VERTEX", `${path}.vertexId`, `Unknown vertex: ${geometry.vertexId}.`);
    }
    return;
  }
  if (geometry.kind === "polygon") {
    if (geometry.vertexIds.length < 3) {
      addIssue(issues, "ANNOTATION_POLYGON_TOO_SHORT", `${path}.vertexIds`, "Annotation polygons need at least three vertices.");
    }
    geometry.vertexIds.forEach((vertexId, index) => {
      if (!maps.vertices.has(vertexId)) {
        addIssue(issues, "UNKNOWN_VERTEX", `${path}.vertexIds[${index}]`, `Unknown vertex: ${vertexId}.`);
      }
    });
    return;
  }
  const wall = maps.walls.get(geometry.wallId);
  if (!wall) {
    addIssue(issues, "UNKNOWN_WALL", `${path}.wallId`, `Unknown wall: ${geometry.wallId}.`);
    return;
  }
  validateInteger(geometry.offsetMm, `${path}.offsetMm`, issues, { nonnegative: true });
  validateInteger(geometry.widthMm, `${path}.widthMm`, issues, { positive: true });
  const wallLength = getWallLength(wall, maps.vertices) ?? 0;
  if (geometry.offsetMm + geometry.widthMm > wallLength + 0.5) {
    addIssue(issues, "WALL_SPAN_OUT_OF_BOUNDS", path, "Annotation wall span extends beyond its wall.");
  }
}

function getCriticalProvenances(floor: FloorPlanFloorV2): FloorPlanEntityProvenanceV2[] {
  return [
    ...floor.vertices.map((item) => item.provenance),
    ...floor.walls.map((item) => item.provenance),
    ...floor.rooms.map((item) => item.provenance),
    ...floor.openings.map((item) => item.provenance),
    ...floor.structures.map((item) => item.provenance),
  ];
}

export function validateFloorPlanDocumentV2(
  document: FloorPlanDocumentV2
): FloorPlanValidationIssueV2[] {
  const issues: FloorPlanValidationIssueV2[] = [];
  if (document.schemaVersion !== 2) addIssue(issues, "INVALID_SCHEMA_VERSION", "schemaVersion", "Expected schema version 2.");
  if (document.units !== "mm") addIssue(issues, "INVALID_UNITS", "units", "FloorPlanDocumentV2 uses millimetres only.");
  validateId(document.id, "id", issues);
  validateId(document.revisionId, "revisionId", issues);
  if (document.parentRevisionId) validateId(document.parentRevisionId, "parentRevisionId", issues);
  validateIsoDate(document.createdAt, "createdAt", issues);

  validateUniqueIds(document.sources, "sources", issues);
  const sourceIds = new Set(document.sources.map((source) => source.id));
  document.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    if (!source.name.trim()) addIssue(issues, "MISSING_SOURCE_NAME", `${path}.name`, "Source name is required.");
    if (!source.mimeType.trim()) addIssue(issues, "MISSING_SOURCE_MIME", `${path}.mimeType`, "Source MIME type is required.");
    if (source.sha256 && !SHA256_PATTERN.test(source.sha256)) {
      addIssue(issues, "INVALID_SOURCE_HASH", `${path}.sha256`, "Source SHA-256 must be 64 lowercase hexadecimal characters.");
    }
    if (source.pageCount !== undefined) validateInteger(source.pageCount, `${path}.pageCount`, issues, { positive: true });
    if (source.widthPx !== undefined) validateInteger(source.widthPx, `${path}.widthPx`, issues, { positive: true });
    if (source.heightPx !== undefined) validateInteger(source.heightPx, `${path}.heightPx`, issues, { positive: true });
  });

  if (!document.floors.length) addIssue(issues, "MISSING_FLOOR", "floors", "A floor-plan document needs at least one floor.");
  validateUniqueIds(document.floors, "floors", issues);
  validateGloballyUniqueFloorEntityIds(document, "calibrations", (floor) => floor.calibrations, issues);
  validateGloballyUniqueFloorEntityIds(document, "vertices", (floor) => floor.vertices, issues);
  validateGloballyUniqueFloorEntityIds(document, "walls", (floor) => floor.walls, issues);
  validateGloballyUniqueFloorEntityIds(document, "rooms", (floor) => floor.rooms, issues);
  validateGloballyUniqueFloorEntityIds(document, "openings", (floor) => floor.openings, issues);
  validateGloballyUniqueFloorEntityIds(document, "structures", (floor) => floor.structures, issues);
  validateGloballyUniqueFloorEntityIds(document, "annotations", (floor) => floor.annotations, issues);
  validateGloballyUniqueFloorEntityIds(document, "dimensions", (floor) => floor.dimensions, issues);
  const levelIndexes = new Set<number>();
  document.floors.forEach((floor, floorIndex) => {
    const path = `floors[${floorIndex}]`;
    if (levelIndexes.has(floor.levelIndex)) {
      addIssue(issues, "DUPLICATE_LEVEL_INDEX", `${path}.levelIndex`, `Duplicate level index: ${floor.levelIndex}.`);
    }
    levelIndexes.add(floor.levelIndex);
    validateInteger(floor.levelIndex, `${path}.levelIndex`, issues);
    validateInteger(floor.elevationMm, `${path}.elevationMm`, issues);
    validateInteger(floor.storeyHeightMm, `${path}.storeyHeightMm`, issues, { positive: true });
    validateInteger(floor.slabThicknessMm, `${path}.slabThicknessMm`, issues, { nonnegative: true });
    validateFloorVerticalEvidence(floor, path, sourceIds, issues);
    validateMeasuredProperty(floor.defaults.wallHeight, `${path}.defaults.wallHeight`, sourceIds, issues);
    validateMeasuredProperty(floor.defaults.doorHeight, `${path}.defaults.doorHeight`, sourceIds, issues);
    validateMeasuredProperty(floor.defaults.windowHeight, `${path}.defaults.windowHeight`, sourceIds, issues);
    validateMeasuredProperty(floor.defaults.windowSillHeight, `${path}.defaults.windowSillHeight`, sourceIds, issues);

    validateUniqueIds(floor.calibrations, `${path}.calibrations`, issues);
    floor.calibrations.forEach((calibration, index) => {
      const calibrationPath = `${path}.calibrations[${index}]`;
      if (!sourceIds.has(calibration.sourceId)) addIssue(issues, "UNKNOWN_SOURCE", `${calibrationPath}.sourceId`, `Unknown source: ${calibration.sourceId}.`);
      validateInteger(calibration.pageNumber, `${calibrationPath}.pageNumber`, issues, { positive: true });
      validateInteger(calibration.imageWidthPx, `${calibrationPath}.imageWidthPx`, issues, { positive: true });
      validateInteger(calibration.imageHeightPx, `${calibrationPath}.imageHeightPx`, issues, { positive: true });
      if (calibration.controlPoints.length < 2) {
        addIssue(issues, "INSUFFICIENT_CALIBRATION", `${calibrationPath}.controlPoints`, "Source registration needs at least two control points.");
      }
      const sourcePointKeys = new Set<string>();
      calibration.controlPoints.forEach((point, pointIndex) => {
        const pointPath = `${calibrationPath}.controlPoints[${pointIndex}]`;
        validateFinite(point.sourcePx.x, `${pointPath}.sourcePx.x`, issues);
        validateFinite(point.sourcePx.y, `${pointPath}.sourcePx.y`, issues);
        validateInteger(point.planMm.xMm, `${pointPath}.planMm.xMm`, issues);
        validateInteger(point.planMm.zMm, `${pointPath}.planMm.zMm`, issues);
        const key = `${point.sourcePx.x}:${point.sourcePx.y}`;
        if (sourcePointKeys.has(key)) addIssue(issues, "DUPLICATE_CALIBRATION_POINT", pointPath, "Calibration source points must be distinct.");
        sourcePointKeys.add(key);
      });
      if (calibration.rmsErrorPx !== undefined) {
        validateFinite(calibration.rmsErrorPx, `${calibrationPath}.rmsErrorPx`, issues);
        if (calibration.rmsErrorPx < 0) addIssue(issues, "NEGATIVE_CALIBRATION_ERROR", `${calibrationPath}.rmsErrorPx`, "Calibration error cannot be negative.");
      }
    });

    validateUniqueIds(floor.vertices, `${path}.vertices`, issues);
    validateUniqueIds(floor.walls, `${path}.walls`, issues);
    validateUniqueIds(floor.rooms, `${path}.rooms`, issues);
    validateUniqueIds(floor.openings, `${path}.openings`, issues);
    validateUniqueIds(floor.structures, `${path}.structures`, issues);
    validateUniqueIds(floor.annotations, `${path}.annotations`, issues);
    validateUniqueIds(floor.dimensions, `${path}.dimensions`, issues);

    const maps: FloorMaps = {
      vertices: new Map(floor.vertices.map((vertex) => [vertex.id, vertex])),
      walls: new Map(floor.walls.map((wall) => [wall.id, wall])),
      rooms: new Map(floor.rooms.map((room) => [room.id, room])),
    };

    const positions = new Map<string, string>();
    floor.vertices.forEach((vertex, index) => {
      const vertexPath = `${path}.vertices[${index}]`;
      validateInteger(vertex.xMm, `${vertexPath}.xMm`, issues);
      validateInteger(vertex.zMm, `${vertexPath}.zMm`, issues);
      validateProvenance(vertex.provenance, `${vertexPath}.provenance`, sourceIds, issues);
      const key = `${vertex.xMm}:${vertex.zMm}`;
      const existing = positions.get(key);
      if (existing) addIssue(issues, "DUPLICATE_VERTEX_POSITION", vertexPath, `Vertices ${existing} and ${vertex.id} occupy the same canonical point.`);
      positions.set(key, vertex.id);
    });

    const wallKeys = new Map<string, string>();
    floor.walls.forEach((wall, index) => {
      const wallPath = `${path}.walls[${index}]`;
      validateWallPath(wall, wallPath, maps, issues);
      validateInteger(wall.thicknessMm, `${wallPath}.thicknessMm`, issues, { positive: true });
      if (wall.heightMm !== undefined) validateInteger(wall.heightMm, `${wallPath}.heightMm`, issues, { positive: true });
      validatePropertyEvidence(wall.heightEvidence, `${wallPath}.heightEvidence`, issues);
      if (wall.heightMm === undefined && wall.heightEvidence !== undefined) {
        addIssue(
          issues,
          "ORPHANED_PROPERTY_EVIDENCE",
          `${wallPath}.heightEvidence`,
          "Wall-height evidence requires a wall-specific height value."
        );
      }
      if (wall.baseOffsetMm !== undefined) validateInteger(wall.baseOffsetMm, `${wallPath}.baseOffsetMm`, issues, { nonnegative: true });
      validatePropertyEvidence(
        wall.baseOffsetEvidence,
        `${wallPath}.baseOffsetEvidence`,
        issues
      );
      if (wall.adjacentRoomIds.length > 2 || new Set(wall.adjacentRoomIds).size !== wall.adjacentRoomIds.length) {
        addIssue(issues, "INVALID_WALL_ADJACENCY", `${wallPath}.adjacentRoomIds`, "A wall may name at most two unique adjacent rooms.");
      }
      wall.adjacentRoomIds.forEach((roomId, roomIndex) => {
        if (!maps.rooms.has(roomId)) addIssue(issues, "UNKNOWN_ROOM", `${wallPath}.adjacentRoomIds[${roomIndex}]`, `Unknown room: ${roomId}.`);
      });
      validateProvenance(wall.provenance, `${wallPath}.provenance`, sourceIds, issues);
      const key = wallGeometryKey(wall, maps.vertices);
      const duplicate = wallKeys.get(key);
      if (duplicate) addIssue(issues, "DUPLICATE_WALL_GEOMETRY", wallPath, `Walls ${duplicate} and ${wall.id} duplicate the same canonical path.`);
      wallKeys.set(key, wall.id);
    });

    const lineWallSegments: FloorPlanValidationCanonicalWallSegment[] = [];
    floor.walls.forEach((wall, wallIndex) => {
      if (wall.path.kind !== "line") return;
      const start = maps.vertices.get(wall.path.startVertexId);
      const end = maps.vertices.get(wall.path.endVertexId);
      if (!start || !end) return;
      lineWallSegments.push({
        wallIndex,
        start,
        end,
        startVertexId: wall.path.startVertexId,
        endVertexId: wall.path.endVertexId,
      });
    });
    if (lineWallSegments.length > FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxLineWallsPerFloor) {
      addIssue(
        issues,
        "FLOOR_WALL_LIMIT_EXCEEDED",
        `${path}.walls`,
        `A floor may contain at most ${FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxLineWallsPerFloor} line walls.`
      );
    } else {
      const intersections = findCanonicalWallIntersectionProblems(lineWallSegments);
      if (intersections.budgetExceeded) {
        addIssue(
          issues,
          "GEOMETRY_VALIDATION_WORK_BUDGET_EXCEEDED",
          `${path}.walls`,
          `Wall intersection validation exceeded ${FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxIntersectionPairChecks} indexed pair checks.`
        );
      } else {
        intersections.problems.forEach(({ firstWallIndex, secondWallIndex, kind }) => {
          addIssue(
            issues,
            kind === "overlapping" ? "OVERLAPPING_WALL_PATHS" : "CROSSING_WALL_PATHS",
            `${path}.walls[${secondWallIndex}]`,
            `Wall ${floor.walls[secondWallIndex].id} intersects wall ${floor.walls[firstWallIndex].id} without a shared canonical endpoint.`
          );
        });
      }
    }

    const roomsByWall = new Map<string, Set<string>>();
    floor.rooms.forEach((room, index) => {
      const roomPath = `${path}.rooms[${index}]`;
      if (!room.name.trim()) addIssue(issues, "MISSING_ROOM_NAME", `${roomPath}.name`, "Room name is required.");
      if (!room.roomType.trim()) addIssue(issues, "MISSING_ROOM_TYPE", `${roomPath}.roomType`, "Room type is required.");
      validateProvenance(room.provenance, `${roomPath}.provenance`, sourceIds, issues);
      const outerLoops = room.wallLoops.filter((loop) => loop.kind === "outer");
      if (outerLoops.length !== 1) addIssue(issues, "INVALID_OUTER_LOOP_COUNT", `${roomPath}.wallLoops`, "Every room needs exactly one outer wall loop.");
      room.wallLoops.forEach((loop, loopIndex) => {
        validateRoomLoop(room, loop, `${roomPath}.wallLoops[${loopIndex}]`, maps, issues);
        loop.walls.forEach((reference) => {
          const memberships = roomsByWall.get(reference.wallId) ?? new Set<string>();
          memberships.add(room.id);
          roomsByWall.set(reference.wallId, memberships);
        });
      });
      const outerPolygon = outerLoops[0] ? sampleRoomLoop(outerLoops[0], maps) : [];
      room.wallLoops
        .filter((loop) => loop.kind === "hole")
        .forEach((loop, loopIndex) => {
          const hole = sampleRoomLoop(loop, maps);
          if (
            outerPolygon.length >= 3 &&
            hole.some((point) => !pointInPolygon(point, outerPolygon))
          ) {
            addIssue(
              issues,
              "ROOM_HOLE_OUTSIDE_OUTER_LOOP",
              `${roomPath}.wallLoops[${loopIndex}]`,
              "Every room-hole vertex must lie inside the room's outer loop."
            );
          }
        });
      const outerArea = outerLoops.reduce((total, loop) => total + Math.abs(roomLoopSignedArea(loop, maps)), 0);
      const holeArea = room.wallLoops
        .filter((loop) => loop.kind === "hole")
        .reduce((total, loop) => total + Math.abs(roomLoopSignedArea(loop, maps)), 0);
      if (holeArea >= outerArea) addIssue(issues, "INVALID_ROOM_HOLES", `${roomPath}.wallLoops`, "Room holes must be smaller than the outer boundary.");
    });
    floor.walls.forEach((wall, index) => {
      const memberships = roomsByWall.get(wall.id) ?? new Set<string>();
      if ([...memberships].sort().join("|") !== [...wall.adjacentRoomIds].sort().join("|")) {
        addIssue(issues, "WALL_ROOM_MEMBERSHIP_MISMATCH", `${path}.walls[${index}].adjacentRoomIds`, "Wall adjacency must exactly match the rooms whose loops reference it.");
      }
    });

    const openingIntervals = new Map<string, Array<{ id: string; start: number; end: number }>>();
    floor.openings.forEach((opening, index) => {
      const openingPath = `${path}.openings[${index}]`;
      const wall = maps.walls.get(opening.wallId);
      if (!wall) addIssue(issues, "UNKNOWN_WALL", `${openingPath}.wallId`, `Unknown wall: ${opening.wallId}.`);
      validateInteger(opening.offsetMm, `${openingPath}.offsetMm`, issues, { nonnegative: true });
      validateInteger(opening.widthMm, `${openingPath}.widthMm`, issues, { positive: true });
      if (opening.heightMm !== undefined) validateInteger(opening.heightMm, `${openingPath}.heightMm`, issues, { positive: true });
      if (opening.sillHeightMm !== undefined) validateInteger(opening.sillHeightMm, `${openingPath}.sillHeightMm`, issues, { nonnegative: true });
      validatePropertyEvidence(opening.heightEvidence, `${openingPath}.heightEvidence`, issues);
      validatePropertyEvidence(opening.sillHeightEvidence, `${openingPath}.sillHeightEvidence`, issues);
      if (opening.heightMm === undefined && opening.heightEvidence !== undefined) {
        addIssue(issues, "ORPHANED_PROPERTY_EVIDENCE", `${openingPath}.heightEvidence`, "Opening-height evidence requires an opening-specific height value.");
      }
      if (opening.sillHeightMm === undefined && opening.sillHeightEvidence !== undefined) {
        addIssue(issues, "ORPHANED_PROPERTY_EVIDENCE", `${openingPath}.sillHeightEvidence`, "Sill-height evidence requires an opening-specific sill value.");
      }
      validateProvenance(opening.provenance, `${openingPath}.provenance`, sourceIds, issues);
      if (opening.kind === "open_passage" && opening.operation !== "open") addIssue(issues, "INVALID_OPENING_OPERATION", `${openingPath}.operation`, "Open passages must use the open operation.");
      if (["window", "vent", "louvre"].includes(opening.kind) && opening.operation !== "fixed") addIssue(issues, "INVALID_OPENING_OPERATION", `${openingPath}.operation`, "Windows, vents and louvres must use the fixed operation.");
      if (["swing", "sliding", "folding"].includes(opening.operation) && !["door", "gate"].includes(opening.kind)) addIssue(issues, "INVALID_OPENING_OPERATION", `${openingPath}.operation`, "Moving door operations require a door or gate opening.");
      if (wall) {
        const wallLength = getWallLength(wall, maps.vertices) ?? 0;
        if (opening.offsetMm + opening.widthMm > wallLength + 0.5) addIssue(issues, "OPENING_OUT_OF_BOUNDS", openingPath, "Opening extends beyond its host wall.");
        const wallHeight = wall.heightMm ?? floor.defaults.wallHeight.valueMm;
        const openingTop = resolveOpeningSill(opening, floor) + resolveOpeningHeight(opening, floor);
        if (openingTop > wallHeight) addIssue(issues, "OPENING_ABOVE_WALL", openingPath, "Opening sill and height exceed the host wall height.");
      }
      const intervals = openingIntervals.get(opening.wallId) ?? [];
      const start = opening.offsetMm;
      const end = opening.offsetMm + opening.widthMm;
      const overlap = intervals.find((interval) => Math.min(end, interval.end) - Math.max(start, interval.start) > 0);
      if (overlap) addIssue(issues, "OVERLAPPING_OPENINGS", openingPath, `Opening overlaps ${overlap.id} on wall ${opening.wallId}.`);
      intervals.push({ id: opening.id, start, end });
      openingIntervals.set(opening.wallId, intervals);
    });

    floor.structures.forEach((structure, index) => {
      const structurePath = `${path}.structures[${index}]`;
      if (structure.vertexIds.length < 3 || new Set(structure.vertexIds).size !== structure.vertexIds.length) {
        addIssue(issues, "INVALID_STRUCTURE_POLYGON", `${structurePath}.vertexIds`, "A structure needs at least three unique vertices.");
      }
      const points = structure.vertexIds.flatMap((vertexId, vertexIndex) => {
        const vertex = maps.vertices.get(vertexId);
        if (!vertex) {
          addIssue(issues, "UNKNOWN_VERTEX", `${structurePath}.vertexIds[${vertexIndex}]`, `Unknown vertex: ${vertexId}.`);
          return [];
        }
        return [getVertexPoint(vertex)];
      });
      if (points.length >= 3 && (Math.abs(polygonSignedArea(points)) < 0.5 || polygonSelfIntersects(points))) {
        addIssue(issues, "INVALID_STRUCTURE_POLYGON", `${structurePath}.vertexIds`, "Structure polygon must enclose a non-self-intersecting area.");
      }
      validateInteger(structure.baseOffsetMm, `${structurePath}.baseOffsetMm`, issues, { nonnegative: true });
      validateInteger(structure.heightMm, `${structurePath}.heightMm`, issues, { positive: true });
      validatePropertyEvidence(
        structure.baseOffsetEvidence,
        `${structurePath}.baseOffsetEvidence`,
        issues
      );
      validatePropertyEvidence(
        structure.heightEvidence,
        `${structurePath}.heightEvidence`,
        issues
      );
      validateProvenance(structure.provenance, `${structurePath}.provenance`, sourceIds, issues);
    });

    floor.annotations.forEach((annotation, index) => {
      const annotationPath = `${path}.annotations[${index}]`;
      if (!annotation.text.trim()) addIssue(issues, "EMPTY_ANNOTATION", `${annotationPath}.text`, "Annotation text is required.");
      validateAnnotationGeometry(annotation.geometry, `${annotationPath}.geometry`, maps, issues);
      validateProvenance(annotation.provenance, `${annotationPath}.provenance`, sourceIds, issues);
    });

    floor.dimensions.forEach((dimension, index) => {
      const dimensionPath = `${path}.dimensions[${index}]`;
      const from = maps.vertices.get(dimension.fromVertexId);
      const to = maps.vertices.get(dimension.toVertexId);
      if (!from) addIssue(issues, "UNKNOWN_VERTEX", `${dimensionPath}.fromVertexId`, `Unknown vertex: ${dimension.fromVertexId}.`);
      if (!to) addIssue(issues, "UNKNOWN_VERTEX", `${dimensionPath}.toVertexId`, `Unknown vertex: ${dimension.toVertexId}.`);
      validateInteger(dimension.measuredMm, `${dimensionPath}.measuredMm`, issues, { positive: true });
      validateProvenance(dimension.provenance, `${dimensionPath}.provenance`, sourceIds, issues);
      if (from && to) {
        const actual = dimension.axis === "horizontal"
          ? Math.abs(to.xMm - from.xMm)
          : dimension.axis === "vertical"
            ? Math.abs(to.zMm - from.zMm)
            : distance(from, to);
        if (Math.abs(actual - dimension.measuredMm) > 0.5) {
          addIssue(issues, "DIMENSION_MISMATCH", dimensionPath, `Authored geometry measures ${roundDerived(actual)} mm, not ${dimension.measuredMm} mm.`);
        }
      }
    });

    for (const [name, property] of Object.entries(floor.defaults)) {
      if (property.evidence === "assumed") {
        addIssue(issues, "ASSUMED_3D_PROPERTY", `${path}.defaults.${name}`, "This 3D property is assumed and must remain visibly labelled as such.", document.verification.tier === "construction_verified" ? "error" : "warning");
      }
      if (
        document.verification.tier === "construction_verified" &&
        (property.evidence === "assumed" || property.evidence === "user_confirmed")
      ) {
        addIssue(
          issues,
          "UNVERIFIED_CONSTRUCTION_PROPERTY",
          `${path}.defaults.${name}.evidence`,
          "Construction-verified heights require source-documented construction evidence or a site measurement."
        );
      }
      if (
        document.verification.tier === "construction_verified" &&
        !property.provenance.evidence.some((evidence) =>
          CONSTRUCTION_BASES.has(evidence.basis)
        )
      ) {
        addIssue(
          issues,
          "MISSING_CONSTRUCTION_EVIDENCE",
          `${path}.defaults.${name}.provenance`,
          "Construction-verified height defaults require CAD, as-built or site-measured provenance."
        );
      }
    }
    for (const [name, evidence] of [
      ["elevation", resolveFloorVerticalEvidence(floor, "elevation")],
      ["storeyHeight", resolveFloorVerticalEvidence(floor, "storeyHeight")],
      ["slabThickness", resolveFloorVerticalEvidence(floor, "slabThickness")],
    ] as const) {
      const label =
        name === "elevation"
          ? "floor elevation"
          : name === "storeyHeight"
            ? "storey height"
            : "slab thickness";
      if (evidence === "assumed") {
        addIssue(
          issues,
          "ASSUMED_3D_PROPERTY",
          `${path}.verticalEvidence.${name}`,
          `The ${label} is assumed and must remain visibly labelled as such.`,
          document.verification.tier === "construction_verified" ? "error" : "warning"
        );
      }
      if (
        document.verification.tier === "construction_verified" &&
        (evidence === "assumed" || evidence === "user_confirmed")
      ) {
        addIssue(
          issues,
          "UNVERIFIED_CONSTRUCTION_PROPERTY",
          `${path}.verticalEvidence.${name}.evidence`,
          `Construction-verified ${label} values require source-documented construction evidence or a site measurement.`
        );
      }
      if (
        document.verification.tier === "construction_verified" &&
        !floor.verticalEvidence?.[name]?.provenance.evidence.some((entry) =>
          CONSTRUCTION_BASES.has(entry.basis)
        )
      ) {
        addIssue(
          issues,
          "MISSING_CONSTRUCTION_EVIDENCE",
          `${path}.verticalEvidence.${name}.provenance`,
          `Construction-verified ${label} values require CAD, as-built or site-measured provenance.`
        );
      }
    }
    if (document.verification.tier === "construction_verified") {
      floor.walls.forEach((wall, wallIndex) => {
        const evidence = wall.heightMm === undefined
          ? floor.defaults.wallHeight.evidence
          : wall.heightEvidence ?? "assumed";
        if (evidence === "assumed" || evidence === "user_confirmed") {
          addIssue(
            issues,
            "UNVERIFIED_CONSTRUCTION_PROPERTY",
            `${path}.walls[${wallIndex}].heightEvidence`,
            "Construction-verified wall heights require construction or site-measured evidence."
          );
        }
        const baseOffsetEvidence = wall.baseOffsetEvidence ?? "assumed";
        if (
          baseOffsetEvidence === "assumed" ||
          baseOffsetEvidence === "user_confirmed"
        ) {
          addIssue(
            issues,
            "UNVERIFIED_CONSTRUCTION_PROPERTY",
            `${path}.walls[${wallIndex}].baseOffsetEvidence`,
            "Construction-verified wall base offsets require construction or site-measured evidence."
          );
        }
      });
      floor.openings.forEach((opening, openingIndex) => {
        const heightEvidence = opening.heightMm === undefined
          ? (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
              ? floor.defaults.windowHeight.evidence
              : floor.defaults.doorHeight.evidence)
          : opening.heightEvidence ?? "assumed";
        const sillEvidence = opening.sillHeightMm === undefined
          ? floor.defaults.windowSillHeight.evidence
          : opening.sillHeightEvidence ?? "assumed";
        if (heightEvidence === "assumed" || heightEvidence === "user_confirmed") {
          addIssue(
            issues,
            "UNVERIFIED_CONSTRUCTION_PROPERTY",
            `${path}.openings[${openingIndex}].heightEvidence`,
            "Construction-verified opening heights require construction or site-measured evidence."
          );
        }
        if (
          (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre") &&
          (sillEvidence === "assumed" || sillEvidence === "user_confirmed")
        ) {
          addIssue(
            issues,
            "UNVERIFIED_CONSTRUCTION_PROPERTY",
            `${path}.openings[${openingIndex}].sillHeightEvidence`,
            "Construction-verified sill heights require construction or site-measured evidence."
          );
        }
      });
      floor.structures.forEach((structure, structureIndex) => {
        for (const [propertyName, evidence] of [
          [
            "baseOffsetEvidence",
            structure.baseOffsetEvidence ?? "assumed",
          ],
          [
            "heightEvidence",
            structure.heightEvidence ?? "assumed",
          ],
        ] as const) {
          if (evidence === "assumed" || evidence === "user_confirmed") {
            addIssue(
              issues,
              "UNVERIFIED_CONSTRUCTION_PROPERTY",
              `${path}.structures[${structureIndex}].${propertyName}`,
              "Construction-verified structure offsets and heights require construction or site-measured evidence."
            );
          }
        }
      });
    }
  });

  if (document.verification.tier !== "needs_review") {
    if (document.verification.criticalIssueIds.length) addIssue(issues, "UNRESOLVED_CRITICAL_ISSUES", "verification.criticalIssueIds", "Verified documents cannot retain critical review issues.");
    if (!document.verification.approvedBy?.trim()) addIssue(issues, "MISSING_APPROVAL", "verification.approvedBy", "Verified documents require human approval.");
    if (!document.verification.approvedAt) addIssue(issues, "MISSING_APPROVAL", "verification.approvedAt", "Verified documents require an approval timestamp.");
    else validateIsoDate(document.verification.approvedAt, "verification.approvedAt", issues);
    document.floors.forEach((floor, floorIndex) => {
      const floorPath = `floors[${floorIndex}]`;
      if (!floor.vertices.length || !floor.walls.length || !floor.rooms.length) {
        addIssue(
          issues,
          "EMPTY_VERIFIED_GEOMETRY",
          floorPath,
          "A verified floor must contain canonical vertices, walls, and at least one enclosed room."
        );
      }
      if (!floor.openings.length) {
        addIssue(
          issues,
          "MISSING_VERIFIED_OPENINGS",
          `${floorPath}.openings`,
          "A verified home plan must account for its entrance and visible openings."
        );
      }
      if (!floor.calibrations.length) {
        addIssue(
          issues,
          "MISSING_SOURCE_REGISTRATION",
          `${floorPath}.calibrations`,
          "Source-verified geometry requires a registered source overlay."
        );
      }
      floor.calibrations.forEach((calibration, calibrationIndex) => {
        if (calibration.rmsErrorPx === undefined || calibration.rmsErrorPx > 1) {
          addIssue(
            issues,
            "SOURCE_REGISTRATION_OUT_OF_TOLERANCE",
            `${floorPath}.calibrations[${calibrationIndex}].rmsErrorPx`,
            "Verified source registration must remain within one source pixel."
          );
        }
      });
    });
    const criticalProvenances = document.floors.flatMap(getCriticalProvenances);
    criticalProvenances.forEach((provenance, index) => {
      if (provenance.confidence < 0.8 || !provenance.evidence.some((evidence) => SOURCE_OBSERVED_BASES.has(evidence.basis))) {
        addIssue(issues, "UNVERIFIED_CRITICAL_ENTITY", `criticalEntities[${index}].provenance`, "Source-verified geometry needs observed evidence and at least 0.8 confidence.");
      }
      if (document.verification.tier === "construction_verified" && !provenance.evidence.some((evidence) => CONSTRUCTION_BASES.has(evidence.basis))) {
        addIssue(issues, "MISSING_CONSTRUCTION_EVIDENCE", `criticalEntities[${index}].provenance`, "Construction-verified geometry needs CAD, as-built or site-measured evidence.");
      }
      provenance.evidence.forEach((evidence, evidenceIndex) => {
        const source = document.sources.find((entry) => entry.id === evidence.sourceId);
        if (
          source &&
          (source.kind === "pdf" || source.kind === "raster") &&
          (evidence.pageNumber === undefined || !evidence.cropPx)
        ) {
          addIssue(
            issues,
            "MISSING_SOURCE_ANCHOR",
            `criticalEntities[${index}].provenance.evidence[${evidenceIndex}]`,
            "Verified PDF/raster evidence needs a source page and pixel crop."
          );
        }
      });
    });
    if (document.verification.tier === "construction_verified" && !document.sources.some((source) => ["cad", "as_built", "site_measurement"].includes(source.kind))) {
      addIssue(issues, "MISSING_CONSTRUCTION_SOURCE", "sources", "Construction verification requires a CAD, as-built or site-measurement source.");
    }
  }

  return issues.sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
}

function compileWall(wall: FloorPlanWallV2, floor: FloorPlanFloorV2, maps: FloorMaps): CompiledFloorPlanWallV2 {
  const start = maps.vertices.get(wall.path.startVertexId)!;
  const end = maps.vertices.get(wall.path.endVertexId)!;
  const center = wall.path.kind === "arc" ? maps.vertices.get(wall.path.centerVertexId)! : undefined;
  return {
    id: wall.id,
    path: { ...wall.path },
    start: getVertexPoint(start),
    end: getVertexPoint(end),
    ...(center ? { center: getVertexPoint(center), sweepRadians: roundDerived(getArcSweepRadians(wall.path as Extract<FloorPlanWallPathV2, { kind: "arc" }>, maps.vertices)!) } : {}),
    lengthMm: roundDerived(getWallLength(wall, maps.vertices)!),
    thicknessMm: wall.thicknessMm,
    heightMm: wall.heightMm ?? floor.defaults.wallHeight.valueMm,
    heightEvidence: wall.heightMm === undefined
      ? floor.defaults.wallHeight.evidence
      : wall.heightEvidence ?? "assumed",
    baseOffsetMm: wall.baseOffsetMm ?? 0,
    baseOffsetEvidence: wall.baseOffsetEvidence ?? "assumed",
    classification: wall.classification,
    adjacentRoomIds: [...wall.adjacentRoomIds].sort(),
  };
}

function compileRoom(room: FloorPlanRoomV2, maps: FloorMaps): CompiledFloorPlanRoomV2 {
  const loops = room.wallLoops.map((loop): CompiledFloorPlanRoomLoopV2 => ({
    kind: loop.kind,
    walls: loop.walls.map((reference) => {
      const endpoints = directedWallEndpoints(reference, maps)!;
      return {
        wallId: reference.wallId,
        direction: reference.direction,
        start: getVertexPoint(maps.vertices.get(endpoints.startVertexId)!),
        end: getVertexPoint(maps.vertices.get(endpoints.endVertexId)!),
      };
    }),
    signedAreaSquareMm: roundDerived(roomLoopSignedArea(loop, maps)),
  }));
  const areaSquareMm = loops.reduce(
    (total, loop) => total + (loop.kind === "outer" ? 1 : -1) * Math.abs(loop.signedAreaSquareMm),
    0
  );
  return {
    id: room.id,
    name: room.name,
    roomType: room.roomType,
    wallLoops: loops,
    areaSquareMm: roundDerived(areaSquareMm),
  };
}

function compileOpening(opening: FloorPlanOpeningV2, floor: FloorPlanFloorV2, maps: FloorMaps): CompiledFloorPlanOpeningV2 {
  const wall = maps.walls.get(opening.wallId)!;
  const heightMm = resolveOpeningHeight(opening, floor);
  const sillHeightMm = resolveOpeningSill(opening, floor);
  return {
    id: opening.id,
    wallId: opening.wallId,
    kind: opening.kind,
    operation: opening.operation,
    offsetMm: opening.offsetMm,
    widthMm: opening.widthMm,
    heightMm,
    heightEvidence: opening.heightMm === undefined
      ? (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
          ? floor.defaults.windowHeight.evidence
          : floor.defaults.doorHeight.evidence)
      : opening.heightEvidence ?? "assumed",
    sillHeightMm,
    sillHeightEvidence: opening.sillHeightMm === undefined
      ? (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre"
          ? floor.defaults.windowSillHeight.evidence
          : "assumed")
      : opening.sillHeightEvidence ?? "assumed",
    bottomMm: sillHeightMm,
    topMm: sillHeightMm + heightMm,
    start: pointAlongWall(wall, opening.offsetMm, maps.vertices),
    end: pointAlongWall(wall, opening.offsetMm + opening.widthMm, maps.vertices),
    hinge: opening.hinge,
    handing: opening.handing,
  };
}

function compileAnnotation(annotation: FloorPlanAnnotationV2, maps: FloorMaps): CompiledFloorPlanAnnotationV2 {
  let geometry: CompiledFloorPlanAnnotationGeometryV2;
  if (annotation.geometry.kind === "point") {
    geometry = { kind: "point", point: getVertexPoint(maps.vertices.get(annotation.geometry.vertexId)!) };
  } else if (annotation.geometry.kind === "polygon") {
    geometry = {
      kind: "polygon",
      points: annotation.geometry.vertexIds.map((vertexId) => getVertexPoint(maps.vertices.get(vertexId)!)),
    };
  } else {
    const wall = maps.walls.get(annotation.geometry.wallId)!;
    geometry = {
      ...annotation.geometry,
      start: pointAlongWall(wall, annotation.geometry.offsetMm, maps.vertices),
      end: pointAlongWall(wall, annotation.geometry.offsetMm + annotation.geometry.widthMm, maps.vertices),
    };
  }
  return {
    id: annotation.id,
    kind: annotation.kind,
    text: annotation.text,
    ...(annotation.configurationId ? { configurationId: annotation.configurationId } : {}),
    geometry,
  };
}

function compileDimension(dimension: FloorPlanDimensionV2, maps: FloorMaps): CompiledFloorPlanDimensionV2 {
  const { provenance: _provenance, ...compiledDimension } = dimension;
  const from = getVertexPoint(maps.vertices.get(dimension.fromVertexId)!);
  const to = getVertexPoint(maps.vertices.get(dimension.toVertexId)!);
  const actualMm = dimension.axis === "horizontal"
    ? Math.abs(to.xMm - from.xMm)
    : dimension.axis === "vertical"
      ? Math.abs(to.zMm - from.zMm)
      : distance(from, to);
  return { ...compiledDimension, from, to, actualMm: roundDerived(actualMm) };
}

function compileFloor(floor: FloorPlanFloorV2): CompiledFloorPlanFloorV2 {
  const maps: FloorMaps = {
    vertices: new Map(floor.vertices.map((vertex) => [vertex.id, vertex])),
    walls: new Map(floor.walls.map((wall) => [wall.id, wall])),
    rooms: new Map(floor.rooms.map((room) => [room.id, room])),
  };
  return {
    id: floor.id,
    name: floor.name,
    levelIndex: floor.levelIndex,
    elevationMm: floor.elevationMm,
    elevationEvidence: resolveFloorVerticalEvidence(floor, "elevation"),
    storeyHeightMm: floor.storeyHeightMm,
    storeyHeightEvidence: resolveFloorVerticalEvidence(floor, "storeyHeight"),
    slabThicknessMm: floor.slabThicknessMm,
    slabThicknessEvidence: resolveFloorVerticalEvidence(floor, "slabThickness"),
    defaults: Object.fromEntries(
      Object.entries(floor.defaults).map(([key, property]) => [
        key,
        { valueMm: property.valueMm, evidence: property.evidence },
      ])
    ) as CompiledFloorPlanFloorV2["defaults"],
    vertices: floor.vertices.slice().sort(compareById).map(({ provenance: _provenance, ...vertex }) => vertex),
    walls: floor.walls.slice().sort(compareById).map((wall) => compileWall(wall, floor, maps)),
    rooms: floor.rooms.slice().sort(compareById).map((room) => compileRoom(room, maps)),
    openings: floor.openings.slice().sort(compareById).map((opening) => compileOpening(opening, floor, maps)),
    structures: floor.structures.slice().sort(compareById).map(
      ({ vertexIds, provenance: _provenance, ...structure }) => ({
        ...structure,
        baseOffsetEvidence:
          structure.baseOffsetEvidence ?? "assumed",
        heightEvidence:
          structure.heightEvidence ?? "assumed",
        points: vertexIds.map((vertexId) =>
          getVertexPoint(maps.vertices.get(vertexId)!)
        ),
      })
    ),
    annotations: floor.annotations.slice().sort(compareById).map((annotation) => compileAnnotation(annotation, maps)),
    dimensions: floor.dimensions.slice().sort(compareById).map((dimension) => compileDimension(dimension, maps)),
  };
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot hash non-finite floor-plan geometry.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}.`);
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256(text: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = Array.from(new TextEncoder().encode(text));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byte = offset + index * 4;
      words[index] = ((bytes[byte] << 24) | (bytes[byte + 1] << 16) | (bytes[byte + 2] << 8) | bytes[byte + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function canonicalizeFloorPlanGeometryV2(document: FloorPlanDocumentV2): string {
  const payload = {
    schemaVersion: 2,
    units: "mm",
    floors: document.floors.slice().sort(compareById).map((floor) => ({
      id: floor.id,
      levelIndex: floor.levelIndex,
      elevationMm: floor.elevationMm,
      storeyHeightMm: floor.storeyHeightMm,
      slabThicknessMm: floor.slabThicknessMm,
      defaults: Object.fromEntries(
        Object.entries(floor.defaults).map(([key, property]) => [key, property.valueMm])
      ),
      vertices: floor.vertices.slice().sort(compareById).map(({ id, xMm, zMm }) => ({ id, xMm, zMm })),
      walls: floor.walls.slice().sort(compareById).map((wall) => ({
        id: wall.id,
        path: wall.path,
        thicknessMm: wall.thicknessMm,
        heightMm: wall.heightMm ?? floor.defaults.wallHeight.valueMm,
        baseOffsetMm: wall.baseOffsetMm ?? 0,
        classification: wall.classification,
        adjacentRoomIds: [...wall.adjacentRoomIds].sort(),
      })),
      rooms: floor.rooms.slice().sort(compareById).map(({ id, roomType, wallLoops }) => ({ id, roomType, wallLoops })),
      openings: floor.openings.slice().sort(compareById).map((opening) => ({
        id: opening.id,
        wallId: opening.wallId,
        kind: opening.kind,
        operation: opening.operation,
        offsetMm: opening.offsetMm,
        widthMm: opening.widthMm,
        heightMm: resolveOpeningHeight(opening, floor),
        sillHeightMm: resolveOpeningSill(opening, floor),
        hinge: opening.hinge,
        handing: opening.handing,
      })),
      structures: floor.structures.slice().sort(compareById).map(({ id, kind, vertexIds, baseOffsetMm, heightMm }) => ({
        id, kind, vertexIds, baseOffsetMm, heightMm,
      })),
    })),
  } satisfies CanonicalJson;
  return stableJson(payload);
}

export function hashFloorPlanGeometryV2(document: FloorPlanDocumentV2): string {
  return sha256(canonicalizeFloorPlanGeometryV2(document));
}

export class FloorPlanDocumentValidationErrorV2 extends Error {
  readonly issues: FloorPlanValidationIssueV2[];

  constructor(issues: FloorPlanValidationIssueV2[]) {
    super(`FloorPlanDocumentV2 failed validation with ${issues.length} error${issues.length === 1 ? "" : "s"}.`);
    this.name = "FloorPlanDocumentValidationErrorV2";
    this.issues = issues;
  }
}

export function compileFloorPlanDocumentV2(document: FloorPlanDocumentV2): CompiledFloorPlanSceneV2 {
  const issues = validateFloorPlanDocumentV2(document);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new FloorPlanDocumentValidationErrorV2(errors);
  return {
    schemaVersion: 2,
    units: "mm",
    documentId: document.id,
    revisionId: document.revisionId,
    verificationTier: document.verification.tier,
    geometryHash: hashFloorPlanGeometryV2(document),
    floors: document.floors.slice().sort(compareById).map(compileFloor),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}
