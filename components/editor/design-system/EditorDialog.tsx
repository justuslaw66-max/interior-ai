"use client";

import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";

export type EditorDialogProps = {
  open: boolean;
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
  manageBackground?: boolean;
  waitForEntryTransition?: boolean;
  placement?: "center" | "right";
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

/**
 * Shared modal shell for editor workflows. It owns dialog semantics, focus
 * entry/trapping/return, Escape and backdrop dismissal, and visible focus
 * treatment while leaving domain content to the caller.
 */
export function EditorDialog({
  open,
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
  manageBackground = false,
  cancelFocusRestorationOnUnmount = false, waitForEntryTransition = false,
  placement = "center",
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
    cancelFocusRestorationOnUnmount, manageBackground,
    waitForEntryTransition,
    closeDisabled,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      id={dialogId} tabIndex={-1}
      className={`fixed inset-0 z-50 flex items-center bg-black/45 backdrop-blur-[1px] outline-none motion-reduce:transition-none ${
        placement === "right" ? "justify-end p-0" : "justify-center p-4"
      } ${overlayClassName}`}
      data-testid={testId} data-editor-dialog-state="mounting"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
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
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl outline-none transition-transform motion-reduce:transition-none ${themeClasses.panel} ${panelClassName}`}
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
            <button
              ref={closeButtonRef} id={closeButtonId}
              type="button"
              aria-label={closeLabel}
              data-testid={closeButtonTestId}
              disabled={closeDisabled}
              className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${themeClasses.close} ${closeButtonClassName}`}
              onClick={requestClose}
            >
              <span aria-hidden="true">×</span>
            </button>
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

type EditorDialogButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export const EditorDialogButton = forwardRef<
  HTMLButtonElement,
  EditorDialogButtonProps
>(function EditorDialogButton(
  { variant = "secondary", className = "", type = "button", ...props },
  ref
) {
  const variantClass =
    variant === "primary"
      ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800"
      : variant === "danger"
        ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-gray-600 dark:bg-[#1e2839] dark:text-gray-300 dark:hover:bg-gray-700";

  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${variantClass} ${className}`}
      {...props}
    />
  );
});
