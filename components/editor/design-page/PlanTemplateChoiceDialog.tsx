"use client";

import { useEffect, useId, useRef } from "react";

export type PlanTemplateChoiceDialogProps = {
  open: boolean;
  templateLabel: string;
  busy: boolean;
  errorMessage: string | null;
  isAuthenticated: boolean;
  onCancel: () => void;
  onReplaceCurrent: () => void;
  onSaveCurrentAndStartNew: () => void | Promise<void>;
  onSignIn: () => void;
};

export function PlanTemplateChoiceDialog({
  open,
  templateLabel,
  busy,
  errorMessage,
  isAuthenticated,
  onCancel,
  onReplaceCurrent,
  onSaveCurrentAndStartNew,
  onSignIn,
}: PlanTemplateChoiceDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    const frameId = window.requestAnimationFrame(() => primaryActionRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frameId);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []
      );
      if (focusable.length === 0) return;
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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId}${errorMessage ? ` ${errorId}` : ""}`}
      aria-busy={busy}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        data-testid="new-plan-choice-dialog"
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl"
      >
        <div id={titleId} className="text-lg font-semibold text-neutral-950">
          Start a new plan?
        </div>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600">
          Use {templateLabel} as a separate plan and keep your current design, or replace the
          current rooms, doors, and furniture.
        </div>
        {!isAuthenticated ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Sign in first so the current design can be kept in My designs.
          </div>
        ) : null}
        {errorMessage ? (
          <div
            id={errorId}
            data-testid="new-plan-choice-error"
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            data-testid="new-plan-cancel"
            className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="new-plan-replace-current"
            className="min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onReplaceCurrent}
          >
            Replace current
          </button>
          <button
            ref={primaryActionRef}
            type="button"
            data-testid="new-plan-save-current"
            className="min-h-10 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={isAuthenticated ? onSaveCurrentAndStartNew : onSignIn}
          >
            {busy
              ? "Saving current..."
              : isAuthenticated
                ? "Save current & start new"
                : "Sign in to save & start new"}
          </button>
        </div>
      </div>
    </div>
  );
}
