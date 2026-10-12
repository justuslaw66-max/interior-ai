import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { SelectedItemActionRow, SelectedItemSwaps } from "../components/editor/design-page/SelectedItemQuickActions";
import { SelectedItemSummaryCard } from "../components/editor/design-page/SelectedItemSummaryCard";
import { CATALOG_ITEMS } from "../lib/catalog";
import { getPriceLabel, getPriceNumber } from "../lib/catalog/price-labels";
import type { DesignItem } from "../lib/room-types";
import {
  buildSelectedItemSummary,
  NO_SELECTED_ITEM_SUMMARY,
  productSizeLabel,
  type SelectedItemSummary,
} from "../lib/selected-item-summary";
import { cheaperSwapFor, pricierSwapFor } from "../lib/shopping-list";

// The one item panel (UX audit FU12): what it says about the selected product, in the app's own
// words, and its named swaps (FU10), which follow the Shopping list's rules.

const noop = () => undefined;
const products = Object.values(CATALOG_ITEMS);
const placed = (productId: string, variantId: string, extra: Partial<DesignItem> = {}) =>
  ({ instanceId: `placed-${productId}`, productId, variantId, position: [0, 0, 0], ...extra }) as DesignItem;

// Size, in the design's units: "70.5 W × 85 D × 85 H cm".
assert.equal(productSizeLabel({ w: 705, d: 850, h: 850 }, "cm"), "70.5 W × 85 D × 85 H cm");
assert.equal(productSizeLabel({ w: 2000, d: 900, h: 750 }, "mm"), "2,000 W × 900 D × 750 H mm");
const feetAndInches = productSizeLabel({ w: 914.4, d: 609.6, h: 304.8 }, "ft-in");
assert.match(feetAndInches, /^3′ [^W]+ W × 2′ [^D]+ D × 1′ [^H]+ H$/, feetAndInches);

// A product sold by a shop: its price, "Sold by <shop>", and the shop's name without the country.
const sold = products.find(
  (product) => product.commerce.type === "affiliate" && product.commerce.data.url && (product.commerce.data.priceHint ?? 0) > 0
);
assert.ok(sold, "The local catalogue has a product sold by a shop, with a price.");
const summary = buildSelectedItemSummary({
  product: sold,
  item: placed(sold.id, sold.defaultVariantId),
  style: "modern",
  measurementUnit: "cm",
});
assert.equal(summary.title, sold.title);
assert.match(summary.priceLabel, /^S\$[\d,]+$/);
assert.equal(summary.sale.kind, "retailer");
if (summary.sale.kind === "retailer") assert.doesNotMatch(summary.sale.retailer, /\s(?:Singapore|SG)$/);
assert.equal(summary.sizeLabel, productSizeLabel(sold.dimsMm, "cm"));

// Swaps are the Shopping list's: the nearest product in the category that really costs less or more.
assert.equal(summary.swaps.cheaper?.productId ?? null, cheaperSwapFor(sold.id, "modern")?.productId ?? null);
assert.equal(summary.swaps.pricier?.productId ?? null, pricierSwapFor(sold.id, "modern")?.productId ?? null);
const priceOf = (productId: string) => {
  const product = CATALOG_ITEMS[productId];
  return product?.commerce.type === "affiliate" ? product.commerce.data.priceHint ?? 0 : 0;
};
let offered = 0;
for (const product of products) {
  const cheaper = cheaperSwapFor(product.id, "modern");
  const pricier = pricierSwapFor(product.id, "modern");
  if (cheaper) assert.ok(priceOf(cheaper.productId) < priceOf(product.id), `${cheaper.productId} costs less than ${product.id}`);
  if (pricier) assert.ok(priceOf(pricier.productId) > priceOf(product.id), `${pricier.productId} costs more than ${product.id}`);
  if (pricier) assert.equal(CATALOG_ITEMS[pricier.productId].category, product.category);
  if (cheaper || pricier) offered += 1;
}
assert.ok(offered > 0, "Some products have a swap.");
const withBoth = products.find((product) => cheaperSwapFor(product.id, "modern") && pricierSwapFor(product.id, "modern"));
if (withBoth) {
  const named = buildSelectedItemSummary({
    product: withBoth,
    item: placed(withBoth.id, withBoth.defaultVariantId),
    style: "modern",
    measurementUnit: "cm",
  });
  const pricier = named.swaps.pricier!;
  assert.equal(pricier.title, CATALOG_ITEMS[pricier.productId].title);
  const pricierProduct = CATALOG_ITEMS[pricier.productId];
  assert.match(pricier.priceLabel, getPriceNumber(pricierProduct, pricierProduct.defaultVariantId) ? /^S\$[\d,]+$/ : /^Price on request$/);
}

// A set, or a product bought as a set, keeps its product.
for (const extra of [{ bundleGroupId: "set-1" }, { purchaseOptionId: "pair" }]) {
  const inSet = buildSelectedItemSummary({
    product: sold,
    item: placed(sold.id, sold.defaultVariantId, extra),
    style: "modern",
    measurementUnit: "cm",
  });
  assert.deepEqual(inSet.swaps, { cheaper: null, pricier: null });
}

