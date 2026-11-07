"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import type { DesignCheckpointSummary } from "@/lib/design-api-client";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

export type DesignEarlierVersionsDialogProps = {
  open: boolean;
  /** Null while the list loads. */
  checkpoints: DesignCheckpointSummary[] | null;
  error: string | null;
  /** Why Restore is off right now (a save still going, or not yet sent), or null. */
  restoreBlockedReason: string | null;
  /** The version being restored, while the server takes it. */
  restoringId: string | null;
  onRestore: (checkpointId: string) => void;
  onCancel: () => void;
};

function versionTime(createdAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(createdAt));
}

/**
 * Earlier versions of the design kept on the server (`lib/design-checkpoints.ts`): the newest 20
 * and one a day for 14 days. Restoring one keeps the design as it stands as a version too, so the
 * restore can be undone the same way.
 */
export function DesignEarlierVersionsDialog({
  open, checkpoints, error, restoreBlockedReason, restoringId, onRestore, onCancel,
}: DesignEarlierVersionsDialogProps) {
  return (
    <EditorDialog
      open={open}
      title="Earlier versions"
      onClose={onCancel}
      closeLabel="Close Earlier versions"
      testId="design-earlier-versions-dialog"
      returnFocusIds={[CLIENT_PREVIEW_FALLBACK_ACTION_ID]}
      panelClassName="max-w-[420px]"
      footer={
        <EditorDialogActions>
          <EditorDialogButton onClick={onCancel}>Close</EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <p className="text-sm text-label-secondary">
        Kept as you work: the last 20 versions, and one a day for two weeks. Restoring keeps the
        current design as a version too.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-danger" data-testid="design-earlier-versions-error">{error}</p> : null}
      {restoreBlockedReason ? (
        <p className="mt-3 text-sm text-label-secondary" data-testid="design-earlier-versions-blocked">{restoreBlockedReason}</p>
      ) : null}
      {checkpoints === null && !error ? (
        <p className="mt-3 text-sm text-label-secondary">Loading earlier versions…</p>
      ) : null}
      {checkpoints?.length === 0 ? (
        <p className="mt-3 text-sm text-label-secondary" data-testid="design-earlier-versions-empty">
          No earlier versions yet. One is kept the next time this design saves.
        </p>
      ) : null}
      {checkpoints?.length ? (
        <ul className="mt-3 max-h-80 divide-y divide-separator overflow-y-auto" data-testid="design-earlier-versions-list">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-label">{versionTime(checkpoint.createdAt)}</span>
                <span className="block truncate text-xs text-label-secondary">
                  {checkpoint.reason === "restore" ? `Before a restore · ${checkpoint.title}` : checkpoint.title}
                </span>
              </span>
              <EditorDialogButton
                data-testid="design-earlier-versions-restore"
                disabled={Boolean(restoreBlockedReason) || restoringId !== null}
                onClick={() => onRestore(checkpoint.id)}
              >
                {restoringId === checkpoint.id ? "Restoring…" : "Restore"}
              </EditorDialogButton>
            </li>
          ))}
        </ul>
      ) : null}
    </EditorDialog>
  );
}
