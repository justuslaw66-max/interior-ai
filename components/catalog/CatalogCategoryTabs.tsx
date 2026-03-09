import type { CatalogTopCategory } from "@/lib/catalog/view-builders";
import { getTopCategoryLabel, TOP_CATEGORY_ORDER } from "@/lib/catalog/view-builders";

type Props = {
  selected: CatalogTopCategory;
  onSelect: (category: CatalogTopCategory) => void;
  counts: Partial<Record<CatalogTopCategory, number>>;
};

export default function CatalogCategoryTabs({ selected, onSelect, counts }: Props) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {TOP_CATEGORY_ORDER.map((category) => {
        const active = category === selected;
        return (
          <button
            key={category}
            onClick={() => onSelect(category)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              active
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            {getTopCategoryLabel(category)} ({counts[category] ?? 0})
          </button>
        );
      })}
    </div>
  );
}
