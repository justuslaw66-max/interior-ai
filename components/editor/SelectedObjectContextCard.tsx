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
      className="rounded-xl border border-box-border bg-surface-secondary px-3 py-2 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={
              selectionContext.tone === "furnish"
                ? "text-xs font-semibold uppercase tracking-wide text-on-accent-tint"
                : "text-xs font-semibold uppercase tracking-wide text-on-success-tint"
            }
          >
            {selectionContext.label}
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-label">
            {selectionContext.title}
          </div>
          <div className="mt-0.5 text-xs text-label-secondary">
            {selectionContext.detail}
          </div>
        </div>
        <span
          className={
            selectionContext.tone === "furnish"
              ? "shrink-0 rounded-full bg-accent-tint px-2 py-1 text-xs font-semibold text-on-accent-tint"
              : "shrink-0 rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint"
          }
        >
          {selectionContext.tone === "furnish" ? "Furnish" : "Plan"}
        </span>
      </div>
    </div>
  );
}
