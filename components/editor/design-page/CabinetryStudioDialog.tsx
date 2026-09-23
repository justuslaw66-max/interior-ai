"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const wrapsBackward = event.shiftKey &&
    (active === dialog || active === first || !dialog.contains(active));
  const wrapsForward = !event.shiftKey &&
    (active === dialog || active === last || !dialog.contains(active));
  if (!wrapsBackward && !wrapsForward) return;
  event.preventDefault();
  (wrapsBackward ? last : first).focus();
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onDismiss: () => void
) {
  if (event.key === "Escape") {
    event.stopPropagation();
    if (!event.defaultPrevented) {
      event.preventDefault();
      onDismiss();
    }
    return;
  }
  trapFocus(event);
}

export function CabinetryStudioDialog({
  children,
  mode,
  onDismiss,
}: {
  children: ReactNode;
  mode: "create" | "edit";
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const workspaceTrigger = document.querySelector<HTMLElement>(
      '[data-testid="editor-command-workspace"]'
    );
    const returnFocus = mode === "create" ||
      opener?.closest('[data-testid="editor-command-workspace-menu"]')
      ? workspaceTrigger
      : opener;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        const replacementDialog = document.querySelector(
          '[role="dialog"][aria-label="Custom Millwork Studio"]'
        );
        if (!replacementDialog && returnFocus?.isConnected) returnFocus.focus();
      });
    };
  }, [mode]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Custom Millwork Studio"
      tabIndex={-1}
      className="fixed inset-0 z-[80] bg-black/45 p-4 backdrop-blur-sm outline-none"
      onKeyDown={(event) => handleDialogKeyDown(event, onDismiss)}
    >
      {children}
    </div>
  );
}
