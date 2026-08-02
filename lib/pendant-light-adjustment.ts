import type {
  AdjustablePendantHeightMetadata,
  CatalogItemSchema,
} from "@/lib/catalog-schema";
import type { DesignItem } from "@/lib/room-types";

export type PendantCableAdjustment = AdjustablePendantHeightMetadata & {
  currentCm: number;
};

export type PendantCableDeformation = {
  cableStart: number;
  cableEnd: number;
  cableDelta: number;
  cableScale: number;
};

export function clampPendantHeightCm(
  value: number,
  config: AdjustablePendantHeightMetadata
): number {
  const fallback = config.defaultCm;
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(config.maxCm, Math.max(config.minCm, finite)) * 10) / 10;
}

export function getAdjustablePendantHeight(
  product: Pick<CatalogItemSchema, "metadata"> | null | undefined,
  item?: Pick<DesignItem, "hangingHeightCm"> | null
): PendantCableAdjustment | null {
  const config = product?.metadata?.adjustablePendantHeight;
  if (!config) return null;

  return {
    ...config,
    currentCm: clampPendantHeightCm(item?.hangingHeightCm ?? config.defaultCm, config),
  };
}

export function calculatePendantCableDeformation({
  adjustment,
  naturalHeightMeters,
  axisMin,
  axisLength,
}: {
  adjustment: PendantCableAdjustment;
  naturalHeightMeters: number;
  axisMin: number;
  axisLength: number;
}): PendantCableDeformation | null {
  if (!(naturalHeightMeters > 0) || !(axisLength > 0)) return null;

  const cableStart = axisMin + axisLength * adjustment.cableStartRatio;
  const cableEnd = axisMin + axisLength * adjustment.cableEndRatio;
  const cableLength = cableEnd - cableStart;
  if (!(cableLength > 0)) return null;

  const requestedHeightMeters = adjustment.currentCm / 100;
  const requestedDelta =
    axisLength * ((requestedHeightMeters - naturalHeightMeters) / naturalHeightMeters);
  const cableDelta = Math.max(-cableLength + axisLength * 0.002, requestedDelta);

  return {
    cableStart,
    cableEnd,
    cableDelta,
    cableScale: (cableLength + cableDelta) / cableLength,
  };
}
