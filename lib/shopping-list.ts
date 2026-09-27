import { CATALOG_ITEMS } from "@/lib/catalog";
import { formatSgd } from "@/lib/money-format";
import { resolveRoomShoppingItems, type ActiveRoomShoppingItem } from "@/lib/room-shopping";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { findSwapOptions } from "@/lib/swap";

type CatalogItems = typeof CATALOG_ITEMS;

/** A room as the Shopping list reads it. */
export type ShoppingListRoom = Pick<RoomSnapshot, "id" | "name" | "items">;

/** One placed product: where it is, what it costs and how to buy it (audit finding FU8). */
export type ShoppingListLine = {
  instanceId: string;
  roomId: string;
  roomName: string;
  productId: string;
  variantId: string;
  title: string;
  /** The variant, with the purchase option when there is one: "180cm / Grey Oak · Set of 2". */
  detail: string;
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  /** How many to add at the retailer; a set counts once. */
  addCount: number;
  price: number;
  priceLabel: string;
  buyUrl: string | null;
  shopifyVariantId: string | null;
  /** The nearest cheaper product in the same category, for "Swap for cheaper". */
  cheaperSwap: { productId: string; title: string } | null;
};

export type ShoppingRetailer = {
  /** The shop's website, "castlery.com": it also joins the shop's spellings ("Castlery Singapore"). */
  id: string;
  name: string;
  lines: ShoppingListLine[];
  subtotal: number;
};

export type ShoppingList = {
  retailers: ShoppingRetailer[];
  /** Products bought here, through Shopify. Null while the design has none, so it stays hidden. */
  checkoutHere: { lines: ShoppingListLine[]; subtotal: number } | null;
  /** Products with no way to buy them yet. */
  unavailable: ShoppingListLine[];
  total: number;
  productCount: number;
};

export type BuildShoppingListInput = {
  rooms: readonly ShoppingListRoom[];
  /** The design's style, which swaps prefer to keep. */
  style: string;
  catalogItems?: CatalogItems;
};

