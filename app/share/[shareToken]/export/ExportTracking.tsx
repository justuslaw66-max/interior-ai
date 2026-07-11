"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { postClientAppEvent } from "@/lib/client-app-event";

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

    postClientAppEvent({
      eventType: "export_opened",
      shareToken,
      designId: designId ?? null,
    }).catch(() => undefined);
  }, [shareToken, designId]);

  return null;
}
