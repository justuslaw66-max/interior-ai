"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Owns the short-lived browser resources used while editing an imported floor plan.
 * Persisted data URLs live in the design snapshot; the original PDF bytes and any
 * object URL are intentionally session-only.
 */
export function useDesignPageFloorPlanAssets() {
  const underlayObjectUrlRef = useRef<string | null>(null);
  const pdfSourceDataRef = useRef<ArrayBuffer | null>(null);

  const revokeUnderlayObjectUrl = useCallback(() => {
    if (!underlayObjectUrlRef.current || typeof URL === "undefined") return;
    URL.revokeObjectURL(underlayObjectUrlRef.current);
    underlayObjectUrlRef.current = null;
  }, []);

  useEffect(() => revokeUnderlayObjectUrl, [revokeUnderlayObjectUrl]);

  return {
    refs: {
      underlayObjectUrlRef,
      pdfSourceDataRef,
    },
    actions: {
      revokeUnderlayObjectUrl,
    },
  };
}
