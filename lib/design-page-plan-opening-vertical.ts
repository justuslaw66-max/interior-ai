import type { RoomOpening2D } from "@/lib/editorScene";
import {
  openingMetersToMillimetres,
  resolveEffectiveOpeningDimensions,
  type OpeningDimensionDefaults,
  type OpeningDimensionResolutionStatus,
} from "@/lib/design-page-opening-dimensions";

export type PlanOpeningVerticalMetrics = {
  heightMeters: number;
  bottomMeters: number;
  topMeters: number;
  hasExplicitHeight: boolean;
  hasExplicitBottom: boolean;
  heightStatus: OpeningDimensionResolutionStatus;
  bottomStatus: OpeningDimensionResolutionStatus;
  rawHeightMeters?: number | null;
  rawBottomMeters?: number | null;
  issues: string[];
};

function millimetres(value: number | null | undefined) {
  return typeof value === "number" ? openingMetersToMillimetres(value) : value;
}

function meters(value: number | null | undefined) {
  return typeof value === "number" ? value / 1000 : value;
}

function optionalMillimetres(value: number | undefined): number | undefined {
  return value === undefined ? undefined : openingMetersToMillimetres(value);
}

function contextualDefaults(defaults?: {
  doorHeightMeters?: number;
  windowHeightMeters?: number;
  windowSillMeters?: number;
}): OpeningDimensionDefaults | undefined {
  if (!defaults) return undefined;
  return {
    doorHeightMm: optionalMillimetres(defaults.doorHeightMeters),
    windowHeightMm: optionalMillimetres(defaults.windowHeightMeters),
    windowSillMm: optionalMillimetres(defaults.windowSillMeters),
  };
}

export function resolvePlanOpeningVerticalMetrics(
  opening: {
    kind: RoomOpening2D["kind"];
    heightMeters?: number | null;
    bottomMeters?: number | null;
  },
  wallHeightMeters: number,
  defaults?: Parameters<typeof contextualDefaults>[0]
): PlanOpeningVerticalMetrics {
  const dimensions = resolveEffectiveOpeningDimensions(
    {
      kind: opening.kind,
      ...(Object.hasOwn(opening, "heightMeters") ? { heightMm: millimetres(opening.heightMeters) } : {}),
      ...(Object.hasOwn(opening, "bottomMeters") ? { bottomMm: millimetres(opening.bottomMeters) } : {}),
    },
    openingMetersToMillimetres(wallHeightMeters),
    contextualDefaults(defaults)
  );
  return {
    heightMeters: dimensions.heightMm / 1000,
    bottomMeters: dimensions.bottomMm / 1000,
    topMeters: dimensions.topMm / 1000,
    hasExplicitHeight: dimensions.heightInputState === "positive",
    hasExplicitBottom: dimensions.bottomInputState === "zero" || dimensions.bottomInputState === "positive",
    heightStatus: dimensions.height.status,
    bottomStatus: dimensions.bottom.status,
    rawHeightMeters: meters(dimensions.height.rawValueMm),
    rawBottomMeters: meters(dimensions.bottom.rawValueMm),
    issues: dimensions.issues,
  };
}
