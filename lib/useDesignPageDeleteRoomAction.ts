"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { track } from "@/lib/analytics";
import type { RoomOpening2D } from "@/lib/editorScene";
import { deleteRoom, type DesignSnapshot } from "@/lib/room-types";

export type DesignPageDeleteRoomActionInput = {
  designSnapshotRef: MutableRefObject<DesignSnapshot>;
  runHistoryTransaction: (name: string, mutation: () => void) => void;
  setDesignSnapshot: (
    next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
  ) => void;
  setPlanOpenings: (
    next: RoomOpening2D[] | ((previous: RoomOpening2D[]) => RoomOpening2D[])
  ) => void;
  setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
  clearNonRoomSelection: () => void;
  clearPlanForEmptyCanvas: () => void;
  showToast: (message: string) => void;
};

/** Deleting the last room is allowed; the design becomes a valid blank canvas. */
export function useDesignPageDeleteRoomAction({
  designSnapshotRef,
  runHistoryTransaction,
  setDesignSnapshot,
  setPlanOpenings,
  setSelectedPlanRoomId,
  clearNonRoomSelection,
  clearPlanForEmptyCanvas,
  showToast,
}: DesignPageDeleteRoomActionInput) {
  return useCallback(
    (roomId: string) => {
      const rooms = designSnapshotRef.current.rooms;
      const room = rooms.find((entry) => entry.id === roomId);
      if (!room) return;
      const deletingLastRoom = rooms.length === 1;
      // Not the history manager's begin/commit pair: begin refuses to nest and returns false, so a
      // deletion that landed inside a still-open coalesced transaction (a slider drag holds one for
      // 420 ms) used to commit that transaction instead of its own: the deletion joined the
      // slider's undo entry, and the slider's own commit then warned "No active transaction to
      // commit". runHistoryTransaction flushes the open transaction first, so deletion owns its own
      // entry.
      runHistoryTransaction("Delete room", () => {
        setDesignSnapshot((previous) => deleteRoom(previous, roomId));
        setPlanOpenings((previous) =>
          previous.filter((opening) => opening.roomId !== roomId)
        );
        if (deletingLastRoom) clearPlanForEmptyCanvas();
      });
      setSelectedPlanRoomId(null);
      clearNonRoomSelection();
      showToast(
        deletingLastRoom
          ? "All rooms deleted. Start with a blank canvas."
          : `${room.name} deleted`
      );
      track("floor_plan_room_deleted", {
        roomId,
        remainingRoomCount: rooms.length - 1,
      });
    },
    [
      clearNonRoomSelection,
      clearPlanForEmptyCanvas,
      designSnapshotRef,
      runHistoryTransaction,
      setDesignSnapshot,
      setPlanOpenings,
      setSelectedPlanRoomId,
      showToast,
    ]
  );
}
