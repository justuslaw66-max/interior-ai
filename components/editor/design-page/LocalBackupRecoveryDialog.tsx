"use client";

import { useEffect, useRef } from "react";

import type {
  DesignPageLocalBackupRecoveryActions,
  DesignPageLocalBackupRecoveryState,
} from "@/lib/useDesignPageLocalBackupHydration";

export function LocalBackupRecoveryDialog({
  state,
  actions,
}: {
  state: DesignPageLocalBackupRecoveryState;
  actions: DesignPageLocalBackupRecoveryActions;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!state.isBlocked) return;
    const previouslyFocused = document.activeElement;
    const frameId = window.requestAnimationFrame(() =>
      primaryActionRef.current?.focus()
    );
    return () => {
      window.cancelAnimationFrame(frameId);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [state.isBlocked]);

  useEffect(() => {
    if (!state.isBlocked) return;
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
  }, [state.isBlocked]);

  if (!state.isBlocked) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      data-testid="local-backup-recovery-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="local-backup-recovery-title"
      aria-describedby="local-backup-recovery-description"
      aria-busy={state.isWorking}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-2xl border border-amber-400/30 bg-slate-950 p-6 text-slate-100 shadow-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Recovery required
        </p>
        <h2
          id="local-backup-recovery-title"
          className="mt-2 text-xl font-semibold"
        >
          Your local design backup could not be opened safely
        </h2>
        <p
          id="local-backup-recovery-description"
          className="mt-3 text-sm leading-6 text-slate-300"
        >
          Autosave is paused and the unreadable copy has not been replaced.
          Choose how to continue. Download the raw backup first if you may need
          specialist recovery later.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-900/80 p-4 text-xs">
          <dt className="text-slate-400">Diagnostic</dt>
          <dd className="text-right font-medium">{state.code ?? "UNKNOWN"}</dd>
          <dt className="text-slate-400">Source version</dt>
          <dd className="text-right font-medium">{state.sourceVersion ?? "unknown"}</dd>
          <dt className="text-slate-400">Backup size</dt>
          <dd className="text-right font-medium">{state.byteLength.toLocaleString()} bytes</dd>
          <dt className="text-slate-400">Quarantine copy</dt>
          <dd className="text-right font-medium">
            {state.quarantineSucceeded ? "Retained" : "Browser storage failed"}
          </dd>
        </dl>

        <p className="mt-4 text-sm text-amber-100">{state.message}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            ref={primaryActionRef}
            type="button"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            onClick={actions.downloadRawBackup}
            disabled={state.isWorking}
          >
            Download raw backup
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void actions.retry()}
            disabled={state.isWorking}
          >
            Retry recovery
          </button>
          {state.lastKnownValidAvailable ? (
            <button
              type="button"
              className="rounded-lg border border-emerald-500/70 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-50"
              onClick={() => void actions.openLastKnownValid()}
              disabled={state.isWorking}
            >
              Open last valid copy
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-rose-500/70 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-50"
            onClick={actions.startCleanCopy}
            disabled={state.isWorking}
          >
            Start a clean copy
          </button>
        </div>
      </div>
    </div>
  );
}
