"use client";

import { ArrowRight } from "lucide-react";
import { formatSgd } from "@/lib/money-format";

type FurnishFooterProps = {
  roomName: string;
  productCount: number;
  total: number;
  onGoShop: () => void;
};

export function furnishRoomSummary(productCount: number, total: number) {
  if (productCount === 0) return "No products yet";
  return `${productCount} ${productCount === 1 ? "product" : "products"} · ${formatSgd(total)}`;
}

/**
 * The room's products and total, and the way on to Shop, kept at the foot of the panel. Phones
 * leave it out, as in the phone mockup: the products get the room, and Shop is in the step bar.
 */
export function FurnishFooter({ roomName, productCount, total, onGoShop }: FurnishFooterProps) {
  return (
    <div
      data-testid="furnish-footer"
      className="sticky bottom-0 z-10 hidden rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_-6px_18px_rgba(23,23,23,0.08)] md:block"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span data-testid="furnish-active-room-name" className="min-w-0 truncate text-sm font-bold text-neutral-900">
          {roomName}
        </span>
        <span data-testid="furnish-room-total" className="shrink-0 text-sm text-neutral-700">
          {furnishRoomSummary(productCount, total)}
        </span>
      </div>
      <button
        type="button"
        data-testid="furnish-continue-to-shop"
        onClick={onGoShop}
        className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 text-sm font-bold text-white hover:bg-neutral-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        Continue to Shop
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
