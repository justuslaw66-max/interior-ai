import { CATALOG_ITEMS } from "@/lib/catalog";

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
  // For price sorting, we need to extract price from commerce mapping
  const sorted = [...pool].sort((a, b) => {
    const priceA = a.commerce.type === 'shopify' || a.commerce.type === 'affiliate' 
      ? (a.commerce.data as any).priceHint ?? 0 : 0;
    const priceB = b.commerce.type === 'shopify' || b.commerce.type === 'affiliate'
      ? (b.commerce.data as any).priceHint ?? 0 : 0;
    return priceA - priceB;
  });

  const idx = sorted.findIndex((p) => p.id === current.id);
  if (idx === -1) return sorted;

  if (params.direction === "cheaper") {
    return sorted.slice(0, idx).reverse();
  }

  return sorted.slice(idx + 1);
}
