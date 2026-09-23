"use client";

import { useCallback, type MutableRefObject } from "react";

import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import {
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  isCeilingOnlyCatalogItem,
  isSurfaceOnlyCatalogItem,
} from "@/lib/catalog-placement";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import {
  applyMoveItemsBetweenRoomsCommand,
  SCENE_ITEM_DRAG_COMMAND_ID,
} from "@/lib/design-page-item-commands";
import type { HistoryCommand } from "@/lib/historyManager";
import type {
  ClampToPlacementRoom,
  FindPlacementBlockerInRoom,
  IsPlacementContainedInRoom,
} from "@/lib/useDesignPagePlacementRoomQueries";
import type {
  DesignItem,
  DesignSnapshot,
  RoomSnapshot,
} from "@/lib/room-types";

type ItemPosition = [number, number, number];

type DesignPageRoomTransferHistory = {
  executeCommand: <TInput, TResult>(
    command: HistoryCommand<TInput, TResult>
  ) => TResult;
  rollbackContinuousCommand: (commandId: string) => void;
};

type DesignPageCrossRoomItemTransferConfiguration = {
  houseRoomById: ReadonlyMap<string, HousePlanRoom2D>;
};

type DesignPageCrossRoomItemTransferRefs = {
  designSnapshot: MutableRefObject<DesignSnapshot>;
  activeItems: MutableRefObject<DesignItem[]>;
  dragCommit: MutableRefObject<boolean>;
};

type DesignPageCrossRoomItemTransferActions = {
  getPlanningDimensions: (
    item: DesignItem,
    product: CatalogItemSchema
  ) => DimensionsMm;
  clampToCatalogPlacementRoom: ClampToPlacementRoom;
  isCatalogPlacementContainedInRoom: IsPlacementContainedInRoom;
  findCatalogPlacementBlockerInRoom: FindPlacementBlockerInRoom;
  getItemDisplayName: (
    item: DesignItem | null | undefined
  ) => string | null;
  setDesignSnapshot: (
    next:
      | DesignSnapshot
      | ((previous: DesignSnapshot) => DesignSnapshot)
  ) => void;
  updateSelection: (next: Set<string>, primaryId: string | null) => void;
  history: DesignPageRoomTransferHistory;
  showToast: (message: string) => void;
};

export type TransferDesignPageItemToRoom = (
  instanceId: string,
  sourceRoomId: string,
  targetRoom: RoomSnapshot,
  worldPosition: ItemPosition
) => boolean;

type TransferDesignPageItemToRoomInput = {
  instanceId: string;
  sourceRoomId: string;
  targetRoom: RoomSnapshot;
  worldPosition: ItemPosition;
  configuration: DesignPageCrossRoomItemTransferConfiguration;
  refs: DesignPageCrossRoomItemTransferRefs;
  actions: DesignPageCrossRoomItemTransferActions;
};

type UseDesignPageCrossRoomItemTransferInput = {
  configuration: DesignPageCrossRoomItemTransferConfiguration;
  refs: DesignPageCrossRoomItemTransferRefs;
  actions: DesignPageCrossRoomItemTransferActions;
};

