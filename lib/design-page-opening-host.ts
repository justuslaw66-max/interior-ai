import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  buildRoomWallSegments2D,
  mergeSharedWallSegments2D,
  type RoomWallSegment2D,
} from "@/lib/room-renderer-2d-walls";
import {
  getCanonicalPlanLine,
  pointOnCanonicalPlanLine,
  pointOnPlanSegmentAtCoordinate,
  projectPointOntoPlanSegment,
  type PlanPoint2D,
} from "@/lib/wall-segment-geometry";

const HOST_TOLERANCE_METERS = 0.001;

function roundHostCoordinate(value: number) {
  return Number(value.toFixed(6));
}

export type OpeningHostInput = Pick<
  RoomOpening2D,
  | "id"
  | "roomId"
  | "wall"
  | "offsetMm"
  | "widthMm"
  | "canonicalWallId"
  | "requestedWorldCenterMm"
>;

export type DesignPagePhysicalWallHost = {
  physicalWallId: string;
  segment: RoomWallSegment2D;
  roomId: string;
  roomWall: RoomOpening2D["wall"];
  roomSegmentKey: string;
  roomSegment: RoomWallSegment2D;
  segmentOffsetMeters: number;
  alongSegmentMeters: number;
  worldCenter: PlanPoint2D;
  tangent: PlanPoint2D;
  inwardNormal: PlanPoint2D;
  spanMeters: number;
};

type OpeningHostFailure = {
  status: "unresolved" | "ambiguous" | "unsupported" | "invalid";
  code:
    | "NO_PHYSICAL_WALL"
    | "AMBIGUOUS_PHYSICAL_WALL"
    | "UNSUPPORTED_PHYSICAL_WALL"
    | "INVALID_OPENING_GEOMETRY";
  diagnostic: string;
  consumerMessage: string;
  requestedWorldCenter?: PlanPoint2D;
};

export type DesignPageOpeningHostResolution =
  | { status: "resolved"; host: DesignPagePhysicalWallHost }
  | OpeningHostFailure;

export type DesignPageOpeningHostContext = {
  walls: Array<{ floorLevel: number; segment: RoomWallSegment2D }>;
  roomsById: Map<string, HousePlanRoom2D>;
};

function roomFloorLevel(room: HousePlanRoom2D): number {
  return Number.isFinite(room.floorLevel) ? room.floorLevel ?? 1 : 1;
}

export function createDesignPageOpeningHostContext(
  rooms: readonly HousePlanRoom2D[]
): DesignPageOpeningHostContext {
  const roomsByFloor = new Map<number, HousePlanRoom2D[]>();
  for (const room of rooms.filter(roomHasSupportedWallTopology)) {
    const level = roomFloorLevel(room);
    roomsByFloor.set(level, [...(roomsByFloor.get(level) ?? []), room]);
  }
  return {
    walls: [...roomsByFloor.entries()].flatMap(([level, floorRooms]) =>
      mergeSharedWallSegments2D(buildRoomWallSegments2D(floorRooms)).map(
        (segment) => ({ floorLevel: level, segment })
      )
    ),
    roomsById: new Map(rooms.map((room) => [room.id, room])),
  };
}

function roomHasSupportedWallTopology(room: HousePlanRoom2D) {
  if (room.shape !== "custom_polygon") return true;
  return Boolean(
    room.polygon && room.polygon.length >= 3 &&
    room.polygon.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
  );
}

function planBounds(walls: DesignPageOpeningHostContext["walls"]) {
  if (!walls.length) return null;
  const segments = walls.map(({ segment }) => segment);
  return {
    minX: Math.min(...segments.flatMap((wall) => [wall.x1, wall.x2])),
    maxX: Math.max(...segments.flatMap((wall) => [wall.x1, wall.x2])),
    minZ: Math.min(...segments.flatMap((wall) => [wall.z1, wall.z2])),
    maxZ: Math.max(...segments.flatMap((wall) => [wall.z1, wall.z2])),
  };
}

function requestedAxis(opening: OpeningHostInput) {
  return opening.wall === "north" || opening.wall === "south" ? "x" : "z";
}

