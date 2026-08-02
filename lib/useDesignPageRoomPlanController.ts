"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { track, trackProductEvent } from "@/lib/analytics";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import {
  clampRoomDimension,
  doesHouseRoomOverlap,
  resolveHouseRoomDimensionEditPlacement,
  resolveHouseRoomMove,
  resolveHouseRoomResizePlacement,
  resolveNewRoomName,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  roundPlanCoordinate,
  type HousePlanRoom2D,
  type RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import { normalizeItemsToRoom } from "@/lib/design-page-zone-layout";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  createRoom,
  deleteRoom,
  switchRoom as switchActiveRoom,
  updateRoom,
  type DesignItem,
  type DesignSnapshot,
  type RoomSnapshot,
} from "@/lib/room-types";

type RoomPlanHistory = {
  begin: (name: string) => void;
  commit: () => void;
};

type ResolveConfiguredPlanningDimsMm = (
  item: DesignItem,
  fallbackProduct: CatalogItemSchema
) => { w: number; d: number; h: number };

type SetDesignSnapshot = (
  next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
) => void;

type SetPlanOpenings = (
  next: RoomOpening2D[] | ((previous: RoomOpening2D[]) => RoomOpening2D[])
) => void;

export type DesignPageRoomPlanControllerState = {
  designSnapshot: DesignSnapshot;
  activeRoom: RoomSnapshot | null;
  housePlanRooms: HousePlanRoom2D[];
  selectedPlanRoomId: string | null;
  selectedPlanRoom: HousePlanRoom2D | null;
};

export type DesignPageRoomPlanControllerConfiguration = {
  canEdit: boolean;
  viewMode: "2d" | "3d";
  catalogItems: typeof CATALOG_ITEMS;
  resolveConfiguredPlanningDimsMm: ResolveConfiguredPlanningDimsMm;
};

export type DesignPageRoomPlanControllerRefs = {
  designSnapshot: MutableRefObject<DesignSnapshot>;
};

export type DesignPageRoomPlanControllerActions = {
  setDesignSnapshot: SetDesignSnapshot;
  setPlanOpenings: SetPlanOpenings;
  setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
  setRoomWidthInput: Dispatch<SetStateAction<string>>;
  setRoomDepthInput: Dispatch<SetStateAction<string>>;
  clearNonRoomSelection: () => void;
  renameRoom: (roomId: string, nextName: string) => void;
  moveRoom2D: (
    roomId: string,
    x: number,
    z: number,
    options?: { snap?: boolean }
  ) => void;
  history: RoomPlanHistory;
  runHistoryTransaction: (name: string, mutation: () => void) => void;
  showToast: (message: string) => void;
};

export type UseDesignPageRoomPlanControllerInput = {
  state: DesignPageRoomPlanControllerState;
  configuration: DesignPageRoomPlanControllerConfiguration;
  refs: DesignPageRoomPlanControllerRefs;
  actions: DesignPageRoomPlanControllerActions;
};

