import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Armchair,
  BedDouble,
  Check,
  ChevronDown,
  LampFloor,
  Sparkles,
  TableProperties,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CatalogTopCategory } from "@/lib/catalog/view-builders";
import { getTopCategoryLabel } from "@/lib/catalog/view-builders";
import {
  CATALOG_MAIN_GROUPS,
  getCatalogMainGroup,
  getCatalogMainGroupForCategory,
  type CatalogMainGroupId,
} from "@/lib/catalog/category-taxonomy";

type Props = {
  selected: CatalogTopCategory;
  onSelect: (category: CatalogTopCategory) => void;
  counts: Partial<Record<CatalogTopCategory, number>>;
  recommended?: CatalogTopCategory[];
  selectedGroupId?: CatalogMainGroupId | null;
  onSelectGroup?: (groupId: CatalogMainGroupId) => void;
};

const GROUP_ICONS: Record<CatalogMainGroupId, LucideIcon> = {
  bedroom: BedDouble,
  seating: Armchair,
  tables: TableProperties,
  storage: Archive,
  lighting: LampFloor,
  finishing: Sparkles,
};

export default function CatalogCategoryTabs({
  selected,
  onSelect,
  counts,
  recommended = [],
  selectedGroupId = null,
  onSelectGroup,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedGroup = selectedGroupId
    ? getCatalogMainGroup(selectedGroupId)
    : getCatalogMainGroupForCategory(selected);
  const [open, setOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<CatalogMainGroupId>(
    selectedGroup?.id ?? "seating"
  );
  const recommendedSet = useMemo(() => new Set(recommended), [recommended]);
  const availableGroups = useMemo(() => {
    return CATALOG_MAIN_GROUPS.map((group, index) => ({
      group,
      index,
      recommendedCount: group.categories.filter((category) => recommendedSet.has(category)).length,
    }))
      .filter(({ group }) =>
        group.categories.some((category) => (counts[category] ?? 0) > 0)
      )
      .sort((a, b) => b.recommendedCount - a.recommendedCount || a.index - b.index)
      .map(({ group }) => group);
  }, [counts, recommendedSet]);
  const activeGroup =
    availableGroups.find((group) => group.id === activeGroupId) ??
    availableGroups.find((group) => group.id === selectedGroup?.id) ??
    availableGroups[0];

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };

    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.focus());
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, open]);

  const selectedCount = selectedGroupId && selectedGroup
    ? selectedGroup.categories.reduce((total, category) => total + (counts[category] ?? 0), 0)
    : counts[selected] ?? 0;
  const selectedLabel = selectedGroupId && selectedGroup
    ? selectedGroup.allLabel
    : getTopCategoryLabel(selected);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Category
      </div>
      <button
        ref={triggerRef}
        type="button"
        data-testid="catalog-category-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="catalog-category-panel"
        onClick={() => {
          if (!open && selectedGroup) setActiveGroupId(selectedGroup.id);
          setOpen((value) => !value);
        }}
        className={[
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left transition",
          open
            ? "border-neutral-900 ring-2 ring-neutral-200"
            : "border-neutral-200 hover:border-neutral-300",
        ].join(" ")}
      >
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {selectedGroup?.label ?? "Catalog"}
          </span>
          <span className="block truncate text-sm font-semibold text-neutral-950">{selectedLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            {selectedCount}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close category browser"
            onClick={closeAndRestoreFocus}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
          />
          <div
            ref={panelRef}
            id="catalog-category-panel"
            data-testid="catalog-category-panel"
            role="dialog"
            aria-label="Choose a product category"
            tabIndex={-1}
            className="fixed inset-x-3 bottom-3 z-50 max-h-[min(78vh,560px)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-[460px] sm:shadow-xl"
          >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-neutral-950">Browse categories</div>
              <div className="text-[10px] font-medium text-emerald-700">Room-relevant groups appear first</div>
            </div>
            <button
              type="button"
              aria-label="Close category browser"
              onClick={closeAndRestoreFocus}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div
            className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-1.5"
            aria-label="Main categories"
          >
            {availableGroups.map((group) => {
              const GroupIcon = GROUP_ICONS[group.id];
              const active = group.id === activeGroup?.id;
              const groupCount = group.categories.reduce(
                (total, category) => total + (counts[category] ?? 0),
                0
              );
              const hasRecommendation = group.categories.some((category) =>
                recommendedSet.has(category)
              );
              return (
                <button
                  key={group.id}
                  type="button"
                  data-testid={`catalog-main-group-${group.id}`}
                  data-active={active ? "true" : "false"}
                  onClick={() => setActiveGroupId(group.id)}
                  className={[
                    "flex min-h-10 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                    active
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
                  ].join(" ")}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <GroupIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span
                      data-testid={`catalog-main-group-label-${group.id}`}
                      className="truncate"
                    >
                      {group.label}
                    </span>
                    {hasRecommendation ? (
                      <span className={active ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" : "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"} />
                    ) : null}
                  </span>
                  <span className={`shrink-0 ${active ? "text-white/60" : "text-neutral-400"}`}>
                    {groupCount}
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroup ? (
            <div className="mt-3 border-t border-neutral-100 pt-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {activeGroup.label}
              </div>
              <div role="listbox" aria-label={`${activeGroup.label} categories`} className="space-y-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedGroupId === activeGroup.id}
                  data-testid={`catalog-category-all-${activeGroup.id}`}
                  onClick={() => {
                    onSelectGroup?.(activeGroup.id);
                    closeAndRestoreFocus();
                  }}
                  className={[
                    "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selectedGroupId === activeGroup.id
                      ? "bg-neutral-900 font-semibold text-white"
                      : "bg-neutral-50 font-semibold text-neutral-900 hover:bg-neutral-100",
                  ].join(" ")}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selectedGroupId === activeGroup.id ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{activeGroup.allLabel}</span>
                  <span className={selectedGroupId === activeGroup.id ? "text-xs text-white/60" : "text-xs text-neutral-400"}>
                    {activeGroup.categories.reduce(
                      (total, category) => total + (counts[category] ?? 0),
                      0
                    )}
                  </span>
                </button>
                {activeGroup.categories
                  .filter((category) => (counts[category] ?? 0) > 0)
                  .map((category) => {
                    const active = !selectedGroupId && category === selected;
                    const isRecommended = recommendedSet.has(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-testid={`catalog-category-option-${category}`}
                        onClick={() => {
                          onSelect(category);
                          closeAndRestoreFocus();
                        }}
                        className={[
                          "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-neutral-100 font-semibold text-neutral-950"
                            : "text-neutral-700 hover:bg-neutral-50",
                        ].join(" ")}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{getTopCategoryLabel(category)}</span>
                        {isRecommended ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Recommended
                          </span>
                        ) : null}
                        <span className="shrink-0 text-xs font-medium text-neutral-400">
                          {counts[category] ?? 0}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
