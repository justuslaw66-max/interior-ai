"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type CatalogDrawerFocusSource = "product-card" | "compare-tray";

export type CatalogDrawerFocusTarget = {
  productId: string;
  action: "details";
  source: CatalogDrawerFocusSource;
};

export type CatalogDrawerFocusRestorationRequest = {
  target: CatalogDrawerFocusTarget;
  directElement: HTMLElement;
  catalogScope: HTMLElement;
};

const SEMANTIC_TARGET_SELECTOR = "[data-catalog-drawer-focus-product-id]";
const FALLBACK_SELECTOR = "[data-catalog-drawer-focus-fallback]";
const MODAL_SELECTOR = ':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]';
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getCatalogDrawerFocusAttributes(target: CatalogDrawerFocusTarget) {
  return {
    "data-catalog-drawer-focus-product-id": target.productId,
    "data-catalog-drawer-focus-action": target.action,
    "data-catalog-drawer-focus-source": target.source,
  };
}

export function createCatalogDrawerFocusRestorationRequest(
  target: CatalogDrawerFocusTarget,
  directElement: HTMLElement
): CatalogDrawerFocusRestorationRequest | null {
  const catalogScope = directElement.closest<HTMLElement>("[data-catalog-drawer-focus-scope]");
  return catalogScope ? { target, directElement, catalogScope } : null;
}

type CatalogDrawerPreviewFocusOptions = {
  variantSelectionByItem: Record<string, string>;
  onSelect: (productId: string, variantId?: string) => void;
  onPrefetch: (productId: string) => void;
};

export function useCatalogDrawerPreviewFocus({
  variantSelectionByItem,
  onSelect,
  onPrefetch,
}: CatalogDrawerPreviewFocusOptions) {
  const [focusRestoration, setFocusRestoration] =
    useState<CatalogDrawerFocusRestorationRequest | null>(null);
  const clearFocusRestoration = useCallback(() => setFocusRestoration(null), []);
  const openCatalogDrawerPreview = (
    productId: string,
    source: CatalogDrawerFocusSource,
    opener: HTMLButtonElement
  ) => {
    setFocusRestoration(
      createCatalogDrawerFocusRestorationRequest(
        { productId, action: "details", source },
        opener
      )
    );
    onSelect(productId, variantSelectionByItem[productId]);
    onPrefetch(productId);
  };
  return { focusRestoration, clearFocusRestoration, openCatalogDrawerPreview };
}

export function shouldCloseCatalogDrawerForUnavailableContent(open: boolean, contentAvailable: boolean) {
  return open && !contentAvailable;
}

function readTarget(element: HTMLElement): CatalogDrawerFocusTarget | null {
  const productId = element.dataset.catalogDrawerFocusProductId;
  const action = element.dataset.catalogDrawerFocusAction;
  const source = element.dataset.catalogDrawerFocusSource;
  if (!productId || action !== "details") return null;
  if (source !== "product-card" && source !== "compare-tray") return null;
  return { productId, action, source };
}

function matchesTarget(element: HTMLElement, target: CatalogDrawerFocusTarget) {
  const current = readTarget(element);
  return Boolean(
    current &&
      current.productId === target.productId &&
      current.action === target.action &&
      current.source === target.source
  );
}

function isVisible(element: HTMLElement) {
  if (!element.isConnected || element.hidden) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isActionable(element: HTMLElement) {
  if (!isVisible(element) || element.getAttribute("aria-disabled") === "true") return false;
  return !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) || !element.disabled;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isActionable);
}

function handleDrawerKeyDown(event: KeyboardEvent, panel: HTMLElement, onClose: () => void) {
  if (!(event.target instanceof Node) || !panel.contains(event.target)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function hasAnotherActiveModal(excludedModal?: HTMLElement | null) {
  return Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).some(
    (modal) => modal !== excludedModal && isVisible(modal)
  );
}

function focusDrawerOnEntry(panel: HTMLElement | null, initialFocus: HTMLElement | null) {
  if (!panel || !initialFocus || hasAnotherActiveModal(panel) || !isActionable(initialFocus)) return;
  initialFocus.focus();
}

function findCurrentSemanticTarget(request: CatalogDrawerFocusRestorationRequest) {
  if (matchesTarget(request.directElement, request.target) && isActionable(request.directElement)) {
    return request.directElement;
  }
  const candidates = Array.from(
    request.catalogScope.querySelectorAll<HTMLElement>(SEMANTIC_TARGET_SELECTOR)
  ).filter(isActionable);
  return (
    candidates.find((candidate) => matchesTarget(candidate, request.target)) ??
    candidates.find((candidate) => readTarget(candidate)?.productId === request.target.productId)
  );
}

function restoreCatalogDrawerFocus(request: CatalogDrawerFocusRestorationRequest | null) {
  if (!request?.catalogScope.isConnected || hasAnotherActiveModal()) return;
  const target =
    findCurrentSemanticTarget(request) ??
    request.catalogScope.querySelector<HTMLElement>(FALLBACK_SELECTOR);
  if (!target || !isActionable(target)) return;
  target.focus({ preventScroll: true });
}

type CatalogDrawerFocusRestorationOptions = {
  open: boolean;
  contentAvailable: boolean;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  restorationRequest: CatalogDrawerFocusRestorationRequest | null;
  onClose: () => void;
};

export function useCatalogDrawerFocusRestoration(options: CatalogDrawerFocusRestorationOptions) {
  const { open, contentAvailable, panelRef, initialFocusRef, restorationRequest, onClose } =
    options;
  const onCloseRef = useRef(onClose);
  const restoreFrameRef = useRef<number | null>(null);
  const restorationGenerationRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!shouldCloseCatalogDrawerForUnavailableContent(open, contentAvailable)) return;
    onCloseRef.current();
  }, [contentAvailable, open]);

  useEffect(() => {
    if (!open) return;
    const generation = restorationGenerationRef.current + 1;
    restorationGenerationRef.current = generation;
    if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const entryFrame = window.requestAnimationFrame(() =>
      focusDrawerOnEntry(panelRef.current, initialFocusRef.current)
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (panel && !hasAnotherActiveModal(panel)) {
        handleDrawerKeyDown(event, panel, () => onCloseRef.current());
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(entryFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = null;
        if (unmountedRef.current || restorationGenerationRef.current !== generation) return;
        restoreCatalogDrawerFocus(restorationRequest);
      });
    };
  }, [initialFocusRef, open, panelRef, restorationRequest]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      restorationGenerationRef.current += 1;
      if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current);
    };
  }, []);
}
