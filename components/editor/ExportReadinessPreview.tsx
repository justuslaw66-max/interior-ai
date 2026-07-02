"use client";

import type { ExportReadinessItem } from "@/lib/design-page-export-readiness";

type ExportReadinessPreviewProps = {
  dark: boolean;
  items: ExportReadinessItem[];
  readyCount: number;
  score: number;
};

export default function ExportReadinessPreview({
  dark,
  items,
  readyCount,
  score,
}: ExportReadinessPreviewProps) {
  return (
    <div
      data-testid="export-preview-flow"
      className={
        dark
          ? "rounded-xl border border-white/10 bg-white/5 p-3"
          : "rounded-xl border border-gray-200 bg-gray-50 p-3"
      }
    >
      <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-gray-900"}>
        Export preview
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className={dark ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
          {readyCount} of {items.length} ready
        </div>
        <div className={dark ? "text-xs font-semibold text-neutral-200" : "text-xs font-semibold text-gray-900"}>
          {score}%
        </div>
      </div>
      <div className={dark ? "mt-2 h-2 overflow-hidden rounded-full bg-white/10" : "mt-2 h-2 overflow-hidden rounded-full bg-gray-200"}>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${score}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((entry) => (
          <div
            key={entry.label}
            className={
              dark
                ? "rounded-lg border border-white/10 bg-[#10131a] px-3 py-2"
                : "rounded-lg border border-gray-200 bg-white px-3 py-2"
            }
          >
            <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>
              {entry.label}
            </div>
            <div
              className={
                entry.ready
                  ? "mt-0.5 text-[11px] font-semibold text-emerald-600"
                  : dark
                    ? "mt-0.5 text-[11px] font-semibold text-amber-300"
                    : "mt-0.5 text-[11px] font-semibold text-amber-700"
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
