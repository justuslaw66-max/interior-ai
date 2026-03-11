/**
 * Upgrade Modal Component
 * 
 * Calm, minimal modal shown when users hit Pro-only features.
 * Strategic trigger points only (not spammy).
 */

"use client";

import { useState } from "react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  trigger?: "pdf" | "watermark" | "branding";
}

export function UpgradeModal({
  isOpen,
  onClose,
  onUpgrade,
  trigger,
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const triggerMessages = {
    pdf: "Download as PDF is a Pro feature",
    watermark: "Remove watermark is a Pro feature",
    branding: "Custom branding is a Pro feature",
  };

  const message = trigger ? triggerMessages[trigger] : "Unlock professional export features";
  const priceLabel = "$29/month";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-semibold">Upgrade to Pro</h2>

        {trigger && (
          <p className="text-gray-600 mt-2 text-sm">
            {message}
          </p>
        )}

        <div className="mt-5 rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <div className="px-3 py-2">Feature</div>
            <div className="px-3 py-2 text-center">Free</div>
            <div className="px-3 py-2 text-center">Pro</div>
          </div>
          <div className="grid grid-cols-3 text-sm text-gray-700">
            <div className="px-3 py-2">Watermark</div>
            <div className="px-3 py-2 text-center">Yes</div>
            <div className="px-3 py-2 text-center">No</div>

            <div className="px-3 py-2 border-t">PDF export</div>
            <div className="px-3 py-2 text-center border-t">Print only</div>
            <div className="px-3 py-2 text-center border-t">Download PDF</div>

            <div className="px-3 py-2 border-t">Branding</div>
            <div className="px-3 py-2 text-center border-t">Basic</div>
            <div className="px-3 py-2 text-center border-t">Custom</div>

            <div className="px-3 py-2 border-t">AI tools</div>
            <div className="px-3 py-2 text-center border-t">Limited</div>
            <div className="px-3 py-2 text-center border-t">Extended</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onUpgrade}
            className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md font-medium hover:bg-blue-700 transition"
          >
            Upgrade to Pro — {priceLabel}
          </button>
          <p className="text-xs text-gray-500">
            Client-ready presentations for designers and agents.
          </p>
          <button
            onClick={onClose}
            className="self-start text-sm text-gray-600 hover:text-gray-800 transition"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
