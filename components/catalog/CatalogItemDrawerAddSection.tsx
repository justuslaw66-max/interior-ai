"use client";

import { Heart } from "lucide-react";
import { favouriteLabel } from "./CatalogCard";

type AddHandler = (id: string, variantId?: string, purchaseOptionId?: string) => void;

export type CatalogItemDrawerFavourite = { title: string; isFavorite: boolean; onToggle: () => void };

export type CatalogItemDrawerAddSummary = {
  finishLabel: string;
  optionLabel: string;
  dimsLabel: string;
  roomLabel: string;
  price?: string | null;
  compareAt?: string | null;
};

type CatalogItemDrawerAddSectionProps = {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  summary: CatalogItemDrawerAddSummary;
  addQuantity: number;
  retailerUrl?: string | null;
  isCompared: boolean;
  /** Consumers: Add places the product, with Undo, and "Choose where it goes" opens the preview (FU4). */
  placesDirectly: boolean;
  onAdd: AddHandler;
  /** The product lists are still loading: details can be read, but Add and Choose where it goes wait. */
  addDisabled?: boolean;
  onChooseSpot?: AddHandler;
  onToggleCompare: (id: string) => void;
  onClose: () => void;
  favourite?: CatalogItemDrawerFavourite;
};

const SECONDARY_CLASS =
  "rounded-lg border border-neutral-200 px-3 py-2 text-center text-xs font-semibold text-neutral-700 hover:bg-neutral-50";

function AddSummary({ summary, placesDirectly }: Pick<CatalogItemDrawerAddSectionProps, "summary" | "placesDirectly">) {
  return (
    <div className="mb-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
      {placesDirectly ? null : <span className="font-semibold text-neutral-900">Ready to preview: </span>}
      {summary.finishLabel} · {summary.optionLabel} · {summary.dimsLabel} · {summary.roomLabel}
      {summary.price ? (
        <span className="ml-1 font-semibold text-neutral-900">
          {summary.price}
          {summary.compareAt ? <span className="ml-1 font-medium text-neutral-400 line-through">{summary.compareAt}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/** The heart beside Add (UX 4g, FU3): the card's Favourites, from details too. Favourites stay in this browser. */
function DetailFavourite({ favourite }: { favourite: CatalogItemDrawerFavourite }) {
  return (
    <button
      type="button"
      data-testid="catalog-detail-favorite-toggle"
      aria-pressed={favourite.isFavorite}
      aria-label={favouriteLabel(favourite.title, favourite.isFavorite)}
      className="grid w-12 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-900 hover:bg-neutral-50"
      onClick={favourite.onToggle}
    >
      <Heart className={favourite.isFavorite ? "h-5 w-5 fill-current text-rose-600" : "h-5 w-5"} aria-hidden="true" />
    </button>
  );
}

/** The drawer's foot: what's being added, Add and the heart, then the retailer link and Compare. */
export function CatalogItemDrawerAddSection(props: CatalogItemDrawerAddSectionProps) {
  const { productId, variantId, purchaseOptionId, summary, addQuantity, placesDirectly, onChooseSpot } = props;
  return (
    <div className="border-t border-neutral-100 bg-white px-4 pb-4 pt-3">
      <AddSummary summary={summary} placesDirectly={placesDirectly} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => props.onAdd(productId, variantId, purchaseOptionId)}
          disabled={props.addDisabled}
          data-testid="catalog-detail-add-to-room"
          className="min-w-0 flex-1 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
        >
          {props.addDisabled ? "Loading products…" : addQuantity > 1 ? `Add set of ${addQuantity} to ${summary.roomLabel}` : `Add to ${summary.roomLabel}`}
        </button>
        {props.favourite ? <DetailFavourite favourite={props.favourite} /> : null}
      </div>
      {placesDirectly && onChooseSpot ? (
        <button
          type="button"
          data-testid="catalog-detail-choose-spot"
          disabled={props.addDisabled}
          className="mt-1 min-h-11 w-full text-center text-xs font-semibold text-neutral-700 underline-offset-2 hover:underline disabled:opacity-60"
          onClick={() => {
            onChooseSpot(productId, variantId, purchaseOptionId);
            props.onClose();
          }}
        >
          Choose where it goes
        </button>
      ) : (
        <div className="mt-2 text-center text-[11px] text-neutral-500">
          Next: confirm the placement ghost before it becomes part of the room.
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {props.retailerUrl ? (
          <a href={props.retailerUrl} target="_blank" rel="noreferrer" className={SECONDARY_CLASS}>
            Retailer link
          </a>
        ) : (
          <div className="rounded-lg border border-neutral-100 px-3 py-2 text-center text-xs text-neutral-400">
            No retailer link
          </div>
        )}
        <button
          type="button"
          onClick={() => props.onToggleCompare(productId)}
          className={SECONDARY_CLASS}
          data-testid={`catalog-compare-toggle-drawer-${productId}`}
        >
          {props.isCompared ? "Remove compare" : "Compare"}
        </button>
      </div>
    </div>
  );
}
