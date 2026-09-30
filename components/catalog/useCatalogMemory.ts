"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { CatalogMemoryScope } from "@/lib/catalog/category-chips";

const FAVORITES_STORAGE_KEY = "interior-ai:catalog-favorites";
const RECENTS_STORAGE_KEY = "interior-ai:catalog-recents";
const MAX_FAVORITES = 24;
const MAX_RECENTS = 8;

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Catalogue memory is helpful but nonessential.
  }
}

/** Favourites and recently added products, kept on this device, and which list the chips show. */
export function useCatalogMemory() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readStoredIds(FAVORITES_STORAGE_KEY));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStoredIds(RECENTS_STORAGE_KEY));
  const [memoryScope, setMemoryScope] = useState<CatalogMemoryScope>("all");

  useEffect(() => writeStoredIds(FAVORITES_STORAGE_KEY, favoriteIds), [favoriteIds]);
  useEffect(() => writeStoredIds(RECENTS_STORAGE_KEY, recentIds), [recentIds]);

  const toggleFavorite = (id: string) => {
    const removing = favoriteIds.includes(id);
    track(removing ? "catalog_favorite_remove" : "catalog_favorite_add", { itemId: id });
    setFavoriteIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [id, ...prev].slice(0, MAX_FAVORITES)
    );
  };
  const rememberRecent = (id: string) => {
    setRecentIds((prev) => [id, ...prev.filter((entry) => entry !== id)].slice(0, MAX_RECENTS));
  };

  return { favoriteIds, recentIds, memoryScope, setMemoryScope, toggleFavorite, rememberRecent };
}
