"use client";

import { useEffect } from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignItem } from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export type DesignPageKeyboardInput = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export type PendingPlacementKeyboardCommand =
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "rotate"; direction: "left" | "right" }
  | { type: "nudge"; deltaX: number; deltaZ: number };

export type SelectedItemKeyboardCommand =
  | { type: "duplicate" }
  | { type: "rotate"; degrees: number }
  | { type: "nudge"; deltaX: number; deltaZ: number };

export type SelectedPlanKeyboardCommand =
  | { type: "clear-selection" }
  | { type: "delete-room"; roomId: string }
  | { type: "duplicate-room"; roomId: string }
  | {
      type: "nudge-room";
      deltaX: number;
      deltaZ: number;
      snap: boolean;
    };

export type ResolvePendingPlacementKeyboardCommandInput =
  DesignPageKeyboardInput & {
    canEdit: boolean;
    hasPendingPlacement: boolean;
  };

export function resolvePendingPlacementKeyboardCommand({
  key,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  altKey = false,
  canEdit,
  hasPendingPlacement,
}: ResolvePendingPlacementKeyboardCommandInput): PendingPlacementKeyboardCommand | null {
  if (!hasPendingPlacement) return null;
  if (key === "Escape") return { type: "cancel" };
  if (!canEdit) return null;

  if (key === "Enter") return { type: "confirm" };
  if (key.toLowerCase() === "r" && !metaKey && !ctrlKey && !altKey) {
    return {
      type: "rotate",
      direction: shiftKey ? "left" : "right",
    };
  }

  const step = shiftKey ? 0.25 : 0.1;
  if (key === "ArrowLeft") return { type: "nudge", deltaX: -step, deltaZ: 0 };
  if (key === "ArrowRight") return { type: "nudge", deltaX: step, deltaZ: 0 };
  if (key === "ArrowUp") return { type: "nudge", deltaX: 0, deltaZ: -step };
  if (key === "ArrowDown") return { type: "nudge", deltaX: 0, deltaZ: step };

  return null;
}

export type ResolveSelectedItemKeyboardCommandInput = DesignPageKeyboardInput & {
  canEdit: boolean;
  hasSelectedItem: boolean;
};

export function resolveSelectedItemKeyboardCommand({
  key,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  altKey = false,
  canEdit,
  hasSelectedItem,
}: ResolveSelectedItemKeyboardCommandInput): SelectedItemKeyboardCommand | null {
  if (!hasSelectedItem || !canEdit) return null;

  if ((metaKey || ctrlKey) && key.toLowerCase() === "d") {
    return { type: "duplicate" };
  }
  if (key.toLowerCase() === "r" && !metaKey && !ctrlKey && !altKey) {
    return { type: "rotate", degrees: 90 };
  }

  const step = shiftKey ? 0.25 : 0.05;
  if (key === "ArrowLeft") return { type: "nudge", deltaX: -step, deltaZ: 0 };
  if (key === "ArrowRight") return { type: "nudge", deltaX: step, deltaZ: 0 };
  if (key === "ArrowUp") return { type: "nudge", deltaX: 0, deltaZ: -step };
  if (key === "ArrowDown") return { type: "nudge", deltaX: 0, deltaZ: step };

  return null;
}

export type ResolveSelectedPlanKeyboardCommandInput = DesignPageKeyboardInput & {
  canEdit: boolean;
  hasSelectedItem: boolean;
  selectedItemCount: number;
  selectedPlanOverlayId: string | null;
  selectedPlanRoomId: string | null;
  selectedZoneId: string | null;
  viewMode: EditorViewMode;
};

export function resolveSelectedPlanKeyboardCommand({
  key,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  canEdit,
  hasSelectedItem,
  selectedItemCount,
  selectedPlanOverlayId,
  selectedPlanRoomId,
  selectedZoneId,
  viewMode,
}: ResolveSelectedPlanKeyboardCommandInput): SelectedPlanKeyboardCommand | null {
  if (key === "Escape") {
    const hasSelection =
      Boolean(selectedPlanRoomId) ||
      Boolean(selectedPlanOverlayId) ||
      selectedItemCount > 0 ||
      Boolean(selectedZoneId);
    return hasSelection ? { type: "clear-selection" } : null;
  }

  if (!selectedPlanRoomId || selectedPlanOverlayId || hasSelectedItem) return null;

  if ((key === "Backspace" || key === "Delete") && canEdit) {
    return { type: "delete-room", roomId: selectedPlanRoomId };
  }
  if ((metaKey || ctrlKey) && key.toLowerCase() === "d" && canEdit) {
    return { type: "duplicate-room", roomId: selectedPlanRoomId };
  }

  if (viewMode !== "2d") return null;
  const step = shiftKey ? 0.25 : 0.05;
  const snap = !shiftKey;
  if (key === "ArrowLeft") {
    return { type: "nudge-room", deltaX: -step, deltaZ: 0, snap };
  }
  if (key === "ArrowRight") {
    return { type: "nudge-room", deltaX: step, deltaZ: 0, snap };
  }
  if (key === "ArrowUp") {
    return { type: "nudge-room", deltaX: 0, deltaZ: -step, snap };
  }
  if (key === "ArrowDown") {
    return { type: "nudge-room", deltaX: 0, deltaZ: step, snap };
  }

  return null;
}

