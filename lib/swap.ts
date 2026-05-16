import { CATALOG_ITEMS } from "@/lib/catalog";

function getPriceHint(productId: string): number {
  const item = CATALOG_ITEMS[productId];
  if (!item) return 0;

  if (item.commerce.type === "affiliate") {
    return item.commerce.data.priceHint ?? 0;
  }

  if (item.commerce.type === "shopify") {
    return 0;
  }

  return 0;
}

export function findSwapOptions(params: {
  productId: string;
  style: string;
  direction: "cheaper" | "premium";
}) {
  const current = CATALOG_ITEMS[params.productId];
  if (!current) return [];

  const styleNorm = params.style.toLowerCase();
  const sameCat = Object.values(CATALOG_ITEMS).filter(
    (item) => item.category === current.category
  );

  const stylePool = sameCat.filter((item) =>
    item.styleTags.some((t) => t.toLowerCase() === styleNorm)
  );

  const pool = stylePool.length ? stylePool : sameCat;
  const sorted = [...pool].sort((a, b) => getPriceHint(a.id) - getPriceHint(b.id));

  const idx = sorted.findIndex((p) => p.id === current.id);
  if (idx === -1) return sorted;

  if (params.direction === "cheaper") {
    return sorted.slice(0, idx).reverse();
  }

  return sorted.slice(idx + 1);
}
