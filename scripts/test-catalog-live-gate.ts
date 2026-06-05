import assert from "node:assert/strict";

import { buildLiveCatalogPayload } from "../lib/catalog-live";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import type { CatalogYamlEntry } from "../lib/catalog-yaml";

function catalogItem(assetId: string): CatalogItemSchema {
  return {
    id: assetId,
    slug: assetId,
    title: assetId,
    category: "rug",
    dimsMm: { w: 1000, d: 1000, h: 10 },
    dimensionsMm: { w: 1000, d: 1000, h: 10 },
    bounds: {
      type: "aabb",
      size: { w: 1, d: 1, h: 0.01 },
      center: [0, 0.005, 0],
    },
    pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
    defaultRotation: 0,
    placementRules: {
      floorOnly: true,
      wallSnappable: false,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: true,
      snapMarginMm: 0,
    },
    clearanceRules: {
      walkwayMinMm: 0,
      coffeeGapMinMm: 0,
      coffeeGapMaxMm: 0,
      sofaClearanceMm: 0,
      wallClearanceMm: 0,
    },
    styleTags: ["modern"],
    toneTags: ["neutral"],
    roomTags: ["living_room"],
    assets: {
      assetId,
      modelUrl: `/assets/models/${assetId}.glb`,
      thumbUrl: `/assets/thumbs/${assetId}.png`,
      materialsProfile: { preset: "default" },
    },
    variants: [
      {
        id: `${assetId}-default`,
        label: "Default",
        colorHex: "#ffffff",
        thumbnailUrl: `/assets/thumbs/${assetId}.png`,
      },
    ],
    defaultVariantId: `${assetId}-default`,
    commerce: {
      type: "affiliate",
      data: {
        url: "https://castlery.com/sg",
        retailer: "Castlery",
      },
    },
    aiRoles: [],
    tags: [],
    metadata: {},
  };
}

const activeAssetId = "rug-real-castlery-active";
const draftAssetId = "rug-real-castlery-draft";
const legacyNoStatusAssetId = "rug-real-castlery-legacy-no-status";

const payload = buildLiveCatalogPayload({
  catalogItems: {
    [activeAssetId]: catalogItem(activeAssetId),
    [draftAssetId]: catalogItem(draftAssetId),
    [legacyNoStatusAssetId]: catalogItem(legacyNoStatusAssetId),
  },
  yamlEntries: [
    {
      status: "active",
      assets: { asset_id: activeAssetId },
    },
    {
      status: "draft",
      assets: { asset_id: draftAssetId },
    },
    {
      assets: { asset_id: legacyNoStatusAssetId },
    },
  ] as CatalogYamlEntry[],
});

assert.deepEqual(payload.source, "catalog-yaml");
assert(payload.assetIds.includes(activeAssetId), "Active YAML asset should be live");
assert(payload.itemIds.includes(activeAssetId), "Active catalog item should be live");
assert(payload.assetIds.includes(legacyNoStatusAssetId), "No-status YAML asset should remain live-compatible");
assert(payload.itemIds.includes(legacyNoStatusAssetId), "No-status catalog item should remain live-compatible");
assert(!payload.assetIds.includes(draftAssetId), "Draft YAML asset should not be live");
assert(!payload.itemIds.includes(draftAssetId), "Draft catalog item should not be live");

console.log("Catalog live gate checks passed");
