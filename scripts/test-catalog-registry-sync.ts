import assert from "node:assert/strict";

import { CATEGORY_DEFAULTS } from "../lib/catalog-schema";
import {
  getAllCatalogYamlEntries,
  getFreshCatalogYamlMap,
  type CatalogYamlEntry,
} from "../lib/catalog-yaml";
import {
  isDraftCatalogEntry,
  isLiveCatalogEntry,
} from "../lib/catalog-publication";
import { buildImportedModelsPayload } from "../lib/catalog/imported-models-payload";

function getAssetId(entry: CatalogYamlEntry): string {
  return String(entry.assets?.asset_id ?? "").trim();
}

function getCategory(entry: CatalogYamlEntry): string {
  return String(entry.category ?? "").trim();
}

const CATEGORY_ALIASES: Record<string, string> = {
  armchair: "accent_chair",
  sectional_sofa: "sofa",
};

function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category] ?? category;
}

async function runRegistrySyncAudit(): Promise<void> {
  const yamlMap = getFreshCatalogYamlMap();
  const allEntries = getAllCatalogYamlEntries();
  const validCategories = new Set(Object.keys(CATEGORY_DEFAULTS));
  const missingAssetIds = allEntries.filter((entry) => !getAssetId(entry));
  const invalidCategories = allEntries
    .map((entry) => ({
      id: getAssetId(entry),
      category: getCategory(entry),
      file: entry.file_path,
    }))
    .filter(({ category }) => !validCategories.has(normalizeCategory(category)));

  assert.deepEqual(
    missingAssetIds.map((entry) => entry.file_path),
    [],
    "Every catalog YAML entry must declare assets.asset_id"
  );
  assert.deepEqual(
    invalidCategories,
    [],
    `Catalog YAML categories must match the canonical schema: ${Array.from(validCategories).join(", ")}`
  );
  assert.equal(
    yamlMap.size,
    allEntries.length,
    "Catalog YAML asset IDs must be unique"
  );

  const liveEntries = Array.from(yamlMap.values()).filter(isLiveCatalogEntry);
  const draftEntries = Array.from(yamlMap.values()).filter(isDraftCatalogEntry);
  const liveById = new Map(liveEntries.map((entry) => [getAssetId(entry), entry]));
  const draftIds = new Set(draftEntries.map(getAssetId));

  const payload = await buildImportedModelsPayload();
  const payloadById = new Map(
    payload.models.map((model) => [String(model.id ?? "").trim(), model])
  );

  const missingLiveIds = Array.from(liveById.keys()).filter(
    (id) => !payloadById.has(id)
  );
  const leakedDraftIds = Array.from(draftIds).filter((id) => payloadById.has(id));
  const unknownPayloadIds = Array.from(payloadById.keys()).filter(
    (id) => !liveById.has(id)
  );
  const categoryMismatches = Array.from(liveById.entries()).flatMap(
    ([id, entry]) => {
      const payloadCategory = String(
        payloadById.get(id)?.catalog?.category ?? ""
      ).trim();
      const yamlCategory = normalizeCategory(getCategory(entry));
      const normalizedPayloadCategory = normalizeCategory(payloadCategory);
      return normalizedPayloadCategory === yamlCategory
        ? []
        : [{ id, yamlCategory, payloadCategory: normalizedPayloadCategory }];
    }
  );
  const liveSofaEntries = Array.from(liveById.entries()).filter(
    ([, entry]) => normalizeCategory(getCategory(entry)) === "sofa"
  );
  const invalidSofaSeatCapacities = liveSofaEntries.flatMap(([id, entry]) => {
    const seatCapacity = Number(entry.seat_capacity);
    return Number.isInteger(seatCapacity) && seatCapacity > 0
      ? []
      : [{ id, seatCapacity: entry.seat_capacity }];
  });
  const sofaVariantSeatCapacityMismatches = liveSofaEntries.flatMap(
    ([id, entry]) => {
      const productSeatCapacity = Number(entry.seat_capacity);
      return (entry.variants ?? []).flatMap((variant) => {
        if (variant.seat_capacity == null) return [];
        const variantSeatCapacity = Number(variant.seat_capacity);
        return variantSeatCapacity === productSeatCapacity
          ? []
          : [{
              id,
              variant: String(variant.variant ?? "").trim(),
              productSeatCapacity,
              variantSeatCapacity,
            }];
      });
    }
  );
  const sofaPayloadSeatCapacityMismatches = liveSofaEntries.flatMap(
    ([id, entry]) => {
      const yamlSeatCapacity = Number(entry.seat_capacity);
      const payloadSeatCapacity = Number(
        payloadById.get(id)?.catalog?.seatCapacity
      );
      return payloadSeatCapacity === yamlSeatCapacity
        ? []
        : [{ id, yamlSeatCapacity, payloadSeatCapacity }];
    }
  );

  assert.deepEqual(
    missingLiveIds,
    [],
    "Every live catalog YAML entry must appear in the imported runtime payload"
  );
  assert.deepEqual(
    leakedDraftIds,
    [],
    "Draft catalog YAML entries must not appear in the imported runtime payload"
  );
  assert.deepEqual(
    unknownPayloadIds,
    [],
    "Imported runtime payload entries must originate from live catalog YAML"
  );
  assert.deepEqual(
    categoryMismatches,
    [],
    "Runtime payload categories must match catalog YAML"
  );
  assert.deepEqual(
    invalidSofaSeatCapacities,
    [],
    "Every live sofa and sectional must declare a positive integer seat_capacity"
  );
  assert.deepEqual(
    sofaVariantSeatCapacityMismatches,
    [],
    "Sofa variant seat_capacity values must match their product-level seat_capacity"
  );
  assert.deepEqual(
    sofaPayloadSeatCapacityMismatches,
    [],
    "Runtime sofa seatCapacity values must match catalog YAML seat_capacity"
  );

  console.log("Catalog registry sync audit passed.");
  console.log(`- YAML entries: ${allEntries.length}`);
  console.log(`- live entries: ${liveEntries.length}`);
  console.log(`- draft entries: ${draftEntries.length}`);
  console.log(`- runtime payload entries: ${payload.models.length}`);
  console.log(`- mapped sofa entries: ${liveSofaEntries.length}`);
  if (payload.degraded) {
    console.log("- runtime payload source: validated YAML fallback");
  }
}

runRegistrySyncAudit().catch((error) => {
  console.error(error);
  process.exit(1);
});