export function transferDesignPageItemToRoom({
  instanceId,
  sourceRoomId,
  targetRoom,
  worldPosition,
  configuration,
  refs,
  actions,
}: TransferDesignPageItemToRoomInput): boolean {
  if (sourceRoomId === targetRoom.id) return false;

  const { houseRoomById } = configuration;
  const {
    designSnapshot: designSnapshotRef,
    activeItems: itemsRef,
    dragCommit: dragCommitRef,
  } = refs;
  const {
    getPlanningDimensions,
    clampToCatalogPlacementRoom,
    isCatalogPlacementContainedInRoom,
    findCatalogPlacementBlockerInRoom,
    getItemDisplayName,
    setDesignSnapshot,
    updateSelection,
    history,
    showToast,
  } = actions;

  const snapshot = designSnapshotRef.current;
  const sourceRoom = snapshot.rooms.find((room) => room.id === sourceRoomId);
  const sourcePlanRoom = houseRoomById.get(sourceRoomId);
  const targetPlanRoom = houseRoomById.get(targetRoom.id);
  if (!sourceRoom || !sourcePlanRoom || !targetPlanRoom) return false;

  const item = sourceRoom.items.find(
    (entry) => entry.instanceId === instanceId
  );
  if (!item) return false;
  const product = CATALOG_ITEMS[item.productId];
  if (!product) return false;

  const configuredDims = getPlanningDimensions(item, product);
  const localTargetPosition: ItemPosition = [
    worldPosition[0] - targetPlanRoom.x,
    worldPosition[1] ?? 0,
    worldPosition[2] - targetPlanRoom.z,
  ];
  const surfacePlacement = isSurfaceOnlyCatalogItem(product)
    ? findCatalogSurfacePlacement({
        productId: item.productId,
        variantId: item.variantId,
        purchaseOptionId: item.purchaseOptionId,
        roomId: targetRoom.id,
        items: targetRoom.items,
        nearPosition: localTargetPosition,
      })
    : null;
  if (isSurfaceOnlyCatalogItem(product) && !surfacePlacement) {
    showToast(
      `Add a table in ${targetRoom.name} first, then place this lamp on its surface.`
    );
    return false;
  }
  const [safeX, safeZ] = surfacePlacement
    ? [surfacePlacement.position[0], surfacePlacement.position[2]]
    : clampToCatalogPlacementRoom(
        targetRoom,
        localTargetPosition[0],
        localTargetPosition[2],
        configuredDims.w / 1000,
        configuredDims.d / 1000,
        item.rotationY ?? 0
      );
  const movedItem: DesignItem = {
    ...item,
    position: surfacePlacement
      ? surfacePlacement.position
      : [
          safeX,
          isCeilingOnlyCatalogItem(product)
            ? getCeilingMountedItemBaseY({
                product,
                dimsMm: configuredDims,
                roomHeight:
                  targetRoom.geometry.height ??
                  ROOM_DIMENSION_DEFAULTS.roomHeight,
              })
            : localTargetPosition[1],
          safeZ,
        ],
    rotationY: surfacePlacement?.rotationY ?? item.rotationY,
    supportInstanceId:
      surfacePlacement?.supportInstanceId ?? item.supportInstanceId,
  };

  if (
    !isCatalogPlacementContainedInRoom(
      targetRoom,
      movedItem.position,
      movedItem.rotationY ?? 0,
      configuredDims
    )
  ) {
    showToast(`Place fully inside ${targetRoom.name}`);
    return false;
  }

  const blocker = findCatalogPlacementBlockerInRoom(
    targetRoom,
    movedItem.productId,
    movedItem.position,
    movedItem.rotationY ?? 0,
    configuredDims,
    [movedItem.instanceId, movedItem.supportInstanceId ?? ""].filter(Boolean)
  );
  if (blocker) {
    showToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
    return false;
  }

  if (dragCommitRef.current) {
    history.rollbackContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
    dragCommitRef.current = false;
  }
  history.executeCommand({
    id: "move-item-between-rooms",
    description: `Move item to ${targetRoom.name}`,
    input: {
      sourceRoomId,
      targetRoomId: targetRoom.id,
      movedItems: [movedItem],
      activateTargetRoom: true,
    },
    execute: (input) => {
      const nextSnapshot = applyMoveItemsBetweenRoomsCommand(
        designSnapshotRef.current,
        input
      );
      setDesignSnapshot(nextSnapshot);
      itemsRef.current =
        nextSnapshot.rooms.find((room) => room.id === targetRoom.id)?.items ?? [];
    },
  });
  updateSelection(new Set([instanceId]), instanceId);
  showToast(`Moved to ${targetRoom.name}`);
  return true;
}

export function useDesignPageCrossRoomItemTransfer({
  configuration,
  refs,
  actions,
}: UseDesignPageCrossRoomItemTransferInput) {
  const { houseRoomById } = configuration;
  const { designSnapshot, activeItems, dragCommit } = refs;
  const {
    getPlanningDimensions,
    clampToCatalogPlacementRoom,
    isCatalogPlacementContainedInRoom,
    findCatalogPlacementBlockerInRoom,
    getItemDisplayName,
    setDesignSnapshot,
    updateSelection,
    history,
    showToast,
  } = actions;

  const transferItemToRoom = useCallback<TransferDesignPageItemToRoom>(
    (instanceId, sourceRoomId, targetRoom, worldPosition) =>
      transferDesignPageItemToRoom({
        instanceId,
        sourceRoomId,
        targetRoom,
        worldPosition,
        configuration: { houseRoomById },
        refs: { designSnapshot, activeItems, dragCommit },
        actions: {
          getPlanningDimensions,
          clampToCatalogPlacementRoom,
          isCatalogPlacementContainedInRoom,
          findCatalogPlacementBlockerInRoom,
          getItemDisplayName,
          setDesignSnapshot,
          updateSelection,
          history,
          showToast,
        },
      }),
    [
      activeItems,
      clampToCatalogPlacementRoom,
      designSnapshot,
      dragCommit,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      getPlanningDimensions,
      history,
      houseRoomById,
      isCatalogPlacementContainedInRoom,
      setDesignSnapshot,
      showToast,
      updateSelection,
    ]
  );

  return { actions: { transferItemToRoom } };
}