function nominalPointForRoom(
  opening: OpeningHostInput,
  room: HousePlanRoom2D
): PlanPoint2D {
  const offset = opening.offsetMm / 1000;
  if (opening.wall === "north") return { x: room.x + offset, z: room.z - room.d / 2 };
  if (opening.wall === "south") return { x: room.x + offset, z: room.z + room.d / 2 };
  if (opening.wall === "west") return { x: room.x - room.w / 2, z: room.z + offset };
  return { x: room.x + room.w / 2, z: room.z + offset };
}

function persistedRequestedWorldCenter(
  opening: OpeningHostInput
): PlanPoint2D | undefined {
  const point = opening.requestedWorldCenterMm;
  return point && Number.isFinite(point.x) && Number.isFinite(point.z)
    ? { x: point.x / 1000, z: point.z / 1000 }
    : undefined;
}

function nominalRoomlessPoint(
  opening: OpeningHostInput,
  topology: DesignPageOpeningHostContext
): PlanPoint2D | undefined {
  const bounds = planBounds(topology.walls);
  if (!bounds) return undefined;
  const axis = requestedAxis(opening);
  const along = (axis === "x"
    ? (bounds.minX + bounds.maxX) / 2
    : (bounds.minZ + bounds.maxZ) / 2) + opening.offsetMm / 1000;
  if (opening.wall === "north") return { x: along, z: bounds.minZ };
  if (opening.wall === "south") return { x: along, z: bounds.maxZ };
  if (opening.wall === "west") return { x: bounds.minX, z: along };
  return { x: bounds.maxX, z: along };
}

function roomSegmentProjection(
  room: HousePlanRoom2D,
  wall: RoomOpening2D["wall"],
  segment: RoomWallSegment2D
): { key: string; segment: RoomWallSegment2D } | null {
  const original = buildRoomWallSegments2D([room]).find((candidate) => {
    if (candidate.roomWalls[room.id] !== wall) return false;
    const start = projectPointOntoPlanSegment({ x: segment.x1, z: segment.z1 }, candidate);
    const end = projectPointOntoPlanSegment({ x: segment.x2, z: segment.z2 }, candidate);
    return Boolean(start && end &&
      Math.abs(start.perpendicular) <= HOST_TOLERANCE_METERS &&
      Math.abs(end.perpendicular) <= HOST_TOLERANCE_METERS &&
      Math.min(start.alongFromStart, end.alongFromStart) >= -HOST_TOLERANCE_METERS &&
      Math.max(start.alongFromStart, end.alongFromStart) <= start.frame.length + HOST_TOLERANCE_METERS);
  });
  return original
    ? { key: room.shape === "rectangle" ? `${room.id}-${wall}` : original.key, segment: original }
    : null;
}

function buildResolvedHost(
  topology: DesignPageOpeningHostContext,
  floor: number,
  segment: RoomWallSegment2D,
  opening: OpeningHostInput,
  worldCenter: PlanPoint2D
): DesignPagePhysicalWallHost | null {
  const projected = projectPointOntoPlanSegment(worldCenter, segment);
  if (!projected) return null;
  const preferredRoomIds = opening.roomId
    ? [opening.roomId]
    : segment.roomIds
        .filter((roomId) => segment.roomWalls[roomId] === opening.wall)
        .sort();
  const roomId = preferredRoomIds[0];
  const room = roomId ? topology.roomsById.get(roomId) : undefined;
  if (!room) return null;
  const roomWall = segment.roomWalls[roomId];
  if (!roomWall) return null;
  const roomProjection = roomSegmentProjection(room, roomWall, segment);
  if (!roomProjection) return null;
  const towardRoom = {
    x: room.x - projected.projected.x,
    z: room.z - projected.projected.z,
  };
  const normalFacesRoom =
    projected.frame.normal.x * towardRoom.x +
      projected.frame.normal.z * towardRoom.z >= 0;
  const inwardNormal = normalFacesRoom
    ? projected.frame.normal
    : { x: -projected.frame.normal.x, z: -projected.frame.normal.z };
  return {
    physicalWallId: `floor:${floor}:${segment.key}`,
    segment,
    roomId,
    roomWall,
    roomSegmentKey: roomProjection.key,
    roomSegment: roomProjection.segment,
    segmentOffsetMeters: roundHostCoordinate(projected.offsetFromCenter),
    alongSegmentMeters: roundHostCoordinate(projected.alongFromStart),
    worldCenter: {
      x: roundHostCoordinate(projected.projected.x),
      z: roundHostCoordinate(projected.projected.z),
    },
    tangent: projected.frame.tangent,
    inwardNormal,
    spanMeters: projected.frame.length,
  };
}

