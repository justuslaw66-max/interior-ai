/**
 * Catalog Schema - Single Source of Truth
 * 
 * Defines the canonical shape and validation contract for all catalog items.
 * This is the source of truth for how items behave in the editor and in commerce.
 */

// ============================================================================
// Identity & Categorization
// ============================================================================

export type ProductCategory =
  | "sofa"
  | "ottoman"
  | "accessory"
  | "rug"
  | "coffee_table"
  | "dining_table"
  | "dining_bench"
  | "accent_chair"
  | "floor_lamp"
  | "tv_console"
  | "sideboard"
  | "bookshelf"
  | "side_table"
  | "wall_art"
  | "storage"
  | "shelving"
  | "other";

// ============================================================================
// Geometry & Spatial
// ============================================================================

export interface DimensionsMeters {
  w: number; // width in meters
  d: number; // depth in meters
  h: number; // height in meters
}

export interface DimensionsMm {
  w: number; // width in millimeters
  d: number; // depth in millimeters
  h: number; // height in millimeters
}

export interface BoundsAABB {
  type: "aabb";
  size: DimensionsMeters; // extent in each axis (meters)
  center: [number, number, number]; // center point
}

export type Bounds = BoundsAABB; // extensible for OBB later

export interface PivotInfo {
  offsetX: number; // pivot offset from center (meters)
  offsetZ: number;
  groundAligned: boolean; // true if Y=0 is floor
}

// ============================================================================
// Placement Rules (Editor Behavior)
// ============================================================================

export interface PlacementRules {
  floorOnly: boolean; // must be on floor
  wallSnappable: boolean; // can snap to walls
  wallMountable: boolean; // can mount on wall (currently not used)
  minWallGapMm: number; // minimum distance from wall in mm
  allowRugOverlap: boolean; // can overlap with rugs
  snapMarginMm: number; // snap detection margin
}

// ============================================================================
// Clearance Rules (Constraint Engine)
// ============================================================================

export interface ClearanceRules {
  walkwayMinMm: number; // minimum walkway clearance required
  coffeeGapMinMm: number; // min distance to coffee table
  coffeeGapMaxMm: number; // max distance to coffee table
  sofaClearanceMm: number; // minimum clearance from sofa
  wallClearanceMm: number; // minimum clearance from walls
}

// ============================================================================
// Style & Metadata
// ============================================================================

export type StyleTag =
  | "minimalist"
  | "luxe"
  | "modern"
  | "scandinavian"
  | "japandi"
  | "industrial"
  | "bohemian"
  | "traditional"
  | "eclectic";

export type ToneTag =
  | "warm"
  | "cool"
  | "neutral"
  | "earth"
  | "saturated"
  | "muted"
  | "bright"
  | "dark";

export type RoomTag =
  | "living_room"
  | "bedroom"
  | "home_office"
  | "dining"
  | "entryway"
  | "small_space"
  | "luxury";

// ============================================================================
// Variants (Style/Color Options)
// ============================================================================

export interface ProductVariant {
  id: string; // e.g., "sofa-real-castlery-dawson-3s-navagio_seagull"
  label: string; // e.g., "Gray"
  colorHex: string; // e.g., "#808080"
  thumbnailUrl: string; // variant-specific thumb
  galleryImages?: string[];
  dimensionsMm?: DimensionsMm;
  shopifyVariantId?: string;
  affiliateUrl?: string;
  priceHint?: number;
  available?: boolean;
  finishCode?: string;
  finishLabel?: string;
  materialType?: "Fabric" | "Leather";
  swatchGroup?: string;
  swatchHex?: string;
  collectionType?: string; // "stocked" | "custom" from upholstery options
  renderAssets?: {
    baseColorMap?: string;
    normalMap?: string;
    roughnessMap?: string;
    tileScale?: { x?: number; y?: number };
  };
}

// ============================================================================
// Commerce & Buyability
// ============================================================================

export interface ShopifyMapping {
  productId: string;
  variantId: string;
  available: boolean; // manual override for availability
}

export interface AffiliateMapping {
  url: string;
  retailer: string; // e.g., "wayfair", "amazon"
  priceHint?: number; // approximate price in SGD
  trackingTag?: string; // affiliate tracking
}

