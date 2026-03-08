type CompareItem = {
  id: string;
  title: string;
  brand: string | null;
  priceLabel?: string;
  dimsLabel: string;
  badges: string[];
};

type Props = {
  items: CompareItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onPreview: (id: string) => void;
  onAdd: (id: string) => void;
};

export default function CatalogCompareTray({ items, onRemove, onClear, onPreview, onAdd }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-neutral-300 bg-neutral-50 p-2" data-testid="catalog-compare-tray">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-900">Quick compare ({items.length}/3)</div>
        <button
          onClick={onClear}
          className="text-xs text-neutral-600 underline-offset-2 hover:underline"
          data-testid="catalog-compare-clear"
        >
          Clear all
        </button>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-neutral-200 bg-white p-2">
            <div className="line-clamp-1 text-xs font-semibold text-neutral-900">{item.title}</div>
            <div className="line-clamp-1 text-[11px] text-neutral-500">{item.brand ?? "Unknown brand"}</div>
            <div className="mt-1 text-[11px] text-neutral-700">{item.priceLabel ?? "External retailer"}</div>
            <div className="text-[11px] text-neutral-500">{item.dimsLabel}</div>
            <div className="mt-1 line-clamp-1 text-[10px] text-neutral-500">{item.badges.join(" • ")}</div>

            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                onClick={() => onPreview(item.id)}
                className="rounded border border-neutral-200 px-1.5 py-1 text-[10px] text-neutral-700"
              >
                Open
              </button>
              <button
                onClick={() => onAdd(item.id)}
                className="rounded bg-neutral-900 px-1.5 py-1 text-[10px] text-white"
              >
                Add
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="rounded border border-red-200 px-1.5 py-1 text-[10px] text-red-700"
                data-testid={`catalog-compare-remove-${item.id}`}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
