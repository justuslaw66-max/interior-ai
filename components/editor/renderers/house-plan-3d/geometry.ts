import * as THREE from "three";
import {
  ROOM_DIMENSION_DEFAULTS,
  resolveHouseRoomFloorElevationMeters,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import {
  type RoomRendererOpening,
} from "@/lib/design-page-plan-overlays";
import { resolveCutawayWallOpacity } from "@/lib/design-page-wall-cutaway";
import { getDeterministicWallFaceId } from "@/lib/surface-settings";
import {
  buildPlanarUnionPolygons,
  type PlanarRegionMm,
  type PlanarUnionPolygonMm,
} from "@/lib/floor-plan-planar-union";
import { buildRoomPlanShape } from "@/lib/room-plan-shape";

const STRUCTURE_THICKNESS_METERS = 0.025;
const FLOOR_THICKNESS_METERS = ROOM_DIMENSION_DEFAULTS.slabThickness;
const CAMERA_FACING_WALL_CUTAWAY_OPACITY = 0;

function getRoomFloorLevel(room: HousePlanRoom2D): number {
  return typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
    ? room.floorLevel
    : 1;
}

export type WallId = RoomRendererOpening["wall"];

export type WallSegment3D = {
  key: string;
  wall?: WallId;
  x: number;
  z: number;
  length: number;
  rotationY: number;
  axis: "x" | "z";
};

export type WallOpening3D = {
  id: string;
  sourceId: string;
  offset: number;
  width: number;
  height?: number;
  bottom?: number;
  kind: RoomRendererOpening["kind"];
};

export type WallPart3D = {
  key: string;
  x: number;
  z: number;
  length: number;
  height?: number;
  centerY?: number;
};

export type WallSurfacePanelRole = "interior" | "exterior";

export type WallSurfacePanelDescriptor = {
  key: string;
  panelId: string;
  roomId: string;
  faceId: string;
  floorLevel: number;
  segmentKey: string;
  role: WallSurfacePanelRole;
  side: 1 | -1;
  startOffset: number;
  endOffset: number;
  startAnchor: string;
  endAnchor: string;
  part: WallPart3D;
  supportingStructuralIntervals: WallPart3D[];
  legacyPanelIds: string[];
};

export type WallFaceRenderPatch = {
  key: string;
  roomId: string;
  segmentKey: string;
  panelId?: string;
  floorLevel: number;
  kind: "panel" | "opening-fragment";
  side: 1 | -1;
  bottomMeters: number;
  topMeters: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  outwardNormal: { x: number; z: number };
};

export function isWallSurfacePanelCutawayEligible({
  forceCutaway,
  hasSharedSupport,
  isSelected,
}: {
  forceCutaway: boolean;
  hasSharedSupport: boolean;
  isSelected: boolean;
}) {
  return forceCutaway && !hasSharedSupport && !isSelected;
}

export type WallCutawayRenderState = {
  visible: boolean;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

/**
 * Settles a wall's visibility and material state in one render frame.
 *
 * Cutaway walls use a zero-opacity target, so interpolating toward the target
 * creates a short-lived transparent wall that exposes the planning grid while
 * the camera is orbiting. Returning a complete render state lets callers
 * update opacity/depth ownership before making the wall group visible.
 */
export function resolveAtomicWallCutawayRenderState(
  targetOpacity: number
): WallCutawayRenderState {
  const opacity = Number.isFinite(targetOpacity)
    ? THREE.MathUtils.clamp(targetOpacity, 0, 1)
    : 0;
  const visible = opacity > 0.01;

  return {
    visible,
    opacity,
    transparent: opacity < 0.999,
    depthWrite: opacity >= 0.999,
  };
}

export function getSelectableWallFacePanelId(
  part: Pick<WallPart3D, "key">
): string {
  return `${part.key}-selectable-face`;
}

export function getLogicalWallPanelForPart(
  wallPanels: readonly WallPart3D[],
  part: Pick<WallPart3D, "key">
): WallPart3D | null {
  return (
    wallPanels.find(
      (candidate) =>
        part.key === candidate.key ||
        part.key.startsWith(`${candidate.key}-shared-split-`)
    ) ?? null
  );
}

export function getSelectableWallSurfacePanelId(
  facePanelId: string,
  side: 1 | -1
): string {
  return `${facePanelId}-side-${side === 1 ? "positive" : "negative"}`;
}

function normalizeWallPanelIdToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function getWallSurfacePanelId({
  room,
  segment,
  startAnchor,
  endAnchor,
  role,
}: {
  room: HousePlanRoom2D;
  segment: WallSegment3D;
  startAnchor: string;
  endAnchor: string;
  role: WallSurfacePanelRole;
}): string {
  return [
    "wall-panel",
    "v2",
    getRoomFloorLevel(room),
    normalizeWallPanelIdToken(room.id),
    normalizeWallPanelIdToken(getWallSurfaceFaceId(room, segment)),
    normalizeWallPanelIdToken(startAnchor),
    normalizeWallPanelIdToken(endAnchor),
    role,
  ].join(":");
}

export type OpeningThreshold3D = WallPart3D & {
  sourceId: string;
  height: number;
};

export type SharedWallRange3D = {
  roomId: string;
  segmentKey?: string;
  start: number;
  end: number;
};

export type LegacyFloorSlab3D = {
  key: string;
  floorLevel: number;
  elevationMeters: number;
  thicknessMeters: number;
  polygons: PlanarUnionPolygonMm[];
};

export type LegacyWallBand3D = {
  key: string;
  floorLevel: number;
  bottomMeters: number;
  topMeters: number;
  polygons: PlanarUnionPolygonMm[];
};

export function getRoomOutlinePoints(room: HousePlanRoom2D): Array<[number, number]> {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    const points = room.polygon.map((point): [number, number] => [point.x, point.z]);
    return [...points, points[0]];
  }

  const left = -room.w / 2;
  const right = room.w / 2;
  const top = -room.d / 2;
  const bottom = room.d / 2;

  if (room.shape === "l_shape") {
    const notchW = room.w * 0.42;
    const notchD = room.d * 0.42;
    return [
      [left, top],
      [right, top],
      [right, bottom - notchD],
      [right - notchW, bottom - notchD],
      [right - notchW, bottom],
      [left, bottom],
      [left, top],
    ];
  }

  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ];
}

export function buildRoomShapeGeometry(room: HousePlanRoom2D) {
  const points = getRoomOutlinePoints(room);
  return buildShapeFromOutlinePoints(points, getRoomHoleOutlinePoints(room));
}

export function getRoomHoleOutlinePoints(room: HousePlanRoom2D): Array<Array<[number, number]>> {
  return (room.holes ?? [])
    .filter((hole) => hole.length >= 3)
    .map((hole) => {
      const points = hole.map((point): [number, number] => [point.x, point.z]);
      return [...points, points[0]];
    });
}

export function getSignedArea(points: Array<[number, number]>) {
  return points.slice(0, -1).reduce((area, [x, z], index) => {
    const [nextX, nextZ] = points[index + 1];
    return area + x * nextZ - nextX * z;
  }, 0) / 2;
}

export function intersectOffsetLines(
  firstPoint: [number, number],
  firstDirection: [number, number],
  secondPoint: [number, number],
  secondDirection: [number, number]
): [number, number] | null {
  const cross =
    firstDirection[0] * secondDirection[1] -
    firstDirection[1] * secondDirection[0];

  if (Math.abs(cross) < 0.00001) return null;

  const dx = secondPoint[0] - firstPoint[0];
  const dz = secondPoint[1] - firstPoint[1];
  const t = (dx * secondDirection[1] - dz * secondDirection[0]) / cross;
  return [
    firstPoint[0] + firstDirection[0] * t,
    firstPoint[1] + firstDirection[1] * t,
  ];
}

export function offsetRoomOutlinePoints(room: HousePlanRoom2D, offset: number) {
  const outline = getRoomOutlinePoints(room);
  const openPoints = outline.slice(0, -1);

  if (offset <= 0.001 || openPoints.length < 3) {
    return outline;
  }

  const orientation = getSignedArea(outline) >= 0 ? 1 : -1;
  const shiftedEdges = openPoints.map((point, index) => {
    const nextPoint = openPoints[(index + 1) % openPoints.length];
    const dx = nextPoint[0] - point[0];
    const dz = nextPoint[1] - point[1];
    const length = Math.hypot(dx, dz) || 1;
    const direction: [number, number] = [dx / length, dz / length];
    const outwardNormal: [number, number] = orientation > 0
      ? [direction[1], -direction[0]]
      : [-direction[1], direction[0]];

    return {
      point: [
        point[0] + outwardNormal[0] * offset,
        point[1] + outwardNormal[1] * offset,
      ] as [number, number],
      direction,
    };
  });

  const offsetPoints = openPoints.map((point, index): [number, number] => {
    const previous = shiftedEdges[(index - 1 + shiftedEdges.length) % shiftedEdges.length];
    const current = shiftedEdges[index];
    const intersection = intersectOffsetLines(
      previous.point,
      previous.direction,
      current.point,
      current.direction
    );

    return intersection ?? point;
  });

  return [...offsetPoints, offsetPoints[0]];
}

export function buildShapeFromOutlinePoints(
  points: Array<[number, number]>,
  holes: Array<Array<[number, number]>> = []
) {
  return buildRoomPlanShape(points, holes);
}

