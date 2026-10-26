import { Button } from "@/components/ui/Button";
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
      className="rounded-md border border-separator bg-surface-secondary p-2"
      data-testid="catalog-compare-unavailable"
    >
      <div className="text-xs font-semibold text-label">Product unavailable</div>
      <div className="mt-1 text-xs text-label-secondary">
        {item.reason === "variant"
          ? "The selected variant is no longer available in the public catalogue."
          : "This product is no longer available in the public catalogue."}
      </div>
      <Button
        size="compact"
        onClick={() => onRemove(item.productId)}
        className="mt-2 w-full"
        data-testid={`catalog-compare-remove-${item.productId}`}
      >
        Remove
      </Button>
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
    <div className="rounded-md border border-separator bg-surface-secondary p-2">
      <div className="line-clamp-1 text-xs font-semibold text-label">{card.title}</div>
      <div className="line-clamp-1 text-xs text-label-secondary">{card.brand ?? "Unknown brand"}</div>
      <div className="line-clamp-1 text-xs text-label-secondary" data-testid="catalog-compare-variant-label">{card.variantLabel}</div>
      <div className="mt-1 text-xs text-label-secondary">{card.priceLabel ?? "Price on request"}</div>
      <div className="text-xs text-label-secondary">{card.dimsLabel}</div>
      <div className="mt-1 line-clamp-1 text-xs text-label-secondary">{card.badges.join(" • ")}</div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <Button
          size="compact"
          onClick={(event) => onPreview(card.id, event.currentTarget)}
          data-testid={`catalog-compare-open-${card.id}`}
          {...getCatalogDrawerFocusAttributes({ productId: card.id, action: "details", source: "compare-tray" })}
        >
          Open
        </Button>
        <Button variant="primary" size="compact" onClick={() => onAdd(card.id, card.variantId)}>Add</Button>
        <Button size="compact" onClick={() => onRemove(card.id)} data-testid={`catalog-compare-remove-${card.id}`}>Remove</Button>
      </div>
    </div>
  );
}

export default function CatalogCompareTray(props: Props) {
  const { items, onRemove, onClear, onPreview, onAdd } = props;
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-control-secondary-border bg-tile p-2" data-testid="catalog-compare-tray">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-label">Quick compare ({items.length}/3)</div>
        <Button variant="link" size="inline" onClick={onClear} className="min-h-8 text-xs" data-testid="catalog-compare-clear">
          Clear all
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2">
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
