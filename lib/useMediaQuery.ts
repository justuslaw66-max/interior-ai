"use client";

import { useSyncExternalStore } from "react";

/** From md (768px) the editor's canvas controls sit in a toolbar over the canvas (UX 4c). */
export const CANVAS_TOOLBAR_MEDIA_QUERY = "(min-width: 48rem)";

/**
 * Whether a media query matches, kept current as the window resizes. The server and the first
 * client render answer `false` (the phone layout), then the browser's answer takes over.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
