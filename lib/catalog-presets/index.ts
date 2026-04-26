export type CatalogPresetCategory =
  | "sofa"
  | "sectional_sofa"
  | "ottoman"
  | "armchair"
  | "coffee_table"
  | "side_table"
  | "tv_console"
  | "dining_table"
  | "dining_bench"
  | "dining_chair"
  | "bed"
  | "nightstand"
  | "desk"
  | "office_chair"
  | "rug"
  | "pendant_light";

export type CatalogPresetMode = "draft" | "publish";

export type DesignPairingRuleSeverity = "error" | "warning" | "advisory";

export type DesignPairingRule = {
  requiredMode: "token_match";
  expectedTokens?: string[];
  minMatches: number;
  severity: DesignPairingRuleSeverity;
};

export type CatalogCategoryPreset = {
  category: CatalogPresetCategory;
  label: string;
  designZone: string;
  anchorRole: string;
  requiredFields: string[];
  optionalFields: string[];
  defaults: {
    placement_rules?: {
      floor_only?: boolean;
      wall_snappable?: boolean;
      clearance_sensitive?: boolean;
      center_room_preferred?: boolean;
    };
    room_compatibility?: string[];
    design_pairings?: string[];
    ai_flags?: {
      isStarterEligible?: boolean;
      isAiPlacementEligible?: boolean;
      isAutoLayoutEligible?: boolean;
    };
  };
  enums: {
    shape?: string[];
    base_type?: string[];
    material_family?: string[];
    style_cluster?: string[];
    color_family?: string[];
    tone?: string[];
    size_class?: string[];
  };
  autoMetadata?: {
    roomType?: string;
    placementProfile?: string;
    recommendedTags?: string[];
  };
  validationRules?: {
    positiveNumberFields?: string[];
    publishRequiresAssetLink?: boolean;
    designPairingRules?: DesignPairingRule;
  };
};

export type CatalogPresetValidationResult = {
  category: string;
  label: string | null;
  missingRequiredFields: string[];
  invalidEnumFields: Array<{
    field: string;
    value: string;
    allowed: string[];
  }>;
  invalidPositiveNumberFields: string[];
  errors: string[];
  warnings: string[];
  publishable: boolean;
};

const STYLE_CLUSTERS = [
  "modern",
  "contemporary",
  "scandinavian",
  "midcentury_modern",
  "minimalist",
  "industrial",
  "japandi",
  "classic",
  "contemporary_luxury",
  "coastal",
  "bohemian",
  "rustic",
] as const;

const COLOR_FAMILIES = [
  "brown",
  "beige",
  "black",
  "white",
  "grey",
  "green",
  "blue",
  "red",
  "yellow",
  "multicolor",
] as const;

const TONES = ["warm", "cool", "neutral"] as const;
const SIZE_CLASSES = ["small", "medium", "large", "extra_large"] as const;

const COMMON_AI_FLAGS = {
  isStarterEligible: true,
  isAiPlacementEligible: true,
  isAutoLayoutEligible: true,
} as const;

const COMMON_POSITIVE_FIELDS = [
  "price_usd",
  "dimensions.width_cm",
  "dimensions.depth_cm",
  "dimensions.height_cm",
] as const;

const DESIGN_PAIRING_RULES: Record<CatalogPresetCategory, DesignPairingRule> = {
  dining_table: {
    requiredMode: "token_match",
    minMatches: 2,
    severity: "error",
  },
  sofa: {
    requiredMode: "token_match",
    minMatches: 2,
    severity: "error",
  },
  sectional_sofa: {
    requiredMode: "token_match",
    minMatches: 2,
    severity: "error",
  },
  bed: {
    requiredMode: "token_match",
    minMatches: 2,
    severity: "error",
  },
  desk: {
    requiredMode: "token_match",
    minMatches: 2,
    severity: "error",
  },
  dining_chair: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  side_table: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  tv_console: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  nightstand: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  ottoman: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  dining_bench: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  armchair: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  coffee_table: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  office_chair: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  rug: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "warning",
  },
  pendant_light: {
    requiredMode: "token_match",
    minMatches: 1,
    severity: "advisory",
  },
};

