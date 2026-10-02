"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether the imported catalogue (`/api/models/imported`) has answered once in this page session.
 *
 * Sofas, floor lamps and dining benches come only from it, so a furnished template applied before
 * it answers leaves them out (UX phase 4a). Like the live catalog, it is read for the page, not for
 * one editor, so an editor opened later doesn't wait again. A slow answer stops holding the editor
 * back after `IMPORTED_CATALOG_WAIT_MS`.
 */
export const IMPORTED_CATALOG_WAIT_MS = 10_000;

let hydrated = false;
const listeners = new Set<() => void>();

export function markImportedCatalogHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const readHydrated = () => hydrated;
const readHydratedOnServer = () => false;

export function useImportedCatalogHydrated(): boolean {
  const ready = useSyncExternalStore(subscribe, readHydrated, readHydratedOnServer);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(markImportedCatalogHydrated, IMPORTED_CATALOG_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  return ready;
}