type SelectedIdsRef = {
  current: Set<string>;
};

type CommitItems = (
  updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
  actionName?: string
) => void;

export type DesignPageDeleteSelectionShortcutState = {
  isClientPreview: boolean;
  items: readonly DesignItem[];
  selectedPlanOverlayId: string | null;
};

export type DesignPageDeleteSelectionShortcutConfiguration = {
  catalogItems: Readonly<Record<string, Pick<CatalogItemSchema, "title">>>;
};

export type DesignPageDeleteSelectionShortcutRefs = {
  selectedIds: SelectedIdsRef;
};

export type DesignPageDeleteSelectionShortcutActions = {
  clearSelection: () => void;
  commitItems: CommitItems;
  deletePlanOverlay: (overlayId: string | null) => boolean;
};

export type UseDesignPageDeleteSelectionShortcutInput = {
  state: DesignPageDeleteSelectionShortcutState;
  configuration: DesignPageDeleteSelectionShortcutConfiguration;
  refs: DesignPageDeleteSelectionShortcutRefs;
  actions: DesignPageDeleteSelectionShortcutActions;
};

function isDeleteShortcutTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.tagName === "INPUT" ||
      element?.tagName === "TEXTAREA" ||
      element?.isContentEditable
  );
}

function isSelectionShortcutTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.tagName === "INPUT" ||
      element?.tagName === "TEXTAREA" ||
      element?.tagName === "SELECT" ||
      element?.isContentEditable
  );
}

export function useDesignPageDeleteSelectionShortcut({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageDeleteSelectionShortcutInput): void {
  const { isClientPreview, items, selectedPlanOverlayId } = state;
  const { catalogItems } = configuration;
  const { selectedIds: selectedIdsRef } = refs;
  const { clearSelection, commitItems, deletePlanOverlay } = actions;

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (isClientPreview || isDeleteShortcutTarget(event.target)) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      if (selectedPlanOverlayId) {
        event.preventDefault();
        deletePlanOverlay(selectedPlanOverlayId);
        return;
      }

      const selectedIds = Array.from(selectedIdsRef.current);
      if (selectedIds.length === 0) return;
      event.preventDefault();

      const itemNames = selectedIds
        .map((id) => {
          const item = items.find((entry) => entry.instanceId === id);
          return item ? catalogItems[item.productId]?.title || "Item" : "Item";
        })
        .filter((name, index, names) => names.indexOf(name) === index);
      const actionLabel =
        selectedIds.length === 1
          ? `Delete ${itemNames[0]}`
          : `Delete ${selectedIds.length} items`;

      commitItems(
        (previous) =>
          previous.filter((item) => !selectedIds.includes(item.instanceId)),
        actionLabel
      );
      clearSelection();
    };

    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [
    catalogItems,
    clearSelection,
    commitItems,
    deletePlanOverlay,
    isClientPreview,
    items,
    selectedIdsRef,
    selectedPlanOverlayId,
  ]);
}

export type DesignPageSelectionKeyboardState = {
  canEdit: boolean;
  editorMode: DesignPageEditorMode;
  hasPendingCatalogPlacement: boolean;
  isClientPreview: boolean;
  selectedItemId: DesignItem["instanceId"] | null;
  selectedPlanOverlayId: string | null;
  selectedPlanRoomId: HousePlanRoom2D["id"] | null;
  selectedRotationDegrees: number;
  selectedZoneId: string | null;
  viewMode: EditorViewMode;
};

export type DesignPageSelectionKeyboardRefs = {
  selectedIds: SelectedIdsRef;
};

export type DesignPageSelectionKeyboardActions = {
  setRotationInputValue: (value: string) => void;
  clearAllSelection: () => void;
  placement: {
    cancel: () => void;
    confirm: () => void;
    rotate: (direction: "left" | "right") => void;
    nudge: (deltaX: number, deltaZ: number) => void;
  };
  item: {
    duplicate: () => void;
    rotateByDegrees: (degrees: number) => void;
    nudge: (deltaX: number, deltaZ: number) => void;
  };
  room: {
    delete: (roomId: string) => void;
    duplicate: (roomId: string) => void;
    nudge: (
      deltaX: number,
      deltaZ: number,
      options: { snap: boolean }
    ) => void;
  };
};

export type UseDesignPageSelectionKeyboardControllerInput = {
  state: DesignPageSelectionKeyboardState;
  refs: DesignPageSelectionKeyboardRefs;
  actions: DesignPageSelectionKeyboardActions;
};