export function buildHorizontalRoomGeometry(room: HousePlanRoom2D, edgeOffset = 0) {
  const points = edgeOffset > 0.001
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const geometry = new THREE.ShapeGeometry(
    buildShapeFromOutlinePoints(points, getRoomHoleOutlinePoints(room))
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildRoomEdgeBandGeometry(room: HousePlanRoom2D, height: number, edgeOffset = 0) {
  const outline = edgeOffset > 0.001
    ? offsetRoomOutlinePoints(room, edgeOffset)
    : getRoomOutlinePoints(room);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const loop of [outline, ...getRoomHoleOutlinePoints(room)]) {
    loop.slice(0, -1).forEach(([startX, startZ], index) => {
      const [endX, endZ] = loop[index + 1];
      const baseIndex = vertices.length / 3;

      vertices.push(
        startX, 0, startZ,
        endX, 0, endZ,
        endX, height, endZ,
        startX, height, startZ
      );

      indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex, baseIndex + 2, baseIndex + 3
      );
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getRectangleWallSegments(room: HousePlanRoom2D): WallSegment3D[] {
  return [
    {
      key: `${room.id}-north`,
      wall: "north",
      x: 0,
      z: -room.d / 2,
      length: room.w,
      rotationY: 0,
      axis: "x",
    },
    {
      key: `${room.id}-east`,
      wall: "east",
      x: room.w / 2,
      z: 0,
      length: room.d,
      rotationY: -Math.PI / 2,
      axis: "z",
    },
    {
      key: `${room.id}-south`,
      wall: "south",
      x: 0,
      z: room.d / 2,
      length: room.w,
      rotationY: 0,
      axis: "x",
    },
    {
      key: `${room.id}-west`,
      wall: "west",
      x: -room.w / 2,
      z: 0,
      length: room.d,
      rotationY: -Math.PI / 2,
      axis: "z",
    },
  ];
}

export function getWallSegments(room: HousePlanRoom2D): WallSegment3D[] {
  if (room.shape === "rectangle") {
    return getRectangleWallSegments(room);
  }

  const points = getRoomOutlinePoints(room);
  return points.slice(0, -1).map((point, index): WallSegment3D => {
    const next = points[index + 1];
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    return {
      key: `${room.id}-${index}`,
      x: (point[0] + next[0]) / 2,
      z: (point[1] + next[1]) / 2,
      length: Math.hypot(dx, dz),
      rotationY: -Math.atan2(dz, dx),
      axis: Math.abs(dx) >= Math.abs(dz) ? "x" : "z",
    };
  });
}

export function getWallSurfaceFaceId(room: HousePlanRoom2D, segment: WallSegment3D): string {
  if (segment.wall) return segment.wall;
  const suffix = segment.key.startsWith(`${room.id}-`)
    ? segment.key.slice(room.id.length + 1)
    : segment.key;
  return getDeterministicWallFaceId(suffix);
}

export function getWallInteriorSurfaceSide(segment: WallSegment3D): 1 | -1 {
  if (segment.wall === "north" || segment.wall === "east") return 1;
  if (segment.wall === "south" || segment.wall === "west") return -1;

  const localPlusZNormal = {
    x: Math.sin(segment.rotationY),
    z: Math.cos(segment.rotationY),
  };
  const vectorToRoomCenter = {
    x: -segment.x,
    z: -segment.z,
  };
  return localPlusZNormal.x * vectorToRoomCenter.x + localPlusZNormal.z * vectorToRoomCenter.z >= 0
    ? 1
    : -1;
}

export function getWallInteriorSurfaceSideForTest(
  _room: HousePlanRoom2D,
  segment: {
    wall?: "north" | "east" | "south" | "west";
    x: number;
    z: number;
    rotationY: number;
  }
): 1 | -1 {
  return getWallInteriorSurfaceSide({
    key: "test-wall-segment",
    length: 1,
    axis: "x",
    ...segment,
  });
}

export function oppositeWall(wall: WallId): WallId {
  if (wall === "north") return "south";
  if (wall === "south") return "north";
  if (wall === "east") return "west";
  return "east";
}

export function getWallCoordinate(room: HousePlanRoom2D, wall: WallId): number {
  if (wall === "west") return room.x - room.w / 2;
  if (wall === "east") return room.x + room.w / 2;
  if (wall === "north") return room.z - room.d / 2;
  return room.z + room.d / 2;
}

export function wallPartCenter(segment: WallSegment3D, offset: number) {
  return {
    x: segment.x + Math.cos(segment.rotationY) * offset,
    z: segment.z - Math.sin(segment.rotationY) * offset,
  };
}

export type LegacyWallJoinSide = 1 | -1;

export type LegacyWallEndJoinOptions = {
  squareStart?: boolean;
  squareEnd?: boolean;
};

export const LEGACY_WALL_JOIN_TOLERANCE_METERS = 0.002;

export function legacyWallDirection(segment: WallSegment3D): [number, number] {
  return [Math.cos(segment.rotationY), -Math.sin(segment.rotationY)];
}

export function legacyWallEndpointLocal(
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const offset = (endpoint === "start" ? -1 : 1) * segment.length / 2;
  return {
    x: segment.x + directionX * offset,
    z: segment.z + directionZ * offset,
  };
}

export function legacyWallPartAxisRange(segment: WallSegment3D, part: WallPart3D) {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const centerOffset =
    (part.x - segment.x) * directionX +
    (part.z - segment.z) * directionZ;
  return {
    centerOffset,
    startOffset: centerOffset - part.length / 2,
    endOffset: centerOffset + part.length / 2,
  };
}

export function legacyWallAdjacentSegment(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const segments = getWallSegments(room);
  const target = legacyWallEndpointLocal(segment, endpoint);
  return segments.find((candidate) => {
    if (candidate.key === segment.key) return false;
    const candidateStart = legacyWallEndpointLocal(candidate, "start");
    const candidateEnd = legacyWallEndpointLocal(candidate, "end");
    return (
      Math.hypot(target.x - candidateStart.x, target.z - candidateStart.z) <=
        LEGACY_WALL_JOIN_TOLERANCE_METERS ||
      Math.hypot(target.x - candidateEnd.x, target.z - candidateEnd.z) <=
        LEGACY_WALL_JOIN_TOLERANCE_METERS
    );
  }) ?? null;
}

export function legacyWallCutEndJoinOptions(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  excludedSegmentKeys?: ReadonlySet<string>
): LegacyWallEndJoinOptions {
  if (!excludedSegmentKeys?.size) return {};
  const startNeighbor = legacyWallAdjacentSegment(room, segment, "start");
  const endNeighbor = legacyWallAdjacentSegment(room, segment, "end");
  return {
    squareStart: Boolean(
      startNeighbor && excludedSegmentKeys.has(startNeighbor.key)
    ),
    squareEnd: Boolean(endNeighbor && excludedSegmentKeys.has(endNeighbor.key)),
  };
}

export function joinedLegacyWallPartAxisRange(
  _room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  _side: LegacyWallJoinSide,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {}
) {
  const range = legacyWallPartAxisRange(segment, part);
  const touchesStart =
    Math.abs(range.startOffset + segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const touchesEnd =
    Math.abs(range.endOffset - segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const capExtension = wallThicknessMeters / 2;
  return {
    startOffset:
      range.startOffset -
      (touchesStart && !endJoinOptions.squareStart ? capExtension : 0),
    endOffset:
      range.endOffset +
      (touchesEnd && !endJoinOptions.squareEnd ? capExtension : 0),
  };
}

function legacyWallSurfaceMiterOffset(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  endpoint: "start" | "end",
  side: LegacyWallJoinSide,
  wallThicknessMeters: number
) {
  const endpointOffset =
    (endpoint === "start" ? -1 : 1) * segment.length / 2;
  const adjacentSegment = legacyWallAdjacentSegment(room, segment, endpoint);
  if (!adjacentSegment) return endpointOffset;

  const [directionX, directionZ] = legacyWallDirection(segment);
  const [adjacentDirectionX, adjacentDirectionZ] =
    legacyWallDirection(adjacentSegment);
  const currentNormal: [number, number] = [-directionZ, directionX];
  const adjacentNormal: [number, number] = [
    -adjacentDirectionZ,
    adjacentDirectionX,
  ];
  const isInteriorSurface = side === getWallInteriorSurfaceSide(segment);
  const adjacentInteriorSide = getWallInteriorSurfaceSide(adjacentSegment);
  const adjacentSide = isInteriorSurface
    ? adjacentInteriorSide
    : (-adjacentInteriorSide as LegacyWallJoinSide);
  const halfThickness = wallThicknessMeters / 2;
  const intersection = intersectOffsetLines(
    [
      segment.x + currentNormal[0] * side * halfThickness,
      segment.z + currentNormal[1] * side * halfThickness,
    ],
    [directionX, directionZ],
    [
      adjacentSegment.x +
        adjacentNormal[0] * adjacentSide * halfThickness,
      adjacentSegment.z +
        adjacentNormal[1] * adjacentSide * halfThickness,
    ],
    [adjacentDirectionX, adjacentDirectionZ]
  );
  if (!intersection) return endpointOffset;

  const projectedOffset =
    (intersection[0] - segment.x) * directionX +
    (intersection[1] - segment.z) * directionZ;
  // Keep pathological shallow-angle miters inside the structural wall overlap.
  return Math.min(
    endpointOffset + wallThicknessMeters,
    Math.max(endpointOffset - wallThicknessMeters, projectedOffset)
  );
}

export function joinedLegacyWallSurfacePart(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  side: LegacyWallJoinSide,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {},
  cutOverlapMeters = 0,
  surfaceSeamOverlap: { startMeters?: number; endMeters?: number } = {}
) {
  const original = legacyWallPartAxisRange(segment, part);
  const touchesStart =
    Math.abs(original.startOffset + segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const touchesEnd =
    Math.abs(original.endOffset - segment.length / 2) <=
    LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const joinedStartOffset =
    touchesStart && !endJoinOptions.squareStart
      ? legacyWallSurfaceMiterOffset(
          room,
          segment,
          "start",
          side,
          wallThicknessMeters
        )
      : original.startOffset;
  const joinedEndOffset =
    touchesEnd && !endJoinOptions.squareEnd
      ? legacyWallSurfaceMiterOffset(
          room,
          segment,
          "end",
          side,
          wallThicknessMeters
        )
      : original.endOffset;
  const startOffset =
    joinedStartOffset +
    (touchesStart && endJoinOptions.squareStart ? -cutOverlapMeters : 0) -
    (!touchesStart ? surfaceSeamOverlap.startMeters ?? 0 : 0);
  const endOffset =
    joinedEndOffset -
    (touchesEnd && endJoinOptions.squareEnd ? -cutOverlapMeters : 0) +
    (!touchesEnd ? surfaceSeamOverlap.endMeters ?? 0 : 0);
  const length = Math.max(0.001, endOffset - startOffset);
  const centerOffset = startOffset + length / 2;
  return {
    centerDelta: centerOffset - original.centerOffset,
    length,
  };
}

export function getLegacyWallSurfaceSeamOverlaps(
  segment: WallSegment3D,
  parts: readonly WallPart3D[],
  wallHeight: number,
  overlapMeters = 0.006
) {
  const tolerance = 0.0005;
  const partRanges = parts.map((part) => {
    const axisRange = legacyWallPartAxisRange(segment, part);
    const height = part.height ?? wallHeight;
    const centerY = part.centerY ?? wallHeight / 2;
    return {
      part,
      axisRange,
      bottom: centerY - height / 2,
      top: centerY + height / 2,
      height,
    };
  });

  return new Map(
    partRanges.map((current) => {
      const hasCoveringNeighbor = (
        boundary: number,
        neighborBoundary: "startOffset" | "endOffset"
      ) =>
        partRanges.some((neighbor) => {
          if (neighbor.part.key === current.part.key) return false;
          if (
            Math.abs(neighbor.axisRange[neighborBoundary] - boundary) >
            tolerance
          ) {
            return false;
          }
          const verticalOverlap =
            Math.min(current.top, neighbor.top) -
            Math.max(current.bottom, neighbor.bottom);
          if (verticalOverlap <= tolerance) return false;
          // At an opening edge, extend the lintel/sill into the taller side
          // wall, never the full-height side wall into the opening.
          return current.height <= neighbor.height + tolerance;
        });

      return [
        current.part.key,
        {
          startMeters: hasCoveringNeighbor(
            current.axisRange.startOffset,
            "endOffset"
          )
            ? overlapMeters
            : 0,
          endMeters: hasCoveringNeighbor(
            current.axisRange.endOffset,
            "startOffset"
          )
            ? overlapMeters
            : 0,
        },
      ] as const;
    })
  );
}

export function getLegacyWallSurfaceJoinRangesForTest(
  room: HousePlanRoom2D,
  wallThicknessMeters: number,
  excludedSegmentKeys?: ReadonlySet<string>,
  cutOverlapMeters = 0
) {
  return getWallSegments(room).map((segment) => {
    const part: WallPart3D = {
      key: `${segment.key}:join-test`,
      x: segment.x,
      z: segment.z,
      length: segment.length,
    };
    const endJoinOptions = legacyWallCutEndJoinOptions(
      room,
      segment,
      excludedSegmentKeys
    );
    return {
      segmentKey: segment.key,
      plus: joinedLegacyWallSurfacePart(
        room,
        segment,
        part,
        1,
        wallThicknessMeters,
        endJoinOptions,
        cutOverlapMeters
      ),
      minus: joinedLegacyWallSurfacePart(
        room,
        segment,
        part,
        -1,
        wallThicknessMeters,
        endJoinOptions,
        cutOverlapMeters
      ),
    };
  });
}

export function getWallOpenings(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  rooms: readonly HousePlanRoom2D[],
  openings: readonly RoomRendererOpening[]
): WallOpening3D[] {
  const directOpenings = segment.wall
    ? openings
    .filter((opening) => opening.roomId === room.id && opening.wall === segment.wall)
    .map((opening) => ({
      id: opening.id,
      sourceId: opening.id,
      offset: opening.offset,
      width: opening.width,
      height: opening.height,
      bottom: opening.bottom,
      kind: opening.kind,
    }))
    : [];

  const mirroredOpenings = openings.flatMap((opening) => {
    if (!opening.roomId) return [];
    if (opening.roomId === room.id && opening.wall === segment.wall) return [];
    const sourceRoom = rooms.find((candidate) => candidate.id === opening.roomId);
    if (!sourceRoom) return [];
    const targetDirection = {
      x: Math.cos(segment.rotationY),
      z: -Math.sin(segment.rotationY),
    };
    const sourceDirection =
      opening.wall === "north" || opening.wall === "south"
        ? { x: 1, z: 0 }
        : { x: 0, z: 1 };
    if (
      Math.abs(
        targetDirection.x * sourceDirection.z -
          targetDirection.z * sourceDirection.x
      ) > 0.01
    ) {
      return [];
    }
    const openingCenter = {
      x:
        opening.wall === "north" || opening.wall === "south"
          ? sourceRoom.x + opening.offset
          : getWallCoordinate(sourceRoom, opening.wall),
      z:
        opening.wall === "east" || opening.wall === "west"
          ? sourceRoom.z + opening.offset
          : getWallCoordinate(sourceRoom, opening.wall),
    };
    const targetCenter = { x: room.x + segment.x, z: room.z + segment.z };
    const delta = {
      x: openingCenter.x - targetCenter.x,
      z: openingCenter.z - targetCenter.z,
    };
    const perpendicularDistance = Math.abs(
      delta.x * -targetDirection.z + delta.z * targetDirection.x
    );
    if (perpendicularDistance > LEGACY_WALL_JOIN_TOLERANCE_METERS) return [];
    const offset = delta.x * targetDirection.x + delta.z * targetDirection.z;
    if (Math.abs(offset) > segment.length / 2 + opening.width / 2) return [];

    return [
      {
        id: `${opening.id}-mirrored-${room.id}`,
        sourceId: opening.id,
        offset,
        width: opening.width,
        height: opening.height,
        bottom: opening.bottom,
        kind: opening.kind,
      },
    ];
  });

  return [...directOpenings, ...mirroredOpenings];
}

export function getLegacyWallOpeningCountsForTest(
  rooms: readonly HousePlanRoom2D[],
  openings: readonly RoomRendererOpening[]
) {
  return rooms.map((room) => ({
    roomId: room.id,
    segments: getWallSegments(room).map((segment) =>
      getWallOpenings(room, segment, rooms, openings).map((opening) => opening.sourceId)
    ),
  }));
}

type MergedWallOpeningGap = {
  start: number;
  end: number;
  sourceIds: string[];
};

type WallSolidSpan = {
  start: number;
  end: number;
  startAnchor: string;
  endAnchor: string;
  legacyIndex: number;
};

function getMergedWallOpeningGaps(
  segment: WallSegment3D,
  openings: readonly WallOpening3D[]
): MergedWallOpeningGap[] {
  const half = segment.length / 2;
  const gapsBySourceId = new Map<string, MergedWallOpeningGap>();
  openings.forEach((opening) => {
    const sourceId = opening.sourceId.trim() || opening.id;
    const start = Math.max(-half, opening.offset - opening.width / 2);
    const end = Math.min(half, opening.offset + opening.width / 2);
    if (end - start <= LEGACY_WALL_JOIN_TOLERANCE_METERS) return;
    const current = gapsBySourceId.get(sourceId);
    if (current) {
      current.start = Math.min(current.start, start);
      current.end = Math.max(current.end, end);
      return;
    }
    gapsBySourceId.set(sourceId, {
      start,
      end,
      sourceIds: [sourceId],
    });
  });
  const gaps = [...gapsBySourceId.values()]
    .sort((a, b) => a.start - b.start);
  const mergedGaps: MergedWallOpeningGap[] = [];

  for (const gap of gaps) {
    const last = mergedGaps[mergedGaps.length - 1];
    if (
      last &&
      gap.start <= last.end + LEGACY_WALL_JOIN_TOLERANCE_METERS
    ) {
      last.end = Math.max(last.end, gap.end);
      last.sourceIds = [...new Set([...last.sourceIds, ...gap.sourceIds])].sort();
    } else {
      mergedGaps.push({
        ...gap,
        sourceIds: [...gap.sourceIds],
      });
    }
  }

  return mergedGaps;
}

function getWallSolidSpans(
  segment: WallSegment3D,
  openings: readonly WallOpening3D[]
): WallSolidSpan[] {
  const half = segment.length / 2;
  const mergedGaps = getMergedWallOpeningGaps(segment, openings);
  const spans: WallSolidSpan[] = [];
  let cursor = -half;
  let startAnchor = "segment-start";

  [...mergedGaps, { start: half, end: half }].forEach((gap, index) => {
    const sourceIds = "sourceIds" in gap ? gap.sourceIds : [];
    const endAnchor = sourceIds.length
      ? `opening-${sourceIds.join("+")}-start`
      : "segment-end";
    if (gap.start - cursor > LEGACY_WALL_JOIN_TOLERANCE_METERS) {
      spans.push({
        start: cursor,
        end: gap.start,
        startAnchor,
        endAnchor,
        legacyIndex: index,
      });
    }
    cursor = Math.max(cursor, gap.end);
    if (sourceIds.length) {
      startAnchor = `opening-${sourceIds.join("+")}-end`;
    }
  });

  return spans;
}

export function buildWallParts(
  segment: WallSegment3D,
  openings: WallOpening3D[]
): WallPart3D[] {
  return getWallSolidSpans(segment, openings).map((span) => {
    const length = span.end - span.start;
    const centerOffset = span.start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    return {
      key: `${segment.key}-part-${span.legacyIndex}`,
      x: center.x,
      z: center.z,
      length,
    };
  });
}

export function buildWallSurfacePanels(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  openings: readonly WallOpening3D[],
  role: WallSurfacePanelRole = "interior"
): WallSurfacePanelDescriptor[] {
  const faceId = getWallSurfaceFaceId(room, segment);
  const interiorSide = getWallInteriorSurfaceSide(segment);
  const side = role === "interior"
    ? interiorSide
    : (-interiorSide as 1 | -1);

  return getWallSolidSpans(segment, openings).map((span) => {
    const length = span.end - span.start;
    const centerOffset = span.start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    const part: WallPart3D = {
      key: `${segment.key}-part-${span.legacyIndex}`,
      x: center.x,
      z: center.z,
      length,
    };
    const legacyFacePanelId = getSelectableWallFacePanelId(part);
    const legacyPanelIds = [
      getSelectableWallSurfacePanelId(legacyFacePanelId, side),
      legacyFacePanelId,
      getSelectableWallSurfacePanelId(part.key, side),
      part.key,
    ];
    const panelId = getWallSurfacePanelId({
      room,
      segment,
      startAnchor: span.startAnchor,
      endAnchor: span.endAnchor,
      role,
    });

    return {
      key: panelId,
      panelId,
      roomId: room.id,
      faceId,
      floorLevel: getRoomFloorLevel(room),
      segmentKey: segment.key,
      role,
      side,
      startOffset: span.start,
      endOffset: span.end,
      startAnchor: span.startAnchor,
      endAnchor: span.endAnchor,
      part,
      supportingStructuralIntervals: [part],
      legacyPanelIds: [...new Set(legacyPanelIds)],
    };
  });
}

export function withWallSurfacePanelSupportIntervals(
  panels: readonly WallSurfacePanelDescriptor[],
  segment: WallSegment3D,
  structuralParts: readonly WallPart3D[]
): WallSurfacePanelDescriptor[] {
  return panels.map((panel) => {
    const supportingStructuralIntervals = structuralParts
      .filter(
        (part) =>
          part.key === panel.part.key ||
          part.key.startsWith(`${panel.part.key}-shared-split-`)
      )
      .sort((first, second) => {
        const lengthDelta = second.length - first.length;
        if (Math.abs(lengthDelta) > LEGACY_WALL_JOIN_TOLERANCE_METERS) {
          return lengthDelta;
        }
        return (
          legacyWallPartAxisRange(segment, first).startOffset -
          legacyWallPartAxisRange(segment, second).startOffset
        );
      });
    const legacyFragmentAliases = supportingStructuralIntervals.flatMap(
      (part) => {
        const facePanelId = getSelectableWallFacePanelId(part);
        return [
          getSelectableWallSurfacePanelId(facePanelId, panel.side),
          facePanelId,
          getSelectableWallSurfacePanelId(part.key, panel.side),
          part.key,
        ];
      }
    );

    return {
      ...panel,
      supportingStructuralIntervals:
        supportingStructuralIntervals.length > 0
          ? supportingStructuralIntervals
          : panel.supportingStructuralIntervals,
      legacyPanelIds: [
        ...new Set([...panel.legacyPanelIds, ...legacyFragmentAliases]),
      ],
    };
  });
}

export function getOpeningDisplayHeight(
  opening: WallOpening3D,
  wallHeight: number,
  physicalWallHeight: number
): number {
  const requestedHeight = opening.height;
  if (!requestedHeight || !Number.isFinite(requestedHeight)) return wallHeight;
  const displayHeight = (requestedHeight / Math.max(0.2, physicalWallHeight)) * wallHeight;
  return Math.min(Math.max(0.08, displayHeight), wallHeight);
}

export function getOpeningDisplayBottom(
  opening: WallOpening3D,
  wallHeight: number,
  physicalWallHeight: number
) {
  const requestedBottom = opening.bottom;
  if (!requestedBottom || !Number.isFinite(requestedBottom)) return 0;
  return Math.min(
    Math.max(0, (requestedBottom / Math.max(0.2, physicalWallHeight)) * wallHeight),
    Math.max(0, wallHeight - 0.08)
  );
}

export function buildOpeningLintelParts(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): WallPart3D[] {
  const minLintelHeight = 0.08;
  const half = segment.length / 2;

  return openings.flatMap((opening): WallPart3D[] => {
    const openingBottom = getOpeningDisplayBottom(
      opening,
      wallHeight,
      physicalWallHeight
    );
    const openingHeight = getOpeningDisplayHeight(opening, wallHeight, physicalWallHeight);
    const openingTop = Math.min(wallHeight, openingBottom + openingHeight);
    const lintelHeight = wallHeight - openingTop;
    if (lintelHeight < minLintelHeight) return [];

    const start = Math.max(-half, opening.offset - opening.width / 2);
    const end = Math.min(half, opening.offset + opening.width / 2);
    const length = end - start;
    if (length <= 0.08) return [];

    const centerOffset = start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    return [
      {
        key: `${segment.key}-${opening.id}-lintel`,
        x: center.x,
        z: center.z,
        length,
        height: lintelHeight,
        centerY: openingTop + lintelHeight / 2,
      },
    ];
  });
}

export function buildOpeningSillParts(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): WallPart3D[] {
  const half = segment.length / 2;
  return openings.flatMap((opening): WallPart3D[] => {
    const sillHeight = getOpeningDisplayBottom(
      opening,
      wallHeight,
      physicalWallHeight
    );
    if (sillHeight < 0.08) return [];
    const start = Math.max(-half, opening.offset - opening.width / 2);
    const end = Math.min(half, opening.offset + opening.width / 2);
    const length = end - start;
    if (length <= 0.08) return [];
    const centerOffset = start + length / 2;
    const center = wallPartCenter(segment, centerOffset);
    return [
      {
        key: `${segment.key}-${opening.id}-sill`,
        x: center.x,
        z: center.z,
        length,
        height: sillHeight,
        centerY: sillHeight / 2,
      },
    ];
  });
}

export function getOpeningThresholds(
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number,
  physicalWallHeight: number
): OpeningThreshold3D[] {
  return openings
    .filter((opening) => opening.kind === "door")
    .map((opening) => {
      const center = wallPartCenter(segment, opening.offset);
      return {
        key: `${segment.key}-${opening.id}-threshold`,
        sourceId: opening.sourceId,
        x: center.x,
        z: center.z,
        length: Math.min(segment.length, opening.width),
        height: getOpeningDisplayHeight(opening, wallHeight, physicalWallHeight),
      };
    });
}

export function getSharedWallOverlapRanges(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  minOverlap = LEGACY_WALL_JOIN_TOLERANCE_METERS
): SharedWallRange3D[] {
  const tolerance = LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const half = segment.length / 2;
  const segmentCenter = segment.axis === "x"
    ? room.x + segment.x
    : room.z + segment.z;
  const segmentStart = segmentCenter - half;
  const segmentEnd = segmentCenter + half;

  if (!segment.wall) {
    const [directionX, directionZ] = legacyWallDirection(segment);
    const normalX = -directionZ;
    const normalZ = directionX;
    const worldCenterX = room.x + segment.x;
    const worldCenterZ = room.z + segment.z;
    return rooms.flatMap((otherRoom): SharedWallRange3D[] => {
      if (otherRoom.id === room.id) return [];
      return getWallSegments(otherRoom).flatMap(
        (otherSegment): SharedWallRange3D[] => {
          const [otherDirectionX, otherDirectionZ] =
            legacyWallDirection(otherSegment);
          const parallelCross = Math.abs(
            directionX * otherDirectionZ - directionZ * otherDirectionX
          );
          if (parallelCross > 0.01) return [];
          const deltaX = otherRoom.x + otherSegment.x - worldCenterX;
          const deltaZ = otherRoom.z + otherSegment.z - worldCenterZ;
          const lineDistance = Math.abs(deltaX * normalX + deltaZ * normalZ);
          if (lineDistance > tolerance) return [];
          const otherCenterOffset = deltaX * directionX + deltaZ * directionZ;
          const directionAlignment = Math.abs(
            directionX * otherDirectionX + directionZ * otherDirectionZ
          );
          const otherHalf = (otherSegment.length * directionAlignment) / 2;
          const overlapStart = Math.max(-half, otherCenterOffset - otherHalf);
          const overlapEnd = Math.min(half, otherCenterOffset + otherHalf);
          if (overlapEnd - overlapStart <= minOverlap) return [];
          return [
            {
              roomId: otherRoom.id,
              segmentKey: otherSegment.key,
              start: overlapStart,
              end: overlapEnd,
            },
          ];
        }
      );
    });
  }

  const roomLeft = room.x - room.w / 2;
  const roomRight = room.x + room.w / 2;
  const roomNorth = room.z - room.d / 2;
  const roomSouth = room.z + room.d / 2;

  return rooms.flatMap((otherRoom): SharedWallRange3D[] => {
    if (otherRoom.id === room.id) return [];

    const otherLeft = otherRoom.x - otherRoom.w / 2;
    const otherRight = otherRoom.x + otherRoom.w / 2;
    const otherNorth = otherRoom.z - otherRoom.d / 2;
    const otherSouth = otherRoom.z + otherRoom.d / 2;

    let otherSpan: { start: number; end: number } | null = null;

    if (segment.wall === "east") {
      if (Math.abs(roomRight - otherLeft) > tolerance) return [];
      otherSpan = { start: otherNorth, end: otherSouth };
    } else if (segment.wall === "west") {
      if (Math.abs(roomLeft - otherRight) > tolerance) return [];
      otherSpan = { start: otherNorth, end: otherSouth };
    } else if (segment.wall === "north") {
      if (Math.abs(roomNorth - otherSouth) > tolerance) return [];
      otherSpan = { start: otherLeft, end: otherRight };
    } else {
      if (Math.abs(roomSouth - otherNorth) > tolerance) return [];
      otherSpan = { start: otherLeft, end: otherRight };
    }

    const overlapStart = Math.max(segmentStart, otherSpan.start);
    const overlapEnd = Math.min(segmentEnd, otherSpan.end);
    if (overlapEnd - overlapStart <= minOverlap) return [];

    return [
      {
        roomId: otherRoom.id,
        start: Math.max(-half, overlapStart - segmentCenter),
        end: Math.min(half, overlapEnd - segmentCenter),
      },
    ];
  });
}

export function splitWallPartsAtSharedBoundaries(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  parts: WallPart3D[]
): WallPart3D[] {
  const sharedRanges = getSharedWallOverlapRanges(room, rooms, segment);
  if (!sharedRanges.length) return parts;

  const minPartLength = LEGACY_WALL_JOIN_TOLERANCE_METERS;

  return parts.flatMap((part): WallPart3D[] => {
    const centerOffset = segment.axis === "x"
      ? part.x - segment.x
      : part.z - segment.z;
    const partStart = centerOffset - part.length / 2;
    const partEnd = centerOffset + part.length / 2;
    const splitOffsets = sharedRanges
      .flatMap((range) => [range.start, range.end])
      .filter((offset) => offset > partStart + minPartLength && offset < partEnd - minPartLength)
      .sort((a, b) => a - b);

    if (!splitOffsets.length) return [part];

    const bounds = [partStart, ...splitOffsets, partEnd];
    return bounds.slice(0, -1).flatMap((start, index): WallPart3D[] => {
      const end = bounds[index + 1];
      const length = end - start;
      if (length <= minPartLength) return [];

      const nextCenterOffset = start + length / 2;
      return [
        {
          key: `${part.key}-shared-split-${index}`,
          x: segment.axis === "x" ? segment.x + nextCenterOffset : part.x,
          z: segment.axis === "z" ? segment.z + nextCenterOffset : part.z,
          length,
        },
      ];
    });
  });
}

export function rangesOverlapBy(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  minOverlap = 0
) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > minOverlap;
}

export function getSharedWallRoomIds(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): string[] {
  const centerOffset = segment.axis === "x"
    ? part.x - segment.x
    : part.z - segment.z;
  const partStart = centerOffset - part.length / 2;
  const partEnd = centerOffset + part.length / 2;

  return [
    ...new Set(
      getSharedWallOverlapRanges(room, rooms, segment)
        .filter((range) =>
          rangesOverlapBy(
            partStart,
            partEnd,
            range.start,
            range.end,
            LEGACY_WALL_JOIN_TOLERANCE_METERS
          )
        )
        .map((range) => range.roomId)
    ),
  ];
}

export function getSharedWallMatches(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
) {
  const centerOffset = segment.axis === "x"
    ? part.x - segment.x
    : part.z - segment.z;
  const partStart = centerOffset - part.length / 2;
  const partEnd = centerOffset + part.length / 2;
  const matches = getSharedWallOverlapRanges(room, rooms, segment)
    .filter((range) =>
      rangesOverlapBy(
        partStart,
        partEnd,
        range.start,
        range.end,
        LEGACY_WALL_JOIN_TOLERANCE_METERS
      )
    )
    .flatMap((range) => {
      const sharedRoom = rooms.find((candidate) => candidate.id === range.roomId);
      if (!sharedRoom) return [];
      const sharedSegments = getWallSegments(sharedRoom);
      const sharedSegment = range.segmentKey
        ? sharedSegments.find((candidate) => candidate.key === range.segmentKey)
        : segment.wall
          ? sharedSegments.find(
              (candidate) => candidate.wall === oppositeWall(segment.wall as WallId)
            )
          : undefined;
      return sharedSegment ? [{ room: sharedRoom, segment: sharedSegment }] : [];
    });
  return [
    ...new Map(
      matches.map((match) => [
        `${match.room.id}:${match.segment.key}`,
        match,
      ])
    ).values(),
  ];
}

export function legacyWallEndpointWorld(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  endpoint: "start" | "end"
) {
  const local = legacyWallEndpointLocal(segment, endpoint);
  return {
    x: room.x + local.x,
    z: room.z + local.z,
  };
}

export function legacyPhysicalWallCutEndJoinOptions(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  excludedSegmentKeys?: ReadonlySet<string>
): LegacyWallEndJoinOptions {
  const localOptions = legacyWallCutEndJoinOptions(
    room,
    segment,
    excludedSegmentKeys
  );
  if (!excludedSegmentKeys?.size) return localOptions;

  const endpoints = {
    start: legacyWallEndpointWorld(room, segment, "start"),
    end: legacyWallEndpointWorld(room, segment, "end"),
  };
  const endpointMatches = (
    first: { x: number; z: number },
    second: { x: number; z: number }
  ) => Math.hypot(first.x - second.x, first.z - second.z) <= 0.08;
  const exposedEndpoints = rooms.flatMap((candidateRoom) =>
    getWallSegments(candidateRoom).flatMap((candidateSegment) => {
      if (excludedSegmentKeys.has(candidateSegment.key)) return [];
      const options = legacyWallCutEndJoinOptions(
        candidateRoom,
        candidateSegment,
        excludedSegmentKeys
      );
      return [
        ...(options.squareStart
          ? [legacyWallEndpointWorld(candidateRoom, candidateSegment, "start")]
          : []),
        ...(options.squareEnd
          ? [legacyWallEndpointWorld(candidateRoom, candidateSegment, "end")]
          : []),
      ];
    })
  );

  return {
    squareStart:
      Boolean(localOptions.squareStart) ||
      exposedEndpoints.some((endpoint) =>
        endpointMatches(endpoints.start, endpoint)
      ),
    squareEnd:
      Boolean(localOptions.squareEnd) ||
      exposedEndpoints.some((endpoint) =>
        endpointMatches(endpoints.end, endpoint)
      ),
  };
}

export function getLegacyPhysicalWallCutEndOptionsForTest({
  rooms,
  excludedSegmentKeys,
}: {
  rooms: readonly HousePlanRoom2D[];
  excludedSegmentKeys: ReadonlySet<string>;
}) {
  return rooms.flatMap((room) =>
    getWallSegments(room).map((segment) => ({
      roomId: room.id,
      segmentKey: segment.key,
      ...legacyPhysicalWallCutEndJoinOptions(
        room,
        rooms,
        segment,
        excludedSegmentKeys
      ),
    }))
  );
}

export function getLegacySharedWallMatchesForTest(
  rooms: readonly HousePlanRoom2D[]
) {
  return rooms.flatMap((room) =>
    getWallSegments(room).map((segment) => {
      const part: WallPart3D = {
        key: `${segment.key}:shared-test`,
        x: segment.x,
        z: segment.z,
        length: segment.length,
      };
      return {
        roomId: room.id,
        segmentKey: segment.key,
        matches: getSharedWallMatches(room, rooms, segment, part).map(
          (match) => ({
            roomId: match.room.id,
            segmentKey: match.segment.key,
          })
        ),
      };
    })
  );
}

export function getSharedWallRenderOwnerRoomId(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: WallPart3D
): string {
  const sharedRoomIds = getSharedWallRoomIds(room, rooms, segment, part);
  if (!sharedRoomIds.length) return room.id;

  return [room.id, ...sharedRoomIds].sort()[0];
}

function wallFaceRenderPatchForPart({
  room,
  segment,
  part,
  side,
  wallThicknessMeters,
  floorElevationMeters,
  wallHeightMeters,
  endJoinOptions,
  key,
  kind,
  panelId,
}: {
  room: HousePlanRoom2D;
  segment: WallSegment3D;
  part: WallPart3D;
  side: 1 | -1;
  wallThicknessMeters: number;
  floorElevationMeters: number;
  wallHeightMeters: number;
  endJoinOptions: LegacyWallEndJoinOptions;
  key: string;
  kind: WallFaceRenderPatch["kind"];
  panelId?: string;
}): WallFaceRenderPatch {
  const joinedSurface = joinedLegacyWallSurfacePart(
    room,
    segment,
    part,
    side,
    wallThicknessMeters,
    endJoinOptions
  );
  const [directionX, directionZ] = legacyWallDirection(segment);
  const outwardNormal = {
    x: -directionZ * side,
    z: directionX * side,
  };
  const centerX =
    room.x +
    part.x +
    directionX * joinedSurface.centerDelta +
    outwardNormal.x * wallThicknessMeters / 2;
  const centerZ =
    room.z +
    part.z +
    directionZ * joinedSurface.centerDelta +
    outwardNormal.z * wallThicknessMeters / 2;
  const halfLength = joinedSurface.length / 2;
  const partHeight = part.height ?? wallHeightMeters;
  const centerY = part.centerY ?? wallHeightMeters / 2;

  return {
    key,
    roomId: room.id,
    segmentKey: segment.key,
    panelId,
    floorLevel: getRoomFloorLevel(room),
    kind,
    side,
    bottomMeters: floorElevationMeters + centerY - partHeight / 2,
    topMeters: floorElevationMeters + centerY + partHeight / 2,
    start: {
      x: centerX - directionX * halfLength,
      z: centerZ - directionZ * halfLength,
    },
    end: {
      x: centerX + directionX * halfLength,
      z: centerZ + directionZ * halfLength,
    },
    outwardNormal,
  };
}

function wallFaceRenderPatchGeometryKey(
  patch: WallFaceRenderPatch
): string {
  const pointToken = (point: { x: number; z: number }) =>
    `${Math.round(point.x * 1000)},${Math.round(point.z * 1000)}`;
  const first = pointToken(patch.start);
  const second = pointToken(patch.end);
  const [start, end] = first <= second ? [first, second] : [second, first];
  return [
    patch.floorLevel,
    Math.round(patch.bottomMeters * 1000),
    Math.round(patch.topMeters * 1000),
    start,
    end,
  ].join(":");
}

export function buildLegacyWallFaceRenderPatchesForTest({
  rooms,
  topologyRooms = rooms,
  openings,
  defaultWallHeight,
  stackedFloors,
  excludedSegmentKeys,
}: {
  rooms: readonly HousePlanRoom2D[];
  topologyRooms?: readonly HousePlanRoom2D[];
  openings: readonly RoomRendererOpening[];
  defaultWallHeight: number;
  stackedFloors: boolean;
  excludedSegmentKeys?: ReadonlySet<string>;
}): WallFaceRenderPatch[] {
  const patches = new Map<string, WallFaceRenderPatch>();
  const addPatch = (patch: WallFaceRenderPatch) => {
    const geometryKey = wallFaceRenderPatchGeometryKey(patch);
    const current = patches.get(geometryKey);
    if (
      !current ||
      (patch.kind === "panel" && current.kind !== "panel") ||
      patch.key < current.key
    ) {
      patches.set(geometryKey, patch);
    }
  };

  for (const room of rooms) {
    const roomWallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
    const floorElevationMeters = resolveHouseRoomFloorElevationMeters(
      room,
      roomWallHeight,
      stackedFloors
    );
    const wallThicknessMeters = Math.max(
      0.01,
      room.wallThickness ?? STRUCTURE_THICKNESS_METERS
    );

    for (const segment of getWallSegments(room)) {
      if (excludedSegmentKeys?.has(segment.key)) continue;
      const faceId = getWallSurfaceFaceId(room, segment);
      const segmentWallHeight = Math.max(
        0.2,
        room.wallHeights?.[faceId] ?? roomWallHeight
      );
      const wallOpenings = getWallOpenings(
        room,
        segment,
        topologyRooms,
        openings
      );
      const endJoinOptions = legacyPhysicalWallCutEndJoinOptions(
        room,
        topologyRooms,
        segment,
        excludedSegmentKeys
      );

      const panelPatches = [
        ...buildWallSurfacePanels(room, segment, wallOpenings),
        ...buildWallSurfacePanels(
          room,
          segment,
          wallOpenings,
          "exterior"
        ).filter(
          (panel) =>
            getSharedWallRoomIds(
              room,
              topologyRooms,
              segment,
              panel.part
            ).length === 0
        ),
      ];
      for (const panel of panelPatches) {
        addPatch(
          wallFaceRenderPatchForPart({
            room,
            segment,
            part: panel.part,
            side: panel.side,
            wallThicknessMeters,
            floorElevationMeters,
            wallHeightMeters: segmentWallHeight,
            endJoinOptions,
            key: `wall-face-render-patch:${panel.panelId}`,
            kind: "panel",
            panelId: panel.panelId,
          })
        );
      }

      const openingFragments = [
        ...buildOpeningLintelParts(
          segment,
          wallOpenings,
          segmentWallHeight,
          segmentWallHeight
        ),
        ...buildOpeningSillParts(
          segment,
          wallOpenings,
          segmentWallHeight,
          segmentWallHeight
        ),
      ];
      for (const part of openingFragments) {
        for (const side of [1, -1] as const) {
          addPatch(
            wallFaceRenderPatchForPart({
              room,
              segment,
              part,
              side,
              wallThicknessMeters,
              floorElevationMeters,
              wallHeightMeters: segmentWallHeight,
              endJoinOptions,
              key: `wall-face-render-patch:${part.key}:side-${side}`,
              kind: "opening-fragment",
            })
          );
        }
      }
    }
  }

  return [...patches.values()].sort((first, second) =>
    first.key.localeCompare(second.key)
  );
}

export function legacyPlanarShape(polygons: PlanarUnionPolygonMm[]) {
  return polygons.map((polygon) => {
    const shape = new THREE.Shape();
    polygon.outer.forEach((point, index) => {
      const x = point.xMm / 1000;
      const y = -point.zMm / 1000;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    for (const holePoints of polygon.holes) {
      const hole = new THREE.Path();
      holePoints.forEach((point, index) => {
        const x = point.xMm / 1000;
        const y = -point.zMm / 1000;
        if (index === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
      });
      hole.closePath();
      shape.holes.push(hole);
    }
    return shape;
  });
}

export function buildWallFinishShellGeometry({
  widthMeters,
  heightMeters,
  thicknessMeters,
}: {
  widthMeters: number;
  heightMeters: number;
  thicknessMeters: number;
}): THREE.BufferGeometry {
  const boxGeometry = new THREE.BoxGeometry(
    widthMeters,
    heightMeters,
    thicknessMeters
  );
  const source = boxGeometry.index
    ? boxGeometry.toNonIndexed()
    : boxGeometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  const keptPositions: number[] = [];
  const keptNormals: number[] = [];
  const keptUvs: number[] = [];
  let removedInnerFaceTriangleCount = 0;

  for (let index = 0; index < position.count; index += 3) {
    const isInnerBroadFace = [0, 1, 2].every(
      (offset) => normal.getZ(index + offset) < -0.999
    );
    if (isInnerBroadFace) {
      removedInnerFaceTriangleCount += 1;
      continue;
    }
    for (let offset = 0; offset < 3; offset += 1) {
      const attributeIndex = index + offset;
      keptPositions.push(
        position.getX(attributeIndex),
        position.getY(attributeIndex),
        position.getZ(attributeIndex)
      );
      keptNormals.push(
        normal.getX(attributeIndex),
        normal.getY(attributeIndex),
        normal.getZ(attributeIndex)
      );
      keptUvs.push(uv.getX(attributeIndex), uv.getY(attributeIndex));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(keptPositions, 3)
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(keptNormals, 3)
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(keptUvs, 2)
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    removedInnerFaceTriangleCount,
    visibleDepthOwnerTriangleCount: keptPositions.length / 9,
  };

  if (source !== boxGeometry) source.dispose();
  boxGeometry.dispose();
  return geometry;
}

type WallFacePoint2D = { u: number; v: number };

function wallFacePolygonArea(points: readonly WallFacePoint2D[]) {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.u * next.v - next.u * current.v;
  }
  return Math.abs(twiceArea) / 2;
}

function clipWallFacePolygon(
  points: readonly WallFacePoint2D[],
  inside: (point: WallFacePoint2D) => boolean,
  intersection: (
    first: WallFacePoint2D,
    second: WallFacePoint2D
  ) => WallFacePoint2D
) {
  const clipped: WallFacePoint2D[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index]!;
    const second = points[(index + 1) % points.length]!;
    const firstInside = inside(first);
    const secondInside = inside(second);
    if (firstInside) clipped.push(first);
    if (firstInside !== secondInside) {
      clipped.push(intersection(first, second));
    }
  }
  return clipped;
}

function clipWallFaceTriangleToRectangle(
  triangle: readonly WallFacePoint2D[],
  minU: number,
  maxU: number,
  minV: number,
  maxV: number
) {
  const interpolateAtU = (
    first: WallFacePoint2D,
    second: WallFacePoint2D,
    u: number
  ) => {
    const delta = second.u - first.u;
    const ratio = Math.abs(delta) <= 1e-12 ? 0 : (u - first.u) / delta;
    return { u, v: first.v + (second.v - first.v) * ratio };
  };
  const interpolateAtV = (
    first: WallFacePoint2D,
    second: WallFacePoint2D,
    v: number
  ) => {
    const delta = second.v - first.v;
    const ratio = Math.abs(delta) <= 1e-12 ? 0 : (v - first.v) / delta;
    return { u: first.u + (second.u - first.u) * ratio, v };
  };

  let clipped = [...triangle];
  clipped = clipWallFacePolygon(
    clipped,
    (point) => point.u >= minU,
    (first, second) => interpolateAtU(first, second, minU)
  );
  clipped = clipWallFacePolygon(
    clipped,
    (point) => point.u <= maxU,
    (first, second) => interpolateAtU(first, second, maxU)
  );
  clipped = clipWallFacePolygon(
    clipped,
    (point) => point.v >= minV,
    (first, second) => interpolateAtV(first, second, minV)
  );
  return clipWallFacePolygon(
    clipped,
    (point) => point.v <= maxV,
    (first, second) => interpolateAtV(first, second, maxV)
  );
}

function triangleWallFacePatchCoverage(
  vertices: ReadonlyArray<{ x: number; y: number; z: number }>,
  worldNormal: { x: number; z: number },
  patches: readonly WallFaceRenderPatch[],
  toleranceMeters: number
): { covered: boolean; patchKeys: string[] } {
  const tangent = { x: -worldNormal.z, z: worldNormal.x };
  const lineOffset =
    vertices.reduce(
      (sum, vertex) =>
        sum + vertex.x * worldNormal.x + vertex.z * worldNormal.z,
      0
    ) / vertices.length;
  const triangle = vertices.map((vertex) => ({
    u: vertex.x * tangent.x + vertex.z * tangent.z,
    v: vertex.y,
  }));
  const triangleArea = wallFacePolygonArea(triangle);
  if (triangleArea <= toleranceMeters * toleranceMeters) {
    return { covered: false, patchKeys: [] };
  }

  const coverageRectangles: Array<{
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
    patchKey: string;
  }> = [];
  for (const patch of patches) {
    const patchLineOffset =
      (patch.start.x * worldNormal.x +
        patch.start.z * worldNormal.z +
        patch.end.x * worldNormal.x +
        patch.end.z * worldNormal.z) /
      2;
    if (Math.abs(patchLineOffset - lineOffset) > toleranceMeters) continue;
    const startU = patch.start.x * tangent.x + patch.start.z * tangent.z;
    const endU = patch.end.x * tangent.x + patch.end.z * tangent.z;
    const clipped = clipWallFaceTriangleToRectangle(
      triangle,
      Math.min(startU, endU) - toleranceMeters,
      Math.max(startU, endU) + toleranceMeters,
      patch.bottomMeters - toleranceMeters,
      patch.topMeters + toleranceMeters
    );
    const clippedArea = wallFacePolygonArea(clipped);
    if (clippedArea <= toleranceMeters * toleranceMeters) continue;
    coverageRectangles.push({
      minU: Math.min(startU, endU) - toleranceMeters,
      maxU: Math.max(startU, endU) + toleranceMeters,
      minV: patch.bottomMeters - toleranceMeters,
      maxV: patch.topMeters + toleranceMeters,
      patchKey: patch.key,
    });
  }
  const uniqueSorted = (values: readonly number[]) =>
    [...new Set(values.map((value) => Number(value.toFixed(9))))].sort(
      (first, second) => first - second
    );
  const uBreaks = uniqueSorted([
    ...triangle.map((point) => point.u),
    ...coverageRectangles.flatMap((rectangle) => [
      rectangle.minU,
      rectangle.maxU,
    ]),
  ]);
  const vBreaks = uniqueSorted([
    ...triangle.map((point) => point.v),
    ...coverageRectangles.flatMap((rectangle) => [
      rectangle.minV,
      rectangle.maxV,
    ]),
  ]);
  const contributingPatchKeys = new Set<string>();
  let uncoveredArea = 0;
  for (let uIndex = 0; uIndex < uBreaks.length - 1; uIndex += 1) {
    const minU = uBreaks[uIndex]!;
    const maxU = uBreaks[uIndex + 1]!;
    if (maxU - minU <= 1e-9) continue;
    for (let vIndex = 0; vIndex < vBreaks.length - 1; vIndex += 1) {
      const minV = vBreaks[vIndex]!;
      const maxV = vBreaks[vIndex + 1]!;
      if (maxV - minV <= 1e-9) continue;
      const cellArea = wallFacePolygonArea(
        clipWallFaceTriangleToRectangle(
          triangle,
          minU,
          maxU,
          minV,
          maxV
        )
      );
      if (cellArea <= 1e-10) continue;
      const centerU = (minU + maxU) / 2;
      const centerV = (minV + maxV) / 2;
      const owners = coverageRectangles.filter(
        (rectangle) =>
          centerU >= rectangle.minU &&
          centerU <= rectangle.maxU &&
          centerV >= rectangle.minV &&
          centerV <= rectangle.maxV
      );
      if (owners.length === 0) {
        uncoveredArea += cellArea;
        continue;
      }
      owners.forEach((owner) =>
        contributingPatchKeys.add(owner.patchKey)
      );
    }
  }

  return {
    covered:
      uncoveredArea <= Math.max(1e-8, triangleArea * 1e-5),
    patchKeys: [...contributingPatchKeys],
  };
}

export function buildLegacyWallBandCoreGeometry({
  band,
  facePatches,
  removeTopCap,
}: {
  band: LegacyWallBand3D;
  facePatches: readonly WallFaceRenderPatch[];
  removeTopCap: boolean;
}): THREE.BufferGeometry {
  const sourceGeometry = new THREE.ExtrudeGeometry(
    legacyPlanarShape(band.polygons),
    {
      depth: Math.max(0.001, band.topMeters - band.bottomMeters),
      bevelEnabled: false,
      steps: 1,
    }
  );
  const source = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  const keptPositions: number[] = [];
  const keptNormals: number[] = [];
  const keptUvs: number[] = [];
  const toleranceMeters = LEGACY_WALL_JOIN_TOLERANCE_METERS;
  const relevantPatches = facePatches.filter(
    (patch) =>
      patch.floorLevel === band.floorLevel &&
      Math.min(patch.topMeters, band.topMeters) -
        Math.max(patch.bottomMeters, band.bottomMeters) >
        toleranceMeters
  );
  let removedCoveredTriangleCount = 0;
  let removedTopTriangleCount = 0;
  const removedWallFacePatchKeys = new Set<string>();

  for (let index = 0; index < position.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => ({
      x: position.getX(index + offset),
      y: band.bottomMeters + position.getZ(index + offset),
      z: -position.getY(index + offset),
    }));
    const edgeA = new THREE.Vector3(
      vertices[1].x - vertices[0].x,
      vertices[1].y - vertices[0].y,
      vertices[1].z - vertices[0].z
    );
    const edgeB = new THREE.Vector3(
      vertices[2].x - vertices[0].x,
      vertices[2].y - vertices[0].y,
      vertices[2].z - vertices[0].z
    );
    const worldNormal = edgeA.cross(edgeB).normalize();
    const isVertical = Math.abs(worldNormal.y) <= 0.001;
    const isTop =
      removeTopCap &&
      worldNormal.y > 0.999 &&
      vertices.every(
        (vertex) =>
          Math.abs(vertex.y - band.topMeters) <= toleranceMeters
      );
    const coverage = isVertical
      ? triangleWallFacePatchCoverage(
          vertices,
          { x: worldNormal.x, z: worldNormal.z },
          relevantPatches,
          toleranceMeters
        )
      : { covered: false, patchKeys: [] };

    if (isTop) {
      removedTopTriangleCount += 1;
      continue;
    }
    if (coverage.covered) {
      removedCoveredTriangleCount += 1;
      coverage.patchKeys.forEach((patchKey) =>
        removedWallFacePatchKeys.add(patchKey)
      );
      continue;
    }

    for (let offset = 0; offset < 3; offset += 1) {
      const attributeIndex = index + offset;
      keptPositions.push(
        position.getX(attributeIndex),
        position.getY(attributeIndex),
        position.getZ(attributeIndex)
      );
      if (normal) {
        keptNormals.push(
          normal.getX(attributeIndex),
          normal.getY(attributeIndex),
          normal.getZ(attributeIndex)
        );
      }
      if (uv) {
        keptUvs.push(uv.getX(attributeIndex), uv.getY(attributeIndex));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(keptPositions, 3)
  );
  if (keptNormals.length) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(keptNormals, 3)
    );
  } else {
    geometry.computeVertexNormals();
  }
  if (keptUvs.length) {
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(keptUvs, 2)
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    wallFaceRenderPatchCount: relevantPatches.length,
    removedCoveredTriangleCount,
    removedTopTriangleCount,
    removedWallFacePatchKeys: [...removedWallFacePatchKeys].sort(),
    unmatchedWallFacePatchKeys: relevantPatches
      .filter((patch) => !removedWallFacePatchKeys.has(patch.key))
      .map((patch) => patch.key)
      .sort(),
  };

  if (source !== sourceGeometry) source.dispose();
  sourceGeometry.dispose();
  return geometry;
}

export function legacyWallPartRegion(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  part: WallPart3D,
  wallThicknessMeters: number,
  endJoinOptions: LegacyWallEndJoinOptions = {}
): PlanarRegionMm {
  const [directionX, directionZ] = legacyWallDirection(segment);
  const normalX = -directionZ;
  const normalZ = directionX;
  const halfThickness = wallThicknessMeters / 2;
  const pointAt = (offset: number, side: LegacyWallJoinSide) => ({
    xMm:
      (room.x + segment.x + directionX * offset + normalX * side * halfThickness) *
      1000,
    zMm:
      (room.z + segment.z + directionZ * offset + normalZ * side * halfThickness) *
      1000,
  });
  const left = joinedLegacyWallPartAxisRange(
    room,
    segment,
    part,
    1,
    wallThicknessMeters,
    endJoinOptions
  );
  const right = joinedLegacyWallPartAxisRange(
    room,
    segment,
    part,
    -1,
    wallThicknessMeters,
    endJoinOptions
  );
  return {
    outer: [
      pointAt(left.startOffset, 1),
      pointAt(left.endOffset, 1),
      pointAt(right.endOffset, -1),
      pointAt(right.startOffset, -1),
    ],
  };
}

export function legacyRoomRegion(room: HousePlanRoom2D): PlanarRegionMm {
  const toWorldRing = (points: Array<[number, number]>) =>
    points.slice(0, -1).map(([x, z]) => ({
      xMm: (room.x + x) * 1000,
      zMm: (room.z + z) * 1000,
    }));
  return {
    outer: toWorldRing(getRoomOutlinePoints(room)),
    holes: getRoomHoleOutlinePoints(room).map(toWorldRing),
  };
}

export function buildLegacyFloorSlabsForTest({
  rooms,
  topologyRooms = rooms,
  openings = [],
  defaultWallHeight,
  stackedFloors,
}: {
  rooms: readonly HousePlanRoom2D[];
  topologyRooms?: readonly HousePlanRoom2D[];
  openings?: readonly RoomRendererOpening[];
  defaultWallHeight: number;
  stackedFloors: boolean;
}): LegacyFloorSlab3D[] {
  const groups = new Map<
    string,
    {
      floorLevel: number;
      elevationMeters: number;
      thicknessMeters: number;
      regions: PlanarRegionMm[];
    }
  >();
  for (const room of rooms) {
    const roomWallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
    const elevationMeters = resolveHouseRoomFloorElevationMeters(
      room,
      roomWallHeight,
      stackedFloors
    );
    const floorLevel = getRoomFloorLevel(room);
    const key = `${floorLevel}:${Math.round(elevationMeters * 1000)}`;
    const group: {
      floorLevel: number;
      elevationMeters: number;
      thicknessMeters: number;
      regions: PlanarRegionMm[];
    } = groups.get(key) ?? {
      floorLevel,
      elevationMeters,
      thicknessMeters: Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS),
      regions: [],
    };
    group.thicknessMeters = Math.max(
      group.thicknessMeters,
      Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS)
    );
    group.regions.push(legacyRoomRegion(room));
    const wallThickness = Math.max(
      0.01,
      room.wallThickness ?? STRUCTURE_THICKNESS_METERS
    );
    for (const segment of getWallSegments(room)) {
      const faceId = getWallSurfaceFaceId(room, segment);
      const segmentWallHeight = Math.max(
        0.2,
        room.wallHeights?.[faceId] ?? roomWallHeight
      );
      const wallOpenings = getWallOpenings(
        room,
        segment,
        topologyRooms,
        openings
      );
      const baseParts = [
        ...splitWallPartsAtSharedBoundaries(
          room,
          topologyRooms,
          segment,
          buildWallParts(segment, wallOpenings)
        ),
        ...buildOpeningSillParts(
          segment,
          wallOpenings,
          segmentWallHeight,
          segmentWallHeight
        ),
      ];
      const endJoinOptions = legacyWallCutEndJoinOptions(room, segment);
      for (const part of baseParts) {
        group.regions.push(
          legacyWallPartRegion(
            room,
            segment,
            part,
            wallThickness,
            endJoinOptions
          )
        );
      }
    }
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const polygons = buildPlanarUnionPolygons(group.regions);
    return polygons.length
      ? [
          {
            key,
            floorLevel: group.floorLevel,
            elevationMeters: group.elevationMeters,
            thicknessMeters: group.thicknessMeters,
            polygons,
          },
        ]
      : [];
  });
}

export function buildLegacyWallBandsForTest({
  rooms,
  topologyRooms = rooms,
  openings,
  defaultWallHeight,
  stackedFloors,
  excludedSegmentKeys,
}: {
  rooms: readonly HousePlanRoom2D[];
  topologyRooms?: readonly HousePlanRoom2D[];
  openings: readonly RoomRendererOpening[];
  defaultWallHeight: number;
  stackedFloors: boolean;
  excludedSegmentKeys?: ReadonlySet<string>;
}): LegacyWallBand3D[] {
  const groups = new Map<
    string,
    {
      floorLevel: number;
      solids: Array<{
        bottomMm: number;
        topMm: number;
        region: PlanarRegionMm;
      }>;
    }
  >();
  for (const room of rooms) {
    const roomWallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
    const floorElevation = resolveHouseRoomFloorElevationMeters(
      room,
      roomWallHeight,
      stackedFloors
    );
    const floorLevel = getRoomFloorLevel(room);
    const key = `${floorLevel}:${Math.round(floorElevation * 1000)}`;
    const group: {
      floorLevel: number;
      solids: Array<{
        bottomMm: number;
        topMm: number;
        region: PlanarRegionMm;
      }>;
    } = groups.get(key) ?? { floorLevel, solids: [] };
    const wallThickness = Math.max(
      0.01,
      room.wallThickness ?? STRUCTURE_THICKNESS_METERS
    );
    for (const segment of getWallSegments(room)) {
      if (excludedSegmentKeys?.has(segment.key)) continue;
      const endJoinOptions = legacyPhysicalWallCutEndJoinOptions(
        room,
        topologyRooms,
        segment,
        excludedSegmentKeys
      );
      const faceId = getWallSurfaceFaceId(room, segment);
      const segmentWallHeight = Math.max(
        0.2,
        room.wallHeights?.[faceId] ?? roomWallHeight
      );
      const wallOpenings = getWallOpenings(
        room,
        segment,
        topologyRooms,
        openings
      );
      const parts = splitWallPartsAtSharedBoundaries(
        room,
        topologyRooms,
        segment,
        buildWallParts(segment, wallOpenings)
      );
      const lintels = buildOpeningLintelParts(
        segment,
        wallOpenings,
        segmentWallHeight,
        segmentWallHeight
      );
      const sills = buildOpeningSillParts(
        segment,
        wallOpenings,
        segmentWallHeight,
        segmentWallHeight
      );
      for (const part of [...parts, ...lintels, ...sills]) {
        const partHeight = part.height ?? segmentWallHeight;
        const centerY = part.centerY ?? segmentWallHeight / 2;
        group.solids.push({
          bottomMm: Math.round((floorElevation + centerY - partHeight / 2) * 1000),
          topMm: Math.round((floorElevation + centerY + partHeight / 2) * 1000),
          region: legacyWallPartRegion(
            room,
            segment,
            part,
            wallThickness,
            endJoinOptions
          ),
        });
      }
    }
    groups.set(key, group);
  }

  return [...groups.entries()].flatMap(([groupKey, group]) => {
    const boundaries = [
      ...new Set(group.solids.flatMap((solid) => [solid.bottomMm, solid.topMm])),
    ].sort((left, right) => left - right);
    return boundaries.slice(0, -1).flatMap((bottomMm, index) => {
      const topMm = boundaries[index + 1];
      if (topMm - bottomMm <= 1) return [];
      const regions = group.solids
        .filter(
          (solid) => solid.bottomMm <= bottomMm && solid.topMm >= topMm
        )
        .map((solid) => solid.region);
      const polygons = buildPlanarUnionPolygons(regions);
      return polygons.length
        ? [
            {
              key: `${groupKey}:${bottomMm}:${topMm}`,
              floorLevel: group.floorLevel,
              bottomMeters: bottomMm / 1000,
              topMeters: topMm / 1000,
              polygons,
            },
          ]
        : [];
    });
  });
}

export function resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms,
  activeRoomId,
  cameraX,
  cameraZ,
  viewDirectionX,
  viewDirectionZ,
}: {
  rooms: readonly HousePlanRoom2D[];
  activeRoomId: string;
  cameraX: number;
  cameraZ: number;
  viewDirectionX?: number;
  viewDirectionZ?: number;
}): Set<string> {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  if (!activeRoom) return new Set();

  const suppliedViewMagnitude = Math.hypot(
    viewDirectionX ?? 0,
    viewDirectionZ ?? 0
  );
  const sourceDirectionX = suppliedViewMagnitude > 0.001
    ? -(viewDirectionX ?? 0) / suppliedViewMagnitude
    : cameraX - activeRoom.x;
  const sourceDirectionZ = suppliedViewMagnitude > 0.001
    ? -(viewDirectionZ ?? 0) / suppliedViewMagnitude
    : cameraZ - activeRoom.z;
  const sourceMagnitude = Math.hypot(sourceDirectionX, sourceDirectionZ);
  const normalizedSourceX = sourceMagnitude > 0.001
    ? sourceDirectionX / sourceMagnitude
    : 1 / Math.sqrt(2);
  const normalizedSourceZ = sourceMagnitude > 0.001
    ? sourceDirectionZ / sourceMagnitude
    : 1 / Math.sqrt(2);
  const planBounds = rooms.reduce(
    (bounds, room) => ({
      minX: Math.min(bounds.minX, room.x - room.w / 2),
      maxX: Math.max(bounds.maxX, room.x + room.w / 2),
      minZ: Math.min(bounds.minZ, room.z - room.d / 2),
      maxZ: Math.max(bounds.maxZ, room.z + room.d / 2),
    }),
    {
      minX: activeRoom.x - activeRoom.w / 2,
      maxX: activeRoom.x + activeRoom.w / 2,
      minZ: activeRoom.z - activeRoom.d / 2,
      maxZ: activeRoom.z + activeRoom.d / 2,
    }
  );
  const virtualCameraDistance =
    Math.hypot(
      planBounds.maxX - planBounds.minX,
      planBounds.maxZ - planBounds.minZ
    ) * 4 + 4;
  const stableCameraX =
    activeRoom.x + normalizedSourceX * virtualCameraDistance;
  const stableCameraZ =
    activeRoom.z + normalizedSourceZ * virtualCameraDistance;

  const cutawaySegmentKeys = new Set<string>();
  for (const room of rooms) {
    for (const segment of getWallSegments(room)) {
      if (getSharedWallOverlapRanges(room, rooms, segment).length > 0) {
        continue;
      }
      const opacity = resolveCutawayWallOpacity({
        cameraX: stableCameraX,
        cameraZ: stableCameraZ,
        roomX: room.x,
        roomZ: room.z,
        roomWidth: room.w,
        roomDepth: room.d,
        wall: segment.wall,
        baseOpacity: 1,
        cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,
        targetX: activeRoom.x,
        targetZ: activeRoom.z,
        targetWidth: activeRoom.w,
        targetDepth: activeRoom.d,
        wallCenterX: room.x + segment.x,
        wallCenterZ: room.z + segment.z,
        wallAxis: segment.axis,
        wallLength: segment.length,
      });
      if (opacity <= 0.01) cutawaySegmentKeys.add(segment.key);
    }
  }
  return cutawaySegmentKeys;
}

export function legacyCutawaySegmentKeySignature(keys: ReadonlySet<string>) {
  return [...keys].sort().join("|");
}
