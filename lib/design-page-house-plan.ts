import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";
import type { RoomPlanShape, RoomSnapshot, RoomType } from "@/lib/room-types";

export const ROOM_DIMENSION_DEFAULTS = {
  width: 5,
  depth: 4,
  wallThickness: 0.12,
  roomHeight: 2.6,
  min: 1.8,
  max: 20,
} as const;

export const HOUSE_ROOM_TYPES: Array<{ type: RoomType; label: string }> = [
  { type: "living", label: "Living Room" },
  { type: "bedroom", label: "Bedroom" },
  { type: "kitchen", label: "Kitchen" },
  { type: "toilet", label: "Bathroom" },
  { type: "dining", label: "Dining Room" },
  { type: "custom", label: "Custom Room" },
];

export const HOUSE_ROOM_SHAPES: Array<{ shape: RoomPlanShape; label: string }> = [
  { shape: "rectangle", label: "Rectangle" },
  { shape: "l_shape", label: "L-shape" },
];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: "Living Room",
  bedroom: "Bedroom",
  dining: "Dining Room",
  kitchen: "Kitchen",
  toilet: "Bathroom",
  custom: "Custom Room",
};

export type HouseRoomTemplateId =
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "dining";

export type HousePlanTemplateId =
  | "studio"
  | "living_dining"
  | "compact_two_bed";

export type HousePlanTemplateRoom = {
  id: string;
  name: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
  x: number;
  z: number;
};

export type HousePlanTemplate = {
  id: HousePlanTemplateId;
  label: string;
  summary: string;
  rooms: HousePlanTemplateRoom[];
};

export const HOUSE_PLAN_TEMPLATES: HousePlanTemplate[] = [
  {
    id: "studio",
    label: "Studio starter",
    summary: "Living, kitchen, and bathroom",
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 5.6,
        depth: 4,
        x: 0,
        z: 0,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3,
        depth: 4,
        x: 4.3,
        z: 0,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 7,
        z: -0.9,
      },
    ],
  },
  {
    id: "living_dining",
    label: "Living + dining",
    summary: "Open living, dining, and kitchen run",
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 5.6,
        depth: 4.2,
        x: 0,
        z: 0,
      },
      {
        id: "dining",
        name: "Dining Room",
        roomType: "dining",
        shape: "rectangle",
        width: 3.6,
        depth: 4.2,
        x: 4.6,
        z: 0,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3.2,
        depth: 4.2,
        x: 8,
        z: 0,
      },
    ],
  },
  {
    id: "compact_two_bed",
    label: "Compact 2-bed",
    summary: "Living, kitchen, two bedrooms, bath",
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 5.2,
        depth: 4,
        x: 0,
        z: 0,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3.2,
        depth: 4,
        x: 4.2,
        z: 0,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 4,
        depth: 3.4,
        x: -0.6,
        z: -3.7,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.2,
        depth: 3.4,
        x: 3,
        z: -3.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.2,
        depth: 2.2,
        x: 5.7,
        z: -3.1,
      },
    ],
  },
];

export const HOUSE_ROOM_TEMPLATES: Array<{
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
}> = [
  {
    id: "bedroom",
    label: "Bedroom",
    roomType: "bedroom",
    shape: "rectangle",
    width: 4,
    depth: 3.6,
  },
  {
    id: "kitchen",
    label: "Kitchen",
    roomType: "kitchen",
    shape: "rectangle",
    width: 3.6,
    depth: 3,
  },
  {
    id: "bathroom",
    label: "Bathroom",
    roomType: "toilet",
    shape: "rectangle",
    width: 2.4,
    depth: 2.2,
  },
  {
    id: "dining",
    label: "Dining",
    roomType: "dining",
    shape: "rectangle",
    width: 4,
    depth: 3.4,
  },
];

export type RoomSizePresetId =
  | "living_small"
  | "living_medium"
  | "open_plan"
  | "custom";

export const ROOM_SIZE_PRESETS: Array<{
  id: Exclude<RoomSizePresetId, "custom">;
  label: string;
  width: number;
  depth: number;
}> = [
  { id: "living_small", label: "Small Living (5 x 4m)", width: 5, depth: 4 },
  { id: "living_medium", label: "Medium Living (6 x 4.5m)", width: 6, depth: 4.5 },
  { id: "open_plan", label: "Open Plan (7.2 x 5m)", width: 7.2, depth: 5 },
];

