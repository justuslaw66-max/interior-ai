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
    track("checkout_return_observed", {
      provider_reference_present: true,
      design_id: designId ?? null,
      order_verified: false,
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "checkout_return_observed",
        designId,
        meta: { providerReferencePresent: true },
      }),
    }).catch(() => undefined);

    trackedRef.current = true;
  }, [orderRef, designId]);

  return null;
}
