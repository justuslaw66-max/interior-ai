import {
  resolveRoomShoppingItems,
  type ActiveRoomShoppingItem,
} from "@/lib/room-shopping";
import type { RoomSnapshot } from "@/lib/room-types";

export type CheckoutReadinessRow = ActiveRoomShoppingItem & {
  roomId: string;
  roomName: string;
  floorLabel?: string;
};

export type ShoppingCsvRow = {
  roomName: string;
  category: string;
  itemTitle: string;
  productId: string;
  variantId: string;
  variantLabel: string;
  purchaseOptionLabel: string | null;
  quantity: number;
  status: string;
  source: string;
  retailerUrl: string | null;
  includeInCheckout: boolean;
  unitPriceUsd: number;
  lineTotalUsd: number;
  reviewNote: string | null;
};

function formatCategory(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getCheckoutStatusLabel(row: ActiveRoomShoppingItem) {
  if (!row.hasValidCommerce) return "Needs review";
  if (row.commerceMode === "shopify") {
    return row.includeInCheckout ? "Cart-ready" : "Not in cart";
  }
  if (row.commerceMode === "affiliate") return "Retailer link";
  return "Needs review";
}

export function getCheckoutSourceLabel(row: ActiveRoomShoppingItem) {
  if (!row.hasValidCommerce) return row.warningLabel ?? "Missing commerce mapping";
  if (row.commerceMode === "shopify") return "Shopify checkout";
  return row.retailerLabel;
}

export function buildCheckoutReadinessRows(rooms: RoomSnapshot[]): CheckoutReadinessRow[] {
  return rooms.flatMap((room) =>
    resolveRoomShoppingItems({ items: room.items }).map((item) => ({
      ...item,
      roomId: room.id,
      roomName: room.name,
      floorLabel: room.floorLabel,
    }))
  );
}

export function buildShoppingCsvRows(rows: CheckoutReadinessRow[]): ShoppingCsvRow[] {
  return rows.map((row) => ({
    roomName: row.roomName,
    category: formatCategory(row.category),
    itemTitle: row.title,
    productId: row.productId,
    variantId: row.variantId,
    variantLabel: row.variantLabel,
    purchaseOptionLabel: row.purchaseOptionLabel ?? null,
    quantity: row.quantity,
    status: getCheckoutStatusLabel(row),
    source: getCheckoutSourceLabel(row),
    retailerUrl: row.retailerUrl,
    includeInCheckout: row.includeInCheckout,
    unitPriceUsd: row.quantity > 0 ? row.linePrice / row.quantity : row.linePrice,
    lineTotalUsd: row.linePrice,
    reviewNote: row.warningLabel ?? null,
  }));
}
