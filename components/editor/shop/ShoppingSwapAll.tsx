"use client";

import { Button } from "@/components/ui/Button";
import { productCountLabel, type SwapAllDirection } from "@/lib/shopping-list";

export type ShoppingSwapAllProps = {
  /** Pro: how many products each would swap. Free: null, and the buttons open Pricing. */
  counts: Record<SwapAllDirection, number> | null;
  disabled: boolean;
  onSwapAll: (direction: SwapAllDirection) => void;
};

const DIRECTIONS: readonly SwapAllDirection[] = ["cheaper", "pricier"];

/** Pricing hands focus back to the button that opened it. */
export function swapAllButtonId(direction: SwapAllDirection) {
  return `shopping-swap-all-${direction}`;
}
const LABEL: Record<SwapAllDirection, string> = { cheaper: "Swap all for cheaper", pricier: "Swap all for pricier" };

/**
 * Pro's "Swap all" (UX 4h, J's Q2 (a)): every product that has a cheaper (or pricier) swap, in one
 * step with one Undo. Free users see the buttons with a Pro badge, and a press opens Pricing.
 */
export function ShoppingSwapAll({ counts, disabled, onSwapAll }: ShoppingSwapAllProps) {
  return (
    <div role="group" aria-label="Swap all" data-testid="shopping-swap-all" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      {DIRECTIONS.map((direction) => {
        const count = counts ? counts[direction] : null;
        return (
          <Button
            key={direction}
            id={swapAllButtonId(direction)}
            data-testid={`shopping-swap-all-${direction}`}
            aria-label={count === null ? `${LABEL[direction]}, Pro` : `${LABEL[direction]}, ${productCountLabel(count)}`}
            disabled={disabled || count === 0}
            onClick={() => onSwapAll(direction)}
            className="w-full justify-between"
          >
            <span>{LABEL[direction]}</span>
            {count === null ? (
              <span aria-hidden="true" className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-bold text-white">
                Pro
              </span>
            ) : (
              <span aria-hidden="true" className="text-xs font-normal text-neutral-600">
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
