"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  hasExternalEditorModal,
  isElementInTopmostEditorDialog,
  isEditorDialogBackgroundManaged,
  isTopmostEditorDialog,
  observeEditorDialogOwnership,
  registerEditorDialogRoot,
  setEditorDialogOwnershipGuard,
  unregisterEditorDialogRoot,
  type EditorDialogToken,
} from "@/components/editor/design-system/editorDialogRegistry";
import {
  handleTab,
  isActionable,
  resolveInitialFocusTarget,
  resolveReadyFocusTarget,
} from "@/components/editor/design-system/editorDialogFocus";
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
  returnFocusId?: string; returnFocusIds?: readonly string[];
  focusRestorationEnabledRef?: { current: boolean };
  hideWhenSuperseded: boolean; cancelFocusRestorationOnUnmount: boolean;
  manageBackground: boolean;
  waitForEntryTransition: boolean;
  closeDisabled: boolean;
  onClose: () => void;
};
type DialogSessionOptions = Pick<
  EditorDialogLifecycleOptions,
  | "dialogRef"
  | "panelRef"
  | "closeButtonRef"
  | "initialFocusRef"
  | "returnFocusId" | "returnFocusIds" | "focusRestorationEnabledRef" | "hideWhenSuperseded"
  | "manageBackground"
  | "waitForEntryTransition"
> & {
  generation: number;
  closeDisabledRef: MutableRefObject<boolean>;
  restoreFrameRef: MutableRefObject<number | null>;
  generationRef: MutableRefObject<number>;
  unmountedRef: MutableRefObject<boolean>;
  requestClose: () => void;
};

type DialogEntryState = "mounting" | "entering" | "interactive";
const ENTRY_TRANSITION_EVENTS = [
  "transitionrun",
  "transitionstart",
  "transitionend",
  "transitioncancel",
] as const;
function setDialogEntryState(
  dialog: HTMLElement,
  panel: HTMLElement,
  state: DialogEntryState
) {
  dialog.dataset.editorDialogState = state;
  panel.dataset.editorDialogState = state;
}
function scheduleTrackedFrame(frames: Set<number>, callback: () => void) {
  const frame = window.requestAnimationFrame(() => {
    frames.delete(frame);
    callback();
  });
  frames.add(frame);
  return frame;
}

function updateTransitionListeners(
  panel: HTMLElement,
  listener: (event: TransitionEvent) => void,
  action: "add" | "remove"
) {
  for (const eventName of ENTRY_TRANSITION_EVENTS) {
    if (action === "add") panel.addEventListener(eventName, listener);
    else panel.removeEventListener(eventName, listener);
  }
}

function createEntryReadinessController(
  dialog: HTMLElement,
  panel: HTMLElement,
  token: EditorDialogToken,
  options: DialogSessionOptions
) {
  const frames = new Set<number>();
  let disposed = false;
  let checkFrame: number | null = null;
  let initialFocusAdmitted = false;
  const isCurrentEntry = () =>
    !disposed &&
    options.generationRef.current === options.generation &&
    dialog.isConnected &&
    panel.isConnected;
  const completeWhenReady = () => {
    if (!isCurrentEntry() || initialFocusAdmitted || !isTopmostEditorDialog(token)) return;
    const target = resolveReadyFocusTarget(
      panel,
      options,
      options.waitForEntryTransition
    );
    if (!target) return;
    initialFocusAdmitted = true;
    setDialogEntryState(dialog, panel, "interactive");
    if (isTopmostEditorDialog(token) && isActionable(target)) {
      target.focus({ preventScroll: true });
    }
  };
  const schedule = () => {
    if (!isCurrentEntry() || checkFrame !== null) return;
    checkFrame = scheduleTrackedFrame(frames, () => {
      checkFrame = null;
      completeWhenReady();
    });
  };
  const reschedule = () => {
    if (checkFrame !== null) {
      window.cancelAnimationFrame(checkFrame);
      frames.delete(checkFrame);
      checkFrame = null;
    }
    schedule();
  };
  const dispose = () => {
    disposed = true;
    for (const frame of frames) window.cancelAnimationFrame(frame);
  };
  return { isCurrentEntry, schedule, reschedule, dispose };
}

