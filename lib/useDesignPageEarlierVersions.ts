"use client";

import { useCallback, useState } from "react";
import type { DesignEarlierVersionsDialogProps } from "@/components/editor/design-page/DesignEarlierVersionsDialog";
import { designApi, DesignApiError, type DesignCheckpointSummary } from "@/lib/design-api-client";
import type { EditorSaveStatus } from "@/lib/design-page-save-status";

export type UseDesignPageEarlierVersionsInput = {
  designId: string | null;
  /** The account revision the editor holds; a restore is made on it. */
  cloudRevision: string | null;
  saveStatus: EditorSaveStatus;
  showToast: (message: string) => void;
  /** Opens the restored design afresh, as the account now has it: a page reload unless given. */
  reopenDesign?: () => void;
};

/** Why Restore is off: it would overwrite edits the account hasn't taken yet. */
export function earlierVersionsRestoreBlockedReason(input: Pick<UseDesignPageEarlierVersionsInput,
  "cloudRevision" | "saveStatus">): string | null {
  if (!input.cloudRevision) return "Wait for the design to finish opening.";
  const { kind, source } = input.saveStatus;
  if (kind === "saving") return "Wait for saving to finish.";
  // Saved to the account, or nothing changed since it opened: the account holds what's on screen.
  if ((kind === "saved" && source === "cloud") || kind === "pending") return null;
  return "Save your latest changes first: restoring would replace them.";
}

function restoreErrorMessage(error: unknown): string {
  if (error instanceof DesignApiError && error.status === 409) {
    return error.message.includes("floor plan")
      ? "This version's floor plan is no longer available, so it can't be restored."
      : "This design changed in another tab or device. Close this and reload it first.";
  }
  if (error instanceof DesignApiError && error.status === 403) return "This version has more items than the Free plan allows.";
  if (error instanceof DesignApiError && error.status === 404) return "That earlier version is no longer kept.";
  return "Couldn't restore that version. Try again.";
}

function reloadPage() {
  window.location.reload();
}

/** The Earlier versions dialog: the design's checkpoints, and Restore. */
export function useDesignPageEarlierVersions(input: UseDesignPageEarlierVersionsInput) {
  const { designId, cloudRevision, saveStatus, showToast } = input;
  const reopenDesign = input.reopenDesign ?? reloadPage;
  const [open, setOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<DesignCheckpointSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const openEarlierVersions = useCallback(() => {
    if (!designId) return;
    setOpen(true);
    setCheckpoints(null);
    setError(null);
    designApi.checkpoints(designId).then(setCheckpoints, () => {
      setError("Couldn't load earlier versions. Try again.");
    });
  }, [designId]);

  const restore = useCallback(async (checkpointId: string) => {
    if (!designId || !cloudRevision || restoringId) return;
    setRestoringId(checkpointId);
    setError(null);
    try {
      await designApi.restoreCheckpoint(designId, checkpointId, cloudRevision);
      showToast("Earlier version restored");
      reopenDesign();
    } catch (restoreError) {
      setError(restoreErrorMessage(restoreError));
      setRestoringId(null);
    }
  }, [cloudRevision, designId, reopenDesign, restoringId, showToast]);

  const dialog: DesignEarlierVersionsDialogProps = {
    open,
    checkpoints,
    error,
    restoreBlockedReason: earlierVersionsRestoreBlockedReason({ cloudRevision, saveStatus }),
    restoringId,
    onRestore: (checkpointId) => void restore(checkpointId),
    onCancel: () => setOpen(false),
  };
  return { openEarlierVersions: designId ? openEarlierVersions : undefined, dialog };
}
