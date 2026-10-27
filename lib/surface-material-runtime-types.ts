import type { SurfaceMaterial, SurfaceMaterialOutdoorProfile } from "./surface-material-schema";
import type { SurfaceTextureFacesData } from "./surface-texture-face-run";

export type SurfaceMaterialRenderRecord = {
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
  classification: Pick<
    SurfaceMaterial["classification"],
    "design_effect" | "color_family"
  >;
  physical_specs: Pick<
    SurfaceMaterial["physical_specs"],
    "plank_width_mm" | "plank_length_mm" | "tile_width_mm" | "tile_length_mm" | "chevron_end_offset_mm"
  >;
  texture_assets: SurfaceMaterial["texture_assets"];
  rendering: SurfaceMaterial["rendering"];
  import_governance: Pick<
    SurfaceMaterial["import_governance"],
    "publish_status" | "publish_blockers"
  >;
  /** The tile facts plan review checks a room's surfaces against; set only when one is known. */
  suitability?: SurfaceSuitabilityFacts;
};

/**
 * Plan review's surface checks (17 Oct 2026): a tile's DIN 51130 slip class and DIN 51097 barefoot class, the ABK technical
 * sheet they come from, whether it is in ABK's outdoor range, and whether that sheet calls it a white-body wall tile. And
 * (26 Oct 2026) whether it is a thin laminate sheet for walls, a Greenlam HPL wall panel, which is for dry walls.
 */
export type SurfaceSuitabilityFacts = {
  slip_rating: string | null;
  barefoot_slip_rating: string | null;
  /** The collection of the ABK technical sheet the facts come from, e.g. "Make". */
  datasheet: string | null;
  outdoor_floor: boolean;
  wall_tile_body: boolean;
  laminate_sheet: boolean;
};

/**
 * The same facts in the render tuple: the flags are 1 for an outdoor floor, 2 for a white-body wall tile and 4 for a
 * laminate sheet.
 */
export type SurfaceSuitabilityTuple = readonly [
  slipRating: string | null,
  barefootSlipRating: string | null,
  datasheet: string | null,
  flags: number,
];

export type SurfaceMaterialCatalogMetadata = {
  material_id: string;
  /** The collection is browser-only (filters and cards), so it stays out of the render data. */
  surface_material: Pick<SurfaceMaterial["surface_material"], "collection">;
  source: Pick<
    SurfaceMaterial["source"],
    "source_url" | "sample_request_url" | "license_status"
  >;
  classification: Pick<
    SurfaceMaterial["classification"],
    "tone" | "style_cluster" | "room_suitability"
  > & {
    /** Outdoor floor tiles only: where it goes, how it can be laid, the same colour's indoor floor entries. */
    outdoor?: SurfaceMaterialOutdoorProfile;
  };
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
  surface_material: SurfaceMaterialRenderRecord["surface_material"] &
    SurfaceMaterialCatalogMetadata["surface_material"];
  source: SurfaceMaterialCatalogMetadata["source"];
  classification: SurfaceMaterialRenderRecord["classification"] &
    SurfaceMaterialCatalogMetadata["classification"];
  physical_specs: SurfaceMaterialRenderRecord["physical_specs"] &
    SurfaceMaterialCatalogMetadata["physical_specs"];
  commerce: SurfaceMaterialCatalogMetadata["commerce"];
};

export type SurfaceMaterialRenderBaseTuple = readonly [
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

/**
 * The trailing fields are emitted only for materials with physical-scale image data (and a chevron's end offset, and the
 * tile facts plan review checks).
 * Faces are written as a run where their file names allow it (see surface-texture-face-run.ts).
 */
export type SurfaceMaterialRenderTuple = readonly [
  ...SurfaceMaterialRenderBaseTuple,
  imagePhysicalSizeMm?: { width: number; height: number } | null,
  faces?: SurfaceTextureFacesData | null,
  chevronEndOffsetMm?: number | null,
  suitability?: SurfaceSuitabilityTuple | null,
];

export type SurfaceMaterialRenderInfo = SurfaceMaterialRenderRecord;

export type SurfaceMaterialTextureSource = {
  url: string;
  kind: "base_color" | "swatch";
};
