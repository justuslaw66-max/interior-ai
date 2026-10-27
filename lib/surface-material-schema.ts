export type SurfaceCategory = "flooring" | "wall_tile" | "paint" | "wallpaper" | "wall_panel";

export type FlooringMaterialFamily =
  | "luxury_vinyl_tile"
  | "spc"
  | "vinyl_sheet"
  | "engineered_timber"
  | "wpc_decking"
  | "carpet_tile"
  | "tile"
  | "stone"
  | "laminate";

export type SurfaceMaterialFamily =
  | FlooringMaterialFamily
  | "paint"
  | "wallpaper"
  | "wall_panel";

export type SurfaceDesignEffect =
  | "wood"
  | "stone"
  | "concrete"
  | "marble"
  | "terrazzo"
  | "plain"
  | "woven"
  | "outdoor_decking"
  // Greenlam's laminate wall panels (25 Oct 2026): its abstracts that are no stone, marble, concrete or weave, and its metal and
  // pearlescent finishes.
  | "pattern"
  | "metallic"
  | "unknown";

export type SurfaceColorFamily =
  | "light_oak"
  | "natural_oak"
  | "warm_oak"
  | "walnut"
  | "beige"
  | "cream"
  | "grey"
  | "charcoal"
  | "brown"
  | "white"
  | "black"
  | "mixed"
  | "unknown";

export type SurfaceSupplierRegion = "singapore" | "international";

export type SurfaceLicenseStatus =
  | "confirmed"
  | "needs_permission"
  | "supplier_reference_only"
  | "unknown";

export type SurfacePlankOrTileFormat =
  | "plank"
  | "tile"
  | "sheet"
  | "roll"
  | "decking_board"
  | "unknown";

export type SurfaceScaleMode = "physical_repeat" | "visual_repeat" | "swatch_only";
export type SurfaceSeamStrategy = "repeat_texture" | "single_swatch" | "non_tileable_preview";
export type SurfacePurchaseMode = "quote_or_sample" | "direct_checkout" | "affiliate" | "unknown";
export type SurfacePublishStatus = "draft" | "published" | "blocked" | "needs_review";
export type SurfacePatternLayout =
  | "straight"
  | "brick"
  | "vertical_brick"
  | "random_stagger"
  | "herringbone"
  | "chevron"
  | "grid"
  | "checker";

/** One whole-tile picture of a format, with the physical size the picture covers. */
export type SurfaceTextureFace = {
  url: string;
  width_mm: number;
  height_mm: number;
};

export type SurfaceMaterial = {
  schema_version: number;
  surface_material: {
    supplier: string;
    brand?: string | null;
    collection?: string | null;
    material_id: string;
    product_name: string;
    slug: string;
    surface_category: SurfaceCategory;
    material_family: SurfaceMaterialFamily;
  };
  source: {
    supplier_region: SurfaceSupplierRegion;
    source_url: string;
    sample_request_url?: string | null;
    currency?: "SGD" | string;
    license_status: SurfaceLicenseStatus;
    notes?: string[];
  };
  classification: {
    flooring_type: FlooringMaterialFamily;
    design_effect: SurfaceDesignEffect;
    color_family: SurfaceColorFamily;
    tone: string[];
    style_cluster: string[];
    room_suitability: string[];
    /** Where an outdoor floor tile goes (vocabulary `outdoor_use`); see docs/architecture/surface-material-outdoor-tiles.md. */
    outdoor_uses?: string[];
  };
  physical_specs: {
    plank_or_tile_format?: SurfacePlankOrTileFormat;
    plank_width_mm?: number | null;
    plank_length_mm?: number | null;
    tile_width_mm?: number | null;
    tile_length_mm?: number | null;
    /** Chevron pieces only: how far each end's slanted cut runs along the piece; tile_length_mm is tip to tip. */
    chevron_end_offset_mm?: number | null;
    total_thickness_mm?: number | null;
    wear_layer_mm?: number | null;
    installation_method?: string[];
    waterproof?: boolean | null;
    slip_rating?: string | null;
    suitable_for_wet_area?: boolean | null;
    suitable_for_outdoor?: boolean | null;
    commercial_grade?: boolean | null;
  };
  texture_assets: {
    swatch_url: string | null;
    base_color_url: string | null;
    normal_url?: string | null;
    roughness_url?: string | null;
    ao_url?: string | null;
    preview_room_url?: string | null;
    tileable: boolean | "needs_confirmation";
    texture_repeat_size_cm?: { width: number; height: number } | null;
    /** Physical size that base_color_url covers. Independent of the tile size. */
    image_physical_size_mm?: { width: number; height: number } | null;
    /** Whole-tile faces for this format. When present the renderer lays one face per tile. */
    faces?: SurfaceTextureFace[] | null;
  };
  rendering: {
    default_rotation_deg: number;
    roughness: number;
    metalness: number;
    normal_strength?: number;
    scale_mode: SurfaceScaleMode;
    seam_strategy: SurfaceSeamStrategy;
    source_pattern_ids?: string[];
    available_pattern_layouts?: SurfacePatternLayout[];
  };
  commerce: {
    purchase_mode: SurfacePurchaseMode;
    price_per_sqm?: {
      currency: string;
      amount: number | null;
    };
    sample_available: boolean | "unknown";
    sample_request_url?: string | null;
    direct_checkout: boolean;
  };
  import_governance: {
    publish_status: SurfacePublishStatus;
    publish_blockers: string[];
    qa_flags: string[];
  };
};