export type HousePlanRoom2D = {
  id: string;
  name: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  polygon?: Array<{ x: number; z: number }>;
  x: number;
  z: number;
  w: number;
  d: number;
};

export type HousePlan2D = {
  rooms: HousePlanRoom2D[];
  width: number;
  depth: number;
};

export type HouseRoomAdjacencyGuide = {
  id: string;
  roomIds: [string, string];
  orientation: "vertical" | "horizontal";
  points: [[number, number], [number, number]];
  labelPosition: { x: number; z: number };
  lengthMeters: number;
};

export type HouseRoomSnapPreview = HouseRoomAdjacencyGuide & {
  x: number;
  z: number;
  targetRoomId: string;
  targetRoomName: string;
  label: string;
};

export type HouseRoomDoorwaySuggestion = {
  id: string;
  roomId: string;
  adjacentRoomId: string;
  adjacentRoomName: string;
  wall: "north" | "south" | "east" | "west";
  offsetMeters: number;
  widthMeters: number;
  points: [[number, number], [number, number]];
  labelPosition: { x: number; z: number };
  label: string;
};

export type HouseRoomConnectionOpening = {
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offsetMm: number;
  widthMm: number;
  kind: "door" | "window";
};

export type HouseRoomConnectionChecklistItem = {
  id: string;
  roomIds: [string, string];
  roomNames: [string, string];
  sharedWallLengthMeters: number;
  status: "connected" | "needs_doorway";
  doorwaySuggestion?: HouseRoomDoorwaySuggestion;
};

export type FloorPlanDrawCancelDecision = {
  shouldHandle: boolean;
  clearRoomPoints: boolean;
  clearRoomPreview: boolean;
  exitRoomDrawMode: boolean;
};

export type FloorPlanOpeningCancelDecision = {
  shouldHandle: boolean;
  clearOpeningPoints: boolean;
  exitOpeningMode: boolean;
};

export function resolveFloorPlanDrawCancelDecision({
  traceRoomMode,
  pointCount,
}: {
  traceRoomMode: boolean;
  drawMode: FloorPlanDrawRoomMode;
  pointCount: number;
}): FloorPlanDrawCancelDecision {
  if (!traceRoomMode) {
    return {
      shouldHandle: false,
      clearRoomPoints: false,
      clearRoomPreview: false,
      exitRoomDrawMode: false,
    };
  }

  const hasActiveDraw = pointCount > 0;
  return {
    shouldHandle: true,
    clearRoomPoints: true,
    clearRoomPreview: true,
    exitRoomDrawMode: !hasActiveDraw,
  };
}

export function resolveFloorPlanOpeningCancelDecision({
  traceOpeningMode,
  pointCount,
}: {
  traceOpeningMode: boolean;
  pointCount: number;
}): FloorPlanOpeningCancelDecision {
  if (!traceOpeningMode && pointCount === 0) {
    return {
      shouldHandle: false,
      clearOpeningPoints: false,
      exitOpeningMode: false,
    };
  }

  const hasActiveTrace = pointCount > 0;
  return {
    shouldHandle: true,
    clearOpeningPoints: true,
    exitOpeningMode: !hasActiveTrace,
  };
}

export function clampRoomDimension(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.min,
    Math.min(ROOM_DIMENSION_DEFAULTS.max, Number(value))
  );
}

export function getRoomTypeLabel(roomType: RoomType): string {
  return ROOM_TYPE_LABELS[roomType] ?? "Room";
}

export function resolveNewRoomName(rooms: RoomSnapshot[], roomType: RoomType): string {
  const roomTypeCount = rooms.filter((room) => room.roomType === roomType).length;
  const baseName = getRoomTypeLabel(roomType);
  return roomTypeCount > 0 ? `${baseName} ${roomTypeCount + 1}` : baseName;
}

