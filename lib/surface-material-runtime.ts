import type { SurfaceMaterial } from "./surface-material-schema";
import {
  PRODUCTION_SURFACE_MATERIAL_RENDER_REGISTRY,
  TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY,
} from "./generated/surface-material-runtime.generated";

export type SurfaceMaterialRenderInfo = Pick<SurfaceMaterial, "texture_assets" | "rendering"> & {
  surface_material: Pick<
    SurfaceMaterial["surface_material"],
    | "supplier"
    | "brand"
    | "material_id"
    | "slug"
    | "product_name"
    | "surface_category"
    | "material_family"
  >;
  source?: Pick<SurfaceMaterial["source"], "source_url" | "sample_request_url" | "license_status">;
  classification?: Pick<
    SurfaceMaterial["classification"],
    "design_effect" | "color_family" | "tone" | "style_cluster" | "room_suitability"
  >;
  physical_specs?: Pick<
    SurfaceMaterial["physical_specs"],
    | "plank_width_mm"
    | "plank_length_mm"
    | "tile_width_mm"
    | "tile_length_mm"
    | "total_thickness_mm"
    | "wear_layer_mm"
    | "waterproof"
    | "suitable_for_outdoor"
    | "commercial_grade"
  >;
  commerce?: Pick<
    SurfaceMaterial["commerce"],
    "purchase_mode" | "sample_available" | "sample_request_url"
  >;
  import_governance: Pick<
    SurfaceMaterial["import_governance"],
    "publish_status" | "publish_blockers"
  >;
};

export type SurfaceMaterialTextureSource = {
  url: string;
  kind: "base_color" | "swatch";
};

export function shouldIncludeTestSurfaceMaterialFixtures(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES === "true"
  );
}

export const SURFACE_MATERIAL_RENDER_REGISTRY: SurfaceMaterialRenderInfo[] = [
  ...PRODUCTION_SURFACE_MATERIAL_RENDER_REGISTRY,
  ...(shouldIncludeTestSurfaceMaterialFixtures()
    ? TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY
    : []),
];

export function getRuntimeSurfaceMaterialById(
  materialId?: string | null
): SurfaceMaterialRenderInfo | null {
  if (!materialId) return null;
  const normalized = materialId.trim();
  if (!normalized) return null;
  return (
    SURFACE_MATERIAL_RENDER_REGISTRY.find(
      (material) =>
        material.surface_material.material_id === normalized ||
        material.surface_material.slug === normalized
    ) ?? null
  );
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
