import type { SurfaceMaterial } from "./surface-material-schema";

export type SurfaceMaterialRenderInfo = Pick<SurfaceMaterial, "texture_assets" | "rendering"> & {
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
