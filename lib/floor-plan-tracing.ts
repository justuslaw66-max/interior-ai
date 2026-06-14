import type { FloorPlanPoint } from "@/lib/floor-plan-types";
import {
  ROOM_DIMENSION_DEFAULTS,
  roundPlanCoordinate,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import { metersToMm, type RoomOpening2D } from "@/lib/editorScene";

export type TracedRoomRectangle = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type RoomDrawPreview = {
  start: FloorPlanPoint;
  end: FloorPlanPoint;
  width: number;
  depth: number;
  areaSqm: number;
  rectangle: TracedRoomRectangle | null;
};

export type ArcWallDrawPreview = {
  start: FloorPlanPoint;
  end: FloorPlanPoint;
  width: number;
  depth: number;
  arcLengthMeters: number;
  angleDeg: number;
  labelPosition: FloorPlanPoint;
  angleLabelPosition: FloorPlanPoint;
  outline: FloorPlanPoint[];
  resolvedRoom: ResolvedWallDrawRoom | null;
};

export type ResolvedWallDrawRoom = {
  bounds: TracedRoomRectangle;
  shape: "rectangle" | "custom_polygon";
  planPolygon?: FloorPlanPoint[];
};

export type RoomDrawSnapOptions = {
  gridStepMeters?: number;
  rooms?: HousePlanRoom2D[];
  edgeSnapDistanceMeters?: number;
  cornerSnapDistanceMeters?: number;
};

export type WallDrawSnapOptions = RoomDrawSnapOptions & {
  previousPoint?: FloorPlanPoint | null;
  firstPoint?: FloorPlanPoint | null;
  pointCount?: number;
  closeSnapDistanceMeters?: number;
  alignmentSnapDistanceMeters?: number;
};

type WallId = RoomOpening2D["wall"];

export type TracedOpening = {
  roomId: string;
  wall: WallId;
  kind: RoomOpening2D["kind"];
  offsetMm: number;
  widthMm: number;
};

const MAX_OPENING_WALL_DISTANCE_METERS = 0.45;
export const ROOM_DRAW_GRID_STEP_METERS = 0.1;
export const ROOM_DRAW_EDGE_SNAP_DISTANCE_METERS = 0.18;
export const ROOM_DRAW_CORNER_SNAP_DISTANCE_METERS = 0.35;
export const WALL_DRAW_CLOSE_SNAP_DISTANCE_METERS = 0.35;
export const WALL_DRAW_ALIGNMENT_SNAP_DISTANCE_METERS = 0.28;
const MIN_OPENING_WIDTH_METERS: Record<RoomOpening2D["kind"], number> = {
  door: 0.55,
  window: 0.4,
};

const POINT_MATCH_EPSILON_METERS = 0.001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveTracedRoomRectangle(
  points: [FloorPlanPoint, FloorPlanPoint]
): TracedRoomRectangle | null {
  const [first, second] = points;
  const width = Math.abs(second.x - first.x);
  const depth = Math.abs(second.z - first.z);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width < ROOM_DIMENSION_DEFAULTS.min ||
    depth < ROOM_DIMENSION_DEFAULTS.min ||
    width > ROOM_DIMENSION_DEFAULTS.max ||
    depth > ROOM_DIMENSION_DEFAULTS.max
  ) {
    return null;
  }

  return {
    x: roundPlanCoordinate((first.x + second.x) / 2),
    z: roundPlanCoordinate((first.z + second.z) / 2),
    width: roundPlanCoordinate(width),
    depth: roundPlanCoordinate(depth),
  };
}

export function snapFloorPlanPointToGrid(
  point: FloorPlanPoint,
  gridStepMeters = ROOM_DRAW_GRID_STEP_METERS
): FloorPlanPoint {
  const step =
    Number.isFinite(gridStepMeters) && gridStepMeters > 0
      ? gridStepMeters
      : ROOM_DRAW_GRID_STEP_METERS;

  return {
    x: roundPlanCoordinate(Math.round(point.x / step) * step),
    z: roundPlanCoordinate(Math.round(point.z / step) * step),
  };
}

