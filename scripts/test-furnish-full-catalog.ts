import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import { buildFurnishCatalogItems } from "../lib/useDesignPageImportedModels";

const template = Object.values(CATALOG_ITEMS)[0];
assert(template, "Catalog fixture is required");

const catalogItemsById = {
  "sofa-family-2-seater": {
    ...template,
    id: "sofa-family-2-seater",
    title: "Example 2 Seater Sofa",
    metadata: {
      ...template.metadata,
      productFamily: "Example",
      productName: "Example 2 Seater Sofa",
    },
  },
  "sofa-family-3-seater": {
    ...template,
    id: "sofa-family-3-seater",
    title: "Example 3 Seater Sofa",
    metadata: {
      ...template.metadata,
      productFamily: "Example",
      productName: "Example 3 Seater Sofa",
    },
  },
};

assert.deepEqual(
  buildFurnishCatalogItems(catalogItemsById).map((item) => item.id),
  ["sofa-family-2-seater", "sofa-family-3-seater"],
  "Full catalog mode must preserve every distinct product configuration"
);

console.log("✅ Furnish full catalog preserves distinct product configurations");
