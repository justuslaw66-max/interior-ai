import { formatTimeAgo } from "@/lib/design-page-utils";

/** What the editor command bar shows about saving: one status, its tone, and whether Retry applies. */
export type EditorSaveStatus = {
  kind: "pending" | "saving" | "saved" | "failed" | "conflict";
  source: string;
  label: string;
  detail: string;
  tone: "error" | "saving" | "saved" | "pending";
  canRetry: boolean;
  lastSuccessfulSaveAt: number | null;
  /**
   * The design lives in the account (it was saved there once), so it saves itself and the bar
   * shows only the status, not Save (UX phase 4, Decision E). Guests and never-saved designs keep
   * Save.
   */
  cloudBacked: boolean;
};

export type DesignPageSaveStatusInput = {
  designId: string | null;
  isAuthenticated: boolean;
  isSaving: boolean;
  lastCloudSaveError: string | null;
  lastDbSaveAt: number | null;
  lastLocalAutosaveAt: number | null;
  lastLocalSaveError: string | null;
  hasPendingCloudSnapshotChanges: boolean;
  hasCloudConflict: boolean;
};

type SaveStatusCase = Omit<EditorSaveStatus, "lastSuccessfulSaveAt" | "cloudBacked">;

/**
 * What the bar says about saving (UX audit SX5): "Saving…", "Saved" (in the account), "Saved on
 * this device" (guests, and designs not yet saved to the account) or "Not saved", with Retry when
 * it can help. The detail is the tooltip. A design that hasn't saved anything yet says nothing.
 * `kind` and `source` are the same as before; specs read them.
 */
function describeSaveStatus(input: DesignPageSaveStatusInput): SaveStatusCase {
  const { designId, lastCloudSaveError, lastDbSaveAt, lastLocalAutosaveAt, lastLocalSaveError } = input;
  if (input.isSaving) {
    return { kind: "saving", source: designId ? "cloud" : "local", label: "Saving…",
      detail: designId ? "Saving to your account." : "Saving on this device.", tone: "saving", canRetry: false };
  }
  if (input.hasCloudConflict) {
    return { kind: "conflict", source: "cloud", label: "Not saved",
      detail: "This design changed in another session. Choose which copy to keep.", tone: "error", canRetry: false };
  }
  if (lastCloudSaveError) {
    const copy = lastLocalAutosaveAt ? ` A copy was saved on this device ${formatTimeAgo(lastLocalAutosaveAt)}.` : "";
    return { kind: "failed", source: "cloud", label: "Not saved", detail: `${lastCloudSaveError}${copy}`,
      tone: "error", canRetry: input.isAuthenticated };
  }
  if (lastLocalSaveError) {
    return { kind: "failed", source: "local", label: "Not saved", detail: lastLocalSaveError, tone: "error", canRetry: true };
  }
  if (designId && lastDbSaveAt && !input.hasPendingCloudSnapshotChanges) {
    return { kind: "saved", source: "cloud", label: "Saved",
      detail: `Saved to your account ${formatTimeAgo(lastDbSaveAt)}.`, tone: "saved", canRetry: false };
  }
  if (lastLocalAutosaveAt) {
    return { kind: "saved", source: "local", label: "Saved on this device",
      detail: input.isAuthenticated
        ? `Not in your account yet.${designId ? "" : " Save to keep it there."}`
        : `Saved ${formatTimeAgo(lastLocalAutosaveAt)}. Sign in to keep it in your account.`,
      tone: "saved", canRetry: false };
  }
  return { kind: "pending", source: designId ? "cloud" : "local", label: "",
    detail: "Your design saves after your next change.", tone: "pending", canRetry: false };
}

export function getDesignPageSaveStatus(input: DesignPageSaveStatusInput): EditorSaveStatus {
  const status = describeSaveStatus(input);
  const lastSuccessfulSaveAt =
    status.kind === "saved"
      ? status.source === "cloud" ? input.lastDbSaveAt : input.lastLocalAutosaveAt
      : input.designId ? input.lastDbSaveAt ?? input.lastLocalAutosaveAt : input.lastLocalAutosaveAt;
  return { ...status, lastSuccessfulSaveAt, cloudBacked: Boolean(input.designId) };
}

/**
 * Leaving the editor for My designs saves the design first. A cloud design: its latest edits
 * (changes autosave hasn't sent, a save still on its way, or one that failed). A signed-in user's
 * design that was never saved to their account, once it holds more than the untouched first room
 * (UX phase 4, Q7): otherwise it stays only in this browser's backup, which the next design opened
 * replaces. A guest's design stays in the backup.
 */
export function needsSaveBeforeLeaving(input: Pick<
  DesignPageSaveStatusInput,
  "designId" | "isAuthenticated" | "hasPendingCloudSnapshotChanges" | "isSaving" | "lastCloudSaveError"
> & { designHasContent: boolean }) {
  if (!input.designId) return input.isAuthenticated && input.designHasContent;
  return input.hasPendingCloudSnapshotChanges || input.isSaving || Boolean(input.lastCloudSaveError);
}

/**
 * What leaving for My designs does after that save: go, stay in the editor (the save failed, or the
 * design changed while it saved), or ask, because the Free plan's designs are full.
 */
export type LeaveForMyDesignsOutcome = "leave" | "stay" | "design-limit";
