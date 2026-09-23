import type { Plan2DCameraDiagnostics } from "@/components/editor/camera/Plan2DCameraInvariantGuard";
import type { DesignPagePlanDebugMetrics } from "@/lib/useDesignPageQaReadModel";

export type DesignPagePlanMetricUpdate = Pick<
  DesignPagePlanDebugMetrics,
  "zoom" | "visibleLabelCount"
>;

export function mergeDesignPagePlanMetrics(
  current: DesignPagePlanDebugMetrics,
  next: DesignPagePlanMetricUpdate
): DesignPagePlanDebugMetrics {
  return current.zoom === next.zoom &&
    current.visibleLabelCount === next.visibleLabelCount
    ? current
    : { ...current, ...next };
}

export function mergeDesignPageCameraDiagnostics(
  current: DesignPagePlanDebugMetrics,
  next: Plan2DCameraDiagnostics
): DesignPagePlanDebugMetrics {
  if (
    current.projectedRoomMinWidthPx === next.projectedRoomMinWidthPx &&
    current.projectedRoomMinHeightPx === next.projectedRoomMinHeightPx &&
    current.projectedRoomMinAreaPx === next.projectedRoomMinAreaPx &&
    current.cameraValid === next.valid &&
    current.cameraRecoveries === next.recoveries &&
    current.cameraTargetX === next.targetX &&
    current.cameraTargetZ === next.targetZ
  ) {
    return current;
  }

  return {
    ...current,
    projectedRoomMinWidthPx: next.projectedRoomMinWidthPx,
    projectedRoomMinHeightPx: next.projectedRoomMinHeightPx,
    projectedRoomMinAreaPx: next.projectedRoomMinAreaPx,
    cameraValid: next.valid,
    cameraRecoveries: next.recoveries,
    cameraTargetX: next.targetX,
    cameraTargetZ: next.targetZ,
  };
}
