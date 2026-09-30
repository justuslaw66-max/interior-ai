"use client";

import { useEffect, useState } from "react";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";

type LiveCatalogPayload = {
  ids?: string[];
  itemIds?: string[];
  assetIds?: string[];
};

type LiveCatalogIds = { allowedItemIds: Set<string>; allowedAssetIds: Set<string> };

const MAX_LIVE_IDS = 10_000;
const MAX_LIVE_ID_LENGTH = 160;

function isValidIdList(ids: unknown[]) {
  return ids.length <= MAX_LIVE_IDS && ids.every((id) => typeof id === "string" && id.length <= MAX_LIVE_ID_LENGTH);
}

/** The products the live catalog sells; throws when it can't be read or its answer is unusable. */
async function fetchLiveCatalogIds(): Promise<LiveCatalogIds> {
  const response = await fetch("/api/catalog/live", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Live catalog request failed");
  const payload = (await response.json().catch(() => ({
    ids: [],
    itemIds: [],
    assetIds: [],
  }))) as LiveCatalogPayload;
  const rawItemIds = Array.isArray(payload.itemIds) ? payload.itemIds : Array.isArray(payload.ids) ? payload.ids : [];
  const rawAssetIds = Array.isArray(payload.assetIds) ? payload.assetIds : [];
  if (!isValidIdList(rawItemIds) || !isValidIdList(rawAssetIds)) throw new Error("Live catalog response is invalid");
  return { allowedItemIds: new Set(rawItemIds), allowedAssetIds: new Set(rawAssetIds) };
}

/** Takes products the live catalog doesn't sell out of the editor's catalogue, unless its answer looks wrong. */
function pruneToLiveCatalog({ allowedItemIds, allowedAssetIds }: LiveCatalogIds) {
  if (allowedItemIds.size === 0 && allowedAssetIds.size === 0) {
    console.warn("Live catalog returned zero eligible IDs; using local catalog fallback.");
    return;
  }
  const catalogIds = Object.keys(CATALOG_ITEMS);
  const totalCatalogCount = catalogIds.length;
  const idsToRemove = catalogIds.filter((id) => {
    const assetId = CATALOG_ITEMS[id]?.assets?.assetId;
    return !(
      allowedItemIds.has(id) ||
      allowedAssetIds.has(id) ||
      (typeof assetId === "string" && allowedAssetIds.has(assetId))
    );
  });
  const keptCount = totalCatalogCount - idsToRemove.length;
  if (keptCount === 0) {
    console.warn("Live catalog IDs did not match local catalog IDs; skipping prune.", {
      itemIds: allowedItemIds.size,
      assetIds: allowedAssetIds.size,
    });
  } else if (keptCount <= Math.max(3, Math.floor(totalCatalogCount * 0.05))) {
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
}

let sessionLoad: Promise<void> | null = null;
let sessionLoaded = false;

/**
 * The live catalog is read once per page session. The prune changes the shared catalogue, not one
 * editor's state, so an editor that closes mid-read (for My designs, say) lets the read finish, and
 * the next editor reuses it. A failed read is tried again by the next editor.
 */
function loadLiveCatalogOnce(): Promise<void> {
  sessionLoad ??= fetchLiveCatalogIds().then(
    (ids) => {
      pruneToLiveCatalog(ids);
      sessionLoaded = true;
    },
    (cause: unknown) => {
      sessionLoad = null;
      throw cause;
    }
  );
  return sessionLoad;
}

export function useDesignPageLiveCatalog(): boolean {
  const [ready, setReady] = useState(() => sessionLoaded);

  useEffect(() => {
    let cancelled = false;
    loadLiveCatalogOnce()
      .catch(() => {
        if (!cancelled) console.warn("Live catalog fetch failed; using local catalog fallback.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
