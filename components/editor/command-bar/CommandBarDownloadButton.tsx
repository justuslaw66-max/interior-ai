"use client";

import { Download } from "lucide-react";
import { EDITOR_DOWNLOAD_OPENER_ID } from "@/lib/editor-download-focus";

type CommandBarDownloadButtonProps = {
  dark: boolean;
  /** Without a handler there is no Download button. */
  onDownload?: () => void;
};

/**
 * Download opens pictures or a PDF of the design (audit finding SX2). Phones have no room for it
 * beside Save and Share, so they reach it through More; wide screens show its name.
 */
export function CommandBarDownloadButton({ dark, onDownload }: CommandBarDownloadButtonProps) {
  if (!onDownload) return null;
  return (
    <button
      id={EDITOR_DOWNLOAD_OPENER_ID}
      type="button"
      data-testid="editor-command-download"
      aria-label="Download"
      aria-haspopup="dialog"
      title="Download pictures or a PDF"
      className={
        dark
          ? "designer-control hidden h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold leading-none md:inline-flex xl:w-auto xl:px-3"
          : "hidden h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-800 hover:bg-neutral-50 md:inline-flex xl:w-auto xl:px-3"
      }
      onClick={onDownload}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      <span className="hidden xl:inline">Download</span>
    </button>
  );
}
