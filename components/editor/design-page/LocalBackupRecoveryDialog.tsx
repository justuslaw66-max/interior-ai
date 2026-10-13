"use client";

import { useRef } from "react";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import type {
  DesignPageLocalBackupRecoveryActions,
  DesignPageLocalBackupRecoveryState,
} from "@/lib/useDesignPageLocalBackupHydration";

const ignoreDismissal = () => undefined;

/**
 * This browser's backup couldn't be read. The person must choose how to continue, so Escape and
 * the backdrop don't close it (closeDisabled); the shared dialog owns focus and the background (AX5).
 */
export function LocalBackupRecoveryDialog({
  state,
  actions,
}: {
  state: DesignPageLocalBackupRecoveryState;
  actions: DesignPageLocalBackupRecoveryActions;
}) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  if (!state.isBlocked) return null;

  return (
    <EditorDialog
      open
      role="alertdialog"
      title="Your local design backup could not be opened safely"
      description="Autosave is paused and the unreadable copy has not been replaced. Choose how to continue. Download the raw backup first if you may need specialist recovery later."
      onClose={ignoreDismissal}
      closeDisabled
      showCloseButton={false}
      busy={state.isWorking}
      initialFocusRef={primaryActionRef}
      testId="local-backup-recovery-dialog"
      layerClassName="z-[120]"
      panelClassName="max-w-xl"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-900/80 p-4 text-xs">
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
    </EditorDialog>
  );
}
