"use client";

import { useEffect } from "react";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  isFloorPlanRectangleWallShortcut,
  type DesignPageKeyboardOwnership,
} from "@/lib/design-page-keyboard-context";
import {
  isDesignPageSelectionShortcutBlocked,
  type DesignPageKeyboardInput,
} from "@/lib/design-page-selection-keyboard-commands";
import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export type UseDesignPageFloorPlanTracingKeyboardInput = {
  state: {
    editorMode: DesignPageEditorMode;
    isClientPreview: boolean;
    selectedPlanOverlayId: string | null;
    selectedPlanRoomId: string | null;
    selectedZoneId: string | null;
    viewMode: EditorViewMode;
  };
  capabilities: {
    keyboardOwnership: DesignPageKeyboardOwnership;
  };
  actions: {
    addFloorPlanOpeningFromTool: (kind: RoomOpening2D["kind"]) => void;
    cancelActiveFloorPlanDraw: () => boolean;
    changeDrawRoomMode: (mode: FloorPlanDrawRoomMode) => void;
    clearAllSelection: () => void;
    handleUndoFloorPlanTraceRoomPoint: () => boolean;
    selectFloorPlanTool: () => void;
  };
};

export type DesignPageKeyboardEventTarget = {
  addEventListener: (
    type: "keydown",
    listener: (event: KeyboardEvent) => void
  ) => void;
  removeEventListener: (
    type: "keydown",
    listener: (event: KeyboardEvent) => void
  ) => void;
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

function handleEscapeKey(
  event: KeyboardEvent,
  input: UseDesignPageFloorPlanTracingKeyboardInput
): boolean {
  if (event.key !== "Escape") return false;
  const cancelledDraw = input.actions.cancelActiveFloorPlanDraw();
  const hasSelection = Boolean(
    input.state.selectedPlanRoomId ||
      input.state.selectedPlanOverlayId ||
      input.state.selectedZoneId ||
      input.capabilities.keyboardOwnership.selectedIdsRef.current.size > 0
  );
  if (hasSelection) input.actions.clearAllSelection();
  if (cancelledDraw || hasSelection) {
    event.preventDefault();
    event.stopPropagation();
  }
  return true;
}

function handleTracePointUndo(
  event: KeyboardEvent,
  input: UseDesignPageFloorPlanTracingKeyboardInput
): boolean {
  if (
    event.key !== "Backspace" &&
    event.key !== "Delete"
  ) return false;
  if (!input.actions.handleUndoFloorPlanTraceRoomPoint()) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function acceptShortcut(event: KeyboardEvent, action: () => void): void {
  event.preventDefault();
  action();
}

function handleToolShortcut(
  event: KeyboardEvent,
  input: UseDesignPageFloorPlanTracingKeyboardInput
): void {
  const key = event.key.toLowerCase();
  const keyboardInput = getKeyboardInput(event);
  const { keyboardOwnership } = input.capabilities;
  const { actions } = input;

  if (key === "v" || key === "s") {
    acceptShortcut(event, actions.selectFloorPlanTool);
    return;
  }
  if (isFloorPlanRectangleWallShortcut(keyboardInput)) {
    acceptShortcut(event, () => actions.changeDrawRoomMode("rectangle_wall"));
    return;
  }
  if (key === "d" && !keyboardOwnership.floorPlanTraceRoomModeRef.current) {
    acceptShortcut(event, () => actions.addFloorPlanOpeningFromTool("door"));
    return;
  }
  if (key === "w" && !keyboardOwnership.floorPlanTraceRoomModeRef.current) {
    acceptShortcut(event, () => actions.addFloorPlanOpeningFromTool("window"));
    return;
  }
  if (key === "b") {
    acceptShortcut(event, () => actions.changeDrawRoomMode("straight_wall"));
    return;
  }
  if (key === "f") {
    acceptShortcut(event, () => actions.changeDrawRoomMode("rectangle_wall"));
    return;
  }
  if (key === "h") {
    acceptShortcut(event, () => actions.changeDrawRoomMode("arc_wall"));
  }
}

export function handleFloorPlanTracingKeyDown(
  event: KeyboardEvent,
  input: UseDesignPageFloorPlanTracingKeyboardInput
): void {
  if (
    !input.capabilities.keyboardOwnership.keyboardShortcutsEnabled ||
    isDesignPageSelectionShortcutBlocked(event.target)
  ) return;
  if (handleEscapeKey(event, input)) return;
  if (handleTracePointUndo(event, input)) return;
  handleToolShortcut(event, input);
}

export function bindDesignPageFloorPlanTracingKeyboard(
  target: DesignPageKeyboardEventTarget,
  input: UseDesignPageFloorPlanTracingKeyboardInput
): () => void {
  const handleKeyDown = (event: KeyboardEvent) =>
    handleFloorPlanTracingKeyDown(event, input);
  target.addEventListener("keydown", handleKeyDown);
  return () => target.removeEventListener("keydown", handleKeyDown);
}

export function useDesignPageFloorPlanTracingKeyboard(
  input: UseDesignPageFloorPlanTracingKeyboardInput
): void {
  const { editorMode, isClientPreview, viewMode } = input.state;
  useEffect(() => {
    if (isClientPreview || editorMode === "present" || viewMode !== "2d") return;
    return bindDesignPageFloorPlanTracingKeyboard(window, input);
  }, [editorMode, input, isClientPreview, viewMode]);
}
