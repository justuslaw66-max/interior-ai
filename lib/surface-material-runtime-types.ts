import type { SurfaceMaterial } from "./surface-material-schema";

export type SurfaceMaterialRenderRecord = {
  surface_material: Pick<
    SurfaceMaterial["surface_material"],
    | "supplier"
    | "brand"
    | "collection"
    | "material_id"
    | "slug"
    | "product_name"
    | "surface_category"
    | "material_family"
  >;
  classification: Pick<
    SurfaceMaterial["classification"],
    "design_effect" | "color_family"
  >;
  physical_specs: Pick<
    SurfaceMaterial["physical_specs"],
    "plank_width_mm" | "plank_length_mm" | "tile_width_mm" | "tile_length_mm"
  >;
  texture_assets: SurfaceMaterial["texture_assets"];
  rendering: SurfaceMaterial["rendering"];
  import_governance: Pick<
    SurfaceMaterial["import_governance"],
    "publish_status" | "publish_blockers"
  >;
};

export type SurfaceMaterialCatalogMetadata = {
  material_id: string;
  source: Pick<
    SurfaceMaterial["source"],
    "source_url" | "sample_request_url" | "license_status"
  >;
  classification: Pick<
    SurfaceMaterial["classification"],
    "tone" | "style_cluster" | "room_suitability"
  >;
  physical_specs: Pick<
    SurfaceMaterial["physical_specs"],
    | "total_thickness_mm"
    | "wear_layer_mm"
    | "waterproof"
    | "suitable_for_outdoor"
    | "commercial_grade"
  >;
  commerce: Pick<
    SurfaceMaterial["commerce"],
    "purchase_mode" | "sample_available" | "sample_request_url"
  >;
};

export type SurfaceMaterialCatalogRecord = SurfaceMaterialRenderRecord & {
  source: SurfaceMaterialCatalogMetadata["source"];
  classification: SurfaceMaterialRenderRecord["classification"] &
    SurfaceMaterialCatalogMetadata["classification"];
  physical_specs: SurfaceMaterialRenderRecord["physical_specs"] &
    SurfaceMaterialCatalogMetadata["physical_specs"];
  commerce: SurfaceMaterialCatalogMetadata["commerce"];
};

export type SurfaceMaterialRenderTuple = readonly [
  supplier: string,
  brand: string | null,
  materialId: string,
  slug: string,
  productName: string,
  surfaceCategory: SurfaceMaterial["surface_material"]["surface_category"],
  materialFamily: SurfaceMaterial["surface_material"]["material_family"],
  designEffect: SurfaceMaterial["classification"]["design_effect"],
  colorFamily: SurfaceMaterial["classification"]["color_family"],
  plankWidthMm: number | null,
  plankLengthMm: number | null,
  tileWidthMm: number | null,
  tileLengthMm: number | null,
  swatchUrl: string | null,
  baseColorUrl: string | null,
  textureRepeatSizeCm: { width: number; height: number } | null,
  normalUrl: string | null,
  roughnessUrl: string | null,
  aoUrl: string | null,
  previewRoomUrl: string | null,
  tileable: SurfaceMaterial["texture_assets"]["tileable"],
  defaultRotationDeg: number,
  roughness: number,
  metalness: number,
  normalStrength: number | null,
  scaleMode: SurfaceMaterial["rendering"]["scale_mode"],
  seamStrategy: SurfaceMaterial["rendering"]["seam_strategy"],
  sourcePatternIds: string[] | null,
  availablePatternLayouts: SurfaceMaterial["rendering"]["available_pattern_layouts"] | null,
  publishStatus: SurfaceMaterial["import_governance"]["publish_status"],
  publishBlockers: string[],
];

export type SurfaceMaterialRenderInfo = SurfaceMaterialRenderRecord;

export type SurfaceMaterialTextureSource = {
  url: string;
  kind: "base_color" | "swatch";
};
