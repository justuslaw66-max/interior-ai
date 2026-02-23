/**
 * Catalog Validation & Runtime Helpers
 * 
 * Ensures catalog integrity and provides runtime guardrails.
 * Validates on app startup and provides TypeScript safety helpers.
 */

import {
  CatalogItemSchema,
  validateCatalogItem,
  getCategoryDefaults,
  CATEGORY_DEFAULTS,
  PlacementRules,
  ClearanceRules,
  type ProductCategory,
  type StyleTag,
  type RoomTag,
} from "./catalog-schema";

// ============================================================================
// Runtime Validation (Startup Checks)
// ============================================================================

export class CatalogValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Validate and merge item with category defaults
   * Ensures item is complete and valid
   */
  validateAndMerge(item: Partial<CatalogItemSchema>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    merged?: CatalogItemSchema;
  } {
    // Basic validation
    const validation = validateCatalogItem(item);
    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.errors,
        warnings: [],
      };
    }

    // Merge with category defaults
    const category = item.category as ProductCategory;
    const categoryDefaults = getCategoryDefaults(category);

    const merged: CatalogItemSchema = {
      id: item.id!,
      slug: item.slug!,
      title: item.title!,
      category,
      description: item.description,

      // Geometry (required, no defaults)
      dimsMm: item.dimsMm ?? item.dimensionsMm!,
      dimensionsMm: item.dimensionsMm,
      bounds: item.bounds!,
      pivot: item.pivot!,
      defaultRotation: item.defaultRotation ?? 0,

      // Placement rules (merge with defaults)
      placementRules: {
        ...categoryDefaults.placement,
        ...item.placementRules,
      },

      // Clearance rules (merge with defaults)
      clearanceRules: {
        ...categoryDefaults.clearance,
        ...item.clearanceRules,
      },

      // Style
      styleTags: item.styleTags ?? [],
      toneTags: item.toneTags ?? [],
      roomTags: item.roomTags ?? [],
      aiRoles: item.aiRoles ?? categoryDefaults.aiRoles,

      // Assets
      assets: item.assets!,

      // Variants
      variants: item.variants!,
      defaultVariantId: item.defaultVariantId!,

      // Commerce
      commerce: item.commerce!,

      // Metadata
      tags: item.tags ?? [],
      createdAt: item.createdAt ?? Date.now(),
      updatedAt: item.updatedAt ?? Date.now(),
    };

    return {
      valid: true,
      errors: [],
      warnings: this.warnings,
      merged,
    };
  }

  /**
   * Validate entire catalog collection
   * Reports on startup for fast failure
   */
  validateCatalog(items: Record<string, Partial<CatalogItemSchema>>): {
    valid: boolean;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      warnings: number;
    };
    details: Array<{
      itemId: string;
      valid: boolean;
      errors: string[];
      warnings: string[];
    }>;
  } {
    const results: Array<{
      itemId: string;
      valid: boolean;
      errors: string[];
      warnings: string[];
    }> = [];

    for (const [itemId, item] of Object.entries(items)) {
      const validation = this.validateAndMerge(item);
      results.push({
        itemId,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    return {
      valid: results.every((r) => r.valid),
      summary: {
        total: results.length,
        valid: results.filter((r) => r.valid).length,
        invalid: results.filter((r) => !r.valid).length,
        warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
      },
      details: results,
    };
  }
}

// ============================================================================
// Commerce Mapping Helpers
// ============================================================================

export interface ResolvedCommerce {
  type: "shopify" | "affiliate" | "not_buyable";
  buyable: boolean;
  url?: string;
  details?: any;
}

export function resolveCommerceMapping(
  item: CatalogItemSchema
): ResolvedCommerce {
  const { commerce } = item;

  if (!commerce) {
    return { type: "not_buyable", buyable: false };
  }

  switch (commerce.type) {
    case "shopify":
      return {
        type: "shopify",
        buyable: commerce.data.available !== false,
        details: {
          productId: commerce.data.productId,
          variantId: commerce.data.variantId,
        },
      };

    case "affiliate":
      return {
        type: "affiliate",
        buyable: true,
        url: commerce.data.url,
        details: {
          retailer: commerce.data.retailer,
          priceHint: commerce.data.priceHint,
        },
      };

    case "not_buyable":
      return {
        type: "not_buyable",
        buyable: false,
      };

    default:
      return { type: "not_buyable", buyable: false };
  }
}

// ============================================================================
// Rule Application (Constraint Engine Integration)
// ============================================================================

export function getEffectivePlacementRules(
  item: CatalogItemSchema,
  category: ProductCategory = item.category
): PlacementRules {
  const categoryDefaults = getCategoryDefaults(category);
  return {
    ...categoryDefaults.placement,
    ...item.placementRules,
  };
}

export function getEffectiveClearanceRules(
  item: CatalogItemSchema,
  category: ProductCategory = item.category
): ClearanceRules {
  const categoryDefaults = getCategoryDefaults(category);
  return {
    ...categoryDefaults.clearance,
    ...item.clearanceRules,
  };
}

// ============================================================================
// Dimension & Bounds Helpers
// ============================================================================

export function getDimensionsMeters(item: CatalogItemSchema) {
  const dimsMm = item.dimsMm ?? item.dimensionsMm;
  if (!dimsMm) {
    return { w: 0, d: 0, h: 0 };
  }
  return {
    w: dimsMm.w / 1000,
    d: dimsMm.d / 1000,
    h: dimsMm.h / 1000,
  };
}

export function getBoundsMeters(item: CatalogItemSchema) {
  return item.bounds;
}

export function getBoundsSize(item: CatalogItemSchema) {
  const bounds = item.bounds;
  if (bounds.type === "aabb") {
    return { w: bounds.size.w, d: bounds.size.d, h: bounds.size.h };
  }
  return { w: 0, d: 0, h: 0 };
}

// ============================================================================
// Variant Helpers
// ============================================================================

export function getVariant(item: CatalogItemSchema, variantId: string) {
  return item.variants.find((v) => v.id === variantId);
}

export function getDefaultVariant(item: CatalogItemSchema) {
  return getVariant(item, item.defaultVariantId);
}

// ============================================================================
// AI Role Helpers (for suggestions & automation)
// ============================================================================

export function hasAiRole(item: CatalogItemSchema, role: string): boolean {
  return item.aiRoles?.includes(role) ?? false;
}

export function getItemsByAiRole(
  items: CatalogItemSchema[],
  role: string
): CatalogItemSchema[] {
  return items.filter((item) => hasAiRole(item, role));
}

// ============================================================================
// Filtering & Query Helpers
// ============================================================================

export function getItemsByCategory(
  items: CatalogItemSchema[],
  category: ProductCategory
): CatalogItemSchema[] {
  return items.filter((item) => item.category === category);
}

export function getBuyableItems(items: CatalogItemSchema[]): CatalogItemSchema[] {
  return items.filter((item) => {
    const commerce = resolveCommerceMapping(item);
    return commerce.buyable;
  });
}

export function getNotBuyableItems(
  items: CatalogItemSchema[]
): CatalogItemSchema[] {
  return items.filter((item) => {
    const commerce = resolveCommerceMapping(item);
    return !commerce.buyable;
  });
}

// ============================================================================
// Suggestion Helpers (for ghost items, recommendations)
// ============================================================================

export function findBestByDimension(
  items: CatalogItemSchema[],
  category: ProductCategory,
  targetWidthMeters?: number
): CatalogItemSchema | null {
  const candidates = getItemsByCategory(items, category);
  if (candidates.length === 0) return null;
  if (!targetWidthMeters) return candidates[0];

  let best = candidates[0];
  const bestDims = best.dimsMm ?? best.dimensionsMm;
  if (!bestDims) return best;
  let bestDelta = Math.abs(bestDims.w - targetWidthMeters * 1000);

  for (const candidate of candidates) {
    const dims = candidate.dimsMm ?? candidate.dimensionsMm;
    if (!dims) continue;
    const delta = Math.abs(dims.w - targetWidthMeters * 1000);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }

  return best;
}

export function findByStyleTags(
  items: CatalogItemSchema[],
  tags: StyleTag[]
): CatalogItemSchema[] {
  return items.filter((item) =>
    tags.some((tag) => item.styleTags.includes(tag))
  );
}

export function findByRoomTag(
  items: CatalogItemSchema[],
  tag: RoomTag
): CatalogItemSchema[] {
  return items.filter((item) => item.roomTags.includes(tag));
}
