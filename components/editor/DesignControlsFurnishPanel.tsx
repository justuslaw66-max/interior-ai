"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CatalogPanel from "@/components/catalog/CatalogPanel";
import LazyImage from "@/components/common/LazyImage";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import { formatMoney } from "@/lib/design-page-utils";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";
import { buildRoomBudgetRecommendations } from "@/lib/room-budget-recommendations";
import {
  summarizeShoppingReadinessItems,
  type ShoppingReadinessFilter,
} from "@/lib/shopping-readiness";
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
  activeRoomId: string;
  rooms: Array<{ id: string; name: string }>;
  activeRoomTypeLabel: string;
  activeRoomItemCount: number;
  activeRoomShoppableCount: number;
  activeRoomNeedsReviewCount: number;
  activeRoomCategoryCounts: Partial<Record<CatalogTopCategory, number>>;
  roomWidth: number;
  roomDepth: number;
  activeRoomShoppingSubtotal: number;
  activeRoomPreviewNames: string[];
  activeRoomShoppingItems: ActiveRoomShoppingItem[];
  activeRoomProductQuantities: Record<string, number>;
  activeRoomVariantQuantities: Record<string, number>;
  placementAddMode: "preview" | "auto";
  budget: "$" | "$$" | "$$$";
  style: string;
  roomCount: number;
  catalogItems: CatalogItemSchema[];
  selectedImportedFamilyKey: string;
  selectedImportedProductId: string;
  importedFamilyOptions: ImportedFamilyOption[];
  importedModelOptions: ImportedModelOption[];
  visibleImportedModelOptions: ImportedModelOption[];
  onAddImportedToRoom: () => void;
  onAddCatalogItemToRoom: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onAutoPlaceCatalogItemInRoom?: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onPreviewCatalogPlacementIntent?: (productId: string | null, variantId?: string) => void;
  onCatalogDragStart?: (productId: string, variantId?: string) => void;
  onCatalogDragEnd?: () => void;
  onAddActiveRoomCartReadyItems: () => void;
  onReviewShoppingIssue: (filter: ShoppingReadinessFilter) => void;
  onSelectRoom: (roomId: string) => void;
  onPlacementAddModeChange: (mode: "preview" | "auto") => void;
  onGoShop: () => void;
  onSelectedImportedFamilyChange: (familyKey: string) => void;
  onSelectedImportedProductChange: (productId: string) => void;
};

const ROOM_RECOMMENDED_CATEGORIES: Record<string, CatalogTopCategory[]> = {
  living: ["sofa", "accent_chair", "coffee_table", "side_table", "rug", "tv_console", "floor_lamp", "table_lamp", "ceiling_light"],
  bedroom: ["bed", "side_table", "rug", "table_lamp", "floor_lamp", "ceiling_light", "accent_chair", "ottoman", "decor"],
  dining: ["dining_table", "dining_bench", "sideboard", "rug", "ceiling_light", "floor_lamp", "table_lamp"],
  kitchen: ["dining_table", "dining_bench", "sideboard", "ceiling_light", "decor"],
  toilet: ["decor"],
  custom: ["sofa", "coffee_table", "accent_chair", "rug", "ceiling_light"],
};

const CATEGORY_HELP_TEXT: Record<CatalogTopCategory, string> = {
  bed: "Anchor the bedroom",
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
  table_lamp: "Add tabletop lighting",
  ceiling_light: "Hang lighting from the ceiling",
  decor: "Finish with useful accents",
};

type FurnishingCompletenessCheck = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
};

