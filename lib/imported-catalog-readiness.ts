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

/**
 * Admin can publish a model while an editor is open, so the imported catalogue is read again when
 * the window regains focus, but at most this often: it is 2.5 MB of JSON, and the server takes
 * 1.5 s or more to answer it (measured on production, 10 Oct 2026).
 */
export const IMPORTED_CATALOG_REFRESH_AFTER_MS = 5 * 60_000;

/** Runs `read` now; the function it returns runs it again once `intervalMs` has passed since the last run. */
export function readNowAndAtMostEvery(intervalMs: number, read: () => void, now: () => number = Date.now): () => void {
  let lastReadAt = now();
  read();
  return () => {
    if (now() - lastReadAt < intervalMs) return;
    lastReadAt = now();
    read();
  };
}
