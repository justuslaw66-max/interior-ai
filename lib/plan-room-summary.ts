import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

export type PlanRoomMetric = {
  id: string;
  name: string;
  widthMeters: number;
  depthMeters: number;
  areaSquareMeters: number;
};

export type PlanRoomSummary = {
  roomCount: number;
  widthMeters: number;
  depthMeters: number;
  areaSquareMeters: number;
  rooms: PlanRoomMetric[];
};

export type PlanRoomSelection = {
  ids: string[];
  primaryId: string | null;
};

export function resolvePlanRoomSelection(
  currentIds: readonly string[],
  roomId: string,
  additive: boolean
): PlanRoomSelection {
  if (!additive) return { ids: [roomId], primaryId: roomId };
  const uniqueIds = Array.from(new Set(currentIds));
  const ids = uniqueIds.includes(roomId)
    ? uniqueIds.filter((id) => id !== roomId)
    : [...uniqueIds, roomId];
  return {
    ids,
    primaryId: ids.includes(roomId) ? roomId : ids.at(-1) ?? null,
  };
}

type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function polygonArea(points: Array<{ x: number; z: number }>): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) / 2;
}

function getRoomLocalPoints(room: HousePlanRoom2D): Array<{ x: number; z: number }> {
  if (room.polygon && room.polygon.length >= 3) return room.polygon;
  return [
    { x: -room.w / 2, z: -room.d / 2 },
    { x: room.w / 2, z: -room.d / 2 },
    { x: room.w / 2, z: room.d / 2 },
    { x: -room.w / 2, z: room.d / 2 },
  ];
}

function getRoomBounds(room: HousePlanRoom2D): Bounds {
  return getRoomLocalPoints(room).reduce<Bounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, room.x + point.x),
      maxX: Math.max(bounds.maxX, room.x + point.x),
      minZ: Math.min(bounds.minZ, room.z + point.z),
      maxZ: Math.max(bounds.maxZ, room.z + point.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
}

function getRoomArea(room: HousePlanRoom2D): number {
  const outerArea = polygonArea(getRoomLocalPoints(room));
  const holesArea = (room.holes ?? []).reduce(
    (sum, hole) => sum + polygonArea(hole),
    0
  );
  return Math.max(0, outerArea - holesArea);
}

export function buildPlanRoomSummary(
  rooms: readonly HousePlanRoom2D[]
): PlanRoomSummary {
  if (rooms.length === 0) {
    return {
      roomCount: 0,
      widthMeters: 0,
      depthMeters: 0,
      areaSquareMeters: 0,
      rooms: [],
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const roomMetrics = rooms.map((room) => {
    const bounds = getRoomBounds(room);
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minZ = Math.min(minZ, bounds.minZ);
    maxZ = Math.max(maxZ, bounds.maxZ);
    return {
      id: room.id,
      name: room.name,
      widthMeters: bounds.maxX - bounds.minX,
      depthMeters: bounds.maxZ - bounds.minZ,
      areaSquareMeters: getRoomArea(room),
    };
  });

  return {
    roomCount: rooms.length,
    widthMeters: maxX - minX,
    depthMeters: maxZ - minZ,
    areaSquareMeters: roomMetrics.reduce(
      (sum, room) => sum + room.areaSquareMeters,
      0
    ),
    rooms: roomMetrics,
  };
}
