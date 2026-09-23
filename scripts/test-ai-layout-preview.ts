import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import { buildAiLayoutPreviewFootprints } from "../lib/design-page-ai-layout-preview";
import type { DesignItem } from "../lib/room-types";

const product = Object.values(CATALOG_ITEMS).find((item) => item.variants.length > 0);
assert.ok(product, "Expected at least one catalog product with variants");

const variant = product.variants[0];
const items: DesignItem[] = [
  {
    instanceId: "preview-1",
    productId: product.id,
    variantId: variant.id,
    position: [1.25, 0, -0.75],
    rotationY: Math.PI / 4,
  },
  {
    instanceId: "missing-product",
    productId: "not-in-catalog",
    variantId: "default",
    position: [0, 0, 0],
  },
];

const previews = buildAiLayoutPreviewFootprints({
  items,
  roomOffset: { x: 3, z: -2 },
});

assert.equal(previews.length, 1);
assert.equal(previews[0].id, "preview-1");
assert.equal(previews[0].productId, product.id);
assert.equal(previews[0].title, product.title);
assert.equal(previews[0].variantLabel, variant.label);
assert.deepEqual(previews[0].position, [4.25, 0.082, -2.75]);
assert.equal(previews[0].rotationY, Math.PI / 4);
assert.ok(previews[0].width > 0);
assert.ok(previews[0].depth > 0);
assert.equal(previews[0].outlinePoints.length, 5);
assert.deepEqual(previews[0].outlinePoints[0], previews[0].outlinePoints[4]);

console.log("AI layout preview checks passed");
