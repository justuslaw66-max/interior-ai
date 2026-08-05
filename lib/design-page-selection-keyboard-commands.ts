import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

export type DesignPageKeyboardInput = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
};

export type PendingPlacementKeyboardCommand =
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "rotate"; direction: "left" | "right" }
  | { type: "nudge"; deltaX: number; deltaZ: number };

export type SelectedItemKeyboardCommand =
  | { type: "duplicate" }
  | { type: "rotate"; degrees: number; snap: boolean }
  | { type: "reset-rotation" }
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

type NudgeCommand = { type: "nudge"; deltaX: number; deltaZ: number };

const NUDGE_DIRECTION_BY_KEY = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
} as const;

function resolveNudgeCommand(key: string, step: number): NudgeCommand | null {
  const direction = NUDGE_DIRECTION_BY_KEY[
    key as keyof typeof NUDGE_DIRECTION_BY_KEY
  ];
  if (!direction) return null;
  return {
    type: "nudge",
    deltaX: direction[0] * step,
    deltaZ: direction[1] * step,
  };
}

function hasRotationModifier(input: DesignPageKeyboardInput): boolean {
  return Boolean(input.metaKey || input.ctrlKey || input.altKey);
}

export type ResolvePendingPlacementKeyboardCommandInput =
  DesignPageKeyboardInput & {
    canEdit: boolean;
    hasPendingPlacement: boolean;
    keyboardShortcutsEnabled?: boolean;
  };

export function resolvePendingPlacementKeyboardCommand(
  input: ResolvePendingPlacementKeyboardCommandInput
): PendingPlacementKeyboardCommand | null {
  if (!input.hasPendingPlacement) return null;
  if (input.key === "Escape") return { type: "cancel" };
  if (!input.canEdit || input.keyboardShortcutsEnabled === false) return null;
  if (input.key === "Enter") return { type: "confirm" };
  if (input.key.toLowerCase() === "r" && !hasRotationModifier(input)) {
    return { type: "rotate", direction: input.shiftKey ? "left" : "right" };
  }
  return resolveNudgeCommand(input.key, input.shiftKey ? 0.25 : 0.1);
}

export type ResolveSelectedItemKeyboardCommandInput = DesignPageKeyboardInput & {
  canEdit: boolean;
  hasSelectedItem: boolean;
  keyboardShortcutsEnabled: boolean;
  rotationSnapEnabled: boolean;
  rotationSnapStepDegrees: number;
};

function resolveSelectedItemRotationCommand(
  input: ResolveSelectedItemKeyboardCommandInput
): SelectedItemKeyboardCommand | null {
  if (hasRotationModifier(input)) return null;
  const key = input.key.toLowerCase();
  const step = input.rotationSnapEnabled ? input.rotationSnapStepDegrees : 1;
  if (key === "r") {
    return { type: "rotate", degrees: input.shiftKey ? -90 : 90, snap: true };
  }
  if (key === "q") {
    return { type: "rotate", degrees: -step, snap: input.rotationSnapEnabled };
  }
  if (key === "e") {
    return { type: "rotate", degrees: step, snap: input.rotationSnapEnabled };
  }
  return input.key === "0" ? { type: "reset-rotation" } : null;
}

export function resolveSelectedItemKeyboardCommand(
  input: ResolveSelectedItemKeyboardCommandInput
): SelectedItemKeyboardCommand | null {
  if (!input.hasSelectedItem || !input.canEdit || !input.keyboardShortcutsEnabled) {
    return null;
  }
  if ((input.metaKey || input.ctrlKey) && input.key.toLowerCase() === "d") {
    return { type: "duplicate" };
  }
  return (
    resolveSelectedItemRotationCommand(input) ??
    resolveNudgeCommand(input.key, input.shiftKey ? 0.25 : 0.05)
  );
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

function hasPlanSelection(input: ResolveSelectedPlanKeyboardCommandInput): boolean {
  return Boolean(
    input.selectedPlanRoomId ||
      input.selectedPlanOverlayId ||
      input.selectedItemCount > 0 ||
      input.selectedZoneId
  );
}

function resolveSelectedRoomEditCommand(
  input: ResolveSelectedPlanKeyboardCommandInput
): SelectedPlanKeyboardCommand | null {
  if (!input.canEdit || !input.selectedPlanRoomId) return null;
  if (input.key === "Backspace" || input.key === "Delete") {
    return { type: "delete-room", roomId: input.selectedPlanRoomId };
  }
  if ((input.metaKey || input.ctrlKey) && input.key.toLowerCase() === "d") {
    return { type: "duplicate-room", roomId: input.selectedPlanRoomId };
  }
  return null;
}

export function resolveSelectedPlanKeyboardCommand(
  input: ResolveSelectedPlanKeyboardCommandInput
): SelectedPlanKeyboardCommand | null {
  if (input.key === "Escape") {
    return hasPlanSelection(input) ? { type: "clear-selection" } : null;
  }
  if (
    !input.selectedPlanRoomId ||
    input.selectedPlanOverlayId ||
    input.hasSelectedItem
  ) {
    return null;
  }
  const editCommand = resolveSelectedRoomEditCommand(input);
  if (editCommand || input.viewMode !== "2d") return editCommand;
  const nudge = resolveNudgeCommand(input.key, input.shiftKey ? 0.25 : 0.05);
  return nudge ? { ...nudge, type: "nudge-room", snap: !input.shiftKey } : null;
}

const CAPTURED_KEYBOARD_CONTEXT_SELECTOR =
  '[aria-modal="true"], [data-testid="editor-command-palette"]';

export function isDesignPageSelectionShortcutBlocked(
  target: EventTarget | null
): boolean {
  const element = target as HTMLElement | null;
  const tagName = element?.tagName;
  const isEditable =
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    element?.isContentEditable;
  if (isEditable) return true;
  if (element?.closest?.(CAPTURED_KEYBOARD_CONTEXT_SELECTOR)) return true;
  return (
    typeof document !== "undefined" &&
    Boolean(document.querySelector(CAPTURED_KEYBOARD_CONTEXT_SELECTOR))
  );
}
