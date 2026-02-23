"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function ExportTracking({
  shareToken,
  designId,
}: {
  shareToken: string;
  designId?: string | null;
}) {
  useEffect(() => {
    track("export_opened", {
      share_token: shareToken,
      design_id: designId ?? null,
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "export_opened",
        shareToken,
        designId: designId ?? null,
      }),
    }).catch(() => undefined);
  }, [shareToken, designId]);

  return null;
}
