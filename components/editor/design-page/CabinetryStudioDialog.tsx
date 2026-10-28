"use client";

import { useRef, type ReactNode } from "react";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";

/**
 * A new studio opens from the Furnish step's Built-ins button, so focus goes back there, or to the
 * Furnish step if the button is gone. An edited cabinet returns to its opener (the shared default).
 */
function findCreateReturnTarget() {
  return (
    document.querySelector<HTMLElement>('[data-testid="editor-workflow-millwork"]') ??
    document.querySelector<HTMLElement>('[data-testid="editor-workflow-furnish"]')
  );
}

/**
 * Built-ins' full-screen modal frame, on the shared dialog lifecycle (UX AX5): the page behind is
 * inert and doesn't scroll, Tab stays inside, and it stacks with the editor's other dialogs. The
 * dialog itself takes focus, so it's announced as "Built-ins" while the studio loads. Escape
 * cancels the studio unless a control inside it handled Escape first (a field reverting its draft,
 * a drag cancelled).
 */
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The studio's own Close lives in the lazy studio; the dialog takes focus instead.
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEditorDialogLifecycle({
    open: true,
    dialogRef,
    panelRef,
    closeButtonRef,
    initialFocusRef: dialogRef,
    resolveReturnFocusTarget: mode === "create" ? findCreateReturnTarget : undefined,
    hideWhenSuperseded: false,
    cancelFocusRestorationOnUnmount: false,
    manageBackground: true,
    lockBodyScroll: true,
    waitForEntryTransition: false,
    closeDisabled: false,
    onClose: onDismiss,
  });

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Built-ins"
      tabIndex={-1}
      data-editor-dialog-state="mounting"
      className="fixed inset-0 z-[80] bg-black/45 p-4 backdrop-blur-sm outline-hidden"
    >
      <div
        ref={panelRef}
        data-editor-dialog-state="mounting"
        className="h-full overflow-hidden rounded-xl bg-surface shadow-2xl ring-1 ring-surface-floating-edge"
      >
        {children}
      </div>
    </div>
  );
}