function scheduleDialogEntry(
  dialog: HTMLElement,
  panel: HTMLElement,
  token: EditorDialogToken,
  options: DialogSessionOptions
) {
  const readiness = createEntryReadinessController(dialog, panel, token, options);
  const handleTransition = (event: TransitionEvent) => {
    if (event.target !== panel) return;
    if (event.type === "transitionrun" || event.type === "transitionstart") {
      setDialogEntryState(dialog, panel, "entering");
    } else {
      readiness.reschedule();
    }
  };
  const observer = options.waitForEntryTransition
    ? new ResizeObserver(readiness.reschedule)
    : null;
  setDialogEntryState(dialog, panel, "mounting");
  if (options.waitForEntryTransition) {
    panel.inert = true;
    updateTransitionListeners(panel, handleTransition, "add");
    observer?.observe(panel);
    window.addEventListener("resize", readiness.reschedule);
    panel.getBoundingClientRect();
    setDialogEntryState(dialog, panel, "entering");
    readiness.schedule();
  } else {
    readiness.schedule();
  }
  setEditorDialogOwnershipGuard(token, () => {
    if (!readiness.isCurrentEntry() || !isTopmostEditorDialog(token)) return;
    const interactive = dialog.dataset.editorDialogState === "interactive";
    const hasOwner = interactive
      ? dialog.contains(document.activeElement)
      : document.activeElement === dialog;
    if (!hasOwner) {
      const target = interactive ? resolveInitialFocusTarget(panel, options) : dialog;
      if (isActionable(target)) target.focus({ preventScroll: true });
    }
    readiness.reschedule();
  });
  return () => {
    readiness.dispose();
    if (options.waitForEntryTransition) panel.inert = false;
    observer?.disconnect();
    window.removeEventListener("resize", readiness.reschedule);
    updateTransitionListeners(panel, handleTransition, "remove");
  };
}

function createDialogInputHandlers(
  dialog: HTMLElement,
  panel: HTMLElement,
  token: EditorDialogToken,
  options: DialogSessionOptions
) {
  const keydown = (event: KeyboardEvent) => {
    if (!isTopmostEditorDialog(token)) return;
    if (event.key === "Escape" && !options.closeDisabledRef.current) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.requestClose();
    } else if (event.key === "Tab") {
      if (
        options.waitForEntryTransition &&
        dialog.dataset.editorDialogState !== "interactive"
      ) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else {
        handleTab(event, panel);
      }
    }
  };
  const focusin = (event: FocusEvent) => {
    if (!isTopmostEditorDialog(token)) return;
    const interactive = dialog.dataset.editorDialogState === "interactive";
    if (!interactive) {
      if (event.target !== dialog) dialog.focus({ preventScroll: true });
      return;
    }
    if (event.target instanceof Node && dialog.contains(event.target)) return;
    const target = resolveInitialFocusTarget(panel, options);
    if (isActionable(target)) target.focus({ preventScroll: true });
  };
  return { keydown, focusin };
}

function scheduleFocusRestoration(
  opener: HTMLElement | null,
  ownedTopmostFocus: boolean,
  options: DialogSessionOptions
) {
  options.restoreFrameRef.current = window.requestAnimationFrame(() => {
    options.restoreFrameRef.current = null;
    if (
      options.unmountedRef.current ||
      options.generationRef.current !== options.generation ||
      !ownedTopmostFocus ||
      options.focusRestorationEnabledRef?.current === false ||
      hasExternalEditorModal()
    ) return;
    const legacyTarget = options.returnFocusId
      ? document.getElementById(options.returnFocusId)
      : null;
    const semanticTargets = options.returnFocusIds?.map((id) =>
      document.getElementById(id)
    ) ?? [];
    const hasSemanticAuthority =
      Boolean(options.returnFocusId) || Boolean(options.returnFocusIds?.length);
    const target = [...semanticTargets, legacyTarget].find(
      (candidate): candidate is HTMLElement =>
        candidate instanceof HTMLElement && isActionable(candidate)
    ) ?? (hasSemanticAuthority ? null : opener);
    if (target instanceof HTMLElement && isElementInTopmostEditorDialog(target) && isActionable(target)) {
      target.focus({ preventScroll: true });
    }
  });
}

