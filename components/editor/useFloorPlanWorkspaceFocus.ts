"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { isActionable } from "@/components/editor/design-system/editorDialogFocus";
import { isElementInTopmostEditorDialog } from "@/components/editor/design-system/editorDialogRegistry";

const STATE_SELECTOR = "[data-floor-plan-workspace-state]";
const FOCUS_SELECTOR = '[data-floor-plan-workspace-focus="primary"]';

function currentState(panel: HTMLElement) {
  const workflowOwner = panel.querySelector<HTMLElement>(STATE_SELECTOR);
  const history = panel.querySelector<HTMLDetailsElement>(
    "[data-floor-plan-workspace-history]"
  );
  const confirmation = panel.querySelector(
    '[data-testid="floor-plan-import-bulk-delete-confirmation"], [role="alertdialog"]'
  );
  const owner = history?.open ? history : workflowOwner;
  return {
    key: `${workflowOwner?.dataset.floorPlanWorkspaceState ?? "empty"}:${
      history?.open ? "history" : "main"
    }:${confirmation ? "confirmation" : "clear"}`,
    owner,
  };
}

function resolveTarget(
  panel: HTMLElement,
  closeButton: HTMLButtonElement | null
) {
  const { owner } = currentState(panel);
  const candidates = [
    owner?.querySelector<HTMLElement>(FOCUS_SELECTOR),
    panel.querySelector<HTMLElement>(FOCUS_SELECTOR),
    closeButton,
  ];
  return candidates.find(
    (candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && isActionable(candidate)
  ) ?? null;
}

export function useFloorPlanWorkspaceFocus({
  open,
  panelRef,
  closeButtonRef,
}: {
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) {
      initialFocusRef.current = null;
      return;
    }
    initialFocusRef.current = resolveTarget(panel, closeButtonRef.current);
    return observeStateFocus(panel, closeButtonRef);
  }, [closeButtonRef, open, panelRef]);
  return initialFocusRef;
}

function observeStateFocus(
  panel: HTMLElement,
  closeButtonRef: RefObject<HTMLButtonElement | null>
) {
    let stateKey = currentState(panel).key;
    let primaryTarget = resolveTarget(panel, closeButtonRef.current);
    let frame: number | null = null;
    let focusFrame: number | null = null;
    let disposed = false;
    const schedule = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (disposed || !panel.isConnected) return;
        const next = currentState(panel);
        const nextTarget = resolveTarget(panel, closeButtonRef.current);
        if (next.key === stateKey && nextTarget === primaryTarget) return;
        stateKey = next.key;
        primaryTarget = nextTarget;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          next.owner?.contains(active) &&
          isActionable(active)
        ) return;
        const target = nextTarget;
        if (!target) return;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = null;
          if (
            disposed ||
            !isElementInTopmostEditorDialog(target) ||
            !isActionable(target)
          ) return;
          target.focus({ preventScroll: true });
        });
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-floor-plan-workspace-state",
        "data-floor-plan-workspace-focus",
        "disabled",
        "hidden",
        "open",
      ],
    });
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
    };
}