type Candidate = {
  floorLevel: number;
  segment: RoomWallSegment2D;
  point: PlanPoint2D;
};

function originalRoomSegmentContaining(
  segment: RoomWallSegment2D,
  originals: readonly RoomWallSegment2D[]
) {
  return originals.find((candidate) => {
    const start = projectPointOntoPlanSegment({ x: segment.x1, z: segment.z1 }, candidate);
    const end = projectPointOntoPlanSegment({ x: segment.x2, z: segment.z2 }, candidate);
    if (!start || !end) return false;
    return Math.abs(start.perpendicular) <= HOST_TOLERANCE_METERS &&
      Math.abs(end.perpendicular) <= HOST_TOLERANCE_METERS &&
      Math.min(start.alongFromStart, end.alongFromStart) >= -HOST_TOLERANCE_METERS &&
      Math.max(start.alongFromStart, end.alongFromStart) <= start.frame.length + HOST_TOLERANCE_METERS;
  });
}

function requestedPointOnOriginalSegment(
  opening: OpeningHostInput,
  original: RoomWallSegment2D | undefined
) {
  const line = original ? getCanonicalPlanLine(original) : null;
  return line ? pointOnCanonicalPlanLine(
    line.tangent,
    line.normal,
    line.lineOffset,
    (line.low + line.high) / 2 + opening.offsetMm / 1000
  ) : null;
}

function owningRoomCandidates(
  opening: OpeningHostInput,
  topology: DesignPageOpeningHostContext,
  room: HousePlanRoom2D
): Candidate[] {
  const originalSegments = buildRoomWallSegments2D([room]).filter(
    (segment) => segment.roomWalls[room.id] === opening.wall
  );
  return topology.walls.flatMap(({ floorLevel, segment }) => {
    if (floorLevel !== roomFloorLevel(room)) return [];
    if (!segment.roomIds.includes(room.id)) return [];
    if (segment.roomWalls[room.id] !== opening.wall) return [];
    const requestedPoint = requestedPointOnOriginalSegment(
      opening,
      originalRoomSegmentContaining(segment, originalSegments)
    );
    if (!requestedPoint) return [];
    const projected = projectPointOntoPlanSegment(requestedPoint, segment);
    if (!projected || Math.abs(projected.perpendicular) > HOST_TOLERANCE_METERS ||
        projected.alongFromStart < -HOST_TOLERANCE_METERS ||
        projected.alongFromStart > projected.frame.length + HOST_TOLERANCE_METERS) return [];
    return [{ floorLevel, segment, point: projected.projected }];
  });
}

function roomlessCandidates(
  opening: OpeningHostInput,
  topology: DesignPageOpeningHostContext
): Candidate[] {
  const nominal = nominalRoomlessPoint(opening, topology);
  if (!nominal) return [];
  const axis = requestedAxis(opening);
  const value = axis === "x" ? nominal.x : nominal.z;
  const intersections = topology.walls.flatMap(({ floorLevel, segment }) => {
    if (!segment.roomIds.some((roomId) => segment.roomWalls[roomId] === opening.wall)) {
      return [];
    }
    const point = pointOnPlanSegmentAtCoordinate(segment, axis, value);
    return point ? [{ floorLevel, segment, point }] : [];
  });
  if (!intersections.length) return [];
  const coordinate = (candidate: Candidate) =>
    opening.wall === "north" || opening.wall === "south"
      ? candidate.point.z
      : candidate.point.x;
  const edgeValue = opening.wall === "north" || opening.wall === "west"
    ? Math.min(...intersections.map(coordinate))
    : Math.max(...intersections.map(coordinate));
  const nominalEdge = opening.wall === "north" || opening.wall === "south"
    ? nominal.z
    : nominal.x;
  if (Math.abs(edgeValue - nominalEdge) > HOST_TOLERANCE_METERS) return [];
  return intersections.filter(
    (candidate) => Math.abs(coordinate(candidate) - edgeValue) <= HOST_TOLERANCE_METERS
  );
}

