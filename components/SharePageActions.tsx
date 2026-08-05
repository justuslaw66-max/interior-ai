"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "@/lib/analytics";
import DuplicateDesignButton from "@/components/DuplicateDesignButton";
import CopyFallbackDialog from "@/components/CopyFallbackDialog";

type SharePageActionsProps = {
  shareToken: string;
  title: string;
};

function ShareActionMessage({ message }: { message: string | null }) {
  return (
    <>
      <div className="text-right text-[11px] text-neutral-500">
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

export default function SharePageActions({ shareToken, title }: SharePageActionsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [manualCopyUrl, setManualCopyUrl] = useState<string | null>(null);
  const getShareUrl = () => window.location.href;
  const copyShareLink = async (source: "copy" | "native_fallback") => {
    const shareUrl = getShareUrl();
    setMessage(null);

    try {
      await navigator.clipboard.writeText(shareUrl);
      track("share_page_link_copied", { shared_context: true, source });
      setMessage("Link copied.");
    } catch {
      track("share_page_link_copy_fallback", { shared_context: true, source });
      setManualCopyUrl(shareUrl);
      setMessage("Copy the link from the dialog.");
    }
  };

  const handleNativeShare = async () => {
    const shareUrl = getShareUrl();
    setMessage(null);

    if (!navigator.share) {
      await copyShareLink("native_fallback");
      return;
    }

    try {
      await navigator.share({
        title,
        text: `${title} - Interior AI design preview`,
        url: shareUrl,
      });
      track("share_page_native_shared", { shared_context: true });
      setMessage("Shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      track("share_page_native_share_failed", {
        shared_context: true,
        error: error instanceof Error ? error.name : "unknown",
      });
      await copyShareLink("native_fallback");
    }
  };

  return (
    <>
      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <div className="rounded-lg bg-white px-3 py-2 text-xs shadow">
          Interior AI (Beta)
        </div>
        <div
          className="flex min-w-0 flex-wrap justify-start gap-2 sm:justify-end"
          data-testid="share-page-actions"
        >
          <button
            type="button"
            data-testid="share-copy-link"
            data-share-touch-target="true"
            onClick={() => copyShareLink("copy")}
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2"
          >
            Copy link
          </button>
          <button
            type="button"
            data-testid="share-native-share"
            data-share-touch-target="true"
            onClick={handleNativeShare}
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2"
          >
            Share
          </button>
          <Link
            href={`/share/${shareToken}/export/pdf`}
            data-testid="share-download-pdf"
            data-share-touch-target="true"
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2"
          >
            Download PDF
          </Link>
          <a
            href="#shopping-preview"
            data-testid="share-shopping-list"
            data-share-touch-target="true"
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2"
          >
            Shopping list
          </a>
          <Link
            href={`/share/${shareToken}/export`}
            data-testid="share-export-pack"
            data-share-touch-target="true"
            onClick={() => track("share_page_export_clicked", { shared_context: true })}
            className="inline-flex min-h-11 items-center rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white shadow outline-offset-2 hover:bg-neutral-800 focus-visible:outline-2"
          >
            Export pack
          </Link>
          <DuplicateDesignButton
            shareToken={shareToken}
            unauthenticatedChildren="Sign in to copy"
            data-testid="share-copy-to-edit"
            data-share-touch-target="true"
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow outline-offset-2 hover:bg-emerald-700 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Copy to edit
          </DuplicateDesignButton>
        </div>
        <ShareActionMessage message={message} />
      </div>
      <CopyFallbackDialog
        open={Boolean(manualCopyUrl)}
        title="Copy share link"
        description="Clipboard access is blocked in this browser. Select the link below and copy it manually."
        value={manualCopyUrl ?? ""}
        onClose={() => setManualCopyUrl(null)}
      />
    </>
  );
}
