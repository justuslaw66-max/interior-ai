import assert from "node:assert/strict";
import {
  buildShareCheckoutLines,
  type CheckoutReadinessRow,
} from "@/lib/share-shopping-csv";

function checkoutRow(
  overrides: Partial<CheckoutReadinessRow> = {}
): CheckoutReadinessRow {
  return {
    instanceId: "instance-1",
    productId: "product-1",
    variantId: "variant-1",
    title: "Test item",
    variantLabel: "Natural",
    imageUrl: null,
    fallbackImageUrl: null,
    priceLabel: "$100",
    quantity: 1,
    linePrice: 100,
    retailerUrl: null,
    retailerLabel: "Retailer",
    commerceMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/1",
    retailerStatusLabel: "Checkout mapping ready",
    includeInCheckout: true,
    cartStatusLabel: "Cart-ready",
    hasValidCommerce: true,
    category: "sofa",
    roomId: "room-1",
    roomName: "Living Room",
    ...overrides,
  };
}

const consolidated = buildShareCheckoutLines([
  checkoutRow({ instanceId: "instance-1", quantity: 12 }),
  checkoutRow({ instanceId: "instance-2", quantity: 14 }),
  checkoutRow({
    instanceId: "affiliate",
    productId: "affiliate-product",
    commerceMode: "affiliate",
    shopifyVariantId: null,
    retailerUrl: "https://retailer.example/item",
  }),
  checkoutRow({
    instanceId: "excluded",
    productId: "excluded-product",
    includeInCheckout: false,
  }),
  checkoutRow({
    instanceId: "unavailable",
    productId: "unavailable-product",
    hasValidCommerce: false,
  }),
]);

assert.deepEqual(
  consolidated.map((line) => line.quantity),
  [20, 6],
  "share checkout should consolidate matching variants and respect the server's per-line limit"
);
assert.ok(
  consolidated.every(
    (line) =>
      line.productId === "product-1" &&
      line.variantId === "variant-1" &&
      line.merchandiseId === "gid://shopify/ProductVariant/1"
  ),
  "only validated, included Shopify mappings may cross the checkout boundary"
);

console.log("Phase 13 Batch 5 sharing and checkout-line tests passed.");
