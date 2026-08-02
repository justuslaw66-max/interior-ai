"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type LightingSettingsDrawerProps = {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

export function LightingSettingsDrawer({
  open,
  dark,
  onClose,
  returnFocusRef,
  children,
}: LightingSettingsDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      returnFocusRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, returnFocusRef]);

  if (!open) return null;

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      data-testid="lighting-settings-overlay"
      className="fixed inset-0 z-[120] bg-black/30 backdrop-blur-[1px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panelRef}
        id="lighting-settings-drawer"
        data-testid="lighting-settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lighting-settings-title"
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t p-5 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[25rem] sm:rounded-none sm:border-l sm:border-t-0 sm:p-6 ${
          dark
            ? "border-white/10 bg-neutral-950 text-neutral-100"
            : "border-neutral-200 bg-white text-neutral-950"
        }`}
        onKeyDown={trapFocus}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="lighting-settings-title"
              className="text-xl font-bold tracking-tight"
            >
              Lighting settings
            </h2>
            <p
              className={
                dark
                  ? "mt-1 text-sm text-neutral-400"
                  : "mt-1 text-sm text-neutral-600"
              }
            >
              Choose a clear viewport scene and adjust only supported rendering
              preferences.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="lighting-settings-close"
            aria-label="Close lighting settings"
            className={
              dark
                ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-neutral-200 hover:bg-white/10"
                : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
            }
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {children}
      </aside>
    </div>,
    document.body
  );
}
