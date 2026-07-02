import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import {
  getPriceLabel,
  mapToTopCategory,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";
import { formatMoney, getItemPrice } from "@/lib/design-page-utils";
import type { DesignItem, RoomSnapshot, RoomType } from "@/lib/room-types";

export type ActiveRoomShoppingItem = {
  instanceId: string;
  productId: string;
  variantId: string;
  title: string;
  variantLabel: string;
  purchaseOptionId?: string;
  purchaseOptionLabel?: string;
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  priceLabel: string;
  quantity: number;
  linePrice: number;
  compareAtPrice?: number;
  savings?: number;
  isBundle?: boolean;
  retailerUrl: string | null;
  retailerLabel: string;
  commerceMode: "shopify" | "affiliate" | "not_buyable";
  retailerStatusLabel: string;
  includeInCheckout: boolean;
  cartStatusLabel: string;
  hasValidCommerce: boolean;
  warningLabel?: string;
  category: CatalogTopCategory;
};

export type ShoppingRoomSummary = {
  roomId: string;
  roomName: string;
  roomType: RoomType;
  itemCount: number;
  includedCount: number;
  shoppableCount: number;
  needsReviewCount: number;
  subtotal: number;
  previewNames: string[];
  isActive: boolean;
};

export type ShoppingHomeSummary = {
  itemCount: number;
  includedCount: number;
  shoppableCount: number;
  needsReviewCount: number;
  subtotal: number;
};

type ShoppingRoom = Pick<RoomSnapshot, "id" | "name" | "roomType" | "items">;
type RoomWithItems = Pick<RoomSnapshot, "items"> | null | undefined;

function shouldCountItem(item: DesignItem): boolean {
  return item.bundleRole !== "component";
}

function getQuantity(item: DesignItem): number {
  if (item.bundleRole === "primary" && item.bundleQuantity) {
    return Math.max(1, Math.min(99, item.bundleQuantity));
  }
  return Math.max(1, Math.min(99, item.qty ?? 1));
}

function getPurchaseOption(
  item: DesignItem,
  resolved: ReturnType<typeof resolveCatalogVariant>
) {
  if (!item.purchaseOptionId) return null;
  return resolved.variant.purchaseOptions?.find((option) => option.id === item.purchaseOptionId) ?? null;
}

function isValidCommerce(commerce: ReturnType<typeof resolveCatalogVariant>["commerce"]): boolean {
  if (commerce.type === "affiliate") return Boolean(commerce.url);
  if (commerce.type === "shopify") return Boolean(commerce.variantId && commerce.available);
  return false;
}

function getResolvedUnitPrice(
  product: (typeof CATALOG_ITEMS)[string],
  resolved: ReturnType<typeof resolveCatalogVariant>
): number {
  if (resolved.commerce.type === "affiliate") {
    return resolved.commerce.priceHint ?? 0;
  }
  return getItemPrice(product);
}

export function summarizeShoppingRooms(
  rooms: ShoppingRoom[],
  activeRoomId: string
): ShoppingRoomSummary[] {
  return rooms.map((room) => {
    let subtotal = 0;
    let shoppableCount = 0;
    let needsReviewCount = 0;
    let includedCount = 0;
    const previewNames: string[] = [];

    for (const item of room.items) {
      if (!shouldCountItem(item)) continue;
      const product = CATALOG_ITEMS[item.productId];
      if (!product) {
        needsReviewCount += 1;
        continue;
      }

      const qty = getQuantity(item);
      const resolved = resolveCatalogVariant(product, item.variantId);
      const purchaseOption = getPurchaseOption(item, resolved);
      subtotal += purchaseOption?.priceHint ?? getResolvedUnitPrice(product, resolved) * qty;

      if (item.includeInCheckout ?? true) {
        includedCount += qty;
      }

      if (purchaseOption?.affiliateUrl || isValidCommerce(resolved.commerce)) {
        shoppableCount += qty;
      } else {
        needsReviewCount += qty;
      }

      if (previewNames.length < 3) {
        previewNames.push(product.title);
      }
    }

    return {
      roomId: room.id,
      roomName: room.name,
      roomType: room.roomType,
      itemCount: room.items.filter(shouldCountItem).length,
      includedCount,
      shoppableCount,
      needsReviewCount,
      subtotal,
      previewNames,
      isActive: room.id === activeRoomId,
    };
  });
}

export function summarizeWholeHomeShopping(
  roomSummaries: ShoppingRoomSummary[]
): ShoppingHomeSummary {
  return roomSummaries.reduce(
    (summary, room) => ({
      itemCount: summary.itemCount + room.itemCount,
      includedCount: summary.includedCount + room.includedCount,
      shoppableCount: summary.shoppableCount + room.shoppableCount,
      needsReviewCount: summary.needsReviewCount + room.needsReviewCount,
      subtotal: summary.subtotal + room.subtotal,
    }),
    {
      itemCount: 0,
      includedCount: 0,
      shoppableCount: 0,
      needsReviewCount: 0,
      subtotal: 0,
    }
  );
}

export function countRoomCategories(
  room: RoomWithItems
): Partial<Record<CatalogTopCategory, number>> {
  const counts: Partial<Record<CatalogTopCategory, number>> = {};
  if (!room) return counts;

  for (const item of room.items) {
    if (!shouldCountItem(item)) continue;
    const product = CATALOG_ITEMS[item.productId];
    if (!product) continue;
    const category = mapToTopCategory(product.category, product);
    counts[category] = (counts[category] ?? 0) + getQuantity(item);
  }

  return counts;
}

export function countRoomProductQuantities(room: RoomWithItems): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!room) return counts;

  for (const item of room.items) {
    if (!shouldCountItem(item)) continue;
    counts[item.productId] = (counts[item.productId] ?? 0) + getQuantity(item);
  }

  return counts;
}

