import type { DesignSnapshot } from "@/lib/room-types";
import type { FloorPlanPointMmV2, FloorPlanWallPathV2 } from "@/lib/floor-plan-document-v2";
import type { ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";

export type WallGestureMode = "wall" | "start" | "end";
export type CanonicalWallGestureControls = {
  enabled: boolean;
  selectedWallId: string | null;
  select: (floorId: string, wallId: string) => void;
  commit: (operation: ConsumerWallTopologyMutationV2, expectedRevisionId: string) => boolean;
  setDragging: (dragging: boolean) => void;
};

export function buildWallGestureDraft({ floorId, wallId, path, start, end, mode, delta }: {
  floorId: string; wallId: string; path: FloorPlanWallPathV2;
  start: FloorPlanPointMmV2; end: FloorPlanPointMmV2; mode: WallGestureMode; delta: FloorPlanPointMmV2;
}): { start: FloorPlanPointMmV2; end: FloorPlanPointMmV2; operation: ConsumerWallTopologyMutationV2 } | null {
  if (path.kind !== "line") return null;
  const dx = Math.round(delta.xMm), dz = Math.round(delta.zMm);
  if (![dx, dz].every(Number.isSafeInteger) || (!dx && !dz)) return null;
  const move = (point: FloorPlanPointMmV2) => ({ xMm: point.xMm + dx, zMm: point.zMm + dz });
  const nextStart = mode === "end" ? start : move(start);
  const nextEnd = mode === "start" ? end : move(end);
  if (![nextStart.xMm, nextStart.zMm, nextEnd.xMm, nextEnd.zMm].every(Number.isSafeInteger)) return null;
  const operation: ConsumerWallTopologyMutationV2 = mode === "wall"
    ? { kind: "move_wall", floorId, wallId, deltaXMm: dx, deltaZMm: dz }
    : { kind: "move_vertex", floorId, vertexId: mode === "start" ? path.startVertexId : path.endVertexId, to: mode === "start" ? nextStart : nextEnd };
  return { start: nextStart, end: nextEnd, operation };
}

export function commitCurrentWallGesture(snapshot: DesignSnapshot, expectedRevisionId: string, operation: ConsumerWallTopologyMutationV2,
  commit: (operation: ConsumerWallTopologyMutationV2) => boolean, showToast: (message: string) => void): boolean {
  if (snapshot.floorPlan?.canonicalDocument?.revisionId !== expectedRevisionId) {
    showToast("The plan changed while you were dragging. The preview was discarded; try again on the current plan.");
    return false;
  }
  return commit(operation);
}
