import {
  NIPPON_PAINT_COLOUR_COUNT,
  NIPPON_PAINT_FAMILIES,
  NIPPON_PAINT_SOURCE_URL,
  type NipponPaintFamily,
} from "./nippon-paint-catalog";

export type WallPaintFamily = NipponPaintFamily;
export type WallPaintSource = "curated" | "nippon";
export type WallPaintFamilyFilterId = WallPaintFamily | "all";

export type WallPaintSwatch = {
  id: string;
  name: string;
  hex: string;
  family: WallPaintFamily;
  source: WallPaintSource;
  brand?: string;
  code?: string;
  sourcePath?: string;
};

export type WallPaintCatalogColour = {
  id: string;
  name: string;
  code: string;
  hex: string;
  family: WallPaintFamily;
  sourcePath: string;
};

export const CURATED_WALL_PAINT_SWATCHES: WallPaintSwatch[] = [
  { id: "soft-gallery-white", name: "Soft Gallery White", hex: "#F5F1E8", family: "white", source: "curated" },
  { id: "warm-linen", name: "Warm Linen", hex: "#E7DCCB", family: "beige", source: "curated" },
  { id: "oat-milk", name: "Oat Milk", hex: "#D8C7B0", family: "beige", source: "curated" },
  { id: "mist-grey", name: "Mist Grey", hex: "#D6D8D2", family: "grey", source: "curated" },
  { id: "stone-grey", name: "Stone Grey", hex: "#A9A89F", family: "grey", source: "curated" },
  { id: "sage-wash", name: "Sage Wash", hex: "#B8C2B2", family: "green", source: "curated" },
  { id: "olive-clay", name: "Olive Clay", hex: "#8F927A", family: "green", source: "curated" },
  { id: "powder-blue", name: "Powder Blue", hex: "#B8C8D6", family: "blue", source: "curated" },
  { id: "deep-ink", name: "Deep Ink", hex: "#2F3B46", family: "grey", source: "curated" },
  { id: "rose-plaster", name: "Rose Plaster", hex: "#D7B8AF", family: "pink", source: "curated" },
  { id: "terracotta-mist", name: "Terracotta Mist", hex: "#B9826E", family: "brown", source: "curated" },
  { id: "soft-charcoal", name: "Soft Charcoal", hex: "#55575A", family: "grey", source: "curated" },
];

export const NIPPON_WALL_PAINT_SOURCE_URL = NIPPON_PAINT_SOURCE_URL;
export const NIPPON_WALL_PAINT_COLOUR_COUNT = NIPPON_PAINT_COLOUR_COUNT;
export const WALL_PAINT_SWATCHES: WallPaintSwatch[] = CURATED_WALL_PAINT_SWATCHES;

export function createNipponWallPaintSwatches(
  colours: readonly WallPaintCatalogColour[]
): readonly WallPaintSwatch[] {
  return Object.freeze(
    colours.map((colour) =>
      Object.freeze({
        id: colour.id,
        name: colour.name,
        code: colour.code,
        hex: colour.hex,
        family: colour.family,
        source: "nippon" as const,
        brand: "Nippon Paint",
        sourcePath: colour.sourcePath,
      })
    )
  );
}

export const DEFAULT_WALL_PAINT_SWATCH = CURATED_WALL_PAINT_SWATCHES[0];

export const WALL_PAINT_FAMILY_FILTERS: Array<{
  id: WallPaintFamilyFilterId;
  label: string;
  hex: string;
}> = [
  { id: "all", label: "All", hex: "#FFFFFF" },
  { id: "white", label: "White", hex: "#F2EBDD" },
  { id: "beige", label: "Beige", hex: "#D7C5B3" },
  { id: "neutral", label: "Neutral", hex: "#B8AEA2" },
  { id: "red", label: "Red", hex: "#E43236" },
  { id: "pink", label: "Pink", hex: "#F58BAA" },
  { id: "orange", label: "Orange", hex: "#FF8A34" },
  { id: "yellow", label: "Yellow", hex: "#F8DE17" },
  { id: "green", label: "Green", hex: "#86C8A8" },
  { id: "blue-green", label: "Blue Green", hex: "#5DCCC4" },
  { id: "blue", label: "Blue", hex: "#2B7BBB" },
  { id: "purple", label: "Purple", hex: "#8266BA" },
  { id: "brown", label: "Brown", hex: "#BE744C" },
  { id: "grey", label: "Grey", hex: "#9B9B9B" },
  { id: "black", label: "Black", hex: "#050505" },
  { id: "accent", label: "Accent", hex: "#210099" },
];

if (
  WALL_PAINT_FAMILY_FILTERS.length !== NIPPON_PAINT_FAMILIES.length + 1 ||
  NIPPON_PAINT_FAMILIES.some(
    (family, index) => WALL_PAINT_FAMILY_FILTERS[index + 1]?.id !== family
  )
) {
  throw new Error(
    "Wall paint family filters must match Nippon Paint Singapore's official order."
  );
}

export function normalizeWallPaintColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  return match ? `#${match[1].toUpperCase()}` : null;
}

export function normalizeWallPaintName(value: unknown, fallback = "Custom paint"): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

export function getWallPaintSwatchById(
  id: string | null | undefined,
  swatches: readonly WallPaintSwatch[] = WALL_PAINT_SWATCHES
): WallPaintSwatch | null {
  if (!id) return null;
  return swatches.find((swatch) => swatch.id === id) ?? null;
}

export function getWallPaintSwatchByHex(
  hex: string | null | undefined,
  swatches: readonly WallPaintSwatch[] = WALL_PAINT_SWATCHES
): WallPaintSwatch | null {
  const normalized = normalizeWallPaintColorHex(hex);
  if (!normalized) return null;
  return swatches.find((swatch) => swatch.hex.toUpperCase() === normalized) ?? null;
}

export function getWallPaintSwatchLabel(swatch: WallPaintSwatch): string {
  return swatch.code ? `${swatch.name} (${swatch.code})` : swatch.name;
}

export function getWallPaintSwatchSearchText(swatch: WallPaintSwatch): string {
  return [
    swatch.name,
    swatch.code,
    swatch.hex,
    swatch.family,
    swatch.brand,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function getWallPaintDisplayName(
  hex: string | null | undefined,
  name?: string | null,
  swatches: readonly WallPaintSwatch[] = WALL_PAINT_SWATCHES
): string {
  const normalized = normalizeWallPaintColorHex(hex);
  if (!normalized) return "No wall paint";
  const swatch = getWallPaintSwatchByHex(normalized, swatches);
  return name?.trim() || (swatch ? getWallPaintSwatchLabel(swatch) : "Custom paint");
}
