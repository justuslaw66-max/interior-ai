"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  appendLayoutVersion,
  createLayoutVersion,
  restoreLayoutVersion,
} from "@/lib/layout-versions";
import {
  getActiveRoom,
  updateRoom,
  type DesignSnapshot,
  type LayoutVersion,
} from "@/lib/room-types";

type LayoutVersionHistory = {
  begin: (name: string) => void;
  commit: () => void;
};

export type DesignPageLayoutVersionsRefs = {
  designSnapshot: MutableRefObject<DesignSnapshot>;
};

export type DesignPageLayoutVersionsActions = {
  setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
  history: LayoutVersionHistory;
  updateSelection: (next: Set<string>, primaryId: string | null) => void;
  showToast: (message: string) => void;
};

export type UseDesignPageLayoutVersionsControllerParams = {
  refs: DesignPageLayoutVersionsRefs;
  actions: DesignPageLayoutVersionsActions;
};

type SaveRoomLayoutVersionOptions = {
  showToast?: boolean;
};

export function useDesignPageLayoutVersionsController({
  refs: { designSnapshot: designSnapshotRef },
  actions: { setDesignSnapshot, history, updateSelection, showToast },
}: UseDesignPageLayoutVersionsControllerParams) {
  const [layoutVersionNameInput, setLayoutVersionNameInput] = useState("");

  const saveRoomLayoutVersion = useCallback(
    (
      requestedName?: string,
      source: LayoutVersion["source"] = "manual",
      roomId?: string,
      options: SaveRoomLayoutVersionOptions = {}
    ): LayoutVersion | null => {
      const snapshot = designSnapshotRef.current;
      const room = snapshot.rooms.find(
        (entry) => entry.id === (roomId ?? snapshot.activeRoomId)
      );
      if (!room) {
        if (options.showToast !== false) {
          showToast("Add a room before saving layouts");
        }
        return null;
      }

      const name =
        requestedName?.trim() ||
        `Layout ${(room.layoutVersions?.length ?? 0) + 1}`;
      const version = createLayoutVersion(room, { name, source });
      setDesignSnapshot((previous) => {
        const currentRoom = previous.rooms.find(
          (entry) => entry.id === room.id
        );
        if (!currentRoom) return previous;
        return updateRoom(
          previous,
          appendLayoutVersion(currentRoom, version)
        );
      });
      if (options.showToast !== false) {
        showToast(`${version.name} saved`);
      }
      return version;
    },
    [designSnapshotRef, setDesignSnapshot, showToast]
  );

  const saveCurrentLayoutVersion = useCallback(() => {
    const saved = saveRoomLayoutVersion(
      layoutVersionNameInput,
      "manual",
      undefined,
      { showToast: true }
    );
    if (saved) setLayoutVersionNameInput("");
  }, [layoutVersionNameInput, saveRoomLayoutVersion]);

  const restoreRoomLayoutVersion = useCallback(
    (versionId: string) => {
      const snapshot = designSnapshotRef.current;
      const room = getActiveRoom(snapshot);
      const version = room?.layoutVersions?.find(
        (entry) => entry.id === versionId
      );
      if (!room || !version) {
        showToast("Layout version not found");
        return;
      }

      history.begin(`Restore ${version.name}`);
      setDesignSnapshot((previous) => {
        const currentRoom = getActiveRoom(previous);
        const currentVersion = currentRoom?.layoutVersions?.find(
          (entry) => entry.id === versionId
        );
        if (!currentRoom || !currentVersion) return previous;
        const beforeRestore = createLayoutVersion(currentRoom, {
          name: `Before ${currentVersion.name}`,
          source: "manual",
        });
        return updateRoom(
          previous,
          appendLayoutVersion(
            restoreLayoutVersion(currentRoom, currentVersion),
            beforeRestore
          )
        );
      });
      updateSelection(new Set(), null);
      history.commit();
      showToast(`${version.name} restored`);
    },
    [
      designSnapshotRef,
      history,
      setDesignSnapshot,
      showToast,
      updateSelection,
    ]
  );

  const deleteRoomLayoutVersion = useCallback(
    (versionId: string) => {
      setDesignSnapshot((previous) => {
        const currentRoom = getActiveRoom(previous);
        if (!currentRoom) return previous;
        return updateRoom(previous, {
          ...currentRoom,
          layoutVersions: (currentRoom.layoutVersions ?? []).filter(
            (entry) => entry.id !== versionId
          ),
        });
      });
      showToast("Layout version removed");
    },
    [setDesignSnapshot, showToast]
  );

  return {
    state: {
      layoutVersionNameInput,
    },
    actions: {
      setLayoutVersionNameInput,
      saveCurrentLayoutVersion,
      restoreRoomLayoutVersion,
      deleteRoomLayoutVersion,
    },
  };
}
