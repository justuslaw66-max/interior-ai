import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { DesignItem } from "../lib/room-types";
import {
  buildShoppingList,
  cheaperSwapFor,
  productCountLabel,
  retailerCheckoutNote,
  retailerDisplayName,
  retailerSite,
  type ShoppingListRoom,
} from "../lib/shopping-list";

// The Shopping list (audit finding FU8): the whole design's products, one group per shop, one total.

type Catalog = typeof CATALOG_ITEMS;
const catalog: Catalog = { ...CATALOG_ITEMS };
const ids = Object.keys(CATALOG_ITEMS);
const castlery = ids.filter((id) => CATALOG_ITEMS[id].commerce.type === "affiliate");
assert.ok(castlery.length >= 3, "The local catalogue has Castlery products.");
const [firstId, secondId, thirdId] = castlery;

// A product spelled "Castlery", as two imported catalogues spell it, and one sold here through Shopify.
const base = CATALOG_ITEMS[secondId];
if (base.commerce.type !== "affiliate") throw new Error("expected an affiliate product");
catalog["spelled-castlery"] = {
  ...base,
  id: "spelled-castlery",
  title: "Spelled Castlery Table",
  commerce: { ...base.commerce, data: { ...base.commerce.data, retailer: "Castlery", url: "https://www.castlery.com/sg/products/spelled" } },
};
catalog["sold-here"] = {
  ...base,
  id: "sold-here",
  title: "Sold Here Lamp",
  variants: base.variants.map((variant) => ({ ...variant, affiliateUrl: undefined })),
  commerce: { type: "shopify", data: { productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/1", available: true } },
} as Catalog[string];

let next = 0;
const item = (productId: string, extra: Partial<DesignItem> = {}): DesignItem =>
  ({
    instanceId: `i${++next}`,
    productId,
    variantId: catalog[productId]?.defaultVariantId ?? "default",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    ...extra,
  }) as DesignItem;

const living: ShoppingListRoom = { id: "living", name: "Living Room", items: [item(firstId), item(secondId, { qty: 2 })] };
const dining: ShoppingListRoom = {
  id: "dining",
  name: "Dining",
  items: [
    item(thirdId),
    item("spelled-castlery"),
    item("gone-product", {
      productSnapshot: { name: "Retired Stool", variantLabel: "Oak", assets: { thumbnailUrl: null } },
    } as unknown as Partial<DesignItem>),
  ],
};

// One shop for both spellings, named by the shorter one, with the site it checks out on.
const list = buildShoppingList({ rooms: [living, dining], style: "modern", catalogItems: catalog });
assert.equal(list.retailers.length, 1);
const [shop] = list.retailers;
assert.equal(shop.id, "castlery.com");
assert.equal(shop.name, "Castlery");
assert.deepEqual(shop.lines.map((line) => line.productId), [firstId, secondId, thirdId, "spelled-castlery"], "Room order, then placement order.");
assert.deepEqual(shop.lines.map((line) => line.roomName), ["Living Room", "Living Room", "Dining", "Dining"]);
assert.equal(retailerCheckoutNote(shop), "You check out on castlery.com. Prices and stock are confirmed there.");

// Two of a product are added twice at the shop; its price is the line's.
const pair = shop.lines[1];
assert.equal(pair.addCount, 2);
assert.ok(pair.price > 0);
assert.match(pair.priceLabel, /^S\$[\d,]+$/);
assert.ok(pair.buyUrl?.startsWith("https://"));

// No way to buy it: its own group, never in a shop's list, "Price on request".
assert.equal(list.unavailable.length, 1);
assert.equal(list.unavailable[0].title, "Retired Stool");
assert.equal(list.unavailable[0].priceLabel, "Price on request");
assert.equal(list.unavailable[0].cheaperSwap, null);

// One total and one count, over every product.
assert.equal(list.total, shop.subtotal);
assert.equal(shop.subtotal, shop.lines.reduce((sum, line) => sum + line.price, 0));
assert.equal(list.productCount, 5);
assert.equal(productCountLabel(1), "1 product");
assert.equal(productCountLabel(5), "5 products");

// Checkout here stays hidden until a design has a product sold through Shopify (J, 27 Sep).
assert.equal(list.checkoutHere, null);
const withShopify = buildShoppingList({ rooms: [{ ...living, items: [...living.items, item("sold-here")] }], style: "modern", catalogItems: catalog });
assert.equal(withShopify.checkoutHere?.lines.length, 1);
assert.equal(withShopify.checkoutHere?.lines[0].shopifyVariantId, "gid://shopify/ProductVariant/1");
assert.equal(withShopify.retailers[0].lines.length, 2);
assert.equal(withShopify.total, withShopify.retailers[0].subtotal + (withShopify.checkoutHere?.subtotal ?? 0));

// An empty design has nothing to buy.
const empty = buildShoppingList({ rooms: [{ id: "r", name: "Room", items: [] }], style: "modern" });
assert.deepEqual(empty, { retailers: [], checkoutHere: null, unavailable: [], total: 0, productCount: 0 });

// "Swap for cheaper" names a product that really costs less, in the same category.
const hint = (id: string) => {
  const product = CATALOG_ITEMS[id];
  return product?.commerce.type === "affiliate" ? product.commerce.data.priceHint ?? 0 : 0;
};
let offered = 0;
for (const id of castlery) {
  const swap = cheaperSwapFor(id, "modern");
  if (!swap) continue;
  offered += 1;
  assert.ok(hint(swap.productId) > 0 && hint(swap.productId) < hint(id), `${swap.productId} costs less than ${id}`);
  assert.equal(CATALOG_ITEMS[swap.productId].category, CATALOG_ITEMS[id].category);
}
assert.ok(offered > 0, "Some products have a cheaper swap.");
const cheapest = [...castlery].sort((a, b) => hint(a) - hint(b))[0];
assert.equal(cheaperSwapFor(cheapest, "modern"), null, "The cheapest product has nothing cheaper.");
assert.equal(cheaperSwapFor("gone-product", "modern"), null);

// Names and sites.
assert.equal(retailerDisplayName("Castlery Singapore"), "Castlery");
assert.equal(retailerDisplayName("IKEA SG"), "IKEA");
assert.equal(retailerDisplayName("Singapore"), "Singapore");
assert.equal(retailerSite("https://www.castlery.com/sg/products/x"), "castlery.com");
assert.equal(retailerSite("https://shop.example.com/a"), "shop.example.com");
assert.equal(retailerSite("not a url"), null);
assert.equal(retailerSite(null), null);

console.log("Shopping list checks passed.");
