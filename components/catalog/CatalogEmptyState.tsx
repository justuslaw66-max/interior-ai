"use client";

import { Chip } from "@/components/ui/Chip";
import type { CatalogMemoryScope } from "@/lib/catalog/category-chips";

type CatalogEmptyStateProps = {
  scope: CatalogMemoryScope;
  hasSearchTerm: boolean;
  hasActiveFilters: boolean;
  onBrowseAll: () => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
};

function emptyStateCopy(scope: CatalogMemoryScope, narrowed: boolean) {
  if (scope === "favorites") {
    return { title: "No favourites yet", detail: "Tap the heart on a product to keep it here." };
  }
  if (scope === "recent") {
    return { title: "No recently added products yet", detail: "Products you add to a room show up here." };
  }
  return narrowed
    ? { title: "No products match", detail: "Try another word, or clear what narrows the list." }
    : { title: "No products here yet", detail: "Try another category." };
}

/** What the list says when nothing shows, with the way back to products. */
export function CatalogEmptyState(props: CatalogEmptyStateProps) {
  const { scope, hasSearchTerm, hasActiveFilters } = props;
  const copy = emptyStateCopy(scope, hasSearchTerm || hasActiveFilters);
  return (
    <div
      className="mt-2 rounded-lg border border-dashed border-control-handle bg-surface-secondary px-3 py-5 text-center"
      data-testid="catalog-empty-recovery"
    >
      <div className="text-sm font-semibold text-label">{copy.title}</div>
      <div className="mt-1 text-xs text-label-secondary">{copy.detail}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {scope !== "all" ? <Chip onClick={props.onBrowseAll}>Browse all products</Chip> : null}
        {hasSearchTerm ? <Chip onClick={props.onClearSearch}>Clear search</Chip> : null}
        {hasActiveFilters ? <Chip onClick={props.onClearFilters}>Clear filters</Chip> : null}
      </div>
    </div>
  );
}
