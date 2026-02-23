"use client";

import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import ShopLink from "./ShopLink";

// Helper to group items by category
function groupByCategory(items: any[]) {
  const grouped: Record<string, any[]> = {};
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
function getItemPrice(item: any): string {
  if (!item.product) return "—";
  const commerce = item.product.commerce;
  if (commerce.type === "shopify" || commerce.type === "affiliate") {
    const price = commerce.data?.priceHint;
    if (price) return `$${price}`;
  }
  return "—";
}

// Helper to get retailer link
function getRetailerLink(item: any): { url: string; retailer: string; type: "shopify" | "affiliate" } | null {
  if (!item.product) return null;
  const commerce = item.product.commerce;
  
  if (commerce.type === "shopify") {
    const variant = item.product.variants.find((v: any) => v.id === item.variantId);
    if (variant?.shopifyVariantId) {
      return {
        url: `/api/shopify/checkout?variantId=${variant.shopifyVariantId}&quantity=1`,
        retailer: "Shop",
        type: "shopify"
      };
    }
  } else if (commerce.type === "affiliate") {
    return {
      url: commerce.data?.affiliateUrl || "#",
      retailer: commerce.data?.retailer || "View",
      type: "affiliate"
    };
  }
  return null;
}

export default function ShoppingList({
  items,
  roomName,
}: {
  items: any[];
  roomName: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-800">Shopping List</h3>
      {Object.entries(groupByCategory(items)).map(([category, categoryItems]) => (
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
              {categoryItems.map((item: any) => {
                const variant = item.product?.variants?.find((v: any) => v.id === item.variantId);
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
                    <td className="p-2 text-center">1</td>
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
