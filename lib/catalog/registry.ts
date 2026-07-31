import type { CatalogItemSchema } from "../catalog-schema";
import { CATALOG } from "./data";
import { buildCatalogItem } from "./normalize";
import type { Product } from "./product-types";
import { validateCatalogEntries } from "./validate";

function isPlaceholderProduct(product: Product): boolean {
  const buyUrl = String(product.buyUrl ?? "").toLowerCase();
  const shopifyVariantId = String(product.shopifyVariantId ?? "").toLowerCase();
  const variantHasPlaceholderMapping = product.variants.some((variant) =>
    String(variant.shopifyVariantId ?? "").toLowerCase().includes("unspecified")
  );

  return (
    buyUrl.includes("example.com") ||
    buyUrl.includes("unspecified") ||
    shopifyVariantId.includes("unspecified") ||
    variantHasPlaceholderMapping
  );
}

function isRealCatalogProduct(product: Product): boolean {
  if (isPlaceholderProduct(product)) return false;
  return product.id.includes("-real-") || product.id.startsWith("castlery-");
}

const publicCatalogEntries = Object.entries(CATALOG).filter(([, product]) =>
  isRealCatalogProduct(product)
);

export const CATALOG_ITEMS: Record<string, CatalogItemSchema> =
  Object.fromEntries(
    publicCatalogEntries.map(([id, product]) => [
      id,
      buildCatalogItem(product),
    ])
  );

export const CATALOG_ITEMS_MAP = new Map<string, CatalogItemSchema>(
  Object.entries(CATALOG_ITEMS)
);

if (process.env.NODE_ENV !== "production") {
  validateCatalogEntries(publicCatalogEntries, CATALOG_ITEMS);
}