type FurnishExperienceMode = "catalog" | "guided";

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
  activeRoomId,
  rooms,
  activeRoomTypeLabel,
  activeRoomItemCount,
  activeRoomShoppableCount,
  activeRoomNeedsReviewCount,
  activeRoomCategoryCounts,
  roomWidth,
  roomDepth,
  activeRoomShoppingSubtotal,
  activeRoomPreviewNames,
  activeRoomShoppingItems,
  activeRoomProductQuantities,
  activeRoomVariantQuantities,
  placementAddMode,
  budget,
  style,
  roomCount,
  catalogItems,
  selectedImportedFamilyKey,
  selectedImportedProductId,
  importedFamilyOptions,
  importedModelOptions,
  visibleImportedModelOptions,
  onAddImportedToRoom,
  onAddCatalogItemToRoom,
  onAutoPlaceCatalogItemInRoom,
  onPreviewCatalogPlacementIntent,
  onCatalogDragStart,
  onCatalogDragEnd,
  onAddActiveRoomCartReadyItems,
  onReviewShoppingIssue,
  onSelectRoom,
  onPlacementAddModeChange,
  onGoShop,
  onSelectedImportedFamilyChange,
  onSelectedImportedProductChange,
}: DesignControlsFurnishPanelProps) {
  const roomRecommendationKey = `${activeRoomName}:${activeRoomTypeLabel}`;
  const [selectedCatalogCategoryByRoom, setSelectedCatalogCategoryByRoom] = useState<
    Record<string, CatalogTopCategory>
  >({});
  const [experienceMode, setExperienceMode] = useState<FurnishExperienceMode>("catalog");
  const catalogPanelRef = useRef<HTMLElement>(null);
  const focusCatalogAfterModeChangeRef = useRef(false);
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
  const catalogItemById = useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems]
  );
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
    selectedCatalogCategoryByRoom[roomRecommendationKey] ?? defaultCatalogCategory;
  const handleCatalogCategoryChange = (category: CatalogTopCategory) => {
    setSelectedCatalogCategoryByRoom((prev) => ({
      ...prev,
      [roomRecommendationKey]: category,
    }));
  };
  const handleBrowseCatalogCategory = (category: CatalogTopCategory) => {
    handleCatalogCategoryChange(category);
    focusCatalogAfterModeChangeRef.current = true;
    setExperienceMode("catalog");
  };
  useEffect(() => {
    if (experienceMode !== "catalog" || !focusCatalogAfterModeChangeRef.current) return;
    focusCatalogAfterModeChangeRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      catalogPanelRef.current
        ?.querySelector<HTMLInputElement>('[data-testid="catalog-search-input"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCatalogCategory, experienceMode]);
  const handleExperienceModeChange = (mode: FurnishExperienceMode) => {
    if (mode === "catalog") {
      if (experienceMode === "catalog") {
        catalogPanelRef.current
          ?.querySelector<HTMLInputElement>('[data-testid="catalog-search-input"]')
          ?.focus();
      } else {
        focusCatalogAfterModeChangeRef.current = true;
      }
    }
    setExperienceMode(mode);
  };
  const canChooseRoom = rooms.length > 1 && canEdit;
  const checklistCategories = recommendedCategories.slice(0, Math.min(4, recommendedCategories.length));
  const activeRoomCartReadyItems = useMemo(
    () =>
      activeRoomShoppingItems.filter(
        (item) => item.commerceMode === "shopify" && item.hasValidCommerce
      ),
    [activeRoomShoppingItems]
  );
  const activeRoomCartReadyIncludedCount = activeRoomCartReadyItems.filter(
    (item) => item.includeInCheckout
  ).length;
  const activeRoomRetailerLinkCount = activeRoomShoppingItems.filter(
    (item) => item.commerceMode === "affiliate" && item.hasValidCommerce
  ).length;
  const activeRoomMissingCommerceCount = activeRoomShoppingItems.filter(
    (item) => !item.hasValidCommerce
  ).length;
  const shoppingReadiness = useMemo(
    () => summarizeShoppingReadinessItems(activeRoomShoppingItems),
    [activeRoomShoppingItems]
  );
  const nextActionSuggestions = useMemo(() => {
    const suggestions: Array<{ label: string; category: CatalogTopCategory }> = [];
    const has = (category: CatalogTopCategory) => (activeRoomCategoryCounts[category] ?? 0) > 0;
    const roomKey = normalizeRoomRecommendationKey(activeRoomTypeLabel);
    if (roomKey === "bedroom" && !has("bed") && catalogCategoryCounts.bed) {
      suggestions.push({ label: "Anchor the bedroom with a bed", category: "bed" });
    }
    if (!has("sofa") && catalogCategoryCounts.sofa) {
      suggestions.push({ label: "Anchor the room with a sofa", category: "sofa" });
    }
    if (has("sofa") && !has("coffee_table") && catalogCategoryCounts.coffee_table) {
      suggestions.push({ label: "Add a coffee table in front of seating", category: "coffee_table" });
    }
    if ((has("sofa") || has("accent_chair")) && !has("rug") && catalogCategoryCounts.rug) {
      suggestions.push({ label: "Define the seating zone with a rug", category: "rug" });
    }
    if (!has("ceiling_light") && catalogCategoryCounts.ceiling_light) {
      suggestions.push({ label: "Add a ceiling light", category: "ceiling_light" });
    } else if (!has("floor_lamp") && catalogCategoryCounts.floor_lamp) {
      suggestions.push({ label: "Add lighting for the room", category: "floor_lamp" });
    } else if (!has("table_lamp") && catalogCategoryCounts.table_lamp) {
      suggestions.push({ label: "Add a table lamp", category: "table_lamp" });
    }
    if (!has("side_table") && (has("sofa") || has("accent_chair")) && catalogCategoryCounts.side_table) {
      suggestions.push({ label: "Place a side table beside seating", category: "side_table" });
    }
    return suggestions.slice(0, 3);
  }, [activeRoomCategoryCounts, activeRoomTypeLabel, catalogCategoryCounts]);
  const furnishingCompleteness = useMemo(() => {
    const has = (categories: CatalogTopCategory[]) =>
      categories.some((category) => (activeRoomCategoryCounts[category] ?? 0) > 0);
    const roomKey = normalizeRoomRecommendationKey(activeRoomTypeLabel);
    const checks: FurnishingCompletenessCheck[] = [
      roomKey === "bedroom"
        ? { id: "bed", label: "Bed", complete: has(["bed"]) }
        : { id: "seating", label: "Seating", complete: has(["sofa", "accent_chair", "ottoman"]) },
      { id: "surfaces", label: "Surfaces", complete: has(["coffee_table", "side_table", "dining_table"]) },
      { id: "lighting", label: "Lighting", complete: has(["floor_lamp", "table_lamp", "ceiling_light"]) },
      { id: "rug", label: "Rug", complete: has(["rug"]) },
      { id: "storage", label: "Storage", complete: has(["tv_console", "sideboard", "decor"]) },
      {
        id: "shopping",
        label: "Shopping readiness",
        complete: shoppingReadiness.ready,
        detail: shoppingReadiness.detail,
      },
    ];
    const completeCount = checks.filter((check) => check.complete).length;
    return {
      checks,
      completeCount,
      percent: Math.round((completeCount / checks.length) * 100),
      next: checks.find((check) => !check.complete) ?? null,
    };
  }, [activeRoomCategoryCounts, activeRoomTypeLabel, shoppingReadiness]);
  const completionAllowance = budget === "$" ? 800 : budget === "$$$" ? 2200 : 1200;
  const budgetTarget = Math.max(
    1000,
    Math.ceil((activeRoomShoppingSubtotal + completionAllowance) / 500) * 500
  );
  const budgetRemaining = Math.max(0, budgetTarget - activeRoomShoppingSubtotal);
  const budgetNextCategory =
    nextActionSuggestions[0]?.category ??
    recommendedCategories.find((category) => (activeRoomCategoryCounts[category] ?? 0) === 0) ??
    recommendedCategories[0];
  const budgetRecommendations = useMemo(
    () =>
      buildRoomBudgetRecommendations({
        catalogItems,
        currentSubtotal: activeRoomShoppingSubtotal,
        budgetTarget,
        categoryCounts: activeRoomCategoryCounts,
        recommendedCategories,
        nextActionCategories: nextActionSuggestions.map((suggestion) => suggestion.category),
        roomWidth,
        roomDepth,
        activeStyle: style,
        productQuantities: activeRoomProductQuantities,
        limit: 3,
      }),
    [
      activeRoomCategoryCounts,
      activeRoomProductQuantities,
      activeRoomShoppingSubtotal,
      budgetTarget,
      catalogItems,
      nextActionSuggestions,
      recommendedCategories,
      roomDepth,
      roomWidth,
      style,
    ]
  );
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const panelClass = dark
    ? "designer-dock rounded-2xl p-4"
    : "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm";
  const mutedClass = dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500";
  const statCardClass = dark
    ? "designer-raised rounded-xl p-3"
    : "rounded-xl border border-neutral-200 bg-neutral-50 p-3";
  const inputClass = dark
    ? "designer-control w-full rounded-xl border px-3 py-2 text-sm text-neutral-100"
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
        <div className="mt-4" data-testid="furnish-experience-picker">
          <div className={titleClass}>How do you want to furnish?</div>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Furnishing experience">
            {(
              [
                {
                  id: "catalog",
                  title: "Full catalog",
                },
                {
                  id: "guided",
                  title: "Guided",
                },
              ] as const
            ).map((option) => {
              const active = experienceMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`furnish-mode-${option.id}`}
                  data-active={active ? "true" : "false"}
                  aria-pressed={active}
                  onClick={() => handleExperienceModeChange(option.id)}
                  className={
                    active
                      ? dark
                        ? "min-h-11 rounded-xl border border-white bg-white px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                        : "min-h-11 rounded-xl border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
                      : dark
                        ? "designer-control min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                        : "min-h-11 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  }
                >
                  {option.title}
                </button>
              );
            })}
          </div>
          <div className={`${mutedClass} mt-2`} data-testid="furnish-mode-description">
            {experienceMode === "catalog"
              ? "Search and filter every verified product."
              : `Room-aware steps and recommendations for ${activeRoomTypeLabel}.`}
          </div>
        </div>
        <div
          hidden={experienceMode !== "guided"}
          className={
            dark
              ? "designer-recessed mt-4 rounded-xl p-3"
              : "mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          }
          data-testid="room-furnishing-completeness"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={titleClass}>Room completeness</div>
              <div className={mutedClass}>
                {furnishingCompleteness.completeCount}/{furnishingCompleteness.checks.length} essentials ready
              </div>
            </div>
            <span
              className={
                furnishingCompleteness.percent >= 80
                  ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                  : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
              }
            >
              {furnishingCompleteness.percent}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${furnishingCompleteness.percent}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {furnishingCompleteness.checks.map((check) => (
              <span
                key={check.id}
                data-testid={`room-completeness-${check.id}`}
                title={check.detail}
                className={
                  check.complete
                    ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                    : "rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600"
                }
              >
                {check.label}
              </span>
            ))}
          </div>
          <div
            data-testid="shopping-readiness-detail"
            className={
              shoppingReadiness.ready
                ? dark
                  ? "mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-xs text-emerald-100"
                  : "mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                : dark
                  ? "mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-xs text-amber-100"
                  : "mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">
                  {shoppingReadiness.ready ? "Shopping ready" : "Shopping needs attention"}
                </div>
                <div className="mt-1 opacity-80">{shoppingReadiness.detail}</div>
              </div>
              <span
                className={
                  shoppingReadiness.ready
                    ? "shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                    : "shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                }
              >
                {shoppingReadiness.ready ? "Ready" : `${shoppingReadiness.blockers.length} fix${shoppingReadiness.blockers.length === 1 ? "" : "es"}`}
              </span>
            </div>
            {shoppingReadiness.blockers.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="shopping-readiness-blockers">
                {shoppingReadiness.blockers.map((blocker) => (
                  <button
                    type="button"
                    key={blocker.id}
                    data-testid={`shopping-readiness-${blocker.id}`}
                    className={
                      dark
                        ? "rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100"
                        : "rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                    }
                    onClick={() => onReviewShoppingIssue(blocker.filter)}
                  >
                    {blocker.label}
                  </button>
                ))}
              </div>
            ) : null}
            {shoppingReadiness.notInCartCount > 0 ? (
              <button
                type="button"
                data-testid="shopping-readiness-add-cart-ready"
                className={
                  dark
                    ? "mt-3 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-950 hover:bg-neutral-200"
                    : "mt-3 rounded-lg bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-800"
                }
                onClick={onAddActiveRoomCartReadyItems}
              >
                Add cart-ready items
              </button>
            ) : null}
          </div>
          {budgetNextCategory ? (
            <button
              type="button"
              data-testid="budget-aware-room-completion"
              className={
                dark
                  ? "designer-control mt-3 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left"
                  : "mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left hover:bg-neutral-50"
              }
              onClick={() => handleBrowseCatalogCategory(budgetNextCategory)}
            >
              <span className="min-w-0">
                <span className={dark ? "block text-xs font-semibold text-neutral-100" : "block text-xs font-semibold text-neutral-900"}>
                  Complete under {formatMoney(budgetTarget)}
                </span>
                <span className={mutedClass}>
                  {formatMoney(budgetRemaining)} left · add {getTopCategoryLabel(budgetNextCategory).toLowerCase()}
                </span>
              </span>
              <span className={dark ? "text-[11px] font-semibold text-neutral-300" : "text-[11px] font-semibold text-neutral-600"}>
                Browse
              </span>
            </button>
          ) : null}
          {budgetRecommendations.length > 0 ? (
            <div className="mt-3 space-y-2" data-testid="budget-aware-product-recommendations">
              {budgetRecommendations.map((recommendation) => {
                const product = catalogItemById.get(recommendation.productId);
                const thumbUrl =
                  product?.variants.find((variant) => variant.id === recommendation.variantId)?.thumbnailUrl ||
                  product?.assets.thumbUrl ||
                  null;
                return (
                  <div
                    key={recommendation.productId}
                    className={
                      dark
                        ? "designer-raised flex gap-3 rounded-xl p-2"
                        : "flex gap-3 rounded-xl border border-neutral-200 bg-white p-2"
                    }
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                      {thumbUrl ? (
                        <LazyImage
                          src={thumbUrl}
                          alt={recommendation.title}
                          className="h-full w-full"
                          imageClassName="object-contain object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-neutral-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          dark
                            ? "line-clamp-1 text-xs font-semibold text-neutral-100"
                            : "line-clamp-1 text-xs font-semibold text-neutral-950"
                        }
                      >
                        {recommendation.title}
                      </div>
                      <div className={dark ? "line-clamp-1 text-[11px] text-neutral-400" : "line-clamp-1 text-[11px] text-neutral-500"}>
                        {getTopCategoryLabel(recommendation.category)} · {recommendation.reason}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            recommendation.overBudget
                              ? "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                              : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                          }
                        >
                          {recommendation.overBudget
                            ? `${formatMoney(Math.abs(recommendation.remainingAfterAdd))} over`
                            : `${formatMoney(recommendation.remainingAfterAdd)} left`}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                          {recommendation.priceLabel}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          data-testid={`budget-recommendation-add-${recommendation.productId}`}
                          className={
                            dark
                              ? "rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:opacity-50"
                              : "rounded-lg bg-neutral-900 px-2 py-1.5 text-[11px] font-semibold text-white disabled:bg-neutral-300"
                          }
                          disabled={!canEdit}
                          onClick={() => onAddCatalogItemToRoom(recommendation.productId, recommendation.variantId)}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          data-testid={`budget-recommendation-auto-${recommendation.productId}`}
                          className={secondaryButtonClass}
                          disabled={!canEdit || !onAutoPlaceCatalogItemInRoom}
                          onClick={() =>
                            (onAutoPlaceCatalogItemInRoom ?? onAddCatalogItemToRoom)(
                              recommendation.productId,
                              recommendation.variantId
                            )
                          }
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {rooms.length > 1 ? (
          <label
            className={
              dark
                ? "designer-raised mt-4 block rounded-xl p-3"
                : "mt-4 block rounded-xl border border-neutral-200 bg-neutral-50 p-3"
            }
          >
            <span
              className={
                dark
                  ? "text-xs font-semibold uppercase tracking-wide text-neutral-400"
                  : "text-xs font-semibold uppercase tracking-wide text-neutral-500"
              }
            >
              Add items to
            </span>
            <select
              className={`${inputClass} mt-2`}
              value={activeRoomId}
              disabled={!canChooseRoom}
              data-testid="furnish-room-target-select"
              onChange={(event) => onSelectRoom(event.currentTarget.value)}
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2" data-testid="placement-add-mode">
          {(["preview", "auto"] as const).map((mode) => {
            const active = placementAddMode === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`placement-add-mode-${mode}`}
                data-active={active ? "true" : "false"}
                className={
                  active
                    ? dark
                      ? "rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950"
                      : "rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"
                    : dark
                      ? "rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10"
                      : "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                }
                onClick={() => onPlacementAddModeChange(mode)}
              >
                {mode === "preview" ? "Preview Add" : "Auto Add"}
              </button>
            );
          })}
        </div>
      </section>

      <section
        ref={catalogPanelRef}
        hidden={experienceMode !== "catalog"}
        className={panelClass}
        data-testid="furnish-full-catalog"
        data-mode-content="catalog"
      >
        <CatalogPanel
            items={catalogItems}
            canEdit={canEdit}
            onAddToRoom={onAddCatalogItemToRoom}
            onAutoPlaceInRoom={onAutoPlaceCatalogItemInRoom}
            onPreviewPlacementIntent={onPreviewCatalogPlacementIntent}
            onCatalogDragStart={onCatalogDragStart}
            onCatalogDragEnd={onCatalogDragEnd}
            activeRoomName={activeRoomName}
            recommendedCategoryIds={recommendedCategories}
            title="Browse catalog"
            selectedCategory={activeCatalogCategory}
            onSelectedCategoryChange={handleCatalogCategoryChange}
            activeRoomProductQuantities={activeRoomProductQuantities}
            activeRoomVariantQuantities={activeRoomVariantQuantities}
            activeRoomCategoryCounts={activeRoomCategoryCounts}
            activeRoomWidth={roomWidth}
            activeRoomDepth={roomDepth}
        />
      </section>

      <section
        hidden={experienceMode !== "guided"}
        className={panelClass}
        data-testid="furnish-guided-checklist"
        data-mode-content="guided"
      >
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
        {nextActionSuggestions.length > 0 ? (
          <div className="mt-3 space-y-2" data-testid="guided-furnish-next-actions">
            {nextActionSuggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                className={
                  dark
                    ? "flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-left hover:bg-emerald-400/15"
                    : "flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left hover:bg-emerald-100"
                }
                onClick={() => handleBrowseCatalogCategory(suggestion.category)}
              >
                <span className={dark ? "text-xs font-semibold text-emerald-100" : "text-xs font-semibold text-emerald-800"}>
                  {suggestion.label}
                </span>
                <span className={dark ? "text-[11px] font-semibold text-emerald-200" : "text-[11px] font-semibold text-emerald-700"}>
                  Browse
                </span>
              </button>
            ))}
          </div>
        ) : null}
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
                    ? "designer-control flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left"
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
          <>
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
                <div className={mutedClass}>Room total</div>
              </div>
            </div>

            <div
              className={
                dark
                  ? "designer-recessed mt-3 rounded-xl p-3"
                  : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={titleClass}>Room bill of materials</div>
                  <div className={mutedClass}>
                    {activeRoomCartReadyItems.length} cart-ready · {activeRoomRetailerLinkCount} retailer link
                    {activeRoomRetailerLinkCount === 1 ? "" : "s"}
                    {activeRoomMissingCommerceCount > 0
                      ? ` · ${activeRoomMissingCommerceCount} needs review`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="furnish-add-cart-ready-items"
                  onClick={onAddActiveRoomCartReadyItems}
                  disabled={
                    activeRoomCartReadyItems.length === 0 ||
                    activeRoomCartReadyIncludedCount === activeRoomCartReadyItems.length
                  }
                  className={
                    dark
                      ? "shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                      : "shrink-0 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                  }
                >
                  {activeRoomCartReadyItems.length === 0
                    ? "No cart-ready"
                    : activeRoomCartReadyIncludedCount === activeRoomCartReadyItems.length
                      ? "Cart-ready added"
                      : "Add all cart-ready"}
                </button>
              </div>
            </div>

            {activeRoomShoppingItems.length > 0 ? (
              <div className="mt-3 space-y-2" data-testid="furnish-room-bom-list">
                {activeRoomShoppingItems.slice(0, 4).map((item) => (
                  <div
                    key={item.instanceId}
                    data-testid="furnish-room-bom-item"
                    className={
                      dark
                        ? "designer-raised flex gap-3 rounded-xl p-2"
                        : "flex gap-3 rounded-xl border border-neutral-200 bg-white p-2"
                    }
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                      {item.imageUrl ? (
                        <LazyImage
                          src={item.imageUrl}
                          fallbackSrc={item.fallbackImageUrl ?? undefined}
                          alt={item.title}
                          className="h-full w-full"
                          imageClassName="object-contain object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-neutral-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          dark
                            ? "line-clamp-1 text-xs font-semibold text-neutral-100"
                            : "line-clamp-1 text-xs font-semibold text-neutral-950"
                        }
                      >
                        {item.title}
                      </div>
                      <div className={dark ? "line-clamp-1 text-[11px] text-neutral-400" : "line-clamp-1 text-[11px] text-neutral-500"}>
                        {item.variantLabel} · Qty {item.quantity}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            item.hasValidCommerce
                              ? item.commerceMode === "affiliate"
                                ? "rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                                : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                              : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                          }
                        >
                          {item.cartStatusLabel}
                        </span>
                        <span
                          className={
                            item.hasValidCommerce
                              ? "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600"
                              : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                          }
                        >
                          {item.retailerStatusLabel}
                        </span>
                        {item.retailerUrl ? (
                          <a
                            href={item.retailerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-semibold text-neutral-600 underline underline-offset-2"
                          >
                            Retailer
                          </a>
                        ) : null}
                      </div>
                      {item.warningLabel ? (
                        <div className="mt-1 text-[10px] font-medium text-amber-700">
                          {item.warningLabel}
                        </div>
                      ) : null}
                    </div>
                    <div className={dark ? "shrink-0 text-right text-xs font-semibold text-neutral-100" : "shrink-0 text-right text-xs font-semibold text-neutral-900"}>
                      {item.priceLabel}
                    </div>
                  </div>
                ))}
                {activeRoomShoppingItems.length > 4 ? (
                  <button
                    type="button"
                    onClick={onGoShop}
                    className={secondaryButtonClass}
                  >
                    View {activeRoomShoppingItems.length - 4} more in Shop
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section
        hidden={experienceMode !== "guided"}
        className={panelClass}
        data-testid="furnish-guided-recommendations"
        data-mode-content="guided"
      >
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
                      ? "designer-control-active rounded-xl border p-3 text-left"
                      : "rounded-xl border border-neutral-900 bg-neutral-900 p-3 text-left text-white shadow-sm"
                    : dark
                      ? "designer-control rounded-xl border p-3 text-left text-neutral-200"
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
                ? "designer-recessed mt-3 rounded-xl p-3"
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

    </div>
  );
}