export type CommerceMapping =
  | { type: "shopify"; data: ShopifyMapping }
  | { type: "affiliate"; data: AffiliateMapping }
  | { type: "not_buyable"; reason?: string };

// ============================================================================
// Rendering & Assets
// ============================================================================

export interface MaterialsProfile {
  preset: string; // reference to material preset (e.g., "scandi-oak")
  roughness?: number;
  metalness?: number;
}

export interface AssetReferences {
  assetId: string; // Reference to ModelAsset registry entry
  modelUrl: string; // GLB file
  thumbUrl: string;
  materialsProfile: MaterialsProfile;
}

// ============================================================================
// Complete Catalog Item (Full Contract)
// ============================================================================

export interface CatalogItemSchema {
  // Identity
  id: string;
  slug: string;
  title: string;
  category: ProductCategory;
  description?: string;

  // Geometry
  dimsMm: DimensionsMm;
  dimensionsMm?: DimensionsMm; // legacy alias (deprecated)
  bounds: Bounds;
  pivot: PivotInfo;
  defaultRotation: number; // radians, typically 0

  // Behavior
  placementRules: PlacementRules;
  clearanceRules: ClearanceRules;

  // Style & AI
  styleTags: StyleTag[];
  toneTags: ToneTag[];
  roomTags: RoomTag[];

  // Rendering
  assets: AssetReferences;
  variants: ProductVariant[];
  defaultVariantId: string; // must exist in variants array

  // Commerce
  commerce: CommerceMapping;

