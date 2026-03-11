"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function CheckoutCompletedTracking() {
  useEffect(() => {
    track("upgrade_checkout_completed", { source: "billing_success_page" });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "upgrade_checkout_completed",
        meta: { source: "billing_success_page" },
      }),
    }).catch(() => undefined);
  }, []);

  return null;
}
