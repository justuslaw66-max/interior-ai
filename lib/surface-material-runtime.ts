import type { SurfaceMaterial } from "./surface-material-schema";

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

const GOODRICH_DRAFT_SURFACE_MATERIALS: SurfaceMaterialRenderInfo[] = [
  {
    surface_material: {
      supplier: "goodrich_global",
      brand: "Goodrich Global",
      material_id: "goodrich-lvt-wood-look-draft",
      slug: "goodrich-lvt-wood-look-draft",
      product_name: "Goodrich LVT Wood Look - Draft Import",
      surface_category: "flooring",
      material_family: "luxury_vinyl_tile",
    },
    texture_assets: {
      swatch_url: null,
      base_color_url: null,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: 0.72,
      metalness: 0,
      normal_strength: 0.25,
      scale_mode: "swatch_only",
      seam_strategy: "single_swatch",
    },
    source: {
      source_url: "https://www.goodrichglobal.com/singapore/product-category/flooring/",
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
      license_status: "needs_permission",
    },
    classification: {
      design_effect: "wood",
      color_family: "light_oak",
      tone: ["warm", "natural", "airy"],
      style_cluster: ["japandi", "contemporary", "soft_minimal"],
      room_suitability: ["living_room", "bedroom", "dining_room", "study"],
    },
    physical_specs: {
      waterproof: null,
      suitable_for_outdoor: false,
      commercial_grade: null,
    },
    commerce: {
      purchase_mode: "quote_or_sample",
      sample_available: true,
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: [
        "confirm_exact_goodrich_product_code",
        "confirm_supplier_image_usage_rights",
        "add_swatch_asset",
        "add_tileable_base_color_texture",
        "confirm_texture_tileability",
        "confirm_physical_dimensions",
        "confirm_price_per_sqm_or_quote_mode",
      ],
    },
  },
  {
    surface_material: {
      supplier: "goodrich_global",
      brand: "Goodrich Global",
      material_id: "goodrich-spc-wood-look-draft",
      slug: "goodrich-spc-wood-look-draft",
      product_name: "Goodrich SPC Wood Look - Draft Import",
      surface_category: "flooring",
      material_family: "spc",
    },
    texture_assets: {
      swatch_url: null,
      base_color_url: null,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: 0.7,
      metalness: 0,
      normal_strength: 0.24,
      scale_mode: "swatch_only",
      seam_strategy: "single_swatch",
    },
    source: {
      source_url: "https://www.goodrichglobal.com/singapore/product-category/flooring/",
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
      license_status: "needs_permission",
    },
    classification: {
      design_effect: "wood",
      color_family: "natural_oak",
      tone: ["warm", "natural", "durable"],
      style_cluster: ["modern", "contemporary"],
      room_suitability: ["living_room", "bedroom", "dining_room", "kitchen", "commercial"],
    },
    physical_specs: {
      waterproof: null,
      suitable_for_outdoor: false,
      commercial_grade: null,
    },
    commerce: {
      purchase_mode: "quote_or_sample",
      sample_available: true,
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: [
        "confirm_exact_goodrich_product_code",
        "confirm_supplier_image_usage_rights",
        "add_swatch_asset",
        "add_tileable_base_color_texture",
        "confirm_texture_tileability",
        "confirm_physical_dimensions",
        "confirm_price_per_sqm_or_quote_mode",
      ],
    },
  },
  {
    surface_material: {
      supplier: "goodrich_global",
      brand: "Goodrich Global",
      material_id: "goodrich-vinyl-sheet-draft",
      slug: "goodrich-vinyl-sheet-draft",
      product_name: "Goodrich Vinyl Sheet - Draft Import",
      surface_category: "flooring",
      material_family: "vinyl_sheet",
    },
    texture_assets: {
      swatch_url: null,
      base_color_url: null,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: 0.76,
      metalness: 0,
      normal_strength: 0.18,
      scale_mode: "swatch_only",
      seam_strategy: "single_swatch",
    },
    source: {
      source_url: "https://www.goodrichglobal.com/singapore/product-category/flooring/",
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
      license_status: "needs_permission",
    },
    classification: {
      design_effect: "plain",
      color_family: "grey",
      tone: ["neutral", "practical", "clean"],
      style_cluster: ["commercial", "healthcare"],
      room_suitability: ["kitchen", "bathroom", "commercial", "education"],
    },
    physical_specs: {
      waterproof: null,
      suitable_for_outdoor: false,
      commercial_grade: null,
    },
    commerce: {
      purchase_mode: "quote_or_sample",
      sample_available: true,
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: [
        "confirm_exact_goodrich_product_code",
        "confirm_supplier_image_usage_rights",
        "add_swatch_asset",
        "add_tileable_base_color_texture",
        "confirm_texture_tileability",
        "confirm_physical_dimensions",
        "confirm_price_per_sqm_or_quote_mode",
      ],
    },
  },
  {
    surface_material: {
      supplier: "goodrich_global",
      brand: "Goodrich Global",
      material_id: "goodrich-engineered-timber-draft",
      slug: "goodrich-engineered-timber-draft",
      product_name: "Goodrich Engineered Timber - Draft Import",
      surface_category: "flooring",
      material_family: "engineered_timber",
    },
    texture_assets: {
      swatch_url: null,
      base_color_url: null,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: 0.68,
      metalness: 0,
      normal_strength: 0.32,
      scale_mode: "swatch_only",
      seam_strategy: "single_swatch",
    },
    source: {
      source_url: "https://www.goodrichglobal.com/singapore/product-category/flooring/",
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
      license_status: "needs_permission",
    },
    classification: {
      design_effect: "wood",
      color_family: "warm_oak",
      tone: ["warm", "natural", "textured"],
      style_cluster: ["contemporary", "scandinavian"],
      room_suitability: ["living_room", "bedroom", "dining_room", "study"],
    },
    physical_specs: {
      waterproof: null,
      suitable_for_outdoor: false,
      commercial_grade: null,
    },
    commerce: {
      purchase_mode: "quote_or_sample",
      sample_available: true,
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: [
        "confirm_exact_goodrich_product_code",
        "confirm_supplier_image_usage_rights",
        "add_swatch_asset",
        "add_tileable_base_color_texture",
        "confirm_texture_tileability",
        "confirm_physical_dimensions",
        "confirm_price_per_sqm_or_quote_mode",
      ],
    },
  },
  {
    surface_material: {
      supplier: "goodrich_global",
      brand: "Goodrich Global",
      material_id: "goodrich-wpc-decking-draft",
      slug: "goodrich-wpc-decking-draft",
      product_name: "Goodrich WPC Decking - Draft Import",
      surface_category: "flooring",
      material_family: "wpc_decking",
    },
    texture_assets: {
      swatch_url: null,
      base_color_url: null,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: 0.82,
      metalness: 0,
      normal_strength: 0.28,
      scale_mode: "swatch_only",
      seam_strategy: "single_swatch",
    },
    source: {
      source_url: "https://www.goodrichglobal.com/singapore/product-category/flooring/",
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
      license_status: "needs_permission",
    },
    classification: {
      design_effect: "outdoor_decking",
      color_family: "brown",
      tone: ["outdoor", "durable", "textured"],
      style_cluster: ["outdoor_living", "contemporary"],
      room_suitability: ["balcony", "commercial", "hospitality"],
    },
    physical_specs: {
      waterproof: null,
      suitable_for_outdoor: true,
      commercial_grade: null,
    },
    commerce: {
      purchase_mode: "quote_or_sample",
      sample_available: true,
      sample_request_url: "https://www.goodrichglobal.com/singapore/contact-us/request-samples/",
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: [
        "confirm_exact_goodrich_product_code",
        "confirm_supplier_image_usage_rights",
        "add_swatch_asset",
        "add_tileable_base_color_texture",
        "confirm_texture_tileability",
        "confirm_physical_dimensions",
        "confirm_price_per_sqm_or_quote_mode",
      ],
    },
  },
];

export const SURFACE_MATERIAL_RENDER_REGISTRY: SurfaceMaterialRenderInfo[] = [
  ...GOODRICH_DRAFT_SURFACE_MATERIALS,
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
