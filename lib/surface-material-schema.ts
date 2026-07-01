export type SurfaceCategory = "flooring";

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

export type SurfaceDesignEffect =
  | "wood"
  | "stone"
  | "concrete"
  | "marble"
  | "terrazzo"
  | "plain"
  | "woven"
  | "outdoor_decking"
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
    material_family: FlooringMaterialFamily;
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
  };
  physical_specs: {
    plank_or_tile_format?: SurfacePlankOrTileFormat;
    plank_width_mm?: number | null;
    plank_length_mm?: number | null;
    tile_width_mm?: number | null;
    tile_length_mm?: number | null;
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
  };
  rendering: {
    default_rotation_deg: number;
    roughness: number;
    metalness: number;
    normal_strength?: number;
    scale_mode: SurfaceScaleMode;
    seam_strategy: SurfaceSeamStrategy;
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

export const SURFACE_MATERIAL_VOCABULARY = {
  surface_category: ["flooring"],
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
  installation_method: [
    "unknown",
    "click_lock",
    "glue_down",
    "loose_lay",
    "sheet_roll",
    "decking_clip",
    "direct_stick",
  ],
  purchase_mode: ["quote_or_sample", "direct_checkout", "affiliate", "unknown"],
  license_status: ["confirmed", "needs_permission", "supplier_reference_only", "unknown"],
  publish_status: ["draft", "published", "blocked", "needs_review"],
} as const;
