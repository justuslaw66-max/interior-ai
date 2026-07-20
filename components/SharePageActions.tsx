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
      <div className="flex flex-col items-end gap-2">
        <div className="rounded-lg bg-white px-3 py-2 text-xs shadow">
          Interior AI (Beta)
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-testid="share-copy-link"
            onClick={() => copyShareLink("copy")}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
          >
            Copy link
          </button>
          <button
            type="button"
            data-testid="share-native-share"
            onClick={handleNativeShare}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
          >
            Share
          </button>
          <Link
            href={`/share/${shareToken}/export/pdf`}
            data-testid="share-download-pdf"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
          >
            Download PDF
          </Link>
          <Link
            href="#shopping-preview"
            data-testid="share-shopping-list"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
          >
            Shopping list
          </Link>
          <Link
            href={`/share/${shareToken}/export`}
            data-testid="share-export-pack"
            onClick={() => track("share_page_export_clicked", { shared_context: true })}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800"
          >
            Export pack
          </Link>
          <DuplicateDesignButton
            shareToken={shareToken}
            data-testid="share-copy-to-edit"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Copy to edit
          </DuplicateDesignButton>
        </div>
        {message ? (
          <div className="text-xs text-neutral-600" role="status">
            {message}
          </div>
        ) : null}
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
