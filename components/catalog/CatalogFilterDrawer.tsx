import type {
  CatalogFilterState,
  SofaSeatCapacityBucket,
} from "@/lib/catalog/view-builders";

type Props = {
  open: boolean;
  filters: CatalogFilterState;
  brands: string[];
  styles: string[];
  materials: string[];
  showSofaSeatCapacityFilter: boolean;
  sofaSeatCapacityCounts: Record<SofaSeatCapacityBucket, number>;
  onClose: () => void;
  onPatch: (patch: Partial<CatalogFilterState>) => void;
};

const SOFA_SEAT_CAPACITY_OPTIONS: Array<{
  value: SofaSeatCapacityBucket;
  label: string;
}> = [
  { value: "2", label: "2 seater" },
  { value: "3", label: "3 seater" },
  { value: "4_plus", label: "4+ seater" },
];

export default function CatalogFilterDrawer({
  open,
  filters,
  brands,
  styles,
  materials,
  showSofaSeatCapacityFilter,
  sofaSeatCapacityCounts,
  onClose,
  onPatch,
}: Props) {
  if (!open) return null;

  return (
    <div
      data-testid="catalog-filter-drawer"
      className="absolute left-0 right-0 top-24 z-40 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
    >
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-2 flex items-center justify-between border-b border-neutral-100 bg-white px-3 py-3">
        <div className="text-xs font-semibold text-neutral-900">Structured Filters</div>
        <button type="button" onClick={onClose} className="text-xs text-neutral-500">Close</button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex items-center gap-2 rounded border p-2">
          <input
            type="checkbox"
            checked={Boolean(filters.smallRoomFriendly)}
            onChange={(event) => onPatch({ smallRoomFriendly: event.target.checked || undefined })}
          />
          Small-room friendly
        </label>
        <label className="flex items-center gap-2 rounded border p-2">
          <input
            type="checkbox"
            checked={Boolean(filters.starterEligible)}
            onChange={(event) => onPatch({ starterEligible: event.target.checked || undefined })}
          />
          Starter-friendly
        </label>
      </div>

      {showSofaSeatCapacityFilter ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-neutral-500">Seat capacity</legend>
          <div className="mt-1 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            {SOFA_SEAT_CAPACITY_OPTIONS.map((option) => {
              const selectedBuckets = filters.sofaSeatCapacityBuckets ?? [];
              const selected = selectedBuckets.includes(option.value);
              const count = sofaSeatCapacityCounts[option.value];
              const disabled = count === 0 && !selected;

              return (
                <label
                  key={option.value}
                  data-active={selected ? "true" : "false"}
                  className={[
                    "flex min-h-10 items-center gap-2 rounded border px-2 py-2 text-xs transition-colors",
                    selected
                      ? "border-neutral-900 bg-neutral-50 text-neutral-950"
                      : "border-neutral-200 text-neutral-700",
                    disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:border-neutral-400",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    data-testid={`catalog-seat-capacity-${option.value}`}
                    aria-label={option.label}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
                      const nextBuckets = selected
                        ? selectedBuckets.filter((bucket) => bucket !== option.value)
                        : SOFA_SEAT_CAPACITY_OPTIONS
                            .map((entry) => entry.value)
                            .filter((bucket) => (
                              bucket === option.value || selectedBuckets.includes(bucket)
                            ));
                      onPatch({
                        sofaSeatCapacityBuckets: nextBuckets.length > 0 ? nextBuckets : undefined,
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-[10px] text-neutral-400">
                      {count} {count === 1 ? "option" : "options"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <div className="text-neutral-500">Price min (SGD)</div>
          <input
            type="number"
            className="w-full rounded border p-1"
            value={filters.priceMin ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPatch({ priceMin: value ? Number(value) : undefined });
            }}
          />
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Price max (SGD)</div>
          <input
            type="number"
            className="w-full rounded border p-1"
            value={filters.priceMax ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPatch({ priceMax: value ? Number(value) : undefined });
            }}
          />
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Finish color</div>
          <select
            className="w-full rounded border p-1"
            value={filters.colorFamilies?.[0] ?? ""}
            onChange={(event) =>
              onPatch({ colorFamilies: event.target.value ? [event.target.value] : undefined })
            }
          >
            <option value="">Any</option>
            <option value="neutral">Neutral</option>
            <option value="brown">Brown</option>
            <option value="black">Black</option>
            <option value="green">Green</option>
            <option value="blue">Blue</option>
            <option value="red">Red</option>
            <option value="pink">Pink</option>
            <option value="yellow">Yellow</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Brand</div>
          <select
            className="w-full rounded border p-1"
            value={filters.brandIds?.[0] ?? ""}
            onChange={(event) =>
              onPatch({ brandIds: event.target.value ? [event.target.value] : undefined })
            }
          >
            <option value="">Any</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Style</div>
          <select
            className="w-full rounded border p-1"
            value={filters.styleTags?.[0] ?? ""}
            onChange={(event) =>
              onPatch({ styleTags: event.target.value ? [event.target.value] : undefined })
            }
          >
            <option value="">Any</option>
            {styles.map((style) => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Material</div>
          <select
            className="w-full rounded border p-1"
            value={filters.materialFamilies?.[0] ?? ""}
            onChange={(event) =>
              onPatch({ materialFamilies: event.target.value ? [event.target.value] : undefined })
            }
          >
            <option value="">Any</option>
            {materials.map((material) => (
              <option key={material} value={material}>{material}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Width min (cm)</div>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            placeholder="Any"
            className="w-full rounded border p-1"
            value={filters.widthMinCm ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPatch({ widthMinCm: value ? Number(value) : undefined });
            }}
          />
        </label>

        <label className="space-y-1">
          <div className="text-neutral-500">Width max (cm)</div>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            placeholder="Any"
            className="w-full rounded border p-1"
            value={filters.widthMaxCm ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPatch({ widthMaxCm: value ? Number(value) : undefined });
            }}
          />
        </label>
      </div>
    </div>
  );
}
