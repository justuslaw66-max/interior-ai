"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ResolvedCatalogVariant } from "@/lib/catalog/variant-resolver";
import type { Style } from "@/lib/design-page-types";
import { announceUndoableAction } from "@/lib/editor-action-toast";
import type { DesignItem } from "@/lib/room-types";
import { cheaperSwapFor, pricierSwapFor, withShoppingLineSwapped } from "@/lib/shopping-list";

export type DesignPageSelectedItemLockLabel =
  | "Lock"
  | "Unlock"
  | "Lock selected"
  | "Unlock selected";

type SelectedItemLockState = Pick<DesignItem, "instanceId" | "locked">;

export type GetDesignPageSelectedItemLockLabelInput = {
  selectedCount: number;
  items: readonly SelectedItemLockState[];
  selectedIds: ReadonlySet<string>;
  selectedItem: Pick<DesignItem, "locked"> | null;
};

export function getDesignPageSelectedItemLockLabel({
  selectedCount,
  items,
  selectedIds,
  selectedItem,
}: GetDesignPageSelectedItemLockLabelInput): DesignPageSelectedItemLockLabel {
  if (selectedCount > 1) {
    const allSelectedItemsAreLocked = items
      .filter((item) => selectedIds.has(item.instanceId))
      .every((item) => item.locked);
    return allSelectedItemsAreLocked ? "Unlock selected" : "Lock selected";
  }

  return selectedItem?.locked ? "Unlock" : "Lock";
}

type CommerceVariant = Pick<ResolvedCatalogVariant, "commerce">;

export type DesignPageSelectedItemCommerceTarget = {
  buyUrl: string;
  retailer: string | null;
};

export type GetDesignPageSelectedItemCommerceTargetInput = {
  product: Pick<CatalogItemSchema, "id"> | null | undefined;
  resolvedVariant: CommerceVariant | null | undefined;
};

export function getDesignPageSelectedItemCommerceTarget({
  product,
  resolvedVariant,
}: GetDesignPageSelectedItemCommerceTargetInput): DesignPageSelectedItemCommerceTarget {
  if (!product || !resolvedVariant) {
    return { buyUrl: "", retailer: null };
  }

  if (resolvedVariant.commerce.type === "affiliate") {
    return {
      buyUrl: resolvedVariant.commerce.url ?? "",
      retailer: resolvedVariant.commerce.retailer,
    };
  }

  if (resolvedVariant.commerce.type === "shopify") {
    return {
      buyUrl: `https://yoursite.com/products/${product.id}`,
      retailer: null,
    };
  }

  return { buyUrl: "", retailer: null };
}

type DesignPageSelectedItemUpdater =
  | DesignItem[]
  | ((previous: DesignItem[]) => DesignItem[]);

export type DesignPageSelectedItemPanelControllerState = {
  showInspectorDetails: boolean;
  showFullDimensions: boolean;
  showDeliveryWarranty: boolean;
  showRotationControls: boolean;
  selectedIds: Set<string>;
  selectedInstanceId: string | null;
  selectedItem: DesignItem | null;
  selectedProduct: CatalogItemSchema | null;
  selectedResolvedVariant: ResolvedCatalogVariant | null;
  style: Style;
  designId: string | null;
};

export type DesignPageSelectedItemPanelControllerConfiguration = {
  catalogItems: Record<string, CatalogItemSchema>;
};

export type DesignPageSelectedItemPanelControllerRefs = {
  getSelectedIds: () => Set<string>;
  getItems: () => DesignItem[];
};

export type DesignPageSelectedItemPanelControllerActions = {
  setShowInspectorDetails: Dispatch<SetStateAction<boolean>>;
  setShowFullDimensions: Dispatch<SetStateAction<boolean>>;
  setShowDeliveryWarranty: Dispatch<SetStateAction<boolean>>;
  setShowRotationControls: Dispatch<SetStateAction<boolean>>;
  moveSelectedItemToPosition: (
    x: number,
    z: number,
    actionLabel?: string
  ) => void;
  switchSelectedProductModel: (
    productId: string,
    historyLabel: string
  ) => void;
  showToast: (message: string) => void;
  commitItems: (
    updater: DesignPageSelectedItemUpdater,
    actionName?: string
  ) => void;
};

export type UseDesignPageSelectedItemPanelControllerInput = {
  state: DesignPageSelectedItemPanelControllerState;
  configuration: DesignPageSelectedItemPanelControllerConfiguration;
  refs: DesignPageSelectedItemPanelControllerRefs;
  actions: DesignPageSelectedItemPanelControllerActions;
};

