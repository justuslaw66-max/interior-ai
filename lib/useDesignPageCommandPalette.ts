"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { EditorCommandPaletteAction } from "@/components/editor/design-page/EditorCommandPalette";
import type { PlanLayerPresetId } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";

export type DesignPageCommandPaletteState = {
  isClientPreview: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  viewMode: EditorViewMode;
  planRoomCount: number;
  designRoomCount: number;
  selectedPlanOverlayId: string | null;
  selectedPlanRoomId: string | null;
  hasSelectedItem: boolean;
  planLayerPreset: PlanLayerPresetId;
};

export type DesignPageCommandPaletteActions = {
  undo: () => void;
  redo: () => void;
  fitPlanView: () => void;
  changeViewMode: (viewMode: EditorViewMode) => void;
  addFloorPlanOpening: (kind: RoomOpening2D["kind"]) => void;
  runHistoryTransaction: (name: string, action: () => void) => void;
  setPlanOpenings: (
    next: RoomOpening2D[] | ((previous: RoomOpening2D[]) => RoomOpening2D[])
  ) => void;
  selectPlanOverlay: (id: string | null) => void;
  deletePlanOverlay: (id: string) => void;
  duplicateRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  duplicateItem: () => void;
  deleteItem: () => void;
  runPlanPreset: (preset: "presentation" | "technical") => void;
};

export type UseDesignPageCommandPaletteOptions = {
  state: DesignPageCommandPaletteState;
  actions: DesignPageCommandPaletteActions;
};

export function useDesignPageCommandPalette({
  state,
  actions,
}: UseDesignPageCommandPaletteOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const {
    isClientPreview,
    canUndo,
    canRedo,
    undoName,
    redoName,
    viewMode,
    planRoomCount,
    designRoomCount,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    hasSelectedItem,
    planLayerPreset,
  } = state;
  const {
    undo,
    redo,
    fitPlanView,
    changeViewMode,
    addFloorPlanOpening,
    runHistoryTransaction,
    setPlanOpenings,
    selectPlanOverlay,
    deletePlanOverlay,
    duplicateRoom,
    deleteRoom,
    duplicateItem,
    deleteItem,
    runPlanPreset,
  } = actions;

  useEffect(() => {
    const handleCommandPaletteHotkey = (event: KeyboardEvent) => {
      if (isClientPreview) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
      setQuery("");
    };

    window.addEventListener("keydown", handleCommandPaletteHotkey);
    return () => window.removeEventListener("keydown", handleCommandPaletteHotkey);
  }, [isClientPreview]);

  const close = useCallback(() => setOpen(false), []);
  const insertDefaultDoor = useCallback(() => {
    const id = `opening-${Date.now()}`;
    runHistoryTransaction("Add door", () =>
      setPlanOpenings((previous) => [
        ...previous,
        {
          id,
          wall: "south",
          kind: "door",
          offsetMm: 0,
          widthMm: 900,
        },
      ])
    );
    selectPlanOverlay(id);
  }, [runHistoryTransaction, selectPlanOverlay, setPlanOpenings]);

  const paletteActions = useMemo<EditorCommandPaletteAction[]>(() => {
    const commandActions: EditorCommandPaletteAction[] = [
      {
        id: "undo",
        label: undoName ? `Undo ${undoName}` : "Undo",
        hint: "Revert the last edit",
        enabled: canUndo,
        run: undo,
      },
      {
        id: "redo",
        label: redoName ? `Redo ${redoName}` : "Redo",
        hint: "Restore the last undone edit",
        enabled: canRedo,
        run: redo,
      },
      {
        id: "fit-plan",
        label: viewMode === "2d" ? "Fit plan" : "Fit view",
        hint: "Reset the current camera framing",
        enabled: true,
        run: fitPlanView,
      },
      {
        id: "toggle-view",
        label: viewMode === "2d" ? "Switch to 3D" : "Switch to 2D plan",
        hint: "Toggle the main editor view",
        enabled: true,
        run: () => changeViewMode(viewMode === "2d" ? "3d" : "2d"),
      },
      {
        id: "add-door",
        label: "Add door",
        hint: "Place a doorway on a wall",
        enabled: planRoomCount > 0,
        run: () => addFloorPlanOpening("door"),
      },
      {
        id: "insert-default-door",
        label: "Insert default door",
        hint: "Add a centered south-wall door immediately",
        enabled: true,
        run: insertDefaultDoor,
      },
      {
        id: "add-window",
        label: "Add window",
        hint: "Place a window on a wall",
        enabled: planRoomCount > 0,
        run: () => addFloorPlanOpening("window"),
      },
      {
        id: "delete-overlay",
        label: "Delete selected plan item",
        hint: "Remove the selected door, window, note, or fixture",
        enabled: Boolean(selectedPlanOverlayId),
        run: () => {
          if (selectedPlanOverlayId) {
            deletePlanOverlay(selectedPlanOverlayId);
          }
        },
      },
      {
        id: "duplicate-room",
        label: "Duplicate selected room",
        hint: "Copy the selected room beside the plan",
        enabled: Boolean(selectedPlanRoomId),
        run: () => {
          if (selectedPlanRoomId) duplicateRoom(selectedPlanRoomId);
        },
      },
      {
        id: "delete-room",
        label: "Delete selected room",
        hint: "Remove the selected room",
        enabled: Boolean(selectedPlanRoomId) && designRoomCount > 1,
        run: () => {
          if (selectedPlanRoomId) deleteRoom(selectedPlanRoomId);
        },
      },
      {
        id: "duplicate-item",
        label: "Duplicate selected furniture",
        hint: "Copy the currently selected item",
        enabled: hasSelectedItem,
        run: duplicateItem,
      },
      {
        id: "delete-item",
        label: "Delete selected furniture",
        hint: "Remove the currently selected item",
        enabled: hasSelectedItem,
        run: deleteItem,
      },
      {
        id: "preset-presentation",
        label: "Use presentation preset",
        hint: "Switch plan layers to presentation",
        enabled: planLayerPreset !== "presentation",
        run: () => runPlanPreset("presentation"),
      },
      {
        id: "preset-technical",
        label: "Use technical preset",
        hint: "Switch plan layers to technical",
        enabled: planLayerPreset !== "technical",
        run: () => runPlanPreset("technical"),
      },
    ];

    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? commandActions.filter((action) =>
          `${action.label} ${action.hint}`.toLowerCase().includes(normalizedQuery)
        )
      : commandActions;
  }, [
    addFloorPlanOpening,
    canRedo,
    canUndo,
    changeViewMode,
    deleteItem,
    deletePlanOverlay,
    deleteRoom,
    designRoomCount,
    duplicateItem,
    duplicateRoom,
    fitPlanView,
    hasSelectedItem,
    insertDefaultDoor,
    planLayerPreset,
    planRoomCount,
    query,
    redo,
    redoName,
    runPlanPreset,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    undo,
    undoName,
    viewMode,
  ]);

  return {
    state: {
      open,
      query,
      actions: paletteActions,
    },
    actions: {
      close,
      setQuery,
    },
  };
}
