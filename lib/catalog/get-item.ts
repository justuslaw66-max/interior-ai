// lib/catalog/get-item.ts
import { CATALOG_ITEMS } from "@/lib/catalog"; // your normalized map

export function getCatalogItem(id: string) {
  const item = CATALOG_ITEMS[id];
  if (!item) throw new Error(`Unknown catalog item: ${id}`);
  return item;
}

export function getCatalogItemSafe(id: string) {
  return CATALOG_ITEMS[id];
}
