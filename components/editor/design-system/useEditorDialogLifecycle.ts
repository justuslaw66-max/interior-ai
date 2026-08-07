"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const MODAL_SELECTOR = ':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]';
const dialogStack: symbol[] = [];
const dialogRoots = new Map<symbol, HTMLElement>();

function isActionable(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
    if (element.disabled) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isActionable
  );
}

function hasExternalModal() {
  const ownedRoots = new Set(dialogRoots.values());
  return Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).some(
    (modal) => !ownedRoots.has(modal) && isActionable(modal)
  );
}

function isTopmostDialog(token: symbol) {
  return dialogStack.at(-1) === token && !hasExternalModal();
}

function handleTab(event: KeyboardEvent, panel: HTMLElement) {
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

function removeDialog(token: symbol) {
  const index = dialogStack.lastIndexOf(token);
  if (index >= 0) dialogStack.splice(index, 1);
  dialogRoots.delete(token);
}

function cancelPendingRestoration(restoreFrameRef: MutableRefObject<number | null>) {
  if (restoreFrameRef.current === null) return;
  window.cancelAnimationFrame(restoreFrameRef.current);
  restoreFrameRef.current = null;
}

type EditorDialogLifecycleOptions = {
  open: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  initialFocusRef?: { current: HTMLElement | null };
  returnFocusId?: string;
  cancelFocusRestorationOnUnmount: boolean;
  closeDisabled: boolean;
  onClose: () => void;
};

type DialogSessionOptions = Pick<
  EditorDialogLifecycleOptions,
  "dialogRef" | "panelRef" | "closeButtonRef" | "initialFocusRef" | "returnFocusId"
> & {
  generation: number;
  closeDisabledRef: MutableRefObject<boolean>;
  restoreFrameRef: MutableRefObject<number | null>;
  generationRef: MutableRefObject<number>;
  unmountedRef: MutableRefObject<boolean>;
  requestClose: () => void;
};

function registerDialogSession(options: DialogSessionOptions) {
  const { dialogRef, panelRef, closeButtonRef, initialFocusRef, returnFocusId } = options;
  const dialog = dialogRef.current;
  const panel = panelRef.current;
  if (!dialog || !panel) return;
  const token = Symbol("editor-dialog");
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialogStack.push(token);
  dialogRoots.set(token, dialog);
  const entryFrame = window.requestAnimationFrame(() => {
    if (!isTopmostDialog(token)) return;
    const initialTarget =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>('[data-editor-dialog-initial-focus="true"]') ??
      closeButtonRef.current ??
      getFocusableElements(panel)[0] ?? panel;
    if (isActionable(initialTarget)) initialTarget.focus();
  });
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isTopmostDialog(token)) return;
    if (event.key === "Escape" && !options.closeDisabledRef.current) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.requestClose();
    } else if (event.key === "Tab") handleTab(event, panel);
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => {
    const ownedTopmostFocus = isTopmostDialog(token);
    window.cancelAnimationFrame(entryFrame);
    document.removeEventListener("keydown", handleKeyDown);
    removeDialog(token);
    options.restoreFrameRef.current = window.requestAnimationFrame(() => {
      options.restoreFrameRef.current = null;
      if (options.unmountedRef.current || options.generationRef.current !== options.generation) return;
      if (!ownedTopmostFocus || hasExternalModal()) return;
      const target = returnFocusId ? document.getElementById(returnFocusId) : opener;
      if (target instanceof HTMLElement && isActionable(target)) target.focus({ preventScroll: true });
    });
  };
}

export function useEditorDialogLifecycle({
  open, dialogRef,
  panelRef,
  closeButtonRef,
  initialFocusRef,
  returnFocusId,
  cancelFocusRestorationOnUnmount,
  closeDisabled,
  onClose,
}: EditorDialogLifecycleOptions) {
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const restoreFrameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  const requestClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    cancelPendingRestoration(restoreFrameRef);
    return registerDialogSession({
      dialogRef, panelRef, closeButtonRef, initialFocusRef, returnFocusId, generation,
      closeDisabledRef, restoreFrameRef, generationRef, unmountedRef,
      requestClose,
    });
  }, [
    closeButtonRef,
    dialogRef,
    initialFocusRef,
    open,
    panelRef,
    requestClose,
    returnFocusId,
  ]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      if (!cancelFocusRestorationOnUnmount) return;
      unmountedRef.current = true;
      generationRef.current += 1;
      cancelPendingRestoration(restoreFrameRef);
    };
  }, [cancelFocusRestorationOnUnmount]);

  return requestClose;
}
