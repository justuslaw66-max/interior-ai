"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import DuplicateDesignButton from "@/components/DuplicateDesignButton";
import CopyFallbackDialog from "@/components/CopyFallbackDialog";

type SharePageActionsProps = {
  shareToken: string;
};

// UX audit SX7 (phase 4e): three actions in the header, Copy link, Download PDF and Make a copy.
// The Beta badge, the system Share sheet, Shopping list and Export pack left the header: the
// Shopping list is a link in the summary line, and the plans and schedules sit with the rooms.
const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2";

function ShareActionMessage({ message }: { message: string | null }) {
  return (
    <>
      <div className="text-right text-xs text-neutral-500">
        Editing creates a private copy in your account.
      </div>
      {message ? (
        <div className="text-xs text-neutral-600" role="status">
          {message}
        </div>
      ) : null}
    </>
  );
}

/** Copies the page's address; when the clipboard is blocked, the dialog shows it to copy by hand. */
function useCopyShareLink() {
  const [message, setMessage] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const copyShareLink = async () => {
    const shareUrl = window.location.href;
    setMessage(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      track("share_page_link_copied", { shared_context: true, source: "copy" });
      setMessage("Link copied.");
    } catch {
      track("share_page_link_copy_fallback", { shared_context: true, source: "copy" });
      setManualCopyUrl(shareUrl);
      setMessage("Copy the link from the dialog.");
    }
  };
  return { message, manualCopyUrl, copyShareLink, closeManualCopy: () => setManualCopyUrl(null) };
}

export default function SharePageActions({ shareToken }: SharePageActionsProps) {
  const { message, manualCopyUrl, copyShareLink, closeManualCopy } = useCopyShareLink();
  return (
    <>
      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <div
          className="flex min-w-0 flex-wrap justify-start gap-2 sm:justify-end"
          data-testid="share-page-actions"
        >
          <button
            type="button"
            data-testid="share-copy-link"
            data-share-touch-target="true"
            onClick={copyShareLink}
            className={SECONDARY_ACTION_CLASS}
          >
            Copy link
          </button>
          <a
            href={`/share/${shareToken}/export/pdf`}
            data-testid="share-download-pdf"
            data-share-touch-target="true"
            className={SECONDARY_ACTION_CLASS}
          >
            Download PDF
          </a>
          <DuplicateDesignButton
            shareToken={shareToken}
            unauthenticatedChildren="Sign in to make a copy"
            data-testid="share-copy-to-edit"
            data-share-touch-target="true"
            className="inline-flex min-h-11 items-center rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow outline-offset-2 hover:bg-neutral-800 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Make a copy
          </DuplicateDesignButton>
        </div>
        <ShareActionMessage message={message} />
      </div>
      <CopyFallbackDialog
        open={Boolean(manualCopyUrl)}
        title="Copy share link"
        description="Clipboard access is blocked in this browser. Select the link below and copy it manually."
        value={manualCopyUrl ?? ""}
        onClose={closeManualCopy}
      />
    </>
  );
}
