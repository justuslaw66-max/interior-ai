/**
 * Upgrade Modal Component
 * 
 * Calm, minimal modal shown when users hit Pro-only features.
 * Strategic trigger points only (not spammy).
 */

"use client";

import { PRO_PLAN_PRICING } from "@/lib/pro-plan-catalog";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  trigger?: "pdf" | "watermark" | "branding";
  isUpgrading?: boolean;
  error?: string | null;
}

export function UpgradeModal({
  isOpen,
  onClose,
  onUpgrade,
  trigger,
  isUpgrading = false,
  error = null,
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const triggerMessages = {
    pdf: "Free includes a watermarked preview. Pro unlocks clean downloadable PDFs.",
    watermark: "Upgrade to remove the free export watermark.",
    branding: "Upgrade for clean exports and client-ready presentation polish.",
  };

  const message = trigger ? triggerMessages[trigger] : "Unlock professional export features";
  const priceLabel = PRO_PLAN_PRICING.monthly.label;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-semibold">Upgrade to Pro</h2>

        {trigger && (
          <p className="text-gray-600 mt-2 text-sm">
            {message}
          </p>
        )}

        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          Best for designers sending polished proposals and room exports to clients.
        </div>

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

            <div className="px-3 py-2 border-t">Image angles</div>
            <div className="px-3 py-2 text-center border-t">1</div>
            <div className="px-3 py-2 text-center border-t">Up to 4</div>

            <div className="px-3 py-2 border-t">Plan tools</div>
            <div className="px-3 py-2 text-center border-t">Guided</div>
            <div className="px-3 py-2 text-center border-t">Pro</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <button
            onClick={onUpgrade}
            disabled={isUpgrading}
            className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md font-medium hover:bg-blue-700 transition disabled:cursor-wait disabled:opacity-60"
          >
            {isUpgrading ? "Opening secure checkout…" : `Start Pro monthly — ${priceLabel}`}
          </button>
          <p className="text-xs text-gray-500">
            Clean PDFs, multi-angle images, and Pro planning controls.
          </p>
          <button
            onClick={onClose}
            disabled={isUpgrading}
            className="self-start text-sm text-gray-600 hover:text-gray-800 transition"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
