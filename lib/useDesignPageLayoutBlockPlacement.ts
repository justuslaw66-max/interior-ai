"use client";

import { useCallback } from "react";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import { announceUndoableAction } from "@/lib/editor-action-toast";
import { findLayoutBlockSpot, type FindLayoutBlockSpotInput } from "@/lib/layout-block-placement";
import { createLayoutBlockItem, isOverheadLayoutBlockKind, layoutBlockTypicalSizeMm } from "@/lib/layout-blocks";
import { PLAN_SYMBOLS } from "@/lib/plan-symbols/plan-symbol-library";
import type { PlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-types";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";

export type DesignPageLayoutBlockPlacementAdapters = {
  getRooms: () => RoomSnapshot[];
  getActiveRoomId: () => string;
  getItemAABB: FindLayoutBlockSpotInput["getItemAABB"];
  isContained: FindLayoutBlockSpotInput["isContained"];
  commitItemsToRoom: (
    roomId: string,
    updater: (previous: DesignItem[]) => DesignItem[],
    actionName?: string,
    options?: { activateRoom?: boolean }
  ) => DesignItem[] | null;
  selectItems: (selection: { roomId: string; instanceIds: string[]; primaryInstanceId: string }) => void;
  createInstanceId: () => string;
  showToast: (message: string) => void;
};

/**
 * Adds a layout block to the active room at the clear spot nearest its middle, selected so its
 * size can be set straight away; one undoable step (lib/layout-blocks.ts).
 */
export function useDesignPageLayoutBlockPlacement(adapters: DesignPageLayoutBlockPlacementAdapters) {
  const { getRooms, getActiveRoomId, getItemAABB, isContained, commitItemsToRoom, selectItems, createInstanceId, showToast } = adapters;
  return useCallback((kind: PlanSymbolKind) => {
    const room = getRooms().find((candidate) => candidate.id === getActiveRoomId());
    if (!room) return;
    const label = PLAN_SYMBOLS[kind].label;
    const sizeMm = layoutBlockTypicalSizeMm(kind);
    const overhead = isOverheadLayoutBlockKind(kind);
    const roomHeight = room.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight;
    // A block fixed high sits with its top at the ceiling, as a ceiling-mounted product does.
    const baseY = overhead ? Math.max(0, roomHeight - sizeMm.h / 1000) : 0;
    const position = findLayoutBlockSpot({ room, sizeMm, overhead, baseY, getItemAABB, isContained });
    if (!position) {
      showToast(`No clear spot for a ${label.toLowerCase()} in ${room.name}. Make room, or choose a smaller piece.`);
      return;
    }
    const instanceId = createInstanceId();
    const block = createLayoutBlockItem({ kind, instanceId, position });
    if (!commitItemsToRoom(room.id, (previous) => [...previous, block], `Add ${label} block`, { activateRoom: true })) return;
    selectItems({ roomId: room.id, instanceIds: [instanceId], primaryInstanceId: instanceId });
    announceUndoableAction({ message: `${label} block added to the ${room.name}. Set its size in the item panel.`, undoLabels: [`Add ${label} block`] });
  }, [commitItemsToRoom, createInstanceId, getActiveRoomId, getItemAABB, getRooms, isContained, selectItems, showToast]);
}
