import type { CatalogItemSchema } from "../catalog-schema";
import { buildCatalogItem } from "./normalize";
import type { Product } from "./product-types";

export function validateCatalogEntries(
  entries: ReadonlyArray<readonly [string, Product]>,
  items: Record<string, CatalogItemSchema>
): void {
  const errors: string[] = [];

  entries.forEach(([id, product]) => {
    try {
      const item = buildCatalogItem(product);
      if (item.id !== id) {
        errors.push(`${id}: ID mismatch (product.id="${product.id}")`);
      }
      if (!item.variants.find((variant) => variant.id === item.defaultVariantId)) {
        errors.push(`${id}: defaultVariantId "${item.defaultVariantId}" not found in variants`);
      }
      if (item.commerce.type === "not_buyable" && !item.commerce.reason) {
        errors.push(`${id}: not_buyable without reason`);
      }
      if (item.dimsMm.w <= 0 || item.dimsMm.d <= 0 || item.dimsMm.h <= 0) {
        errors.push(`${id}: invalid dimensions (${item.dimsMm.w}×${item.dimsMm.d}×${item.dimsMm.h}mm)`);
      }
    } catch (error) {
      errors.push(`${id}: failed to build - ${error}`);
    }
  });

  const ids = Object.keys(items);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push(`Duplicate IDs found in catalog (${ids.length} total, ${uniqueIds.size} unique)`);
  }

  if (errors.length > 0) {
    console.error(
      "❌ Catalog validation errors:\n" +
        errors.map((error) => `  - ${error}`).join("\n")
    );
  } else {
    console.log(`✅ Catalog validated: ${ids.length} items`);
  }
}
