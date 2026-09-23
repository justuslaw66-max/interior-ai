"use client";

import { useCallback, useEffect } from "react";

import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { initializeCatalog } from "@/lib/catalog-init";
import {
  replaceShoppingItemWithRecommendation,
  type DesignPageShoppingItemReplacement,
} from "@/lib/design-page-shopping-item-replacement";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import type { DesignPageItemUpdater } from "@/lib/useDesignPageItemDocumentController";

type CommitDesignPageItems = (
  updater: DesignPageItemUpdater,
  actionName?: string
) => void;

export type UseDesignPageShoppingCatalogRuntimeInput = {
  actions: {
    document: { commitItems: CommitDesignPageItems };
    shopping: {
      setReadinessFilter: (filter: ShoppingReadinessFilter) => void;
      goShop: () => void;
    };
    feedback: { showToast: (message: string) => void };
  };
};

export type DesignPageShoppingCatalogRuntime = {
  actions: {
    swapItem: (
      instanceId: string,
      replacement: DesignPageShoppingItemReplacement
    ) => void;
    reviewIssue: (filter: ShoppingReadinessFilter) => void;
  };
};

/** Registers shopping actions before the mount-time catalog startup effect. */
export function useDesignPageShoppingCatalogRuntime({
  actions,
}: UseDesignPageShoppingCatalogRuntimeInput): DesignPageShoppingCatalogRuntime {
  const { commitItems } = actions.document;
  const { setReadinessFilter, goShop } = actions.shopping;
  const { showToast } = actions.feedback;
  const swapItem = useCallback(
    (
      instanceId: string,
      replacement: DesignPageShoppingItemReplacement
    ) => {
      const replacementProduct = CATALOG_ITEMS[replacement.productId];
      commitItems(
        (previous) =>
          replaceShoppingItemWithRecommendation(
            previous,
            instanceId,
            replacement
          ),
        `Swap to ${replacementProduct?.title ?? "shoppable replacement"}`
      );
      showToast("Swapped in a shoppable replacement");
    },
    [commitItems, showToast]
  );

  const reviewIssue = useCallback(
    (filter: ShoppingReadinessFilter) => {
      setReadinessFilter(filter);
      goShop();
    },
    [goShop, setReadinessFilter]
  );

  useEffect(() => {
    const validation = initializeCatalog();

    track("catalog_initialized", {
      total_items: validation.summary.total,
      valid_items: validation.summary.valid,
      has_errors: !validation.valid,
    });
  }, []);

  return { actions: { swapItem, reviewIssue } };
}
