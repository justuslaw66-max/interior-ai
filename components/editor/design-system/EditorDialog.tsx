"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";

export type EditorDialogProps = {
  open: boolean;
  /** alertdialog for a confirmation that interrupts the work (ConfirmDialog). */
  role?: "dialog" | "alertdialog";
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  dark?: boolean;
  forceLight?: boolean;
  testId?: string;
  dialogId?: string;
  closeButtonTestId?: string;
  closeButtonId?: string;
  closeButtonClassName?: string;
  closeButtonRef?: { current: HTMLButtonElement | null };
  initialFocusRef?: { current: HTMLElement | null };
  returnFocusId?: string;
  returnFocusIds?: readonly string[];
  focusRestorationEnabledRef?: { current: boolean };
  hideWhenSuperseded?: boolean;
  cancelFocusRestorationOnUnmount?: boolean;
  /** On by default: the rest of the page is inert and hidden from assistive technology. */
  manageBackground?: boolean;
  /** On by default: the page behind doesn't scroll. */
  lockBodyScroll?: boolean;
  waitForEntryTransition?: boolean;
  placement?: "center" | "right";
  /** The layer's z-index class; z-50 unless the dialog must sit above other overlays. */
  layerClassName?: string;
  /** Set while the dialog's action runs. */
  busy?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

function getDialogThemeClasses(dark: boolean, forceLight: boolean) {
  if (dark) return {
    panel: "border-white/10 bg-[#1e2839] text-white",
    description: "text-neutral-300",
    close: "text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:ring-offset-[#1e2839]",
  };
  if (forceLight) return {
    panel: "border-neutral-200 bg-white text-neutral-950",
    description: "text-neutral-600",
    close: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-offset-white",
  };
  return {
    panel: "border-neutral-200 bg-white text-neutral-950 dark:border-gray-700 dark:bg-[#1e2839] dark:text-white",
    description: "text-neutral-600 dark:text-neutral-300",
    close: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-offset-white dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#1e2839]",
  };
}

type EditorDialogCloseButtonProps = {
  buttonRef: { current: HTMLButtonElement | null };
  id?: string;
  label: string;
  testId?: string;
  disabled: boolean;
  className: string;
  onClick: () => void;
};

/** The × in the dialog's corner: 44px, with the shared focus ring. */
function EditorDialogCloseButton({ buttonRef, id, label, testId, disabled, className, onClick }: EditorDialogCloseButtonProps) {
  return (
    <button
      ref={buttonRef} id={id}
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={onClick}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}

/**
 * Shared modal shell for editor workflows. It owns dialog semantics, focus
 * entry/trapping/return, Escape and backdrop dismissal, the inert background and
 * scroll lock (both on by default, UX AX5), and visible focus treatment while
 * leaving domain content to the caller.
 */
export function EditorDialog({
  open,
  role = "dialog",
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = "Close dialog",
  closeDisabled = false,
  closeOnBackdrop = true,
  showCloseButton = true,
  dark = false,
  forceLight = false,
  testId, dialogId,
  closeButtonTestId, closeButtonId, closeButtonClassName = "",
  closeButtonRef: providedCloseButtonRef,
  initialFocusRef,
  returnFocusId, returnFocusIds, focusRestorationEnabledRef, hideWhenSuperseded = false,
  manageBackground = true, lockBodyScroll = true,
  cancelFocusRestorationOnUnmount = false, waitForEntryTransition = false,
  placement = "center",
  layerClassName = "z-50", busy,
  overlayClassName = "",
  panelClassName = "",
  headerClassName = "", contentClassName = "", footerClassName = "",
}: EditorDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const internalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = providedCloseButtonRef ?? internalCloseButtonRef;
  const themeClasses = getDialogThemeClasses(dark, forceLight);
  const requestClose = useEditorDialogLifecycle({
    open, dialogRef, panelRef, closeButtonRef, initialFocusRef,
    returnFocusId, returnFocusIds, focusRestorationEnabledRef, hideWhenSuperseded,
    cancelFocusRestorationOnUnmount, manageBackground, lockBodyScroll,
    waitForEntryTransition,
    closeDisabled,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      id={dialogId} tabIndex={-1}
      className={`fixed inset-0 ${layerClassName} flex items-center bg-black/45 backdrop-blur-[1px] outline-hidden motion-reduce:transition-none ${
        placement === "right" ? "justify-end p-0" : "justify-center p-4"
      } ${overlayClassName}`}
      data-testid={testId} data-editor-dialog-state="mounting"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy}
      onMouseDown={(event) => {
        if (
          closeOnBackdrop &&
          !closeDisabled &&
          event.target === event.currentTarget
        ) {
          requestClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1} data-editor-dialog-state="mounting"
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl outline-hidden transition-transform motion-reduce:transition-none ${themeClasses.panel} ${panelClassName}`}
      >
        <div className={`flex items-start justify-between gap-4 ${headerClassName}`}>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <div
                id={descriptionId}
                className={`mt-1 text-sm leading-5 ${themeClasses.description}`}
              >
                {description}
              </div>
            ) : null}
          </div>
          {showCloseButton ? (
            <EditorDialogCloseButton
              buttonRef={closeButtonRef} id={closeButtonId} label={closeLabel} testId={closeButtonTestId}
              disabled={closeDisabled} className={`${themeClasses.close} ${closeButtonClassName}`} onClick={requestClose}
            />
          ) : null}
        </div>
        <div className={`mt-4 ${contentClassName}`}>{children}</div>
        {footer ? <div className={`mt-5 ${footerClassName}`}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function EditorDialogActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}

/** Dialog actions are the shared Button (phase 4b); dialogs keep this name for it. */
export const EditorDialogButton = Button;
