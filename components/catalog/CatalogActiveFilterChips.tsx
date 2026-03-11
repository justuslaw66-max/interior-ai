import type { CatalogFilterState } from "@/lib/catalog/view-builders";

type Props = {
  filters: CatalogFilterState;
  onClearKey: (key: keyof CatalogFilterState) => void;
  onClearAll: () => void;
};

export default function CatalogActiveFilterChips({ filters, onClearKey, onClearAll }: Props) {
  const chips: Array<{ key: keyof CatalogFilterState; label: string }> = [];

  if (filters.brandIds?.length) chips.push({ key: "brandIds", label: `Brand (${filters.brandIds.length})` });
  if (typeof filters.priceMin === "number" || typeof filters.priceMax === "number") chips.push({ key: "priceMin", label: "Price" });
  if (filters.colorFamilies?.length) chips.push({ key: "colorFamilies", label: `Color (${filters.colorFamilies.length})` });
  if (filters.materialFamilies?.length) chips.push({ key: "materialFamilies", label: `Material (${filters.materialFamilies.length})` });
  if (filters.styleTags?.length) chips.push({ key: "styleTags", label: `Style (${filters.styleTags.length})` });
  if (filters.smallRoomFriendly) chips.push({ key: "smallRoomFriendly", label: "Small-room" });
  if (filters.starterEligible) chips.push({ key: "starterEligible", label: "Starter-friendly" });
  if (filters.curatedOnly) chips.push({ key: "curatedOnly", label: "Curated" });

  if (!chips.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onClearKey(chip.key)}
          className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-700"
        >
          {chip.label} x
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-800"
      >
        Clear all
      </button>
    </div>
  );
}
