import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import type { CanonicalOpeningDragMode } from "@/lib/floor-plan-opening-gesture";
import type { CanonicalOpeningEditHandler } from "./openingDrag";

// One edit handler per controls object and floor, so memoized opening symbols keep their props.
const editHandlers = new WeakMap<CanonicalWallGestureControls, Map<string, CanonicalOpeningEditHandler>>();

function proposedEditHandler(controls: CanonicalWallGestureControls, floorId: string) {
  let byFloor = editHandlers.get(controls);
  if (!byFloor) editHandlers.set(controls, (byFloor = new Map()));
  let onEdit = byFloor.get(floorId);
  if (!onEdit) {
    onEdit = (openingId, metrics, mode) => {
      controls.commit({ kind: "update_opening", floorId, openingId,
        changes: { offsetMm: metrics.offsetMm, ...(mode === "resize" ? { widthMm: metrics.widthMm } : {}) } }, metrics.expectedRevisionId);
    };
    byFloor.set(floorId, onEdit);
  }
  return onEdit;
}

/** Private proposed edits use the same confirmation and transaction boundary as wall edits. */
export function openingGestureBindings(controls: CanonicalWallGestureControls | undefined, floorId: string, pathKind: "line" | "arc",
  legacyEdit: CanonicalOpeningEditHandler | undefined, legacyDragging: ((dragging: boolean, mode: CanonicalOpeningDragMode) => void) | undefined) {
  if (pathKind !== "line") return {};
  if (!controls?.enabled) return { onEdit: legacyEdit, onDragStateChange: legacyDragging };
  return { onEdit: proposedEditHandler(controls, floorId), onDragStateChange: controls.setDragging };
}
