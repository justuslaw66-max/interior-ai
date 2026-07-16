import type { CSSProperties } from "react";
import type { RoomFloorPattern } from "@/lib/room-types";
import {
  getSurfaceMaterialTextureSource,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";
import {
  DEFAULT_FLOOR_PATTERN,
  FLOOR_PATTERN_OPTIONS,
  GARDENIA_DEFAULT_TILE_PATTERN_OPTIONS,
  getFloorPatternOptionsForIds,
  normalizeFloorPattern,
  type FloorPatternOption,
} from "@/lib/surface-settings";

export type FlooringInspectorMaterialGroup = {
  primary: SurfaceMaterialRenderInfo;
  variants: SurfaceMaterialRenderInfo[];
};

export type SurfacePatternPreviewTile = {
  x: number;
  y: number;
  width: number;
  height: number;
  shade?: boolean;
};

export function formatFlooringInspectorValue(value?: string | null): string {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getFlooringInspectorSurfaceSwatchStyle(
  material: SurfaceMaterialRenderInfo
): CSSProperties {
  const textureSource = getSurfaceMaterialTextureSource(material);
  if (textureSource) {
    return {
      backgroundColor: "#e8e2d6",
      backgroundImage: `url("${textureSource.url}")`,
      backgroundPosition: "center",
      backgroundSize: textureSource.kind === "swatch" ? "cover" : "48px 48px",
    };
  }

  const colorFamily = material.classification?.color_family;
  const designEffect = material.classification?.design_effect;
  const base =
    colorFamily === "grey"
      ? "#cfd3d4"
      : colorFamily === "charcoal"
        ? "#5f6365"
        : colorFamily === "brown" || colorFamily === "walnut"
          ? "#8c6848"
          : colorFamily === "cream" || colorFamily === "beige"
            ? "#dfd2bd"
            : "#d8c29a";
  const line = designEffect === "stone" || designEffect === "marble" ? "#9ea1a3" : "#a9855e";

  return {
    backgroundColor: base,
    backgroundImage:
      designEffect === "stone" || designEffect === "marble" || designEffect === "concrete"
        ? `linear-gradient(135deg, ${base}, #f4f0e8), radial-gradient(circle at 28% 35%, ${line}77 0 1px, transparent 2px)`
        : `repeating-linear-gradient(0deg, transparent 0 8px, ${line}66 8px 9px), linear-gradient(135deg, ${base}, #f0e3c8)`,
  };
}

function getFlooringInspectorDisplayName(material: SurfaceMaterialRenderInfo) {
  const productName = material.surface_material.product_name.trim();
  const prefixes = [
    material.surface_material.brand,
    "Gardenia Orchidea",
    "Gardenia",
  ].filter(Boolean) as string[];

  for (const prefix of prefixes) {
    const trimmedPrefix = prefix.trim();
    if (productName.toLowerCase().startsWith(`${trimmedPrefix} `.toLowerCase())) {
      return productName.slice(trimmedPrefix.length).trim();
    }
  }

  return productName;
}

export function getFlooringInspectorProductName(material: SurfaceMaterialRenderInfo) {
  const displayName = getFlooringInspectorDisplayName(material);
  const withoutSize = displayName
    .replace(
      /\s+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*$/i,
      ""
    )
    .trim();
  return withoutSize || displayName;
}

export function getFlooringInspectorSizeLabel(material: SurfaceMaterialRenderInfo) {
  const displayName = getFlooringInspectorDisplayName(material);
  const match = displayName.match(
    /(\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*)$/i
  );
  if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();

  const specs = material.physical_specs;
  if (specs?.tile_width_mm && specs.tile_length_mm) {
    return `${Math.round(specs.tile_width_mm / 10)}x${Math.round(specs.tile_length_mm / 10)}`;
  }
  if (specs?.plank_width_mm && specs.plank_length_mm) {
    return `${Math.round(specs.plank_width_mm)}x${Math.round(specs.plank_length_mm)} mm`;
  }
  return "Size TBC";
}

function getFlooringInspectorGroupKey(material: SurfaceMaterialRenderInfo) {
  return [
    material.surface_material.supplier,
    material.surface_material.brand,
    material.surface_material.collection,
    material.surface_material.surface_category,
    material.surface_material.material_family,
    material.classification?.design_effect,
    material.classification?.color_family,
    getFlooringInspectorProductName(material),
  ]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
}

function getFlooringInspectorVariantAreaMm(material: SurfaceMaterialRenderInfo) {
  const specs = material.physical_specs;
  const width = specs?.tile_width_mm ?? specs?.plank_width_mm ?? 0;
  const length = specs?.tile_length_mm ?? specs?.plank_length_mm ?? 0;
  return width * length;
}

function compareFlooringInspectorVariants(
  a: SurfaceMaterialRenderInfo,
  b: SurfaceMaterialRenderInfo
) {
  const areaDelta = getFlooringInspectorVariantAreaMm(b) - getFlooringInspectorVariantAreaMm(a);
  if (areaDelta !== 0) return areaDelta;
  return getFlooringInspectorSizeLabel(a).localeCompare(getFlooringInspectorSizeLabel(b));
}

export function getFlooringInspectorMaterialGroup(
  materials: SurfaceMaterialRenderInfo[],
  material: SurfaceMaterialRenderInfo | null
): FlooringInspectorMaterialGroup | null {
  if (!material) return null;
  const groupKey = getFlooringInspectorGroupKey(material);
  const variants = materials
    .filter((entry) => getFlooringInspectorGroupKey(entry) === groupKey)
    .sort(compareFlooringInspectorVariants);
  if (variants.length === 0) return null;
  return { primary: material, variants };
}

function isGardeniaTileSurfaceMaterial(material: SurfaceMaterialRenderInfo | null) {
  if (!material) return false;
  const supplier = material.surface_material.supplier.toLowerCase();
  const brand = material.surface_material.brand?.toLowerCase() ?? "";
  return (
    material.surface_material.material_family === "tile" &&
    (supplier === "gardenia_orchidea" || brand.includes("gardenia"))
  );
}

export function getFlooringInspectorPatternOptions(
  material: SurfaceMaterialRenderInfo | null
): FloorPatternOption[] {
  const materialOptions = getFloorPatternOptionsForIds(
    material?.rendering.available_pattern_layouts
  );
  if (materialOptions.length > 0) return materialOptions;

  return isGardeniaTileSurfaceMaterial(material)
    ? GARDENIA_DEFAULT_TILE_PATTERN_OPTIONS
    : FLOOR_PATTERN_OPTIONS;
}

export function getDefaultFloorPatternForMaterial(
  material: SurfaceMaterialRenderInfo | null
): RoomFloorPattern {
  return getFlooringInspectorPatternOptions(material)[0]?.id ?? DEFAULT_FLOOR_PATTERN;
}

export function getCompatibleFloorPatternForMaterial(
  material: SurfaceMaterialRenderInfo | null,
  pattern: RoomFloorPattern | null | undefined
): RoomFloorPattern {
  const normalizedPattern = normalizeFloorPattern(pattern);
  const options = getFlooringInspectorPatternOptions(material);
  return options.some((option) => option.id === normalizedPattern)
    ? normalizedPattern
    : options[0]?.id ?? DEFAULT_FLOOR_PATTERN;
}

export function getSurfacePatternPreviewTiles(
  pattern: RoomFloorPattern
): SurfacePatternPreviewTile[] {
  if (pattern === "random_stagger") {
    return [
      { x: 4, y: 5, width: 19, height: 11 },
      { x: 23, y: 5, width: 19, height: 11, shade: true },
      { x: 42, y: 5, width: 14, height: 11 },
      { x: -14, y: 16, width: 19, height: 11, shade: true },
      { x: 5, y: 16, width: 19, height: 11 },
      { x: 24, y: 16, width: 19, height: 11, shade: true },
      { x: 43, y: 16, width: 19, height: 11 },
      { x: -2, y: 27, width: 19, height: 11 },
      { x: 17, y: 27, width: 19, height: 11, shade: true },
      { x: 36, y: 27, width: 19, height: 11 },
    ];
  }

  if (pattern === "brick") {
    return [
      { x: 4, y: 5, width: 19, height: 11 },
      { x: 23, y: 5, width: 19, height: 11, shade: true },
      { x: 42, y: 5, width: 14, height: 11 },
      { x: -6, y: 16, width: 19, height: 11, shade: true },
      { x: 13, y: 16, width: 19, height: 11 },
      { x: 32, y: 16, width: 19, height: 11, shade: true },
      { x: 51, y: 16, width: 12, height: 11 },
      { x: 4, y: 27, width: 19, height: 11 },
      { x: 23, y: 27, width: 19, height: 11, shade: true },
      { x: 42, y: 27, width: 14, height: 11 },
    ];
  }

  if (pattern === "vertical_brick") {
    return [
      { x: 5, y: 4, width: 11, height: 19 },
      { x: 5, y: 23, width: 11, height: 15, shade: true },
      { x: 16, y: -6, width: 11, height: 19, shade: true },
      { x: 16, y: 13, width: 11, height: 19 },
      { x: 16, y: 32, width: 11, height: 12, shade: true },
      { x: 27, y: 4, width: 11, height: 19 },
      { x: 27, y: 23, width: 11, height: 15, shade: true },
      { x: 38, y: -6, width: 11, height: 19, shade: true },
      { x: 38, y: 13, width: 11, height: 19 },
      { x: 38, y: 32, width: 11, height: 12, shade: true },
    ];
  }

  if (pattern === "herringbone") {
    return [
      { x: 6, y: 3, width: 9, height: 25 },
      { x: 15, y: 19, width: 25, height: 9, shade: true },
      { x: 31, y: 3, width: 9, height: 25 },
      { x: 40, y: 19, width: 18, height: 9, shade: true },
      { x: -2, y: 28, width: 25, height: 9, shade: true },
      { x: 23, y: 28, width: 9, height: 25 },
      { x: 32, y: 44, width: 25, height: 9, shade: true },
    ];
  }

  const tiles: SurfacePatternPreviewTile[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      tiles.push({
        x: 5 + column * 13,
        y: 4 + row * 11,
        width: 13,
        height: 11,
        shade: pattern === "checker" && (row + column) % 2 === 1,
      });
    }
  }
  return tiles;
}
