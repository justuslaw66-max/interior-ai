"use client";

import { useId, useMemo } from "react";
import CatalogPanel from "@/components/catalog/CatalogPanel";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import { recommendedCatalogCategoriesForRoom } from "@/lib/catalog/category-chips";
import { useCatalogCategoryNavigation } from "@/lib/catalog/filter-navigation";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";
import { FurnishFooter } from "./FurnishFooter";
import { FurnishImportedModels } from "./FurnishImportedModels";
import { FurnishInThisRoom } from "./FurnishInThisRoom";
import { PlacementAddModeToggle } from "./PlacementAddModeToggle";

type ImportedFamilyOption = {
  familyKey: string;
  familyLabel: string;
};

type DesignControlsFurnishPanelProps = {
  dark: boolean;
  canEdit: boolean;
  /** Pro chooses Preview Add or Auto Add; consumers' Add places the product (FU4). */
  isDesigner?: boolean;
  /** Suggest a layout sits beside the search (ST12). */
  aiDesignEnabled: boolean;
  onGoAiDesign: () => void;
  activeRoomName: string;
  activeRoomId: string;
  catalogRoomNavigationRevision: number;
  rooms: Array<{ id: string; name: string }>;
  activeRoomTypeLabel: string;
  activeRoomShoppingSubtotal: number;
  activeRoomShoppingItems: ActiveRoomShoppingItem[];
  selectedPlacedItemId: string | null;
  activeRoomProductQuantities: Record<string, number>;
  activeRoomVariantQuantities: Record<string, number>;
  placementAddMode: "preview" | "auto";
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
  onSelectPlacedItem: (instanceId: string) => void;
  onSelectRoom: (roomId: string) => void;
  onPlacementAddModeChange: (mode: "preview" | "auto") => void;
  onGoShop: () => void;
  onSelectedImportedFamilyChange: (familyKey: string) => void;
  onSelectedImportedProductChange: (productId: string) => void;
};

type FurnishRoomRowProps = Pick<DesignControlsFurnishPanelProps, "rooms" | "activeRoomId" | "activeRoomName" | "canEdit" | "onSelectRoom">;

/** Which room Add puts products in: a choice once the design has more than one. */
function FurnishRoomRow({ rooms, activeRoomId, activeRoomName, canEdit, onSelectRoom }: FurnishRoomRowProps) {
  const targetId = useId();
  return (
    <div className="mb-3 flex min-h-10 items-center justify-between gap-2" data-testid="furnish-room-summary">
      <label htmlFor={targetId} className="text-[13px] font-bold text-neutral-700">
        Room
      </label>
      {rooms.length > 1 ? (
        <select
          id={targetId}
          className="min-h-10 min-w-0 max-w-[65%] rounded-lg border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900 md:min-h-8"
          value={activeRoomId}
          disabled={!canEdit}
          data-testid="furnish-room-target-select"
          onChange={(event) => onSelectRoom(event.currentTarget.value)}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      ) : (
        <output id={targetId} className="min-w-0 truncate text-[13px] font-semibold text-neutral-900">
          {activeRoomName}
        </output>
      )}
    </div>
  );
}

/** The products: search with Suggest a layout beside it (ST12), the chips, the cards. */
function FurnishCatalogSection(props: DesignControlsFurnishPanelProps) {
  const { canEdit, isDesigner = false, activeRoomName, activeRoomTypeLabel, onAddCatalogItemToRoom } = props;
  const recommendedCategories = useMemo(
    () => recommendedCatalogCategoriesForRoom(activeRoomTypeLabel),
    [activeRoomTypeLabel]
  );
  const {
    activeCategory: activeCatalogCategory,
    revision: catalogCategoryNavigationRevision,
    selectCategory: handleCatalogCategoryChange,
  } = useCatalogCategoryNavigation(`${activeRoomName}:${activeRoomTypeLabel}`, "all");
  const catalogRoomNavigationRevision = props.catalogRoomNavigationRevision;
  const suggestLayout = props.aiDesignEnabled ? (
    <button
      type="button"
      data-testid="editor-workflow-ai"
      className="h-10 shrink-0 whitespace-nowrap rounded-lg border border-neutral-300 bg-white px-1.5 text-[13px] font-bold text-blue-800 hover:bg-neutral-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900"
      onClick={props.onGoAiDesign}
    >
      Suggest a layout
    </button>
  ) : null;
  return (
    <CatalogPanel
      items={props.catalogItems}
      canEdit={canEdit}
      onAddToRoom={onAddCatalogItemToRoom} directAdd={!isDesigner}
      onAutoPlaceInRoom={props.onAutoPlaceCatalogItemInRoom}
      onPreviewPlacementIntent={props.onPreviewCatalogPlacementIntent}
      onCatalogDragStart={props.onCatalogDragStart}
      onCatalogDragEnd={props.onCatalogDragEnd}
      activeRoomName={activeRoomName}
      recommendedCategoryIds={recommendedCategories}
      selectedCategory={activeCatalogCategory}
      onSelectedCategoryChange={handleCatalogCategoryChange}
      navigationRevision={`${catalogRoomNavigationRevision}:${catalogCategoryNavigationRevision}`}
      activeRoomProductQuantities={props.activeRoomProductQuantities}
      activeRoomVariantQuantities={props.activeRoomVariantQuantities}
      searchAside={suggestLayout}
    />
  );
}

/**
 * Furnish, products first (audit findings FU1, ST12): the room, the search with Suggest a layout
 * beside it, the category chips and the products; then what's in the room and the way to Shop.
 */
export default function DesignControlsFurnishPanel(props: DesignControlsFurnishPanelProps) {
  const { dark, canEdit, isDesigner = false, activeRoomName, activeRoomShoppingItems } = props;
  const { placementAddMode, onPlacementAddModeChange } = props;
  const productCount = activeRoomShoppingItems.reduce((total, item) => total + item.quantity, 0);
  const panelClass = dark ? "designer-dock rounded-2xl p-3" : "rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm";

  return (
    <div className="space-y-3">
      <section className={panelClass} data-testid="furnish-full-catalog" data-mode-content="catalog">
        <FurnishRoomRow {...props} />
        <PlacementAddModeToggle visible={isDesigner} mode={placementAddMode} onChange={onPlacementAddModeChange} />
        <FurnishCatalogSection {...props} />
      </section>
      <FurnishInThisRoom
        roomName={activeRoomName}
        items={activeRoomShoppingItems}
        selectedId={props.selectedPlacedItemId}
        canEdit={canEdit}
        onSelect={props.onSelectPlacedItem}
      />
      <FurnishImportedModels
        visible={isDesigner}
        canEdit={canEdit}
        activeRoomName={activeRoomName}
        selectedFamilyKey={props.selectedImportedFamilyKey}
        selectedProductId={props.selectedImportedProductId}
        familyOptions={props.importedFamilyOptions}
        modelOptions={props.importedModelOptions}
        visibleModelOptions={props.visibleImportedModelOptions}
        onFamilyChange={props.onSelectedImportedFamilyChange}
        onProductChange={props.onSelectedImportedProductChange}
        onAdd={props.onAddImportedToRoom}
      />
      <FurnishFooter
        roomName={activeRoomName}
        productCount={productCount}
        total={props.activeRoomShoppingSubtotal}
        onGoShop={props.onGoShop}
      />
    </div>
  );
}
