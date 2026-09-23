import type { CatalogCompareItem } from "@/lib/catalog/compare";
import { getCatalogDrawerFocusAttributes } from "./useCatalogDrawerFocusRestoration";

type Props = {
  items: CatalogCompareItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onPreview: (id: string, opener: HTMLButtonElement) => void;
  onAdd: (id: string, variantId?: string) => void;
};

type AvailableCompareItem = Extract<CatalogCompareItem, { status: "available" }>;
type UnavailableCompareItem = Extract<CatalogCompareItem, { status: "unavailable" }>;

function UnavailableCompareCard({
  item,
  onRemove,
}: {
  item: UnavailableCompareItem;
  onRemove: Props["onRemove"];
}) {
  return (
    <div
      className="rounded-md border border-neutral-200 bg-white p-2"
      data-testid="catalog-compare-unavailable"
    >
      <div className="text-xs font-semibold text-neutral-900">Product unavailable</div>
      <div className="mt-1 text-[11px] text-neutral-500">
        {item.reason === "variant"
          ? "The selected variant is no longer available in the public catalog."
          : "This product is no longer available in the public catalog."}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.productId)}
        className="mt-2 w-full rounded border border-red-200 px-1.5 py-1 text-[10px] text-red-700"
        data-testid={`catalog-compare-remove-${item.productId}`}
      >
        Remove
      </button>
    </div>
  );
}

function AvailableCompareCard({
  item,
  onRemove,
  onPreview,
  onAdd,
}: {
  item: AvailableCompareItem;
  onRemove: Props["onRemove"];
  onPreview: Props["onPreview"];
  onAdd: Props["onAdd"];
}) {
  const card = item.card;
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-2">
      <div className="line-clamp-1 text-xs font-semibold text-neutral-900">{card.title}</div>
      <div className="line-clamp-1 text-[11px] text-neutral-500">{card.brand ?? "Unknown brand"}</div>
      <div className="line-clamp-1 text-[11px] text-neutral-500" data-testid="catalog-compare-variant-label">{card.variantLabel}</div>
      <div className="mt-1 text-[11px] text-neutral-700">{card.priceLabel ?? "External retailer"}</div>
      <div className="text-[11px] text-neutral-500">{card.dimsLabel}</div>
      <div className="mt-1 line-clamp-1 text-[10px] text-neutral-500">{card.badges.join(" • ")}</div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={(event) => onPreview(card.id, event.currentTarget)}
          className="rounded border border-neutral-200 px-1.5 py-1 text-[10px] text-neutral-700"
          data-testid={`catalog-compare-open-${card.id}`}
          {...getCatalogDrawerFocusAttributes({ productId: card.id, action: "details", source: "compare-tray" })}
        >
          Open
        </button>
        <button type="button" onClick={() => onAdd(card.id, card.variantId)} className="rounded bg-neutral-900 px-1.5 py-1 text-[10px] text-white">Add</button>
        <button type="button" onClick={() => onRemove(card.id)} className="rounded border border-red-200 px-1.5 py-1 text-[10px] text-red-700" data-testid={`catalog-compare-remove-${card.id}`}>Remove</button>
      </div>
    </div>
  );
}

export default function CatalogCompareTray(props: Props) {
  const { items, onRemove, onClear, onPreview, onAdd } = props;
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-neutral-300 bg-neutral-50 p-2" data-testid="catalog-compare-tray">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-900">Quick compare ({items.length}/3)</div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-neutral-600 underline-offset-2 hover:underline"
          data-testid="catalog-compare-clear"
        >
          Clear all
        </button>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {items.map((item) =>
          item.status === "available" ? (
            <AvailableCompareCard key={item.productId} item={item} onRemove={onRemove} onPreview={onPreview} onAdd={onAdd} />
          ) : (
            <UnavailableCompareCard key={item.productId} item={item} onRemove={onRemove} />
          )
        )}
      </div>
    </div>
  );
}
