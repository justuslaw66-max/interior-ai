/**
 * PDF Download Button with Pro Upgrade Gate
 * 
 * Free users see upgrade modal when clicking.
 * Pro users can download PDF directly.
 */

"use client";

import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";
import type { ExportCapabilities } from "@/lib/export-capabilities";
import { track } from "@/lib/analytics";

interface PDFDownloadButtonProps {
  capabilities: ExportCapabilities;
  shareToken: string;
  designId?: string | null;
}

export function PDFDownloadButton({ 
  capabilities, 
  shareToken, 
  designId 
}: PDFDownloadButtonProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleDownload = async () => {
    if (!capabilities.pdfDownload) {
      track("export_upgrade_prompt_shown", {
        trigger: "pdf",
        design_id: designId ?? null,
        share_token: shareToken,
      });

      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "export_upgrade_prompt_shown",
          designId: designId ?? null,
          shareToken,
          meta: { trigger: "pdf" },
        }),
      }).catch(() => undefined);
      
      setShowUpgrade(true);
      return;
    }

    track("export_pdf_clicked", {
      design_id: designId ?? null,
      share_token: shareToken,
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "export_pdf_clicked",
        designId: designId ?? null,
        shareToken,
      }),
    }).catch(() => undefined);

    // Trigger browser PDF save
    window.print();
  };

  const handleUpgrade = async () => {
    track("upgrade_checkout_started", { trigger: "pdf" });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "upgrade_checkout_started",
        designId: designId ?? null,
        shareToken,
        meta: { trigger: "pdf" },
      }),
    }).catch(() => undefined);

    try {
      // Call Stripe checkout API
      const res = await fetch("/api/stripe/checkout-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Upgrade error:", error);
    }
  };

  return (
    <>
      <button
        onClick={handleDownload}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
      >
        {capabilities.pdfDownload ? "Download PDF" : "Download PDF (Pro)"}
      </button>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        trigger="pdf"
      />
    </>
  );
}
