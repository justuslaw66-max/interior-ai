"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true"
  );
}

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
  testId?: string;
  initialFocusRef?: { current: HTMLElement | null };
  overlayClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
};

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
  testId,
  initialFocusRef,
  overlayClassName = "",
  panelClassName = "",
  contentClassName = "",
}: EditorDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    if (!open) return;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const initialTarget =
        initialFocusRef?.current ??
        panel?.querySelector<HTMLElement>(
          '[data-editor-dialog-initial-focus="true"]'
        ) ??
        (panel ? getFocusableElements(panel)[0] : null) ??
        panel;
      initialTarget?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
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
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px] motion-reduce:transition-none ${overlayClassName}`}
      data-testid={testId}
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
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl outline-none transition-transform motion-reduce:transition-none ${
          dark
            ? "border-white/10 bg-[#1e2839] text-white"
            : "border-neutral-200 bg-white text-neutral-950 dark:border-gray-700 dark:bg-[#1e2839] dark:text-white"
        } ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <div
                id={descriptionId}
                className={`mt-1 text-sm leading-5 ${
                  dark ? "text-neutral-300" : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                {description}
              </div>
            ) : null}
          </div>
          {showCloseButton ? (
            <button
              type="button"
              aria-label={closeLabel}
              disabled={closeDisabled}
              className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                dark
                  ? "text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:ring-offset-[#1e2839]"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-offset-white dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#1e2839]"
              }`}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
        <div className={`mt-4 ${contentClassName}`}>{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
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
