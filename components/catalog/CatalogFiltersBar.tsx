type Props = {
  onToggleDrawer: () => void;
  filteredCount: number;
  totalCount: number;
};

export default function CatalogFiltersBar({ onToggleDrawer, filteredCount, totalCount }: Props) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button
        onClick={onToggleDrawer}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800"
      >
        Filters
      </button>
      <div className="text-xs text-neutral-500">
        {filteredCount} of {totalCount} items
      </div>
    </div>
  );
}
