"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import CatalogSearchInput from "./CatalogSearchInput";
import CatalogFiltersBar from "./CatalogFiltersBar";
import CatalogFilterDrawerInView from "./CatalogFilterDrawerInView";
import CatalogActiveFilterChips from "./CatalogActiveFilterChips";
import CatalogGrid from "./CatalogGrid";
import CatalogItemDrawer from "./CatalogItemDrawer";
import CatalogCompareTray from "./CatalogCompareTray";
import { CATALOG_CARD_ROW_HEIGHT } from "./CatalogCard";
import { CatalogCategoryChips } from "./CatalogCategoryChips";
import { CatalogEmptyState } from "./CatalogEmptyState";
import { useCatalogMemory } from "./useCatalogMemory";
import {
  buildCatalogCardView,
  buildCatalogDetailView,
  collectFilterFacets,
  deriveSeatCount,
  filterCatalogItems,
  getSofaSeatCapacityBucket,
  mapToTopCategory,
  type CatalogCardView,
  type CatalogDetailView,
  type CatalogFilterState,
  type CatalogTopCategory,
  type SofaSeatCapacityBucket,
} from "@/lib/catalog/view-builders";
import {
  buildCatalogChips,
  catalogResultsLabel,
  orderCatalogCategories,
  selectedCatalogChip,
  sortByCategoryOrder,
  type CatalogCategoryChoice,
  type CatalogChipId,
} from "@/lib/catalog/category-chips";
import { buildCatalogRecommendationSet } from "@/lib/catalog/recommendations";
import { track, trackProductEvent } from "@/lib/analytics";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { trackVariantIssues } from "@/lib/catalog/variant-observability";
import {
  getCatalogConfigurationLabel,
  groupCatalogItems,
} from "@/lib/catalog/family-grouping";
import { useCatalogFilterNavigation } from "@/lib/catalog/filter-navigation";
import { resolveCatalogCompareItems } from "@/lib/catalog/compare";
import { useCatalogDrawerPreviewFocus } from "./useCatalogDrawerFocusRestoration";

const GRID_HEIGHT = 540;

type Props = {
  items: CatalogItemSchema[];
  canEdit: boolean;
  onAddToRoom: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  /** Consumers: Add places the product, and the drawer offers "Choose where it goes" (FU4). */
  directAdd?: boolean;
  onAutoPlaceInRoom?: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onPreviewPlacementIntent?: (productId: string | null, variantId?: string) => void;
  onCatalogDragStart?: (productId: string, variantId?: string) => void;
  onCatalogDragEnd?: () => void;
  activeRoomName?: string;
  /** The room's own categories, which the chips list first. */
  recommendedCategoryIds?: CatalogTopCategory[];
  selectedCategory?: CatalogCategoryChoice;
  onSelectedCategoryChange?: (category: CatalogCategoryChoice) => void;
  navigationRevision?: string;
  activeRoomProductQuantities?: Record<string, number>;
  activeRoomVariantQuantities?: Record<string, number>;
  /** Shown beside the search: Furnish puts Suggest a layout there (ST12). */
  searchAside?: ReactNode;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function hasActiveCatalogFilters(filters: CatalogFilterState) {
  return Object.entries(filters).some(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(value);
  });
}

function countActiveCatalogFilters(filters: CatalogFilterState) {
  const rawCount = Object.values(filters).reduce<number>((count, value) => {
    if (Array.isArray(value)) return count + (value.length > 0 ? 1 : 0);
    if (typeof value === "number") return count + (Number.isFinite(value) ? 1 : 0);
    return count + (value ? 1 : 0);
  }, 0);
  const groupedRangeDuplicates =
    (
      typeof filters.priceMin === "number" &&
      Number.isFinite(filters.priceMin) &&
      typeof filters.priceMax === "number" &&
      Number.isFinite(filters.priceMax)
        ? 1
        : 0
    ) +
    (
      typeof filters.widthMinCm === "number" &&
      Number.isFinite(filters.widthMinCm) &&
      typeof filters.widthMaxCm === "number" &&
      Number.isFinite(filters.widthMaxCm)
        ? 1
        : 0
    );
  return rawCount - groupedRangeDuplicates;
}

