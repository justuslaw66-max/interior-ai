"use client";

import { ExternalLink } from "lucide-react";
import { GUEST_CHECKOUT_OPENER_ID } from "@/lib/guest-save-prompt";
import { formatSgd } from "@/lib/money-format";
import { productCountLabel, retailerCheckoutNote, type ShoppingList } from "@/lib/shopping-list";
import { shoppingBuyOpenerId } from "@/lib/shopping-list-buy";

export type ShoppingSummaryProps = {
  list: ShoppingList;
  /** Suppliers price the design's surfaces, so the total leaves them out and says so. */
  hasSurfaces?: boolean;
  busy: boolean;
  onBuyAtRetailer: (retailerId: string) => void;
  onCheckoutHere: () => void;
};

const PRIMARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-[15px] font-bold text-white hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

function summaryNote(list: ShoppingList) {
  if (list.retailers.length === 1) return retailerCheckoutNote(list.retailers[0]);
  if (list.retailers.length > 1) return "You check out on each shop's website. Prices and stock are confirmed there.";
  return list.checkoutHere ? "You check out here, with Shopify." : "Nothing here can be bought online yet.";
}

function SummaryActions({ list, busy, onBuyAtRetailer, onCheckoutHere }: ShoppingSummaryProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 lg:w-full">
      {list.retailers.map((retailer) => (
        <button
          key={retailer.id}
          type="button"
          id={shoppingBuyOpenerId(retailer.id)}
          data-testid="shopping-buy"
          data-retailer={retailer.id}
          disabled={busy}
          onClick={() => onBuyAtRetailer(retailer.id)}
          className={PRIMARY}
        >
          Buy at {retailer.name}
          <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      ))}
      {list.checkoutHere ? (
        <button id={GUEST_CHECKOUT_OPENER_ID} type="button" data-testid="checkout-shopify" disabled={busy} onClick={onCheckoutHere} className={PRIMARY}>
          Checkout here ({list.checkoutHere.lines.length})
        </button>
      ) : null}
    </div>
  );
}

/**
 * One total and one way to buy (FU8). On phones it sits at the foot of the list, above the step bar,
 * as in the phone mockup; from `lg` it is the column beside the list.
 */
export function ShoppingSummary(props: ShoppingSummaryProps) {
  const { list } = props;
  return (
    <aside
      aria-label="Summary"
      data-testid="shopping-summary"
      className="sticky bottom-0 z-10 -mx-4 border-t border-neutral-200 bg-white px-4 py-3 shadow-[0_-6px_18px_rgba(23,23,23,0.08)] lg:top-6 lg:mx-0 lg:w-[340px] lg:shrink-0 lg:self-start lg:rounded-2xl lg:border lg:p-5 lg:shadow-none"
    >
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-stretch lg:gap-3.5">
        <div className="flex min-w-0 flex-col gap-0.5 lg:gap-1">
          <span className="text-xs text-neutral-600 lg:text-sm">Total</span>
          <span data-testid="shopping-list-total" className="text-xl font-bold text-neutral-900 lg:text-[32px] lg:leading-[38px] lg:tracking-tight">
            {formatSgd(list.total)}
          </span>
          <span data-testid="shopping-summary-count" className="hidden text-[13px] text-neutral-600 lg:block">
            {productCountLabel(list.productCount)}.{props.hasSurfaces ? " Surfaces are priced separately." : ""}
          </span>
        </div>
        <SummaryActions {...props} />
      </div>
      <p className="mt-3.5 hidden text-[13px] leading-[19px] text-neutral-600 lg:block">{summaryNote(list)}</p>
    </aside>
  );
}
