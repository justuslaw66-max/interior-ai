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

  const trackAppEvent = (eventType: string, meta?: Record<string, unknown>) => {
    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        designId: designId ?? null,
        shareToken,
        ...(meta ? { meta } : {}),
      }),
    }).catch(() => undefined);
  };

  const handlePrintPreview = () => {
    track("export_printed", {
      design_id: designId ?? null,
      share_token: shareToken,
      watermarked: capabilities.watermark,
    });
    trackAppEvent("export_printed", { watermarked: capabilities.watermark });
    window.print();
  };

  const handleDownload = async () => {
    if (!capabilities.pdfDownload) {
      track("export_upgrade_prompt_shown", {
        trigger: "pdf",
        design_id: designId ?? null,
        share_token: shareToken,
      });

      trackAppEvent("export_upgrade_prompt_shown", { trigger: "pdf" });
      
      setShowUpgrade(true);
      return;
    }

    track("export_pdf_clicked", {
      design_id: designId ?? null,
      share_token: shareToken,
    });

    trackAppEvent("export_pdf_clicked");

    handlePrintPreview();
  };

  const handleUpgrade = async () => {
    track("upgrade_checkout_started", { trigger: "pdf" });

    trackAppEvent("upgrade_checkout_started", { trigger: "pdf" });

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
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!capabilities.pdfDownload ? (
          <button
            type="button"
            onClick={handlePrintPreview}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            Print watermarked preview
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          {capabilities.pdfDownload ? "Print / Save PDF" : "Clean PDF (Pro)"}
        </button>
      </div>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        trigger="pdf"
      />
    </>
  );
}
