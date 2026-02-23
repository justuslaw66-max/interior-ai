"use client";

import { track } from "@/lib/analytics";

export default function PrintButton({
  shareToken,
  designId,
}: {
  shareToken: string;
  designId?: string | null;
}) {
  const handlePrint = () => {
    track("export_printed", {
      share_token: shareToken,
      design_id: designId ?? null,
    });
    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "export_printed",
        shareToken,
        designId: designId ?? null,
      }),
    }).catch(() => undefined);
    window.print();
  };

  return (
    <button
      onClick={handlePrint}
      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
    >
      🖨️ Print / Save as PDF
    </button>
  );
}
