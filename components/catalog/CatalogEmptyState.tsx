"use client";

import type { CatalogMemoryScope } from "@/lib/catalog/category-chips";

type CatalogEmptyStateProps = {
  scope: CatalogMemoryScope;
  hasSearchTerm: boolean;
  hasActiveFilters: boolean;
  onBrowseAll: () => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
};

const ACTION_CLASS =
  "min-h-10 rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 md:min-h-8";

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
      className="mt-2 rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-5 text-center"
      data-testid="catalog-empty-recovery"
    >
      <div className="text-sm font-semibold text-neutral-900">{copy.title}</div>
      <div className="mt-1 text-xs text-neutral-600">{copy.detail}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {scope !== "all" ? (
          <button type="button" className={ACTION_CLASS} onClick={props.onBrowseAll}>
            Browse all products
          </button>
        ) : null}
        {hasSearchTerm ? (
          <button type="button" className={ACTION_CLASS} onClick={props.onClearSearch}>
            Clear search
          </button>
        ) : null}
        {hasActiveFilters ? (
          <button type="button" className={ACTION_CLASS} onClick={props.onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