export function buildHousePlan2D(
  rooms: RoomSnapshot[],
  fallbackWidth: number,
  fallbackDepth: number
): HousePlan2D {
  if (!rooms.length) {
    return { rooms: [], width: fallbackWidth, depth: fallbackDepth };
  }

  let rightEdge = 0;
  const placedRooms = rooms.map((room, index) => {
    const w = room.geometry.width || ROOM_DIMENSION_DEFAULTS.width;
    const d = room.geometry.depth || ROOM_DIMENSION_DEFAULTS.depth;
    const storedX = room.planPosition?.x;
    const storedZ = room.planPosition?.z;
    const fallbackX = index === 0 ? 0 : rightEdge + w / 2;

    if (index === 0) {
      rightEdge = w / 2;
    } else {
      rightEdge += w;
    }

    return {
      id: room.id,
      name: room.name,
      roomType: room.roomType,
      shape: room.planShape ?? "rectangle",
      ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
      x: typeof storedX === "number" && Number.isFinite(storedX) ? storedX : fallbackX,
      z: typeof storedZ === "number" && Number.isFinite(storedZ) ? storedZ : 0,
      w,
      d,
    };
  });

  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;

  for (const room of placedRooms) {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  }

  const widthFromOrigin = Math.max(Math.abs(minX), Math.abs(maxX)) * 2;
  const depthFromOrigin = Math.max(Math.abs(minZ), Math.abs(maxZ)) * 2;

  return {
    rooms: placedRooms,
    width: Math.max(fallbackWidth, widthFromOrigin),
    depth: Math.max(fallbackDepth, depthFromOrigin),
  };
}

export function getActiveRoomPlanOffset(
  rooms: HousePlanRoom2D[],
  activeRoomId: string
): { x: number; z: number } {
  const room = rooms.find((entry) => entry.id === activeRoomId);
  return { x: room?.x ?? 0, z: room?.z ?? 0 };
}

export function getNextRoomPlanPosition(
  rooms: HousePlanRoom2D[],
  fallbackRoomWidth: number,
  newRoomWidth: number
): { x: number; z: number } {
  const rightEdge = rooms.reduce(
    (edge, room) => Math.max(edge, room.x + room.w / 2),
    fallbackRoomWidth / 2
  );

  return {
    x: rightEdge + newRoomWidth / 2,
    z: 0,
  };
}

function getHouseRoomBounds(
  x: number,
  z: number,
  w: number,
  d: number
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: x - w / 2,
    right: x + w / 2,
    top: z - d / 2,
    bottom: z + d / 2,
  };
}

function getHouseRoomOverlapArea(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number }
): number {
  const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const overlapDepth = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  if (overlapWidth <= 0 || overlapDepth <= 0) return 0;
  return overlapWidth * overlapDepth;
}

export function doesHouseRoomOverlap(
  roomId: string,
  x: number,
  z: number,
  w: number,
  d: number,
  rooms: HousePlanRoom2D[],
  tolerance = 0.01
): boolean {
  const candidate = getHouseRoomBounds(x, z, w, d);

  return rooms.some((room) => {
    if (room.id === roomId) return false;

    const other = getHouseRoomBounds(room.x, room.z, room.w, room.d);
    return (
      candidate.left < other.right - tolerance &&
      candidate.right > other.left + tolerance &&
      candidate.top < other.bottom - tolerance &&
      candidate.bottom > other.top + tolerance
    );
  });
}

export function shouldReplaceStarterRoomWithDrawnRoom({
  activeRoom,
  rooms,
  x,
  z,
  w,
  d,
  tolerance = 0.01,
  minCandidateOverlapRatio = 0.55,
}: {
  activeRoom: RoomSnapshot | null | undefined;
  rooms: HousePlanRoom2D[];
  x: number;
  z: number;
  w: number;
  d: number;
  tolerance?: number;
  minCandidateOverlapRatio?: number;
}): boolean {
  if (!activeRoom || rooms.length !== 1) return false;
  if ((activeRoom.items?.length ?? 0) > 0 || (activeRoom.zones?.length ?? 0) > 0) return false;

  const activePlanRoom = rooms.find((room) => room.id === activeRoom.id);
  if (!activePlanRoom) return false;

  const candidate = getHouseRoomBounds(x, z, w, d);
  const starter = getHouseRoomBounds(
    activePlanRoom.x,
    activePlanRoom.z,
    activePlanRoom.w,
    activePlanRoom.d
  );
  const candidateCenterInsideStarter =
    x > starter.left + tolerance &&
    x < starter.right - tolerance &&
    z > starter.top + tolerance &&
    z < starter.bottom - tolerance;
  if (!candidateCenterInsideStarter) return false;

  const overlapArea = getHouseRoomOverlapArea(candidate, starter);
  if (overlapArea <= 0) return false;

  const candidateArea = Math.max(w * d, tolerance);
  return overlapArea / candidateArea >= minCandidateOverlapRatio;
}

