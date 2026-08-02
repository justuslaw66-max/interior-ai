import {
  PRODUCTION_SURFACE_MATERIAL_RENDER_REGISTRY,
  TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY,
} from "./generated/surface-material-runtime.generated";
import type {
  SurfaceMaterialRenderInfo,
  SurfaceMaterialTextureSource,
} from "./surface-material-runtime-types";

export type { SurfaceMaterialRenderInfo, SurfaceMaterialTextureSource };

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
