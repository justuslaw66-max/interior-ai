import {
  validateFloorPlanDocumentV2,
  type FloorPlanValidationIssueV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanAnnotationV2,
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanOpeningV2,
  FloorPlanPointMmV2,
  FloorPlanRoomV2,
  FloorPlanStructureKindV2,
  FloorPlanStructureV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import type {
  FloorPlanLibraryCatalog,
  FloorPlanLibraryLayout,
} from "@/lib/floor-plan-library-schema";
import { resolveFloorPlanRoomIdentities } from "@/lib/floor-plan-room-labels";

const ADAPTER_VERSION = "catalog-v1-to-document-v2-1";
const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const DEFAULT_WALL_THICKNESS_MM = 200;
const DEFAULT_STOREY_HEIGHT_MM = 2800;
const DEFAULT_WALL_HEIGHT_MM = 2600;

type Point = FloorPlanPointMmV2;

type RawRoomEdge = {
  id: string;
  roomId: string;
  start: Point;
  end: Point;
  thicknessMm: number;
};

type WallDraft = {
  id: string;
  start: Point;
  end: Point;
  thicknesses: Set<number>;
  adjacentRoomIds: Set<string>;
};

type RoomWallReference = {
  wallId: string;
  direction: "forward" | "reverse";
  start: Point;
  end: Point;
};

export type CatalogV1FloorPlanAdapterOptions = {
  createdAt?: string;
  documentId?: string;
  revisionId?: string;
};

export type CatalogV1FloorPlanAdapterResult = {
  document: FloorPlanDocumentV2;
  reviewIssues: FloorPlanReviewIssue[];
};

function toMm(metres: number): number {
  return Math.round(metres * 1000);
}

function samePoint(first: Point, second: Point): boolean {
  return first.xMm === second.xMm && first.zMm === second.zMm;
}

function pointKey(point: Point): string {
  return `${point.xMm}:${point.zMm}`;
}

function orderedSegment(first: Point, second: Point): [Point, Point] {
  return first.xMm < second.xMm ||
    (first.xMm === second.xMm && first.zMm <= second.zMm)
    ? [first, second]
    : [second, first];
}

function segmentKey(first: Point, second: Point): string {
  const [start, end] = orderedSegment(first, second);
  return `${pointKey(start)}|${pointKey(end)}`;
}

function cross(start: Point, end: Point, point: Point): number {
  return (
    (end.xMm - start.xMm) * (point.zMm - start.zMm) -
    (end.zMm - start.zMm) * (point.xMm - start.xMm)
  );
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  if (cross(start, end, point) !== 0) return false;
  return (
    point.xMm >= Math.min(start.xMm, end.xMm) &&
    point.xMm <= Math.max(start.xMm, end.xMm) &&
    point.zMm >= Math.min(start.zMm, end.zMm) &&
    point.zMm <= Math.max(start.zMm, end.zMm)
  );
}

function parameterOnSegment(point: Point, start: Point, end: Point): number {
  const dx = end.xMm - start.xMm;
  const dz = end.zMm - start.zMm;
  const denominator = dx * dx + dz * dz;
  return denominator === 0
    ? 0
    : ((point.xMm - start.xMm) * dx + (point.zMm - start.zMm) * dz) /
        denominator;
}

function orthogonalIntersection(first: RawRoomEdge, second: RawRoomEdge): Point | null {
  const firstHorizontal = first.start.zMm === first.end.zMm;
  const firstVertical = first.start.xMm === first.end.xMm;
  const secondHorizontal = second.start.zMm === second.end.zMm;
  const secondVertical = second.start.xMm === second.end.xMm;
  if (
    (!firstHorizontal && !firstVertical) ||
    (!secondHorizontal && !secondVertical) ||
    firstHorizontal === secondHorizontal
  ) {
    return null;
  }
  const horizontal = firstHorizontal ? first : second;
  const vertical = firstVertical ? first : second;
  const point = { xMm: vertical.start.xMm, zMm: horizontal.start.zMm };
  return pointOnSegment(point, first.start, first.end) &&
    pointOnSegment(point, second.start, second.end)
    ? point
    : null;
}

function isInteriorPoint(point: Point, edge: RawRoomEdge): boolean {
  return !samePoint(point, edge.start) && !samePoint(point, edge.end);
}

function uniqueSequentialPoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!result.length || !samePoint(result[result.length - 1], point)) {
      result.push(point);
    }
  }
  if (result.length > 1 && samePoint(result[0], result[result.length - 1])) {
    result.pop();
  }
  return result;
}