export function snapFloorPlanPointToRoomEdges(
  point: FloorPlanPoint,
  rooms: HousePlanRoom2D[],
  snapDistanceMeters = ROOM_DRAW_EDGE_SNAP_DISTANCE_METERS
): FloorPlanPoint {
  if (!rooms.length) return point;

  const snapDistance =
    Number.isFinite(snapDistanceMeters) && snapDistanceMeters > 0
      ? snapDistanceMeters
      : ROOM_DRAW_EDGE_SNAP_DISTANCE_METERS;
  let nextX = point.x;
  let nextZ = point.z;
  let bestXDistance = snapDistance;
  let bestZDistance = snapDistance;

  for (const room of rooms) {
    const roomEdges = {
      left: room.x - room.w / 2,
      right: room.x + room.w / 2,
      top: room.z - room.d / 2,
      bottom: room.z + room.d / 2,
    };

    for (const edgeX of [roomEdges.left, roomEdges.right]) {
      const distance = Math.abs(point.x - edgeX);
      if (distance <= bestXDistance) {
        nextX = edgeX;
        bestXDistance = distance;
      }
    }

    for (const edgeZ of [roomEdges.top, roomEdges.bottom]) {
      const distance = Math.abs(point.z - edgeZ);
      if (distance <= bestZDistance) {
        nextZ = edgeZ;
        bestZDistance = distance;
      }
    }
  }

  return {
    x: roundPlanCoordinate(nextX),
    z: roundPlanCoordinate(nextZ),
  };
}

export function snapFloorPlanPointToRoomCorners(
  point: FloorPlanPoint,
  rooms: HousePlanRoom2D[],
  snapDistanceMeters = ROOM_DRAW_CORNER_SNAP_DISTANCE_METERS
): FloorPlanPoint {
  if (!rooms.length) return point;

  const snapDistance =
    Number.isFinite(snapDistanceMeters) && snapDistanceMeters > 0
      ? snapDistanceMeters
      : ROOM_DRAW_CORNER_SNAP_DISTANCE_METERS;
  let bestCorner: FloorPlanPoint | null = null;
  let bestScore = Infinity;

  for (const room of rooms) {
    const left = room.x - room.w / 2;
    const right = room.x + room.w / 2;
    const top = room.z - room.d / 2;
    const bottom = room.z + room.d / 2;

    for (const corner of [
      { x: left, z: top },
      { x: right, z: top },
      { x: right, z: bottom },
      { x: left, z: bottom },
    ]) {
      const deltaX = Math.abs(point.x - corner.x);
      const deltaZ = Math.abs(point.z - corner.z);
      if (deltaX > snapDistance || deltaZ > snapDistance) continue;

      const score = deltaX + deltaZ;
      if (score < bestScore) {
        bestScore = score;
        bestCorner = corner;
      }
    }
  }

  return bestCorner
    ? {
        x: roundPlanCoordinate(bestCorner.x),
        z: roundPlanCoordinate(bestCorner.z),
      }
    : point;
}

export function snapFloorPlanPointForRoomDraw(
  point: FloorPlanPoint,
  options: RoomDrawSnapOptions = {}
): FloorPlanPoint {
  const gridSnapped = snapFloorPlanPointToGrid(point, options.gridStepMeters);
  const cornerSnapped = snapFloorPlanPointToRoomCorners(
    gridSnapped,
    options.rooms ?? [],
    options.cornerSnapDistanceMeters
  );
  if (cornerSnapped.x !== gridSnapped.x || cornerSnapped.z !== gridSnapped.z) {
    return cornerSnapped;
  }
  return snapFloorPlanPointToRoomEdges(
    gridSnapped,
    options.rooms ?? [],
    options.edgeSnapDistanceMeters
  );
}

