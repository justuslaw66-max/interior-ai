import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID } from "../components/editor/design-page/castleryConfigurationIcons";
import { getFreshCatalogYamlMap } from "../lib/catalog-yaml";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";
import { resolveCastleryVariantAffiliateUrl } from "../lib/catalog/castlery-retailer-links";
import { GLB_CALIBRATION_BY_PRODUCT_ID } from "../lib/design-page-calibration";
import {
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID,
  ORIENTATION_OPTIONS_BY_PRODUCT_ID,
} from "../lib/design-page-model-maps";

const root = process.cwd();
const straightId = "sofa-real-castlery-hamilton-3-seater-sofa-bed";
const leftId =
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left";
const rightId =
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right";

const expected = [
  {
    id: straightId,
    title: "Hamilton 3 Seater Sofa Bed",
    sku: "50441101-PM4002",
    price: 1999,
    closed: { width: 206, depth: 98, height: 86 },
    open: { width: 206, depth: 227, height: 63 },
    orientation: null,
    footprintShape: "rectangular",
  },
  {
    id: leftId,
    title: "Hamilton Chaise Sectional Sofa Bed",
    sku: "50441102-PM4002",
    price: 3199,
    closed: { width: 296, depth: 171, height: 86 },
    open: { width: 296, depth: 227, height: 86 },
    orientation: "left_facing",
    footprintShape: "l_shaped",
  },
  {
    id: rightId,
    title: "Hamilton Chaise Sectional Sofa Bed",
    sku: "50441103-PM4002",
    price: 3199,
    closed: { width: 296, depth: 171, height: 86 },
    open: { width: 296, depth: 227, height: 86 },
    orientation: "right_facing",
    footprintShape: "l_shaped",
  },
] as const;

const catalog = getFreshCatalogYamlMap();
const affectedEntries = expected.map((item) => catalog.get(item.id));

assert.equal(affectedEntries.filter(Boolean).length, 3);
assert.equal(
  affectedEntries.reduce((count, entry) => count + (entry?.variants?.length ?? 0), 0),
  3,
  "The Hamilton sleeper product and authored variant counts must remain stable",
);

