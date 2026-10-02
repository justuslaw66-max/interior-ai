"use client";

import { ExternalLink } from "lucide-react";
import LazyImage from "@/components/common/LazyImage";
import type { SelectedItemSale, SelectedItemSummary } from "@/lib/selected-item-summary";

type SelectedItemSummaryCardProps = {
  summary: SelectedItemSummary;
  /** The product's name as the catalogue shows it, without the brand. */
  title: string;
  locked: boolean;
  onViewProduct: () => void;
};

/** Where the product is sold, in the app's voice: "Sold by Castlery · View product" (UX audit FU12). */
function SelectedItemSaleLine({ sale, onViewProduct }: { sale: SelectedItemSale; onViewProduct: () => void }) {
  if (sale.kind !== "retailer") {
    return (
      <div data-testid="selected-item-availability" data-sale={sale.kind} className="text-[13px] text-neutral-600">
        {sale.kind === "checkout" ? "Checkout here, from your Shopping list" : "Not sold online yet"}
      </div>
    );
  }
  return (
    <div
      data-testid="selected-item-availability"
      data-sale="retailer"
      className="flex flex-wrap items-center gap-x-2 text-[13px] text-neutral-600"
    >
      <span>Sold by {sale.retailer}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        data-testid="selected-item-view-product"
        aria-label={`View product at ${sale.retailer}`}
        title={`Opens ${sale.retailer} in a new tab`}
        onClick={onViewProduct}
        className="inline-flex min-h-8 items-center gap-1 rounded font-bold text-[#1f4fa8] hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        View product
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The selected product as the Furnish mockup shows it: picture, name, price and where it's sold. */
export function SelectedItemSummaryCard({ summary, title, locked, onViewProduct }: SelectedItemSummaryCardProps) {
  return (
    <div data-testid="selected-item-summary" className="flex flex-col gap-3">
      <div className="aspect-[4/3] max-h-36 w-full overflow-hidden rounded-xl bg-[#f4f1eb] md:max-h-none">
        {summary.imageUrl ? (
          <LazyImage
            src={summary.imageUrl}
            fallbackSrc={summary.fallbackImageUrl ?? undefined}
            alt=""
            className="h-full w-full"
            imageClassName="object-contain object-center"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-lg font-bold leading-6 text-neutral-900">{title}</h2>
        <span data-testid="selected-item-price" className="text-lg font-bold text-neutral-900">
          {summary.priceLabel}
        </span>
        <SelectedItemSaleLine sale={summary.sale} onViewProduct={onViewProduct} />
        {locked ? (
          <span className="inline-flex w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">Locked</span>
        ) : null}
      </div>
    </div>
  );
}