export const catalogCategoryPresets: Record<CatalogPresetCategory, CatalogCategoryPreset> = {
  dining_table: {
    category: "dining_table",
    label: "Dining Table",
    designZone: "dining_zone",
    anchorRole: "dining_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "seat_capacity",
      "size_class",
      "shape",
      "base_type",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: [
      "variant",
      "brand_tier",
      "material_mix",
      "style_secondary",
      "design_era",
      "visual_attributes.visual_weight",
      "visual_attributes.edge_profile",
      "visual_attributes.silhouette",
      "visual_attributes.form_language",
      "spatial_attributes.chair_pullback_cm",
      "spatial_attributes.walkway_clearance_cm",
    ],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: true,
        center_room_preferred: true,
      },
      room_compatibility: ["dining_room", "open_plan"],
      design_pairings: ["dining_chair", "pendant_light", "dining_rug", "sideboard"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["round", "oval", "rectangular", "square"],
      base_type: ["pedestal", "four_leg", "trestle", "cross_support", "dual_panel"],
      material_family: ["wood", "metal", "glass", "stone", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "dining_room",
      placementProfile: "table_centered",
      recommendedTags: ["dining", "table-anchor"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS, "seat_capacity"],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.dining_table,
    },
  },
  dining_chair: {
    category: "dining_chair",
    label: "Dining Chair",
    designZone: "dining_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["chair_type", "arm_style", "upholstery_type", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: false,
        center_room_preferred: false,
      },
      room_compatibility: ["dining_room", "open_plan"],
      design_pairings: ["dining_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["wood", "metal", "upholstered", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "dining_room",
      placementProfile: "around_table",
      recommendedTags: ["dining", "chair-secondary"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.dining_chair,
    },
  },
  sofa: {
    category: "sofa",
    label: "Sofa",
    designZone: "living_zone",
    anchorRole: "sofa_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "seat_capacity",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["orientation", "arm_style", "leg_style", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "open_plan"],
      design_pairings: ["coffee_table", "rug", "floor_lamp", "side_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["upholstered", "leather", "wood", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "wall_anchor",
      recommendedTags: ["living", "seating-anchor"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS, "seat_capacity"],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.sofa,
    },
  },
  sectional_sofa: {
    category: "sectional_sofa",
    label: "Sectional Sofa",
    designZone: "living_zone",
    anchorRole: "sofa_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "seat_capacity",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["orientation", "arm_style", "leg_style", "style_secondary", "design_era", "shape"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "family_room", "open_plan"],
      design_pairings: ["coffee_table", "rug", "floor_lamp", "side_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["upholstered", "leather", "wood", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "sectional_anchor",
      recommendedTags: ["living", "sectional-anchor"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS, "seat_capacity"],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.sectional_sofa,
    },
  },
  ottoman: {
    category: "ottoman",
    label: "Ottoman",
    designZone: "living_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "shape",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["seat_capacity", "base_type", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: false,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "family_room", "bedroom"],
      design_pairings: ["sofa", "armchair", "accent_chair", "side_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["rectangular", "round", "oval", "square", "organic"],
      base_type: ["frame", "four_leg", "pedestal", "dual_panel"],
      material_family: ["upholstered", "wood", "mixed", "fabric", "leather"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "movable_accent",
      recommendedTags: ["living", "ottoman"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.ottoman,
    },
  },
  armchair: {
    category: "armchair",
    label: "Armchair",
    designZone: "living_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["arm_style", "leg_style", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "bedroom", "open_plan"],
      design_pairings: ["sofa", "side_table", "floor_lamp"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["upholstered", "leather", "wood", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "accent_seating",
      recommendedTags: ["living", "accent-chair"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.armchair,
    },
  },
  coffee_table: {
    category: "coffee_table",
    label: "Coffee Table",
    designZone: "living_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "shape",
      "base_type",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: true,
        center_room_preferred: true,
      },
      room_compatibility: ["living_room", "open_plan"],
      design_pairings: ["sofa", "rug", "armchair", "side_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["round", "oval", "rectangular", "square", "organic"],
      base_type: ["pedestal", "four_leg", "cross_support", "frame"],
      material_family: ["wood", "metal", "glass", "stone", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "sofa_front",
      recommendedTags: ["living", "surface"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.coffee_table,
    },
  },
  side_table: {
    category: "side_table",
    label: "Side Table",
    designZone: "living_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["shape", "base_type", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: false,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "bedroom", "open_plan"],
      design_pairings: ["sofa", "armchair", "bed", "table_lamp"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["round", "oval", "rectangular", "square", "organic"],
      base_type: ["pedestal", "four_leg", "cross_support", "frame"],
      material_family: ["wood", "metal", "glass", "stone", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "adjacent_surface",
      recommendedTags: ["surface", "accent"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.side_table,
    },
  },
  tv_console: {
    category: "tv_console",
    label: "TV Console",
    designZone: "living_zone",
    anchorRole: "media_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "shape",
      "base_type",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["brand_tier", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["living_room", "family_room", "open_plan"],
      design_pairings: ["sofa", "rug", "floor_lamp", "side_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["rectangular", "oval", "square"],
      base_type: ["frame", "four_leg", "dual_panel"],
      material_family: ["wood", "mixed", "metal"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["medium", "large", "extra_large"],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "wall_media_storage",
      recommendedTags: ["media", "storage", "living"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.tv_console,
    },
  },
  dining_bench: {
    category: "dining_bench",
    label: "Dining Bench",
    designZone: "dining_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "seat_capacity",
      "size_class",
      "shape",
      "base_type",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: [
      "variant",
      "brand_tier",
      "material_mix",
      "style_secondary",
      "design_era",
      "compatibility",
      "bundle_metadata",
      "design_pairings",
    ],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["dining_room", "open_plan"],
      design_pairings: ["dining_table", "dining_rug", "pendant_light", "sideboard"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["rectangular", "oval", "organic"],
      base_type: ["dual_panel", "frame", "four_leg", "pedestal"],
      material_family: ["mixed", "wood", "upholstered", "fabric", "leather"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "dining_room",
      placementProfile: "table_side_seating",
      recommendedTags: ["dining", "bench-secondary"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS, "seat_capacity"],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.dining_bench,
    },
  },
  bed: {
    category: "bed",
    label: "Bed",
    designZone: "sleeping_zone",
    anchorRole: "bed_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["upholstery_type", "headboard_style", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["bedroom"],
      design_pairings: ["nightstand", "table_lamp", "rug", "dresser"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["upholstered", "wood", "metal", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "bedroom",
      placementProfile: "wall_anchor",
      recommendedTags: ["sleeping", "anchor"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.bed,
    },
  },
  nightstand: {
    category: "nightstand",
    label: "Nightstand",
    designZone: "sleeping_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["base_type", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: false,
        center_room_preferred: false,
      },
      room_compatibility: ["bedroom"],
      design_pairings: ["bed", "table_lamp"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["wood", "metal", "glass", "stone", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "bedroom",
      placementProfile: "bedside",
      recommendedTags: ["sleeping", "bedside"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.nightstand,
    },
  },
  desk: {
    category: "desk",
    label: "Desk",
    designZone: "workspace_zone",
    anchorRole: "desk_anchor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["shape", "base_type", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: true,
        clearance_sensitive: true,
        center_room_preferred: false,
      },
      room_compatibility: ["office", "home_office", "bedroom"],
      design_pairings: ["office_chair", "table_lamp", "bookshelf"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["rectangular", "square", "organic"],
      base_type: ["four_leg", "trestle", "frame", "cross_support"],
      material_family: ["wood", "metal", "glass", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "home_office",
      placementProfile: "wall_or_window",
      recommendedTags: ["workspace", "anchor"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.desk,
    },
  },
  office_chair: {
    category: "office_chair",
    label: "Office Chair",
    designZone: "workspace_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: false,
        center_room_preferred: false,
      },
      room_compatibility: ["office", "home_office"],
      design_pairings: ["desk"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      material_family: ["upholstered", "mesh", "leather", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "home_office",
      placementProfile: "desk_adjacent",
      recommendedTags: ["workspace", "seating"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.office_chair,
    },
  },
  rug: {
    category: "rug",
    label: "Rug",
    designZone: "living_zone",
    anchorRole: "secondary",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "size_class",
      "shape",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["pattern", "pile_height", "style_secondary"],
    defaults: {
      placement_rules: {
        floor_only: true,
        wall_snappable: false,
        clearance_sensitive: false,
        center_room_preferred: true,
      },
      room_compatibility: ["living_room", "bedroom", "dining_room"],
      design_pairings: ["sofa", "coffee_table", "bed", "dining_table"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["rectangular", "round", "oval", "square"],
      material_family: ["fabric", "wool", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: [...SIZE_CLASSES],
    },
    autoMetadata: {
      roomType: "living_room",
      placementProfile: "zone_anchor",
      recommendedTags: ["soft-furnishing", "floor-layer"],
    },
    validationRules: {
      positiveNumberFields: ["price_usd", "dimensions.width_cm", "dimensions.depth_cm"],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.rug,
    },
  },
  pendant_light: {
    category: "pendant_light",
    label: "Pendant Light",
    designZone: "dining_zone",
    anchorRole: "decor",
    requiredFields: [
      "brand",
      "product_family",
      "product_name",
      "price_usd",
      "price_band",
      "dimensions.width_cm",
      "dimensions.depth_cm",
      "dimensions.height_cm",
      "size_class",
      "material_family",
      "style_cluster",
      "color_family",
      "tone",
    ],
    optionalFields: ["shape", "style_secondary", "design_era"],
    defaults: {
      placement_rules: {
        floor_only: false,
        wall_snappable: false,
        clearance_sensitive: false,
        center_room_preferred: true,
      },
      room_compatibility: ["dining_room", "living_room", "bedroom"],
      design_pairings: ["dining_table", "sideboard"],
      ai_flags: COMMON_AI_FLAGS,
    },
    enums: {
      shape: ["round", "oval", "rectangular", "square", "organic"],
      material_family: ["metal", "glass", "fabric", "mixed"],
      style_cluster: [...STYLE_CLUSTERS],
      color_family: [...COLOR_FAMILIES],
      tone: [...TONES],
      size_class: ["small", "medium", "large"],
    },
    autoMetadata: {
      roomType: "dining_room",
      placementProfile: "over_anchor",
      recommendedTags: ["lighting", "ceiling"],
    },
    validationRules: {
      positiveNumberFields: [...COMMON_POSITIVE_FIELDS],
      publishRequiresAssetLink: true,
      designPairingRules: DESIGN_PAIRING_RULES.pendant_light,
    },
  },
};

export function getCatalogPreset(category: string | null | undefined) {
  if (!category) return null;
  return catalogCategoryPresets[category as CatalogPresetCategory] ?? null;
}

export function getValueAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function mergeNestedDefaults(base: Record<string, unknown>, next: Record<string, unknown>) {
  return {
    ...base,
    ...next,
  };
}

export function applyPresetDefaults<T extends Record<string, unknown>>(
  draft: T,
  preset: CatalogCategoryPreset
): T {
  return {
    ...draft,
    category: draft.category ?? preset.category,
    design_zone: draft.design_zone ?? preset.designZone,
    anchor_role: draft.anchor_role ?? preset.anchorRole,
    room_compatibility:
      Array.isArray(draft.room_compatibility) && draft.room_compatibility.length > 0
        ? draft.room_compatibility
        : [...(preset.defaults.room_compatibility ?? [])],
    design_pairings:
      Array.isArray(draft.design_pairings) && draft.design_pairings.length > 0
        ? draft.design_pairings
        : [...(preset.defaults.design_pairings ?? [])],
    placement_rules: mergeNestedDefaults(
      { ...(preset.defaults.placement_rules ?? {}) },
      { ...(draft.placement_rules ?? {}) }
    ),
    ai_flags: mergeNestedDefaults(
      { ...(preset.defaults.ai_flags ?? {}) },
      { ...(draft.ai_flags ?? {}) }
    ),
  };
}

export function getMissingRequiredFields(item: Record<string, unknown>, preset: CatalogCategoryPreset) {
  return preset.requiredFields.filter((fieldPath) => {
    const value = getValueAtPath(item, fieldPath);
    return value == null || value === "";
  });
}

export function buildPresetAutoMetadata(item: Record<string, unknown>, preset: CatalogCategoryPreset) {
  return {
    presetCategory: preset.category,
    presetLabel: preset.label,
    resolvedDesignZone: (item.design_zone as string | undefined) ?? preset.designZone,
    resolvedAnchorRole: (item.anchor_role as string | undefined) ?? preset.anchorRole,
    requiredFieldCount: preset.requiredFields.length,
    controlledFields: Object.keys(preset.enums),
    recommendedRoomCompatibility:
      (Array.isArray(item.room_compatibility) ? item.room_compatibility : undefined) ??
      preset.defaults.room_compatibility ??
      [],
    recommendedDesignPairings:
      (Array.isArray(item.design_pairings) ? item.design_pairings : undefined) ??
      preset.defaults.design_pairings ??
      [],
    roomType: preset.autoMetadata?.roomType ?? null,
    placementProfile: preset.autoMetadata?.placementProfile ?? null,
    recommendedTags: preset.autoMetadata?.recommendedTags ?? [],
  };
}

export function validateCatalogAgainstPreset(
  item: Record<string, unknown>,
  preset: CatalogCategoryPreset,
  mode: CatalogPresetMode = "publish"
): CatalogPresetValidationResult {
  const missingRequiredFields = mode === "publish" ? getMissingRequiredFields(item, preset) : [];
  const invalidEnumFields: CatalogPresetValidationResult["invalidEnumFields"] = [];

  for (const [field, allowedValues] of Object.entries(preset.enums)) {
    if (!allowedValues?.length) continue;
    const value = getValueAtPath(item, field);
    if (typeof value !== "string" || value.trim() === "") continue;
    if (!allowedValues.includes(value)) {
      invalidEnumFields.push({
        field,
        value,
        allowed: [...allowedValues],
      });
    }
  }

  const invalidPositiveNumberFields = (preset.validationRules?.positiveNumberFields ?? []).filter(
    (fieldPath) => {
      const value = getValueAtPath(item, fieldPath);
      if (value == null || value === "") return false;
      return !(typeof value === "number" && Number.isFinite(value) && value > 0);
    }
  );

  const errors = [
    ...missingRequiredFields.map((field) => `Missing required field: ${field}`),
    ...invalidEnumFields.map(
      ({ field, value, allowed }) => `Invalid enum value for ${field}: ${value}. Allowed: ${allowed.join(", ")}`
    ),
    ...invalidPositiveNumberFields.map((field) => `Expected positive number for: ${field}`),
  ];

  if (mode === "publish" && preset.validationRules?.publishRequiresAssetLink && !getValueAtPath(item, "assets.asset_id")) {
    errors.push("Missing required field: assets.asset_id");
  }

  return {
    category: preset.category,
    label: preset.label,
    missingRequiredFields,
    invalidEnumFields,
    invalidPositiveNumberFields,
    errors,
    warnings: [],
    publishable: errors.length === 0,
  };
}