export function snapHouseRoomMove(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[],
  snapDistance = 0.18
): { x: number; z: number } | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return null;

  let nextX = x;
  let nextZ = z;

  for (const other of rooms) {
    if (other.id === roomId) continue;

    const movingLeft = nextX - moving.w / 2;
    const movingRight = nextX + moving.w / 2;
    const movingTop = nextZ - moving.d / 2;
    const movingBottom = nextZ + moving.d / 2;
    const otherLeft = other.x - other.w / 2;
    const otherRight = other.x + other.w / 2;
    const otherTop = other.z - other.d / 2;
    const otherBottom = other.z + other.d / 2;

    if (Math.abs(movingLeft - otherRight) < snapDistance) {
      nextX = otherRight + moving.w / 2;
    } else if (Math.abs(movingRight - otherLeft) < snapDistance) {
      nextX = otherLeft - moving.w / 2;
    }

    if (Math.abs(movingTop - otherBottom) < snapDistance) {
      nextZ = otherBottom + moving.d / 2;
    } else if (Math.abs(movingBottom - otherTop) < snapDistance) {
      nextZ = otherTop - moving.d / 2;
    }
  }

  if (doesHouseRoomOverlap(roomId, nextX, nextZ, moving.w, moving.d, rooms)) {
    return { x: moving.x, z: moving.z };
  }

  return { x: nextX, z: nextZ };
}

export function roundPlanCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

export function buildHouseRoomAdjacencyGuides(
  rooms: HousePlanRoom2D[],
  toleranceMeters = 0.04,
  minSharedWallMeters = 0.45
): HouseRoomAdjacencyGuide[] {
  const guides: HouseRoomAdjacencyGuide[] = [];

  for (let i = 0; i < rooms.length; i += 1) {
    const first = rooms[i];
    const firstBounds = getHouseRoomBounds(first.x, first.z, first.w, first.d);

    for (let j = i + 1; j < rooms.length; j += 1) {
      const second = rooms[j];
      const secondBounds = getHouseRoomBounds(second.x, second.z, second.w, second.d);
      const verticalOverlapTop = Math.max(firstBounds.top, secondBounds.top);
      const verticalOverlapBottom = Math.min(firstBounds.bottom, secondBounds.bottom);
      const verticalOverlap = verticalOverlapBottom - verticalOverlapTop;
      const horizontalOverlapLeft = Math.max(firstBounds.left, secondBounds.left);
      const horizontalOverlapRight = Math.min(firstBounds.right, secondBounds.right);
      const horizontalOverlap = horizontalOverlapRight - horizontalOverlapLeft;
      const rightToLeftGap = Math.abs(firstBounds.right - secondBounds.left);
      const leftToRightGap = Math.abs(firstBounds.left - secondBounds.right);
      const bottomToTopGap = Math.abs(firstBounds.bottom - secondBounds.top);
      const topToBottomGap = Math.abs(firstBounds.top - secondBounds.bottom);

      if (verticalOverlap >= minSharedWallMeters && rightToLeftGap <= toleranceMeters) {
        const x = roundPlanCoordinate((firstBounds.right + secondBounds.left) / 2);
        guides.push({
          id: `${first.id}-${second.id}-vertical-east-west`,
          roomIds: [first.id, second.id],
          orientation: "vertical",
          points: [
            [x, roundPlanCoordinate(verticalOverlapTop)],
            [x, roundPlanCoordinate(verticalOverlapBottom)],
          ],
          labelPosition: {
            x,
            z: roundPlanCoordinate((verticalOverlapTop + verticalOverlapBottom) / 2),
          },
          lengthMeters: roundPlanCoordinate(verticalOverlap),
        });
      } else if (verticalOverlap >= minSharedWallMeters && leftToRightGap <= toleranceMeters) {
        const x = roundPlanCoordinate((firstBounds.left + secondBounds.right) / 2);
        guides.push({
          id: `${first.id}-${second.id}-vertical-west-east`,
          roomIds: [first.id, second.id],
          orientation: "vertical",
          points: [
            [x, roundPlanCoordinate(verticalOverlapTop)],
            [x, roundPlanCoordinate(verticalOverlapBottom)],
          ],
          labelPosition: {
            x,
            z: roundPlanCoordinate((verticalOverlapTop + verticalOverlapBottom) / 2),
          },
          lengthMeters: roundPlanCoordinate(verticalOverlap),
        });
      }

      if (horizontalOverlap >= minSharedWallMeters && bottomToTopGap <= toleranceMeters) {
        const z = roundPlanCoordinate((firstBounds.bottom + secondBounds.top) / 2);
        guides.push({
          id: `${first.id}-${second.id}-horizontal-south-north`,
          roomIds: [first.id, second.id],
          orientation: "horizontal",
          points: [
            [roundPlanCoordinate(horizontalOverlapLeft), z],
            [roundPlanCoordinate(horizontalOverlapRight), z],
          ],
          labelPosition: {
            x: roundPlanCoordinate((horizontalOverlapLeft + horizontalOverlapRight) / 2),
            z,
          },
          lengthMeters: roundPlanCoordinate(horizontalOverlap),
        });
      } else if (horizontalOverlap >= minSharedWallMeters && topToBottomGap <= toleranceMeters) {
        const z = roundPlanCoordinate((firstBounds.top + secondBounds.bottom) / 2);
        guides.push({
          id: `${first.id}-${second.id}-horizontal-north-south`,
          roomIds: [first.id, second.id],
          orientation: "horizontal",
          points: [
            [roundPlanCoordinate(horizontalOverlapLeft), z],
            [roundPlanCoordinate(horizontalOverlapRight), z],
          ],
          labelPosition: {
            x: roundPlanCoordinate((horizontalOverlapLeft + horizontalOverlapRight) / 2),
            z,
          },
          lengthMeters: roundPlanCoordinate(horizontalOverlap),
        });
      }
    }
  }

  return guides;
}

