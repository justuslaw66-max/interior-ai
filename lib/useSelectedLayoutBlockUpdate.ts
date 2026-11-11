"use client";

import { useCallback } from "react";
import { isLayoutBlock, updateLayoutBlock, type LayoutBlockPatch } from "@/lib/layout-blocks";
import type { DesignItem } from "@/lib/room-types";

type CommitItems = (updater: (previous: DesignItem[]) => DesignItem[], actionName?: string) => void;

/** A selected layout block's new name or size, as one undoable step; nothing for a product. */
export function useSelectedLayoutBlockUpdate(selectedItem: DesignItem | null, commitItems: CommitItems) {
  return useCallback((patch: LayoutBlockPatch) => {
    if (!selectedItem || !isLayoutBlock(selectedItem)) return;
    const id = selectedItem.instanceId;
    commitItems(
      (previous) => previous.map((item) => (item.instanceId === id ? updateLayoutBlock(item, patch) : item)),
      patch.name !== undefined ? "Rename layout block" : "Resize layout block"
    );
  }, [commitItems, selectedItem]);
}
