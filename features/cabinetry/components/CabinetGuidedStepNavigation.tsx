"use client";

import { Check, Layers3, MapPin, Palette, Ruler, Sparkles } from "lucide-react";

export const CABINET_GUIDED_STEPS = [
  { id: "type", label: "Type", hint: "Choose what to build", icon: Sparkles },
  { id: "space", label: "Space", hint: "Choose where it will go", icon: MapPin },
  { id: "size", label: "Size", hint: "Set the available size", icon: Ruler },
  { id: "layout", label: "Layout", hint: "Arrange useful storage", icon: Layers3 },
  { id: "style", label: "Style", hint: "Choose finishes", icon: Palette },
  { id: "review", label: "Review", hint: "Check and place", icon: Check },
] as const;

export function CabinetGuidedStepNavigation({
  currentStepIndex,
  onStepChange,
}: {
  currentStepIndex: number;
  onStepChange: (index: number) => void;
}) {
  return (
    <nav aria-label="Guided millwork steps" className="mb-7 grid grid-cols-6 gap-1 sm:gap-2">
      {CABINET_GUIDED_STEPS.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = index === currentStepIndex;
        const isComplete = index < currentStepIndex;
        return (
          <button
            key={step.id}
            type="button"
            data-testid={`cabinet-guided-step-${step.id}`}
            aria-current={isActive ? "step" : undefined}
            className={`group grid min-w-0 gap-1 rounded-xl px-1.5 py-2 text-center transition sm:px-3 ${
              isActive
                ? "bg-neutral-950 text-white shadow-sm"
                : "text-neutral-500 hover:bg-white hover:text-neutral-950"
            }`}
            onClick={() => onStepChange(index)}
          >
            <span
              className={`mx-auto grid h-6 w-6 place-items-center rounded-full ${
                isActive
                  ? "bg-white/15"
                  : isComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-neutral-200/70"
              }`}
            >
              {isComplete ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <StepIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="truncate text-[11px] font-semibold sm:text-xs">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