function getPointDistance(first: FloorPlanPoint, second: FloorPlanPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function arePlanPointsEqual(first: FloorPlanPoint, second: FloorPlanPoint): boolean {
  return (
    Math.abs(first.x - second.x) <= POINT_MATCH_EPSILON_METERS &&
    Math.abs(first.z - second.z) <= POINT_MATCH_EPSILON_METERS
  );
}

function normalizeClosedWallDrawPoints(points: FloorPlanPoint[]): FloorPlanPoint[] | null {
  if (points.length < 4) return null;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const closedPoints = arePlanPointsEqual(firstPoint, lastPoint)
    ? points
    : [...points, firstPoint];
  const vertices = closedPoints.slice(0, -1);

  if (vertices.length < 4) return null;

  for (let index = 0; index < closedPoints.length - 1; index += 1) {
    const current = closedPoints[index];
    const next = closedPoints[index + 1];
    const sameX = Math.abs(current.x - next.x) <= POINT_MATCH_EPSILON_METERS;
    const sameZ = Math.abs(current.z - next.z) <= POINT_MATCH_EPSILON_METERS;
    if (!sameX && !sameZ) return null;
  }

  return vertices.map((point) => ({
    x: roundPlanCoordinate(point.x),
    z: roundPlanCoordinate(point.z),
  }));
}

function snapPointToWallAlignment(
  point: FloorPlanPoint,
  previousPoint: FloorPlanPoint,
  snapDistanceMeters = WALL_DRAW_ALIGNMENT_SNAP_DISTANCE_METERS
): FloorPlanPoint {
  const snapDistance =
    Number.isFinite(snapDistanceMeters) && snapDistanceMeters > 0
      ? snapDistanceMeters
      : WALL_DRAW_ALIGNMENT_SNAP_DISTANCE_METERS;
  const deltaX = Math.abs(point.x - previousPoint.x);
  const deltaZ = Math.abs(point.z - previousPoint.z);

  if (deltaX <= snapDistance && deltaZ <= snapDistance) {
    if (deltaX <= deltaZ) {
      return { x: roundPlanCoordinate(previousPoint.x), z: roundPlanCoordinate(point.z) };
    }
    return { x: roundPlanCoordinate(point.x), z: roundPlanCoordinate(previousPoint.z) };
  }

  if (deltaX <= snapDistance) {
    return { x: roundPlanCoordinate(previousPoint.x), z: roundPlanCoordinate(point.z) };
  }

  if (deltaZ <= snapDistance) {
    return { x: roundPlanCoordinate(point.x), z: roundPlanCoordinate(previousPoint.z) };
  }

  return point;
}

export function snapFloorPlanPointForWallDraw(
  point: FloorPlanPoint,
  options: WallDrawSnapOptions = {}
): FloorPlanPoint {
  const basePoint = snapFloorPlanPointForRoomDraw(point, options);
  const firstPoint = options.firstPoint ?? null;
  const requestedCloseSnapDistance = options.closeSnapDistanceMeters;
  const closeSnapDistance =
    typeof requestedCloseSnapDistance === "number" &&
    Number.isFinite(requestedCloseSnapDistance) &&
    requestedCloseSnapDistance > 0
      ? requestedCloseSnapDistance
      : WALL_DRAW_CLOSE_SNAP_DISTANCE_METERS;

  if (
    firstPoint &&
    (options.pointCount ?? 0) >= 3 &&
    getPointDistance(basePoint, firstPoint) <= closeSnapDistance
  ) {
    return {
      x: roundPlanCoordinate(firstPoint.x),
      z: roundPlanCoordinate(firstPoint.z),
    };
  }

  if (!options.previousPoint) return basePoint;

  return snapPointToWallAlignment(
    basePoint,
    options.previousPoint,
    options.alignmentSnapDistanceMeters
  );
}

export function isClosingWallDrawPoint(
  point: FloorPlanPoint,
  firstPoint: FloorPlanPoint | null | undefined,
  pointCount: number,
  closeSnapDistanceMeters = WALL_DRAW_CLOSE_SNAP_DISTANCE_METERS
): boolean {
  if (!firstPoint || pointCount < 3) return false;
  const snapDistance =
    Number.isFinite(closeSnapDistanceMeters) && closeSnapDistanceMeters > 0
      ? closeSnapDistanceMeters
      : WALL_DRAW_CLOSE_SNAP_DISTANCE_METERS;
  return getPointDistance(point, firstPoint) <= snapDistance;
}

export function resolveClosedWallDrawRectangle(
  points: FloorPlanPoint[]
): TracedRoomRectangle | null {
  const vertices = normalizeClosedWallDrawPoints(points);
  if (!vertices || vertices.length !== 4) return null;

  const uniqueX = new Set(vertices.map((point) => roundPlanCoordinate(point.x).toFixed(3)));
  const uniqueZ = new Set(vertices.map((point) => roundPlanCoordinate(point.z).toFixed(3)));
  if (uniqueX.size !== 2 || uniqueZ.size !== 2) return null;

  const minX = Math.min(...vertices.map((point) => point.x));
  const maxX = Math.max(...vertices.map((point) => point.x));
  const minZ = Math.min(...vertices.map((point) => point.z));
  const maxZ = Math.max(...vertices.map((point) => point.z));

  return resolveTracedRoomRectangle([
    { x: roundPlanCoordinate(minX), z: roundPlanCoordinate(minZ) },
    { x: roundPlanCoordinate(maxX), z: roundPlanCoordinate(maxZ) },
  ]);
}

export function resolveClosedWallDrawRoom(
  points: FloorPlanPoint[]
): ResolvedWallDrawRoom | null {
  const vertices = normalizeClosedWallDrawPoints(points);
  if (!vertices) return null;

  const minX = Math.min(...vertices.map((point) => point.x));
  const maxX = Math.max(...vertices.map((point) => point.x));
  const minZ = Math.min(...vertices.map((point) => point.z));
  const maxZ = Math.max(...vertices.map((point) => point.z));
  const bounds = resolveTracedRoomRectangle([
    { x: roundPlanCoordinate(minX), z: roundPlanCoordinate(minZ) },
    { x: roundPlanCoordinate(maxX), z: roundPlanCoordinate(maxZ) },
  ]);
  if (!bounds) return null;

  const rectangle = resolveClosedWallDrawRectangle(points);
  if (rectangle) {
    return {
      bounds: rectangle,
      shape: "rectangle",
    };
  }

  const planPolygon = vertices.map((point) => ({
    x: roundPlanCoordinate(point.x - bounds.x),
    z: roundPlanCoordinate(point.z - bounds.z),
  }));

  return {
    bounds,
    shape: "custom_polygon",
    planPolygon,
  };
}

export function resolveRoomDrawPreview(
  start: FloorPlanPoint,
  end: FloorPlanPoint,
  options: RoomDrawSnapOptions = {}
): RoomDrawPreview {
  const snappedStart = snapFloorPlanPointForRoomDraw(start, options);
  const snappedEnd = snapFloorPlanPointForRoomDraw(end, options);
  const width = roundPlanCoordinate(Math.abs(snappedEnd.x - snappedStart.x));
  const depth = roundPlanCoordinate(Math.abs(snappedEnd.z - snappedStart.z));

  return {
    start: snappedStart,
    end: snappedEnd,
    width,
    depth,
    areaSqm: roundPlanCoordinate(width * depth),
    rectangle: resolveTracedRoomRectangle([snappedStart, snappedEnd]),
  };
}

function getPolylineLength(points: FloorPlanPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += getPointDistance(points[index - 1], points[index]);
  }
  return roundPlanCoordinate(length);
}

