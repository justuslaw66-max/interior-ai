"use client";

import { useEffect } from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { resolveDesignPageHigherPriorityKeyboardOwner } from "@/lib/design-page-keyboard-context";
import {
  isDesignPageSelectionShortcutBlocked,
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
  type DesignPageKeyboardInput,
  type PendingPlacementKeyboardCommand,
  type SelectedItemKeyboardCommand,
  type SelectedPlanKeyboardCommand,
} from "@/lib/design-page-selection-keyboard-commands";
import type { DesignItem } from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type SelectedIdsRef = {
  current: Set<string>;
};

type PrimaryIdRef = {
  current: DesignItem["instanceId"] | null;
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
  keyboardShortcutsEnabled: boolean;
  selectedItemId: DesignItem["instanceId"] | null;
  selectedPlanOverlayId: string | null;
  selectedPlanRoomId: HousePlanRoom2D["id"] | null;
  selectedRotationDegrees: number;
  selectedZoneId: string | null;
  rotationSnapEnabled: boolean;
  rotationSnapStepDegrees: number;
  viewMode: EditorViewMode;
};

export type DesignPageSelectionKeyboardRefs = {
  floorPlanTraceRoomMode: { current: boolean };
  primaryId: PrimaryIdRef;
  selectedIds: SelectedIdsRef;
};

type KeyboardRotationOptions = {
  snap: boolean;
  source: "keyboard";
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
    rotateByDegrees: (
      degrees: number,
      options: KeyboardRotationOptions
    ) => void;
    resetRotation: (options: KeyboardRotationOptions) => void;
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

function getKeyboardInput(event: KeyboardEvent): DesignPageKeyboardInput {
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    repeat: event.repeat,
  };
}

function consumeKeyboardCommand(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function executePendingPlacementCommand(
  command: PendingPlacementKeyboardCommand,
  actions: DesignPageSelectionKeyboardActions["placement"]
): void {
  if (command.type === "cancel") actions.cancel();
  else if (command.type === "confirm") actions.confirm();
  else if (command.type === "rotate") actions.rotate(command.direction);
  else actions.nudge(command.deltaX, command.deltaZ);
}

function executeSelectedItemCommand(
  command: SelectedItemKeyboardCommand,
  actions: DesignPageSelectionKeyboardActions["item"]
): void {
  if (command.type === "duplicate") actions.duplicate();
  else if (command.type === "rotate") {
    actions.rotateByDegrees(command.degrees, {
      snap: command.snap,
      source: "keyboard",
    });
  } else if (command.type === "reset-rotation") {
    actions.resetRotation({ snap: true, source: "keyboard" });
  } else actions.nudge(command.deltaX, command.deltaZ);
}

function routeSelectedItemKeyboardEvent(
  event: KeyboardEvent,
  input: UseDesignPageSelectionKeyboardControllerInput
): void {
  if (isDesignPageSelectionShortcutBlocked(event.target)) return;
  const keyboardInput = getKeyboardInput(event);
  const higherPriorityOwner = resolveDesignPageHigherPriorityKeyboardOwner({
    ...keyboardInput,
    floorPlanTraceRoomMode: input.refs.floorPlanTraceRoomMode.current,
    keyboardShortcutsEnabled: input.state.keyboardShortcutsEnabled,
  });
  if (higherPriorityOwner) return;
  const pendingCommand = resolvePendingPlacementKeyboardCommand({
    ...keyboardInput,
    canEdit: input.state.canEdit,
    hasPendingPlacement: input.state.hasPendingCatalogPlacement,
    keyboardShortcutsEnabled: input.state.keyboardShortcutsEnabled,
  });
  if (pendingCommand) {
    consumeKeyboardCommand(event);
    executePendingPlacementCommand(pendingCommand, input.actions.placement);
    return;
  }
  const itemCommand = resolveSelectedItemKeyboardCommand({
    ...keyboardInput,
    canEdit: input.state.canEdit,
    hasSelectedItem: Boolean(input.refs.primaryId.current),
    keyboardShortcutsEnabled: input.state.keyboardShortcutsEnabled,
    rotationSnapEnabled: input.state.rotationSnapEnabled,
    rotationSnapStepDegrees: input.state.rotationSnapStepDegrees,
  });
  if (!itemCommand) return;
  consumeKeyboardCommand(event);
  executeSelectedItemCommand(itemCommand, input.actions.item);
}

function executeSelectedPlanCommand(
  command: SelectedPlanKeyboardCommand,
  actions: DesignPageSelectionKeyboardActions
): void {
  if (command.type === "clear-selection") actions.clearAllSelection();
  else if (command.type === "delete-room") actions.room.delete(command.roomId);
  else if (command.type === "duplicate-room") actions.room.duplicate(command.roomId);
  else actions.room.nudge(command.deltaX, command.deltaZ, { snap: command.snap });
}

function routeSelectedPlanKeyboardEvent(
  event: KeyboardEvent,
  input: UseDesignPageSelectionKeyboardControllerInput
): void {
  if (isDesignPageSelectionShortcutBlocked(event.target)) return;
  const command = resolveSelectedPlanKeyboardCommand({
    ...getKeyboardInput(event),
    canEdit: input.state.canEdit,
    hasSelectedItem: Boolean(input.refs.primaryId.current),
    selectedItemCount: input.refs.selectedIds.current.size,
    selectedPlanOverlayId: input.state.selectedPlanOverlayId,
    selectedPlanRoomId: input.state.selectedPlanRoomId,
    selectedZoneId: input.state.selectedZoneId,
    viewMode: input.state.viewMode,
  });
  if (!command) return;
  event.preventDefault();
  executeSelectedPlanCommand(command, input.actions);
}

export function useDesignPageSelectionKeyboardController({
  state,
  refs,
  actions,
}: UseDesignPageSelectionKeyboardControllerInput): void {
  const setRotationInputValue = actions.setRotationInputValue;
  useEffect(() => {
    if (!state.selectedItemId) {
      setRotationInputValue("0");
      return;
    }
    setRotationInputValue(String(state.selectedRotationDegrees));
  }, [setRotationInputValue, state.selectedItemId, state.selectedRotationDegrees]);

  useEffect(() => {
    if (state.isClientPreview) return;
    const input = { state, refs, actions };
    const handleSelectedItemShortcut = (event: KeyboardEvent) =>
      routeSelectedItemKeyboardEvent(event, input);

    window.addEventListener("keydown", handleSelectedItemShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleSelectedItemShortcut, true);
  }, [actions, refs, state]);

  useEffect(() => {
    if (state.isClientPreview || state.editorMode === "present") return;
    const input = { state, refs, actions };
    const handleSelectedPlanObjectShortcut = (event: KeyboardEvent) =>
      routeSelectedPlanKeyboardEvent(event, input);
    window.addEventListener("keydown", handleSelectedPlanObjectShortcut);
    return () => window.removeEventListener("keydown", handleSelectedPlanObjectShortcut);
  }, [actions, refs, state]);
}
