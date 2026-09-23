import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import { createRoom, type RoomSnapshot } from "@/lib/room-types";

export type FloorCreationDirection = "upper" | "lower";
export type FloorCreationMode = "blank" | "layout" | "walls";

export type FloorOption = {
  level: number;
  label: string;
  roomCount: number;
};

type BuildNewFloorRoomsParams = {
  rooms: RoomSnapshot[];
  activeFloorLevel: number;
  direction: FloorCreationDirection;
  creationMode: FloorCreationMode;
  activeRoom: RoomSnapshot | null | undefined;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  wallThickness: number;
  timestamp: number;
};

type DuplicateFloorRoomsParams = {
  rooms: RoomSnapshot[];
  activeFloorLevel: number;
  timestamp: number;
};

export function formatFloorLevel(level: number): string {
  if (level <= 0) return `B${Math.abs(level) + 1}`;
  return `${level}F`;
}

export function getFloorAccentColor(level: number): string {
  const palette = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
  return palette[Math.abs(level) % palette.length];
}

export function resolveActiveFloorLevel(activeRoom: RoomSnapshot | null | undefined): number {
  return typeof activeRoom?.floorLevel === "number" && Number.isFinite(activeRoom.floorLevel)
    ? activeRoom.floorLevel
    : 1;
}

export function resolveFloorOptions(rooms: RoomSnapshot[]): FloorOption[] {
  const levels = new Set<number>();
  rooms.forEach((room) => {
    levels.add(
      typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
        ? room.floorLevel
        : 1
    );
  });
  if (levels.size === 0) levels.add(1);

  return Array.from(levels)
    .sort((first, second) => first - second)
    .map((level) => ({
      level,
      label: rooms.find((room) => (room.floorLevel ?? 1) === level)?.floorLabel ?? formatFloorLevel(level),
      roomCount: rooms.filter((room) => (room.floorLevel ?? 1) === level).length,
    }));
}

export function resolveNextFloorLevel(
  rooms: RoomSnapshot[],
  activeFloorLevel: number,
  direction: FloorCreationDirection
): number {
  const occupiedLevels = rooms.map((room) => room.floorLevel ?? 1);
  return direction === "upper"
    ? Math.max(activeFloorLevel + 1, ...occupiedLevels.map((level) => level + 1))
    : Math.min(activeFloorLevel - 1, ...occupiedLevels.map((level) => level - 1));
}

export function buildNewFloorRooms({
  rooms,
  activeFloorLevel,
  direction,
  creationMode,
  activeRoom,
  roomWidth,
  roomDepth,
  roomHeight,
  wallThickness,
  timestamp,
}: BuildNewFloorRoomsParams) {
  const nextLevel = resolveNextFloorLevel(rooms, activeFloorLevel, direction);
  const nextFloorLabel = formatFloorLevel(nextLevel);
  const sourceRooms = rooms.filter((room) => (room.floorLevel ?? 1) === activeFloorLevel);
  const roomIdMap = new Map<string, string>();
  const nextRooms =
    creationMode === "blank"
      ? [
          (() => {
            const newRoom = createRoom(
              `room_${timestamp}`,
              `${nextFloorLabel} Living Room`,
              activeRoom?.roomType ?? "living",
              {
                width: roomWidth,
                depth: roomDepth,
                wallThickness,
                height: roomHeight,
                slabThickness:
                  activeRoom?.geometry.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness,
              }
            );
            newRoom.floorLevel = nextLevel;
            newRoom.floorLabel = nextFloorLabel;
            newRoom.surfaceFinishes = activeRoom?.surfaceFinishes
              ? { ...activeRoom.surfaceFinishes }
              : undefined;
            newRoom.surfaceOpacity = activeRoom?.surfaceOpacity
              ? { ...activeRoom.surfaceOpacity }
              : { wall: 1, floor: 1 };
            return newRoom;
          })(),
        ]
      : sourceRooms.map((room, roomIndex) => {
          const nextRoomId = `room_${timestamp}_${roomIndex}`;
          roomIdMap.set(room.id, nextRoomId);
          const itemIdMap = new Map<string, string>();
          const items =
            creationMode === "layout"
              ? room.items.map((item, itemIndex) => {
                  const nextItemId = `${item.instanceId}_floor_${timestamp}_${itemIndex}`;
                  itemIdMap.set(item.instanceId, nextItemId);
                  return { ...item, instanceId: nextItemId };
                })
              : [];
          const baseName = room.name.replace(/^B?\d+F\s*/i, "");
          return {
            ...room,
            id: nextRoomId,
            name: `${nextFloorLabel} ${baseName}`,
            floorLevel: nextLevel,
            floorLabel: nextFloorLabel,
            items,
            zones:
              creationMode === "layout"
                ? room.zones.map((zone, zoneIndex) => ({
                    ...zone,
                    id: `${zone.id}_floor_${timestamp}_${zoneIndex}`,
                    itemIds: zone.itemIds.map((itemId) => itemIdMap.get(itemId) ?? itemId),
                  }))
                : [],
            savedViews:
              creationMode === "layout"
                ? room.savedViews.map((view, viewIndex) => ({
                    ...view,
                    id: `${view.id}_floor_${timestamp}_${viewIndex}`,
                  }))
                : [],
          };
        });

  return { nextFloorLabel, nextLevel, nextRooms, roomIdMap };
}

