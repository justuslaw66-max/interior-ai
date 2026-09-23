import type { CatalogCardView } from "./view-builders";

export type CatalogCompareProductId = CatalogCardView["id"];
export type CatalogCompareVariantSelection = Readonly<
  Partial<Record<CatalogCompareProductId, CatalogCardView["variantId"]>>
>;

export type CatalogCompareItem =
  | {
      status: "available";
      productId: CatalogCompareProductId;
      card: CatalogCardView;
    }
  | {
      status: "unavailable";
      productId: CatalogCompareProductId;
      reason: "product" | "variant";
    };

export function resolveCatalogCompareItems(
  productIds: readonly CatalogCompareProductId[],
  canonicalCardByProductId: ReadonlyMap<CatalogCompareProductId, CatalogCardView>,
  selectedVariantIdByProductId: CatalogCompareVariantSelection = {},
): CatalogCompareItem[] {
  return productIds.map((productId) => {
    const card = canonicalCardByProductId.get(productId);
    if (!card || card.id !== productId) {
      return { status: "unavailable", productId, reason: "product" };
    }
    const selectedVariantId = selectedVariantIdByProductId[productId];
    if (selectedVariantId && card.variantId !== selectedVariantId) {
      return { status: "unavailable", productId, reason: "variant" };
    }
    return { status: "available", productId, card };
  });
}
