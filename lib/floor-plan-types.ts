import {
  migrateToV3,
  type DesignSnapshot,
  type RoomPlanShape,
  type RoomSnapshot,
  type RoomType,
} from "@/lib/room-types";

export type FloorPlanSource = "manual" | "room_snapshot" | "uploaded" | "ai_detected" | "cad_imported";

export type FloorPlanPoint = {
  x: number;
  z: number;
};

export type FloorPlanDrawRoomMode = "straight_wall" | "rectangle_wall" | "arc_wall";

export type FloorPlanWall = {
  id: string;
  floorId: string;
  start: FloorPlanPoint;
  end: FloorPlanPoint;
  thickness: number;
  height: number;
  roomIds: string[];
  source: FloorPlanSource;
};

export type FloorPlanOpeningKind = "door" | "window" | "opening";

export type FloorPlanOpening = {
  id: string;
  floorId: string;
  wallId: string;
  kind: FloorPlanOpeningKind;
  offset: number;
  width: number;
  height?: number;
  sillHeight?: number;
  source: FloorPlanSource;
};

export type FloorPlanScaleCalibration = {
  pixelsPerMeter: number;
  referenceLengthMeters: number;
  referencePointsPx: [
    { x: number; y: number },
    { x: number; y: number },
  ];
};

export type FloorPlanUnderlay = {
  id: string;
  floorId: string;
  name: string;
  assetUrl: string;
  mimeType: string;
  sourceMimeType?: string;
  renderedPage?: number;
  pageCount?: number;
  widthPx?: number;
  heightPx?: number;
  position: FloorPlanPoint;
  widthMeters: number;
  depthMeters: number;
  opacity: number;
  rotationDeg: number;
  locked: boolean;
  calibration?: FloorPlanScaleCalibration;
};

export type FloorPlanRoom = {
  id: string;
  floorId: string;
  sourceRoomId?: string;
  name: string;
  roomType: RoomType;
  polygon: FloorPlanPoint[];
  areaSqm: number;
  source: FloorPlanSource;
};

export type FloorPlanFloor = {
  id: string;
  name: string;
  levelIndex: number;
  elevation: number;
  defaultRoomHeight: number;
  rooms: FloorPlanRoom[];
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  underlays: FloorPlanUnderlay[];
};

export type FloorPlanSnapshot = {
  version: 1;
  units: "m";
  activeFloorId: string;
  activeRoomId?: string;
  floors: FloorPlanFloor[];
};

type BuildFloorPlanOptions = {
  floorId?: string;
  floorName?: string;
  levelIndex?: number;
  elevation?: number;
};

function roundMeters(value: number): number {
  return Number(value.toFixed(3));
}

function makePoint(x: number, z: number): FloorPlanPoint {
  return {
    x: roundMeters(x),
    z: roundMeters(z),
  };
}

function getRoomOutlineLocalPoints(
  width: number,
  depth: number,
  shape: RoomPlanShape,
  polygon?: FloorPlanPoint[]
): FloorPlanPoint[] {
  if (shape === "custom_polygon" && polygon && polygon.length >= 3) {
    return polygon.map((point) => makePoint(point.x, point.z));
  }

  const left = -width / 2;
  const right = width / 2;
  const top = -depth / 2;
  const bottom = depth / 2;

  if (shape === "l_shape") {
    const notchW = width * 0.42;
    const notchD = depth * 0.42;
    return [
      makePoint(left, top),
      makePoint(right, top),
      makePoint(right, bottom - notchD),
      makePoint(right - notchW, bottom - notchD),
      makePoint(right - notchW, bottom),
      makePoint(left, bottom),
    ];
  }

  return [
    makePoint(left, top),
    makePoint(right, top),
    makePoint(right, bottom),
    makePoint(left, bottom),
  ];
}

function getRoomOrigin(room: RoomSnapshot): FloorPlanPoint {
  return makePoint(room.planPosition?.x ?? 0, room.planPosition?.z ?? 0);
}

