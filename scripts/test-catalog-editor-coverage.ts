import assert from "node:assert/strict";

import { CATALOG_ITEMS } from "../lib/catalog";
import { getFreshCatalogYamlMap, type CatalogYamlEntry } from "../lib/catalog-yaml";
import { isDraftCatalogEntry, isLiveCatalogEntry } from "../lib/catalog-publication";
import {
  buildImportedModelOptions,
  shouldRefreshImportedCatalogItem,
  upsertImportedCatalogItem,
  type ImportedModelEntry,
  type ImportedModelOption,
} from "../lib/catalog/imported-model-assembly";
import { buildImportedModelsPayload } from "../lib/catalog/imported-models-payload";
import { mapToTopCategory, type CatalogTopCategory } from "../lib/catalog/view-builders";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import {
  IMPORTED_PRODUCT_CONFIG_BY_ID,
  IMPORTED_VARIANT_BY_PRODUCT_ID,
  IMPORTED_VARIANTS_BY_PRODUCT_ID,
} from "../lib/design-page-product-data";

const SENTINEL_PRODUCT_IDS = [
  "sofa-real-castlery-dawson-3s",
  "sofa-real-castlery-jaron-3s",
  "dining-real-castlery-kelsey-marble-160",
  "dining-real-castlery-sloane-bench-150-no-cushion",
  "tv-real-castlery-casa-tv-console-150",
  "armchair-real-castlery-jaron-recliner-armchair",
];

const REQUIRED_TOP_CATEGORIES: CatalogTopCategory[] = [
  "sofa",
  "accent_chair",
  "coffee_table",
  "dining_table",
  "dining_bench",
  "tv_console",
  "ceiling_light",
];

function getYamlAssetId(entry: CatalogYamlEntry): string {
  return String(entry.assets?.asset_id ?? "").trim();
}

function assertHealthyImportedOption(option: ImportedModelOption): void {
  assert(option.id.trim().length > 0, "Imported option should have an id");
  assert(option.modelUrl.trim().length > 0, `${option.id}: missing modelUrl`);
  assert(option.dimsWmm > 0, `${option.id}: missing width`);
  assert(option.dimsDmm > 0, `${option.id}: missing depth`);
  assert(option.dimsHmm > 0, `${option.id}: missing height`);
  assert(option.catalog, `${option.id}: missing mapped catalog metadata`);
}

function shouldPreserveExistingCuratedItem(productId: string, option: ImportedModelOption): boolean {
  const existing = CATALOG_ITEMS[productId];
  const isImportedExisting = Boolean(
    existing && String(existing.defaultVariantId ?? "").startsWith("imported-")
  );
  const optionSupportsConfigurableStates = Boolean(
    option.catalog?.configurableMetadata?.is_configurable ||
      (option.catalog?.configurations?.length ?? 0) > 0
  );
  const isCuratedHuggNestingProduct = /^coffee-real-castlery-hugg-nesting-(square|rectangular|side-table)-performance-/.test(
    productId
  );

  if (
    existing &&
    !isImportedExisting &&
    isCuratedHuggNestingProduct &&
    !optionSupportsConfigurableStates
  ) {
    return true;
  }

  return Boolean(existing && !isImportedExisting && !optionSupportsConfigurableStates);
}

function injectImportedOptions(options: ImportedModelOption[]): void {
  for (const option of options) {
    if (shouldPreserveExistingCuratedItem(option.id, option)) continue;
    if (!shouldRefreshImportedCatalogItem(CATALOG_ITEMS[option.id], option)) continue;

    upsertImportedCatalogItem({
      productId: option.id,
      imported: option,
      importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
      importedVariantByProductId: IMPORTED_VARIANT_BY_PRODUCT_ID,
      importedVariantsByProductId: IMPORTED_VARIANTS_BY_PRODUCT_ID,
    });
  }
}

function dedupeLikeEditorCatalog(items: CatalogItemSchema[]): CatalogItemSchema[] {
  const dedupedByFamily = new Map<string, CatalogItemSchema>();

  for (const item of items) {
    const brand = String(item.metadata?.brand ?? "").trim().toLowerCase();
    const family = String(item.metadata?.productFamily ?? "").trim().toLowerCase();
    const productName = String(item.metadata?.productName ?? item.title ?? "")
      .trim()
      .toLowerCase();
    const dedupeKey = `${brand}|${item.category}|${family}|${productName}`;
    const existing = dedupedByFamily.get(dedupeKey);

    if (!existing || item.variants.length > existing.variants.length) {
      dedupedByFamily.set(dedupeKey, item);
    }
  }

  return Array.from(dedupedByFamily.values());
}