export function duplicateFloorRooms({
  rooms,
  activeFloorLevel,
  timestamp,
}: DuplicateFloorRoomsParams) {
  const sourceRooms = rooms.filter((room) => (room.floorLevel ?? 1) === activeFloorLevel);
  const occupiedLevels = rooms.map((room) => room.floorLevel ?? 1);
  const nextLevel = Math.max(activeFloorLevel + 1, ...occupiedLevels.map((level) => level + 1));
  const roomIdMap = new Map<string, string>();
  const nextRooms = sourceRooms.map((room, roomIndex) => {
    const nextRoomId = `room_${timestamp}_${roomIndex}`;
    roomIdMap.set(room.id, nextRoomId);
    const itemIdMap = new Map<string, string>();
    const items = room.items.map((item, itemIndex) => {
      const nextItemId = `${item.instanceId}_copy_${timestamp}_${itemIndex}`;
      itemIdMap.set(item.instanceId, nextItemId);
      return { ...item, instanceId: nextItemId };
    });
    return {
      ...room,
      id: nextRoomId,
      name: `${room.name} Copy`,
      floorLevel: nextLevel,
      floorLabel: `${formatFloorLevel(nextLevel)} Copy`,
      items,
      zones: room.zones.map((zone, zoneIndex) => ({
        ...zone,
        id: `${zone.id}_copy_${timestamp}_${zoneIndex}`,
        itemIds: zone.itemIds.map((itemId) => itemIdMap.get(itemId) ?? itemId),
      })),
      savedViews: room.savedViews.map((view, viewIndex) => ({
        ...view,
        id: `${view.id}_copy_${timestamp}_${viewIndex}`,
      })),
    };
  });

  return { nextLevel, nextRooms, roomIdMap };
}

export function clonePlanOpeningsForRoomMap(
  openings: RoomOpening2D[],
  roomIdMap: Map<string, string>,
  idSuffix: string
): RoomOpening2D[] {
  return openings
    .filter((opening) => opening.roomId && roomIdMap.has(opening.roomId))
    .map((opening, openingIndex) => ({
      ...opening,
      id: `${opening.id}_${idSuffix}_${openingIndex}`,
      roomId: opening.roomId ? roomIdMap.get(opening.roomId) : opening.roomId,
    }));
}

export function getDeletedFloorRoomIds(
  rooms: RoomSnapshot[],
  activeFloorLevel: number
): Set<string> {
  return new Set(
    rooms
      .filter((room) => (room.floorLevel ?? 1) === activeFloorLevel)
      .map((room) => room.id)
  );
}

export function resolveNextActiveRoomAfterFloorDelete(
  rooms: RoomSnapshot[],
  activeFloorLevel: number
): RoomSnapshot | null {
  return (
    rooms
      .filter((room) => (room.floorLevel ?? 1) !== activeFloorLevel)
      .slice()
      .sort(
        (first, second) =>
          Math.abs((first.floorLevel ?? 1) - activeFloorLevel) -
          Math.abs((second.floorLevel ?? 1) - activeFloorLevel)
      )[0] ?? null
  );
}