export function productCountLabel(count: number) {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

/** "https://www.castlery.com/sg/…" → "castlery.com"; null when there's no usable address. */
export function retailerSite(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** The shop's name without the country the whole app sells in: "Castlery Singapore" → "Castlery". */
export function retailerDisplayName(label: string) {
  const name = label.trim().replace(/\s+(Singapore|SG)$/i, "");
  return name || label.trim() || "Retailer";
}

function affiliatePriceHint(productId: string, catalogItems: CatalogItems) {
  const product = catalogItems[productId];
  return product?.commerce.type === "affiliate" ? product.commerce.data.priceHint ?? 0 : 0;
}

/** Offered only when the nearest option in the same category really costs less. */
export function cheaperSwapFor(productId: string, style: string, catalogItems: CatalogItems = CATALOG_ITEMS) {
  const current = affiliatePriceHint(productId, catalogItems);
  if (current <= 0) return null;
  const best = findSwapOptions({ productId, style, direction: "cheaper" })[0];
  if (!best) return null;
  const price = affiliatePriceHint(best.id, catalogItems);
  return price > 0 && price < current ? { productId: best.id, title: best.title } : null;
}

/** A set, or a product bought as a set, is left as it is: a swap would break the set. */
function canSwap(item: ActiveRoomShoppingItem, placed: DesignItem | undefined) {
  return item.hasValidCommerce && !item.isBundle && !placed?.bundleGroupId && !placed?.purchaseOptionId;
}

function toLine(item: ActiveRoomShoppingItem, room: ShoppingListRoom, style: string, catalogItems: CatalogItems): ShoppingListLine {
  const placed = room.items.find((entry) => entry.instanceId === item.instanceId);
  return {
    instanceId: item.instanceId,
    roomId: room.id,
    roomName: room.name,
    productId: item.productId,
    variantId: item.variantId,
    title: item.title,
    detail: item.purchaseOptionLabel ? `${item.variantLabel} · ${item.purchaseOptionLabel}` : item.variantLabel,
    imageUrl: item.imageUrl,
    fallbackImageUrl: item.fallbackImageUrl,
    addCount: item.isBundle ? 1 : item.quantity,
    price: item.linePrice > 0 ? item.linePrice : 0,
    priceLabel: item.linePrice > 0 ? formatSgd(item.linePrice) : "Price on request",
    buyUrl: item.retailerUrl || null,
    shopifyVariantId: item.shopifyVariantId,
    cheaperSwap: canSwap(item, placed) ? cheaperSwapFor(item.productId, style, catalogItems) : null,
  };
}

type LineGroup = "retailer" | "here" | "unavailable";

function lineGroup(item: ActiveRoomShoppingItem): LineGroup {
  if (!item.hasValidCommerce) return "unavailable";
  if (item.commerceMode === "shopify" && item.shopifyVariantId) return "here";
  return item.commerceMode === "affiliate" && retailerSite(item.retailerUrl) ? "retailer" : "unavailable";
}

function subtotal(lines: readonly ShoppingListLine[]) {
  return lines.reduce((sum, line) => sum + line.price, 0);
}

function addToRetailer(retailers: Map<string, ShoppingRetailer>, item: ActiveRoomShoppingItem, line: ShoppingListLine) {
  const id = retailerSite(item.retailerUrl) as string;
  const name = retailerDisplayName(item.retailerLabel);
  const retailer = retailers.get(id) ?? { id, name, lines: [], subtotal: 0 };
  // The shortest spelling names the shop: "Castlery" rather than "Castlery Singapore".
  if (name.length < retailer.name.length) retailer.name = name;
  retailer.lines.push(line);
  retailers.set(id, retailer);
}

/**
 * The whole design's products, grouped by the shop that sells them, with one total. The first
 * shop to appear comes first, and lines keep the design's room and placement order.
 */
export function buildShoppingList({ rooms, style, catalogItems = CATALOG_ITEMS }: BuildShoppingListInput): ShoppingList {
  const retailers = new Map<string, ShoppingRetailer>();
  const here: ShoppingListLine[] = [];
  const unavailable: ShoppingListLine[] = [];
  for (const room of rooms) {
    for (const item of resolveRoomShoppingItems(room, catalogItems)) {
      const line = toLine(item, room, style, catalogItems);
      const group = lineGroup(item);
      if (group === "retailer") addToRetailer(retailers, item, line);
      else (group === "here" ? here : unavailable).push(line);
    }
  }
  const retailerList = Array.from(retailers.values()).map((retailer) => ({ ...retailer, subtotal: subtotal(retailer.lines) }));
  const all = [...retailerList.flatMap((retailer) => retailer.lines), ...here, ...unavailable];
  return {
    retailers: retailerList,
    checkoutHere: here.length ? { lines: here, subtotal: subtotal(here) } : null,
    unavailable,
    total: subtotal(all),
    productCount: all.length,
  };
}

/** Where a retailer's list says it checks out: "castlery.com". */
export function retailerCheckoutNote(retailer: Pick<ShoppingRetailer, "id">) {
  return `You check out on ${retailer.id}. Prices and stock are confirmed there.`;
}

/** Removing a line removes the placed product, and a set's parts with it. */
export function withoutShoppingLine(items: readonly DesignItem[], instanceId: string): DesignItem[] {
  const removed = items.find((item) => item.instanceId === instanceId);
  const setId = removed?.bundleRole === "primary" ? removed.bundleGroupId : undefined;
  return items.filter((item) => item.instanceId !== instanceId && !(setId && item.bundleGroupId === setId));
}

/** The line's product becomes the cheaper one, in its default variant, where it stands. */
export function withShoppingLineSwapped(
  items: readonly DesignItem[],
  instanceId: string,
  product: { id: string; defaultVariantId: string }
): DesignItem[] {
  return items.map((item) =>
    item.instanceId === instanceId
      ? { ...item, productId: product.id, variantId: product.defaultVariantId, purchaseOptionId: undefined }
      : item
  );
}

/** The history steps the Shopping list records, so the toast's Undo can check it's still the newest. */
export function shoppingRemovalStep(line: Pick<ShoppingListLine, "title">) {
  return `Remove ${line.title}`;
}

export function shoppingSwapStep(line: Pick<ShoppingListLine, "title">, swapTitle: string) {
  return `Swap ${line.title} for ${swapTitle}`;
}
