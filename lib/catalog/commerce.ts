// lib/catalog/commerce.ts
import type { CommerceMapping } from "./types";

export function normalizeCommerce(input: {
  purchaseMode?: "shopify" | "affiliate";
  buyUrl?: string;
  retailer?: string;
  shopifyVariantId?: string;
}): CommerceMapping {
  if (input.purchaseMode === "shopify") {
    if (!input.shopifyVariantId) return { type: "not_buyable", reason: "Missing shopifyVariantId" };
    return { type: "shopify", shopifyVariantId: input.shopifyVariantId, retailer: "Shopify" };
  }
  if (input.purchaseMode === "affiliate") {
    if (!input.buyUrl || !input.retailer) return { type: "not_buyable", reason: "Missing affiliate url/retailer" };
    return { type: "affiliate", url: input.buyUrl, retailer: input.retailer };
  }
  return { type: "not_buyable", reason: "No purchase mode" };
}
