import type { CatalogItemSchema } from "../catalog-schema";
import { formatSgd } from "../money-format";
import { resolveCatalogVariant } from "./variant-resolver";

/** The variant's catalog price when the catalog knows one (retailer price hints). */
export function getPriceNumber(item: CatalogItemSchema, variantId?: string): number | null {
  const resolved = resolveCatalogVariant(item, variantId);
  if (resolved.commerce.type === "affiliate") {
    return resolved.commerce.priceHint ?? null;
  }
  return null;
}

/** What a product's price line says: the price in formatSgd, or where it is bought. */
export function getPriceLabel(item: CatalogItemSchema, variantId?: string): string {
  const resolved = resolveCatalogVariant(item, variantId);
  if (resolved.commerce.type === "shopify") {
    return "Buy on this site";
  }
  if (resolved.commerce.type === "affiliate") {
    const amount = resolved.commerce.priceHint;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return formatSgd(amount);
    }
    return "External retailer";
  }
  return "External retailer";
}