export function resolveArcWallDrawPreview(
  start: FloorPlanPoint,
  end: FloorPlanPoint,
  options: RoomDrawSnapOptions = {}
): ArcWallDrawPreview {
  const snappedStart = snapFloorPlanPointForRoomDraw(start, options);
  const snappedEnd = snapFloorPlanPointForRoomDraw(end, options);
  const left = Math.min(snappedStart.x, snappedEnd.x);
  const right = Math.max(snappedStart.x, snappedEnd.x);
  const width = roundPlanCoordinate(right - left);
  const depth = roundPlanCoordinate(Math.abs(snappedEnd.z - snappedStart.z));
  const direction = snappedEnd.z >= snappedStart.z ? 1 : -1;
  const centerX = roundPlanCoordinate((left + right) / 2);
  const chordZ = snappedStart.z;
  const radiusX = width / 2;
  const radiusZ = depth;
  const segments = 32;
  const arcPoints: FloorPlanPoint[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const theta = (index / segments) * Math.PI;
    arcPoints.push({
      x: roundPlanCoordinate(centerX + Math.cos(theta) * radiusX),
      z: roundPlanCoordinate(chordZ + direction * Math.sin(theta) * radiusZ),
    });
  }

  const outline = [
    { x: roundPlanCoordinate(left), z: roundPlanCoordinate(chordZ) },
    { x: roundPlanCoordinate(right), z: roundPlanCoordinate(chordZ) },
    ...arcPoints.slice(1),
  ];
  const arcLengthMeters = getPolylineLength(arcPoints);
  const minZ = Math.min(chordZ, chordZ + direction * depth);
  const maxZ = Math.max(chordZ, chordZ + direction * depth);
  const bounds = resolveTracedRoomRectangle([
    { x: roundPlanCoordinate(left), z: roundPlanCoordinate(minZ) },
    { x: roundPlanCoordinate(right), z: roundPlanCoordinate(maxZ) },
  ]);
  const resolvedRoom =
    bounds && outline.length >= 4
      ? {
          bounds,
          shape: "custom_polygon" as const,
          planPolygon: outline.map((point) => ({
            x: roundPlanCoordinate(point.x - bounds.x),
            z: roundPlanCoordinate(point.z - bounds.z),
          })),
        }
      : null;

  return {
    start: snappedStart,
    end: snappedEnd,
    width,
    depth,
    arcLengthMeters,
    angleDeg: 180,
    labelPosition: {
      x: centerX,
      z: roundPlanCoordinate(chordZ + direction * depth * 0.52),
    },
    angleLabelPosition: {
      x: centerX,
      z: roundPlanCoordinate(chordZ + direction * (depth + 0.35)),
    },
    outline,
    resolvedRoom,
  };
}

