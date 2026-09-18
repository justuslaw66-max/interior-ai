import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";
import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";

export type DesignPageOpeningMetricsPatch = {
  widthMeters?: number;
  offsetMeters?: number;
  heightMeters?: number;
  bottomMeters?: number;
  kind?: RoomOpening2D["kind"];
  /** Explicit evidence chosen for a canonical height edit. */
  heightEvidence?: FloorPlanConsumerMeasurementEvidenceV2;
  /** Explicit evidence chosen for a canonical sill-height edit. */
  bottomEvidence?: FloorPlanConsumerMeasurementEvidenceV2;
  /** Short method/note required when recording a site measurement. */
  measurementNote?: string;
};

export type NormalizeDesignPageOpeningMetricsInput = {
  currentOpening: RoomOpening2D | undefined;
  metrics: DesignPageOpeningMetricsPatch;
  roomHeight: number;
};

export function normalizeDesignPageOpeningMetrics({
  currentOpening,
  metrics,
  roomHeight,
}: NormalizeDesignPageOpeningMetricsInput): DesignPageOpeningMetricsPatch {
  const nextKind = metrics.kind ?? currentOpening?.kind ?? "window";
  const currentVerticalMetrics = resolvePlanOpeningVerticalMetrics({ ...currentOpening, kind: nextKind });
  const currentBottomMeters =
    nextKind === "door" ? 0 : currentVerticalMetrics.bottomMeters;
  const bottomMeters =
    nextKind === "door"
      ? 0
      : Math.min(
          Math.max(0, metrics.bottomMeters ?? currentBottomMeters),
          Math.max(0, roomHeight - 0.4)
        );
  const currentHeightMeters = currentVerticalMetrics.heightMeters;
  const heightMeters = Math.min(
    Math.max(0.4, metrics.heightMeters ?? currentHeightMeters),
    Math.max(0.4, roomHeight - bottomMeters)
  );

  const hasVerticalEdit =
    metrics.heightMeters !== undefined ||
    metrics.bottomMeters !== undefined ||
    metrics.kind !== undefined;

  return {
    ...metrics,
    ...(hasVerticalEdit ? { heightMeters, bottomMeters } : {}),
  };
}

export function getDesignPageOpeningMetricsHistoryLabel(
  metrics: DesignPageOpeningMetricsPatch
): "Resize opening" | "Edit opening" {
  const hasDimensionEdit =
    metrics.widthMeters !== undefined ||
    metrics.heightMeters !== undefined ||
    metrics.bottomMeters !== undefined;

  return hasDimensionEdit && metrics.kind === undefined
    ? "Resize opening"
    : "Edit opening";
}
