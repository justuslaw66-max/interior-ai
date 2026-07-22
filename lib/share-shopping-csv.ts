import {
  resolveRoomShoppingItems,
  type ActiveRoomShoppingItem,
} from "@/lib/room-shopping";
import { buildRoomSurfaceMaterialBomRows } from "@/lib/surface-material-bom";
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

export type ShareCheckoutLine = {
  merchandiseId: string;
  quantity: number;
  productId: string;
  variantId: string;
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

export function buildShareCheckoutLines(rows: CheckoutReadinessRow[]): ShareCheckoutLine[] {
  const grouped = new Map<string, ShareCheckoutLine>();

  for (const row of rows) {
    if (
      row.commerceMode !== "shopify" ||
      !row.hasValidCommerce ||
      !row.includeInCheckout ||
      !row.shopifyVariantId
    ) {
      continue;
    }

    const key = `${row.productId}:${row.variantId}:${row.shopifyVariantId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      grouped.set(key, {
        merchandiseId: row.shopifyVariantId,
        quantity: row.quantity,
        productId: row.productId,
        variantId: row.variantId,
      });
    }
  }

  return Array.from(grouped.values()).flatMap((line) => {
    const chunks: ShareCheckoutLine[] = [];
    let remaining = line.quantity;
    while (remaining > 0) {
      const quantity = Math.min(20, remaining);
      chunks.push({ ...line, quantity });
      remaining -= quantity;
    }
    return chunks;
  });
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

export function buildSurfaceMaterialCsvRows(rooms: RoomSnapshot[]): ShoppingCsvRow[] {
  return buildRoomSurfaceMaterialBomRows(rooms).map((row) => {
    const brandLabel = row.brand ?? row.supplier;
    const status =
      row.status === "published"
        ? "Quote/sample"
        : row.status === "draft"
          ? "Draft material"
          : "Needs review";

    return {
      roomName: row.roomName,
      category: row.surface === "floor" ? "Flooring Material" : "Wall Surface Material",
      itemTitle: row.materialName,
      productId: row.materialId,
      variantId: row.surface,
      variantLabel: `${row.surfaceLabel} · ${row.orderAreaSqm.toFixed(2)} m2 incl. 10% waste`,
      purchaseOptionLabel: row.purchaseMode,
      quantity: Number(row.orderAreaSqm.toFixed(2)),
      status,
      source: `${brandLabel} ${row.materialFamily.replace(/_/g, " ")} ${row.purchaseMode.replace(/_/g, " ")}`,
      retailerUrl: row.sampleRequestUrl ?? row.sourceUrl,
      includeInCheckout: row.purchaseMode === "direct_checkout",
      unitPriceUsd: row.pricePerSqmAmount ?? 0,
      lineTotalUsd: row.lineTotal ?? 0,
      reviewNote: [
        `Surface ${row.surfaceLabel}; measured area ${row.surfaceAreaSqm.toFixed(2)} m2; suggested order ${row.orderAreaSqm.toFixed(2)} m2 with 10% waste.`,
        `Pattern ${row.pattern}; rotation ${row.rotationDeg} deg; scale ${row.scale}; joint ${row.jointSizeMm} mm ${row.jointColor}.`,
        row.reviewNote,
      ].filter(Boolean).join(" "),
    };
  });
}
