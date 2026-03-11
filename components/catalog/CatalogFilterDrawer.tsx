import type { CatalogFilterState } from "@/lib/catalog/view-builders";

type Props = {
  open: boolean;
  filters: CatalogFilterState;
  brands: string[];
  styles: string[];
  materials: string[];
  onClose: () => void;
  onPatch: (patch: Partial<CatalogFilterState>) => void;
};

export default function CatalogFilterDrawer({
  open,
  filters,
  brands,
  styles,
  materials,
  onClose,
  onPatch,
}: Props) {
  if (!open) return null;

  return (
    <div className="absolute left-0 right-0 top-24 z-40 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-neutral-900">Structured Filters</div>
        <button onClick={onClose} className="text-xs text-neutral-500">Close</button>
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
        <label className="flex items-center gap-2 rounded border p-2">
          <input
            type="checkbox"
            checked={Boolean(filters.curatedOnly)}
            onChange={(event) => onPatch({ curatedOnly: event.target.checked || undefined })}
          />
          Curated only
        </label>
        <label className="flex items-center gap-2 rounded border p-2">
          <input
            type="checkbox"
            checked={Boolean(filters.wallFriendly)}
            onChange={(event) => onPatch({ wallFriendly: event.target.checked || undefined })}
          />
          Wall-friendly
        </label>
      </div>

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
          <div className="text-neutral-500">Width</div>
          <select
            className="w-full rounded border p-1"
            value={filters.widthBand ?? ""}
            onChange={(event) =>
              onPatch({
                widthBand: (event.target.value || undefined) as "small" | "medium" | "large" | undefined,
              })
            }
          >
            <option value="">Any</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>
    </div>
  );
}
