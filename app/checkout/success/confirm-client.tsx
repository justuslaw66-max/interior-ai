"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

export default function ConfirmOrderClient({
  orderRef,
  designId,
}: {
  orderRef: string;
  designId: string | null;
}) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!orderRef) return;
    fetch("/api/shopify/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderRef, designId }),
    }).catch(() => {});
  }, [orderRef, designId]);

  useEffect(() => {
    if (!orderRef || trackedRef.current) return;
    track("checkout_completed", {
      order_id: orderRef,
      design_id: designId ?? null,
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "checkout_completed",
        designId,
        meta: { orderRef },
      }),
    }).catch(() => undefined);

    trackedRef.current = true;
  }, [orderRef, designId]);

  return null;
}
