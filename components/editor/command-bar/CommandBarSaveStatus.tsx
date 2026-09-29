"use client";

import { Check } from "lucide-react";
import type { EditorSaveStatus } from "@/lib/design-page-save-status";

/** "Saved" (to the account) is the one green line; the others are muted, and "Not saved" red. */
function getSaveStatusClassName(saveStatus: EditorSaveStatus, dark: boolean) {
  if (saveStatus.tone === "error") return dark ? "text-red-300" : "text-red-700";
  if (saveStatus.tone === "saved" && saveStatus.source === "cloud") return dark ? "text-emerald-300" : "text-success";
  return dark ? "text-neutral-300" : "text-ink-muted";
}

type CommandBarSaveStatusProps = {
  dark: boolean;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
};

/**
 * The save status, a line under the design's name at every width (UX 4c and 4d, the approved
 * TopBar and PhonePlan mockups):
 * "Saving…", "✓ Saved", "Saved on this device" or "Not saved" with Retry. The detail is the
 * tooltip and part of what a screen reader hears; a design that hasn't saved yet says nothing.
 */
export function CommandBarSaveStatus({
  dark,
  saveStatus,
  onRetrySaveStatus,
}: CommandBarSaveStatusProps) {
  const savedToAccount = saveStatus.tone === "saved" && saveStatus.source === "cloud";
  return (
    <div
      data-testid="save-status"
      data-status={saveStatus.kind}
      data-source={saveStatus.source}
      data-last-successful-save-at={
        saveStatus.lastSuccessfulSaveAt
          ? new Date(saveStatus.lastSuccessfulSaveAt).toISOString()
          : ""
      }
      role="status"
      aria-live="polite"
      aria-label={saveStatus.label ? `${saveStatus.label}. ${saveStatus.detail}` : saveStatus.detail}
      title={saveStatus.detail}
      className={`flex h-4 min-w-0 items-center gap-1 text-xs leading-none ${getSaveStatusClassName(saveStatus, dark)}`}
    >
      {savedToAccount ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{saveStatus.label}</span>
      {saveStatus.canRetry ? (
        <button
          type="button"
          data-testid="save-status-retry"
          className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
          onClick={onRetrySaveStatus}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
