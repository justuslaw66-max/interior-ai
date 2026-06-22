"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import CopyFallbackDialog from "@/components/CopyFallbackDialog";

export function InviteCopyButton({
  referralCode,
  source,
  brand = "Interior AI",
}: {
  referralCode: string | null;
  source: string;
  brand?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [manualCopyMessage, setManualCopyMessage] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!referralCode) return;
    setMessage(null);
    const appUrl = window.location.origin;
    const inviteMessage = `I'm designing my living room with ${brand}.
Try it here: ${appUrl}?ref=${referralCode}`;

    try {
      await navigator.clipboard.writeText(inviteMessage);
      track("invite_clicked", { source });
      setMessage("Invite copied to clipboard.");
    } catch {
      track("invite_clicked", { source });
      setManualCopyMessage(inviteMessage);
      setMessage("Copy the invite from the dialog.");
    }
  };

  return (
    <>
      <button
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
        onClick={handleCopy}
        disabled={!referralCode}
        title={referralCode ? "Copy invite" : "Invite ready after sign-in"}
      >
        Copy invite
      </button>
      {message && (
        <span className="text-xs text-neutral-600" role="status">
          {message}
        </span>
      )}
      <CopyFallbackDialog
        open={Boolean(manualCopyMessage)}
        title="Copy invite"
        description="Clipboard access is blocked in this browser. Select the invite below and copy it manually."
        value={manualCopyMessage ?? ""}
        onClose={() => setManualCopyMessage(null)}
      />
    </>
  );
}
