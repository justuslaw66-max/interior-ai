"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import type { ShareCheckoutLine } from "@/lib/share-shopping-csv";

export default function ShareShoppingCheckout({
  lines,
}: {
  lines: ShareCheckoutLine[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const startCheckout = async () => {
    if (busy || lines.length === 0) return;
    setBusy(true);
    setMessage(null);
    track("share_shopify_checkout_started", {
      shared_context: true,
      line_count: lines.length,
      total_quantity: totalQuantity,
    });

    try {
      const response = await fetch("/api/shopify/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error =
          typeof payload?.error === "string"
            ? payload.error
            : "Checkout is temporarily unavailable.";
        track("share_shopify_checkout_failed", {
          shared_context: true,
          status: response.status,
        });
        setMessage(error);
        return;
      }

      const checkoutUrl = new URL(String(payload?.checkoutUrl ?? ""));
      if (checkoutUrl.protocol !== "https:") {
        throw new Error("Invalid checkout URL");
      }
      window.location.assign(checkoutUrl.toString());
    } catch {
      setMessage("Checkout is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="share-live-commerce">
      <button
        type="button"
        data-testid="share-start-checkout"
        disabled={busy || lines.length === 0}
        onClick={startCheckout}
        className="rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {busy
          ? "Checking availability..."
          : lines.length > 0
            ? `Checkout ${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`
            : "No direct-checkout items"}
      </button>
      {message ? (
        <div className="mt-2 max-w-md text-xs font-medium text-red-700" role="alert">
          {message}
        </div>
      ) : null}
    </div>
  );
}
