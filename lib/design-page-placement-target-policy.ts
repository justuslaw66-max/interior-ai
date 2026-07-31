import type { RendererSurfaceTarget, SurfaceBrushPaint } from "@/lib/useDesignPageSurfaceActions";

export type PlacementAwareRoomSelectionDecision = {
  shouldSetDesignMode: boolean;
  shouldSwitchRoom: boolean;
};

export function resolvePlacementAwareRoomSelectionDecision({
  pendingPlacementHandled,
  editorMode,
  activeRoomId,
  targetRoomId,
}: {
  pendingPlacementHandled: boolean;
  editorMode: string;
  activeRoomId: string;
  targetRoomId: string;
}): PlacementAwareRoomSelectionDecision {
  return {
    // Room selection is part of furnishing too. Preserve that workspace so a
    // route handoff such as `workspace=furnish` is not immediately undone
    // when the imported design selects its first active room.
    shouldSetDesignMode:
      editorMode !== "present" && editorMode !== "adjust",
    shouldSwitchRoom:
      !pendingPlacementHandled && activeRoomId !== targetRoomId,
  };
}

export type DesignPageSurfaceBrushAction =
  | { kind: "floor_material"; materialId: string }
  | { kind: "ceiling_paint"; paint: SurfaceBrushPaint }
  | { kind: "wall_paint"; paint: SurfaceBrushPaint }
  | { kind: "wall_material"; materialId: string }
  | null;

export function resolveDesignPageSurfaceBrushAction({
  target,
  active,
  canApply,
  materialId,
  paint,
}: {
  target: RendererSurfaceTarget;
  active: boolean;
  canApply: boolean;
  materialId: string | null;
  paint: SurfaceBrushPaint | null;
}): DesignPageSurfaceBrushAction {
  if (!active || !canApply) return null;
  if (target.kind === "floor") {
    return materialId ? { kind: "floor_material", materialId } : null;
  }
  if (target.kind === "ceiling") {
    return paint ? { kind: "ceiling_paint", paint } : null;
  }
  if (paint) return { kind: "wall_paint", paint };
  return materialId ? { kind: "wall_material", materialId } : null;
}
