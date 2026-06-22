"use client";

import type { DesignItem } from "@/lib/room-types";
import { resolveRoomShoppingItems } from "@/lib/room-shopping";
import ShopLink from "./ShopLink";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ShoppingList({
  items,
  roomName,
}: {
  items: DesignItem[];
  roomName: string;
}) {
  if (!items || items.length === 0) return null;

  const shoppingItems = resolveRoomShoppingItems({ items });
  if (shoppingItems.length === 0) return null;

  const grouped = shoppingItems.reduce<Record<string, typeof shoppingItems>>((acc, item) => {
    const category = formatCategory(item.category);
    acc[category] = acc[category] ?? [];
    acc[category].push(item);
    return acc;
  }, {});
  const roomSubtotal = shoppingItems.reduce((sum, item) => sum + item.linePrice, 0);
  const needsReviewCount = shoppingItems.filter((item) => !item.hasValidCommerce).length;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Shopping List</h3>
          <div className="text-xs text-gray-500">
            {roomName} • {shoppingItems.length} item{shoppingItems.length === 1 ? "" : "s"}
            {needsReviewCount > 0 ? ` • ${needsReviewCount} need review` : ""}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold text-gray-900">{formatCurrency(roomSubtotal)}</div>
          <div className="text-xs text-gray-500">Estimated subtotal</div>
        </div>
      </div>
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">{category}</h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-center">Qty</th>
                <th className="p-2 text-right">Line total</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-center no-print">Source</th>
              </tr>
            </thead>
            <tbody>
              {categoryItems.map((item) => {
                return (
                  <tr key={item.instanceId} className="border-b">
                    <td className="p-2">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-gray-500">{item.variantLabel}</div>
                      {item.purchaseOptionLabel ? (
                        <div className="text-xs text-gray-500">{item.purchaseOptionLabel}</div>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">{item.quantity}</td>
                    <td className="p-2 text-right">{formatCurrency(item.linePrice)}</td>
                    <td className="p-2 text-left">
                      <div className={item.hasValidCommerce ? "text-green-700" : "text-amber-700"}>
                        {item.retailerStatusLabel}
                      </div>
                      {item.warningLabel ? (
                        <div className="text-xs text-amber-700">{item.warningLabel}</div>
                      ) : null}
                    </td>
                    <td className="p-2 text-center no-print">
                      {item.retailerUrl ? (
                        <ShopLink
                          url={item.retailerUrl}
                          retailer={item.retailerLabel}
                          itemId={item.productId}
                          type={item.commerceMode === "shopify" ? "shopify" : "affiliate"}
                        >
                          {item.retailerLabel}
                        </ShopLink>
                      ) : (
                        <span className="text-xs text-gray-400">Review</span>
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
