"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";
import { initializeCatalog } from "@/lib/catalog-init";

/**
 * Validates the catalogue once, when the editor mounts, and reports the result. Shop's edits
 * (remove and swap, with Undo) belong to the Shopping list now (UX 3c-2).
 */
export function useDesignPageShoppingCatalogRuntime() {
  useEffect(() => {
    const validation = initializeCatalog();

    track("catalog_initialized", {
      total_items: validation.summary.total,
      valid_items: validation.summary.valid,
      has_errors: !validation.valid,
    });
  }, []);
}
