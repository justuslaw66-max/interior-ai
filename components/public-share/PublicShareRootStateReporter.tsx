"use client";

import { useLayoutEffect, useRef } from "react";
import type { PublicShareLayoutMode } from "@/lib/public-share-layout";

export type PublicShareRootState = {
  layoutStatus: "resolving" | "ready" | "empty";
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
  layoutMode: PublicShareLayoutMode | null;
  layoutGeneration: number;
  selectedRoomId: string | null;
  selectedSavedViewId: string | null;
  surface: { width: number; height: number } | null;
};

export function PublicShareRootStateReporter({ state }: { state: PublicShareRootState }) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const root = markerRef.current?.closest<HTMLElement>('[data-testid="public-share-root"]');
    if (!root) return;
    root.dataset.layoutStatus = state.layoutStatus;
    root.dataset.layoutMode = state.layoutMode ?? "resolving";
    root.dataset.layoutGeneration = String(state.layoutGeneration);
    root.dataset.selectedRoomId = state.selectedRoomId ?? "";
    root.dataset.selectedSavedViewId = state.selectedSavedViewId ?? "";
    root.dataset.projectionContentIdentity = state.projectionContentIdentity;
    root.dataset.projectionFingerprint = state.projectionDiagnosticFingerprint;
    root.dataset.surfaceWidth = String(state.surface?.width ?? 0);
    root.dataset.surfaceHeight = String(state.surface?.height ?? 0);
    if (state.layoutStatus === "resolving") root.setAttribute("aria-busy", "true");
    else root.removeAttribute("aria-busy");
  }, [state]);
  return <span ref={markerRef} hidden aria-hidden="true" />;
}
