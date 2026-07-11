"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function CheckoutCompletedTracking() {
  useEffect(() => {
    track("upgrade_checkout_completed", { source: "billing_success_page" });
  }, []);

  return null;
}