function registerDialogSession(options: DialogSessionOptions) {
  const dialog = options.dialogRef.current;
  const panel = options.panelRef.current;
  if (!dialog || !panel) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const token = registerEditorDialogRoot(dialog,
    options.manageBackground || options.waitForEntryTransition,
    options.hideWhenSuperseded);
  dialog.dataset.editorDialogGeneration = String(options.generation);
  dialog.dataset.editorDialogFocusTrap = "active";
  const handlers = createDialogInputHandlers(dialog, panel, token, options);
  document.addEventListener("keydown", handlers.keydown);
  if (options.manageBackground || options.waitForEntryTransition)
    document.addEventListener("focusin", handlers.focusin);
  if (
    (options.manageBackground ||
      options.waitForEntryTransition ||
      isEditorDialogBackgroundManaged()) &&
    isTopmostEditorDialog(token) &&
    isActionable(dialog)
  ) {
    dialog.focus({ preventScroll: true });
  }
  const cancelEntry = scheduleDialogEntry(dialog, panel, token, options);
  const stopObservingOwnership = observeEditorDialogOwnership();
  return () => {
    const ownedTopmostFocus = isTopmostEditorDialog(token);
    cancelEntry();
    stopObservingOwnership();
    document.removeEventListener("keydown", handlers.keydown);
    if (options.manageBackground || options.waitForEntryTransition)
      document.removeEventListener("focusin", handlers.focusin);
    delete dialog.dataset.editorDialogFocusTrap;
    unregisterEditorDialogRoot(token);
    scheduleFocusRestoration(opener, ownedTopmostFocus, options);
  };
}

function useDialogSessionEffects(
  options: EditorDialogLifecycleOptions,
  closeDisabledRef: MutableRefObject<boolean>,
  restoreFrameRef: MutableRefObject<number | null>,
  generationRef: MutableRefObject<number>,
  unmountedRef: MutableRefObject<boolean>,
  requestClose: () => void
) {
  const {
    open, dialogRef, panelRef, closeButtonRef, initialFocusRef,
    returnFocusId, returnFocusIds, focusRestorationEnabledRef,
    hideWhenSuperseded, manageBackground, waitForEntryTransition,
  } = options;
  const startSession = useCallback(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    cancelPendingRestoration(restoreFrameRef);
    return registerDialogSession({
      dialogRef, panelRef, closeButtonRef, initialFocusRef, returnFocusId,
      returnFocusIds, focusRestorationEnabledRef, hideWhenSuperseded, manageBackground,
      waitForEntryTransition, generation, requestClose,
      closeDisabledRef, restoreFrameRef, generationRef, unmountedRef,
    });
  }, [
    closeButtonRef, closeDisabledRef, dialogRef, generationRef, initialFocusRef,
    panelRef, requestClose, restoreFrameRef, returnFocusId, returnFocusIds,
    focusRestorationEnabledRef, unmountedRef, hideWhenSuperseded,
    manageBackground, waitForEntryTransition,
  ]);

  useLayoutEffect(() => {
    if (!open || !waitForEntryTransition) return;
    return startSession();
  }, [open, startSession, waitForEntryTransition]);

  useEffect(() => {
    if (!open || waitForEntryTransition) return;
    return startSession();
  }, [open, startSession, waitForEntryTransition]);
}

export function useEditorDialogLifecycle({
  open, dialogRef, panelRef, closeButtonRef, initialFocusRef,
  returnFocusId, returnFocusIds, focusRestorationEnabledRef, hideWhenSuperseded,
  cancelFocusRestorationOnUnmount, manageBackground, waitForEntryTransition,
  closeDisabled, onClose,
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

  useDialogSessionEffects(
    {
      open, dialogRef, panelRef, closeButtonRef, initialFocusRef, returnFocusId,
      returnFocusIds, focusRestorationEnabledRef, hideWhenSuperseded,
      cancelFocusRestorationOnUnmount, manageBackground,
      waitForEntryTransition, closeDisabled,
      onClose,
    },
    closeDisabledRef,
    restoreFrameRef,
    generationRef,
    unmountedRef,
    requestClose
  );

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