export function useDesignPageRoomPlanController({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageRoomPlanControllerInput) {
  const {
    designSnapshot,
    activeRoom,
    housePlanRooms,
    selectedPlanRoomId,
    selectedPlanRoom,
  } = state;
  const {
    canEdit,
    viewMode,
    catalogItems,
    resolveConfiguredPlanningDimsMm,
  } = configuration;
  const { designSnapshot: designSnapshotRef } = refs;
  const {
    setDesignSnapshot,
    setPlanOpenings,
    setSelectedPlanRoomId,
    setRoomWidthInput,
    setRoomDepthInput,
    clearNonRoomSelection,
    renameRoom,
    moveRoom2D,
    history,
    runHistoryTransaction,
    showToast,
  } = actions;

  const [pendingRoomRenameId, setPendingRoomRenameId] = useState<string | null>(null);
  const [pendingRoomRenameValue, setPendingRoomRenameValue] = useState("");

  // Room selection and camera navigation intentionally remain separate. A normal
  // room click must not pull the user out of the whole-home overview.
  const switchRoom = useCallback(
    (roomId: string) => {
      setDesignSnapshot((previous) => switchActiveRoom(previous, roomId));
      clearNonRoomSelection();
      track("editor_room_switched", { roomId });
    },
    [clearNonRoomSelection, setDesignSnapshot]
  );

  const startRoomRename = useCallback(
    (roomId: string) => {
      const room = designSnapshotRef.current.rooms.find((entry) => entry.id === roomId);
      if (!room) return;

      setPendingRoomRenameId(roomId);
      setPendingRoomRenameValue(room.name);
    },
    [designSnapshotRef]
  );

  const cancelRoomRename = useCallback(() => {
    setPendingRoomRenameId(null);
    setPendingRoomRenameValue("");
  }, []);

  const commitRoomRename = useCallback(() => {
    if (!pendingRoomRenameId) return;

    const room = designSnapshotRef.current.rooms.find(
      (entry) => entry.id === pendingRoomRenameId
    );
    const trimmed = pendingRoomRenameValue.trim();
    if (!room || !trimmed || trimmed === room.name) {
      cancelRoomRename();
      return;
    }

    renameRoom(pendingRoomRenameId, trimmed);
    showToast(`Renamed to ${trimmed}`);
    cancelRoomRename();
  }, [
    cancelRoomRename,
    designSnapshotRef,
    pendingRoomRenameId,
    pendingRoomRenameValue,
    renameRoom,
    showToast,
  ]);

  const duplicateRoom = useCallback(
    (roomId: string) => {
      const source = designSnapshotRef.current.rooms.find((room) => room.id === roomId);
      const sourcePlanRoom = housePlanRooms.find((room) => room.id === roomId);
      if (!source || !sourcePlanRoom) return;

      const newRoom = createRoom(
        `room_${Date.now()}`,
        resolveNewRoomName(designSnapshotRef.current.rooms, source.roomType),
        source.roomType,
        { ...source.geometry }
      );

      newRoom.floorLevel = source.floorLevel ?? 1;
      const offsetCandidates = [
        { x: sourcePlanRoom.w + 0.3, z: 0 },
        { x: 0, z: sourcePlanRoom.d + 0.3 },
        { x: -sourcePlanRoom.w - 0.3, z: 0 },
        { x: 0, z: -sourcePlanRoom.d - 0.3 },
        { x: sourcePlanRoom.w + 0.8, z: sourcePlanRoom.d + 0.8 },
      ];
      const fallbackOffset = offsetCandidates[offsetCandidates.length - 1];
      const placement =
        offsetCandidates.find((offset) => {
          const x = roundPlanCoordinate(sourcePlanRoom.x + offset.x);
          const z = roundPlanCoordinate(sourcePlanRoom.z + offset.z);
          return !doesHouseRoomOverlap(
            "__duplicate_room__",
            x,
            z,
            sourcePlanRoom.w,
            sourcePlanRoom.d,
            housePlanRooms
          );
        }) ?? fallbackOffset;

      newRoom.planPosition = {
        x: roundPlanCoordinate(sourcePlanRoom.x + placement.x),
        z: roundPlanCoordinate(sourcePlanRoom.z + placement.z),
      };
      newRoom.planShape = source.planShape;
      newRoom.planPolygon = source.planPolygon?.map((point) => ({ ...point }));
      newRoom.surfaceFinishes = source.surfaceFinishes
        ? { ...source.surfaceFinishes }
        : undefined;

      history.begin("Duplicate room");
      setDesignSnapshot((previous) =>
        switchActiveRoom(
          { ...previous, rooms: [...previous.rooms, newRoom] },
          newRoom.id
        )
      );
      history.commit();
      setSelectedPlanRoomId(newRoom.id);
      clearNonRoomSelection();
      showToast(`${newRoom.name} duplicated`);
      track("floor_plan_room_duplicated", { roomId, duplicatedRoomId: newRoom.id });
    },
    [
      clearNonRoomSelection,
      designSnapshotRef,
      history,
      housePlanRooms,
      setDesignSnapshot,
      setSelectedPlanRoomId,
      showToast,
    ]
  );

  const deleteSelectedRoom = useCallback(
    (roomId: string) => {
      if (designSnapshotRef.current.rooms.length <= 1) {
        showToast("Keep at least one room");
        return;
      }

      const room = designSnapshotRef.current.rooms.find((entry) => entry.id === roomId);
      if (!room) return;
      history.begin("Delete room");
      setDesignSnapshot((previous) => deleteRoom(previous, roomId));
      setPlanOpenings((previous) =>
        previous.filter((opening) => opening.roomId !== roomId)
      );
      history.commit();
      setSelectedPlanRoomId(null);
      clearNonRoomSelection();
      showToast(`${room.name} deleted`);
      track("floor_plan_room_deleted", { roomId });
    },
    [
      clearNonRoomSelection,
      designSnapshotRef,
      history,
      setDesignSnapshot,
      setPlanOpenings,
      setSelectedPlanRoomId,
      showToast,
    ]
  );

  const resizeRoom2D = useCallback(
    (roomId: string, next: { x: number; z: number; w: number; d: number }) => {
      const width = clampRoomDimension(next.w);
      const depth = clampRoomDimension(next.d);

      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;
      if (doesHouseRoomOverlap(roomId, next.x, next.z, width, depth, housePlanRooms)) {
        showToast("Rooms cannot overlap");
        return;
      }

      setDesignSnapshot((previous) => {
        const target = previous.rooms.find((room) => room.id === roomId);
        if (!target) return previous;

        const currentWall =
          typeof target.geometry.wallThickness === "number" &&
          Number.isFinite(target.geometry.wallThickness)
            ? target.geometry.wallThickness
            : ROOM_DIMENSION_DEFAULTS.wallThickness;
        const normalizedItems = normalizeItemsToRoom({
          items: target.items,
          width,
          depth,
          wall: currentWall,
          catalogItems,
          resolveConfiguredPlanningDimsMm,
        });

        return updateRoom(previous, {
          ...target,
          geometry: {
            ...target.geometry,
            width,
            depth,
            wallThickness: currentWall,
          },
          planPosition: {
            x: roundPlanCoordinate(next.x),
            z: roundPlanCoordinate(next.z),
          },
          items: normalizedItems,
        });
      });
    },
    [
      catalogItems,
      housePlanRooms,
      resolveConfiguredPlanningDimsMm,
      setDesignSnapshot,
      showToast,
    ]
  );

  const commitRoomDimensionEdit2D = useCallback(
    (roomId: string, axis: "width" | "depth", valueMeters: number) => {
      const targetRoom = designSnapshot.rooms.find((room) => room.id === roomId);
      if (!targetRoom) return;
      if (
        !Number.isFinite(valueMeters) ||
        valueMeters < ROOM_DIMENSION_DEFAULTS.min ||
        valueMeters > ROOM_DIMENSION_DEFAULTS.max
      ) {
        showToast("Enter a valid room dimension.");
        return;
      }

      const width = clampRoomDimension(
        axis === "width" ? valueMeters : targetRoom.geometry.width
      );
      const depth = clampRoomDimension(
        axis === "depth" ? valueMeters : targetRoom.geometry.depth
      );
      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;

      const placement = resolveHouseRoomDimensionEditPlacement(
        roomId,
        axis,
        width,
        depth,
        housePlanRooms
      );
      if (!placement) {
        showToast("Rooms cannot overlap");
        return;
      }

      const currentWall =
        typeof targetRoom.geometry.wallThickness === "number" &&
        Number.isFinite(targetRoom.geometry.wallThickness)
          ? targetRoom.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness;
      const normalizedItems = normalizeItemsToRoom({
        items: targetRoom.items,
        width,
        depth,
        wall: currentWall,
        catalogItems,
        resolveConfiguredPlanningDimsMm,
      });
      const repositionedItemCount = normalizedItems.filter((item, index) => {
        const previous = targetRoom.items[index];
        return Boolean(
          previous &&
            (previous.position[0] !== item.position[0] ||
              previous.position[2] !== item.position[2])
        );
      }).length;
      const currentPosition = targetRoom.planPosition ?? { x: 0, z: 0 };
      const roomShifted =
        roundPlanCoordinate(currentPosition.x) !== placement.x ||
        roundPlanCoordinate(currentPosition.z) !== placement.z;

      history.begin("Edit room dimension");
      setDesignSnapshot((previous) =>
        updateRoom(previous, {
          ...targetRoom,
          geometry: {
            ...targetRoom.geometry,
            width,
            depth,
            wallThickness: currentWall,
          },
          planPosition: {
            x: roundPlanCoordinate(placement.x),
            z: roundPlanCoordinate(placement.z),
          },
          items: normalizedItems,
        })
      );
      history.commit();

      if (designSnapshot.activeRoomId === roomId) {
        setRoomWidthInput(width.toFixed(2));
        setRoomDepthInput(depth.toFixed(2));
      }

      track("editor_room_dimension_edited", { roomId, axis, width, depth });
      trackProductEvent("room_dimensions_completed", {
        source: "dimension_input",
        unit: "mm",
        result: "success",
      });
      if (repositionedItemCount > 0 || roomShifted) {
        const details = [
          roomShifted ? "an edge was anchored to avoid overlap" : null,
          repositionedItemCount > 0
            ? `${repositionedItemCount} item${
                repositionedItemCount === 1 ? "" : "s"
              } moved inside the room`
            : null,
        ].filter(Boolean);
        showToast(`Dimension updated; ${details.join(" and ")}.`);
      }
    },
    [
      catalogItems,
      designSnapshot.activeRoomId,
      designSnapshot.rooms,
      history,
      housePlanRooms,
      resolveConfiguredPlanningDimsMm,
      setDesignSnapshot,
      setRoomDepthInput,
      setRoomWidthInput,
      showToast,
    ]
  );

  const commitActiveRoomDimension = useCallback(
    (axis: "width" | "depth", valueMm: number) => {
      const roomId = selectedPlanRoomId ?? designSnapshot.activeRoomId;
      if (!roomId) return;
      commitRoomDimensionEdit2D(roomId, axis, valueMm / 1000);
    },
    [designSnapshot.activeRoomId, commitRoomDimensionEdit2D, selectedPlanRoomId]
  );

  const applyRoomSize = useCallback(
    (nextWidth: number, nextDepth: number) => {
      const room = activeRoom;
      if (!room) return;

      const width = clampRoomDimension(nextWidth);
      const depth = clampRoomDimension(nextDepth);
      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;

      const placement = resolveHouseRoomResizePlacement(
        room.id,
        width,
        depth,
        housePlanRooms
      );
      if (!placement) {
        showToast("That size would overlap another room.");
        return;
      }

      const currentWall =
        typeof room.geometry.wallThickness === "number" &&
        Number.isFinite(room.geometry.wallThickness)
          ? room.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness;
      const normalizedItems = normalizeItemsToRoom({
        items: room.items,
        width,
        depth,
        wall: currentWall,
        catalogItems,
        resolveConfiguredPlanningDimsMm,
      });
      const repositionedItemCount = normalizedItems.filter((item, index) => {
        const previous = room.items[index];
        return Boolean(
          previous &&
            (previous.position[0] !== item.position[0] ||
              previous.position[2] !== item.position[2])
        );
      }).length;
      const currentPosition = room.planPosition ?? { x: 0, z: 0 };
      const roomShifted =
        roundPlanCoordinate(currentPosition.x) !== placement.x ||
        roundPlanCoordinate(currentPosition.z) !== placement.z;
      const nextRoom = {
        ...room,
        geometry: {
          ...room.geometry,
          width,
          depth,
          wallThickness: currentWall,
        },
        planPosition: placement,
        items: normalizedItems,
      };

      if (room.geometry.width === width && room.geometry.depth === depth) return;

      history.begin("Resize room");
      setDesignSnapshot((previous) => updateRoom(previous, nextRoom));
      history.commit();
      track("editor_room_resized", { roomId: room.id, width, depth });
      trackProductEvent("room_dimensions_completed", {
        source: "room_resize",
        unit: "mm",
        result: "success",
      });

      setRoomWidthInput(width.toFixed(2));
      setRoomDepthInput(depth.toFixed(2));
      if (repositionedItemCount > 0 || roomShifted) {
        const details = [
          roomShifted ? "the room edge was anchored to avoid overlap" : null,
          repositionedItemCount > 0
            ? `${repositionedItemCount} item${
                repositionedItemCount === 1 ? "" : "s"
              } moved inside the new boundary`
            : null,
        ].filter(Boolean);
        showToast(`Room resized; ${details.join(" and ")}.`);
      }
    },
    [
      activeRoom,
      catalogItems,
      history,
      housePlanRooms,
      resolveConfiguredPlanningDimsMm,
      setDesignSnapshot,
      setRoomDepthInput,
      setRoomWidthInput,
      showToast,
    ]
  );

  const changeRoomPreset = useCallback(
    (presetId: RoomSizePresetId) => {
      const preset = ROOM_SIZE_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      applyRoomSize(preset.width, preset.depth);
    },
    [applyRoomSize]
  );

  const nudgeSelectedPlanRoom = useCallback(
    (deltaX: number, deltaZ: number, options?: { snap?: boolean }) => {
      if (!selectedPlanRoom || viewMode !== "2d" || !canEdit) return;
      const nextX = roundPlanCoordinate(selectedPlanRoom.x + deltaX);
      const nextZ = roundPlanCoordinate(selectedPlanRoom.z + deltaZ);
      const move = resolveHouseRoomMove({
        roomId: selectedPlanRoom.id,
        x: nextX,
        z: nextZ,
        rooms: housePlanRooms,
        snap: options?.snap !== false,
      });
      if (!move || move.movementStatus === "blocked") {
        showToast("Rooms cannot overlap");
        return;
      }
      runHistoryTransaction("Nudge room", () => {
        moveRoom2D(selectedPlanRoom.id, move.x, move.z, {
          snap: options?.snap !== false,
        });
      });
    },
    [
      canEdit,
      housePlanRooms,
      moveRoom2D,
      runHistoryTransaction,
      selectedPlanRoom,
      showToast,
      viewMode,
    ]
  );

  return {
    state: {
      pendingRoomRenameId,
      pendingRoomRenameValue,
    },
    actions: {
      switchRoom,
      startRoomRename,
      setPendingRoomRenameValue,
      cancelRoomRename,
      commitRoomRename,
      duplicateRoom,
      deleteRoom: deleteSelectedRoom,
      resizeRoom2D,
      commitRoomDimensionEdit2D,
      commitActiveRoomDimension,
      changeRoomPreset,
      nudgeSelectedPlanRoom,
    },
  };
}
