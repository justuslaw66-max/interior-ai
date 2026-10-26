"use client";

import type { PlanCanvasGuidance as PlanCanvasGuidanceState } from "@/lib/plan-canvas-guidance";
import { usePhoneSheetState } from "@/lib/phone-step-sheet";
import { Button } from "@/components/ui/Button";

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
    aboveStepSheet: boolean;
  };
  actions: {
    dismiss: () => void;
  };
};

/**
 * Below 768px the open step panel is a sheet over the canvas, sitting on the step bar (UX 4d:
 * PhoneStepSheet), while this overlay's box ends at the step bar too (DesignPageWorkspace). So the
 * tip sits 0.5rem above the sheet's current height, and its buttons never cover the sheet's; with
 * the sheet at full there's no canvas left for it. From 768px the panel is beside the canvas.
 */
const PLACEMENT_ABOVE_STEP_SHEET = "bottom-2 md:bottom-6";
const placementClass = (aboveStepSheet: boolean) =>
  aboveStepSheet ? PLACEMENT_ABOVE_STEP_SHEET : "bottom-20 sm:bottom-6";

function toneClasses(tone: PlanCanvasGuidanceState["tone"]) {
  if (tone === "blocked") return { accentClass: "bg-amber-500", labelClass: "bg-warning-tint text-on-warning-tint" };
  if (tone === "ready") return { accentClass: "bg-emerald-500", labelClass: "bg-success-tint text-on-success-tint" };
  return { accentClass: "bg-blue-500", labelClass: "bg-accent-tint text-on-accent-tint" };
}

export function PlanCanvasGuidance({ state, actions }: PlanCanvasGuidanceProps) {
  const sheet = usePhoneSheetState();
  const onSheet = state.aboveStepSheet && sheet.heightPx > 0;
  if (onSheet && sheet.snap === "full") return null;
  const { accentClass, labelClass } = toneClasses(state.guidance.tone);

  return (
    <div
      data-testid="plan-canvas-guidance" data-touch-area data-surface="floating"
      data-tone={state.guidance.tone}
      className={`pointer-events-none absolute left-1/2 z-30 w-[min(92vw,390px)] -translate-x-1/2 rounded-xl border border-separator bg-surface-floating/95 px-3 py-2.5 shadow-xl backdrop-blur ${placementClass(state.aboveStepSheet)}`}
      style={onSheet ? { bottom: `calc(${sheet.heightPx + 8}px + env(safe-area-inset-bottom))` } : undefined}
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
            <div className="truncate text-sm font-semibold text-label">
              {state.guidance.title}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {state.primaryAction ? (
                <Button
                  data-testid="plan-canvas-guidance-action"
                  aria-label={state.primaryAction.ariaLabel}
                  variant="primary" size="compact" className="pointer-events-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    state.primaryAction?.onClick();
                  }}
                >
                  {state.primaryAction.label}
                </Button>
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${labelClass}`}
                >
                  {state.guidance.label}
                </span>
              )}
              {state.dismissible && (
                <Button
                  data-testid="plan-canvas-guidance-dismiss"
                  aria-label="Hide plan tip"
                  variant="secondary" size="compact" className="pointer-events-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.dismiss();
                  }}
                >
                  Hide
                </Button>
              )}
            </div>
          </div>
          <div className="mt-0.5 text-xs leading-5 text-label-secondary">
            {state.guidance.detail}
          </div>
        </div>
      </div>
    </div>
  );
}
