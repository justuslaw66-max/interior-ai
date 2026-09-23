"use client";

import { useEffect, useState } from "react";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";

type LiveCatalogPayload = {
  ids?: string[];
  itemIds?: string[];
  assetIds?: string[];
};

export function useDesignPageLiveCatalog(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/catalog/live", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Live catalog request failed");
        const payload = (await response.json().catch(() => ({
          ids: [],
          itemIds: [],
          assetIds: [],
        }))) as LiveCatalogPayload;
        const rawItemIds = Array.isArray(payload.itemIds)
            ? payload.itemIds
            : Array.isArray(payload.ids)
              ? payload.ids
              : [];
        const rawAssetIds = Array.isArray(payload.assetIds) ? payload.assetIds : [];
        if (
          rawItemIds.length > 10_000 ||
          rawAssetIds.length > 10_000 ||
          rawItemIds.some((id) => typeof id !== "string" || id.length > 160) ||
          rawAssetIds.some((id) => typeof id !== "string" || id.length > 160)
        ) throw new Error("Live catalog response is invalid");
        const allowedItemIds = new Set(rawItemIds as string[]);
        const allowedAssetIds = new Set(rawAssetIds as string[]);

        if (cancelled) return;

        if (allowedItemIds.size === 0 && allowedAssetIds.size === 0) {
          console.warn("Live catalog returned zero eligible IDs; using local catalog fallback.");
          return;
        }

        let keptCount = 0;
        const idsToRemove: string[] = [];
        const totalCatalogCount = Object.keys(CATALOG_ITEMS).length;

        for (const id of Object.keys(CATALOG_ITEMS)) {
          const assetId = CATALOG_ITEMS[id]?.assets?.assetId;
          const allowed =
            allowedItemIds.has(id) ||
            allowedAssetIds.has(id) ||
            (typeof assetId === "string" && allowedAssetIds.has(assetId));

          if (allowed) {
            keptCount += 1;
          } else {
            idsToRemove.push(id);
          }
        }

        if (keptCount === 0 && (allowedItemIds.size > 0 || allowedAssetIds.size > 0)) {
          console.warn("Live catalog IDs did not match local catalog IDs; skipping prune.", {
            itemIds: allowedItemIds.size,
            assetIds: allowedAssetIds.size,
          });
        } else if (
          keptCount > 0 &&
          totalCatalogCount > 0 &&
          keptCount <= Math.max(3, Math.floor(totalCatalogCount * 0.05))
        ) {
          console.warn("Live catalog prune kept suspiciously few items; using local catalog fallback.", {
            keptCount,
            totalCatalogCount,
            itemIds: allowedItemIds.size,
            assetIds: allowedAssetIds.size,
          });
        } else {
          for (const id of idsToRemove) {
            delete CATALOG_ITEMS[id];
            CATALOG_ITEMS_MAP.delete(id);
          }
        }
      } catch {
        console.warn("Live catalog fetch failed; using local catalog fallback.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return ready;
}
