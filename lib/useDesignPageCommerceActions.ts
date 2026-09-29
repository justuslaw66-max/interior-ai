"use client";

import { useCallback } from "react";

export type UseDesignPageCommerceActionsInput = {
  state: {
    selectedImportedProductId: string | null;
  };
  actions: {
    catalog: {
      addToRoom: (productId: string) => void;
    };
    importedCatalog: {
      getRelatedProductIds: (productId: string) => string[];
      ensureCatalogItem: (productId: string) => void;
    };
  };
};

export type DesignPageCommerceActions = {
  actions: {
    addSelectedImportedToRoom: () => void;
  };
};

/**
 * Registers the imported-catalog Add. The Selection Tray and the shopping replacement preview went
 * with the one Shopping list (UX 3c-2).
 */
export function useDesignPageCommerceActions({
  state,
  actions,
}: UseDesignPageCommerceActionsInput): DesignPageCommerceActions {
  const { selectedImportedProductId } = state;
  const { addToRoom } = actions.catalog;
  const { getRelatedProductIds, ensureCatalogItem } = actions.importedCatalog;

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

  return {
    actions: {
      addSelectedImportedToRoom,
    },
  };
}
