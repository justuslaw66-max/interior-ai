"use client";

import type { RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SurfaceBrowserViewMode, SurfaceFilterKey, SurfaceFilterState } from "./surfaceCatalog";
import { getSurfaceSearchColour } from "./surfaceMaterialFilters";

export type SurfaceBrowserFilterBarProps = {
  search: string;
  searchPlaceholder: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  filters: SurfaceFilterState;
  filterOptions: Record<SurfaceFilterKey, string[]>;
  filterDrawerOpen: boolean;
  viewMode: SurfaceBrowserViewMode;
  hasFilters: boolean;
  onSearchChange: (search: string) => void;
  onFilterChange: (key: SurfaceFilterKey, value: string) => void;
  onToggleFilterDrawer: () => void;
  onToggleRecommended: () => void;
  onToggleFavorites: () => void;
  onToggleViewMode: () => void;
  onClear: () => void;
};

const FILTER_SELECTS: ReadonlyArray<[SurfaceFilterKey, string]> = [
  ["brand", "Brand"],
  ["collection", "Collection"],
  ["effect", "Effect"],
  ["size", "Size"],
  ["color", "Color"],
];

function SurfaceFilterSelect({
  filterKey,
  label,
  value,
  options,
  onChange,
}: {
  filterKey: SurfaceFilterKey;
  label: string;
  value: string;
  options: string[];
  onChange: (key: SurfaceFilterKey, value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-control-label-idle">
      {label}
      <select
        data-testid={`surfaces-filter-${filterKey}`}
        value={value}
        className="mt-1 h-9 w-full rounded-lg border border-box-border bg-field px-2 text-xs text-control-label"
        onChange={(event) => onChange(filterKey, event.currentTarget.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A search that is just a colour ("blue", "light wood") is the colour filter (surfaceMaterialFilters.ts), so the chip says so
 * and takes it off (J, 28 Oct 2026).
 */
function SearchColourChip({ colour, onRemove }: { colour: string; onRemove: () => void }) {
  return (
    <Button
      data-testid="surfaces-search-colour"
      size="compact"
      pressed
      aria-label={`Colour: ${colour}. Remove`}
      title="Your search is a colour, so it shows that colour. Remove to search all again."
      onClick={onRemove}
    >
      Colour: {colour}
      <X className="ml-1 h-3 w-3" aria-hidden="true" />
    </Button>
  );
}

/** The quick filters under the search: a search's colour, Recommended, Favourites, the view, and Clear. */
function SurfaceQuickFilters(props: SurfaceBrowserFilterBarProps) {
  const searchColour = getSurfaceSearchColour(props.search);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {searchColour ? <SearchColourChip colour={searchColour} onRemove={() => props.onSearchChange("")} /> : null}
      <Button
        data-testid="surfaces-recommended-filter"
        size="compact"
        pressed={props.filters.recommendedOnly}
        onClick={props.onToggleRecommended}
      >
        Recommended
      </Button>
      <Button
        data-testid="surfaces-favorites-filter"
        size="compact"
        pressed={props.filters.favoritesOnly}
        onClick={props.onToggleFavorites}
      >
        Favourites
      </Button>
      <Button data-testid="surfaces-view-toggle" variant="secondary" size="compact" onClick={props.onToggleViewMode}>
        {props.viewMode === "grid" ? "List" : "Grid"}
      </Button>
      {props.hasFilters ? (
        <Button data-testid="surfaces-clear-filters" variant="secondary" size="compact" onClick={props.onClear}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

/** The surface browser's search, quick filters and filter drawer. */
export function SurfaceBrowserFilterBar(props: SurfaceBrowserFilterBarProps) {
  return (
    <>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="sr-only">Search surface materials</span>
          <input
            ref={props.searchInputRef}
            type="search"
            data-testid="surfaces-search"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.currentTarget.value)}
            placeholder={props.searchPlaceholder}
            className="h-9 w-full rounded-lg border border-box-border bg-field px-2.5 text-sm text-label placeholder:text-label-tertiary"
          />
        </label>
        <Button size="regular" data-testid="surfaces-filter-toggle" onClick={props.onToggleFilterDrawer}>
          Filter
        </Button>
      </div>
      <SurfaceQuickFilters {...props} />
      {props.filterDrawerOpen ? (
        <div data-testid="surfaces-filter-drawer" className="mt-2 grid gap-2 rounded-lg border border-box-border bg-field p-2">
          {FILTER_SELECTS.map(([key, label]) => (
            <SurfaceFilterSelect
              key={key}
              filterKey={key}
              label={label}
              value={props.filters[key] ?? ""}
              options={props.filterOptions[key]}
              onChange={props.onFilterChange}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
