import { CATALOG_ITEMS } from "@/lib/catalog";
import { CatalogValidator } from "@/lib/catalog-validation";

export function initializeCatalog() {
  const validator = new CatalogValidator();
  const validation = validator.validateCatalog(CATALOG_ITEMS);

  console.log(`📦 Catalog Status:`);
  console.log(`   Total: ${validation.summary.total}`);
  console.log(`   Valid: ${validation.summary.valid}`);
  console.log(`   Errors: ${validation.summary.total - validation.summary.valid}`);

  if (!validation.valid) {
    console.warn(`\n⚠️  Catalog validation found issues:`);
    for (const detail of validation.details) {
      if (detail.errors.length > 0) {
        console.warn(`   ${detail.itemId}: ${detail.errors.join(", ")}`);
      }
    }
  } else {
    console.log(`\n✅ Catalog passed validation`);
  }

  return validation;
}
