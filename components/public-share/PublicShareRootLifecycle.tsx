"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { PublicShareUnavailableCard } from "@/components/public-share/PublicShareUnavailableCard";

const safeAreaStyle: CSSProperties = {
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
  paddingBottom: "env(safe-area-inset-bottom)",
};

type PublicShareFallbackState = "loading" | "invalid" | "error";

const fallbackTestId: Record<PublicShareFallbackState, string> = {
  loading: "public-share-loading",
  invalid: "public-share-invalid",
  error: "public-share-error",
};

function findLifecycleOwner(marker: HTMLElement | null) {
  return marker?.closest<HTMLElement>("[data-public-share-lifecycle-owner]") ?? null;
}

function clearResolvedState(root: HTMLElement) {
  for (const attribute of [
    "data-layout-mode",
    "data-layout-generation",
    "data-selected-room-id",
    "data-selected-saved-view-id",
    "data-projection-content-identity",
    "data-projection-fingerprint",
    "data-surface-width",
    "data-surface-height",
  ]) {
    root.removeAttribute(attribute);
  }
}

export function PublicShareFallbackStateReporter({ state }: { state: PublicShareFallbackState }) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const root = findLifecycleOwner(markerRef.current);
    if (!root) return;
    root.setAttribute("data-testid", fallbackTestId[state]);
    root.dataset.layoutStatus = state;
    clearResolvedState(root);
    if (state === "loading") root.setAttribute("aria-busy", "true");
    else root.removeAttribute("aria-busy");
  }, [state]);
  return <span ref={markerRef} hidden aria-hidden="true" />;
}

export function PublicShareRouteLifecycle({ children }: { children: ReactNode }) {
  return (
    <main
      className="min-h-screen overflow-x-clip bg-surface-grouped"
      data-public-share-lifecycle-owner="true"
      data-testid="public-share-loading"
      data-layout-status="loading"
      aria-busy="true"
      style={safeAreaStyle}
    >
      {children}
    </main>
  );
}

export function PublicShareLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-grouped p-8">
      <PublicShareFallbackStateReporter state="loading" />
      <div className="rounded-xl border border-box-border bg-surface-secondary p-6 text-sm text-label-secondary" role="status">
        Loading shared design…
      </div>
    </div>
  );
}

export function PublicShareInvalidView() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <PublicShareFallbackStateReporter state="invalid" />
      <div role="status">
        <PublicShareUnavailableCard />
      </div>
    </div>
  );
}