export function resolveHouseRoomSnapPreview(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[],
  snapDistance = 0.18
): HouseRoomSnapPreview | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return null;

  const snapped = snapHouseRoomMove(roomId, x, z, rooms, snapDistance);
  if (!snapped) return null;

  const proposedOverlaps = doesHouseRoomOverlap(roomId, x, z, moving.w, moving.d, rooms);
  const snappedToCurrent =
    Math.abs(snapped.x - moving.x) < 0.001 &&
    Math.abs(snapped.z - moving.z) < 0.001;

  if (proposedOverlaps && snappedToCurrent) {
    return null;
  }

  const previewRooms = rooms.map((room) =>
    room.id === roomId
      ? {
          ...room,
          x: snapped.x,
          z: snapped.z,
        }
      : room
  );
  const guide = buildHouseRoomAdjacencyGuides(previewRooms).find((candidate) =>
    candidate.roomIds.includes(roomId)
  );

  if (!guide) return null;

  const targetRoomId = guide.roomIds.find((id) => id !== roomId);
  const targetRoom = targetRoomId ? rooms.find((room) => room.id === targetRoomId) : null;
  if (!targetRoomId || !targetRoom) return null;

  return {
    ...guide,
    x: roundPlanCoordinate(snapped.x),
    z: roundPlanCoordinate(snapped.z),
    targetRoomId,
    targetRoomName: targetRoom.name,
    label: `Align to ${targetRoom.name} wall`,
  };
}

