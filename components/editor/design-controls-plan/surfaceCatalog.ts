import type { CSSProperties } from "react";

import type { FloorMaterial } from "@/lib/floor-materials";
import type {
  RoomFloorPattern,
  RoomSurfaceAssignments,
  RoomType,
} from "@/lib/room-types";
import { isLaminateFlatPicture } from "@/lib/laminate-flat-pictures";
import type { RoomWallFinishQuantities } from "@/lib/surface-material-wall-panels";
import {
  getSurfaceMaterialPreviewSource,
  type SurfaceMaterialCatalogRecord,
} from "@/lib/surface-material-runtime";

export type SurfaceBrowserTab = "tiles" | "rooms";
export type WallSurfaceMode = "paint" | "materials";
export type SurfaceBrowserViewMode = "grid" | "list";
export type SurfaceFilterKey = "brand" | "collection" | "effect" | "size" | "color";
export type SurfaceTargetMode = "floor" | "walls" | "selected_wall" | "ceiling";

export type SurfaceRoomSummary = {
  id: string;
  name: string;
  floorLabel?: string;
  roomType: RoomType;
  width: number;
  depth: number;
  height?: number;
  /** Polygon-aware floor and ceiling area from lib/room-floor-area. */
  floorAreaSqm: number;
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceAssignments;
  wallFinishQuantities: RoomWallFinishQuantities;
};

export type SurfaceFilterState = Partial<Record<SurfaceFilterKey, string>> & {
  favoritesOnly?: boolean;
  recommendedOnly?: boolean;
};

export const SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT = 16;
export const SURFACE_MATERIAL_VISIBLE_INCREMENT = 32;
export const WALL_PAINT_INITIAL_VISIBLE_COUNT = 36;
export const WALL_PAINT_VISIBLE_INCREMENT = 72;

export type SurfaceSummaryRow = {
  id: string;
  room: SurfaceRoomSummary;
  target: SurfaceTargetMode;
  surfaceLabel: string;
  materialId: string;
  materialName: string;
  supplier: string;
  areaSqm: number;
  /** "12 sheets": what to order of a wall panel finish (lib/surface-material-sheets.ts); null for one ordered by area. */
  sheetsLabel: string | null;
  status: string;
  sampleUrl: string | null;
  settings: {
    pattern: RoomFloorPattern;
    rotationDeg: number;
    scale: number;
    offset: { x: number; y: number };
    jointSizeMm: number;
    jointColor: string;
  };
};

export type SurfaceMaterialProductGroup = {
  id: string;
  key: string;
  primary: SurfaceMaterialCatalogRecord;
  variants: SurfaceMaterialCatalogRecord[];
};

export function getFloorMaterialSwatchStyle(material: FloorMaterial): CSSProperties {
  if (material.pattern === "wood_plank") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent 0 7px, ${material.lineColor}66 7px 8px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }
  if (material.pattern === "tile_grid") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent 0 9px, ${material.lineColor}70 9px 10px)`,
        `repeating-linear-gradient(90deg, transparent 0 9px, ${material.lineColor}70 9px 10px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }
  if (material.pattern === "soft_fleck") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `radial-gradient(circle at 24% 28%, ${material.lineColor}80 0 1px, transparent 2px)`,
        `radial-gradient(circle at 68% 58%, ${material.accentColor}70 0 1px, transparent 2px)`,
        `radial-gradient(circle at 42% 78%, ${material.lineColor}55 0 1px, transparent 2px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }
  return {
    background: `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
  };
}

