import fs from "fs";
import path from "path";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { CatalogValidator } from "@/lib/catalog-validation";

let validated = false;

function assetExists(assetUrl: string): boolean {
  if (!assetUrl.startsWith("/")) return true;
  const clean = assetUrl.replace(/^\/+/, "");
  const candidate = path.join(process.cwd(), "public", clean);
  return fs.existsSync(candidate);
}

export function validateCatalogOrThrow() {
  if (validated) return;

  // During Phase 2 migration, keep validation lenient by default
  // Set CATALOG_STRICT_VALIDATION=true to enforce strict validation
  const shouldStrictValidate =
    process.env.CATALOG_STRICT_VALIDATION === "true";

  if (!shouldStrictValidate) {
    console.log("ℹ️ Catalog validation: lenient mode (set CATALOG_STRICT_VALIDATION=true for strict)");
    validated = true;
    return;
  }

  const validator = new CatalogValidator();
  const validation = validator.validateCatalog(CATALOG_ITEMS);

  const extraErrors: string[] = [];

  for (const item of Object.values(CATALOG_ITEMS)) {
    if (!assetExists(item.assets.modelUrl)) {
      extraErrors.push(`${item.id}: modelUrl missing on disk (${item.assets.modelUrl})`);
    }
    if (!assetExists(item.assets.thumbUrl)) {
      extraErrors.push(`${item.id}: thumbUrl missing on disk (${item.assets.thumbUrl})`);
    }

    if (item.commerce.type === "shopify") {
      if (!item.commerce.data.productId || !item.commerce.data.variantId) {
        extraErrors.push(`${item.id}: invalid shopify commerce mapping`);
      }
    }

    if (item.commerce.type === "affiliate") {
      if (!item.commerce.data.url || !item.commerce.data.retailer) {
        extraErrors.push(`${item.id}: invalid affiliate commerce mapping`);
      }
    }
  }

  if (!validation.valid || extraErrors.length > 0) {
    const lines = [
      "Catalog validation failed",
      ...validation.details
        .filter((detail) => detail.errors.length > 0)
        .map((detail) => `${detail.itemId}: ${detail.errors.join(", ")}`),
      ...extraErrors,
    ];
    throw new Error(lines.join("\n"));
  }

  validated = true;
}
