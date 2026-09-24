"use client";

import type { DesignSelectionContext } from "@/lib/design-page-selection-context";

type SelectedObjectContextCardProps = {
  dark: boolean;
  selectionContext: DesignSelectionContext;
};

/** The selected object's name and step, above the Furnish and Suggest a layout panels. */
export function SelectedObjectContextCard({ dark, selectionContext }: SelectedObjectContextCardProps) {
  return (
    <div
      data-testid="selected-object-context"
      className={
        dark
          ? "designer-raised rounded-xl border px-3 py-2"
          : "rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={
              selectionContext.tone === "furnish"
                ? dark
                  ? "designer-accent text-[11px] font-semibold uppercase tracking-wide"
                  : "text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                : dark
                  ? "designer-text-secondary text-[11px] font-semibold uppercase tracking-wide"
                  : "text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
            }
          >
            {selectionContext.label}
          </div>
          <div className={dark ? "designer-text-primary mt-0.5 truncate text-sm font-semibold" : "mt-0.5 truncate text-sm font-semibold text-neutral-950"}>
            {selectionContext.title}
          </div>
          <div className={dark ? "designer-text-muted mt-0.5 text-[11px]" : "mt-0.5 text-[11px] text-neutral-500"}>
            {selectionContext.detail}
          </div>
        </div>
        <span
          className={
            selectionContext.tone === "furnish"
              ? dark
                ? "designer-status-info shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                : "shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"
              : dark
                ? "designer-status-ready shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                : "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
          }
        >
          {selectionContext.tone === "furnish" ? "Furnish" : "Plan"}
        </span>
      </div>
    </div>
  );
}
