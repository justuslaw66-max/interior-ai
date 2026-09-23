"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function CheckoutCompletedTracking() {
  useEffect(() => {
    track("checkout_success_viewed", { source: "billing_success_page" });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "checkout_success_viewed",
        meta: { source: "billing_success_page" },
      }),
    }).catch(() => undefined);
  }, []);

  return null;
}
