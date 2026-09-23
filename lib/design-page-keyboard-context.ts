import type { DesignPageKeyboardInput } from "@/lib/design-page-selection-keyboard-commands";

export type DesignPageHigherPriorityKeyboardOwner = "floor-plan-tracing";

type CurrentValueRef<T> = { current: T };

export type DesignPageKeyboardOwnershipSource = {
  floorPlanTraceRoomModeRef: CurrentValueRef<boolean>;
  selectedIdsRef: CurrentValueRef<Set<string>>;
};

export type DesignPageKeyboardOwnership =
  DesignPageKeyboardOwnershipSource & {
    keyboardShortcutsEnabled: boolean;
  };

type FloorPlanTracingKeyboardContextInput = DesignPageKeyboardInput & {
  floorPlanTraceRoomMode: boolean;
  keyboardShortcutsEnabled: boolean;
};

export function createDesignPageKeyboardOwnership(
  floorPlanTraceRoomModeRef: CurrentValueRef<boolean>,
  selectedIdsRef: CurrentValueRef<Set<string>>
): DesignPageKeyboardOwnershipSource {
  return { floorPlanTraceRoomModeRef, selectedIdsRef };
}

export function bindDesignPageKeyboardOwnership(
  source: DesignPageKeyboardOwnershipSource,
  keyboardShortcutsEnabled: boolean
): DesignPageKeyboardOwnership {
  return { ...source, keyboardShortcutsEnabled };
}

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