export function resolveTracedOpening(
  points: [FloorPlanPoint, FloorPlanPoint],
  rooms: HousePlanRoom2D[],
  kind: RoomOpening2D["kind"]
): TracedOpening | null {
  if (!rooms.length) return null;

  const [first, second] = points;
  const midpoint = {
    x: (first.x + second.x) / 2,
    z: (first.z + second.z) / 2,
  };
  const deltaX = Math.abs(second.x - first.x);
  const deltaZ = Math.abs(second.z - first.z);
  const minWidth = MIN_OPENING_WIDTH_METERS[kind];

  let best:
    | null
    | {
        room: HousePlanRoom2D;
        wall: WallId;
        score: number;
        offset: number;
        width: number;
      } = null;

  for (const room of rooms) {
    const left = room.x - room.w / 2;
    const right = room.x + room.w / 2;
    const top = room.z - room.d / 2;
    const bottom = room.z + room.d / 2;
    const walls: Array<{
      wall: WallId;
      axis: "x" | "z";
      wallPosition: number;
      min: number;
      max: number;
      center: number;
      span: number;
    }> = [
      {
        wall: "north",
        axis: "x",
        wallPosition: top,
        min: left,
        max: right,
        center: room.x,
        span: room.w,
      },
      {
        wall: "south",
        axis: "x",
        wallPosition: bottom,
        min: left,
        max: right,
        center: room.x,
        span: room.w,
      },
      {
        wall: "west",
        axis: "z",
        wallPosition: left,
        min: top,
        max: bottom,
        center: room.z,
        span: room.d,
      },
      {
        wall: "east",
        axis: "z",
        wallPosition: right,
        min: top,
        max: bottom,
        center: room.z,
        span: room.d,
      },
    ];

    for (const wall of walls) {
      const alongMidpoint = wall.axis === "x" ? midpoint.x : midpoint.z;
      const perpendicularMidpoint = wall.axis === "x" ? midpoint.z : midpoint.x;
      const perpendicularSpan = wall.axis === "x" ? deltaZ : deltaX;
      const projectedWidth = wall.axis === "x" ? deltaX : deltaZ;
      const edgeDistance =
        alongMidpoint < wall.min
          ? wall.min - alongMidpoint
          : alongMidpoint > wall.max
            ? alongMidpoint - wall.max
            : 0;
      const wallDistance = Math.abs(perpendicularMidpoint - wall.wallPosition) + edgeDistance;

      if (wallDistance > MAX_OPENING_WALL_DISTANCE_METERS || projectedWidth < minWidth) {
        continue;
      }

      const openingWidth = Math.min(projectedWidth, wall.span);
      const halfOpening = openingWidth / 2;
      const maxOffset = Math.max(0, wall.span / 2 - halfOpening);
      const offset = clamp(alongMidpoint - wall.center, -maxOffset, maxOffset);
      const score = wallDistance + perpendicularSpan * 0.6;

      if (!best || score < best.score) {
        best = {
          room,
          wall: wall.wall,
          score,
          offset,
          width: openingWidth,
        };
      }
    }
  }

  if (!best) return null;

  return {
    roomId: best.room.id,
    wall: best.wall,
    kind,
    offsetMm: metersToMm(best.offset),
    widthMm: metersToMm(best.width),
  };
}
