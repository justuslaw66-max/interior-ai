import { useMemo } from "react";

import type { CanonicalOpeningDragMode } from "@/lib/floor-plan-opening-gesture";
import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import { useLatestCallback } from "../useLatestCallback";
import type { CanonicalOpeningEditHandler } from "./openingDrag";

export type CanonicalPlan2DHandlers = {
  onSelectRoom?: (roomId: string) => void;
  onSelectWall?: (wallId: string, roomId: string | null) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onEditOpening?: CanonicalOpeningEditHandler;
  onOpeningDragStateChange?: (dragging: boolean, mode: CanonicalOpeningDragMode) => void;
};

/** The 2D plan's handlers with stable identities (see `useLatestCallback`). */
export function useStableCanonicalPlan2DHandlers(handlers: CanonicalPlan2DHandlers): CanonicalPlan2DHandlers {
  const onSelectRoom = useLatestCallback(handlers.onSelectRoom);
  const onSelectWall = useLatestCallback(handlers.onSelectWall);
  const onSelectOpening = useLatestCallback(handlers.onSelectOpening);
  const onEditOpening = useLatestCallback(handlers.onEditOpening);
  const onOpeningDragStateChange = useLatestCallback(handlers.onOpeningDragStateChange);
  return { onSelectRoom, onSelectWall, onSelectOpening, onEditOpening, onOpeningDragStateChange };
}

/**
 * The wall gesture controls as one object that changes only with the editing
 * state (on or off, the selected wall), not with every page render.
 */
export function useStableWallGestureControls(
  controls: CanonicalWallGestureControls | undefined
): CanonicalWallGestureControls | undefined {
  const select = useLatestCallback(controls?.select);
  const commit = useLatestCallback(controls?.commit);
  const setDragging = useLatestCallback(controls?.setDragging);
  const enabled = controls?.enabled;
  const selectedWallId = controls?.selectedWallId ?? null;
  return useMemo(
    () => (enabled !== undefined && select && commit && setDragging
      ? { enabled, selectedWallId, select, commit, setDragging }
      : undefined),
    [commit, enabled, select, selectedWallId, setDragging]
  );
}
