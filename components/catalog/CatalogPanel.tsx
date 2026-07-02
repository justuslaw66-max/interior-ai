"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  getTopCategoryLabel,
  mapToTopCategory,
  type CatalogCardView,
  type CatalogDetailView,
  type CatalogFilterState,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";
import {
  buildCatalogRecommendationSet,
  buildCatalogRoomGuidance,
} from "@/lib/catalog/recommendations";
import { track } from "@/lib/analytics";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { trackVariantIssues } from "@/lib/catalog/variant-observability";

const CARD_ROW_HEIGHT = 282;
const GRID_HEIGHT = 540;
const FAVORITES_STORAGE_KEY = "interior-ai:catalog-favorites";
const RECENTS_STORAGE_KEY = "interior-ai:catalog-recents";
const MAX_RECENTS = 8;
type CatalogMemoryScope = "all" | "favorites" | "recent";
type CatalogSmartFilter = "recommended" | "fits" | "cart_ready" | "retailer_link" | "needs_review";
const CATEGORY_ORDER: CatalogTopCategory[] = [
  "sofa",
  "accent_chair",
  "coffee_table",
  "side_table",
  "dining_table",
  "dining_bench",
  "ottoman",
  "rug",
  "tv_console",
  "sideboard",
  "floor_lamp",
  "decor",
];

const SMART_FILTERS: Array<{
  id: CatalogSmartFilter;
  label: string;
  emptyLabel: string;
}> = [
  { id: "recommended", label: "Recommended", emptyLabel: "No recommended matches" },
  { id: "fits", label: "Fits this room", emptyLabel: "No fit matches" },
  { id: "cart_ready", label: "Cart-ready", emptyLabel: "No cart-ready matches" },
  { id: "retailer_link", label: "Retailer link", emptyLabel: "No retailer links" },
  { id: "needs_review", label: "Needs review", emptyLabel: "No review items" },
];

type Props = {
  items: CatalogItemSchema[];
  canEdit: boolean;
  onAddToRoom: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onAutoPlaceInRoom?: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onPreviewPlacementIntent?: (productId: string | null, variantId?: string) => void;
  onCatalogDragStart?: (productId: string, variantId?: string) => void;
  onCatalogDragEnd?: () => void;
  title?: string;
  subtitle?: string;
  activeRoomName?: string;
  recommendedCategoryIds?: CatalogTopCategory[];
  selectedCategory?: CatalogTopCategory;
  onSelectedCategoryChange?: (category: CatalogTopCategory) => void;
  activeRoomProductQuantities?: Record<string, number>;
  activeRoomVariantQuantities?: Record<string, number>;
  activeRoomCategoryCounts?: Partial<Record<CatalogTopCategory, number>>;
  activeRoomWidth?: number;
  activeRoomDepth?: number;
};

function pickInitialCategory(items: CatalogItemSchema[]): CatalogTopCategory {
  const counts: Partial<Record<CatalogTopCategory, number>> = {};
  for (const item of items) {
    const top = mapToTopCategory(item.category, item);
    counts[top] = (counts[top] ?? 0) + 1;
  }
  return CATEGORY_ORDER.find((category) => (counts[category] ?? 0) > 0) ?? "sofa";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Catalog memory is helpful but nonessential.
  }
}

function hasActiveCatalogFilters(filters: CatalogFilterState) {
  return Object.entries(filters).some(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(value);
  });
}

