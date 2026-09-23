import { appendLayoutVersion } from "@/lib/layout-versions";
import type { HistoryStatus } from "@/lib/historyManager";
import type {
  DesignItem,
  DesignSnapshot,
  LayoutVersion,
} from "@/lib/room-types";

export const SCENE_ITEM_DRAG_COMMAND_ID = "scene-item-drag";

type SceneItemDragHistoryRecovery = {
  getStatus: () => HistoryStatus;
  rollbackContinuousCommand: (commandId: string) => void;
};

/** Recover a gesture transaction when the browser loses its pointer-end event. */
export function rollbackInterruptedSceneItemDrag(
  history: SceneItemDragHistoryRecovery
): boolean {
  const activeCommand = history.getStatus().activeCommand;
  if (
    !activeCommand?.continuous ||
    activeCommand.id !== SCENE_ITEM_DRAG_COMMAND_ID
  ) {
    return false;
  }
  history.rollbackContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
  return true;
}

export type ReplaceRoomItemsCommandInput = {
  roomId: string;
  items: DesignItem[];
  activateRoom?: boolean;
  beforeLayoutVersion?: LayoutVersion;
};

export type MoveItemsBetweenRoomsCommandInput = {
  sourceRoomId: string;
  targetRoomId: string;
  movedItems: DesignItem[];
  activateTargetRoom?: boolean;
};

export type DesignItemTransformPatch = {
  instanceId: string;
  changes: Partial<
    Pick<DesignItem, "position" | "rotationY" | "supportInstanceId">
  >;
};

function assertUniqueItemIds(items: readonly DesignItem[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.instanceId) throw new Error(`${label} contains an item without an instance id`);
    if (ids.has(item.instanceId)) {
      throw new Error(`${label} contains duplicate item id "${item.instanceId}"`);
    }
    ids.add(item.instanceId);
  }
}

/** Pure reducer for the most common scene-item mutation boundary. */
export function applyReplaceRoomItemsCommand(
  snapshot: DesignSnapshot,
  input: ReplaceRoomItemsCommandInput
): DesignSnapshot {
  const room = snapshot.rooms.find((entry) => entry.id === input.roomId);
  if (!room) throw new Error(`Cannot replace items in missing room "${input.roomId}"`);
  assertUniqueItemIds(input.items, `Room "${input.roomId}"`);

  return {
    ...snapshot,
    activeRoomId: input.activateRoom ? room.id : snapshot.activeRoomId,
    rooms: snapshot.rooms.map((entry) =>
      entry.id === room.id
        ? {
            ...entry,
            items: input.items,
            layoutVersions: input.beforeLayoutVersion
              ? appendLayoutVersion(entry, input.beforeLayoutVersion)
                  .layoutVersions
              : entry.layoutVersions,
          }
        : entry
    ),
  };
}

/** Pure, all-or-nothing reducer for single- and multi-item room transfers. */
export function applyMoveItemsBetweenRoomsCommand(
  snapshot: DesignSnapshot,
  input: MoveItemsBetweenRoomsCommandInput
): DesignSnapshot {
  if (input.sourceRoomId === input.targetRoomId) {
    throw new Error("Source and target room must be different");
  }
  assertUniqueItemIds(input.movedItems, "Moved items");
  if (input.movedItems.length === 0) throw new Error("No items were provided to move");

  const sourceRoom = snapshot.rooms.find(
    (room) => room.id === input.sourceRoomId
  );
  const targetRoom = snapshot.rooms.find(
    (room) => room.id === input.targetRoomId
  );
  if (!sourceRoom || !targetRoom) throw new Error("Source or target room is missing");

  const movedIds = new Set(input.movedItems.map((item) => item.instanceId));
  const sourceIds = new Set(sourceRoom.items.map((item) => item.instanceId));
  const targetIds = new Set(targetRoom.items.map((item) => item.instanceId));
  for (const id of movedIds) {
    if (!sourceIds.has(id)) throw new Error(`Source room does not contain item "${id}"`);
    if (targetIds.has(id)) throw new Error(`Target room already contains item "${id}"`);
  }

  return {
    ...snapshot,
    activeRoomId: input.activateTargetRoom
      ? input.targetRoomId
      : snapshot.activeRoomId,
    rooms: snapshot.rooms.map((room) => {
      if (room.id === sourceRoom.id) {
        return {
          ...room,
          items: room.items.filter((item) => !movedIds.has(item.instanceId)),
          zones: room.zones
            .map((zone) => ({
              ...zone,
              itemIds: zone.itemIds.filter((itemId) => !movedIds.has(itemId)),
            }))
            .filter((zone) => zone.itemIds.length > 0),
        };
      }
      if (room.id === targetRoom.id) {
        return { ...room, items: [...room.items, ...input.movedItems] };
      }
      return room;
    }),
  };
}

/** Pure reducer used by high-frequency drag updates; input stays compact. */
export function applyDesignItemTransformPatches(
  items: readonly DesignItem[],
  patches: readonly DesignItemTransformPatch[]
): DesignItem[] {
  const patchesById = new Map<string, DesignItemTransformPatch>();
  for (const patch of patches) {
    if (patchesById.has(patch.instanceId)) {
      throw new Error(`Duplicate transform patch for item "${patch.instanceId}"`);
    }
    patchesById.set(patch.instanceId, patch);
  }

  const appliedIds = new Set<string>();
  const nextItems = items.map((item) => {
    const patch = patchesById.get(item.instanceId);
    if (!patch) return item;
    appliedIds.add(item.instanceId);
    const transformed = { ...item, ...patch.changes };
    if (item.assetType !== "parametric_cabinet" || !item.cabinetDefinition) {
      return transformed;
    }

    const position = patch.changes.position ?? item.position;
    const rotationY =
      patch.changes.rotationY ??
      item.rotationY ??
      item.transform?.rotationY ??
      item.transform?.rotation?.[1] ??
      0;
    const scale = item.transform?.scale ?? [1, 1, 1];
    const transform = {
      ...item.transform,
      position,
      rotationY,
      rotation: [0, rotationY, 0] as [number, number, number],
      scale,
    };
    const manifestTransform = item.millworkAssetManifest?.transform;

    return {
      ...transformed,
      transform,
      millworkAssetManifest: item.millworkAssetManifest
        ? {
            ...item.millworkAssetManifest,
            transform: {
              ...manifestTransform,
              position,
              rotation: [0, rotationY, 0] as [number, number, number],
              scale: manifestTransform?.scale ?? scale,
            },
          }
        : item.millworkAssetManifest,
    };
  });

  for (const id of patchesById.keys()) {
    if (!appliedIds.has(id)) throw new Error(`Cannot transform missing item "${id}"`);
  }
  return nextItems;
}