/**
 * What the browser data says about an outdoor floor tile: where it goes, how it can be laid, and the same colour's indoor
 * floor entries (derived from the catalogue, so it can't drift). Built by the generator; see lib/surface-material-outdoor.ts.
 */
export type SurfaceMaterialOutdoorProfile = {
  uses: string[];
  laying: string[];
  indoor_twin_ids: string[];
};

export const SURFACE_MATERIAL_VOCABULARY = {
  surface_category: ["flooring", "wall_tile", "paint", "wallpaper", "wall_panel"],
  material_family: [
    "luxury_vinyl_tile",
    "spc",
    "vinyl_sheet",
    "engineered_timber",
    "wpc_decking",
    "carpet_tile",
    "tile",
    "stone",
    "laminate",
    "paint",
    "wallpaper",
    "wall_panel",
  ],
  flooring_type: [
    "luxury_vinyl_tile",
    "spc",
    "vinyl_sheet",
    "engineered_timber",
    "wpc_decking",
    "carpet_tile",
    "tile",
    "stone",
    "laminate",
  ],
  design_effect: [
    "wood",
    "stone",
    "concrete",
    "marble",
    "terrazzo",
    "plain",
    "woven",
    "outdoor_decking",
    "pattern",
    "metallic",
    "unknown",
  ],
  color_family: [
    "light_oak",
    "natural_oak",
    "warm_oak",
    "walnut",
    "beige",
    "cream",
    "grey",
    "charcoal",
    "brown",
    "white",
    "black",
    "mixed",
    "unknown",
  ],
  tone: [
    "warm",
    "cool",
    "neutral",
    "natural",
    "airy",
    "soft",
    "practical",
    "clean",
    "textured",
    "outdoor",
    "durable",
    "commercial",
  ],
  style_cluster: [
    "japandi",
    "contemporary",
    "soft_minimal",
    "modern",
    "scandinavian",
    "commercial",
    "hospitality",
    "outdoor_living",
    "healthcare",
  ],
  room_suitability: [
    "living_room",
    "bedroom",
    "dining_room",
    "study",
    "hallway",
    "kitchen",
    "bathroom",
    "balcony",
    "commercial",
    "hospitality",
    "education",
  ],
  // Gardenia's outdoor tiles go "from the terrace to the balconies, from the paths to the gardens, from the patio to the pool"
  // (blog.gardenia.it, read 13 Oct 2026); ABK's Plein Air catalogue adds driveways, steps and external showers (read 14 Oct 2026).
  outdoor_use: ["terrace", "balcony", "patio", "garden", "path", "pool_edge", "driveway", "steps", "outdoor_shower"],
  installation_method: [
    "unknown",
    "click_lock",
    "glue_down",
    "loose_lay",
    "sheet_roll",
    "decking_clip",
    "direct_stick",
    // Outdoor laying of the 20 mm Plein Air tiles (ABK's Plein Air catalogue, 2026), besides glue on a screed (direct_stick).
    "dry_lay_on_grass",
    "dry_lay_on_gravel_or_sand",
    "raised_installation",
  ],
  purchase_mode: ["quote_or_sample", "direct_checkout", "affiliate", "unknown"],
  license_status: ["confirmed", "needs_permission", "supplier_reference_only", "unknown"],
  publish_status: ["draft", "published", "blocked", "needs_review"],
} as const;
