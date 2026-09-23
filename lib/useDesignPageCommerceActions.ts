"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  getDesignPageItemCartQuantity,
  removeDesignPageItemCartProduct,
  updateDesignPageItemCartQuantity,
  type DesignPageItemCartEntry,
} from "@/lib/design-page-item-cart";

export type UseDesignPageCommerceActionsInput = {
  state: {
    selectedImportedProductId: string | null;
    itemCart: DesignPageItemCartEntry[];
  };
  actions: {
    catalog: {
      previewPlacement: (productId: string, variantId: string) => void;
      addToRoom: (productId: string) => void;
      addDirectlyToRoom: (productId: string) => boolean;
    };
    importedCatalog: {
      getRelatedProductIds: (productId: string) => string[];
      ensureCatalogItem: (productId: string) => void;
    };
    cart: {
      setItems: Dispatch<SetStateAction<DesignPageItemCartEntry[]>>;
      setOpen: Dispatch<SetStateAction<boolean>>;
    };
    navigation: { goFurnish: () => void };
    feedback: { showToast: (message: string) => void };
  };
};

export type DesignPageCommerceActions = {
  actions: {
    previewShoppingReplacement: (productId: string, variantId: string) => void;
    addSelectedImportedToRoom: () => void;
    removeFromCart: (productId: string) => void;
    updateCartQty: (productId: string, qty: number) => void;
    clearCart: () => void;
    addAllToRoom: () => void;
  };
};

/** Registers shopping-preview, imported-catalog, and selection-tray actions. */
export function useDesignPageCommerceActions({
  state,
  actions,
}: UseDesignPageCommerceActionsInput): DesignPageCommerceActions {
  const { selectedImportedProductId, itemCart } = state;
  const { previewPlacement, addToRoom, addDirectlyToRoom } = actions.catalog;
  const { getRelatedProductIds, ensureCatalogItem } = actions.importedCatalog;
  const { setItems, setOpen } = actions.cart;
  const { goFurnish } = actions.navigation;
  const { showToast } = actions.feedback;

  const previewShoppingReplacement = useCallback(
    (productId: string, variantId: string) => {
      goFurnish();
      previewPlacement(productId, variantId);
      showToast("Previewing replacement placement");
    },
    [goFurnish, previewPlacement, showToast]
  );

  const addSelectedImportedToRoom = useCallback(() => {
    if (!selectedImportedProductId) return;
    const related = getRelatedProductIds(selectedImportedProductId);
    related.forEach((id) => ensureCatalogItem(id));
    addToRoom(selectedImportedProductId);
  }, [
    addToRoom,
    ensureCatalogItem,
    getRelatedProductIds,
    selectedImportedProductId,
  ]);

  const removeFromCart = useCallback(
    (productId: string) => {
      setItems((previous) =>
        removeDesignPageItemCartProduct(previous, productId)
      );
    },
    [setItems]
  );

  const updateCartQty = useCallback(
    (productId: string, qty: number) => {
      if (qty <= 0) {
        removeFromCart(productId);
      } else {
        setItems((previous) =>
          updateDesignPageItemCartQuantity(previous, productId, qty)
        );
      }
    },
    [removeFromCart, setItems]
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, [setItems]);

  const addAllToRoom = useCallback(() => {
    let addedCount = 0;
    itemCart.forEach((cartItem) => {
      for (let i = 0; i < cartItem.qty; i++) {
        if (addDirectlyToRoom(cartItem.productId)) {
          addedCount += 1;
        }
      }
    });
    if (addedCount < getDesignPageItemCartQuantity(itemCart)) {
      showToast("Some cart items could not fit in this room.");
    }
    clearCart();
    setOpen(false);
  }, [addDirectlyToRoom, clearCart, itemCart, setOpen, showToast]);

  return {
    actions: {
      previewShoppingReplacement,
      addSelectedImportedToRoom,
      removeFromCart,
      updateCartQty,
      clearCart,
      addAllToRoom,
    },
  };
}
