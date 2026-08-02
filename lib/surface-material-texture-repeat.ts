export type SurfaceTextureRepeat = {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
};

function normalizeDimensionMeters(valueMeters: number | undefined): number {
  return Math.max(0.1, Number.isFinite(valueMeters) ? Number(valueMeters) : 1);
}

function normalizeRepeatSizeCm(valueCm: number | null | undefined): number {
  return Math.max(1, Number.isFinite(valueCm) ? Number(valueCm) : 100);
}

function normalizeFloorScale(floorScale: number | undefined): number {
  return Math.max(0.1, Number.isFinite(floorScale) ? Number(floorScale) : 1);
}

export function resolveSurfaceTextureRepeat({
  roomWidthMeters,
  roomDepthMeters,
  floorScale,
  repeatSizeCm,
  useSingleSwatch,
}: {
  roomWidthMeters: number | undefined;
  roomDepthMeters: number | undefined;
  floorScale: number | undefined;
  repeatSizeCm?: {
    width?: number | null;
    height?: number | null;
  } | null;
  useSingleSwatch: boolean;
}): SurfaceTextureRepeat {
  const scale = normalizeFloorScale(floorScale);

  if (useSingleSwatch) {
    return {
      repeatX: 1 / (normalizeDimensionMeters(roomWidthMeters) * scale),
      repeatY: 1 / (normalizeDimensionMeters(roomDepthMeters) * scale),
      offsetX: 0.5,
      offsetY: 0.5,
    };
  }

  return {
    repeatX: 100 / (normalizeRepeatSizeCm(repeatSizeCm?.width) * scale),
    repeatY: 100 / (normalizeRepeatSizeCm(repeatSizeCm?.height) * scale),
    offsetX: 0,
    offsetY: 0,
  };
}