// Not sold online yet: no shop, no price.
const unsold = products.find((product) => product.commerce.type === "not_buyable");
if (unsold) {
  const unsoldSummary = buildSelectedItemSummary({
    product: unsold,
    item: placed(unsold.id, unsold.defaultVariantId),
    style: "modern",
    measurementUnit: "cm",
  });
  assert.deepEqual(unsoldSummary.sale, { kind: "unavailable" });
  assert.equal(unsoldSummary.priceLabel, "Price on request");
  assert.equal(getPriceLabel(unsold), "Price on request");
}
assert.deepEqual(NO_SELECTED_ITEM_SUMMARY.swaps, { cheaper: null, pricier: null });

// The price line speaks for the app: never "External retailer" or "Buy on this site".
for (const product of products) {
  assert.doesNotMatch(getPriceLabel(product), /External retailer|Buy on this site/);
}

// Markup: "Sold by <shop> · View product", and no shop's own words.
const card = renderToStaticMarkup(
  <SelectedItemSummaryCard summary={summary} title="Winora Armchair" locked={false} onViewProduct={noop} />
);
assert.match(card, /<h2[^>]*>Winora Armchair<\/h2>/);
assert.match(card, /data-testid="selected-item-availability" data-sale="retailer"[\s\S]*Sold by [^<]+<\/span>/);
assert.match(card, /data-testid="selected-item-view-product" aria-label="View product at [^"]+"/);
assert.doesNotMatch(card, /External retailer|Check stock|View retailer|Locked/);
const withSale = (sale: SelectedItemSummary["sale"], locked = false) =>
  renderToStaticMarkup(<SelectedItemSummaryCard summary={{ ...summary, sale }} title="Winora Armchair" locked={locked} onViewProduct={noop} />);
assert.match(withSale({ kind: "unavailable" }), />Not sold online yet</);
assert.doesNotMatch(withSale({ kind: "unavailable" }), /View product/);
assert.match(withSale({ kind: "checkout" }), />Checkout here, from your Shopping list</);
assert.match(withSale({ kind: "unavailable" }, true), />Locked</);

// Rotate, Duplicate and Remove: one row, the one Remove (UX audit ED3).
const row = renderToStaticMarkup(
  <SelectedItemActionRow rotationOpen={false} canRotate disabled={false} onRotate={noop} onDuplicate={noop} onRemove={noop} />
);
assert.match(row, /data-testid="rotation-controls-toggle" aria-expanded="false"[\s\S]*Rotate[\s\S]*data-testid="selected-item-duplicate"[\s\S]*Duplicate[\s\S]*data-testid="selected-item-delete"[\s\S]*Remove<\/button>/);
assert.doesNotMatch(row, /Delete</);
const lockedRow = renderToStaticMarkup(
  <SelectedItemActionRow rotationOpen canRotate disabled onRotate={noop} onDuplicate={noop} onRemove={noop} />
);
assert.match(lockedRow, /aria-expanded="true"/);
assert.match(lockedRow, /data-testid="selected-item-duplicate"[^>]*disabled=""/);
assert.match(lockedRow, /data-testid="selected-item-delete"[^>]*disabled=""/);
assert.doesNotMatch(lockedRow, /data-testid="rotation-controls-toggle"[^>]*disabled=""/, "Rotation's own controls handle a lock.");

// Named swaps: what each swaps to and what that costs; nothing when there's no swap.
const swaps = renderToStaticMarkup(
  <SelectedItemSwaps
    cheaper={{ productId: "cammy", title: "Cammy Armchair", priceLabel: "S$449" }}
    pricier={{ productId: "owen", title: "Owen Armchair", priceLabel: "S$849" }}
    disabled={false}
    onSwapToCheaper={noop}
    onSwapToPricier={noop}
  />
);
assert.match(
  swaps,
  />Swap<\/span>[\s\S]*Swap for cheaper[\s\S]*>Cammy Armchair<\/span><span class="shrink-0">· S\$449<[\s\S]*Swap for pricier[\s\S]*>Owen Armchair<\/span><span class="shrink-0">· S\$849</
);
assert.equal(
  renderToStaticMarkup(
    <SelectedItemSwaps cheaper={null} pricier={null} disabled={false} onSwapToCheaper={noop} onSwapToPricier={noop} />
  ),
  ""
);

// A swap picks another product, so it waits for the product lists; the panel's other edits don't
// (J, 10 Oct 2026).
const panel = readFileSync("components/editor/design-page/SelectedItemPanel.tsx", "utf8");
assert.match(panel, /<SelectedItemSwaps[\s\S]*?disabled=\{editsDisabled \|\| !canChangeProducts\}/);
assert.match(
  readFileSync("lib/design-page-panel-registration.ts", "utf8"),
  /isClientPreview: configuration\.isClientPreview,\s*canEdit: configuration\.canEdit,\s*canChangeProducts: configuration\.canChangeProducts,\s*\},\s*actions: \{\s*inspectionController:/
);
assert.match(
  readFileSync("lib/useDesignPageProductInspectionController.ts", "utf8"),
  /configuration: \{\s*canEdit: canEdit && liveCatalogReady, \/\/ A variant or finish is another product/,
  "Variants and finishes are other products too."
);

console.log("Selected item summary checks passed.");
