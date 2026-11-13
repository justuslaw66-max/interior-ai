"use client";

import { useCallback } from "react";
import type { DimensionsMm } from "@/lib/catalog-schema";
import { layoutBlockResizeTarget, type LayoutBlockFootprint } from "@/lib/layout-block-resize";
import { isLayoutBlock, updateLayoutBlock } from "@/lib/layout-blocks";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";

type ItemPosition = [number, number, number];

/** The editor actions a resize needs, as the item interaction facade already holds them. */
export type LayoutBlockResizeActions = {
  document: { commitItems: (updater: (previous: DesignItem[]) => DesignItem[], actionName?: string) => void };
  placement: {
    isCatalogPlacementContainedInRoom: (room: RoomSnapshot, position: ItemPosition, rotationY: number, dimensionsMm: DimensionsMm) => boolean;
    findCatalogPlacementBlockerInRoom: (
      room: RoomSnapshot,
      productId: string,
      position: ItemPosition,
      rotationY: number,
      dimensionsMm: DimensionsMm,
      excludedInstanceId?: string | string[]
    ) => DesignItem | null;
    getItemDisplayName: (item: DesignItem | null | undefined) => string | null;
  };
  feedback: { showToast: (message: string) => void };
};

/** The block as it would be after the resize, or why it cannot be resized that way. */
export function resolveLayoutBlockResize(
  item: DesignItem,
  footprint: LayoutBlockFootprint,
  activeRoom: RoomSnapshot | null,
  placement: LayoutBlockResizeActions["placement"]
): { item: DesignItem } | { refused: string } | null {
  if (!isLayoutBlock(item) || !item.productSnapshot) return null;
  if (item.locked) return { refused: "Unlock this item to resize it." };
  const { position, sizeMm } = layoutBlockResizeTarget(item, footprint);
  const dimensionsMm = { ...item.productSnapshot.dimensionsMm, ...sizeMm };
  const rotationY = item.rotationY ?? 0;
  if (!activeRoom) return { item: { ...updateLayoutBlock(item, { sizeMm: dimensionsMm }), position } };
  if (!placement.isCatalogPlacementContainedInRoom(activeRoom, position, rotationY, dimensionsMm)) {
    return { refused: `Keep the ${item.productSnapshot.name} inside ${activeRoom.name}.` };
  }
  const blocker = placement.findCatalogPlacementBlockerInRoom(activeRoom, item.productId, position, rotationY, dimensionsMm, item.instanceId);
  if (blocker) return { refused: `That size runs into ${placement.getItemDisplayName(blocker) ?? "another item"}.` };
  return { item: { ...updateLayoutBlock(item, { sizeMm: dimensionsMm }), position } };
}

/**
 * Lets go of a layout block resized from its outline on the plan (J, 13 Nov 2026): the new size and
 * centre as one undoable step, when the block still sits inside the room and clear of other items.
 * Returns false, with a message, when it does not; the plan then puts the block back as it was.
 */
export function useLayoutBlockResizeCommit(
  activeRoom: RoomSnapshot | null,
  getItems: () => DesignItem[],
  { document: { commitItems }, placement, feedback: { showToast } }: LayoutBlockResizeActions
) {
  return useCallback(
    (instanceId: string, footprint: LayoutBlockFootprint): boolean => {
      const item = getItems().find((entry) => entry.instanceId === instanceId);
      const result = item ? resolveLayoutBlockResize(item, footprint, activeRoom, placement) : null;
      if (!result) return false;
      if ("refused" in result) {
        showToast(result.refused);
        return false;
      }
      commitItems((previous) => previous.map((entry) => (entry.instanceId === instanceId ? result.item : entry)), "Resize layout block");
      return true;
    },
    [activeRoom, commitItems, getItems, placement, showToast]
  );
}
