"use client";

import type { DesignSelectionContext } from "@/lib/design-page-selection-context";

type SelectedObjectContextCardProps = {
  selectionContext: DesignSelectionContext;
};

/** The selected object's name and step, above the Furnish and Suggest a layout panels. */
export function SelectedObjectContextCard({ selectionContext }: SelectedObjectContextCardProps) {
  return (
    <div
      data-testid="selected-object-context"
      className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={
              selectionContext.tone === "furnish"
                ? "text-xs font-semibold uppercase tracking-wide text-blue-700"
                : "text-xs font-semibold uppercase tracking-wide text-emerald-700"
            }
          >
            {selectionContext.label}
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-neutral-950">
            {selectionContext.title}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {selectionContext.detail}
          </div>
        </div>
        <span
          className={
            selectionContext.tone === "furnish"
              ? "shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
              : "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
          }
        >
          {selectionContext.tone === "furnish" ? "Furnish" : "Plan"}
        </span>
      </div>
    </div>
  );
}
