"use client";

import { useRef } from "react";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import type { DesignPageCloudSaveConflictState } from "@/lib/useDesignPagePersistence";
import { Button } from "@/components/ui/Button";

export type CloudSaveConflictDialogProps = {
  state: DesignPageCloudSaveConflictState | null;
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
      initialFocusRef={primaryActionRef}
      testId="cloud-save-conflict-dialog"
      layerClassName="z-[125]"
      panelClassName="max-w-xl"
    >
      <p className="text-xs text-label-secondary">
        Detected <time dateTime={new Date(state.detectedAt).toISOString()}>{new Date(state.detectedAt).toLocaleString()}</time>
      </p>
      <p
        data-testid="cloud-save-conflict-message"
        className="mt-4 rounded-lg border border-warning-tint-border bg-warning-tint px-3 py-2 text-sm text-on-warning-tint"
      >
        {state.message}
      </p>
      {state.resolutionError ? (
        <p
          role="alert"
          data-testid="cloud-save-conflict-error"
          className="mt-4 rounded-lg border border-danger-tint-border bg-danger-tint px-3 py-2 text-sm text-on-danger-tint"
        >
          {state.resolutionError}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          data-testid="cloud-conflict-reload"
          variant="secondary" size="regular"
          disabled={state.isWorking}
          onClick={() => void onReloadCloudCopy()}
        >
          Discard local changes & reload
        </Button>
        <Button
          ref={primaryActionRef}
          data-testid="cloud-conflict-save-copy"
          variant="primary" size="regular"
          disabled={state.isWorking}
          onClick={() => void onSaveAsNewCopy()}
        >
          {state.isWorking ? "Resolving…" : "Save local as new copy"}
        </Button>
      </div>
    </EditorDialog>
  );
}
