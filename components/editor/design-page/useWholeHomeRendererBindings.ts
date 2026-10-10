import { useMemo, type ComponentProps } from "react";

import type HousePlanRenderer3D from "@/components/editor/renderers/HousePlanRenderer3D";
import { useStableWallGestureControls } from "@/components/editor/renderers/canonical-floor-plan/useStablePlanHandlers";
import { useLatestCallback } from "@/components/editor/renderers/useLatestCallback";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "@/lib/design-page-plan-overlays";
import type { EditorScene2D } from "@/lib/editorScene";
import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";

type WholeHomeRendererProps = ComponentProps<typeof HousePlanRenderer3D>;
type Handler<Name extends keyof WholeHomeRendererProps> = NonNullable<WholeHomeRendererProps[Name]>;

/** The parts of the structure layer's state and actions that the 3D house renderer binds to. */
export type WholeHomeBindingState = {
  plan: {
    scene: Pick<EditorScene2D, "openings">;
    wallEditing?: Pick<CanonicalWallGestureControls, "enabled" | "selectedWallId">;
  };
  wholeHome: { rooms: HousePlanRoom2D[] };
};
export type WholeHomeBindingActions = {
  walls?: Pick<CanonicalWallGestureControls, "select" | "commit" | "setDragging">;
  overlays: {
    select: Handler<"onSelectOpening">;
    moveOpening: Handler<"onMoveOpening">;
    resizeOpening: Handler<"onResizeOpening">;
    setDragging: (isDragging: boolean, kind: "opening" | "opening_resize") => void;
  };
  wholeHome: { setOpeningDragging: Handler<"onOpeningDragStateChange"> };
};

export function resolveWallGestureControls(
  state: WholeHomeBindingState["plan"]["wallEditing"],
  actions: WholeHomeBindingActions["walls"]
): CanonicalWallGestureControls | undefined {
  return state && actions ? { ...state, ...actions } : undefined;
}

/**
 * The 3D house renderer's inputs that each page render would otherwise rebuild.
 * New openings rebuild the legacy floor slabs and wall bands (and their GPU
 * buffers), and new handlers make R3F re-apply props; either way R3F draws a
 * frame. With these, a page re-render that changes nothing in the house leaves
 * the scene alone.
 */
export function useWholeHomeRendererBindings(state: WholeHomeBindingState, actions: WholeHomeBindingActions) {
  const sceneOpenings = state.plan.scene.openings;
  const rooms = state.wholeHome.rooms;
  // Focus mode filters what is drawn, not the topology: the builder always gets every room and opening.
  const topologyOpenings = useMemo(() => mapPlanOpeningsToRoomRenderer(sceneOpenings, rooms), [rooms, sceneOpenings]);
  const onSelectOpening = useLatestCallback(actions.overlays.select);
  const onMoveOpening = useLatestCallback(actions.overlays.moveOpening);
  const onResizeOpening = useLatestCallback(actions.overlays.resizeOpening);
  const onOpeningDragStateChange = useLatestCallback<Parameters<Handler<"onOpeningDragStateChange">>, void>(
    (dragging, kind) => {
      if (kind) actions.overlays.setDragging(dragging, kind);
      else actions.wholeHome.setOpeningDragging(dragging);
    }
  );
  const canonicalWallEditing = useStableWallGestureControls(
    resolveWallGestureControls(state.plan.wallEditing, actions.walls)
  );
  return { topologyOpenings, onSelectOpening, onMoveOpening, onResizeOpening, onOpeningDragStateChange, canonicalWallEditing };
}
