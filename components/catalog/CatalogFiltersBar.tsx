import { SlidersHorizontal } from "lucide-react";

type Props = {
  onToggleDrawer: () => void;
  activeFilterCount?: number;
};

export default function CatalogFiltersBar({
  onToggleDrawer,
  activeFilterCount = 0,
}: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onToggleDrawer}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filters
        {activeFilterCount > 0 ? (
          <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
