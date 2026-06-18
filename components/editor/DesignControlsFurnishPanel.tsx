"use client";

import { useMemo, useState } from "react";
import CatalogPanel from "@/components/catalog/CatalogPanel";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import { formatMoney } from "@/lib/design-page-utils";
import {
  getTopCategoryLabel,
  mapToTopCategory,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";

type ImportedFamilyOption = {
  familyKey: string;
  familyLabel: string;
};

type DesignControlsFurnishPanelProps = {
  dark: boolean;
  canEdit: boolean;
  activeRoomName: string;
  activeRoomTypeLabel: string;
  activeRoomItemCount: number;
  activeRoomShoppableCount: number;
  activeRoomNeedsReviewCount: number;
  activeRoomCategoryCounts: Partial<Record<CatalogTopCategory, number>>;
  activeRoomShoppingSubtotal: number;
  activeRoomPreviewNames: string[];
  roomCount: number;
  catalogItems: CatalogItemSchema[];
  selectedImportedFamilyKey: string;
  selectedImportedProductId: string;
  importedFamilyOptions: ImportedFamilyOption[];
  importedModelOptions: ImportedModelOption[];
  visibleImportedModelOptions: ImportedModelOption[];
  onAddImportedToRoom: () => void;
  onAddCatalogItemToRoom: (productId: string, variantId?: string) => void;
  onGoShop: () => void;
  onSelectedImportedFamilyChange: (familyKey: string) => void;
  onSelectedImportedProductChange: (productId: string) => void;
};

const ROOM_RECOMMENDED_CATEGORIES: Record<string, CatalogTopCategory[]> = {
  living: ["sofa", "accent_chair", "coffee_table", "side_table", "rug", "tv_console", "floor_lamp"],
  bedroom: ["accent_chair", "side_table", "ottoman", "rug", "floor_lamp", "decor"],
  dining: ["dining_table", "dining_bench", "sideboard", "rug", "floor_lamp"],
  kitchen: ["dining_table", "dining_bench", "sideboard", "decor"],
  toilet: ["decor"],
  custom: ["sofa", "coffee_table", "accent_chair", "rug"],
};

const CATEGORY_HELP_TEXT: Record<CatalogTopCategory, string> = {
  sofa: "Anchor the seating zone",
  accent_chair: "Add flexible seating",
  coffee_table: "Complete the lounge setup",
  side_table: "Useful beside seats and beds",
  dining_table: "Start the dining layout",
  dining_bench: "Space-saving dining seats",
  ottoman: "Add storage or soft seating",
  rug: "Define the room zone",
  tv_console: "Set up the media wall",
  sideboard: "Add dining or entry storage",
  floor_lamp: "Layer soft lighting",
  decor: "Finish with useful accents",
};

function normalizeRoomRecommendationKey(label: string): keyof typeof ROOM_RECOMMENDED_CATEGORIES {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("bed")) return "bedroom";
  if (normalized.includes("dining")) return "dining";
  if (normalized.includes("kitchen")) return "kitchen";
  if (normalized.includes("toilet") || normalized.includes("bath")) return "toilet";
  if (normalized.includes("living")) return "living";
  return "custom";
}

