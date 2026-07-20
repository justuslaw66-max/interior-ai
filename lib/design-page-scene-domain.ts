import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import { resolveCanonicalFloorElevationMeters } from "@/lib/floor-plan-scene-elevation";
import type {
  DesignItem,
  DesignSnapshot,
  RoomPlanPolygonPoint,
  RoomPlanShape,
  RoomSnapshot,
} from "@/lib/room-types";

export type ScenePlanRoom = {
  id: string;
  x: number;
  z: number;
};

export type SceneRoomWallModel = "canonical-room" | "house-plan-shell";

/**
 * Renderer-neutral item entry. Item coordinates stay room-local; the room
 * transform and canonical finished-floor elevation are carried alongside the
 * item so every renderer projects the same source model.
 */
export type SceneRoomItemEntry = {
  item: DesignItem;
  roomId: string;
  roomOffset: { x: number; z: number };
  roomFloorElevationMeters: number;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  roomPlanShape: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
  roomWallThickness: number;
  roomWallModel: SceneRoomWallModel;
  isActiveRoom: boolean;
};

export type BuildDesignPageSceneRoomItemsInput = {
  activeRoom: RoomSnapshot | null;
  designSnapshot: DesignSnapshot;
  hasWholeHousePlan: boolean;
  housePlanRooms: ScenePlanRoom[];
  houseRoomById: ReadonlyMap<string, ScenePlanRoom>;
  usesHousePlanScene: boolean;
};

function buildSceneRoomItemEntry(
  item: DesignItem,
  room: RoomSnapshot,
  roomOffset: { x: number; z: number },
  roomWallModel: SceneRoomWallModel,
  isActiveRoom: boolean
): SceneRoomItemEntry {
  return {
    item,
    roomId: room.id,
    roomOffset,
    roomFloorElevationMeters:
      resolveCanonicalFloorElevationMeters(room) ?? 0,
    roomWidth: room.geometry.width,
    roomDepth: room.geometry.depth,
    roomHeight:
      room.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight,
    roomPlanShape: room.planShape ?? "rectangle",
    roomPlanPolygon: room.planPolygon,
    roomPlanHoles: room.planHoles,
    roomWallThickness:
      room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness,
    roomWallModel,
    isActiveRoom,
  };
}

/** Builds the single canonical item model consumed by both plan and spatial renderers. */
export function buildDesignPageSceneRoomItems({
  activeRoom,
  designSnapshot,
  hasWholeHousePlan,
  housePlanRooms,
  houseRoomById,
  usesHousePlanScene,
}: BuildDesignPageSceneRoomItemsInput): SceneRoomItemEntry[] {
  if (!hasWholeHousePlan) {
    if (!activeRoom) return [];
    const planRoom = houseRoomById.get(activeRoom.id);
    const roomOffset = { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 };
    const roomWallModel: SceneRoomWallModel = usesHousePlanScene
      ? "house-plan-shell"
      : "canonical-room";
    return activeRoom.items.map((item) =>
      buildSceneRoomItemEntry(item, activeRoom, roomOffset, roomWallModel, true)
    );
  }

  const visibleRoomIds = new Set(housePlanRooms.map((room) => room.id));
  return designSnapshot.rooms
    .filter((room) => visibleRoomIds.has(room.id))
    .flatMap((room) => {
      const planRoom = houseRoomById.get(room.id);
      const roomOffset = { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 };
      return room.items.map((item) =>
        buildSceneRoomItemEntry(
          item,
          room,
          roomOffset,
          "house-plan-shell",
          room.id === designSnapshot.activeRoomId
        )
      );
    });
}

export type SceneItemCanonicalTransform = {
  localPosition: [number, number, number];
  worldPosition: [number, number, number];
  rotationY: number;
};

export function resolveSceneItemCanonicalTransform(
  entry: SceneRoomItemEntry,
  localPosition: [number, number, number] = entry.item.position
): SceneItemCanonicalTransform {
  return {
    localPosition: [...localPosition],
    worldPosition: [
      localPosition[0] + entry.roomOffset.x,
      (localPosition[1] ?? 0) + entry.roomFloorElevationMeters,
      localPosition[2] + entry.roomOffset.z,
    ],
    rotationY: entry.item.rotationY ?? 0,
  };
}

export function resolveSceneItemLocalPosition(
  entry: SceneRoomItemEntry,
  worldPosition: [number, number, number]
): [number, number, number] {
  return [
    worldPosition[0] - entry.roomOffset.x,
    worldPosition[1] - entry.roomFloorElevationMeters,
    worldPosition[2] - entry.roomOffset.z,
  ];
}