export default function CatalogPanel({
  items,
  canEdit,
  onAddToRoom,
  onAutoPlaceInRoom,
  onPreviewPlacementIntent,
  onCatalogDragStart,
  onCatalogDragEnd,
  title = "Catalog",
  subtitle,
  activeRoomName,
  recommendedCategoryIds = [],
  selectedCategory: controlledSelectedCategory,
  onSelectedCategoryChange,
  activeRoomProductQuantities = {},
  activeRoomVariantQuantities = {},
  activeRoomCategoryCounts = {},
  activeRoomWidth,
  activeRoomDepth,
}: Props) {
  const [rawSearch, setRawSearch] = useState("");
  const [internalSelectedCategory, setInternalSelectedCategory] = useState<CatalogTopCategory>(() =>
    controlledSelectedCategory ?? pickInitialCategory(items)
  );
  const selectedCategory = controlledSelectedCategory ?? internalSelectedCategory;
  const [filters, setFilters] = useState<CatalogFilterState>(() => ({}));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFinishId, setSelectedFinishId] = useState<string | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    readStoredIds(FAVORITES_STORAGE_KEY)
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readStoredIds(RECENTS_STORAGE_KEY)
  );
  const [memoryScope, setMemoryScope] = useState<CatalogMemoryScope>("all");
  const [smartFilters, setSmartFilters] = useState<CatalogSmartFilter[]>([]);
  const [detailPrefetchMap, setDetailPrefetchMap] = useState<Record<string, CatalogDetailView>>({});
  const [variantSelectionByItem, setVariantSelectionByItem] = useState<Record<string, string>>({});

  useEffect(() => {
    writeStoredIds(FAVORITES_STORAGE_KEY, favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    writeStoredIds(RECENTS_STORAGE_KEY, recentIds);
  }, [recentIds]);

  const debouncedSearch = useDebouncedValue(rawSearch, 180);

  const facets = useMemo(() => collectFilterFacets(items), [items]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CatalogTopCategory, number>> = {};
    for (const item of items) {
      const top = mapToTopCategory(item.category, item);
      counts[top] = (counts[top] ?? 0) + 1;
    }
    return counts;
  }, [items]);
  const activeRoomLabel = activeRoomName?.trim() || "this room";
  const selectedCategoryLabel = getTopCategoryLabel(selectedCategory);
  const recommendedCategorySet = useMemo(
    () => new Set(recommendedCategoryIds),
    [recommendedCategoryIds]
  );
  const visibleRecommendedCategories = useMemo(
    () => recommendedCategoryIds.filter((category) => (categoryCounts[category] ?? 0) > 0),
    [categoryCounts, recommendedCategoryIds]
  );
  const hasSearchTerm = rawSearch.trim().length > 0;
  const hasActiveFilters = useMemo(() => hasActiveCatalogFilters(filters), [filters]);
  const hasActiveSmartFilters = smartFilters.length > 0;
  const showEmptyCategoryRecovery = !hasSearchTerm && !hasActiveFilters && !hasActiveSmartFilters;
  const emptyRecoveryCategories = useMemo(() => {
    const recommended = visibleRecommendedCategories.filter((category) => category !== selectedCategory);
    const fallback = CATEGORY_ORDER.filter(
      (category) => category !== selectedCategory && (categoryCounts[category] ?? 0) > 0
    );
    return Array.from(new Set([...recommended, ...fallback])).slice(0, 4);
  }, [categoryCounts, selectedCategory, visibleRecommendedCategories]);

  const itemById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const scopedItems = useMemo(() => {
    if (memoryScope === "all") return items;
    const scopedIds = memoryScope === "favorites" ? favoriteIds : recentIds;
    return scopedIds.map((id) => itemById.get(id)).filter((entry): entry is CatalogItemSchema => Boolean(entry));
  }, [favoriteIds, itemById, items, memoryScope, recentIds]);

  const effectiveFilters = useMemo<CatalogFilterState>(() => {
    if (memoryScope === "all") return { ...filters, category: [selectedCategory] };
    return { ...filters, category: undefined };
  }, [filters, memoryScope, selectedCategory]);

  const searchScopedFilters = useMemo(() => {
    if (!debouncedSearch.trim()) return effectiveFilters;
    return { ...effectiveFilters, category: undefined };
  }, [debouncedSearch, effectiveFilters]);

  const filteredItems = useMemo(() => {
    return filterCatalogItems(scopedItems, debouncedSearch, searchScopedFilters);
  }, [scopedItems, debouncedSearch, searchScopedFilters]);

  const baseCardViews = useMemo<CatalogCardView[]>(() => {
    return filteredItems.map((item) => buildCatalogCardView(item, variantSelectionByItem[item.id]));
  }, [filteredItems, variantSelectionByItem]);

  const guidanceByItemId = useMemo(() => {
    return Object.fromEntries(
      baseCardViews
        .map((card) => {
          const item = itemById.get(card.id);
          if (!item) return null;
          const guidance = buildCatalogRoomGuidance({
            item,
            dimsMm: card.dimsMm,
            recommendedCategoryIds,
            activeRoomCategoryCounts,
            roomWidth: activeRoomWidth,
            roomDepth: activeRoomDepth,
          });
          return guidance.labels.length > 0 ? ([card.id, guidance.labels] as const) : null;
        })
        .filter((entry): entry is readonly [string, string[]] => Boolean(entry))
    );
  }, [
    activeRoomCategoryCounts,
    activeRoomDepth,
    activeRoomWidth,
    baseCardViews,
    itemById,
    recommendedCategoryIds,
  ]);

  const guidanceStateByItemId = useMemo(() => {
    return Object.fromEntries(
      baseCardViews
        .map((card) => {
          const item = itemById.get(card.id);
          if (!item) return null;
          return [
            card.id,
            buildCatalogRoomGuidance({
              item,
              dimsMm: card.dimsMm,
              recommendedCategoryIds,
              activeRoomCategoryCounts,
              roomWidth: activeRoomWidth,
              roomDepth: activeRoomDepth,
            }),
          ] as const;
        })
        .filter((entry): entry is readonly [string, ReturnType<typeof buildCatalogRoomGuidance>] => Boolean(entry))
    );
  }, [
    activeRoomCategoryCounts,
    activeRoomDepth,
    activeRoomWidth,
    baseCardViews,
    itemById,
    recommendedCategoryIds,
  ]);

  const getSmartFilterMatch = useCallback(
    (card: CatalogCardView, filter: CatalogSmartFilter) => {
      const item = itemById.get(card.id);
      if (!item) return false;
      const guidance = guidanceStateByItemId[card.id];
      const resolved = resolveCatalogVariant(item, card.variantId);

      if (filter === "recommended") return Boolean(guidance?.recommended);
      if (filter === "fits") return guidance?.fit === "fits";
      if (filter === "cart_ready") {
        return resolved.commerce.type === "shopify" && Boolean(resolved.commerce.variantId && resolved.commerce.available);
      }
      if (filter === "retailer_link") {
        return resolved.commerce.type === "affiliate" && Boolean(resolved.commerce.url);
      }
      return !(
        (resolved.commerce.type === "shopify" && Boolean(resolved.commerce.variantId && resolved.commerce.available)) ||
        (resolved.commerce.type === "affiliate" && Boolean(resolved.commerce.url))
      );
    },
    [guidanceStateByItemId, itemById]
  );

  const smartFilterCounts = useMemo(() => {
    return Object.fromEntries(
      SMART_FILTERS.map((filter) => [
        filter.id,
        baseCardViews.filter((card) => getSmartFilterMatch(card, filter.id)).length,
      ])
    ) as Record<CatalogSmartFilter, number>;
  }, [baseCardViews, getSmartFilterMatch]);

  const cardViews = useMemo<CatalogCardView[]>(() => {
    if (smartFilters.length === 0) return baseCardViews;
    return baseCardViews.filter((card) =>
      smartFilters.every((filter) => getSmartFilterMatch(card, filter))
    );
  }, [baseCardViews, getSmartFilterMatch, smartFilters]);

  const cardById = useMemo(() => {
    return new Map(cardViews.map((card) => [card.id, card]));
  }, [cardViews]);

  const allCardById = useMemo(() => {
    return new Map(
      items.map((item) => [item.id, buildCatalogCardView(item, variantSelectionByItem[item.id])] as const)
    );
  }, [items, variantSelectionByItem]);

  const favoriteCards = useMemo(
    () =>
      favoriteIds
        .map((id) => allCardById.get(id))
        .filter((entry): entry is CatalogCardView => Boolean(entry))
        .slice(0, 6),
    [allCardById, favoriteIds]
  );

  const recentCards = useMemo(
    () =>
      recentIds
        .map((id) => allCardById.get(id))
        .filter((entry): entry is CatalogCardView => Boolean(entry))
        .slice(0, MAX_RECENTS),
    [allCardById, recentIds]
  );

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
    const prefetch = detailPrefetchMap[selectedItem.id];
    return prefetch ?? buildCatalogDetailView(selectedItem, variantSelectionByItem[selectedItem.id]);
  }, [selectedItem, detailPrefetchMap, variantSelectionByItem]);

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
    setFilters({});
    setSmartFilters([]);
    setScrollTop(0);
  };

  const handleSelectCategory = (nextCategory: CatalogTopCategory) => {
    setMemoryScope("all");
    setInternalSelectedCategory(nextCategory);
    onSelectedCategoryChange?.(nextCategory);
    setScrollTop(0);
  };

  const handleSetMemoryScope = (scope: CatalogMemoryScope) => {
    setMemoryScope(scope);
    setScrollTop(0);
    track("catalog_memory_scope_change", { scope });
  };

  const toggleSmartFilter = (filter: CatalogSmartFilter) => {
    setSmartFilters((prev) => {
      const active = prev.includes(filter);
      const next = active ? prev.filter((entry) => entry !== filter) : [...prev, filter];
      track("catalog_smart_filter_toggle", {
        filter,
        active: !active,
        active_filters: next,
      });
      return next;
    });
    setScrollTop(0);
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

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      if (prev.includes(id)) {
        track("catalog_favorite_remove", { itemId: id });
        const next = prev.filter((entry) => entry !== id);
        if (memoryScope === "favorites" && next.length === 0) setMemoryScope("all");
        return next;
      }
      track("catalog_favorite_add", { itemId: id });
      return [id, ...prev].slice(0, 24);
    });
  };

  const rememberRecent = (id: string) => {
    setRecentIds((prev) => [id, ...prev.filter((entry) => entry !== id)].slice(0, MAX_RECENTS));
  };

  const addRememberedItem = (id: string, variantId?: string) => {
    rememberRecent(id);
    onAddToRoom(id, variantId ?? variantSelectionByItem[id]);
  };

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-3">
      <div className="text-sm font-semibold text-neutral-900">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>}
      <div
        data-testid="catalog-room-context"
        className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              data-testid="catalog-active-room-pill"
              className="text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              Adding to {activeRoomLabel}
            </div>
            <div className="mt-1 text-sm font-semibold text-neutral-950">
              {selectedCategoryLabel}
              {recommendedCategorySet.has(selectedCategory) ? (
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Recommended
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-neutral-600">
              Choose a variant, then preview the placement before it is added.
            </div>
          </div>
          <div
            data-testid="catalog-focused-category-pill"
            className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm"
          >
            {cardViews.length} shown
          </div>
        </div>
        {visibleRecommendedCategories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2" aria-label={`Recommended categories for ${activeRoomLabel}`}>
            {visibleRecommendedCategories.map((category) => {
              const active = category === selectedCategory;
              return (
                <button
                  key={category}
                  type="button"
                  data-testid={`catalog-room-recommendation-${category}`}
                  data-active={active ? "true" : "false"}
                  onClick={() => handleSelectCategory(category)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-100 bg-white text-neutral-700 hover:border-emerald-300",
                  ].join(" ")}
                >
                  {getTopCategoryLabel(category)}
                  <span className={active ? "ml-1 text-white/80" : "ml-1 text-neutral-400"}>
                    {categoryCounts[category] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="mt-2">
        <CatalogSearchInput
          value={rawSearch}
          onChange={setRawSearch}
          placeholder={`Search products for ${activeRoomLabel}...`}
        />
      </div>

      <div className="mt-2">
        <CatalogCategoryTabs
          selected={selectedCategory}
          onSelect={handleSelectCategory}
          counts={categoryCounts}
        />
      </div>

      <CatalogFiltersBar
        onToggleDrawer={() => setFiltersOpen((value) => !value)}
        filteredCount={cardViews.length}
        totalCount={items.length}
      />

      <div
        className="mt-2 rounded-xl border border-neutral-100 bg-white p-2.5"
        data-testid="catalog-smart-filters"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Smart filters
            </div>
            <div className="mt-0.5 text-xs text-neutral-600">
              Narrow to products that fit, buy cleanly, or need review.
            </div>
          </div>
          {hasActiveSmartFilters ? (
            <button
              type="button"
              data-testid="catalog-smart-filter-clear"
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              onClick={() => {
                setSmartFilters([]);
                setScrollTop(0);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SMART_FILTERS.map((filter) => {
            const active = smartFilters.includes(filter.id);
            const count = smartFilterCounts[filter.id] ?? 0;
            return (
              <button
                key={filter.id}
                type="button"
                data-testid={`catalog-smart-filter-${filter.id}`}
                data-active={active ? "true" : "false"}
                disabled={count === 0 && !active}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 hover:bg-white",
                ].join(" ")}
                onClick={() => toggleSmartFilter(filter.id)}
              >
                {filter.label}
                <span className={active ? "ml-1 text-white/70" : "ml-1 text-neutral-400"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <CatalogActiveFilterChips
        filters={effectiveFilters}
        onClearKey={clearFilterKey}
        onClearAll={clearAllFilters}
      />

      <div className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Catalog memory
            </div>
            <div className="mt-0.5 text-xs text-neutral-600">
              Jump back to saved and recently added products.
            </div>
          </div>
          {memoryScope !== "all" ? (
            <button
              type="button"
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              onClick={() => handleSetMemoryScope("all")}
            >
              Show all
            </button>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { scope: "all" as const, label: "All", count: items.length },
            { scope: "favorites" as const, label: "Favorites", count: favoriteCards.length },
            { scope: "recent" as const, label: "Recent", count: recentCards.length },
          ].map((option) => {
            const active = memoryScope === option.scope;
            return (
              <button
                key={option.scope}
                type="button"
                data-testid={`catalog-memory-${option.scope}`}
                data-active={active ? "true" : "false"}
                className={[
                  "min-h-10 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition",
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
                ].join(" ")}
                onClick={() => handleSetMemoryScope(option.scope)}
              >
                <span className="block">{option.label}</span>
                <span className={active ? "text-white/70" : "text-neutral-400"}>
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(favoriteCards.length > 0 || recentCards.length > 0) && (
        <div className="mt-3 space-y-2 rounded-xl border border-neutral-100 bg-white p-2.5">
          {favoriteCards.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Favorites
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {favoriteCards.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`catalog-favorite-quick-add-${item.id}`}
                    onClick={() => addRememberedItem(item.id, item.variantId)}
                    className="min-w-[150px] rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-left text-xs text-neutral-900 transition hover:border-amber-300"
                  >
                    <div className="truncate font-semibold">{item.title}</div>
                    <div className="truncate text-[11px] text-neutral-500">{item.variantLabel}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {recentCards.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Recently used
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentCards.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`catalog-recent-quick-add-${item.id}`}
                    onClick={() => addRememberedItem(item.id, item.variantId)}
                    className="min-w-[150px] rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-xs text-neutral-900 transition hover:border-neutral-300"
                  >
                    <div className="truncate font-semibold">{item.title}</div>
                    <div className="truncate text-[11px] text-neutral-500">{item.variantLabel}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
            setSelectedFinishId(variantSelectionByItem[id]);
            prefetchDetail(id);
          }}
          onAdd={(id) => addRememberedItem(id)}
          onAutoPlace={
            onAutoPlaceInRoom
              ? (id) => onAutoPlaceInRoom(id, variantSelectionByItem[id])
              : undefined
          }
          onCatalogDragStart={(id) => onCatalogDragStart?.(id, variantSelectionByItem[id])}
          onCatalogDragEnd={onCatalogDragEnd}
          onToggleCompare={toggleCompare}
          onToggleFavorite={toggleFavorite}
          compareIds={compareIds}
          favoriteIds={favoriteIds}
          onPrefetch={prefetchDetail}
          onPreviewIntent={(id) =>
            onPreviewPlacementIntent?.(id, id ? variantSelectionByItem[id] : undefined)
          }
          activeRoomName={activeRoomName}
          roomProductQuantities={activeRoomProductQuantities}
          roomVariantQuantities={activeRoomVariantQuantities}
          guidanceByItemId={guidanceByItemId}
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
          setSelectedFinishId(variantSelectionByItem[id]);
          prefetchDetail(id);
        }}
        onAdd={(id, variantId) => {
          track("catalog_compare_add_to_room", { itemId: id, source: "tray" });
          addRememberedItem(id, variantId);
        }}
      />

      {!cardViews.length && (
        <div
          className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-5 text-center"
          data-testid="catalog-empty-recovery"
        >
          <div className="text-sm font-semibold text-neutral-900">
            {memoryScope === "favorites"
              ? "No favorite products yet"
              : memoryScope === "recent"
                ? "No recently added products yet"
                : hasActiveSmartFilters
                  ? SMART_FILTERS.find((filter) => filter.id === smartFilters[smartFilters.length - 1])?.emptyLabel ?? "No smart-filter matches"
                  : `No ${selectedCategoryLabel.toLowerCase()} matches for ${activeRoomLabel}`}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {memoryScope === "favorites"
              ? "Save products from the catalog to build a short list for this project."
              : memoryScope === "recent"
                ? "Add products to a room and they will appear here for fast repeat placement."
                : hasActiveSmartFilters
                  ? "Try one smart filter at a time, switch category, or clear the smart filter set."
                  : "Broader matches are available from search, filters, and nearby product categories."}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {memoryScope !== "all" ? (
              <button
                type="button"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={() => handleSetMemoryScope("all")}
              >
                Browse all products
              </button>
            ) : null}
            {hasSearchTerm ? (
              <button
                type="button"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  setRawSearch("");
                  setScrollTop(0);
                }}
              >
                Clear search
              </button>
            ) : null}
            {hasActiveFilters ? (
              <button
                type="button"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={clearAllFilters}
              >
                Clear filters
              </button>
            ) : null}
            {hasActiveSmartFilters ? (
              <button
                type="button"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  setSmartFilters([]);
                  setScrollTop(0);
                }}
              >
                Clear smart filters
              </button>
            ) : null}
            {showEmptyCategoryRecovery
              ? emptyRecoveryCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    data-testid={`catalog-empty-category-${category}`}
                    className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:border-emerald-300"
                    onClick={() => handleSelectCategory(category)}
                  >
                    {getTopCategoryLabel(category)}
                  </button>
                ))
              : null}
          </div>
        </div>
      )}

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
        onClose={() => setSelectedId(null)}
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
          setSelectedId(null);
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
