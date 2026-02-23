// lib/cart/reconcile.ts
import type { CatalogItemSchema } from "@/lib/catalog/types";

export type CartLine = {
  designItemId: string;
  catalogId: string;
  qty: number;
};

export type ReconciledCartLine =
  | { status: "ok"; line: CartLine; item: CatalogItemSchema }
  | { status: "missing_item"; line: CartLine; reason: string };

export function reconcileCart(
  lines: CartLine[],
  getItem: (id: string) => CatalogItemSchema | undefined
): ReconciledCartLine[] {
  return lines.map((line) => {
    const item = getItem(line.catalogId);
    if (!item) return { status: "missing_item", line, reason: "Catalog item missing" };
    return { status: "ok", line, item };
  });
}