for (const item of expected) {
  const entry = catalog.get(item.id);
  assert.ok(entry, `${item.id} must be discoverable from catalog YAML`);
  assert.equal(entry.status, "published");
  assert.equal(entry.product_family, "Hamilton");
  assert.equal(entry.product_name, item.title);
  assert.equal(entry.price_usd, item.price);
  assert.equal(entry.shape, "rectangular");
  assert.deepEqual(entry.room_compatibility, [
    "living_room",
    "family_room",
    "open_plan",
    "bedroom",
  ]);
  assert.equal(
    (entry.spatial_attributes as { footprint_shape?: string })?.footprint_shape,
    item.footprintShape,
  );
  assert.deepEqual(
    (entry.auto_metadata as { recommendedRoomCompatibility?: string[] })
      ?.recommendedRoomCompatibility,
    entry.room_compatibility,
    "Preset auto-metadata must use the canonical room vocabulary",
  );
  assert.deepEqual(entry.supported_upholstery_codes, [
    "marcel_brilliant_white",
  ]);

  const metadata = entry.configurable_metadata as {
    default_configuration?: string;
    configuration_ui?: {
      options?: string[];
      option_labels?: Record<string, string>;
    };
  };
  assert.equal(metadata.default_configuration, "closed");
  assert.deepEqual(metadata.configuration_ui?.options, [
    "closed",
    "open_sleeper",
  ]);
  assert.equal(metadata.configuration_ui?.option_labels?.open_sleeper, "Open");

  const configurations = entry.configurations as Array<{
    configuration_code?: string;
    visual_bounds_cm?: {
      width?: number;
      depth?: number;
      height?: number;
    };
  }>;
  assert.deepEqual(
    configurations.map((configuration) => configuration.configuration_code),
    ["closed", "open_sleeper"],
  );
  assert.deepEqual(configurations[0]?.visual_bounds_cm, item.closed);
  assert.deepEqual(configurations[1]?.visual_bounds_cm, item.open);

  assert.equal(entry.variants?.length, 1);
  const variant = entry.variants?.[0] as
    | (NonNullable<typeof entry.variants>[number] & { sku?: string })
    | undefined;
  assert.equal(variant?.sku, item.sku);
  assert.equal(variant?.upholstery_code, "marcel_brilliant_white");
  assert.ok(variant?.state_assets?.closed?.model_url);
  assert.ok(variant?.state_assets?.open_sleeper?.model_url);

  const normalizedVariants = normalizeImportedVariants({
    productId: item.id,
    sourceUrl: (entry as { source_url?: string }).source_url,
    variantEntries: entry.variants ?? [],
    sharedUpholsteryOptions: entry.upholstery_options ?? [],
    fallbackThumbnailUrl: entry.assets?.thumbnail_url ?? "",
    fallbackGalleryImages: entry.assets?.gallery_images ?? [],
  });
  assert.deepEqual(
    normalizedVariants.map((normalizedVariant) => normalizedVariant.id),
    [
      `imported-${item.id}-marcel-brilliant-white__marcel-brilliant-white`,
    ],
    "Controlled-vocabulary metadata must not change derived variant identity",
  );

  for (const state of ["closed", "open_sleeper"] as const) {
    const modelUrl: string | undefined =
      variant?.state_assets?.[state]?.model_url;
    assert.ok(modelUrl?.startsWith("/assets/models/sofas/"));
    const modelPath = join(root, "public", modelUrl!.slice(1));
    assert.equal(existsSync(modelPath), true, `${modelUrl} must exist`);
    assert.ok(statSync(modelPath).size > 300_000, `${modelUrl} must not be empty`);
    assert.equal(
      readFileSync(modelPath).subarray(0, 4).toString("ascii"),
      "glTF",
      `${modelUrl} must be a valid binary glTF container`,
    );
  }

  assert.ok(GLB_CALIBRATION_BY_PRODUCT_ID[item.id]);
  assert.ok(CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[item.id]);

  const affiliateUrl = resolveCastleryVariantAffiliateUrl({
    productId: item.id,
    sourceUrl: (entry as { source_url?: string }).source_url,
    authoredAffiliateUrl: variant?.affiliate_url,
    upholsteryCode: variant?.upholstery_code,
    materialType: "Fabric",
  });
  assert.ok(affiliateUrl);
  const parsedAffiliateUrl = new URL(affiliateUrl!);
  assert.equal(parsedAffiliateUrl.hostname, "www.castlery.com");
  assert.equal(
    parsedAffiliateUrl.searchParams.get("material"),
    "performance_brilliant_white",
  );
  assert.equal(
    parsedAffiliateUrl.searchParams.get("orientation"),
    item.orientation,
  );
}

for (const item of expected) {
  assert.ok(
    MODEL_FAMILY_BY_PRODUCT_ID[item.id]?.includes(straightId),
    `${item.id} must resolve the Hamilton family`,
  );
  assert.ok(
    MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[item.id]?.includes(straightId),
    `${item.id} must expose the straight sleeper configuration`,
  );
  assert.ok(
    MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[item.id]?.includes(leftId),
    `${item.id} must expose the chaise sleeper configuration`,
  );
}

assert.equal(MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID[rightId], leftId);
assert.deepEqual(
  ORIENTATION_OPTIONS_BY_PRODUCT_ID[leftId]?.map((option) => option.productId),
  [leftId, rightId],
);
assert.deepEqual(
  ORIENTATION_OPTIONS_BY_PRODUCT_ID[rightId]?.map((option) => option.productId),
  [leftId, rightId],
);

console.log(
  "Hamilton sofa-bed catalog, models, sleeper states, orientation, and retailer links passed.",
);
