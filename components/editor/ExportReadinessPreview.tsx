"use client";

import type { ExportReadinessItem } from "@/lib/design-page-export-readiness";

type ExportReadinessPreviewProps = {
  items: ExportReadinessItem[];
  readyCount: number;
  score: number;
};

export default function ExportReadinessPreview({
  items,
  readyCount,
  score,
}: ExportReadinessPreviewProps) {
  return (
    <div
      data-testid="export-preview-flow"
      className="rounded-xl border border-gray-200 bg-gray-50 p-3"
    >
      <div className="text-sm font-semibold text-gray-900">
        Export preview
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          {readyCount} of {items.length} ready
        </div>
        <div className="text-xs font-semibold text-gray-900">
          {score}%
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${score}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((entry) => (
          <div
            key={entry.label}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <div className="text-xs font-semibold text-gray-900">
              {entry.label}
            </div>
            <div
              className={
                entry.ready
                  ? "mt-0.5 text-xs font-semibold text-emerald-600"
                  : "mt-0.5 text-xs font-semibold text-amber-700"
              }
            >
              {entry.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
