"use client";

import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";
import type { DesignItem } from "@/lib/room-types";
import ShopLink from "./ShopLink";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";

type ShoppingItem = DesignItem & { product: CatalogItemSchema };

// Helper to group items by category
function groupByCategory(items: DesignItem[]) {
  const grouped: Record<string, ShoppingItem[]> = {};
  items.forEach((item) => {
    const product = CATALOG_ITEMS_MAP.get(item.productId);
    if (!product) return;
    const category = product.category || "Other";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ ...item, product });
  });
  return grouped;
}

// Helper to get price from item
function getItemPrice(item: ShoppingItem): string {
  if (!item.product) return "—";
  const resolved = resolveCatalogVariant(item.product, item.variantId);
  if (resolved.commerce.type === "affiliate") {
    const price = resolved.commerce.priceHint;
    if (price) return `$${price}`;
  }
  return "—";
}

// Helper to get retailer link
function getRetailerLink(item: ShoppingItem): { url: string; retailer: string; type: "shopify" | "affiliate" } | null {
  if (!item.product) return null;
  const resolved = resolveCatalogVariant(item.product, item.variantId);

  if (resolved.commerce.type === "affiliate") {
    return {
      url: resolved.commerce.url || "#",
      retailer: resolved.commerce.retailer || "View",
      type: "affiliate"
    };
  }
  return null;
}

export default function ShoppingList({
  items,
}: {
  items: DesignItem[];
  roomName: string;
}) {
  if (!items || items.length === 0) return null;

  const grouped = groupByCategory(items);

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-800">Shopping List</h3>
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">{category}</h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-center">Qty</th>
                <th className="p-2 text-right">Price</th>
                <th className="p-2 text-center no-print">Link</th>
              </tr>
            </thead>
            <tbody>
              {categoryItems.map((item) => {
                const resolved = item.product
                  ? resolveCatalogVariant(item.product, item.variantId)
                  : null;
                const variant = resolved?.variant ?? item.product?.variants?.find((v: ProductVariant) => v.id === item.variantId);
                const link = getRetailerLink(item);
                return (
                  <tr key={item.instanceId} className="border-b">
                    <td className="p-2">
                      <div className="font-medium">{item.product?.title || "Unknown"}</div>
                      {variant && (
                        <div className="text-xs text-gray-500">
                          {variant.label}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-center">{item.qty ?? 1}</td>
                    <td className="p-2 text-right">{getItemPrice(item)}</td>
                    <td className="p-2 text-center no-print">
                      {link && (
                        <ShopLink
                          url={link.url}
                          retailer={link.retailer}
                          itemId={item.productId}
                          type={link.type}
                        >
                          {link.retailer}
                        </ShopLink>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