export function formatSurfaceMaterialValue(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getSurfaceMaterialSupplierLabel(material: SurfaceMaterialCatalogRecord) {
  return material.surface_material.brand ?? formatSurfaceMaterialValue(material.surface_material.supplier);
}

/** The manufacturer's collection (Dorica, Tabulae); never the brand, which has its own label. */
export function getSurfaceMaterialCollectionLabel(material: SurfaceMaterialCatalogRecord) {
  return material.surface_material.collection?.trim() ?? "";
}

export function getSurfaceMaterialSizeLabel(material: SurfaceMaterialCatalogRecord) {
  const specs = material.physical_specs;
  if (specs?.tile_width_mm && specs?.tile_length_mm) {
    return `${Math.round(specs.tile_width_mm)}x${Math.round(specs.tile_length_mm)} mm`;
  }
  if (specs?.plank_width_mm && specs?.plank_length_mm) {
    return `${Math.round(specs.plank_width_mm)}x${Math.round(specs.plank_length_mm)} mm`;
  }
  return "Size TBC";
}

export function getSurfaceMaterialEffectLabel(material: SurfaceMaterialCatalogRecord) {
  return formatSurfaceMaterialValue(material.classification?.design_effect ?? "unknown");
}

function getSurfaceMaterialThicknessLabel(material: SurfaceMaterialCatalogRecord) {
  const thickness = material.physical_specs?.total_thickness_mm;
  return typeof thickness === "number" && Number.isFinite(thickness)
    ? `${thickness.toLocaleString(undefined, { maximumFractionDigits: 2 })} mm thick`
    : null;
}

function getSurfaceMaterialDisplayName(material: SurfaceMaterialCatalogRecord) {
  const productName = material.surface_material.product_name.trim();
  const prefixes = [
    material.surface_material.brand,
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

export function getSurfaceMaterialProductDisplayName(material: SurfaceMaterialCatalogRecord) {
  const displayName = getSurfaceMaterialDisplayName(material);
  const withoutSize = displayName
    .replace(
      /\s+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*$/i,
      ""
    )
    .trim();
  return withoutSize || displayName;
}

/**
 * A card names the model ("Crema") under its collection ("Dorica"), as the manufacturer does.
 * A name that doesn't start with its collection (Goodrich's) stays whole.
 */
export function getSurfaceMaterialModelName(material: SurfaceMaterialCatalogRecord) {
  const displayName = getSurfaceMaterialProductDisplayName(material);
  const collection = getSurfaceMaterialCollectionLabel(material);
  const model = collection && displayName.toLowerCase().startsWith(`${collection.toLowerCase()} `)
    ? displayName.slice(collection.length).trim()
    : "";
  return model || displayName;
}

export function getSurfaceMaterialSizeOptionLabel(material: SurfaceMaterialCatalogRecord) {
  const displayName = getSurfaceMaterialDisplayName(material);
  const match = displayName.match(
    /(\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*)$/i
  );
  if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  return getSurfaceMaterialSizeLabel(material).replace(/\s*mm$/i, " mm");
}

function getSurfaceMaterialGroupKey(material: SurfaceMaterialCatalogRecord) {
  return [
    material.surface_material.supplier,
    material.surface_material.brand,
    material.surface_material.collection,
    material.surface_material.surface_category,
    material.surface_material.material_family,
    material.classification?.design_effect,
    material.classification?.color_family,
    getSurfaceMaterialProductDisplayName(material),
  ]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
}

function getSurfaceMaterialVariantAreaMm(material: SurfaceMaterialCatalogRecord) {
  const specs = material.physical_specs;
  const width = specs?.tile_width_mm ?? specs?.plank_width_mm ?? 0;
  const length = specs?.tile_length_mm ?? specs?.plank_length_mm ?? 0;
  return width * length;
}

function compareSurfaceMaterialVariants(a: SurfaceMaterialCatalogRecord, b: SurfaceMaterialCatalogRecord) {
  const areaDelta = getSurfaceMaterialVariantAreaMm(b) - getSurfaceMaterialVariantAreaMm(a);
  if (areaDelta !== 0) return areaDelta;
  return getSurfaceMaterialSizeOptionLabel(a).localeCompare(getSurfaceMaterialSizeOptionLabel(b));
}

export function buildSurfaceMaterialProductGroups(
  materials: readonly SurfaceMaterialCatalogRecord[],
  preferredMaterialIds: Array<string | null | undefined> = []
) {
  const preferredIds = new Set(preferredMaterialIds.filter(Boolean) as string[]);
  const groups = new Map<string, SurfaceMaterialCatalogRecord[]>();
  for (const material of materials) {
    const key = getSurfaceMaterialGroupKey(material);
    groups.set(key, [...(groups.get(key) ?? []), material]);
  }
  return Array.from(groups.entries())
    .map(([key, variants]) => {
      const sortedVariants = [...variants].sort(compareSurfaceMaterialVariants);
      const preferredVariant =
        sortedVariants.find((variant) => preferredIds.has(variant.surface_material.material_id)) ??
        sortedVariants[0];
      return {
        id: preferredVariant.surface_material.material_id,
        key,
        primary: preferredVariant,
        variants: sortedVariants,
      };
    })
    // A to Z, with the laminates' flat colours after everything else (J, 27 Oct 2026: "Flat colours last"), so the first
    // page mixes tiles and designs rather than 120 plain colours.
    .sort((a, b) =>
      Number(isLaminateFlatPicture(a.primary.texture_assets.base_color_url)) -
        Number(isLaminateFlatPicture(b.primary.texture_assets.base_color_url)) ||
      getSurfaceMaterialProductDisplayName(a.primary).localeCompare(
        getSurfaceMaterialProductDisplayName(b.primary)
      )
    );
}

export function getSurfaceMaterialGroupSizeLabels(group: SurfaceMaterialProductGroup) {
  return Array.from(new Set(group.variants.map(getSurfaceMaterialSizeOptionLabel)));
}

export function getSurfaceMaterialGroupMetaLabel(group: SurfaceMaterialProductGroup) {
  const sizeLabels = getSurfaceMaterialGroupSizeLabels(group);
  const thicknessLabels = Array.from(
    new Set(group.variants.map(getSurfaceMaterialThicknessLabel).filter(Boolean))
  );
  return [
    getSurfaceMaterialEffectLabel(group.primary),
    `${sizeLabels.length} size${sizeLabels.length === 1 ? "" : "s"}`,
    thicknessLabels.length === 1 ? thicknessLabels[0] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The wood colour families are tones, not species (J, 28 Oct 2026): "Walnut" in the colour filter would also hold mahogany and
 * wenge, so the filter says Dark Wood. The stored values stay light_oak, natural_oak, warm_oak and walnut.
 */
const SURFACE_COLOUR_LABEL: Readonly<Record<string, string>> = {
  light_oak: "Light Wood",
  natural_oak: "Natural Wood",
  warm_oak: "Warm Wood",
  walnut: "Dark Wood",
};

/** What the colour filter calls a colour family: "Grey", "Light Wood". */
export function getSurfaceColourFamilyLabel(family: string) {
  return SURFACE_COLOUR_LABEL[family] ?? formatSurfaceMaterialValue(family);
}

export function getSurfaceMaterialColorLabel(material: SurfaceMaterialCatalogRecord) {
  return getSurfaceColourFamilyLabel(material.classification?.color_family ?? "unknown");
}

export function buildFacetOptions(
  materials: readonly SurfaceMaterialCatalogRecord[],
  getValue: (material: SurfaceMaterialCatalogRecord) => string
) {
  return Array.from(new Set(materials.map(getValue).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getSurfaceMaterialPrimaryId(material: SurfaceMaterialCatalogRecord | null) {
  return material?.surface_material.material_id ?? null;
}

export function getSurfaceMaterialSampleUrl(
  material: SurfaceMaterialCatalogRecord | undefined
) {
  return material?.commerce.sample_request_url ?? material?.source.sample_request_url ?? null;
}

export function getSurfaceMaterialSwatchStyle(
  material: SurfaceMaterialCatalogRecord
): CSSProperties {
  const textureSource = getSurfaceMaterialPreviewSource(material);
  if (textureSource) {
    return {
      backgroundColor: "#e8e2d6",
      backgroundImage: `url("${textureSource.url}")`,
      backgroundPosition: "center",
      backgroundSize: textureSource.kind === "swatch" ? "cover" : "48px 48px",
    };
  }
  const effect = material.classification?.design_effect;
  const colorFamily = material.classification?.color_family;
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
  const line = effect === "stone" || effect === "marble" ? "#9ea1a3" : "#a9855e";
  return {
    backgroundColor: base,
    backgroundImage:
      effect === "stone" || effect === "marble" || effect === "concrete"
        ? `linear-gradient(135deg, ${base}, #f4f0e8), radial-gradient(circle at 28% 35%, ${line}77 0 1px, transparent 2px)`
        : `repeating-linear-gradient(0deg, transparent 0 8px, ${line}66 8px 9px), linear-gradient(135deg, ${base}, #f0e3c8)`,
  };
}
