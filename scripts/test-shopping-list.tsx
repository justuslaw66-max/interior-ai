import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ShoppingListRow } from "../components/editor/shop/ShoppingListRow";
import { ShoppingSwapAll } from "../components/editor/shop/ShoppingSwapAll";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { DesignItem } from "../lib/room-types";
import {
  buildShoppingList,
  cheaperSwapFor,
  planSwapAll,
  pricierSwapFor,
  productCountLabel,
  retailerCheckoutNote,
  retailerDisplayName,
  retailerSite,
  shoppingListLines,
  swapAllMessage,
  swapAllStep,
  withSwapAllApplied,
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

// Pro's "Swap all" (UX 4h, J's Q2 (a)): exactly the products that offer "Swap for cheaper", every
// one of them, and the same rule the other way; sets, products bought as a set and locked products stay.
const rooms = [living, dining];
const cheaperAll = planSwapAll({ rooms, style: "modern", direction: "cheaper", catalogItems: catalog });
assert.deepEqual(
  cheaperAll.map((change) => [change.instanceId, change.to.id]),
  shoppingListLines(list).filter((line) => line.cheaperSwap).map((line) => [line.instanceId, line.cheaperSwap?.productId]),
  "Swap all for cheaper swaps what Swap for cheaper offers, line by line."
);
assert.ok(cheaperAll.length > 0, "The fixture has something to swap.");
const pricierAll = planSwapAll({ rooms, style: "modern", direction: "pricier", catalogItems: catalog });
for (const change of pricierAll) {
  const placed = rooms.flatMap((room) => room.items).find((entry) => entry.instanceId === change.instanceId);
  assert.ok(placed && hint(change.to.id) > hint(placed.productId), `${change.to.id} costs more`);
  assert.equal(pricierSwapFor(placed.productId, "modern", catalog)?.productId, change.to.id);
}
const asSet = { ...living, items: living.items.map((entry) => ({ ...entry, purchaseOptionId: "set-of-2" })) } as ShoppingListRoom;
assert.deepEqual(planSwapAll({ rooms: [asSet], style: "modern", direction: "cheaper", catalogItems: catalog }), [], "Products bought as a set stay.");
const lockedId = cheaperAll[0].instanceId;
const withLock = rooms.map((room) => ({
  ...room,
  items: room.items.map((entry) => (entry.instanceId === lockedId ? { ...entry, locked: true } : entry)),
})) as ShoppingListRoom[];
assert.deepEqual(
  planSwapAll({ rooms: withLock, style: "modern", direction: "cheaper", catalogItems: catalog }).map((change) => change.instanceId),
  cheaperAll.map((change) => change.instanceId).filter((instanceId) => instanceId !== lockedId),
  "A locked product stays, as AI Notes' bulk swap leaves it."
);

// Applying it: one room at a time, each change where the product stands, in its default variant.
const livingAfter = withSwapAllApplied(living.items, "living", cheaperAll);
for (const entry of livingAfter) {
  const change = cheaperAll.find((candidate) => candidate.instanceId === entry.instanceId);
  const before = living.items.find((candidate) => candidate.instanceId === entry.instanceId);
  assert.equal(entry.productId, change ? change.to.id : before?.productId);
  if (change) assert.equal(entry.variantId, catalog[change.to.id].defaultVariantId);
  assert.deepEqual(entry.position, before?.position, "Where it stands.");
}
assert.deepEqual(withSwapAllApplied(living.items, "elsewhere", cheaperAll), living.items);
assert.equal(swapAllStep("cheaper"), "Swap all for cheaper");
assert.equal(swapAllStep("pricier"), "Swap all for pricier");
assert.equal(swapAllMessage(6), "6 products swapped");
assert.equal(swapAllMessage(1), "1 product swapped");

// The buttons: Pro sees how many each would swap, and a direction with none is off; Free sees a
// Pro badge, and a press opens Pricing, which hands focus back to the button.
const noop = () => {};
const pro = renderToStaticMarkup(<ShoppingSwapAll counts={{ cheaper: 6, pricier: 0 }} disabled={false} onSwapAll={noop} />);
assert.match(pro, /^<div role="group" aria-label="Swap all" data-testid="shopping-swap-all"/);
assert.match(pro, /id="shopping-swap-all-cheaper" data-testid="shopping-swap-all-cheaper" aria-label="Swap all for cheaper, 6 products">/);
assert.match(pro, /id="shopping-swap-all-pricier" data-testid="shopping-swap-all-pricier" aria-label="Swap all for pricier, 0 products" disabled="">/);
assert.match(pro, /\bmin-h-11\b/, "44px, the shared Button's touch size.");
const free = renderToStaticMarkup(<ShoppingSwapAll counts={null} disabled={false} onSwapAll={noop} />);
assert.equal(free.match(/aria-label="Swap all for (?:cheaper|pricier), Pro">/g)?.length, 2);
assert.equal(free.match(/>Pro<\/span>/g)?.length, 2);
assert.doesNotMatch(free, /disabled=""/, "Free can press them: they open Pricing.");

const read = (path: string) => readFileSync(path, "utf8");
const shopStep = read("components/editor/shop/ShopStep.tsx");
assert.match(shopStep, /if \(!plans\) return swapAll\.openPricing\(swapAllButtonId\(direction\)\);/);
assert.match(shopStep, /return swapAll && canSwap \? \{ counts, disabled: false, onSwapAll \} : null;/, "No Swap all where the host doesn't supply it.");

// Swaps pick other products, so they wait for the product lists; Remove doesn't (J, 10 Oct 2026).
const swappable = shoppingListLines(list).find((line) => line.cheaperSwap);
if (!swappable) throw new Error("The fixture has a line with a cheaper swap.");
const rowMarkup = (canSwap?: boolean) =>
  renderToStaticMarkup(<ShoppingListRow line={swappable} canEdit canSwap={canSwap} onRemove={noop} onSwapForCheaper={noop} />);
assert.match(rowMarkup(), /data-testid="shopping-list-swap"/, "Without canSwap, a row follows canEdit.");
assert.doesNotMatch(rowMarkup(false), /data-testid="shopping-list-swap"/, "No swap until the product lists load.");
assert.doesNotMatch(rowMarkup(false), /data-testid="shopping-list-remove"[^>]*disabled=""/, "Remove works meanwhile.");
assert.match(shopStep, /const edits = useShoppingListEdits\(\{ canEdit, canSwap, actions \}\);/);
assert.match(shopStep, /if \(!canSwap \|\| !product\) return;/);
assert.match(shopStep, /if \(!canSwap \|\| changes\.length === 0\) return;/);
assert.match(read("lib/design-page-panel-registration.ts"), /canEdit: configuration\.canEdit, canSwap: configuration\.canChangeProducts,/);
assert.match(shopStep, /swapAll\.commitItemsToRooms\(roomIds\.map\(\(roomId\) => \(\{ roomId, update: \(items\) => withSwapAllApplied\(items, roomId, changes\) \}\)\), step\);\s*announceUndoableAction\(\{ message: swapAllMessage\(changes\.length\), undoLabels: \[step\] \}\);/, "One step, one toast with Undo.");
assert.match(read("lib/design-page-panel-registration.ts"), /swapAll: \{ canSwapAll: state\.document\.plan === "pro", commitItemsToRooms: actions\.shopping\.commitItemsToRooms, openPricing: actions\.shopping\.openPricing \}/);
assert.match(read("lib/useCommitItemsToRooms.ts"), /history\.executeCommand<[^>]+>\(\{\s*id: "replace-rooms-items",/);
const page = read("components/editor/shop/ShoppingListPage.tsx");
assert.match(page, /\{swapAll && !empty && !wide \? <ShoppingSwapAll \{\.\.\.swapAll\} \/> : null\}/, "Under the heading below lg.");
assert.match(page, /swapAll=\{wide \? swapAll : null\}/, "In the summary from lg; never both.");

console.log("Shopping list checks passed.");