export function buildFloorPlanRoomPolygon(room: RoomSnapshot): FloorPlanPoint[] {
  const width = room.geometry.width;
  const depth = room.geometry.depth;
  const shape = room.planShape ?? "rectangle";
  const origin = getRoomOrigin(room);

  return getRoomOutlineLocalPoints(width, depth, shape, room.planPolygon).map((point) =>
    makePoint(origin.x + point.x, origin.z + point.z)
  );
}

export function calculateFloorPlanPolygonAreaSqm(points: FloorPlanPoint[]): number {
  if (points.length < 3) return 0;

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }

  return roundMeters(Math.abs(twiceArea) / 2);
}

function pointKey(point: FloorPlanPoint): string {
  return `${roundMeters(point.x)}:${roundMeters(point.z)}`;
}

function segmentKey(start: FloorPlanPoint, end: FloorPlanPoint): string {
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function buildRoomWallSegments(params: {
  floorId: string;
  room: RoomSnapshot;
  polygon: FloorPlanPoint[];
}): FloorPlanWall[] {
  const { floorId, room, polygon } = params;
  const wallThickness = room.geometry.wallThickness ?? 0.12;
  const wallHeight = room.geometry.height ?? 2.6;

  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return {
      id: `${floorId}_wall_${room.id}_${index + 1}`,
      floorId,
      start,
      end,
      thickness: wallThickness,
      height: wallHeight,
      roomIds: [room.id],
      source: "room_snapshot" as const,
    };
  });
}

function mergeExactSharedWalls(walls: FloorPlanWall[]): FloorPlanWall[] {
  const wallsBySegment = new Map<string, FloorPlanWall>();

  for (const wall of walls) {
    const key = segmentKey(wall.start, wall.end);
    const existing = wallsBySegment.get(key);

    if (!existing) {
      wallsBySegment.set(key, wall);
      continue;
    }

    wallsBySegment.set(key, {
      ...existing,
      id: existing.id < wall.id ? existing.id : wall.id,
      thickness: Math.max(existing.thickness, wall.thickness),
      height: Math.max(existing.height, wall.height),
      roomIds: Array.from(new Set([...existing.roomIds, ...wall.roomIds])).sort(),
    });
  }

  return Array.from(wallsBySegment.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildFloorPlanFromRooms(
  rooms: RoomSnapshot[],
  options: BuildFloorPlanOptions = {}
): FloorPlanSnapshot {
  const floorId = options.floorId ?? "floor_1";
  const floorName = options.floorName ?? "Level 1";
  const levelIndex = options.levelIndex ?? 0;
  const elevation = options.elevation ?? 0;
  const defaultRoomHeight = Math.max(
    2.4,
    ...rooms.map((room) => room.geometry.height ?? 2.6)
  );

  const floorRooms = rooms.map((room): FloorPlanRoom => {
    const polygon = buildFloorPlanRoomPolygon(room);
    return {
      id: `${floorId}_room_${room.id}`,
      floorId,
      sourceRoomId: room.id,
      name: room.name,
      roomType: room.roomType,
      polygon,
      areaSqm: calculateFloorPlanPolygonAreaSqm(polygon),
      source: "room_snapshot",
    };
  });

  const roomWalls = rooms.flatMap((room) =>
    buildRoomWallSegments({
      floorId,
      room,
      polygon: buildFloorPlanRoomPolygon(room),
    })
  );

  return {
    version: 1,
    units: "m",
    activeFloorId: floorId,
    activeRoomId: floorRooms[0]?.id,
    floors: [
      {
        id: floorId,
        name: floorName,
        levelIndex,
        elevation,
        defaultRoomHeight,
        rooms: floorRooms,
        walls: mergeExactSharedWalls(roomWalls),
        openings: [],
        underlays: [],
      },
    ],
  };
}

export function buildFloorPlanFromDesignSnapshot(
  snapshot: DesignSnapshot,
  options: BuildFloorPlanOptions = {}
): FloorPlanSnapshot {
  const migrated = migrateToV3(snapshot);
  const floorPlan = buildFloorPlanFromRooms(migrated.rooms, options);
  const activeRoom = floorPlan.floors[0]?.rooms.find(
    (room) => room.sourceRoomId === migrated.activeRoomId
  );

  return {
    ...floorPlan,
    activeRoomId: activeRoom?.id ?? floorPlan.activeRoomId,
  };
}
