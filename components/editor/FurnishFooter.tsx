"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
      <Button
        variant="primary"
        data-testid="furnish-continue-to-shop"
        onClick={onGoShop}
        className="mt-2.5 w-full"
      >
        Continue to Shop
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
