import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CATALOG_FILTER_POPOVER_ID } from "./CatalogFilterDrawer";

/** Filters' id: closing the filter popover returns focus here (UX AX5). */
export const CATALOG_FILTERS_TOGGLE_ID = "catalog-filters-toggle";

type Props = {
  onToggleDrawer: () => void;
  activeFilterCount?: number;
  open?: boolean;
};

export default function CatalogFiltersBar({
  onToggleDrawer,
  activeFilterCount = 0,
  open = false,
}: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        id={CATALOG_FILTERS_TOGGLE_ID}
        size="regular"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? CATALOG_FILTER_POPOVER_ID : undefined}
        onClick={onToggleDrawer}
        className="shrink-0"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filters
        {activeFilterCount > 0 ? (
          <span className="rounded-full bg-control-primary px-1.5 py-0.5 text-xs text-control-on-primary">
            {activeFilterCount}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
