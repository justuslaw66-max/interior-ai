import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";
import type { RoomOpening2D } from "@/lib/editorScene";

export function resolveOpeningInspectorVerticalState(
  opening: RoomOpening2D,
  maxHeightMeters: number
) {
  const metrics = resolvePlanOpeningVerticalMetrics(
    {
      kind: opening.kind,
      heightMeters: opening.heightMm === undefined ? undefined : opening.heightMm / 1000,
      bottomMeters: opening.bottomMm === undefined ? undefined : opening.bottomMm / 1000,
    },
    maxHeightMeters
  );
  return {
    heightMm: Number.isFinite(opening.heightMm) && (opening.heightMm ?? 0) > 0
      ? opening.heightMm!
      : Math.round(metrics.heightMeters * 1000),
    bottomMm: Number.isFinite(opening.bottomMm) && (opening.bottomMm ?? -1) >= 0
      ? opening.bottomMm!
      : Math.round(metrics.bottomMeters * 1000),
    effectiveHeightMm: Math.round(metrics.heightMeters * 1000),
    effectiveBottomMm: Math.round(metrics.bottomMeters * 1000),
    heightStatus: metrics.heightStatus,
    bottomStatus: metrics.bottomStatus,
    issues: metrics.issues,
  };
}

export type OpeningInspectorVerticalState = ReturnType<
  typeof resolveOpeningInspectorVerticalState
>;
