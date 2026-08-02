import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildImportedCatalogItem,
  buildImportedModelOptions,
  type ImportedModelEntry,
} from "../lib/catalog/imported-model-assembly";
import { buildImportedModelsPayload } from "../lib/catalog/imported-models-payload";
import { getFreshCatalogYamlMap } from "../lib/catalog-yaml";
import { isLiveCatalogEntry } from "../lib/catalog-publication";
import { AUBURN_CONFIGURATION_PRODUCT_IDS } from "../lib/design-page-model-maps";
import {
  IMPORTED_PRODUCT_CONFIG_BY_ID,
  IMPORTED_VARIANT_BY_PRODUCT_ID,
  IMPORTED_VARIANTS_BY_PRODUCT_ID,
} from "../lib/design-page-product-data";

const EXPECTED_AUBURN_PRICES: Record<string, number> = {
  "sofa-real-castlery-auburn-performance-fabric-3-seater-sofa": 1738,
  "sofa-real-castlery-auburn-performance-fabric-3-seater-sofa-with-ottoman": 2029,
  "sofa-real-castlery-auburn-performance-fabric-armless-curve-3-seater-sofa": 2697,
  "sofa-real-castlery-auburn-performance-fabric-armless-curve-3-seater-sofa-with-ottoman": 2939,
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left": 2767,
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left-with-ottoman": 3009,
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right": 2767,
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right-with-ottoman": 3009,
  "sofa-real-castlery-auburn-performance-fabric-curve-3-seater-sofa": 2637,
  "sofa-real-castlery-auburn-performance-fabric-curve-3-seater-sofa-with-ottoman": 2889,
  "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional-sofa": 3536,
  "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional-sofa-with-ottoman": 3739,
  "sofa-real-castlery-auburn-performance-fabric-extended-3-seater-sofa": 2437,
  "sofa-real-castlery-auburn-performance-fabric-extended-3-seater-sofa-with-ottoman": 2699,
  "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional-sofa": 4085,
  "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional-sofa-with-ottoman": 4259,
  "sofa-real-castlery-auburn-performance-fabric-sectional-sofa": 2687,
  "sofa-real-castlery-auburn-performance-fabric-sectional-sofa-with-ottoman": 2929,
};

async function main() {
  const catalogMap = getFreshCatalogYamlMap();
  const auburnEntries = Array.from(catalogMap.entries()).filter(
    ([, entry]) => entry.product_family === "Auburn"
  );

  assert.equal(auburnEntries.length, 18, "Auburn should publish all 18 configurations");
  assert.deepEqual(
    new Set(auburnEntries.map(([id]) => id)),
    new Set(AUBURN_CONFIGURATION_PRODUCT_IDS),
    "Auburn catalog IDs and configuration controls must stay aligned"
  );

  for (const [id, entry] of auburnEntries) {
    assert(isLiveCatalogEntry(entry), `${id}: Auburn configuration must be public`);
    assert.equal(entry.price_usd, EXPECTED_AUBURN_PRICES[id], `${id}: stale published price`);
    assert.equal(entry.upholstery_library_ref, "auburn", `${id}: missing Auburn upholstery library`);

    const modelUrl = entry.assets?.model_url;
    if (typeof modelUrl !== "string") {
      assert.fail(`${id}: model URL must be present`);
    }
    assert(modelUrl.startsWith("/"), `${id}: model URL must be a local public URL`);
    assert(
      fs.existsSync(path.join(process.cwd(), "public", modelUrl.replace(/^\/+/, ""))),
      `${id}: public GLB is missing`
    );
  }

  const payload = await buildImportedModelsPayload();
  const assembled = buildImportedModelOptions({
    models: (payload.models ?? []) as ImportedModelEntry[],
    importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
  });
  const auburnOptions = assembled.options.filter(
    (option) => option.catalog?.productFamily === "Auburn"
  );

  assert.equal(auburnOptions.length, 18, "Runtime payload must include all Auburn configurations");
  for (const option of auburnOptions) {
    const item = buildImportedCatalogItem({
      productId: option.id,
      imported: option,
      importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
      importedVariantByProductId: IMPORTED_VARIANT_BY_PRODUCT_ID,
      importedVariantsByProductId: IMPORTED_VARIANTS_BY_PRODUCT_ID,
    });
    assert(item, `${option.id}: runtime catalog item failed to build`);
    assert.equal(item.variants.length, 22, `${option.id}: expected 22 verified upholstery choices`);
  }

  console.log("✅ Auburn public catalog passed: 18 configurations, 22 upholstery choices each");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
