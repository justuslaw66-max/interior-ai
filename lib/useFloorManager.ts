"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { track } from "@/lib/analytics";
import type { CameraView } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import { switchRoom, type DesignSnapshot, type RoomSnapshot } from "@/lib/room-types";
import {
  buildNewFloorRooms,
  clonePlanOpeningsForRoomMap,
  duplicateFloorRooms,
  formatFloorLevel,
  getDeletedFloorRoomIds,
  getFloorAccentColor,
  resolveActiveFloorLevel,
  resolveFloorOptions,
  resolveNextActiveRoomAfterFloorDelete,
  type FloorCreationMode,
  type FloorOption,
} from "@/lib/floor-manager-logic";

export {
  formatFloorLevel,
  getFloorAccentColor,
  type FloorCreationMode,
  type FloorOption,
};

export type FloorActionAdapters = {
  clearNonRoomSelection: () => void;
  transitionToCameraView: (nextView: CameraView, durationMs?: number) => void;
  updateCameraViewFromScene: () => void;
};

type UseFloorManagerParams = {
  designSnapshot: DesignSnapshot;
  designSnapshotRef: MutableRefObject<DesignSnapshot>;
  setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
  activeRoom: RoomSnapshot | null | undefined;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  wallThickness: number;
  /**
   * Not the history manager's begin/commit pair. begin refuses to nest and returns false, and these
   * actions dropped that boolean, so a floor action starting inside a still-open coalesced
   * transaction (a slider drag holds one for 420 ms) committed that transaction instead of its own:
   * the floor change joined the slider's undo entry and the slider's own commit later warned "No
   * active transaction to commit". runHistoryTransaction flushes first, as 39ae93ac did for room
   * deletion.
   */
  runHistoryTransaction: (name: string, mutation: () => void) => void;
  setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
  setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
  cameraViewRef: MutableRefObject<CameraView>;
  floorCameraViewsRef: MutableRefObject<Record<number, CameraView>>;
  actionAdaptersRef: MutableRefObject<FloorActionAdapters>;
  showRuleToast: (message: string) => void;
  viewMode: "2d" | "3d";
};

