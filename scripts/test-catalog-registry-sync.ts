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

const HAMILTON_SLEEPER_EXPECTATIONS = [
  {
    id: "sofa-real-castlery-hamilton-3-seater-sofa-bed",
    dimensionsCm: { width: 206, depth: 98, height: 86 },
    footprintShape: "rectangular",
  },
  {
    id: "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left",
    dimensionsCm: { width: 296, depth: 171, height: 86 },
    footprintShape: "l_shaped",
  },
  {
    id: "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right",
    dimensionsCm: { width: 296, depth: 171, height: 86 },
    footprintShape: "l_shaped",
  },
] as const;

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

  for (const expected of HAMILTON_SLEEPER_EXPECTATIONS) {
    const source = liveById.get(expected.id);
    const generated = payloadById.get(expected.id);
    assert.ok(source, `${expected.id} must remain present in source YAML`);
    assert.ok(generated, `${expected.id} must remain present in the imported-model API payload`);
    assert.equal(generated.catalog?.shape, source.shape);
    assert.deepEqual(generated.catalog?.roomCompatibility, source.room_compatibility);
    assert.deepEqual(generated.catalog?.spatialAttributes, source.spatial_attributes);
    assert.equal(generated.catalog?.shape, "rectangular");
    assert.deepEqual(generated.catalog?.roomCompatibility, [
      "living_room",
      "family_room",
      "open_plan",
      "bedroom",
    ]);
    assert.equal(
      (generated.catalog?.spatialAttributes as { footprint_shape?: string })
        ?.footprint_shape,
      expected.footprintShape,
    );
    assert.deepEqual(
      {
        width: Number(generated.dimsWmm) / 10,
        depth: Number(generated.dimsDmm) / 10,
        height: Number(generated.dimsHmm) / 10,
      },
      expected.dimensionsCm,
      "Imported-model API payload dimensions must remain unchanged",
    );
    assert.equal(
      Array.isArray(generated.catalog?.variants)
        ? generated.catalog.variants.length
        : 0,
      1,
    );
  }

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