function roomPolygonMm(
  room: FloorPlanLibraryLayout["template"]["rooms"][number]
): Point[] {
  if (room.plan_polygon) {
    return uniqueSequentialPoints(
      room.plan_polygon.map((point) => ({
        xMm: toMm(room.x + point.x),
        zMm: toMm(room.z + point.z),
      }))
    );
  }
  const left = toMm(room.x - room.width / 2);
  const right = toMm(room.x + room.width / 2);
  const top = toMm(room.z - room.depth / 2);
  const bottom = toMm(room.z + room.depth / 2);
  return [
    { xMm: left, zMm: top },
    { xMm: right, zMm: top },
    { xMm: right, zMm: bottom },
    { xMm: left, zMm: bottom },
  ];
}

function polygonBounds(points: Point[]) {
  return {
    left: Math.min(...points.map((point) => point.xMm)),
    right: Math.max(...points.map((point) => point.xMm)),
    top: Math.min(...points.map((point) => point.zMm)),
    bottom: Math.max(...points.map((point) => point.zMm)),
  };
}

function polygonCentroid(points: Point[]): Point;
function polygonCentroid(points: Point[]): Point {
  return {
    xMm: Math.round(points.reduce((sum, point) => sum + point.xMm, 0) / points.length),
    zMm: Math.round(points.reduce((sum, point) => sum + point.zMm, 0) / points.length),
  };
}

function sourceIdFor(catalog: FloorPlanLibraryCatalog): string {
  return `legacy:${catalog.floor_plan.plan_id}`;
}

function legacyProvenance(
  sourceId: string,
  pageNumber: number,
  note: string
): FloorPlanEntityProvenanceV2 {
  return {
    confidence: 0.45,
    extractionVersion: ADAPTER_VERSION,
    evidence: [
      {
        sourceId,
        basis: "legacy",
        confidence: 0.45,
        extractorVersion: ADAPTER_VERSION,
        pageNumber,
        note,
      },
    ],
    reviewHistory: [],
  };
}

function structureKind(id: string, label: string): FloorPlanStructureKindV2 {
  const value = `${id} ${label}`.toLowerCase();
  if (value.includes("service") || value.includes("louvre")) return "service_strip";
  if (value.includes("ledge")) return "ledge";
  if (value.includes("shaft")) return "shaft";
  if (value.includes("structural") || value.includes("core")) return "structural_core";
  return "other";
}

function openingDesiredSegment(
  roomPoints: Point[],
  wall: "north" | "south" | "east" | "west",
  offsetMm: number,
  widthMm: number
): [Point, Point] {
  const bounds = polygonBounds(roomPoints);
  const centerX = Math.round((bounds.left + bounds.right) / 2) + offsetMm;
  const centerZ = Math.round((bounds.top + bounds.bottom) / 2) + offsetMm;
  const halfStart = Math.floor(widthMm / 2);
  const halfEnd = widthMm - halfStart;
  if (wall === "north" || wall === "south") {
    const zMm = wall === "north" ? bounds.top : bounds.bottom;
    return [
      { xMm: centerX - halfStart, zMm },
      { xMm: centerX + halfEnd, zMm },
    ];
  }
  const xMm = wall === "west" ? bounds.left : bounds.right;
  return [
    { xMm, zMm: centerZ - halfStart },
    { xMm, zMm: centerZ + halfEnd },
  ];
}

