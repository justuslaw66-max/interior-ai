import type { CatalogItemSchema } from "@/lib/catalog-schema";

export function getItemPrice(item: CatalogItemSchema | undefined | null): number {
  if (!item) return 0;
  if (item.commerce.type === "affiliate") {
    return item.commerce.data.priceHint ?? 0;
  }
  return 0;
}

export function getDimensions(item: CatalogItemSchema) {
  return {
    w: item.dimsMm.w / 1000,
    d: item.dimsMm.d / 1000,
    h: item.dimsMm.h / 1000,
  };
}

export function parseVariantLabel(label: string): { colourLabel: string; materialLabel: string | null } {
  const materialLabel = label.match(/\(([^)]+)\)/)?.[1]?.trim() || null;
  const colourLabel = label.replace(/\s*\([^)]*\)\s*/g, "").trim() || label;
  return { colourLabel, materialLabel };
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatTimeAgo(ts: number) {
  const delta = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const ROTATION_SNAP_STEP_DEGREES = 15;
export const ROTATION_SNAP_STEP_RADIANS =
  (ROTATION_SNAP_STEP_DEGREES * Math.PI) / 180;

export function snapRotationRadians(
  angle: number,
  stepRadians: number = ROTATION_SNAP_STEP_RADIANS
) {
  if (!(stepRadians > 0)) return angle;
  return Math.round(angle / stepRadians) * stepRadians;
}

export function normalizeRotationDegrees(angle: number) {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.round(normalized);
}

export function getRotatedFootprint(
  itemWidth: number,
  itemDepth: number,
  rotationY: number
): [number, number] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const effW = Math.abs(cos) * itemWidth + Math.abs(sin) * itemDepth;
  const effD = Math.abs(sin) * itemWidth + Math.abs(cos) * itemDepth;
  return [effW, effD];
}
