"use client";

type AddHandler = (id: string, variantId?: string, purchaseOptionId?: string) => void;

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
  onChooseSpot?: AddHandler;
  onToggleCompare: (id: string) => void;
  onClose: () => void;
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

/** The drawer's foot: what's being added, Add, then the retailer link and Compare. */
export function CatalogItemDrawerAddSection(props: CatalogItemDrawerAddSectionProps) {
  const { productId, variantId, purchaseOptionId, summary, addQuantity, placesDirectly, onChooseSpot } = props;
  return (
    <div className="border-t border-neutral-100 bg-white px-4 pb-4 pt-3">
      <AddSummary summary={summary} placesDirectly={placesDirectly} />
      <button
        type="button"
        onClick={() => props.onAdd(productId, variantId, purchaseOptionId)}
        data-testid="catalog-detail-add-to-room"
        className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
      >
        {addQuantity > 1 ? `Add set of ${addQuantity} to ${summary.roomLabel}` : `Add to ${summary.roomLabel}`}
      </button>
      {placesDirectly && onChooseSpot ? (
        <button
          type="button"
          data-testid="catalog-detail-choose-spot"
          className="mt-1 min-h-11 w-full text-center text-xs font-semibold text-neutral-700 underline-offset-2 hover:underline"
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