function overlapPiece(
  reference: RoomWallReference,
  desiredStart: Point,
  desiredEnd: Point
): { start: Point; end: Point; scalarStart: number; scalarEnd: number } | null {
  const horizontal = desiredStart.zMm === desiredEnd.zMm;
  if (horizontal) {
    if (
      reference.start.zMm !== desiredStart.zMm ||
      reference.end.zMm !== desiredStart.zMm
    ) {
      return null;
    }
    const scalarStart = Math.max(
      Math.min(reference.start.xMm, reference.end.xMm),
      Math.min(desiredStart.xMm, desiredEnd.xMm)
    );
    const scalarEnd = Math.min(
      Math.max(reference.start.xMm, reference.end.xMm),
      Math.max(desiredStart.xMm, desiredEnd.xMm)
    );
    return scalarEnd > scalarStart
      ? {
          start: { xMm: scalarStart, zMm: desiredStart.zMm },
          end: { xMm: scalarEnd, zMm: desiredStart.zMm },
          scalarStart,
          scalarEnd,
        }
      : null;
  }
  if (
    reference.start.xMm !== desiredStart.xMm ||
    reference.end.xMm !== desiredStart.xMm
  ) {
    return null;
  }
  const scalarStart = Math.max(
    Math.min(reference.start.zMm, reference.end.zMm),
    Math.min(desiredStart.zMm, desiredEnd.zMm)
  );
  const scalarEnd = Math.min(
    Math.max(reference.start.zMm, reference.end.zMm),
    Math.max(desiredStart.zMm, desiredEnd.zMm)
  );
  return scalarEnd > scalarStart
    ? {
        start: { xMm: desiredStart.xMm, zMm: scalarStart },
        end: { xMm: desiredStart.xMm, zMm: scalarEnd },
        scalarStart,
        scalarEnd,
      }
    : null;
}

function openingOffsetOnWall(wall: WallDraft, pieceStart: Point): number {
  return Math.round(
    Math.hypot(pieceStart.xMm - wall.start.xMm, pieceStart.zMm - wall.start.zMm)
  );
}

function validationSeverity(issue: FloorPlanValidationIssueV2): FloorPlanReviewIssue["severity"] {
  return issue.severity === "error" ? "critical" : "warning";
}

/**
 * One-way compatibility adapter from a reviewed schema-v1 catalog record to
 * the canonical schema-v2 model. A catalog tracing is never promoted to a
 * verified tier and never receives an invented source calibration.
 */