function consumerMessage(status: OpeningHostFailure["status"]) {
  if (status === "ambiguous") {
    return "This opening matches more than one wall. Choose its intended wall before it can cut the plan.";
  }
  if (status === "unsupported") {
    return "This wall shape is not supported for physical openings yet. Reassign the opening to a supported wall.";
  }
  if (status === "invalid") {
    return "This opening has invalid width or placement values. Repair them before it can cut the plan.";
  }
  return "This opening is not attached to a physical wall. Reassign its wall before it can cut the plan.";
}

function hostFailure(
  status: OpeningHostFailure["status"],
  diagnostic: string,
  requestedWorldCenter?: PlanPoint2D,
  message = consumerMessage(status)
): OpeningHostFailure {
  const code = status === "ambiguous" ? "AMBIGUOUS_PHYSICAL_WALL"
    : status === "unsupported" ? "UNSUPPORTED_PHYSICAL_WALL"
      : status === "invalid" ? "INVALID_OPENING_GEOMETRY" : "NO_PHYSICAL_WALL";
  return { status, code, diagnostic, consumerMessage: message, requestedWorldCenter };
}

export function resolveDesignPageOpeningHostWithContext(
  opening: OpeningHostInput,
  topology: DesignPageOpeningHostContext
): DesignPageOpeningHostResolution {
  const persistedWorldCenter = persistedRequestedWorldCenter(opening);
  if (!Number.isFinite(opening.offsetMm) ||
      !Number.isFinite(opening.widthMm) || opening.widthMm <= 0) {
    return hostFailure("invalid", `Opening ${opening.id} has invalid placement geometry.`,
      persistedWorldCenter ?? nominalRoomlessPoint(opening, topology));
  }

  const owningRoom = opening.roomId
    ? topology.roomsById.get(opening.roomId)
    : undefined;
  const requestedRoom = owningRoom;
  if (requestedRoom && !roomHasSupportedWallTopology(requestedRoom)) {
    return hostFailure("unsupported",
      `Opening ${opening.id} belongs to a custom room without a finite closed wall polygon.`,
      nominalPointForRoom(opening, requestedRoom));
  }
  if (opening.roomId && !owningRoom) {
    return hostFailure("unresolved",
      `Opening ${opening.id} refers to missing room ${opening.roomId}.`,
      persistedWorldCenter,
      "The original room and wall are unavailable. Choose a new wall before this opening can cut the plan.");
  }
  const candidates = owningRoom
    ? owningRoomCandidates(opening, topology, owningRoom)
    : roomlessCandidates(opening, topology);
  const resolved = candidates.flatMap(({ floorLevel, segment, point }) => {
    const host = buildResolvedHost(topology, floorLevel, segment, opening, point);
    return host ? [host] : [];
  });
  if (resolved.length === 1) return { status: "resolved", host: resolved[0] };
  const requestedWorldCenter = persistedWorldCenter ?? (owningRoom
    ? nominalPointForRoom(opening, owningRoom)
    : nominalRoomlessPoint(opening, topology));
  if (resolved.length > 1) {
    return hostFailure("ambiguous",
      `Opening ${opening.id} matches multiple physical wall segments.`, requestedWorldCenter);
  }
  return hostFailure("unresolved",
    `Opening ${opening.id} does not resolve to a physical wall segment.`, requestedWorldCenter);
}

export function resolveDesignPageOpeningHost(
  opening: OpeningHostInput,
  rooms: readonly HousePlanRoom2D[]
): DesignPageOpeningHostResolution {
  return resolveDesignPageOpeningHostWithContext(
    opening,
    createDesignPageOpeningHostContext(rooms)
  );
}

export function resolveDesignPageOpeningHosts<TOpening extends OpeningHostInput>(
  openings: readonly TOpening[],
  rooms: readonly HousePlanRoom2D[]
) {
  const context = createDesignPageOpeningHostContext(rooms);
  return openings.map((opening) => ({
    opening,
    resolution: resolveDesignPageOpeningHostWithContext(opening, context),
  }));
}
