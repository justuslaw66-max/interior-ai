"use client";

import { useEffect, useId, useRef } from "react";

import type { DesignPageCloudSaveConflictState } from "@/lib/useDesignPagePersistence";

export type CloudSaveConflictDialogProps = {
  state: DesignPageCloudSaveConflictState | null;
  dark?: boolean;
  onSaveAsNewCopy: () => void | Promise<void>;
  onReloadCloudCopy: () => void | Promise<void>;
};

export function CloudSaveConflictDialog({
  state,
  dark = false,
  onSaveAsNewCopy,
  onReloadCloudCopy,
}: CloudSaveConflictDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const previouslyFocused = document.activeElement;
    const frameId = window.requestAnimationFrame(() =>
      primaryActionRef.current?.focus()
    );
    return () => {
      window.cancelAnimationFrame(frameId);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])"
        ) ?? []
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      data-testid="cloud-save-conflict-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId}${state.resolutionError ? ` ${errorId}` : ""}`}
      aria-busy={state.isWorking}
    >
      <div
        ref={panelRef}
        className={
          dark
            ? "designer-panel designer-panel-strong w-full max-w-xl rounded-2xl p-6 shadow-2xl"
            : "w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-6 text-slate-950 shadow-2xl"
        }
      >
        <p className={dark ? "text-xs font-semibold uppercase tracking-[0.18em] text-amber-300" : "text-xs font-semibold uppercase tracking-[0.18em] text-amber-700"}>
          Save conflict
        </p>
        <h2 id={titleId} className="mt-2 text-xl font-semibold">
          This design changed in another session
        </h2>
        <p
          id={descriptionId}
          className={dark ? "mt-3 text-sm leading-6 text-slate-300" : "mt-3 text-sm leading-6 text-slate-600"}
        >
          Autosave is paused to prevent either copy from being overwritten. Your
          current work remains in the browser backup. Save it as a separate cloud
          copy, or explicitly discard the local changes and reload the newer cloud
          copy.
        </p>
        <p className={dark ? "mt-3 text-xs text-slate-400" : "mt-3 text-xs text-slate-500"}>
          Detected <time dateTime={new Date(state.detectedAt).toISOString()}>{new Date(state.detectedAt).toLocaleString()}</time>
        </p>
        <p
          data-testid="cloud-save-conflict-message"
          className={
            dark
              ? "mt-4 rounded-lg border border-amber-400/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"
              : "mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          }
        >
          {state.message}
        </p>
        {state.resolutionError ? (
          <p
            id={errorId}
            role="alert"
            data-testid="cloud-save-conflict-error"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.resolutionError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-testid="cloud-conflict-reload"
            className={
              dark
                ? "rounded-lg border border-rose-400/70 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-50"
                : "rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            }
            disabled={state.isWorking}
            onClick={() => void onReloadCloudCopy()}
          >
            Discard local changes & reload
          </button>
          <button
            ref={primaryActionRef}
            type="button"
            data-testid="cloud-conflict-save-copy"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            disabled={state.isWorking}
            onClick={() => void onSaveAsNewCopy()}
          >
            {state.isWorking ? "Resolving..." : "Save local as new copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