export function catalogV1LayoutToFloorPlanDocumentV2(
  catalog: FloorPlanLibraryCatalog,
  layout: FloorPlanLibraryLayout,
  options: CatalogV1FloorPlanAdapterOptions = {}
): CatalogV1FloorPlanAdapterResult {
  const sourceId = sourceIdFor(catalog);
  const reviewIssues: FloorPlanReviewIssue[] = [];
  let reviewSequence = 0;
  const addReviewIssue = (
    code: string,
    message: string,
    severity: FloorPlanReviewIssue["severity"],
    entityIds?: string[]
  ) => {
    reviewSequence += 1;
    const issue: FloorPlanReviewIssue = {
      id: `${layout.layout_id}:legacy-review:${reviewSequence}`,
      code,
      message,
      severity,
      ...(entityIds?.length ? { entityIds } : {}),
      resolved: false,
    };
    reviewIssues.push(issue);
    return issue.id;
  };

  addReviewIssue(
    "LEGACY_SOURCE_REVIEW_REQUIRED",
    "Schema-v1 geometry is a compatibility tracing without registered source-pixel evidence and requires human review.",
    "critical"
  );
  addReviewIssue(
    "LEGACY_CALIBRATION_UNAVAILABLE",
    "No source calibration exists in schema v1; the adapter intentionally did not invent one.",
    "critical"
  );

  const roomPointsById = new Map(
    layout.template.rooms.map((room) => [room.id, roomPolygonMm(room)])
  );
  const rawEdges: RawRoomEdge[] = [];
  layout.template.rooms.forEach((room) => {
    const points = roomPointsById.get(room.id)!;
    points.forEach((start, edgeIndex) => {
      const end = points[(edgeIndex + 1) % points.length];
      if (samePoint(start, end)) {
        addReviewIssue(
          "LEGACY_ZERO_LENGTH_ROOM_EDGE",
          `Room ${room.id} contains an edge that disappears after integer-millimetre conversion.`,
          "critical",
          [room.id]
        );
        return;
      }
      rawEdges.push({
        id: `${room.id}:${edgeIndex}`,
        roomId: room.id,
        start,
        end,
        thicknessMm: toMm(room.wall_thickness ?? DEFAULT_WALL_THICKNESS_MM / 1000),
      });
    });
  });

  const splitPoints = new Map(
    rawEdges.map((edge) => [edge.id, [edge.start, edge.end]])
  );
  for (let firstIndex = 0; firstIndex < rawEdges.length; firstIndex += 1) {
    const first = rawEdges[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < rawEdges.length; secondIndex += 1) {
      const second = rawEdges[secondIndex];
      for (const point of [first.start, first.end]) {
        if (pointOnSegment(point, second.start, second.end)) {
          splitPoints.get(second.id)!.push(point);
        }
      }
      for (const point of [second.start, second.end]) {
        if (pointOnSegment(point, first.start, first.end)) {
          splitPoints.get(first.id)!.push(point);
        }
      }
      const intersection = orthogonalIntersection(first, second);
      if (!intersection) continue;
      splitPoints.get(first.id)!.push(intersection);
      splitPoints.get(second.id)!.push(intersection);
      if (
        first.roomId !== second.roomId &&
        isInteriorPoint(intersection, first) &&
        isInteriorPoint(intersection, second)
      ) {
        addReviewIssue(
          "LEGACY_ROOM_BOUNDARY_INTERSECTION",
          `Room boundaries for ${first.roomId} and ${second.roomId} cross without a schema-v1 topology relationship.`,
          "critical",
          [first.roomId, second.roomId]
        );
      }
    }
  }

  const vertexByPosition = new Map<string, FloorPlanVertexV2>();
  const addVertex = (point: Point, note: string): FloorPlanVertexV2 => {
    const key = pointKey(point);
    const existing = vertexByPosition.get(key);
    if (existing) return existing;
    const vertex: FloorPlanVertexV2 = {
      id: `v:${point.xMm}:${point.zMm}`,
      ...point,
      provenance: legacyProvenance(sourceId, layout.source_page, note),
    };
    vertexByPosition.set(key, vertex);
    return vertex;
  };

  const wallByGeometry = new Map<string, WallDraft>();
  const roomWallReferences = new Map<string, RoomWallReference[]>();
  rawEdges.forEach((edge) => {
    const orderedPoints = [...new Map(
      splitPoints
        .get(edge.id)!
        .filter((point) => pointOnSegment(point, edge.start, edge.end))
        .map((point) => [pointKey(point), point])
    ).values()].sort(
      (first, second) =>
        parameterOnSegment(first, edge.start, edge.end) -
        parameterOnSegment(second, edge.start, edge.end)
    );
    for (let pointIndex = 0; pointIndex < orderedPoints.length - 1; pointIndex += 1) {
      const segmentStart = orderedPoints[pointIndex];
      const segmentEnd = orderedPoints[pointIndex + 1];
      if (samePoint(segmentStart, segmentEnd)) continue;
      const key = segmentKey(segmentStart, segmentEnd);
      let wall = wallByGeometry.get(key);
      if (!wall) {
        const [authoredStart, authoredEnd] = orderedSegment(segmentStart, segmentEnd);
        wall = {
          id: `wall:${wallByGeometry.size + 1}`,
          start: authoredStart,
          end: authoredEnd,
          thicknesses: new Set<number>(),
          adjacentRoomIds: new Set<string>(),
        };
        wallByGeometry.set(key, wall);
      }
      wall.thicknesses.add(edge.thicknessMm);
      wall.adjacentRoomIds.add(edge.roomId);
      const references = roomWallReferences.get(edge.roomId) ?? [];
      references.push({
        wallId: wall.id,
        direction: samePoint(segmentStart, wall.start) ? "forward" : "reverse",
        start: segmentStart,
        end: segmentEnd,
      });
      roomWallReferences.set(edge.roomId, references);
    }
  });

  const wallDraftById = new Map(
    [...wallByGeometry.values()].map((wall) => [wall.id, wall])
  );
  const walls: FloorPlanWallV2[] = [...wallByGeometry.values()].map((wall) => {
    addVertex(wall.start, "Legacy schema-v1 wall endpoint.");
    addVertex(wall.end, "Legacy schema-v1 wall endpoint.");
    const thicknesses = [...wall.thicknesses];
    if (thicknesses.length > 1) {
      addReviewIssue(
        "LEGACY_SHARED_WALL_THICKNESS_CONFLICT",
        `Shared wall ${wall.id} has conflicting schema-v1 room thicknesses; the larger value was retained for review.`,
        "critical",
        [wall.id, ...wall.adjacentRoomIds]
      );
    }
    if (wall.adjacentRoomIds.size > 2) {
      addReviewIssue(
        "LEGACY_WALL_ADJACENCY_AMBIGUOUS",
        `Wall ${wall.id} is claimed by more than two schema-v1 rooms.`,
        "critical",
        [wall.id, ...wall.adjacentRoomIds]
      );
    }
    return {
      id: wall.id,
      path: {
        kind: "line",
        startVertexId: addVertex(wall.start, "Legacy schema-v1 wall endpoint.").id,
        endVertexId: addVertex(wall.end, "Legacy schema-v1 wall endpoint.").id,
      },
      thicknessMm: Math.max(...thicknesses),
      classification: wall.adjacentRoomIds.size > 1 ? "interior" : "exterior",
      adjacentRoomIds: [...wall.adjacentRoomIds],
      provenance: legacyProvenance(
        sourceId,
        layout.source_page,
        "Wall reconstructed from schema-v1 room polygons; classification requires review."
      ),
    };
  });

  const identities = resolveFloorPlanRoomIdentities(layout.template.rooms);
  const rooms: FloorPlanRoomV2[] = layout.template.rooms.map((room, index) => ({
    id: room.id,
    name: identities[index].name,
    roomType: identities[index].roomType,
    wallLoops: [
      {
        kind: "outer",
        walls: (roomWallReferences.get(room.id) ?? []).map((reference) => ({
          wallId: reference.wallId,
          direction: reference.direction,
        })),
      },
    ],
    provenance: legacyProvenance(
      sourceId,
      layout.source_page,
      `Legacy room label: ${identities[index].sourceLabel ?? room.name ?? room.id}.`
    ),
  }));

  const openings: FloorPlanOpeningV2[] = [];
  const addOpening = (input: {
    sourceEntityId: string;
    fromRoomId: string;
    toRoomId?: string;
    wall: "north" | "south" | "east" | "west";
    offsetMm: number;
    widthMm: number;
    kind: FloorPlanOpeningV2["kind"];
    operation: FloorPlanOpeningV2["operation"];
    note: string;
  }) => {
    const roomPoints = roomPointsById.get(input.fromRoomId)!;
    const [desiredStart, desiredEnd] = openingDesiredSegment(
      roomPoints,
      input.wall,
      input.offsetMm,
      input.widthMm
    );
    const desiredScalarStart =
      desiredStart.zMm === desiredEnd.zMm
        ? Math.min(desiredStart.xMm, desiredEnd.xMm)
        : Math.min(desiredStart.zMm, desiredEnd.zMm);
    const desiredScalarEnd =
      desiredStart.zMm === desiredEnd.zMm
        ? Math.max(desiredStart.xMm, desiredEnd.xMm)
        : Math.max(desiredStart.zMm, desiredEnd.zMm);
    const pieces = (roomWallReferences.get(input.fromRoomId) ?? [])
      .flatMap((reference) => {
        const piece = overlapPiece(reference, desiredStart, desiredEnd);
        return piece ? [{ reference, ...piece }] : [];
      })
      .sort((first, second) => first.scalarStart - second.scalarStart);
    let cursor = desiredScalarStart;
    const usablePieces = pieces.filter((piece) => {
      if (piece.scalarEnd <= cursor) return false;
      if (piece.scalarStart > cursor) return false;
      cursor = Math.max(cursor, piece.scalarEnd);
      return true;
    });
    if (!usablePieces.length || cursor < desiredScalarEnd) {
      addReviewIssue(
        "LEGACY_OPENING_HOST_AMBIGUOUS",
        `${input.sourceEntityId} cannot be placed on one continuous canonical wall span without changing its schema-v1 geometry.`,
        "critical",
        [input.sourceEntityId, input.fromRoomId, ...(input.toRoomId ? [input.toRoomId] : [])]
      );
      return;
    }
    if (usablePieces.length > 1) {
      addReviewIssue(
        "LEGACY_OPENING_SPLIT_ACROSS_WALLS",
        `${input.sourceEntityId} crosses ${usablePieces.length} canonical wall segments and was retained as linked spans pending review.`,
        "critical",
        [input.sourceEntityId, ...usablePieces.map((piece) => piece.reference.wallId)]
      );
    }
    usablePieces.forEach((piece, pieceIndex) => {
      const wall = wallDraftById.get(piece.reference.wallId)!;
      if (
        input.toRoomId &&
        (!wall.adjacentRoomIds.has(input.toRoomId) ||
          !wall.adjacentRoomIds.has(input.fromRoomId))
      ) {
        addReviewIssue(
          "LEGACY_OPENING_ADJACENCY_MISMATCH",
          `${input.sourceEntityId} names ${input.toRoomId}, but host wall ${wall.id} does not share that room in the reconstructed topology.`,
          "critical",
          [input.sourceEntityId, wall.id, input.fromRoomId, input.toRoomId]
        );
      }
      const id =
        usablePieces.length === 1
          ? input.sourceEntityId
          : `${input.sourceEntityId}:part:${pieceIndex + 1}`;
      openings.push({
        id,
        wallId: wall.id,
        kind: input.kind,
        operation: input.operation,
        offsetMm: openingOffsetOnWall(wall, piece.start),
        widthMm: piece.scalarEnd - piece.scalarStart,
        hinge: input.kind === "door" ? "unknown" : "none",
        handing: input.kind === "door" ? "unknown" : "none",
        provenance: legacyProvenance(sourceId, layout.source_page, input.note),
      });
    });
  };

  layout.template.doorways.forEach((doorway, index) => {
    const isOpen = doorway.kind === "opening" || doorway.operation === "open";
    addOpening({
      sourceEntityId: `doorway:${index + 1}:${doorway.from_room_id}`,
      fromRoomId: doorway.from_room_id,
      toRoomId: doorway.to_room_id,
      wall: doorway.wall,
      offsetMm: toMm(doorway.offset_meters ?? 0),
      widthMm: toMm(doorway.width_meters ?? 0.9),
      kind: isOpen ? "open_passage" : "door",
      operation: isOpen ? "open" : doorway.operation ?? "swing",
      note: `Legacy schema-v1 doorway; operation ${isOpen ? "open" : doorway.operation ?? "swing"}.`,
    });
  });

  layout.template.windows.forEach((window, index) => {
    if (window.operation !== "fixed") {
      addReviewIssue(
        "LEGACY_WINDOW_OPERATION_UNREPRESENTABLE",
        `Window ${index + 1} uses ${window.operation}, while canonical window leaf details require explicit review.`,
        "critical",
        [`window:${index + 1}:${window.room_id}`]
      );
    }
    addOpening({
      sourceEntityId: `window:${index + 1}:${window.room_id}`,
      fromRoomId: window.room_id,
      wall: window.wall,
      offsetMm: toMm(window.offset_meters ?? 0),
      widthMm: toMm(window.width_meters ?? 1),
      kind: window.kind,
      operation: "fixed",
      note: `Legacy schema-v1 ${window.kind}; source operation ${window.operation}.`,
    });
  });

  const structures: FloorPlanStructureV2[] = layout.template.reference_zones.map(
    (zone) => {
      const left = toMm(zone.x - zone.width / 2);
      const right = toMm(zone.x + zone.width / 2);
      const top = toMm(zone.z - zone.depth / 2);
      const bottom = toMm(zone.z + zone.depth / 2);
      const points = [
        { xMm: left, zMm: top },
        { xMm: right, zMm: top },
        { xMm: right, zMm: bottom },
        { xMm: left, zMm: bottom },
      ];
      return {
        id: zone.id,
        name: zone.label,
        kind: structureKind(zone.id, zone.label),
        vertexIds: points.map((point) =>
          addVertex(point, `Legacy schema-v1 reference zone ${zone.id}.`).id
        ),
        baseOffsetMm: 0,
        heightMm: DEFAULT_WALL_HEIGHT_MM,
        locked: zone.locked,
        provenance: legacyProvenance(
          sourceId,
          layout.source_page,
          "Reference zone converted to a locked canonical structure; height is assumed."
        ),
      };
    }
  );

  const roomLabelAnnotations: FloorPlanAnnotationV2[] = layout.template.rooms.map((room, index) => {
    const identity = identities[index];
    const point = polygonCentroid(roomPointsById.get(room.id)!);
    return {
      id: `source-label:${room.id}`,
      kind: "label" as const,
      text: identity.sourceLabel ?? room.name ?? identity.name,
      geometry: {
        kind: "point" as const,
        vertexId: addVertex(point, `Legacy room-label anchor for ${room.id}.`).id,
      },
      provenance: legacyProvenance(
        sourceId,
        layout.source_page,
        identity.sourceLabel
          ? "Source label retained from schema v1."
          : "Schema-v1 inferred room name retained; no source label was supplied."
      ),
    };
  });

  const catalogAnnotations: FloorPlanAnnotationV2[] = layout.template.annotations.map(
    (annotation) => {
      const sourcePage = annotation.source_page ?? layout.source_page;
      let geometry: FloorPlanAnnotationV2["geometry"];
      if (annotation.geometry.kind === "point") {
        geometry = {
          kind: "point",
          vertexId: addVertex(
            {
              xMm: toMm(annotation.geometry.x),
              zMm: toMm(annotation.geometry.z),
            },
            `Legacy catalog annotation anchor for ${annotation.id}.`
          ).id,
        };
      } else if (annotation.geometry.kind === "polygon") {
        geometry = {
          kind: "polygon",
          vertexIds: annotation.geometry.points.map((point) =>
            addVertex(
              { xMm: toMm(point.x), zMm: toMm(point.z) },
              `Legacy catalog annotation polygon for ${annotation.id}.`
            ).id
          ),
        };
      } else {
        const roomPoints = roomPointsById.get(annotation.geometry.room_id)!;
        const desiredWidthMm = toMm(annotation.geometry.width_meters);
        const [desiredStart, desiredEnd] = openingDesiredSegment(
          roomPoints,
          annotation.geometry.wall,
          toMm(annotation.geometry.offset_meters),
          desiredWidthMm
        );
        const pieces = (roomWallReferences.get(annotation.geometry.room_id) ?? [])
          .flatMap((reference) => {
            const piece = overlapPiece(reference, desiredStart, desiredEnd);
            return piece ? [{ reference, ...piece }] : [];
          })
          .filter((piece) => piece.scalarEnd - piece.scalarStart === desiredWidthMm);
        if (pieces.length === 1) {
          const piece = pieces[0];
          const wall = wallDraftById.get(piece.reference.wallId)!;
          geometry = {
            kind: "wall_span",
            wallId: piece.reference.wallId,
            offsetMm: openingOffsetOnWall(wall, piece.start),
            widthMm: desiredWidthMm,
          };
        } else {
          const point = {
            xMm: Math.round((desiredStart.xMm + desiredEnd.xMm) / 2),
            zMm: Math.round((desiredStart.zMm + desiredEnd.zMm) / 2),
          };
          geometry = {
            kind: "point",
            vertexId: addVertex(
              point,
              `Fallback anchor for unresolved legacy wall-span annotation ${annotation.id}.`
            ).id,
          };
          addReviewIssue(
            "LEGACY_ANNOTATION_HOST_AMBIGUOUS",
            `Annotation ${annotation.id} cannot be registered to one canonical wall span without changing the schema-v1 geometry; its centre point was retained for review.`,
            "critical",
            [annotation.id, annotation.geometry.room_id]
          );
        }
      }

      if (
        annotation.kind === "suggested_room" ||
        annotation.kind === "optional_partition"
      ) {
        addReviewIssue(
          "LEGACY_OPTIONAL_CONFIGURATION_REVIEW_REQUIRED",
          `Source-supported option ${annotation.id} remains an annotation. It must not create physical room or wall geometry unless the consumer explicitly selects and reviews configuration ${annotation.configuration_id}.`,
          "warning",
          [annotation.id]
        );
      }
      return {
        id: `catalog-annotation:${annotation.id}`,
        kind: annotation.kind,
        text: annotation.text,
        geometry,
        ...(annotation.configuration_id
          ? { configurationId: annotation.configuration_id }
          : {}),
        provenance: legacyProvenance(
          sourceId,
          sourcePage,
          `Source-supported schema-v1 catalog annotation ${annotation.id}; registration remains legacy evidence pending review.`
        ),
      };
    }
  );
  const annotations = [...roomLabelAnnotations, ...catalogAnnotations];

  const assumedProperty = (valueMm: number, name: string) => ({
    valueMm,
    evidence: "assumed" as const,
    provenance: legacyProvenance(
      sourceId,
      layout.source_page,
      `${name} is a visible compatibility default, not source evidence.`
    ),
  });
  const document: FloorPlanDocumentV2 = {
    schemaVersion: 2,
    units: "mm",
    id:
      options.documentId ??
      `catalog-v1:${catalog.floor_plan.plan_id}:${layout.layout_id}`,
    revisionId:
      options.revisionId ??
      `catalog-v1:${catalog.floor_plan.plan_id}:${layout.layout_id}:revision:1`,
    createdAt: options.createdAt ?? DEFAULT_CREATED_AT,
    verification: {
      tier: "needs_review",
      criticalIssueIds: [],
    },
    sources: [
      {
        id: sourceId,
        kind: "legacy",
        name: `${catalog.source.source_title} (schema-v1 catalog tracing)`,
        mimeType: "application/vnd.interior-ai.floor-plan-catalog-v1+yaml",
        uri: catalog.source.source_url,
        ...(catalog.source.sha256 ? { sha256: catalog.source.sha256 } : {}),
        pageCount: Math.max(...catalog.layouts.map((candidate) => candidate.source_page)),
      },
    ],
    floors: [
      {
        id: "floor:1",
        name: "Floor plan",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: DEFAULT_STOREY_HEIGHT_MM,
        slabThicknessMm: 150,
        verticalEvidence: {
          elevation: (() => {
            const { valueMm: _valueMm, ...evidence } = assumedProperty(
              0,
              "Floor elevation"
            );
            return evidence;
          })(),
          storeyHeight: (() => {
            const { valueMm: _valueMm, ...evidence } = assumedProperty(
              DEFAULT_STOREY_HEIGHT_MM,
              "Storey height"
            );
            return evidence;
          })(),
          slabThickness: (() => {
            const { valueMm: _valueMm, ...evidence } = assumedProperty(
              150,
              "Slab thickness"
            );
            return evidence;
          })(),
        },
        defaults: {
          wallHeight: assumedProperty(DEFAULT_WALL_HEIGHT_MM, "Wall height"),
          doorHeight: assumedProperty(2100, "Door height"),
          windowHeight: assumedProperty(1200, "Window height"),
          windowSillHeight: assumedProperty(900, "Window sill height"),
        },
        calibrations: [],
        vertices: [...vertexByPosition.values()],
        walls,
        rooms,
        openings,
        structures,
        annotations,
        dimensions: [],
      },
    ],
  };

  for (const issue of validateFloorPlanDocumentV2(document)) {
    addReviewIssue(
      `V2_${issue.code}`,
      `${issue.path}: ${issue.message}`,
      validationSeverity(issue)
    );
  }
  document.verification.criticalIssueIds = reviewIssues
    .filter((issue) => issue.severity === "critical" && !issue.resolved)
    .map((issue) => issue.id);
  return { document, reviewIssues };
}

/** Deterministic benchmark loader; avoids committing seven large generated JSON files. */
export function catalogV1ToFloorPlanDocumentV2Fixtures(
  catalog: FloorPlanLibraryCatalog,
  options: Omit<CatalogV1FloorPlanAdapterOptions, "documentId" | "revisionId"> = {}
): CatalogV1FloorPlanAdapterResult[] {
  return catalog.layouts.map((layout) =>
    catalogV1LayoutToFloorPlanDocumentV2(catalog, layout, options)
  );
}
