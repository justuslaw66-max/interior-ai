"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function ShareTracking({
  shareToken,
  designId,
}: {
  shareToken: string;
  designId?: string | null;
}) {
  useEffect(() => {
    track("share_link_opened", {
      share_token: shareToken,
      design_id: designId ?? null,
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "share_link_opened",
        shareToken,
        designId: designId ?? null,
      }),
    }).catch(() => undefined);
  }, [shareToken, designId]);

  return null;
}
