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
  history: { begin: (name: string) => void; commit: () => void };
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
  history,
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
      history.begin("Delete room");
      setDesignSnapshot((previous) => deleteRoom(previous, roomId));
      setPlanOpenings((previous) =>
        previous.filter((opening) => opening.roomId !== roomId)
      );
      if (deletingLastRoom) clearPlanForEmptyCanvas();
      history.commit();
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
      history,
      setDesignSnapshot,
      setPlanOpenings,
      setSelectedPlanRoomId,
      showToast,
    ]
  );
}
