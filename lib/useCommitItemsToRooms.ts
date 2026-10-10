"use client";

import { useCallback, type MutableRefObject } from "react";

import { applyReplaceRoomsItemsCommand, type ReplaceRoomsItemsCommandInput } from "@/lib/design-page-item-commands";
import type { HistoryCommand } from "@/lib/historyManager";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";

export type RoomItemsUpdate = { roomId: string; update: (items: DesignItem[]) => DesignItem[] };

type CommitItemsToRoomsInput = {
  designSnapshotRef: MutableRefObject<DesignSnapshot>;
  activeItemsRef: MutableRefObject<DesignItem[]>;
  history: { executeCommand: <TInput, TResult>(command: HistoryCommand<TInput, TResult>) => TResult };
  setDesignSnapshot: (next: DesignSnapshot) => void;
  reconcile: (items: DesignItem[], roomId?: string) => { validItems: DesignItem[] };
};

/**
 * Changes several rooms' products as one history step, so one Undo puts them all back: Pro's
 * "Swap all" across the design (UX 4h, J's Q2 (a)). History keeps the whole design, so the step
 * needs nothing new there. Rooms that no longer exist are left out; with none left, nothing happens.
 */
export function useCommitItemsToRooms({ designSnapshotRef, activeItemsRef, history, setDesignSnapshot, reconcile }: CommitItemsToRoomsInput) {
  return useCallback(
    (updates: readonly RoomItemsUpdate[], actionName: string) => {
      const snapshot = designSnapshotRef.current;
      const rooms = updates.flatMap(({ roomId, update }) => {
        const room = snapshot.rooms.find((entry) => entry.id === roomId);
        return room ? [{ roomId, items: reconcile(update(room.items), roomId).validItems }] : [];
      });
      if (rooms.length === 0) return null;
      return history.executeCommand<ReplaceRoomsItemsCommandInput, ReplaceRoomsItemsCommandInput["rooms"]>({
        id: "replace-rooms-items",
        description: actionName,
        input: { rooms },
        execute: (input) => {
          const next = applyReplaceRoomsItemsCommand(designSnapshotRef.current, input);
          setDesignSnapshot(next);
          const active = input.rooms.find((room) => room.roomId === next.activeRoomId);
          if (active) activeItemsRef.current = active.items;
          return input.rooms;
        },
      });
    },
    [activeItemsRef, designSnapshotRef, history, reconcile, setDesignSnapshot]
  );
}
