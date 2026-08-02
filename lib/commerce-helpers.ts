/**
 * Commerce & Cart Reconciliation
 * 
 * Ensures cart items are always buyable and handles missing mappings gracefully.
 * Rules:
 * - Non-buyable items can be in design/adjust modes but not in cart
 * - Missing mappings don't crash the app
 * - Shopify items verify variant availability
 */

import { CatalogItemSchema } from "./catalog-schema";
import { resolveCommerceMapping } from "./catalog-validation";

// ============================================================================
// Cart Item Type
// ============================================================================

export interface CartItem {
  catalogItemId: string;
  variantId: string;
  qty: number;
}

export interface ResolvedCartItem extends CartItem {
  item: CatalogItemSchema;
  buyable: boolean;
  warning?: string;
}

type CatalogItemRef = {
  catalogItemId?: string;
  productId?: string;
  variantId: string;
  qty?: number;
  includeInCheckout?: boolean;
};

type CatalogLookup = Map<string, CatalogItemSchema> | Record<string, CatalogItemSchema>;

function getDetailString(
  details: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = details?.[key];
  return typeof value === "string" ? value : undefined;
}

function resolveCatalogId(item: CatalogItemRef): string | undefined {
  return item.catalogItemId ?? item.productId;
}

function getCatalogItem(
  catalogMap: CatalogLookup,
  id: string | undefined
): CatalogItemSchema | undefined {
  if (!id) return undefined;
  if (catalogMap instanceof Map) {
    return catalogMap.get(id);
  }
  return catalogMap[id];
}

// ============================================================================
// Cart Validation
// ============================================================================

export function validateCartItem(
  item: CatalogItemSchema,
  variantId: string
): {
  buyable: boolean;
  warning?: string;
  commerce?: {
    type: "shopify" | "affiliate";
    url?: string;
    productId?: string;
    variantId?: string;
    retailer?: string;
  };
} {
  // Check variant exists
  if (!item.variants.find((v) => v.id === variantId)) {
    return {
      buyable: false,
      warning: `Variant ${variantId} not found for ${item.title}`,
    };
  }

  // Resolve commerce mapping
  const commerce = resolveCommerceMapping(item);

  if (!commerce.buyable) {
    return {
      buyable: false,
      warning: `${item.title} is not available for purchase`,
    };
  }

  // Build resolved info
  if (commerce.type === "shopify") {
    return {
      buyable: true,
      commerce: {
        type: "shopify",
        productId: getDetailString(commerce.details, "productId"),
        variantId: getDetailString(commerce.details, "variantId"),
      },
    };
  }

  if (commerce.type === "affiliate") {
    return {
      buyable: true,
      commerce: {
        type: "affiliate",
        url: commerce.url,
        retailer: getDetailString(commerce.details, "retailer"),
      },
    };
  }

  return {
    buyable: false,
    warning: `${item.title} is not available for purchase`,
  };
}

export function reconcileCart<T extends CatalogItemRef>(
  cartItems: T[],
  catalogMap: CatalogLookup
): {
  valid: T[];
  invalid: Array<{ item: T; warning: string }>;
} {
  const valid: T[] = [];
  const invalid: Array<{ item: T; warning: string }> = [];

  for (const cartItem of cartItems) {
    const catalogId = resolveCatalogId(cartItem);
    const catalogItem = getCatalogItem(catalogMap, catalogId);

    if (!catalogItem) {
      invalid.push({
        item: cartItem,
        warning: `Catalog item ${catalogId ?? "unknown"} not found`,
      });
      continue;
    }

    const validation = validateCartItem(catalogItem, cartItem.variantId);

    if (!validation.buyable) {
      invalid.push({
        item: cartItem,
        warning: validation.warning || "Item is not buyable",
      });
    } else {
      valid.push(cartItem);
    }
  }

  return { valid, invalid };
}

// ============================================================================
// Buyability Helpers
// ============================================================================

/**
 * Check if item can be added to cart
 */
export function canAddToCart(item: CatalogItemSchema): boolean {
  const commerce = resolveCommerceMapping(item);
  return commerce.buyable;
}

/**
 * Filter items for Buy mode (only show buyable items)
 */
export function getCartVisibleItems(
  items: CatalogItemSchema[]
): CatalogItemSchema[] {
  return items.filter((item) => canAddToCart(item));
}

/**
 * Get user-friendly message about why item isn't buyable
 */
export function getNonBuyableReason(item: CatalogItemSchema): string {
  const commerce = resolveCommerceMapping(item);

  if (commerce.buyable) {
    return "";
  }

  if (commerce.type === "not_buyable") {
    return `${item.title} is not available for purchase.`;
  }

  return `${item.title} is temporarily unavailable.`;
}

// ============================================================================
// Analytics Events
// ============================================================================

export interface CommerceEvent {
  type:
    | "item_viewed_in_buy"
    | "item_added_to_cart"
    | "cart_item_removed"
    | "checkout_started"
    | "affiliate_link_clicked"
    | "non_buyable_attempted";
  catalogItemId: string;
  variantId?: string;
  commerce?: {
    type: string;
    retailer?: string;
  };
  timestamp: number;
}

export function createCommerceEvent(
  type: CommerceEvent["type"],
  item: CatalogItemSchema,
  variantId?: string
): CommerceEvent {
  const commerce = resolveCommerceMapping(item);

  return {
    type,
    catalogItemId: item.id,
    variantId: variantId || item.defaultVariantId,
    commerce:
      commerce.type !== "not_buyable"
        ? {
            type: commerce.type,
            retailer: getDetailString(commerce.details, "retailer"),
          }
        : undefined,
    timestamp: Date.now(),
  };
}