export function buildHouseRoomDoorwaySuggestions(
  rooms: HousePlanRoom2D[],
  activeRoomId?: string | null
): HouseRoomDoorwaySuggestion[] {
  const suggestions: HouseRoomDoorwaySuggestion[] = [];
  const guides = buildHouseRoomAdjacencyGuides(rooms);
  const minDoorwayWidthMeters = 0.55;
  const doorwayWallMarginMeters = 0.3;
  const preferredDoorwayWidthMeters = 0.9;

  for (const guide of guides) {
    const roomIds = activeRoomId && guide.roomIds.includes(activeRoomId)
      ? [activeRoomId]
      : activeRoomId
        ? []
        : guide.roomIds;

    for (const roomId of roomIds) {
      const room = rooms.find((entry) => entry.id === roomId);
      const adjacentRoomId = guide.roomIds.find((id) => id !== roomId);
      const adjacentRoom = adjacentRoomId
        ? rooms.find((entry) => entry.id === adjacentRoomId)
        : null;

      if (!room || !adjacentRoomId || !adjacentRoom) continue;

      const doorwayWidth = roundPlanCoordinate(
        Math.min(preferredDoorwayWidthMeters, guide.lengthMeters - doorwayWallMarginMeters)
      );

      if (doorwayWidth < minDoorwayWidthMeters) continue;

      const wall =
        guide.orientation === "vertical"
          ? room.x < guide.labelPosition.x
            ? "east"
            : "west"
          : room.z < guide.labelPosition.z
            ? "south"
            : "north";
      const offsetMeters =
        guide.orientation === "vertical"
          ? roundPlanCoordinate(guide.labelPosition.z - room.z)
          : roundPlanCoordinate(guide.labelPosition.x - room.x);

      suggestions.push({
        id: `${guide.id}-${roomId}-doorway`,
        roomId,
        adjacentRoomId,
        adjacentRoomName: adjacentRoom.name,
        wall,
        offsetMeters,
        widthMeters: doorwayWidth,
        points: guide.points,
        labelPosition: guide.labelPosition,
        label: "Add doorway",
      });
    }
  }

  return suggestions;
}

function doorwaySuggestionMatchesOpening(
  suggestion: HouseRoomDoorwaySuggestion,
  opening: HouseRoomConnectionOpening
): boolean {
  if (opening.kind !== "door") return false;
  if (opening.roomId !== suggestion.roomId) return false;
  if (opening.wall !== suggestion.wall) return false;

  const offsetMm = Math.round(suggestion.offsetMeters * 1000);
  const widthMm = Math.round(suggestion.widthMeters * 1000);
  return Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2);
}

export function buildHouseRoomConnectionChecklist(
  rooms: HousePlanRoom2D[],
  openings: HouseRoomConnectionOpening[],
  activeRoomId?: string | null
): HouseRoomConnectionChecklistItem[] {
  const suggestions = buildHouseRoomDoorwaySuggestions(rooms);

  return buildHouseRoomAdjacencyGuides(rooms).map((guide) => {
    const [firstRoomId, secondRoomId] = guide.roomIds;
    const firstRoom = rooms.find((room) => room.id === firstRoomId);
    const secondRoom = rooms.find((room) => room.id === secondRoomId);
    const pairSuggestions = suggestions.filter(
      (suggestion) =>
        guide.roomIds.includes(suggestion.roomId) &&
        guide.roomIds.includes(suggestion.adjacentRoomId)
    );
    const hasDoorway = pairSuggestions.some((suggestion) =>
      openings.some((opening) => doorwaySuggestionMatchesOpening(suggestion, opening))
    );
    const doorwaySuggestion =
      hasDoorway
        ? undefined
        : activeRoomId
          ? pairSuggestions.find((suggestion) => suggestion.roomId === activeRoomId) ??
            pairSuggestions[0]
          : pairSuggestions[0];

    return {
      id: guide.id,
      roomIds: guide.roomIds,
      roomNames: [
        firstRoom?.name ?? "Room",
        secondRoom?.name ?? "Room",
      ],
      sharedWallLengthMeters: guide.lengthMeters,
      status: hasDoorway ? "connected" : "needs_doorway",
      doorwaySuggestion,
    };
  });
}

export function resolvePlanFitZoom(params: {
  viewportWidthPx: number;
  viewportHeightPx: number;
  planWidthMeters: number;
  planDepthMeters: number;
  paddingMeters?: number;
  minZoom?: number;
  maxZoom?: number;
}): number {
  const paddingMeters = params.paddingMeters ?? 1.2;
  const minZoom = params.minZoom ?? 24;
  const maxZoom = params.maxZoom ?? 220;
  const spanX = Math.max(0.1, params.planWidthMeters + paddingMeters);
  const spanZ = Math.max(0.1, params.planDepthMeters + paddingMeters);
  const zoomX = params.viewportWidthPx / spanX;
  const zoomZ = params.viewportHeightPx / spanZ;
  return Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomZ)));
}
