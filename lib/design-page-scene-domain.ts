import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import { resolveCanonicalFloorElevationMeters } from "@/lib/floor-plan-scene-elevation";
import { getRoomWallFinishDepths, type RoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { FurnitureRoomContext } from "@/lib/furniture-room-fit";
import { getCompiledPlanFloors, getItemRoomContext } from "@/lib/furniture-room-context";
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

/**
 * Renderer-neutral item entry. Item coordinates stay room-local; the room
 * transform and canonical finished-floor elevation are carried alongside the
 * item so every renderer projects the same source model.
 */
export type SceneRoomItemEntry = {
  item: DesignItem;
  roomId: string;
  /** Stable semantic layer shared by every presentation of this item. */
  layerId: string;
  /** Canonical visibility; renderers may change presentation, never this value. */
  visible: boolean;
  roomOffset: { x: number; z: number };
  roomFloorElevationMeters: number;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  roomPlanShape: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
  roomWallThickness: number;
  /** Each wall's laminate panel depth, so items stop at the panel (lib/room-wall-finish-depths.ts). */
  roomWallFinishDepths?: RoomWallFinishDepths;
  /** Furniture's room for its clamp (lib/furniture-room-context.ts): its walls and the rooms next door's; none for a built-in. */
  roomFurniture?: FurnitureRoomContext;
  isActiveRoom: boolean;
};

export type BuildDesignPageSceneRoomItemsInput = {
  activeRoom: RoomSnapshot | null;
  designSnapshot: DesignSnapshot;
  hasWholeHousePlan: boolean;
  housePlanRooms: ScenePlanRoom[];
  houseRoomById: ReadonlyMap<string, ScenePlanRoom>;
};

function buildSceneRoomItemEntry(
  item: DesignItem,
  room: RoomSnapshot,
  roomOffset: { x: number; z: number },
  isActiveRoom: boolean,
  plan: { rooms: ReadonlyMap<string, ScenePlanRoom>; floors: ReturnType<typeof getCompiledPlanFloors> }
): SceneRoomItemEntry {
  return {
    item,
    roomId: room.id,
    layerId: `room:${room.id}:items`,
    visible: true,
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
    roomWallFinishDepths: getRoomWallFinishDepths(room),
    roomFurniture: getItemRoomContext(item, room, plan.rooms, plan.floors),
    isActiveRoom,
  };
}

export type SceneItemContinuityDimensionsMm = {
  w: number;
  d: number;
  h: number;
};

export type SceneItemViewContinuityInput = {
  variantId?: string;
  visualDimensionsMm: SceneItemContinuityDimensionsMm;
  planningDimensionsMm: SceneItemContinuityDimensionsMm;
  materialPreset?: string;
  materialOverrides?: DesignItem["materialOverrides"];
  selected: boolean;
};

/**
 * Resolves the renderer-independent state that must survive a 2D/3D view
 * change. Both renderers consume this record; only projection is allowed to
 * differ between them.
 */
export function resolveSceneItemViewContinuity(
  entry: SceneRoomItemEntry,
  input: SceneItemViewContinuityInput
) {
  return {
    instanceId: entry.item.instanceId,
    roomId: entry.roomId,
    layerId: entry.layerId,
    visible: entry.visible,
    productId: entry.item.productId,
    variantId: input.variantId ?? entry.item.variantId,
    productSnapshot: entry.item.productSnapshot,
    localPosition: [...entry.item.position] as [number, number, number],
    rotationY: entry.item.rotationY ?? 0,
    visualDimensionsMm: { ...input.visualDimensionsMm },
    planningDimensionsMm: { ...input.planningDimensionsMm },
    materialPreset: input.materialPreset ?? entry.item.materialPreset,
    materialOverrides: input.materialOverrides ?? entry.item.materialOverrides,
    selected: input.selected,
  };
}

/** Builds the single canonical item model consumed by both plan and spatial renderers. */
export function buildDesignPageSceneRoomItems({
  activeRoom,
  designSnapshot,
  hasWholeHousePlan,
  housePlanRooms,
  houseRoomById,
}: BuildDesignPageSceneRoomItemsInput): SceneRoomItemEntry[] {
  // Furniture's room for its clamp: the plan's rooms, and an imported plan's walls as compiled (lib/furniture-room-context.ts).
  const plan = { rooms: houseRoomById, floors: getCompiledPlanFloors(designSnapshot.floorPlan?.canonicalDocument) };
  if (!hasWholeHousePlan) {
    if (!activeRoom) return [];
    const planRoom = houseRoomById.get(activeRoom.id);
    const roomOffset = { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 };
    return activeRoom.items.map((item) =>
      buildSceneRoomItemEntry(item, activeRoom, roomOffset, true, plan)
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
          room.id === designSnapshot.activeRoomId,
          plan
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
  entry: Pick<SceneRoomItemEntry, "item" | "roomOffset" | "roomFloorElevationMeters">,
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
