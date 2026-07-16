import type { EditorSaveStatus } from "@/components/editor/EditorCommandBar";
import { formatTimeAgo } from "@/lib/design-page-utils";

export type DesignPageSaveStatusInput = {
  designId: string | null;
  isAuthenticated: boolean;
  isSaving: boolean;
  lastCloudSaveError: string | null;
  lastDbSaveAt: number | null;
  lastLocalAutosaveAt: number | null;
  lastLocalSaveError: string | null;
  hasPendingCloudSnapshotChanges: boolean;
};

export function getDesignPageSaveStatus({
  designId,
  isAuthenticated,
  isSaving,
  lastCloudSaveError,
  lastDbSaveAt,
  lastLocalAutosaveAt,
  lastLocalSaveError,
  hasPendingCloudSnapshotChanges,
}: DesignPageSaveStatusInput): EditorSaveStatus {
  if (isSaving) {
    return {
      kind: "saving",
      source: designId ? "cloud" : "local",
      label: designId ? "Saving to cloud" : "Saving locally",
      detail: designId ? "Syncing this design to your account." : "Writing a browser backup.",
      tone: "saving",
      canRetry: false,
    };
  }

  if (lastCloudSaveError) {
    return {
      kind: "failed",
      source: "cloud",
      label: "Cloud save failed",
      detail: lastLocalAutosaveAt
        ? `Local backup ${formatTimeAgo(lastLocalAutosaveAt)}. ${lastCloudSaveError}`
        : lastCloudSaveError,
      tone: "error",
      canRetry: isAuthenticated,
    };
  }

  if (lastLocalSaveError) {
    return {
      kind: "failed",
      source: "local",
      label: "Local backup failed",
      detail: lastLocalSaveError,
      tone: "error",
      canRetry: true,
    };
  }

  if (designId && lastDbSaveAt && !hasPendingCloudSnapshotChanges) {
    return {
      kind: "saved",
      source: "cloud",
      label: "Cloud saved",
      detail: formatTimeAgo(lastDbSaveAt),
      tone: "saved",
      canRetry: false,
    };
  }

  if (lastLocalAutosaveAt) {
    return {
      kind: "saved",
      source: "local",
      label: "Local saved",
      detail: isAuthenticated ? "Cloud save pending" : formatTimeAgo(lastLocalAutosaveAt),
      tone: "saved",
      canRetry: false,
    };
  }

  return {
    kind: "pending",
    source: designId ? "cloud" : "local",
    label: designId ? "Cloud save pending" : "Local backup pending",
    detail: "Autosave will run after your next edit.",
    tone: "pending",
    canRetry: false,
  };
}
