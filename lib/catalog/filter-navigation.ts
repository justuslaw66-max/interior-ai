import { useMemo, useState } from "react";
import type { CatalogFilterState, CatalogTopCategory } from "@/lib/catalog/view-builders";

type CatalogCategoryNavigationState = {
  selectedByRoom: Record<string, CatalogTopCategory>;
  revision: number;
};

type CatalogRoomNavigationSnapshot = {
  activeRoomId: string;
  rooms: Array<{ id: string; name: string; roomType: string }>;
};

export function hasCatalogRoomNavigationChanged(
  previous: CatalogRoomNavigationSnapshot,
  next: CatalogRoomNavigationSnapshot
) {
  if (previous.activeRoomId !== next.activeRoomId) return true;
  const previousRoom = previous.rooms.find((room) => room.id === previous.activeRoomId);
  const nextRoom = next.rooms.find((room) => room.id === next.activeRoomId);
  return previousRoom?.name !== nextRoom?.name || previousRoom?.roomType !== nextRoom?.roomType;
}

export function clearInapplicableCatalogFilters(
  filters: CatalogFilterState,
  categoryScope: readonly CatalogTopCategory[],
  sofaFilterRevisionIsCurrent = true
) {
  if (
    (categoryScope.includes("sofa") && sofaFilterRevisionIsCurrent) ||
    !filters.sofaSeatCapacityBuckets?.length
  ) {
    return filters;
  }
  const next = { ...filters };
  delete next.sofaSeatCapacityBuckets;
  return next;
}

export function useCatalogCategoryNavigation(
  roomKey: string,
  defaultCategory: CatalogTopCategory
) {
  const [navigation, setNavigation] = useState<CatalogCategoryNavigationState>({
    selectedByRoom: {},
    revision: 0,
  });
  const activeCategory = navigation.selectedByRoom[roomKey] ?? defaultCategory;
  const selectCategory = (category: CatalogTopCategory) => {
    setNavigation((previous) => {
      if ((previous.selectedByRoom[roomKey] ?? defaultCategory) === category) return previous;
      return {
        selectedByRoom: { ...previous.selectedByRoom, [roomKey]: category },
        revision: previous.revision + 1,
      };
    });
  };
  return { activeCategory, revision: navigation.revision, selectCategory };
}

function withoutCatalogFilter(
  filters: CatalogFilterState,
  key: keyof CatalogFilterState
) {
  const next = { ...filters };
  if (key === "priceMin") {
    delete next.priceMin;
    delete next.priceMax;
  } else if (key === "widthMinCm") {
    delete next.widthMinCm;
    delete next.widthMaxCm;
  } else {
    delete next[key];
  }
  return next;
}

export function useCatalogFilterNavigation(
  categoryScope: readonly CatalogTopCategory[],
  navigationRevision: string
) {
  const [filters, setFilters] = useState<CatalogFilterState>(() => ({}));
  const [sofaFilterNavigationRevision, setSofaFilterNavigationRevision] =
    useState<string | null>(null);
  const applicableFilters = useMemo(
    () =>
      clearInapplicableCatalogFilters(
        filters,
        categoryScope,
        sofaFilterNavigationRevision === navigationRevision
      ),
    [categoryScope, filters, navigationRevision, sofaFilterNavigationRevision]
  );

  const clearFilterKey = (key: keyof CatalogFilterState) => {
    setFilters((previous) => withoutCatalogFilter(previous, key));
    if (key === "sofaSeatCapacityBuckets") setSofaFilterNavigationRevision(null);
  };
  const clearAllFilters = () => {
    setFilters({});
    setSofaFilterNavigationRevision(null);
  };
  const patchFilters = (patch: Partial<CatalogFilterState>) => {
    setFilters((previous) => ({
      ...clearInapplicableCatalogFilters(
        previous,
        categoryScope,
        sofaFilterNavigationRevision === navigationRevision
      ),
      ...patch,
    }));
    if ("sofaSeatCapacityBuckets" in patch) {
      setSofaFilterNavigationRevision(
        patch.sofaSeatCapacityBuckets?.length ? navigationRevision : null
      );
    }
  };
  const clearFiltersForScope = (scope: readonly CatalogTopCategory[]) => {
    setFilters((previous) => clearInapplicableCatalogFilters(previous, scope));
    if (!scope.includes("sofa")) setSofaFilterNavigationRevision(null);
  };
  return {
    applicableFilters,
    clearAllFilters,
    clearFilterKey,
    clearFiltersForScope,
    patchFilters,
  };
}