export function countRoomVariantQuantities(room: RoomWithItems): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!room) return counts;

  for (const item of room.items) {
    if (!shouldCountItem(item)) continue;
    const product = CATALOG_ITEMS[item.productId];
    if (!product) continue;
    const resolved = resolveCatalogVariant(product, item.variantId);
    const key = `${item.productId}:${resolved.variantId}`;
    counts[key] = (counts[key] ?? 0) + getQuantity(item);
  }

  return counts;
}

export function resolveRoomShoppingItems(room: RoomWithItems): ActiveRoomShoppingItem[] {
  if (!room) return [];

  return room.items.flatMap((item) => {
    if (!shouldCountItem(item)) return [];
    const product = CATALOG_ITEMS[item.productId];
    if (!product) return [];

    const qty = getQuantity(item);
    const resolved = resolveCatalogVariant(product, item.variantId);
    const purchaseOption = getPurchaseOption(item, resolved);
    const linePrice = purchaseOption?.priceHint ?? getResolvedUnitPrice(product, resolved) * qty;
    const retailerUrl =
      purchaseOption?.affiliateUrl ?? (resolved.commerce.type === "affiliate" ? resolved.commerce.url : null);
    const retailerLabel =
      resolved.commerce.type === "affiliate"
        ? resolved.commerce.retailer ?? "Retailer"
        : "Retailer";
    const retailerStatusLabel =
      purchaseOption?.affiliateUrl
        ? `${retailerLabel} set link ready`
        : resolved.commerce.type === "affiliate"
        ? resolved.commerce.url
          ? `${retailerLabel} link ready`
          : "Retailer link missing"
        : resolved.commerce.type === "shopify"
          ? resolved.commerce.variantId && resolved.commerce.available
            ? "Checkout mapping ready"
            : "Shopify variant missing"
          : "Not buyable";
    const hasValidCommerce = Boolean(purchaseOption?.affiliateUrl) || isValidCommerce(resolved.commerce);
    const cartStatusLabel = hasValidCommerce
      ? resolved.commerce.type === "shopify"
        ? item.includeInCheckout ?? true
          ? "Cart-ready"
          : "Not in cart"
        : "Retailer link"
      : "Needs commerce";
    const warningLabel = hasValidCommerce
      ? undefined
      : resolved.commerce.type === "not_buyable"
        ? resolved.commerce.reason
        : "Missing validated commerce mapping";
    const fallbackImageUrl = product.assets.thumbUrl ?? null;
    const imageUrl =
      purchaseOption?.imageUrl ?? resolved.media.thumbUrl ?? resolved.media.galleryImages[0] ?? fallbackImageUrl;

    return [
      {
        instanceId: item.instanceId,
        productId: item.productId,
        variantId: resolved.variantId,
        title: product.title,
        variantLabel: resolved.variant.label,
        purchaseOptionId: purchaseOption?.id,
        purchaseOptionLabel: purchaseOption?.label,
        imageUrl,
        fallbackImageUrl,
        priceLabel:
          linePrice > 0 && (qty > 1 || purchaseOption)
            ? formatMoney(linePrice)
            : getPriceLabel(product, resolved.variantId),
        quantity: qty,
        linePrice,
        compareAtPrice: purchaseOption?.compareAtPriceHint,
        savings: purchaseOption?.savingsHint,
        isBundle: Boolean(purchaseOption && purchaseOption.quantity > 1),
        retailerUrl,
        retailerLabel,
        commerceMode: resolved.commerce.type,
        retailerStatusLabel,
        includeInCheckout: item.includeInCheckout ?? true,
        cartStatusLabel,
        hasValidCommerce,
        warningLabel,
        category: mapToTopCategory(product.category, product),
      },
    ];
  });
}
