"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";
import { getFloorPlanWorkspaceReturnFocusIds } from "@/lib/floor-plan-upload-dialog-focus";
import { useFloorPlanWorkspaceFocus } from "./useFloorPlanWorkspaceFocus";

function useScopeInvalidation(
  scopeKey: string,
  open: boolean,
  invalidate: () => void
) {
  const previousScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (previousScopeRef.current === scopeKey) return;
    previousScopeRef.current = scopeKey;
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [invalidate, open, scopeKey]);
}

function useNavigationInvalidation(open: boolean, invalidate: () => void) {
  useEffect(() => {
    if (!open) return;
    window.addEventListener("pagehide", invalidate);
    window.addEventListener("popstate", invalidate);
    return () => {
      window.removeEventListener("pagehide", invalidate);
      window.removeEventListener("popstate", invalidate);
    };
  }, [invalidate, open]);
}

/** `onClosed` runs however the window closes: Close, Escape, the backdrop, or a change of scope. */
export function useFloorPlanUploadDialogLifecycle(scopeKey: string, onClosed?: () => void) {
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRestorationEnabledRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [historyConfirmationOpen, setHistoryConfirmationOpen] = useState(false);
  const [returnFocusIds, setReturnFocusIds] = useState<readonly string[]>(() =>
    getFloorPlanWorkspaceReturnFocusIds(null)
  );
  const openWorkspace = useCallback((openerId: string | null) => {
    focusRestorationEnabledRef.current = true;
    setReturnFocusIds(getFloorPlanWorkspaceReturnFocusIds(openerId));
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    onClosedRef.current?.();
  }, []);
  const invalidate = useCallback(() => {
    focusRestorationEnabledRef.current = false;
    close();
  }, [close]);
  const initialFocusRef = useFloorPlanWorkspaceFocus({
    open, panelRef, closeButtonRef,
  });
  const requestClose = useEditorDialogLifecycle({
    open, dialogRef, panelRef, closeButtonRef, initialFocusRef, returnFocusIds,
    focusRestorationEnabledRef, hideWhenSuperseded: false,
    cancelFocusRestorationOnUnmount: true, manageBackground: true,
    lockBodyScroll: true, waitForEntryTransition: false,
    closeDisabled: historyConfirmationOpen, onClose: close,
  });
  useScopeInvalidation(scopeKey, open, invalidate);
  useNavigationInvalidation(open, invalidate);
  return {
    dialogRef, panelRef, closeButtonRef, open, historyConfirmationOpen,
    setHistoryConfirmationOpen, openWorkspace, requestClose,
  };
}
