import { PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES } from "./generated/surface-material-render.generated";
import type {
  SurfaceMaterialRenderInfo,
  SurfaceMaterialRenderRecord,
  SurfaceMaterialRenderTuple,
  SurfaceMaterialTextureSource,
} from "./surface-material-runtime-types";

export type {
  SurfaceMaterialCatalogRecord,
  SurfaceMaterialRenderInfo,
  SurfaceMaterialRenderRecord,
  SurfaceMaterialTextureSource,
} from "./surface-material-runtime-types";

export function decodeSurfaceMaterialRenderTuple(
  tuple: SurfaceMaterialRenderTuple
): SurfaceMaterialRenderRecord {
  return {
    surface_material: {
      supplier: tuple[0],
      brand: tuple[1],
      material_id: tuple[2],
      slug: tuple[3],
      product_name: tuple[4],
      surface_category: tuple[5],
      material_family: tuple[6],
    },
    classification: {
      design_effect: tuple[7],
      color_family: tuple[8],
    },
    physical_specs: {
      plank_width_mm: tuple[9],
      plank_length_mm: tuple[10],
      tile_width_mm: tuple[11],
      tile_length_mm: tuple[12],
    },
    texture_assets: {
      swatch_url: tuple[13],
      base_color_url: tuple[14],
      texture_repeat_size_cm: tuple[15],
      normal_url: tuple[16],
      roughness_url: tuple[17],
      ao_url: tuple[18],
      preview_room_url: tuple[19],
      tileable: tuple[20],
    },
    rendering: {
      default_rotation_deg: tuple[21],
      roughness: tuple[22],
      metalness: tuple[23],
      normal_strength: tuple[24] ?? undefined,
      scale_mode: tuple[25],
      seam_strategy: tuple[26],
      source_pattern_ids: tuple[27] ?? undefined,
      available_pattern_layouts: tuple[28] ?? undefined,
    },
    import_governance: {
      publish_status: tuple[29],
      publish_blockers: tuple[30],
    },
  };
}

export const SURFACE_MATERIAL_RENDER_REGISTRY: readonly SurfaceMaterialRenderRecord[] =
  Object.freeze(PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES.map(decodeSurfaceMaterialRenderTuple));

const surfaceMaterialById = new Map<string, SurfaceMaterialRenderRecord>();
for (const material of SURFACE_MATERIAL_RENDER_REGISTRY) {
  surfaceMaterialById.set(material.surface_material.material_id, material);
  surfaceMaterialById.set(material.surface_material.slug, material);
}

export function getRuntimeSurfaceMaterialById(
  materialId?: string | null
): SurfaceMaterialRenderRecord | null {
  const normalized = materialId?.trim();
  return normalized ? surfaceMaterialById.get(normalized) ?? null : null;
}

export function getSurfaceMaterialTextureSource(
  material: SurfaceMaterialRenderInfo | null
): SurfaceMaterialTextureSource | null {
  if (!material) return null;
  const baseColorUrl = material.texture_assets.base_color_url?.trim();
  if (baseColorUrl) return { url: baseColorUrl, kind: "base_color" };
  const swatchUrl = material.texture_assets.swatch_url?.trim();
  if (swatchUrl) return { url: swatchUrl, kind: "swatch" };
  return null;
}

export function shouldUseSingleSurfaceSwatch(
  material: SurfaceMaterialRenderInfo,
  sourceKind: SurfaceMaterialTextureSource["kind"]
): boolean {
  return (
    sourceKind === "swatch" &&
    (material.rendering.scale_mode === "swatch_only" ||
      material.rendering.seam_strategy === "single_swatch")
  );
}