export default function DesignControlsFurnishPanel({
  dark,
  canEdit,
  activeRoomName,
  activeRoomTypeLabel,
  activeRoomItemCount,
  activeRoomShoppableCount,
  activeRoomNeedsReviewCount,
  activeRoomCategoryCounts,
  activeRoomShoppingSubtotal,
  activeRoomPreviewNames,
  roomCount,
  catalogItems,
  selectedImportedFamilyKey,
  selectedImportedProductId,
  importedFamilyOptions,
  importedModelOptions,
  visibleImportedModelOptions,
  onAddImportedToRoom,
  onAddCatalogItemToRoom,
  onGoShop,
  onSelectedImportedFamilyChange,
  onSelectedImportedProductChange,
}: DesignControlsFurnishPanelProps) {
  const roomRecommendationKey = `${activeRoomName}:${activeRoomTypeLabel}`;
  const [selectedCatalogCategory, setSelectedCatalogCategory] = useState<
    { roomKey: string; category: CatalogTopCategory } | undefined
  >(undefined);
  const [fullCatalogOpen, setFullCatalogOpen] = useState(false);
  const selectedImportedOption = useMemo(
    () =>
      visibleImportedModelOptions.find((option) => option.id === selectedImportedProductId) ??
      importedModelOptions.find((option) => option.id === selectedImportedProductId) ??
      null,
    [importedModelOptions, selectedImportedProductId, visibleImportedModelOptions]
  );
  const catalogCategoryCounts = useMemo(() => {
    const counts: Partial<Record<CatalogTopCategory, number>> = {};
    for (const item of catalogItems) {
      const category = mapToTopCategory(item.category, item);
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return counts;
  }, [catalogItems]);
  const recommendedCategories = useMemo(() => {
    const roomKey = normalizeRoomRecommendationKey(activeRoomTypeLabel);
    const roomCategories = ROOM_RECOMMENDED_CATEGORIES[roomKey];
    const availableRoomCategories = roomCategories.filter((category) => (catalogCategoryCounts[category] ?? 0) > 0);

    if (availableRoomCategories.length > 0) {
      return availableRoomCategories;
    }

    return Object.entries(catalogCategoryCounts)
      .filter((entry): entry is [CatalogTopCategory, number] => entry[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([category]) => category);
  }, [activeRoomTypeLabel, catalogCategoryCounts]);
  const defaultCatalogCategory = recommendedCategories[0];
  const activeCatalogCategory =
    selectedCatalogCategory?.roomKey === roomRecommendationKey
      ? selectedCatalogCategory.category
      : defaultCatalogCategory;
  const handleCatalogCategoryChange = (category: CatalogTopCategory) => {
    setSelectedCatalogCategory({ roomKey: roomRecommendationKey, category });
  };
  const handleBrowseCatalogCategory = (category: CatalogTopCategory) => {
    handleCatalogCategoryChange(category);
    setFullCatalogOpen(true);
  };
  const checklistCategories = recommendedCategories.slice(0, Math.min(4, recommendedCategories.length));
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const panelClass = dark
    ? "rounded-2xl border border-white/10 bg-[#151820] p-4"
    : "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm";
  const mutedClass = dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500";
  const statCardClass = dark
    ? "rounded-xl border border-white/10 bg-[#1b2030] p-3"
    : "rounded-xl border border-neutral-200 bg-neutral-50 p-3";
  const inputClass = dark
    ? "w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-neutral-100"
    : "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900";
  const secondaryButtonClass = dark
    ? "rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-neutral-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-4">
      <section className={panelClass} data-testid="furnish-room-summary">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={
                dark
                  ? "text-xs font-semibold uppercase tracking-wide text-neutral-400"
                  : "text-xs font-semibold uppercase tracking-wide text-neutral-500"
              }
            >
              Furnishing room
            </div>
            <div
              data-testid="furnish-active-room-name"
              className={
                dark
                  ? "mt-1 truncate text-lg font-semibold text-white"
                  : "mt-1 truncate text-lg font-semibold text-neutral-950"
              }
            >
              {activeRoomName}
            </div>
            <div className={mutedClass}>
              {activeRoomTypeLabel} · {roomCount} room{roomCount === 1 ? "" : "s"} in this home
            </div>
          </div>
          <span
            className={
              dark
                ? "rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-neutral-100"
                : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700"
            }
          >
            Active room
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className={statCardClass}>
            <div
              className={
                dark ? "text-base font-semibold text-white" : "text-base font-semibold text-neutral-950"
              }
            >
              {activeRoomItemCount}
            </div>
            <div className={mutedClass}>Placed</div>
          </div>
          <div className={statCardClass}>
            <div
              className={
                dark ? "text-base font-semibold text-white" : "text-base font-semibold text-neutral-950"
              }
            >
              {activeRoomShoppableCount}
            </div>
            <div className={mutedClass}>Shoppable</div>
          </div>
          <div className={statCardClass}>
            <div
              className={
                dark ? "text-base font-semibold text-white" : "text-base font-semibold text-neutral-950"
              }
            >
              {activeRoomNeedsReviewCount}
            </div>
            <div className={mutedClass}>Review</div>
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={titleClass}>Room checklist</div>
            <div className={mutedClass}>Use this as a quick furnishing order for this room.</div>
          </div>
          <span
            className={
              activeRoomItemCount > 0
                ? dark
                  ? "rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100"
                  : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                : dark
                  ? "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                  : "rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600"
            }
          >
            {activeRoomItemCount > 0 ? "Started" : "Empty"}
          </span>
        </div>
        <div className="mt-3 space-y-2" data-testid="furnish-room-checklist">
          {checklistCategories.map((category) => {
            const placedCount = activeRoomCategoryCounts[category] ?? 0;
            const complete = placedCount > 0;
            return (
              <button
                key={category}
                type="button"
                data-testid={`furnish-checklist-category-${category}`}
                onClick={() => handleBrowseCatalogCategory(category)}
                className={
                  dark
                    ? "flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1b2030] px-3 py-2 text-left hover:bg-white/10"
                    : "flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-white"
                }
              >
                <span className="min-w-0">
                  <span
                    className={
                      dark
                        ? "block truncate text-sm font-semibold text-neutral-100"
                        : "block truncate text-sm font-semibold text-neutral-900"
                    }
                  >
                    {getTopCategoryLabel(category)}
                  </span>
                  <span className={mutedClass}>{CATEGORY_HELP_TEXT[category]}</span>
                </span>
                <span
                  className={
                    complete
                      ? dark
                        ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100"
                        : "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                      : dark
                        ? "shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                        : "shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600"
                  }
                >
                  {complete ? `${placedCount} placed` : "Next"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={panelClass} data-testid="furnish-shopping-preview">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={titleClass}>Room shopping preview</div>
            <div className={mutedClass}>
              {activeRoomItemCount > 0
                ? activeRoomPreviewNames.length > 0
                  ? activeRoomPreviewNames.join(", ")
                  : `${activeRoomItemCount} item${activeRoomItemCount === 1 ? "" : "s"} placed`
                : "Add real catalog items to build this room list."}
            </div>
          </div>
          {activeRoomItemCount > 0 ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onGoShop}
            >
              Review
            </button>
          ) : (
            <span
              className={
                dark
                  ? "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                  : "rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600"
              }
            >
              Empty
            </span>
          )}
        </div>
        {activeRoomItemCount > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className={statCardClass}>
              <div className={dark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-neutral-950"}>
                {activeRoomItemCount}
              </div>
              <div className={mutedClass}>Items</div>
            </div>
            <div className={statCardClass}>
              <div className={dark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-neutral-950"}>
                {activeRoomShoppableCount}
              </div>
              <div className={mutedClass}>Ready</div>
            </div>
            <div className={statCardClass}>
              <div className={dark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-neutral-950"}>
                {formatMoney(activeRoomShoppingSubtotal)}
              </div>
              <div className={mutedClass}>Est.</div>
            </div>
          </div>
        )}
      </section>

      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={titleClass}>Recommended for {activeRoomTypeLabel}</div>
            <div className={mutedClass}>Start with the categories most useful for this room.</div>
          </div>
          <span
            className={
              dark
                ? "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                : "rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600"
            }
          >
            Room-aware
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {recommendedCategories.map((category) => {
            const active = category === activeCatalogCategory;
            const count = catalogCategoryCounts[category] ?? 0;
            return (
              <button
                key={category}
                type="button"
                data-testid={`furnish-recommended-category-${category}`}
                onClick={() => handleBrowseCatalogCategory(category)}
                className={
                  active
                    ? dark
                      ? "rounded-xl border border-white/20 bg-white/10 p-3 text-left text-neutral-100"
                      : "rounded-xl border border-neutral-900 bg-neutral-900 p-3 text-left text-white shadow-sm"
                    : dark
                      ? "rounded-xl border border-white/10 bg-[#1b2030] p-3 text-left text-neutral-200 hover:bg-white/10"
                      : "rounded-xl border border-neutral-200 bg-white p-3 text-left text-neutral-800 hover:bg-neutral-50"
                }
              >
                <div className="text-sm font-semibold">{getTopCategoryLabel(category)}</div>
                <div className={active ? "mt-1 text-xs opacity-75" : mutedClass}>
                  {CATEGORY_HELP_TEXT[category]}
                </div>
                <div className={active ? "mt-2 text-[11px] font-semibold opacity-80" : mutedClass}>
                  {count} item{count === 1 ? "" : "s"} · Browse
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <details className={panelClass} data-testid="advanced-imported-models">
        <summary
          data-testid="advanced-imported-models-toggle"
          className={
            dark
              ? "flex cursor-pointer list-none items-center justify-between gap-3 text-neutral-100 marker:hidden"
              : "flex cursor-pointer list-none items-center justify-between gap-3 text-neutral-900 marker:hidden"
          }
        >
          <span>
            <span className={titleClass}>Advanced model picker</span>
            <span className={mutedClass}>Verified imported assets and QA catalog controls.</span>
          </span>
          <span
            className={
              dark
                ? "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                : "rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600"
            }
          >
            Open
          </span>
        </summary>

        <div className="mt-3 flex flex-1 flex-col gap-2">
          <select
            data-testid="imported-family-select"
            aria-label="Imported furniture family"
            className={inputClass}
            value={selectedImportedFamilyKey}
            onChange={(event) => {
              const nextFamilyKey = event.target.value;
              onSelectedImportedFamilyChange(nextFamilyKey);
              const firstInFamily = importedModelOptions.find(
                (item) => item.familyKey === nextFamilyKey
              );
              if (firstInFamily) {
                onSelectedImportedProductChange(firstInFamily.id);
              }
            }}
          >
            {importedFamilyOptions.map((item) => (
              <option key={item.familyKey} value={item.familyKey}>
                {item.familyLabel}
              </option>
            ))}
          </select>
          <select
            data-testid="imported-product-select"
            aria-label="Imported furniture product"
            className={inputClass}
            value={selectedImportedProductId}
            onChange={(event) => onSelectedImportedProductChange(event.target.value)}
          >
            {visibleImportedModelOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.pickerLabel}
              </option>
            ))}
          </select>
        </div>

        {selectedImportedOption && (
          <div
            className={
              dark
                ? "mt-3 rounded-xl border border-white/10 bg-black/10 p-3"
                : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
            }
          >
            <div
              className={
                dark ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-neutral-800"
              }
            >
              {selectedImportedOption.pickerLabel}
            </div>
            <div className={mutedClass}>{selectedImportedOption.familyLabel}</div>
          </div>
        )}

        <div className="mt-3 flex">
          <button
            data-testid="add-imported-btn"
            className={secondaryButtonClass}
            onClick={onAddImportedToRoom}
            disabled={!selectedImportedProductId || !canEdit}
          >
            Add to {activeRoomName}
          </button>
        </div>
      </details>

      <details
        className={panelClass}
        data-testid="furnish-full-catalog"
        open={fullCatalogOpen}
        onToggle={(event) => setFullCatalogOpen(event.currentTarget.open)}
      >
        <summary
          data-testid="furnish-full-catalog-toggle"
          className={
            dark
              ? "flex cursor-pointer list-none items-center justify-between gap-3 text-neutral-100 marker:hidden"
              : "flex cursor-pointer list-none items-center justify-between gap-3 text-neutral-900 marker:hidden"
          }
        >
          <span>
            <span className={titleClass}>Browse full catalog</span>
            <span className={mutedClass}>Search every verified product when recommendations are not enough.</span>
          </span>
          <span
            className={
              dark
                ? "rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                : "rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600"
            }
          >
            {fullCatalogOpen ? "Hide" : "Open"}
          </span>
        </summary>
        <div className="mt-3">
          <CatalogPanel
            items={catalogItems}
            canEdit={canEdit}
            onAddToRoom={onAddCatalogItemToRoom}
            activeRoomName={activeRoomName}
            recommendedCategoryIds={recommendedCategories}
            title={`Add to ${activeRoomName}`}
            subtitle="Start with room-aware categories, then search every verified product if needed."
            selectedCategory={activeCatalogCategory}
            onSelectedCategoryChange={handleCatalogCategoryChange}
          />
        </div>
      </details>
    </div>
  );
}