export function useFloorManager({
  designSnapshot,
  designSnapshotRef,
  setDesignSnapshot,
  activeRoom,
  roomWidth,
  roomDepth,
  roomHeight,
  wallThickness,
  runHistoryTransaction,
  setPlanOpenings,
  setSelectedPlanRoomId,
  cameraViewRef,
  floorCameraViewsRef,
  actionAdaptersRef,
  showRuleToast,
  viewMode,
}: UseFloorManagerParams) {
  const [stackedFloorView, setStackedFloorView] = useState(false);
  const [hiddenFloorLevels, setHiddenFloorLevels] = useState<number[]>([]);

  const activeFloorLevel = resolveActiveFloorLevel(activeRoom);
  const floorOptions = useMemo<FloorOption[]>(
    () => resolveFloorOptions(designSnapshot.rooms),
    [designSnapshot.rooms]
  );

  const activeFloorRoomCount =
    floorOptions.find((option) => option.level === activeFloorLevel)?.roomCount ?? 0;

  const switchRoomById = useCallback(
    (roomId: string) => {
      setDesignSnapshot((prev) => switchRoom(prev, roomId));
      actionAdaptersRef.current.clearNonRoomSelection();
      track("editor_room_switched", { roomId });
    },
    [actionAdaptersRef, setDesignSnapshot]
  );

  const handleSwitchFloor = useCallback(
    (level: number) => {
      const targetRoom = designSnapshotRef.current.rooms.find(
        (room) => (room.floorLevel ?? 1) === level
      );
      if (!targetRoom) return;

      actionAdaptersRef.current.updateCameraViewFromScene();
      floorCameraViewsRef.current[activeFloorLevel] = cameraViewRef.current;
      setHiddenFloorLevels((prev) => prev.filter((hiddenLevel) => hiddenLevel !== level));
      switchRoomById(targetRoom.id);

      const savedFloorCamera = floorCameraViewsRef.current[level];
      if (savedFloorCamera && viewMode === "3d") {
        window.setTimeout(
          () => actionAdaptersRef.current.transitionToCameraView(savedFloorCamera, 260),
          0
        );
      }

      showRuleToast(`Switched to ${formatFloorLevel(level)}`);
      track("editor_floor_switched", { floorLevel: level });
    },
    [
      actionAdaptersRef,
      activeFloorLevel,
      cameraViewRef,
      designSnapshotRef,
      floorCameraViewsRef,
      showRuleToast,
      switchRoomById,
      viewMode,
    ]
  );

  const handleToggleFloorVisibility = useCallback(
    (level: number) => {
      if (level === activeFloorLevel) {
        showRuleToast("Active floor stays visible");
        return;
      }

      setHiddenFloorLevels((prev) => {
        const isHidden = prev.includes(level);
        return isHidden
          ? prev.filter((hiddenLevel) => hiddenLevel !== level)
          : [...prev, level];
      });
    },
    [activeFloorLevel, showRuleToast]
  );

  const handleAddFloor = useCallback(
    (direction: "upper" | "lower", requestedMode: FloorCreationMode = "blank") => {
      const rooms = designSnapshotRef.current.rooms;
      const creationMode = requestedMode;
      const timestamp = Date.now();
      const { nextFloorLabel, nextLevel, nextRooms, roomIdMap } = buildNewFloorRooms({
        activeFloorLevel,
        activeRoom,
        creationMode,
        direction,
        roomDepth,
        roomHeight,
        rooms,
        roomWidth,
        timestamp,
        wallThickness,
      });

      const firstRoom = nextRooms[0];
      if (!firstRoom) return;

      const nextSnapshot = switchRoom(
        { ...designSnapshotRef.current, rooms: [...designSnapshotRef.current.rooms, ...nextRooms] },
        firstRoom.id
      );
      runHistoryTransaction(direction === "upper" ? "Add upper floor" : "Add lower floor", () => {
        designSnapshotRef.current = nextSnapshot;
        setDesignSnapshot(nextSnapshot);
        if (creationMode === "layout" || creationMode === "walls") {
          setPlanOpenings((prev) => [
            ...prev,
            ...clonePlanOpeningsForRoomMap(prev, roomIdMap, `floor_${timestamp}`),
          ]);
        }
      });
      setSelectedPlanRoomId(firstRoom.id);
      setHiddenFloorLevels((prev) => prev.filter((level) => level !== nextLevel));
      actionAdaptersRef.current.clearNonRoomSelection();
      showRuleToast(`Added ${nextFloorLabel}`);
      track("editor_floor_added", { direction, floorLevel: nextLevel, creationMode });
    },
    [
      actionAdaptersRef,
      activeFloorLevel,
      activeRoom,
      designSnapshotRef,
      runHistoryTransaction,
      roomDepth,
      roomHeight,
      roomWidth,
      setDesignSnapshot,
      setPlanOpenings,
      setSelectedPlanRoomId,
      showRuleToast,
      wallThickness,
    ]
  );

  const handleRenameFloor = useCallback((nextLabelInput?: string) => {
    const currentLabel =
      floorOptions.find((option) => option.level === activeFloorLevel)?.label ??
      formatFloorLevel(activeFloorLevel);
    const nextLabel = nextLabelInput?.trim();
    if (typeof nextLabelInput === "undefined") {
      showRuleToast("Use the floor panel to rename this floor");
      return;
    }
    if (!nextLabel || nextLabel === currentLabel) return;

    const nextSnapshot = {
      ...designSnapshotRef.current,
      rooms: designSnapshotRef.current.rooms.map((room) =>
        (room.floorLevel ?? 1) === activeFloorLevel ? { ...room, floorLabel: nextLabel } : room
      ),
    };
    runHistoryTransaction("Rename floor", () => {
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
    });
    showRuleToast(`Renamed floor to ${nextLabel}`);
    track("editor_floor_renamed", { floorLevel: activeFloorLevel });
  }, [activeFloorLevel, designSnapshotRef, floorOptions, runHistoryTransaction, setDesignSnapshot, showRuleToast]);

  const handleDuplicateFloor = useCallback(() => {
    const rooms = designSnapshotRef.current.rooms;
    const timestamp = Date.now();
    const { nextLevel, nextRooms, roomIdMap } = duplicateFloorRooms({
      activeFloorLevel,
      rooms,
      timestamp,
    });
    const firstRoom = nextRooms[0];
    if (!firstRoom) return;
    const nextSnapshot = switchRoom(
      { ...designSnapshotRef.current, rooms: [...rooms, ...nextRooms] },
      firstRoom.id
    );

    runHistoryTransaction("Duplicate floor", () => {
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      setPlanOpenings((prev) => [
        ...prev,
        ...clonePlanOpeningsForRoomMap(prev, roomIdMap, `copy_${timestamp}`),
      ]);
    });
    setSelectedPlanRoomId(firstRoom.id);
    actionAdaptersRef.current.clearNonRoomSelection();
    showRuleToast(`Duplicated to ${firstRoom.floorLabel}`);
    track("editor_floor_duplicated", { sourceFloorLevel: activeFloorLevel, floorLevel: nextLevel });
  }, [
    actionAdaptersRef,
    activeFloorLevel,
    designSnapshotRef,
    runHistoryTransaction,
    setDesignSnapshot,
    setPlanOpenings,
    setSelectedPlanRoomId,
    showRuleToast,
  ]);

  const handleDeleteFloor = useCallback((confirmed = false) => {
    const rooms = designSnapshotRef.current.rooms;
    const nextActiveRoom = resolveNextActiveRoomAfterFloorDelete(rooms, activeFloorLevel);
    if (!nextActiveRoom) {
      showRuleToast("Keep at least one floor");
      return;
    }
    const remainingRooms = rooms.filter((room) => (room.floorLevel ?? 1) !== activeFloorLevel);
    const currentLabel =
      floorOptions.find((option) => option.level === activeFloorLevel)?.label ??
      formatFloorLevel(activeFloorLevel);
    if (!confirmed) {
      showRuleToast(`Confirm delete for ${currentLabel} in the floor panel`);
      return;
    }

    const deletedRoomIds = getDeletedFloorRoomIds(rooms, activeFloorLevel);
    const nextSnapshot = switchRoom(
      { ...designSnapshotRef.current, rooms: remainingRooms },
      nextActiveRoom.id
    );

    runHistoryTransaction("Delete floor", () => {
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      setPlanOpenings((prev) =>
        prev.filter((opening) => !opening.roomId || !deletedRoomIds.has(opening.roomId))
      );
    });
    setSelectedPlanRoomId(nextActiveRoom.id);
    actionAdaptersRef.current.clearNonRoomSelection();
    showRuleToast(`${currentLabel} deleted`);
    track("editor_floor_deleted", { floorLevel: activeFloorLevel });
  }, [
    actionAdaptersRef,
    activeFloorLevel,
    designSnapshotRef,
    floorOptions,
    runHistoryTransaction,
    setDesignSnapshot,
    setPlanOpenings,
    setSelectedPlanRoomId,
    showRuleToast,
  ]);

  return {
    activeFloorLevel,
    activeFloorRoomCount,
    floorOptions,
    handleAddFloor,
    handleDeleteFloor,
    handleDuplicateFloor,
    handleRenameFloor,
    handleSwitchFloor,
    handleToggleFloorVisibility,
    hiddenFloorLevels,
    setStackedFloorView,
    stackedFloorView,
  };
}
