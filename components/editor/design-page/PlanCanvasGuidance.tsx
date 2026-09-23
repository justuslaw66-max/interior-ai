"use client";

import type { PlanCanvasGuidance as PlanCanvasGuidanceState } from "@/lib/plan-canvas-guidance";

export type PlanCanvasGuidancePrimaryAction = {
  label: string;
  ariaLabel: string;
  onClick: () => void;
};

type PlanCanvasGuidanceProps = {
  state: {
    guidance: PlanCanvasGuidanceState;
    primaryAction: PlanCanvasGuidancePrimaryAction | null;
    dismissible: boolean;
  };
  actions: {
    dismiss: () => void;
  };
};

export function PlanCanvasGuidance({ state, actions }: PlanCanvasGuidanceProps) {
  const accentClass =
    state.guidance.tone === "blocked"
      ? "bg-amber-500"
      : state.guidance.tone === "ready"
        ? "bg-emerald-500"
        : "bg-blue-500";
  const labelClass =
    state.guidance.tone === "blocked"
      ? "bg-amber-50 text-amber-800"
      : state.guidance.tone === "ready"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-blue-50 text-blue-800";

  return (
    <div
      data-testid="plan-canvas-guidance"
      data-tone={state.guidance.tone}
      className="pointer-events-none absolute bottom-20 left-1/2 z-30 w-[min(92vw,390px)] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur sm:bottom-6"
      role={state.primaryAction ? "group" : "status"}
      aria-label={state.primaryAction ? state.guidance.title : undefined}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accentClass}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-neutral-950">
              {state.guidance.title}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {state.primaryAction ? (
                <button
                  type="button"
                  data-testid="plan-canvas-guidance-action"
                  aria-label={state.primaryAction.ariaLabel}
                  className="pointer-events-auto rounded-lg bg-neutral-950 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    state.primaryAction?.onClick();
                  }}
                >
                  {state.primaryAction.label}
                </button>
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${labelClass}`}
                >
                  {state.guidance.label}
                </span>
              )}
              {state.dismissible && (
                <button
                  type="button"
                  data-testid="plan-canvas-guidance-dismiss"
                  aria-label="Hide plan tip"
                  className="pointer-events-auto rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.dismiss();
                  }}
                >
                  Hide
                </button>
              )}
            </div>
          </div>
          <div className="mt-0.5 text-xs leading-5 text-neutral-600">
            {state.guidance.detail}
          </div>
        </div>
      </div>
    </div>
  );
}
