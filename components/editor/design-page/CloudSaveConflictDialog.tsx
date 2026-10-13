"use client";

import { useRef } from "react";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import type { DesignPageCloudSaveConflictState } from "@/lib/useDesignPagePersistence";

export type CloudSaveConflictDialogProps = {
  state: DesignPageCloudSaveConflictState | null;
  dark?: boolean;
  onSaveAsNewCopy: () => void | Promise<void>;
  onReloadCloudCopy: () => void | Promise<void>;
};

const ignoreDismissal = () => undefined;

/**
 * Autosave found a newer copy in the cloud. The person must choose a copy, so Escape and the
 * backdrop don't close it (closeDisabled); the shared dialog owns focus and the background (AX5).
 */
export function CloudSaveConflictDialog({
  state,
  dark = false,
  onSaveAsNewCopy,
  onReloadCloudCopy,
}: CloudSaveConflictDialogProps) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  if (!state) return null;

  return (
    <EditorDialog
      open
      role="alertdialog"
      title="This design changed in another session"
      description="Autosave is paused to prevent either copy from being overwritten. Your current work remains in the browser backup. Save it as a separate cloud copy, or explicitly discard the local changes and reload the newer cloud copy."
      onClose={ignoreDismissal}
      closeDisabled
      showCloseButton={false}
      busy={state.isWorking}
      dark={dark}
      forceLight={!dark}
      initialFocusRef={primaryActionRef}
      testId="cloud-save-conflict-dialog"
      layerClassName="z-[125]"
      panelClassName="max-w-xl"
    >
      <p className={dark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
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
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
          disabled={state.isWorking}
          onClick={() => void onSaveAsNewCopy()}
        >
          {state.isWorking ? "Resolving…" : "Save local as new copy"}
        </button>
      </div>
    </EditorDialog>
  );
}
