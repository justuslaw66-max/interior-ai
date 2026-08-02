import assert from "node:assert/strict";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildCanonicalProductContract,
  validateCanonicalProductContract,
} from "@/lib/canonical-product-contract";
import {
  enrichDesignItemProductSnapshot,
  resolveDesignItemVisualProduct,
} from "@/lib/design-item-product-snapshot";
import { inspectProductModelAsset } from "@/lib/product-asset-inspector";
import { validateProductAsset } from "@/lib/product-asset-validation";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { resolveRoomShoppingItems } from "@/lib/room-shopping";
import { projectSharedDesignSnapshot } from "@/lib/shared-design-snapshot";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";

const productId = "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";
const product = CATALOG_ITEMS[productId];
assert.ok(product, "Phase 14 requires the dependable Hugg catalog integration");

const contract = buildCanonicalProductContract(product);
const contractErrors = validateCanonicalProductContract(contract).filter(
  (issue) => issue.severity === "error"
);
assert.deepEqual(contractErrors, [], "canonical product contract must have no blocking errors");
assert.equal(contract.productId, product.id);
assert.ok(contract.merchantId.length > 0);
assert.equal(contract.dimensions.unit, "mm");
assert.equal(contract.variants.length, product.variants.length);
assert.ok(contract.images.length > 0);
assert.ok(contract.asset.modelUrl.length > 0);

const sceneItem: DesignItem = enrichDesignItemProductSnapshot({
  instanceId: "phase14-scene-object-001",
  productId: product.id,
  variantId: product.defaultVariantId,
  position: [1.25, 0, -0.75],
  rotationY: Math.PI / 4,
  includeInCheckout: true,
});
assert.ok(sceneItem.productSnapshot, "catalog placement must capture an immutable visual snapshot");
assert.equal(sceneItem.productSnapshot?.productId, product.id);
assert.equal(sceneItem.productSnapshot?.variantId, sceneItem.variantId);
assert.deepEqual(sceneItem.productSnapshot?.dimensionsMm, product.dimsMm);
const serializedProductSnapshot = JSON.stringify(sceneItem.productSnapshot);
for (const commerceKey of ["commerce", "price", "stock", "delivery", "purchaseUrl", "affiliateUrl"]) {
  assert.equal(
    serializedProductSnapshot.includes(commerceKey),
    false,
    `saved visual snapshot must not bake in ${commerceKey}`
  );
}

const snapshot: DesignSnapshot = {
  version: 3,
  activeRoomId: "phase14-room",
  title: "Phase 14 Product Flow",
  style: "modern",
  budget: "mid",
  lightingPreset: "soft_daylight",
  notes: "Product lifecycle regression",
  rooms: [
    {
      id: "phase14-room",
      name: "Living Room",
      roomType: "living",
      geometry: { width: 5, depth: 4, wallThickness: 0.12, height: 2.7 },
      items: [sceneItem],
      zones: [],
      savedViews: [],
    },
  ],
};

const reloaded = storedToSnapshot(snapshotToStored(snapshot));
const reloadedItem = reloaded.rooms[0].items[0];
assert.equal(reloadedItem.instanceId, sceneItem.instanceId, "scene object ID must survive reload");
assert.deepEqual(reloadedItem.position, sceneItem.position, "design transform must survive reload");
assert.equal(reloadedItem.rotationY, sceneItem.rotationY);
assert.deepEqual(reloadedItem.productSnapshot, sceneItem.productSnapshot);

const currentPurchaseUrl = "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table?phase14=live";
const currentPrice = 887;
const changedLiveProduct = {
  ...product,
  title: "Current live Hugg listing",
  metadata: { ...product.metadata, priceUsd: currentPrice, currencyCode: "USD" },
  commerce: {
    type: "affiliate" as const,
    data: {
      url: currentPurchaseUrl,
      retailer: "Castlery",
      priceHint: currentPrice,
    },
  },
  variants: product.variants.map((variant) =>
    variant.id === product.defaultVariantId
      ? { ...variant, affiliateUrl: currentPurchaseUrl, priceHint: currentPrice, available: true }
      : variant
  ),
};
const changedCatalog = { [product.id]: changedLiveProduct } as typeof CATALOG_ITEMS;
const visualAfterCatalogChange = resolveDesignItemVisualProduct(reloadedItem, changedCatalog);
assert.ok(visualAfterCatalogChange);
assert.equal(visualAfterCatalogChange.title, sceneItem.productSnapshot?.name);
assert.deepEqual(visualAfterCatalogChange.dimsMm, sceneItem.productSnapshot?.dimensionsMm);

const [currentShoppingLine] = resolveRoomShoppingItems(
  { items: [reloadedItem] },
  changedCatalog
);
assert.equal(currentShoppingLine.title, changedLiveProduct.title);
assert.equal(currentShoppingLine.linePrice, currentPrice);
assert.equal(currentShoppingLine.retailerUrl, currentPurchaseUrl);
assert.equal(currentShoppingLine.hasValidCommerce, true);

const shared = projectSharedDesignSnapshot(reloaded);
assert.deepEqual(shared.rooms[0].items[0].productSnapshot, sceneItem.productSnapshot);
const [sharedShoppingLine] = resolveRoomShoppingItems(
  { items: shared.rooms[0].items },
  changedCatalog
);
assert.equal(sharedShoppingLine.retailerUrl, currentPurchaseUrl);

const persistedBeforeFailure = JSON.stringify(reloaded);
const unavailableVisual = resolveDesignItemVisualProduct(reloadedItem, {} as typeof CATALOG_ITEMS);
assert.ok(unavailableVisual, "old designs must keep rendering after catalog removal");
assert.equal(unavailableVisual.title, sceneItem.productSnapshot?.name);
const [unavailableShoppingLine] = resolveRoomShoppingItems(
  { items: [reloadedItem] },
  {} as typeof CATALOG_ITEMS
);
assert.equal(unavailableShoppingLine.hasValidCommerce, false);
assert.equal(unavailableShoppingLine.priceLabel, "Price unavailable");
assert.equal(JSON.stringify(reloaded), persistedBeforeFailure, "commerce failure must not mutate the design");

const inspection = inspectProductModelAsset(product.assets.modelUrl);
const validation = validateProductAsset({
  item: product,
  contract,
  inspection,
  memoryDisposalVerified: true,
});
assert.deepEqual(validation.qa.blockers, [], "dependable product asset must have no blocking QA issues");
assert.equal(validation.coverage.memoryDisposal, "pass");

console.log("Phase 14 catalog-to-purchase product flow passed.");
