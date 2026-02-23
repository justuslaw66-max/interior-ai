import { CATALOG_ITEMS } from "@/lib/catalog";
import { findSwapOptions } from "@/lib/swap";

export function bulkSwapItems<
  T extends { productId: string; variantId: string; locked?: boolean }
>(params: { items: T[]; style: string; direction: "cheaper" | "premium" }) {
  const { items, style, direction } = params;

  return items.map((it) => {
    if (it.locked) return it;

    const current = CATALOG_ITEMS[it.productId];
    if (!current) return it;

    const opts = findSwapOptions({
      productId: current.id,
      style,
      direction,
    });

    const best = opts[0];
    if (!best) return it;

    return {
      ...it,
      productId: best.id,
      variantId: best.defaultVariantId,
    } as T;
  });
}
