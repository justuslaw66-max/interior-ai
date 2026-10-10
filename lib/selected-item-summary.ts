import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { getPriceNumber } from "@/lib/catalog/price-labels";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { formatDisplayLength, type DisplayUnit } from "@/lib/display-units";
import { formatSgd } from "@/lib/money-format";
import { resolveRoomShoppingItems } from "@/lib/room-shopping";
import type { DesignItem } from "@/lib/room-types";
import { cheaperSwapFor, pricierSwapFor, retailerDisplayName } from "@/lib/shopping-list";

type CatalogItems = typeof CATALOG_ITEMS;

/** Where the selected product is bought, in the app's own words (UX audit FU12). */
export type SelectedItemSale =
  | { kind: "retailer"; retailer: string }
  | { kind: "checkout" }
  | { kind: "unavailable" };

/** A named swap: "Swap for cheaper · Cammy Armchair · S$449". */
export type SelectedItemSwap = { productId: string; title: string; priceLabel: string };

/** What the item panel shows about the selected product, above its controls. */
export type SelectedItemSummary = {
  title: string;
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  priceLabel: string;
  sale: SelectedItemSale;
  /** "70.5 W × 85 D × 85 H cm", in the design's units. */
  sizeLabel: string;
  swaps: { cheaper: SelectedItemSwap | null; pricier: SelectedItemSwap | null };
};

export type BuildSelectedItemSummaryInput = {
  product: CatalogItemSchema;
  item: DesignItem | null;
  style: string;
  measurementUnit: DisplayUnit;
  planningDimensionsMm?: { w: number; d: number; h: number } | null;
  catalogItems?: CatalogItems;
};

/** While nothing is selected the item panel isn't shown; its model still needs a summary. */
export const NO_SELECTED_ITEM_SUMMARY: SelectedItemSummary = {
  title: "",
  imageUrl: null,
  fallbackImageUrl: null,
  priceLabel: "",
  sale: { kind: "unavailable" },
  sizeLabel: "",
  swaps: { cheaper: null, pricier: null },
};

/** "70.5 W × 85 D × 85 H cm"; feet and inches keep their marks on each side. */
export function productSizeLabel(dims: { w: number; d: number; h: number }, unit: DisplayUnit) {
  const part = (valueMm: number) =>
    unit === "ft-in" ? formatDisplayLength(valueMm, unit) : formatDisplayLength(valueMm, unit).replace(/ [a-z]+$/, "");
  const label = `${part(dims.w)} W × ${part(dims.d)} D × ${part(dims.h)} H`;
  return unit === "ft-in" ? label : `${label} ${unit}`;
}

function priceText(amount: number | null | undefined) {
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? formatSgd(amount) : "Price on request";
}

function swapOf(target: { productId: string; title: string } | null, catalogItems: CatalogItems): SelectedItemSwap | null {
  const product = target ? catalogItems[target.productId] : undefined;
  if (!target || !product) return null;
  return { ...target, priceLabel: priceText(getPriceNumber(product, product.defaultVariantId)) };
}

/** A set, or a product bought as a set, keeps its product: a swap would break the set. */
function canSwap(item: DesignItem | null) {
  return Boolean(item) && !item?.bundleGroupId && !item?.purchaseOptionId;
}

type PlacedLine = ReturnType<typeof resolveRoomShoppingItems>[number] | undefined;

/** Where it's sold, as the Shopping list groups it: a shop with a link, Checkout here, or neither. */
function saleOf(line: PlacedLine): SelectedItemSale {
  if (line?.commerceMode === "affiliate" && line.retailerUrl) {
    return { kind: "retailer", retailer: retailerDisplayName(line.retailerLabel) };
  }
  return line?.commerceMode === "shopify" && line.hasValidCommerce ? { kind: "checkout" } : { kind: "unavailable" };
}

function swapsOf(product: CatalogItemSchema, item: DesignItem | null, style: string, catalogItems: CatalogItems) {
  if (!canSwap(item)) return { cheaper: null, pricier: null };
  return {
    cheaper: swapOf(cheaperSwapFor(product.id, style, catalogItems), catalogItems),
    pricier: swapOf(pricierSwapFor(product.id, style, catalogItems), catalogItems),
  };
}

/**
 * The selected product as its placed line reads in the Shopping list (picture, price, where it is
 * sold), with the named swaps the item panel offers. A set's part has no line of its own, so it
 * reads from the catalogue.
 */
export function buildSelectedItemSummary({
  product,
  item,
  style,
  measurementUnit,
  planningDimensionsMm,
  catalogItems = CATALOG_ITEMS,
}: BuildSelectedItemSummaryInput): SelectedItemSummary {
  const line: PlacedLine = item ? resolveRoomShoppingItems({ items: [item] }, catalogItems)[0] : undefined;
  const resolved = resolveCatalogVariant(product, item?.variantId);
  const price = line && line.linePrice > 0 ? line.linePrice : getPriceNumber(product, resolved.variantId);
  const thumbUrl = product.assets.thumbUrl ?? null;
  return {
    title: product.title,
    imageUrl: line?.imageUrl ?? resolved.media.thumbUrl ?? thumbUrl,
    fallbackImageUrl: line?.fallbackImageUrl ?? thumbUrl,
    priceLabel: priceText(price),
    sale: saleOf(line),
    sizeLabel: productSizeLabel(planningDimensionsMm ?? product.dimsMm, measurementUnit),
    swaps: swapsOf(product, item, style, catalogItems),
  };
}
