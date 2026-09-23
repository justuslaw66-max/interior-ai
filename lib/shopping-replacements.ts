import type { CatalogItemSchema, CatalogPurchaseOption, ProductVariant, RoomTag } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";
import type { RoomType } from "@/lib/room-types";

export type ShoppingReplacementSuggestion = {
  productId: string;
  variantId: string;
  purchaseOptionId?: string;
  title: string;
  variantLabel: string;
  imageUrl: string | null;
  price: number;
  priceLabel: string;
  reason: string;
  retailerUrl?: string;
};

const ROOM_TAG_BY_ROOM_TYPE: Partial<Record<RoomType, RoomTag[]>> = {
  living: ["living_room"],
  bedroom: ["bedroom"],
  dining: ["dining"],
  kitchen: ["dining"],
  custom: [],
};

function getVariantPrice(
  item: CatalogItemSchema,
  variant: ProductVariant,
  purchaseOption?: CatalogPurchaseOption
) {
  const price =
    purchaseOption?.priceHint ??
    variant.priceHint ??
    (item.commerce.type === "affiliate" ? item.commerce.data.priceHint : undefined) ??
    item.metadata?.priceUsd ??
    0;
  return Number.isFinite(price) ? price : 0;
}

function getVariantCommerceUrl(
  item: CatalogItemSchema,
  variant: ProductVariant,
  purchaseOption?: CatalogPurchaseOption
) {
  if (purchaseOption?.affiliateUrl) return purchaseOption.affiliateUrl;
  if (variant.affiliateUrl) return variant.affiliateUrl;
  if (item.commerce.type === "affiliate") return item.commerce.data.url;
  return undefined;
}

function isVariantCommerceReady(
  item: CatalogItemSchema,
  variant: ProductVariant,
  purchaseOption?: CatalogPurchaseOption
) {
  if (purchaseOption) {
    return Boolean(purchaseOption.affiliateUrl && purchaseOption.available !== false);
  }
  const resolved = resolveCatalogVariant(item, variant.id);
  if (resolved.commerce.type === "affiliate") return Boolean(resolved.commerce.url && resolved.commerce.available);
  if (resolved.commerce.type === "shopify") return Boolean(resolved.commerce.variantId && resolved.commerce.available);
  return false;
}

function getDimensionDelta(left: CatalogItemSchema, right: CatalogItemSchema) {
  const leftArea = Math.max(1, left.dimsMm.w * left.dimsMm.d);
  const rightArea = Math.max(1, right.dimsMm.w * right.dimsMm.d);
  return Math.abs(leftArea - rightArea) / leftArea;
}

function formatFallbackPrice(price: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(price);
}

export function buildShoppingReplacementSuggestions({
  item,
  catalogItems,
  roomType,
  limit = 3,
}: {
  item: ActiveRoomShoppingItem;
  catalogItems: CatalogItemSchema[];
  roomType?: RoomType;
  limit?: number;
}): ShoppingReplacementSuggestion[] {
  const sourceProduct = catalogItems.find((candidate) => candidate.id === item.productId);
  if (!sourceProduct) return [];

  const sourceTopCategory = item.category;
  const roomTags = roomType ? ROOM_TAG_BY_ROOM_TYPE[roomType] ?? [] : [];
  const sourcePrice = item.linePrice > 0 ? item.linePrice : 0;

  return catalogItems
    .flatMap((candidate) => {
      if (candidate.id === item.productId) return [];
      const candidateTopCategory = mapToTopCategory(candidate.category, candidate);
      if (candidateTopCategory !== sourceTopCategory) return [];

      const variants = candidate.variants.length > 0 ? candidate.variants : [];
      const scoredVariants = variants.flatMap((variant) => {
        const purchaseOptions = variant.purchaseOptions?.filter((option) => option.available !== false) ?? [];
        const purchasableOptions = purchaseOptions.length > 0 ? purchaseOptions : [undefined];

        return purchasableOptions.flatMap((purchaseOption) => {
          const price = getVariantPrice(candidate, variant, purchaseOption);
          if (price <= 0 || !isVariantCommerceReady(candidate, variant, purchaseOption)) return [];
          const retailerUrl = getVariantCommerceUrl(candidate, variant, purchaseOption);
          if (!retailerUrl) return [];

          const sharedStyles = candidate.styleTags.filter((tag) => sourceProduct.styleTags.includes(tag)).length;
          const sharedTones = candidate.toneTags.filter((tag) => sourceProduct.toneTags.includes(tag)).length;
          const roomFit = roomTags.some((tag) => candidate.roomTags.includes(tag));
          const dimensionDelta = getDimensionDelta(sourceProduct, candidate);
          const priceDelta = sourcePrice > 0 ? Math.abs(price - sourcePrice) / sourcePrice : 0;
          const score =
            100 -
            Math.min(24, dimensionDelta * 20) -
            Math.min(18, priceDelta * 10) +
            sharedStyles * 8 +
            sharedTones * 4 +
            (roomFit ? 10 : 0);
          const reasonParts = [
            "same category",
            sharedStyles > 0 ? "style match" : null,
            roomFit ? "fits this room" : null,
            price <= sourcePrice || sourcePrice === 0 ? "checkout-ready" : "valid checkout",
          ].filter(Boolean);

          return [
            {
              productId: candidate.id,
              variantId: variant.id,
              purchaseOptionId: purchaseOption?.id,
              title: candidate.title,
              variantLabel: purchaseOption?.label ?? variant.label,
              imageUrl: purchaseOption?.imageUrl ?? variant.thumbnailUrl ?? candidate.assets.thumbUrl ?? null,
              price,
              priceLabel: formatFallbackPrice(price),
              reason: reasonParts.join(" · "),
              retailerUrl,
              score,
            },
          ];
        });
      });

      return scoredVariants;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score: _score, ...suggestion }) => suggestion);
}
