"use client";

import type { EditorSaveStatus } from "@/lib/design-page-save-status";

function getSaveStatusClassName(tone: EditorSaveStatus["tone"], dark: boolean) {
  if (dark) {
    if (tone === "error") return "designer-status-blocked";
    if (tone === "saving") return "designer-status-info";
    if (tone === "saved") return "designer-status-ready";
    return "designer-status-pending";
  }

  if (tone === "error") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "saving") return "border-blue-200 bg-blue-50 text-blue-800";
  if (tone === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-neutral-200 bg-white text-neutral-700";
}

function getSaveStatusDotClassName(tone: EditorSaveStatus["tone"]) {
  if (tone === "error") return "bg-red-500";
  if (tone === "saving") return "bg-blue-500";
  if (tone === "saved") return "bg-emerald-500";
  return "bg-neutral-400";
}

type CommandBarSaveStatusProps = {
  dark: boolean;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
};

/** The command bar's save-status pill, with Retry when a save failed. */
export function CommandBarSaveStatus({
  dark,
  saveStatus,
  onRetrySaveStatus,
}: CommandBarSaveStatusProps) {
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
      aria-label={`${saveStatus.label}. ${saveStatus.detail}`}
      title={`${saveStatus.label}: ${saveStatus.detail}`}
      className={`hidden h-[30px] min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs md:flex ${
        saveStatus.canRetry ? "" : "lg:shrink"
      } ${getSaveStatusClassName(
        saveStatus.tone,
        dark
      )}`}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${getSaveStatusDotClassName(saveStatus.tone)} ${
          saveStatus.tone === "saving" ? "animate-pulse" : ""
        }`}
        aria-hidden="true"
      />
      <span className="hidden min-w-0 max-w-28 truncate font-semibold lg:inline">
        {saveStatus.label}
      </span>
      <span className="hidden min-w-0 max-w-36 truncate xl:inline">
        {saveStatus.detail}
      </span>
      {saveStatus.canRetry ? (
        <button
          type="button"
          data-testid="save-status-retry"
          className={
            dark
              ? "hidden shrink-0 rounded-full border border-white/20 px-2 py-0.5 font-semibold text-white hover:bg-white/10 xl:inline-flex"
              : "hidden shrink-0 rounded-full border border-current/20 bg-white/70 px-2 py-0.5 font-semibold hover:bg-white xl:inline-flex"
          }
          onClick={onRetrySaveStatus}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
