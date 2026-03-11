"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import CatalogSearchInput from "./CatalogSearchInput";
import CatalogCategoryTabs from "./CatalogCategoryTabs";
import CatalogFiltersBar from "./CatalogFiltersBar";
import CatalogFilterDrawer from "./CatalogFilterDrawer";
import CatalogActiveFilterChips from "./CatalogActiveFilterChips";
import CatalogGrid from "./CatalogGrid";
import CatalogItemDrawer from "./CatalogItemDrawer";
import CatalogCompareTray from "./CatalogCompareTray";
import {
  buildCatalogCardView,
  buildCatalogDetailView,
  collectFilterFacets,
  filterCatalogItems,
  mapToTopCategory,
  type CatalogCardView,
  type CatalogDetailView,
  type CatalogFilterState,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";
import { buildCatalogRecommendationSet } from "@/lib/catalog/recommendations";
import { track } from "@/lib/analytics";

const CARD_ROW_HEIGHT = 282;
const GRID_HEIGHT = 540;

type Props = {
  items: CatalogItemSchema[];
  canEdit: boolean;
  onAddToRoom: (productId: string) => void;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function CatalogPanel({ items, canEdit, onAddToRoom }: Props) {
  const [rawSearch, setRawSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CatalogTopCategory>("sofa");
  const [filters, setFilters] = useState<CatalogFilterState>({ category: ["sofa"] });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFinishId, setSelectedFinishId] = useState<string | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const debouncedSearch = useDebouncedValue(rawSearch, 180);
  const detailPrefetchRef = useRef<Map<string, CatalogDetailView>>(new Map());
  const recommendationCacheRef = useRef<Map<string, ReturnType<typeof buildCatalogRecommendationSet>>>(new Map());

  const facets = useMemo(() => collectFilterFacets(items), [items]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, category: [selectedCategory] }));
  }, [selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CatalogTopCategory, number>> = {};
    for (const item of items) {
      const top = mapToTopCategory(item.category);
      counts[top] = (counts[top] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    return filterCatalogItems(items, debouncedSearch, filters);
  }, [items, debouncedSearch, filters]);

  const cardViews = useMemo<CatalogCardView[]>(() => {
    return filteredItems.map((item) => buildCatalogCardView(item));
  }, [filteredItems]);

  const cardById = useMemo(() => {
    return new Map(cardViews.map((card) => [card.id, card]));
  }, [cardViews]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return items.find((item) => item.id === selectedId) ?? null;
  }, [selectedId, items]);

  const compareCards = useMemo(() => {
    return compareIds
      .map((id) => cardById.get(id))
      .filter((entry): entry is CatalogCardView => Boolean(entry));
  }, [compareIds, cardById]);

  const selectedDetail = useMemo(() => {
    if (!selectedItem) return null;
    const prefetch = detailPrefetchRef.current.get(selectedItem.id);
    return prefetch ?? buildCatalogDetailView(selectedItem);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedDetail) return;
    if (!selectedFinishId && selectedDetail.finishOptions.length > 0) {
      setSelectedFinishId(selectedDetail.finishOptions[0].id);
    }
  }, [selectedDetail, selectedFinishId]);

  const relatedSections = useMemo(() => {
    if (!selectedId) return [];
    let set = recommendationCacheRef.current.get(selectedId);
    if (!set) {
      set = buildCatalogRecommendationSet(selectedId);
      recommendationCacheRef.current.set(selectedId, set);
    }

    return [
      { title: "Similar items", ids: set.similar },
      { title: "Cheaper alternatives", ids: set.cheaper },
      { title: "Premium alternatives", ids: set.premium },
      { title: "Works well with", ids: set.coordination },
    ];
  }, [selectedId]);

  const totalRows = Math.ceil(cardViews.length / 2);
  const visibleRows = Math.ceil(GRID_HEIGHT / CARD_ROW_HEIGHT) + 2;
  const startRow = Math.max(0, Math.floor(scrollTop / CARD_ROW_HEIGHT) - 1);
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * 2;
  const endIndex = Math.min(cardViews.length, endRow * 2);
  const topPad = startRow * CARD_ROW_HEIGHT;
  const bottomPad = Math.max(0, (totalRows - endRow) * CARD_ROW_HEIGHT);

  const clearFilterKey = (key: keyof CatalogFilterState) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (key === "priceMin") {
        delete next.priceMin;
        delete next.priceMax;
        return next;
      }
      delete next[key];
      return next;
    });
  };

  const clearAllFilters = () => {
    setFilters({ category: [selectedCategory] });
  };

  const prefetchDetail = (id: string) => {
    if (detailPrefetchRef.current.has(id)) return;
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    detailPrefetchRef.current.set(id, buildCatalogDetailView(item));
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        track("catalog_compare_remove", { itemId: id, source: "toggle" });
        return prev.filter((entry) => entry !== id);
      }
      if (prev.length >= 3) {
        track("catalog_compare_add", {
          itemId: id,
          source: "toggle",
          replacedItemId: prev[0],
          strategy: "replace_oldest",
        });
        return [...prev.slice(1), id];
      }
      track("catalog_compare_add", { itemId: id, source: "toggle" });
      return [...prev, id];
    });
  };

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-3">
      <div className="text-sm font-semibold text-neutral-900">Catalog</div>
      <div className="mt-2">
        <CatalogSearchInput value={rawSearch} onChange={setRawSearch} />
      </div>

      <div className="mt-2">
        <CatalogCategoryTabs
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          counts={categoryCounts}
        />
      </div>

      <CatalogFiltersBar
        onToggleDrawer={() => setFiltersOpen((value) => !value)}
        filteredCount={cardViews.length}
        totalCount={items.length}
      />

      <CatalogActiveFilterChips
        filters={filters}
        onClearKey={clearFilterKey}
        onClearAll={clearAllFilters}
      />

      <CatalogFilterDrawer
        open={filtersOpen}
        filters={filters}
        brands={facets.brands}
        styles={facets.styles}
        materials={facets.materials}
        onClose={() => setFiltersOpen(false)}
        onPatch={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      <div
        className="mt-3 overflow-y-auto rounded-lg border border-neutral-100 bg-neutral-50/50 p-2"
        style={{ maxHeight: GRID_HEIGHT, minHeight: GRID_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <CatalogGrid
          items={cardViews}
          virtual={{ start: startIndex, end: endIndex, topPad, bottomPad }}
          onPreview={(id) => {
            setSelectedId(id);
            setSelectedFinishId(undefined);
            prefetchDetail(id);
          }}
          onAdd={(id) => onAddToRoom(id)}
          onToggleCompare={toggleCompare}
          compareIds={compareIds}
          onPrefetch={prefetchDetail}
        />
      </div>

      <CatalogCompareTray
        items={compareCards}
        onRemove={(id) => {
          track("catalog_compare_remove", { itemId: id, source: "tray" });
          setCompareIds((prev) => prev.filter((entry) => entry !== id));
        }}
        onClear={() => {
          track("catalog_compare_clear", { itemCount: compareIds.length });
          setCompareIds([]);
        }}
        onPreview={(id) => {
          track("catalog_compare_open", { itemId: id, source: "tray" });
          setSelectedId(id);
          setSelectedFinishId(undefined);
          prefetchDetail(id);
        }}
        onAdd={(id) => {
          track("catalog_compare_add_to_room", { itemId: id, source: "tray" });
          onAddToRoom(id);
        }}
      />

      {!cardViews.length && (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-6 text-center text-xs text-neutral-500">
          No items match your current search and filters.
        </div>
      )}

      <CatalogItemDrawer
        open={Boolean(selectedId)}
        detail={selectedDetail}
        activeFinishId={selectedFinishId}
        relatedSections={relatedSections}
        isCompared={selectedId ? compareIds.includes(selectedId) : false}
        onClose={() => setSelectedId(null)}
        onSetFinish={setSelectedFinishId}
        onAdd={(id) => {
          if (compareIds.includes(id)) {
            track("catalog_compare_add_to_room", { itemId: id, source: "drawer" });
          }
          onAddToRoom(id);
        }}
        onToggleCompare={toggleCompare}
        onPreviewRelated={(id) => {
          if (!cardById.has(id)) return;
          setSelectedId(id);
          setSelectedFinishId(undefined);
          prefetchDetail(id);
        }}
      />

      {!canEdit && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-white/50" aria-hidden />
      )}
    </div>
  );
}