export function useDesignPageSelectionKeyboardController({
  state,
  refs,
  actions,
}: UseDesignPageSelectionKeyboardControllerInput): void {
  const {
    canEdit,
    editorMode,
    hasPendingCatalogPlacement,
    isClientPreview,
    selectedItemId,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    selectedRotationDegrees,
    selectedZoneId,
    viewMode,
  } = state;
  const hasSelectedItem = Boolean(selectedItemId);
  const { selectedIds: selectedIdsRef } = refs;
  const {
    setRotationInputValue,
    clearAllSelection,
    placement,
    item,
    room,
  } = actions;
  const {
    cancel: cancelPendingPlacement,
    confirm: confirmPendingPlacement,
    rotate: rotatePendingPlacement,
    nudge: nudgePendingPlacement,
  } = placement;
  const {
    duplicate: duplicateSelectedItem,
    rotateByDegrees: rotateSelectedItemByDegrees,
    nudge: nudgeSelectedItem,
  } = item;
  const {
    delete: deleteSelectedRoom,
    duplicate: duplicateSelectedRoom,
    nudge: nudgeSelectedRoom,
  } = room;

  useEffect(() => {
    if (!hasSelectedItem) {
      setRotationInputValue("0");
      return;
    }
    setRotationInputValue(String(selectedRotationDegrees));
  }, [hasSelectedItem, selectedItemId, selectedRotationDegrees, setRotationInputValue]);

  useEffect(() => {
    if (isClientPreview) return;

    const handleSelectedItemShortcut = (event: KeyboardEvent) => {
      if (isSelectionShortcutTarget(event.target)) return;

      const keyboardInput: DesignPageKeyboardInput = {
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      };
      const pendingCommand = resolvePendingPlacementKeyboardCommand({
        ...keyboardInput,
        canEdit,
        hasPendingPlacement: hasPendingCatalogPlacement,
      });
      if (pendingCommand) {
        event.preventDefault();
        if (pendingCommand.type === "cancel") cancelPendingPlacement();
        else if (pendingCommand.type === "confirm") confirmPendingPlacement();
        else if (pendingCommand.type === "rotate") {
          rotatePendingPlacement(pendingCommand.direction);
        } else {
          nudgePendingPlacement(pendingCommand.deltaX, pendingCommand.deltaZ);
        }
        return;
      }

      const itemCommand = resolveSelectedItemKeyboardCommand({
        ...keyboardInput,
        canEdit,
        hasSelectedItem,
      });
      if (!itemCommand) return;

      event.preventDefault();
      if (itemCommand.type === "duplicate") duplicateSelectedItem();
      else if (itemCommand.type === "rotate") {
        rotateSelectedItemByDegrees(itemCommand.degrees);
      } else {
        nudgeSelectedItem(itemCommand.deltaX, itemCommand.deltaZ);
      }
    };

    window.addEventListener("keydown", handleSelectedItemShortcut);
    return () => window.removeEventListener("keydown", handleSelectedItemShortcut);
  }, [
    canEdit,
    cancelPendingPlacement,
    confirmPendingPlacement,
    duplicateSelectedItem,
    hasPendingCatalogPlacement,
    hasSelectedItem,
    isClientPreview,
    nudgePendingPlacement,
    nudgeSelectedItem,
    rotatePendingPlacement,
    rotateSelectedItemByDegrees,
  ]);

  useEffect(() => {
    if (isClientPreview || editorMode === "present") return;

    const handleSelectedPlanObjectShortcut = (event: KeyboardEvent) => {
      if (isSelectionShortcutTarget(event.target)) return;

      const command = resolveSelectedPlanKeyboardCommand({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        canEdit,
        hasSelectedItem,
        selectedItemCount: selectedIdsRef.current.size,
        selectedPlanOverlayId,
        selectedPlanRoomId,
        selectedZoneId,
        viewMode,
      });
      if (!command) return;

      event.preventDefault();
      if (command.type === "clear-selection") clearAllSelection();
      else if (command.type === "delete-room") deleteSelectedRoom(command.roomId);
      else if (command.type === "duplicate-room") {
        duplicateSelectedRoom(command.roomId);
      } else {
        nudgeSelectedRoom(command.deltaX, command.deltaZ, { snap: command.snap });
      }
    };

    window.addEventListener("keydown", handleSelectedPlanObjectShortcut);
    return () => window.removeEventListener("keydown", handleSelectedPlanObjectShortcut);
  }, [
    canEdit,
    clearAllSelection,
    deleteSelectedRoom,
    duplicateSelectedRoom,
    editorMode,
    hasSelectedItem,
    isClientPreview,
    nudgeSelectedRoom,
    selectedIdsRef,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    selectedZoneId,
    viewMode,
  ]);
}
