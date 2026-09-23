"use client";

import {
  type CabinetGuidedStepId,
  getCabinetOnboardingActionsForStep,
} from "../studioOnboarding";

interface CabinetContextualOnboardingProps {
  step: CabinetGuidedStepId;
  visible: boolean;
  onDismiss: () => void;
  onShow: () => void;
}

function testIdFor(step: CabinetGuidedStepId, suffix: "hint" | "dismiss" | "show") {
  return step === "type"
    ? `cabinet-onboarding-${suffix}`
    : `cabinet-onboarding-${step}-${suffix}`;
}

export function CabinetContextualOnboarding({
  step,
  visible,
  onDismiss,
  onShow,
}: CabinetContextualOnboardingProps) {
  const actions = getCabinetOnboardingActionsForStep(step);
  if (actions.length === 0) return null;

  if (!visible) {
    return (
      <button
        type="button"
        data-testid={testIdFor(step, "show")}
        className="justify-self-start text-xs font-semibold text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        onClick={onShow}
      >
        Show me how
      </button>
    );
  }

  return (
    <aside
      data-testid={testIdFor(step, "hint")}
      aria-label="First-use millwork help"
      className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
            First-use tip
          </p>
          {actions.map((action) => (
            <div key={action.id} className="grid gap-1">
              <p className="text-sm font-semibold">
                {action.order} of 5 · {action.title}
              </p>
              <p className="text-xs leading-5 text-blue-800">
                {action.description}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid={testIdFor(step, "dismiss")}
          aria-label="Dismiss first-use millwork help"
          className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </aside>
  );
}
