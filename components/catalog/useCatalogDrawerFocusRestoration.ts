"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";

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

/**
 * Where focus goes back to when the product drawer closes: the action that opened it, found again
 * by product and source even if the catalogue has rendered it anew, else the results' fallback.
 */
export function resolveCatalogDrawerReturnTarget(request: CatalogDrawerFocusRestorationRequest | null) {
  if (!request?.catalogScope.isConnected) return null;
  const target =
    findCurrentSemanticTarget(request) ??
    request.catalogScope.querySelector<HTMLElement>(FALLBACK_SELECTOR);
  return target && isActionable(target) ? target : null;
}

type CatalogDrawerDialogOptions = {
  open: boolean;
  contentAvailable: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  restorationRequest: CatalogDrawerFocusRestorationRequest | null;
  onClose: () => void;
};

/**
 * The product drawer on the shared dialog lifecycle (UX AX5): Close takes focus, Tab stays in the
 * drawer, Escape closes it, the page behind is inert and doesn't scroll, and a newer modal keeps
 * Escape and focus. Closing returns focus to the product's action; when the catalogue goes (a
 * step change), nothing is restored. The drawer closes itself when its product is no longer
 * available.
 */
export function useCatalogDrawerDialog(options: CatalogDrawerDialogOptions) {
  const { open, contentAvailable, dialogRef, panelRef, closeButtonRef, restorationRequest, onClose } = options;
  const onCloseRef = useRef(onClose);
  const requestRef = useRef(restorationRequest);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Closing clears the request, so keep the one the drawer was open with.
  useEffect(() => {
    if (open) requestRef.current = restorationRequest;
  }, [open, restorationRequest]);
  useEffect(() => {
    if (!shouldCloseCatalogDrawerForUnavailableContent(open, contentAvailable)) return;
    onCloseRef.current();
  }, [contentAvailable, open]);
  const resolveReturnFocusTarget = useCallback(
    () => resolveCatalogDrawerReturnTarget(requestRef.current),
    []
  );
  return useEditorDialogLifecycle({
    open: open && contentAvailable, dialogRef, panelRef, closeButtonRef, resolveReturnFocusTarget,
    hideWhenSuperseded: false, cancelFocusRestorationOnUnmount: true, manageBackground: true,
    lockBodyScroll: true, waitForEntryTransition: false, closeDisabled: false, onClose,
  });
}
