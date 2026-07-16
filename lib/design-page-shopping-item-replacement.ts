import type { DesignItem } from "@/lib/room-types";

export type DesignPageShoppingItemReplacement = {
  productId: string;
  variantId: string;
  purchaseOptionId?: string;
};

/**
 * Replaces a shopping item without disturbing its room placement or quantity.
 * Product-specific configuration is cleared because it cannot safely carry
 * across to a different catalog identity.
 */
export function replaceShoppingItemWithRecommendation(
  items: DesignItem[],
  instanceId: string,
  replacement: DesignPageShoppingItemReplacement
): DesignItem[] {
  return items.map((item) =>
    item.instanceId === instanceId
      ? {
          ...item,
          productId: replacement.productId,
          variantId: replacement.variantId,
          purchaseOptionId: replacement.purchaseOptionId,
          includeInCheckout: true,
          configurationCode: undefined,
          bundleGroupId: undefined,
          bundleRole: undefined,
          bundleQuantity: undefined,
          materialPreset: undefined,
          materialOverrides: undefined,
        }
      : item
  );
}
