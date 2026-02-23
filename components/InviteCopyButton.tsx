"use client";

import { track } from "@/lib/analytics";

export function InviteCopyButton({
  referralCode,
  source,
  brand = "Interior AI",
}: {
  referralCode: string | null;
  source: string;
  brand?: string;
}) {
  const handleCopy = async () => {
    if (!referralCode) return;
    const appUrl = window.location.origin;
    const message = `I'm designing my living room with ${brand}.
Try it here  ${appUrl}?ref=${referralCode}`;

    try {
      await navigator.clipboard.writeText(message);
      track("invite_clicked", { source });
      alert("Invite copied to clipboard.");
    } catch {
      track("invite_clicked", { source });
      window.prompt("Copy invite message:", message);
    }
  };

  return (
    <button
      className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
      onClick={handleCopy}
      disabled={!referralCode}
      title={referralCode ? "Copy invite" : "Invite ready after sign-in"}
    >
      Copy invite
    </button>
  );
}
