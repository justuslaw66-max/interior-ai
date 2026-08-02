import type { CSSProperties } from "react";

import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { FloorMaterial } from "@/lib/floor-materials";
import type {
  RoomFloorPattern,
  RoomSurfaceAssignments,
  RoomType,
} from "@/lib/room-types";
import {
  getSurfaceMaterialTextureSource,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";

export type SurfaceBrowserTab = "tiles" | "rooms";
export type WallSurfaceMode = "paint" | "materials";
export type SurfaceBrowserViewMode = "grid" | "list";
export type SurfaceFilterKey = "effect" | "collection" | "size" | "color";
export type SurfaceTargetMode = "floor" | "walls" | "selected_wall" | "ceiling";

export type SurfaceRoomSummary = {
  id: string;
  name: string;
  floorLabel?: string;
  roomType: RoomType;
  width: number;
  depth: number;
  height?: number;
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceAssignments;
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
  primary: SurfaceMaterialRenderInfo;
  variants: SurfaceMaterialRenderInfo[];
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

export function getSurfaceMaterialSupplierLabel(material: SurfaceMaterialRenderInfo) {
  return material.surface_material.brand ?? formatSurfaceMaterialValue(material.surface_material.supplier);
}

export function getSurfaceMaterialCollectionLabel(material: SurfaceMaterialRenderInfo) {
  return (
    material.surface_material.collection ??
    material.surface_material.brand ??
    formatSurfaceMaterialValue(material.surface_material.supplier)
  );
}

export function getSurfaceMaterialSizeLabel(material: SurfaceMaterialRenderInfo) {
  const specs = material.physical_specs;
  if (specs?.tile_width_mm && specs?.tile_length_mm) {
    return `${Math.round(specs.tile_width_mm)}x${Math.round(specs.tile_length_mm)} mm`;
  }
  if (specs?.plank_width_mm && specs?.plank_length_mm) {
    return `${Math.round(specs.plank_width_mm)}x${Math.round(specs.plank_length_mm)} mm`;
  }
  return "Size TBC";
}

export function getSurfaceMaterialEffectLabel(material: SurfaceMaterialRenderInfo) {
  return formatSurfaceMaterialValue(material.classification?.design_effect ?? "unknown");
}

function getSurfaceMaterialThicknessLabel(material: SurfaceMaterialRenderInfo) {
  const thickness = material.physical_specs?.total_thickness_mm;
  return typeof thickness === "number" && Number.isFinite(thickness)
    ? `${thickness.toLocaleString(undefined, { maximumFractionDigits: 2 })} mm thick`
    : null;
}

function getSurfaceMaterialDisplayName(material: SurfaceMaterialRenderInfo) {
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

export function getSurfaceMaterialProductDisplayName(material: SurfaceMaterialRenderInfo) {
  const displayName = getSurfaceMaterialDisplayName(material);
  const withoutSize = displayName
    .replace(
      /\s+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*$/i,
      ""
    )
    .trim();
  return withoutSize || displayName;
}

export function getSurfaceMaterialSizeOptionLabel(material: SurfaceMaterialRenderInfo) {
  const displayName = getSurfaceMaterialDisplayName(material);
  const match = displayName.match(
    /(\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s+(?:nat|natural|soft|lux|rett|ret|rect|lappato|lapp|mat|matt|polished|grip|out|outdoor|antique|3d|decor|dec|mix|r\d+))*)$/i
  );
  if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  return getSurfaceMaterialSizeLabel(material).replace(/\s*mm$/i, " mm");
}

function getSurfaceMaterialGroupKey(material: SurfaceMaterialRenderInfo) {
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

function getSurfaceMaterialVariantAreaMm(material: SurfaceMaterialRenderInfo) {
  const specs = material.physical_specs;
  const width = specs?.tile_width_mm ?? specs?.plank_width_mm ?? 0;
  const length = specs?.tile_length_mm ?? specs?.plank_length_mm ?? 0;
  return width * length;
}

function compareSurfaceMaterialVariants(a: SurfaceMaterialRenderInfo, b: SurfaceMaterialRenderInfo) {
  const areaDelta = getSurfaceMaterialVariantAreaMm(b) - getSurfaceMaterialVariantAreaMm(a);
  if (areaDelta !== 0) return areaDelta;
  return getSurfaceMaterialSizeOptionLabel(a).localeCompare(getSurfaceMaterialSizeOptionLabel(b));
}

export function buildSurfaceMaterialProductGroups(
  materials: SurfaceMaterialRenderInfo[],
  preferredMaterialIds: Array<string | null | undefined> = []
) {
  const preferredIds = new Set(preferredMaterialIds.filter(Boolean) as string[]);
  const groups = new Map<string, SurfaceMaterialRenderInfo[]>();
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
    .sort((a, b) =>
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

export function getSurfaceMaterialColorLabel(material: SurfaceMaterialRenderInfo) {
  return formatSurfaceMaterialValue(material.classification?.color_family ?? "unknown");
}

export function buildFacetOptions(
  materials: SurfaceMaterialRenderInfo[],
  getValue: (material: SurfaceMaterialRenderInfo) => string
) {
  return Array.from(new Set(materials.map(getValue).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getSurfaceRoomAreaSqm(room: SurfaceRoomSummary) {
  return Math.max(0, room.width * room.depth);
}

function getSurfaceRoomWallHeight(room: SurfaceRoomSummary) {
  return Math.max(0.2, room.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight);
}

export function getSurfaceRoomWallAreaSqm(room: SurfaceRoomSummary) {
  return Math.max(0, (room.width + room.depth) * 2 * getSurfaceRoomWallHeight(room));
}

export function getSurfaceRoomWallFaceAreaSqm(room: SurfaceRoomSummary, faceId: string) {
  const height = getSurfaceRoomWallHeight(room);
  if (faceId === "north" || faceId === "south") return Math.max(0, room.width * height);
  if (faceId === "east" || faceId === "west") return Math.max(0, room.depth * height);
  return Math.max(0, Math.max(room.width, room.depth) * height);
}

export function getSurfaceMaterialPrimaryId(material: SurfaceMaterialRenderInfo | null) {
  return material?.surface_material.material_id ?? null;
}

export function getSurfaceMaterialSwatchStyle(
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
