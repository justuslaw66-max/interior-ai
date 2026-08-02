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
import { signIn } from "next-auth/react";

interface PDFDownloadButtonProps {
  capabilities: ExportCapabilities;
  shareToken: string;
  designId: string;
}

export function PDFDownloadButton({ 
  capabilities, 
  shareToken, 
  designId 
}: PDFDownloadButtonProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!capabilities.pdfDownload) {
      track("export_upgrade_prompt_shown", {
        trigger: "pdf",
        design_id: designId,
        shared_context: Boolean(shareToken),
      });

      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "export_upgrade_prompt_shown",
          designId,
          shareToken,
          meta: { trigger: "pdf" },
        }),
      }).catch(() => undefined);
      
      setUpgradeError(null);
      setShowUpgrade(true);
      return;
    }

    track("export_pdf_clicked", {
      design_id: designId,
      shared_context: Boolean(shareToken),
    });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "export_pdf_clicked",
        designId,
        shareToken,
      }),
    }).catch(() => undefined);

    // Trigger browser PDF save
    window.print();
  };

  const handleUpgrade = async () => {
    if (isUpgrading) return;
    setIsUpgrading(true);
    setUpgradeError(null);
    track("upgrade_checkout_started", { trigger: "pdf" });

    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "upgrade_checkout_started",
        designId,
        shareToken,
        meta: { trigger: "pdf" },
      }),
    }).catch(() => undefined);

    try {
      // Call Stripe checkout API
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "monthly" }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        await signIn("google", { callbackUrl: window.location.href });
        return;
      }
      
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setUpgradeError(data.error || "Unable to open checkout. Please try again.");
      }
    } catch (error) {
      console.warn("Upgrade checkout failed:", error);
      setUpgradeError("Unable to open checkout. Please try again.");
    } finally {
      setIsUpgrading(false);
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
        onClose={() => {
          setShowUpgrade(false);
          setUpgradeError(null);
        }}
        onUpgrade={handleUpgrade}
        trigger="pdf"
        isUpgrading={isUpgrading}
        error={upgradeError}
      />
    </>
  );
}