function countTopCategories(items: CatalogItemSchema[]): Partial<Record<CatalogTopCategory, number>> {
  const counts: Partial<Record<CatalogTopCategory, number>> = {};
  for (const item of items) {
    const category = mapToTopCategory(item.category, item);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

async function run(): Promise<void> {
  const yamlMap = getFreshCatalogYamlMap();
  const liveYamlIds = new Set(
    Array.from(yamlMap.entries())
      .filter(([, entry]) => isLiveCatalogEntry(entry))
      .map(([, entry]) => getYamlAssetId(entry))
      .filter(Boolean)
  );
  const draftYamlIds = new Set(
    Array.from(yamlMap.entries())
      .filter(([, entry]) => isDraftCatalogEntry(entry))
      .map(([, entry]) => getYamlAssetId(entry))
      .filter(Boolean)
  );

  assert(liveYamlIds.size > 0, "Live YAML catalog should not be empty");

  const payload = await buildImportedModelsPayload();
  const importedModels = (payload.models ?? []) as ImportedModelEntry[];
  const payloadIds = new Set(importedModels.map((model) => String(model.id ?? "").trim()));
  const leakedDraftIds = Array.from(draftYamlIds).filter((id) => payloadIds.has(id));
  assert.deepEqual(leakedDraftIds, [], "Draft YAML entries must not appear in imported payload");

  const { options } = buildImportedModelOptions({
    models: importedModels,
    importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
  });

  for (const option of options) {
    assertHealthyImportedOption(option);
  }

  const optionIds = new Set(options.map((option) => option.id));
  const missingSentinels = SENTINEL_PRODUCT_IDS.filter((id) => !optionIds.has(id));
  assert.deepEqual(missingSentinels, [], "Sentinel catalog products disappeared from imported options");

  const officialTitleExpectations = new Map([
    ["armchair-real-castlery-mori-performance-fabric-armchair-natural-wood", "Mori Performance Fabric Armchair"],
    ["armchair-real-castlery-owen-armchair", "Owen Armchair"],
    ["armchair-real-castlery-sacha-performance-boucle-armchair", "Sacha Performance Bouclé Armchair"],
    ["armchair-real-castlery-solange-performance-boucle-chair-white-wash-legs", "Solange Performance Bouclé Chair"],
    ["sofa-real-castlery-dawson-chaise-sectional", "Dawson Chaise Sectional Sofa"],
  ]);
  for (const [id, expectedTitle] of officialTitleExpectations) {
    const option = options.find((entry) => entry.id === id);
    assert(option, `${id}: official title fixture disappeared`);
    assert.equal(option.title, expectedTitle, `${id}: imported option should use official product title`);
  }

  const leakedDraftOptions = Array.from(draftYamlIds).filter((id) => optionIds.has(id));
  assert.deepEqual(leakedDraftOptions, [], "Draft YAML entries must not become imported options");

  const minimumOptionCount = Math.max(50, Math.floor(liveYamlIds.size * 0.9));
  assert(
    options.length >= minimumOptionCount,
    `Imported options collapsed: expected at least ${minimumOptionCount}, got ${options.length}`
  );

  injectImportedOptions(options);

  for (const id of [
    "ceiling-real-castlery-cedric-pendant-20cm",
    "ceiling-real-castlery-cedric-pendant-30cm",
  ]) {
    const pendant = CATALOG_ITEMS[id];
    assert(pendant, `${id}: Cedric pendant should be injected into the editor catalog`);
    assert.equal(pendant.category, "pendant_light");
    assert.equal(pendant.metadata?.productFamily, "Cedric");
    assert.equal(pendant.placementRules.ceilingOnly, true);
    assert.equal(pendant.placementRules.floorOnly, false);
    assert.equal(pendant.assets.modelUrl, `/assets/models/${id}.glb`);
    assert(pendant.metadata?.adjustablePendantHeight, `${id}: adjustable height metadata missing`);
    assert.equal(pendant.metadata.adjustablePendantHeight.defaultCm, 120);
  }

  for (const [id, expectedTitle] of officialTitleExpectations) {
    const item = CATALOG_ITEMS[id];
    assert(item, `${id}: imported catalog item was not injected`);
    assert.equal(item.title, expectedTitle, `${id}: editor catalog should use official product title`);
  }

  const editorItems = Object.values(CATALOG_ITEMS);
  const leakedDraftEditorItems = Array.from(draftYamlIds).filter((id) =>
    editorItems.some((item) => item.id === id || item.assets.assetId === id)
  );
  assert.deepEqual(leakedDraftEditorItems, [], "Draft YAML entries must not appear in editor catalog");

  const editorDedupedItems = dedupeLikeEditorCatalog(editorItems);
  const minimumEditorCount = Math.max(50, Math.floor(liveYamlIds.size * 0.55));
  assert(
    editorDedupedItems.length >= minimumEditorCount,
    `Editor-visible catalog collapsed: expected at least ${minimumEditorCount}, got ${editorDedupedItems.length}`
  );

  const categoryCounts = countTopCategories(editorDedupedItems);
  const missingCategories = REQUIRED_TOP_CATEGORIES.filter((category) => (categoryCounts[category] ?? 0) === 0);
  assert.deepEqual(missingCategories, [], "Required editor catalog categories disappeared");

  console.log("Catalog editor coverage gate summary");
  console.log(`- live YAML entries: ${liveYamlIds.size}`);
  console.log(`- imported payload models: ${payload.models?.length ?? 0}`);
  console.log(`- healthy imported options: ${options.length}`);
  console.log(`- editor-visible de-duped items: ${editorDedupedItems.length}`);
  console.log(`- required category counts: ${JSON.stringify(categoryCounts)}`);
  console.log("Catalog editor coverage gate passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
