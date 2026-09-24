import type { CanonicalWallGestureControls } from "@/lib/floor-plan-wall-gesture";
import type { CanonicalOpeningDragMode } from "@/lib/floor-plan-opening-gesture";
import type { CanonicalOpeningEditHandler } from "./openingDrag";

/** Private proposed edits use the same confirmation and transaction boundary as wall edits. */
export function openingGestureBindings(controls: CanonicalWallGestureControls | undefined, floorId: string, pathKind: "line" | "arc",
  legacyEdit: CanonicalOpeningEditHandler | undefined, legacyDragging: ((dragging: boolean, mode: CanonicalOpeningDragMode) => void) | undefined) {
  if (pathKind !== "line") return {};
  if (!controls?.enabled) return { onEdit: legacyEdit, onDragStateChange: legacyDragging };
  const onEdit: CanonicalOpeningEditHandler = (openingId, metrics, mode) => {
    controls.commit({ kind: "update_opening", floorId, openingId,
      changes: { offsetMm: metrics.offsetMm, ...(mode === "resize" ? { widthMm: metrics.widthMm } : {}) } }, metrics.expectedRevisionId);
  };
  return { onEdit, onDragStateChange: controls.setDragging };
}