  // Metadata
  metadata?: {
    brand?: string;
    modelLabel?: string;
    productFamily?: string;
    productName?: string;
    importedVariantPipelineRevision?: string;
    // Catalog YAML enrichment fields
    styleCluster?: string;
    styleSecondary?: string;
    designEra?: string;
    colorFamily?: string;
    tone?: string;
    priceUsd?: number;
    priceBand?: string;
    seatCapacity?: number;
    materialFamily?: string;
    designPairings?: string[];
    compatibility?: unknown;
    bundleMetadata?: unknown;
    galleryImages?: string[];
  };
  aiRoles?: string[]; // e.g., ["seating_anchor", "living_room_focal_point"]
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

// ============================================================================
// Category Defaults (Fallback Values)
// ============================================================================

export interface CategoryDefaults {
  dimsMm?: DimensionsMm;
  placement: PlacementRules;
  clearance: ClearanceRules;
  aiRoles: string[];
  allowRugOverlap?: boolean;
}

export const CATEGORY_DEFAULTS: Record<ProductCategory, CategoryDefaults> = {
  sofa: {
    dimsMm: { w: 2200, d: 900, h: 820 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: true,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 800,
      coffeeGapMinMm: 400,
      coffeeGapMaxMm: 900,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["seating_anchor", "living_room_focal"],
  },
  ottoman: {
    dimsMm: { w: 900, d: 650, h: 450 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 100,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 500,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 250,
      wallClearanceMm: 100,
    },
    aiRoles: ["seating_accessory", "seating_secondary"],
  },
  accessory: {
    dimsMm: { w: 900, d: 650, h: 450 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 100,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 500,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 250,
      wallClearanceMm: 100,
    },
    aiRoles: ["seating_accessory"],
  },
  rug: {
    dimsMm: { w: 2800, d: 2000, h: 20 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 200,
      allowRugOverlap: false,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 0,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 200,
    },
    aiRoles: ["seating_zone_anchor"],
  },
  coffee_table: {
    dimsMm: { w: 1100, d: 600, h: 380 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 200,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 600,
      coffeeGapMinMm: 400,
      coffeeGapMaxMm: 900,
      sofaClearanceMm: 400,
      wallClearanceMm: 200,
    },
    aiRoles: ["seating_functional"],
  },
  dining_table: {
    dimsMm: { w: 2200, d: 1000, h: 760 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 300,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 900,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 300,
    },
    aiRoles: ["dining_anchor"],
  },
  dining_bench: {
    dimsMm: { w: 1500, d: 410, h: 515 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 200,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 900,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 200,
    },
    aiRoles: ["dining_seating"],
  },
  accent_chair: {
    dimsMm: { w: 820, d: 820, h: 900 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: true,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 700,
      coffeeGapMinMm: 300,
      coffeeGapMaxMm: 800,
      sofaClearanceMm: 600,
      wallClearanceMm: 0,
    },
    aiRoles: ["seating_secondary"],
  },
  floor_lamp: {
    dimsMm: { w: 450, d: 450, h: 1650 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 100,
      allowRugOverlap: false,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 0,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 100,
    },
    aiRoles: ["ambient_lighting"],
  },
  tv_console: {
    dimsMm: { w: 2000, d: 420, h: 500 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 900,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 1500,
      wallClearanceMm: 0,
    },
    aiRoles: ["focal_point", "media_center"],
  },
  sideboard: {
    dimsMm: { w: 1800, d: 450, h: 760 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 800,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["functional_storage", "living_storage"],
  },
  bookshelf: {
    dimsMm: { w: 1000, d: 350, h: 2000 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 600,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["vertical_storage"],
  },
  side_table: {
    dimsMm: { w: 500, d: 500, h: 450 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 100,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 600,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 300,
      wallClearanceMm: 100,
    },
    aiRoles: ["functional_accent"],
  },
  wall_art: {
    dimsMm: { w: 900, d: 40, h: 600 },
    placement: {
      floorOnly: false,
      wallSnappable: true,
      wallMountable: true,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 0,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["visual_accent"],
  },
  storage: {
    dimsMm: { w: 1200, d: 500, h: 1200 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 700,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["functional_storage"],
  },
  shelving: {
    dimsMm: { w: 1000, d: 350, h: 1800 },
    placement: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 50,
    },
    clearance: {
      walkwayMinMm: 700,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: ["vertical_display"],
  },
  other: {
    dimsMm: { w: 1000, d: 1000, h: 1000 },
    placement: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: false,
      snapMarginMm: 0,
    },
    clearance: {
      walkwayMinMm: 0,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    aiRoles: [],
  },
};

// ============================================================================
// Validation & Helpers
// ============================================================================

export function getCategoryDefaults(category: ProductCategory): CategoryDefaults {
  return CATEGORY_DEFAULTS[category];
}

export function validateCatalogItem(item: Partial<CatalogItemSchema>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Identity
  if (!item.id) errors.push("Missing id");
  if (!item.slug) errors.push("Missing slug");
  if (!item.title) errors.push("Missing title");
  if (!item.category || !Object.keys(CATEGORY_DEFAULTS).includes(item.category)) {
    errors.push(`Invalid or missing category: ${item.category}`);
  }

  // Geometry
  const dimsMm = item.dimsMm ?? item.dimensionsMm;
  if (!dimsMm) errors.push("Missing dimsMm");
  else {
    if (dimsMm.w <= 0) errors.push("dimsMm.w must be positive");
    if (dimsMm.d <= 0) errors.push("dimsMm.d must be positive");
    if (dimsMm.h <= 0) errors.push("dimsMm.h must be positive");
  }

  if (!item.bounds) errors.push("Missing bounds");
  if (!item.pivot) errors.push("Missing pivot");

  // Assets
  if (!item.assets?.modelUrl) errors.push("Missing assets.modelUrl");
  if (!item.assets?.thumbUrl) errors.push("Missing assets.thumbUrl");

  // Commerce
  if (!item.commerce) errors.push("Missing commerce mapping");
  if (item.commerce?.type === "shopify") {
    if (!item.commerce.data.productId) errors.push("Shopify mapping requires productId");
    if (!item.commerce.data.variantId) errors.push("Shopify mapping requires variantId");
  }
  if (item.commerce?.type === "affiliate") {
    if (!item.commerce.data.url) errors.push("Affiliate mapping requires url");
    if (!item.commerce.data.retailer) errors.push("Affiliate mapping requires retailer");
  }

  // Variants
  if (!item.variants || item.variants.length === 0) {
    errors.push("At least one variant required");
  }
  if (item.defaultVariantId && item.variants) {
    if (!item.variants.find((v) => v.id === item.defaultVariantId)) {
      errors.push(
        `defaultVariantId "${item.defaultVariantId}" not found in variants`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
