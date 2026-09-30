"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server-rendered HTML and until React has hydrated it, then true. Pages put it on a
 * `data-client-hydrated` attribute, so browser tests know when their buttons start to work.
 */
export function useClientHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