export function useDesignPageSelectedItemPanelController({
  state: {
    showInspectorDetails,
    showFullDimensions,
    showDeliveryWarranty,
    showRotationControls,
    selectedIds,
    selectedInstanceId,
    selectedItem,
    selectedProduct,
    selectedResolvedVariant,
    style,
    designId,
  },
  configuration: { catalogItems },
  refs: {
    getSelectedIds,
    getItems,
  },
  actions: {
    setShowInspectorDetails,
    setShowFullDimensions,
    setShowDeliveryWarranty,
    setShowRotationControls,
    moveSelectedItemToPosition,
    switchSelectedProductModel,
    showToast,
    commitItems,
  },
}: UseDesignPageSelectedItemPanelControllerInput) {
  const toggleSelectedItemDetails = useCallback(() => {
    setShowInspectorDetails((value) => !value);
  }, [setShowInspectorDetails]);

  const toggleSelectedItemDimensions = useCallback(() => {
    setShowFullDimensions((value) => !value);
  }, [setShowFullDimensions]);

  const toggleSelectedItemDeliveryWarranty = useCallback(() => {
    setShowDeliveryWarranty((value) => !value);
  }, [setShowDeliveryWarranty]);

  const toggleSelectedItemRotationControls = useCallback(() => {
    setShowRotationControls((value) => !value);
  }, [setShowRotationControls]);

  const setSelectedItemPosition = useCallback(
    (x: number, z: number) => {
      moveSelectedItemToPosition(x, z, "Set item position");
    },
    [moveSelectedItemToPosition]
  );

  const applySelectedItemStyleAlternative = useCallback(
    (productId: string) => {
      const alternative = catalogItems[productId];
      switchSelectedProductModel(
        productId,
        `Switch to ${alternative?.title ?? "style alternative"}`
      );
      if (alternative) showToast(`Switched to ${alternative.title}`);
    },
    [catalogItems, showToast, switchSelectedProductModel]
  );

  // The item panel names these swaps (UX audit FU10, FU12), and the Shopping list's rules pick them:
  // the nearest product in the category that really costs less or more, never for a set.
  const swapSelectedItem = useCallback(
    (direction: "cheaper" | "pricier") => {
      if (!selectedInstanceId || !selectedProduct || !selectedItem) return;
      if (selectedItem.bundleGroupId || selectedItem.purchaseOptionId) return;
      const findSwap = direction === "cheaper" ? cheaperSwapFor : pricierSwapFor;
      const target = findSwap(selectedProduct.id, style, catalogItems);
      const product = target ? catalogItems[target.productId] : undefined;
      if (!product) {
        showToast(direction === "cheaper" ? "No cheaper alternatives found" : "No pricier alternatives found");
        return;
      }
      const step = `Swap ${selectedProduct.title} for ${product.title}`;
      commitItems((previous) => withShoppingLineSwapped(previous, selectedInstanceId, product), step);
      announceUndoableAction({ message: `Swapped for ${product.title}`, undoLabels: [step] });
    },
    [catalogItems, commitItems, selectedInstanceId, selectedItem, selectedProduct, showToast, style]
  );

  const swapSelectedItemToCheaper = useCallback(() => {
    swapSelectedItem("cheaper");
  }, [swapSelectedItem]);

  const swapSelectedItemToPricier = useCallback(() => {
    swapSelectedItem("pricier");
  }, [swapSelectedItem]);

  const openSelectedItemCommerce = useCallback(async () => {
    if (!selectedProduct || !selectedResolvedVariant) return;

    const { buyUrl } = getDesignPageSelectedItemCommerceTarget({
      product: selectedProduct,
      resolvedVariant: selectedResolvedVariant,
    });
    if (!buyUrl) return;

    // Open synchronously so Safari treats this as a user-initiated navigation.
    // Tracking can take long enough that opening only after the request is
    // resolved is blocked as an unsolicited popup.
    const retailerWindow = window.open("", "_blank");
    if (retailerWindow) retailerWindow.opener = null;
    const openRetailerUrl = (targetUrl: string) => {
      if (retailerWindow && !retailerWindow.closed) {
        retailerWindow.location.replace(targetUrl);
        return;
      }
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    };

    try {
      const response = await fetch("/api/track/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: designId ?? null,
          productId: selectedProduct.id,
          variantId: selectedResolvedVariant.variantId,
        }),
      });
      const data = await response.json();
      const clickKey = data?.clickKey as string | undefined;

      const url = new URL(buyUrl);
      if (clickKey) url.searchParams.set("clickKey", clickKey);
      url.searchParams.set("utm_source", "interior-ai");
      url.searchParams.set("utm_medium", "affiliate");
      openRetailerUrl(url.toString());
    } catch {
      openRetailerUrl(buyUrl);
    }
  }, [designId, selectedProduct, selectedResolvedVariant]);

  const toggleSelectedItemLock = useCallback(() => {
    const selectedSet = getSelectedIds();
    if (selectedSet.size > 1) {
      const selectedItems = getItems().filter((item) =>
        selectedSet.has(item.instanceId)
      );
      if (!selectedItems.length) return;
      const shouldLock = selectedItems.some((item) => !item.locked);
      commitItems(
        (previous) =>
          previous.map((item) =>
            selectedSet.has(item.instanceId)
              ? { ...item, locked: shouldLock }
              : item
          ),
        shouldLock ? "Lock selected" : "Unlock selected"
      );
      return;
    }

    if (!selectedItem) return;
    const nextLocked = !selectedItem.locked;
    commitItems(
      (previous) =>
        previous.map((item) =>
          item.instanceId === selectedItem.instanceId
            ? { ...item, locked: nextLocked }
            : item
        ),
      nextLocked ? "Lock item" : "Unlock item"
    );
  }, [commitItems, getItems, getSelectedIds, selectedItem]);

  const selectedItemLockLabel = getDesignPageSelectedItemLockLabel({
    selectedCount: selectedIds.size,
    items: getItems(),
    selectedIds: getSelectedIds(),
    selectedItem,
  });

  return {
    state: {
      showInspectorDetails,
      showFullDimensions,
      showDeliveryWarranty,
      showRotationControls,
      selectedItemLockLabel,
    },
    actions: {
      toggleSelectedItemDetails,
      toggleSelectedItemDimensions,
      toggleSelectedItemDeliveryWarranty,
      toggleSelectedItemRotationControls,
      setSelectedItemPosition,
      applySelectedItemStyleAlternative,
      swapSelectedItemToCheaper,
      swapSelectedItemToPricier,
      openSelectedItemCommerce,
      toggleSelectedItemLock,
    },
  };
}
