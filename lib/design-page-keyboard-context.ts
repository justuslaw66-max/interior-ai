import type { DesignPageKeyboardInput } from "@/lib/design-page-selection-keyboard-commands";

export type DesignPageHigherPriorityKeyboardOwner = "floor-plan-tracing";

type FloorPlanTracingKeyboardContextInput = DesignPageKeyboardInput & {
  floorPlanTraceRoomMode: boolean;
  keyboardShortcutsEnabled: boolean;
};

export function isFloorPlanRectangleWallShortcut(
  input: DesignPageKeyboardInput
): boolean {
  return (
    input.key.toLowerCase() === "r" &&
    !input.shiftKey &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.altKey
  );
}

export function resolveDesignPageHigherPriorityKeyboardOwner(
  input: FloorPlanTracingKeyboardContextInput
): DesignPageHigherPriorityKeyboardOwner | null {
  if (!input.keyboardShortcutsEnabled || !input.floorPlanTraceRoomMode) {
    return null;
  }
  return isFloorPlanRectangleWallShortcut(input)
    ? "floor-plan-tracing"
    : null;
}