export default function CatalogPanel({
  items,
  canEdit,
  onAddToRoom, directAdd = false,
  onAutoPlaceInRoom,
  onPreviewPlacementIntent,
  onCatalogDragStart,
  onCatalogDragEnd,
  activeRoomName,
  recommendedCategoryIds = [],
  selectedCategory: controlledSelectedCategory,
  onSelectedCategoryChange,
  navigationRevision = "catalog:0",
  activeRoomProductQuantities = {},
  activeRoomVariantQuantities = {},
  searchAside,
}: Props) {
  const [rawSearch, setRawSearch] = useState("");
  const [internalSelectedCategory, setInternalSelectedCategory] = useState<CatalogCategoryChoice>("all");
  const selectedCategory = controlledSelectedCategory ?? internalSelectedCategory;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFinishId, setSelectedFinishId] = useState<string | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { favoriteIds, recentIds, memoryScope, setMemoryScope, toggleFavorite, rememberRecent } = useCatalogMemory();
  const [detailPrefetchMap, setDetailPrefetchMap] = useState<Record<string, CatalogDetailView>>({});
  const [variantSelectionByItem, setVariantSelectionByItem] = useState<Record<string, string>>({});
  const catalogGridRef = useRef<HTMLDivElement>(null);

  const resetCatalogScroll = useCallback(() => {
    setScrollTop(0);
    if (catalogGridRef.current) catalogGridRef.current.scrollTop = 0;
  }, []);

  const debouncedSearch = useDebouncedValue(rawSearch, 180);

  useEffect(() => {
    trackProductEvent("catalog_opened", {
      source: "furnish_panel",
      itemCount: items.length,
    });
  }, [items.length]);

  const facets = useMemo(() => collectFilterFacets(items), [items]);

  const allCatalogFamilies = useMemo(() => groupCatalogItems(items), [items]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CatalogTopCategory, number>> = {};
    for (const { representative: item } of allCatalogFamilies) {
      const top = mapToTopCategory(item.category, item);
      counts[top] = (counts[top] ?? 0) + 1;
    }
    return counts;
  }, [allCatalogFamilies]);
  const activeRoomLabel = activeRoomName?.trim() || "room";
  const orderedCategories = useMemo(
    () => orderCatalogCategories(categoryCounts, recommendedCategoryIds),
    [categoryCounts, recommendedCategoryIds]
  );
  const selectedCategoryScope = useMemo(
    () => (selectedCategory === "all" ? orderedCategories : [selectedCategory]),
    [orderedCategories, selectedCategory]
  );
  const showSofaSeatCapacityFilter = selectedCategoryScope.includes("sofa");
  const {
    applicableFilters,
    clearAllFilters: clearCatalogFilters,
    clearFilterKey: clearCatalogFilterKey,
    clearFiltersForScope,
    patchFilters,
  } = useCatalogFilterNavigation(selectedCategoryScope, navigationRevision);
  const hasSearchTerm = rawSearch.trim().length > 0;
  const hasActiveFilters = useMemo(() => hasActiveCatalogFilters(applicableFilters), [applicableFilters]);
  const activeFilterCount = useMemo(() => countActiveCatalogFilters(applicableFilters), [applicableFilters]);

  const itemById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const scopedItems = useMemo(() => {
    if (memoryScope === "all") return items;
    const scopedIds = memoryScope === "favorites" ? favoriteIds : recentIds;
    return scopedIds.map((id) => itemById.get(id)).filter((entry): entry is CatalogItemSchema => Boolean(entry));
  }, [favoriteIds, itemById, items, memoryScope, recentIds]);

  const effectiveFilters = useMemo<CatalogFilterState>(
    () => ({
      ...applicableFilters,
      category: memoryScope === "all" && selectedCategory !== "all" ? [selectedCategory] : undefined,
    }),
    [applicableFilters, memoryScope, selectedCategory]
  );

  const searchScopedFilters = useMemo(() => {
    if (!debouncedSearch.trim()) return effectiveFilters;
    return { ...effectiveFilters, category: undefined };
  }, [debouncedSearch, effectiveFilters]);

  const sofaSeatCapacityCounts = useMemo<Record<SofaSeatCapacityBucket, number>>(() => {
    const filtersWithoutSeatCapacity = { ...searchScopedFilters };
    delete filtersWithoutSeatCapacity.sofaSeatCapacityBuckets;
    const sofaCandidates = filterCatalogItems(scopedItems, debouncedSearch, {
      ...filtersWithoutSeatCapacity,
      category: ["sofa"],
    });
    const counts: Record<SofaSeatCapacityBucket, number> = {
      "2": 0,
      "3": 0,
      "4_plus": 0,
    };

    for (const family of groupCatalogItems(sofaCandidates)) {
      const familyBuckets = new Set<SofaSeatCapacityBucket>();
      for (const item of family.items) {
        const bucket = getSofaSeatCapacityBucket(deriveSeatCount(item));
        if (bucket) familyBuckets.add(bucket);
      }
      for (const bucket of familyBuckets) counts[bucket] += 1;
    }

    return counts;
  }, [debouncedSearch, scopedItems, searchScopedFilters]);

  const filteredItems = useMemo(() => {
    return filterCatalogItems(scopedItems, debouncedSearch, searchScopedFilters);
  }, [scopedItems, debouncedSearch, searchScopedFilters]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (term.length < 2) return;
    trackProductEvent("product_searched", {
      source: "catalog",
      resultCount: filteredItems.length,
    });
  }, [debouncedSearch, filteredItems.length]);

  // "All" lists the room's own categories first; Favourites and Recent keep their own order.
  const filteredFamilies = useMemo(() => {
    const families = groupCatalogItems(filteredItems);
    if (memoryScope !== "all") return families;
    return sortByCategoryOrder(
      families,
      (family) => mapToTopCategory(family.representative.category, family.representative),
      orderedCategories
    );
  }, [filteredItems, memoryScope, orderedCategories]);

  const familyByItemId = useMemo(() => {
    const map = new Map<string, (typeof filteredFamilies)[number]>();
    for (const family of filteredFamilies) {
      for (const item of family.items) map.set(item.id, family);
    }
    return map;
  }, [filteredFamilies]);

  const cardViews = useMemo<CatalogCardView[]>(() => {
    return filteredFamilies.map((family) => ({
      ...buildCatalogCardView(
        family.representative,
        variantSelectionByItem[family.representative.id],
      ),
      title: family.displayTitle,
      configurationCount: family.items.length,
    }));
  }, [filteredFamilies, variantSelectionByItem]);

  // A card is "In this room" when any of its family's products is placed there.
  const roomQuantityById = useMemo(
    () =>
      Object.fromEntries(
        filteredFamilies.map((family) => [
          family.representative.id,
          family.items.reduce((total, item) => total + (activeRoomProductQuantities[item.id] ?? 0), 0),
        ])
      ),
    [activeRoomProductQuantities, filteredFamilies]
  );

  const cardById = useMemo(() => {
    return new Map(cardViews.map((card) => [card.id, card]));
  }, [cardViews]);

  const allCardById = useMemo(() => {
    return new Map(
      items.map((item) => [item.id, buildCatalogCardView(item, variantSelectionByItem[item.id])] as const)
    );
  }, [items, variantSelectionByItem]);

  const chips = useMemo(
    () =>
      buildCatalogChips({
        categories: orderedCategories,
        favoritesCount: favoriteIds.filter((id) => itemById.has(id)).length,
        recentCount: recentIds.filter((id) => itemById.has(id)).length,
      }),
    [favoriteIds, itemById, orderedCategories, recentIds]
  );

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return items.find((item) => item.id === selectedId) ?? null;
  }, [selectedId, items]);

  const compareItems = useMemo(
    () => resolveCatalogCompareItems(compareIds, allCardById, variantSelectionByItem),
    [allCardById, compareIds, variantSelectionByItem],
  );

  const selectedDetail = useMemo(() => {
    if (!selectedItem) return null;
    const prefetch = detailPrefetchMap[selectedItem.id];
    const current = buildCatalogDetailView(selectedItem, variantSelectionByItem[selectedItem.id]);
    if (prefetch && (prefetch.images.length > 0 || current.images.length === 0)) {
      return prefetch;
    }
    return current;
  }, [selectedItem, detailPrefetchMap, variantSelectionByItem]);

  const selectedConfigurationOptions = useMemo(() => {
    if (!selectedItem) return [];
    const family = familyByItemId.get(selectedItem.id);
    if (!family || family.items.length < 2) return [];
    return family.items.map((item) => {
      const card = buildCatalogCardView(item, variantSelectionByItem[item.id]);
      return {
        productId: item.id,
        label: getCatalogConfigurationLabel(item),
        thumbUrl: card.thumbUrl ?? undefined,
        dimsLabel: card.dimsLabel,
      };
    });
  }, [familyByItemId, selectedItem, variantSelectionByItem]);

  const handleSetConfiguration = (productId: string) => {
    const target = itemById.get(productId);
    if (!target) return;

    const currentVariant = selectedItem
      ? resolveCatalogVariant(selectedItem, variantSelectionByItem[selectedItem.id]).variant
      : null;
    const matchingVariant = currentVariant
      ? target.variants.find(
          (variant) =>
            variant.finishCode?.trim().toLowerCase() ===
            currentVariant.finishCode?.trim().toLowerCase(),
        )
      : undefined;
    const nextVariantId = matchingVariant?.id ?? target.defaultVariantId;
    setVariantSelectionByItem((prev) => ({ ...prev, [productId]: nextVariantId }));
    setSelectedFinishId(nextVariantId);
    setSelectedId(productId);
    rememberRecent(productId);
  };

  const activeFinishId = useMemo(() => {
    if (!selectedDetail) return undefined;
    if (selectedFinishId) return selectedFinishId;
    return selectedDetail.variantId ?? selectedDetail.finishOptions[0]?.id;
  }, [selectedDetail, selectedFinishId]);

  const handleSetSize = (sizeId: string) => {
    if (!selectedId) return;
    const selected = items.find((item) => item.id === selectedId);
    if (!selected) return;

    const requestedSize = selectedDetail?.sizeOptions.find((size) => size.id === sizeId);
    if (!requestedSize || !requestedSize.variantIds.length) return;

    const currentVariant =
      selected.variants.find((variant) => variant.id === (activeFinishId ?? selected.defaultVariantId)) ??
      selected.variants.find((variant) => variant.id === selected.defaultVariantId) ??
      selected.variants[0];
    const currentFinishCode = currentVariant?.finishCode?.trim().toLowerCase();
    const currentFinishLabel = currentVariant?.label?.trim().toLowerCase();

    const candidateVariants = requestedSize.variantIds
      .map((variantId) => selected.variants.find((variant) => variant.id === variantId))
      .filter((variant): variant is CatalogItemSchema['variants'][number] => Boolean(variant));

    const matchedByCode =
      currentFinishCode
        ? candidateVariants.find((variant) => variant.finishCode?.trim().toLowerCase() === currentFinishCode)
        : undefined;
    const matchedByLabel =
      currentFinishLabel
        ? candidateVariants.find((variant) => variant.label.trim().toLowerCase() === currentFinishLabel)
        : undefined;
    const matchedByMaterial =
      currentVariant?.materialType
        ? candidateVariants.find((variant) => variant.materialType === currentVariant.materialType)
        : undefined;

    const targetVariant = matchedByCode ?? matchedByLabel ?? matchedByMaterial ?? candidateVariants[0];
    if (!targetVariant) return;

    setSelectedFinishId(targetVariant.id);
    trackVariantIssues(resolveCatalogVariant(selected, targetVariant.id), {
      surface: "catalog_detail_size_picker",
      requestedVariantId: targetVariant.id,
    });
    setVariantSelectionByItem((prev) => ({ ...prev, [selectedId]: targetVariant.id }));
    setDetailPrefetchMap((prev) => ({
      ...prev,
      [selectedId]: buildCatalogDetailView(selected, targetVariant.id),
    }));
  };

  const relatedSections = useMemo(() => {
    if (!selectedId) return [];
    const set = buildCatalogRecommendationSet(selectedId);

    return [
      { title: "Similar items", ids: set.similar },
      { title: "Cheaper alternatives", ids: set.cheaper },
      { title: "Pricier alternatives", ids: set.premium },
      { title: "Works well with", ids: set.coordination },
    ];
  }, [selectedId]);

  const totalRows = Math.ceil(cardViews.length / 2);
  const visibleRows = Math.ceil(GRID_HEIGHT / CATALOG_CARD_ROW_HEIGHT) + 2;
  const startRow = Math.max(0, Math.floor(scrollTop / CATALOG_CARD_ROW_HEIGHT) - 1);
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * 2;
  const endIndex = Math.min(cardViews.length, endRow * 2);
  const topPad = startRow * CATALOG_CARD_ROW_HEIGHT;
  const bottomPad = Math.max(0, (totalRows - endRow) * CATALOG_CARD_ROW_HEIGHT);

  const clearFilterKey = (key: keyof CatalogFilterState) => {
    clearCatalogFilterKey(key);
    resetCatalogScroll();
  };

  const clearAllFilters = () => {
    clearCatalogFilters();
    resetCatalogScroll();
  };

  const handleFilterPatch = (patch: Partial<CatalogFilterState>) => {
    patchFilters(patch);
    resetCatalogScroll();
  };

  const handleSelectChip = (chip: CatalogChipId) => {
    resetCatalogScroll();
    if (chip === "favorites" || chip === "recent") {
      setMemoryScope(chip);
      track("catalog_memory_scope_change", { scope: chip });
      return;
    }
    setMemoryScope("all");
    clearFiltersForScope(chip === "all" ? orderedCategories : [chip]);
    setInternalSelectedCategory(chip);
    onSelectedCategoryChange?.(chip);
  };

  const prefetchDetail = (id: string) => {
    if (detailPrefetchMap[id]) return;
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const requestedVariantId = variantSelectionByItem[id];
    trackVariantIssues(resolveCatalogVariant(item, requestedVariantId), {
      surface: "catalog_panel_prefetch",
      requestedVariantId,
    });
    setDetailPrefetchMap((prev) => {
      if (prev[id]) return prev;
      return {
        ...prev,
        [id]: buildCatalogDetailView(item, variantSelectionByItem[id]),
      };
    });
  };

  const { focusRestoration, clearFocusRestoration, openCatalogDrawerPreview } = useCatalogDrawerPreviewFocus({ variantSelectionByItem,
    onSelect: (id, variantId) => { setSelectedId(id); setSelectedFinishId(variantId); },
    onPrefetch: prefetchDetail });
  const closeCatalogDrawer = () => { setSelectedId(null); clearFocusRestoration(); };
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

  const addRememberedItem = (id: string, variantId?: string) => {
    rememberRecent(id);
    const product = itemById.get(id);
    trackProductEvent("product_placed", {
      source: "catalog",
      category: product?.category,
      result: "success",
    });
    onAddToRoom(id, variantId ?? variantSelectionByItem[id]);
  };

  return (
    <div className="relative" data-catalog-drawer-focus-scope>
      <div className="flex items-center gap-1.5">
        <CatalogSearchInput value={rawSearch} onChange={setRawSearch} />
        {searchAside}
      </div>

      <div className="mt-3">
        <CatalogCategoryChips
          chips={chips}
          selected={selectedCatalogChip(memoryScope, selectedCategory)}
          onSelect={handleSelectChip}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div data-testid="catalog-focused-category-pill" className="text-xs text-neutral-600" aria-live="polite">
          {catalogResultsLabel(cardViews.length)}
        </div>
        <CatalogFiltersBar
          onToggleDrawer={() => setFiltersOpen((value) => !value)}
          activeFilterCount={activeFilterCount}
        />
      </div>

      <CatalogActiveFilterChips
        filters={effectiveFilters}
        onClearKey={clearFilterKey}
        onClearAll={clearAllFilters}
      />

      <CatalogFilterDrawerInView
        open={filtersOpen}
        filters={applicableFilters}
        brands={facets.brands}
        styles={facets.styles}
        materials={facets.materials}
        showSofaSeatCapacityFilter={showSofaSeatCapacityFilter}
        sofaSeatCapacityCounts={sofaSeatCapacityCounts}
        onClose={() => setFiltersOpen(false)}
        onPatch={handleFilterPatch}
      />

      <div
        ref={catalogGridRef} tabIndex={-1} data-testid="catalog-results-focus-target" data-catalog-drawer-focus-fallback
        className="mt-2 overflow-y-auto"
        style={{ maxHeight: GRID_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <CatalogGrid
          items={cardViews}
          virtual={{ start: startIndex, end: endIndex, topPad, bottomPad }}
          roomLabel={activeRoomLabel}
          roomQuantityById={roomQuantityById}
          favoriteIds={favoriteIds}
          onPreview={(id, opener) => openCatalogDrawerPreview(id, "product-card", opener)}
          onAdd={(id) => addRememberedItem(id)}
          onToggleFavorite={toggleFavorite}
          onPrefetch={prefetchDetail}
          onPreviewIntent={(id) =>
            onPreviewPlacementIntent?.(id, id ? variantSelectionByItem[id] : undefined)
          }
          onCatalogDragStart={(id) => onCatalogDragStart?.(id, variantSelectionByItem[id])}
          onCatalogDragEnd={onCatalogDragEnd}
        />
        {!cardViews.length ? (
          <CatalogEmptyState
            scope={memoryScope}
            hasSearchTerm={hasSearchTerm}
            hasActiveFilters={hasActiveFilters}
            onBrowseAll={() => handleSelectChip("all")}
            onClearSearch={() => {
              setRawSearch("");
              resetCatalogScroll();
            }}
            onClearFilters={clearAllFilters}
          />
        ) : null}
      </div>

      <CatalogCompareTray
        items={compareItems}
        onRemove={(id) => {
          track("catalog_compare_remove", { itemId: id, source: "tray" });
          setCompareIds((prev) => prev.filter((entry) => entry !== id));
        }}
        onClear={() => {
          track("catalog_compare_clear", { itemCount: compareIds.length });
          setCompareIds([]);
        }}
        onPreview={(id, opener) => {
          track("catalog_compare_open", { itemId: id, source: "tray" });
          openCatalogDrawerPreview(id, "compare-tray", opener);
        }}
        onAdd={(id, variantId) => {
          track("catalog_compare_add_to_room", { itemId: id, source: "tray" });
          addRememberedItem(id, variantId);
        }}
      />

      <CatalogItemDrawer
        open={Boolean(selectedId)}
        detail={selectedDetail}
        activeFinishId={activeFinishId}
        activeRoomName={activeRoomName}
        roomProductQuantity={selectedId ? activeRoomProductQuantities[selectedId] ?? 0 : 0}
        roomVariantQuantity={
          selectedDetail ? activeRoomVariantQuantities[`${selectedDetail.id}:${selectedDetail.variantId}`] ?? 0 : 0
        }
        relatedSections={relatedSections}
        isCompared={selectedId ? compareIds.includes(selectedId) : false}
        placesDirectly={directAdd} onChooseSpot={onAutoPlaceInRoom} favourite={selectedDetail ? { title: selectedDetail.title, isFavorite: favoriteIds.includes(selectedDetail.id), onToggle: () => toggleFavorite(selectedDetail.id) } : undefined}
        focusRestoration={focusRestoration}
        onClose={closeCatalogDrawer}
        configurationOptions={selectedConfigurationOptions}
        onSetConfiguration={handleSetConfiguration}
        onSetSize={handleSetSize}
        onSetFinish={(finishId, finish) => {
          if (!selectedId) return;
          const targetVariantId = finish.variantId ?? finishId;
          const targetProductId = finish.productId;
          if (targetProductId && targetProductId !== selectedId) {
            const siblingItem = items.find((item) => item.id === targetProductId);
            if (siblingItem) {
              setSelectedId(siblingItem.id);
              setSelectedFinishId(finishId);
              setVariantSelectionByItem((prev) => ({ ...prev, [siblingItem.id]: targetVariantId }));
              trackVariantIssues(resolveCatalogVariant(siblingItem, targetVariantId), {
                surface: "catalog_detail_finish_picker",
                requestedVariantId: targetVariantId,
              });
              setDetailPrefetchMap((prev) => ({
                ...prev,
                [siblingItem.id]: buildCatalogDetailView(siblingItem, targetVariantId),
              }));
              return;
            }
          }

          // Check if this finish belongs to a sibling product (e.g. Hugg fabric switch)
          const currentSelected = items.find((item) => item.id === selectedId);
          const isCurrentVariant = currentSelected?.variants.some((v) => v.id === targetVariantId);
          if (!isCurrentVariant) {
            const siblingItem = items.find(
              (item) => item.id !== selectedId && item.variants.some((v) => v.id === targetVariantId)
            );
            if (siblingItem) {
              setSelectedId(siblingItem.id);
              setSelectedFinishId(finishId);
              setVariantSelectionByItem((prev) => ({ ...prev, [siblingItem.id]: targetVariantId }));
              setDetailPrefetchMap((prev) => ({
                ...prev,
                [siblingItem.id]: buildCatalogDetailView(siblingItem, targetVariantId),
              }));
              return;
            }
          }
          setSelectedFinishId(finishId);
          const selected = currentSelected;
          if (selected) {
            trackVariantIssues(resolveCatalogVariant(selected, targetVariantId), {
              surface: "catalog_detail_finish_picker",
              requestedVariantId: targetVariantId,
            });
          }
          setVariantSelectionByItem((prev) => ({ ...prev, [selectedId]: targetVariantId }));
          if (!selected) return;
          setDetailPrefetchMap((prev) => ({
            ...prev,
            [selectedId]: buildCatalogDetailView(selected, targetVariantId),
          }));
        }}
        onAdd={(id, variantId, purchaseOptionId) => {
          if (compareIds.includes(id)) {
            track("catalog_compare_add_to_room", { itemId: id, source: "drawer" });
          }
          rememberRecent(id);
          onAddToRoom(id, variantId ?? variantSelectionByItem[id], purchaseOptionId);
          closeCatalogDrawer();
        }}
        onToggleCompare={toggleCompare}
        onPreviewRelated={(id) => {
          if (!cardById.has(id)) return;
          setSelectedId(id);
          setSelectedFinishId(variantSelectionByItem[id]);
          prefetchDetail(id);
        }}
      />

      {!canEdit && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-white/50" aria-hidden />
      )}
    </div>
  );
}
