"use client";

import { LayoutPanelLeft, ShoppingBag, Sofa, type LucideIcon } from "lucide-react";
import { GUEST_PROMPT_WORKFLOW_FALLBACK_ID } from "@/lib/guest-save-prompt";

export type CommandBarStep = {
  id: "plan" | "furnish" | "shop";
  number: number;
  label: string;
  testId: string;
  active: boolean;
  onSelect: () => void;
};

type CommandBarStepTabsProps = {
  dark: boolean;
  steps: CommandBarStep[];
  /** The step that carries the focus fallback id: the current one, else Plan. */
  focusFallbackStepId: CommandBarStep["id"];
};

const STEP_ICONS: Record<CommandBarStep["id"], LucideIcon> = {
  plan: LayoutPanelLeft,
  furnish: Sofa,
  shop: ShoppingBag,
};

/**
 * The three design steps, Plan · Furnish · Shop, always in view (audit finding ED1). From tablet
 * width up they sit in the command bar. Phones have no room for them there, so the same nav
 * becomes a bar along the bottom of the screen, as in the phone mockups.
 */
export function CommandBarStepTabs({ dark, steps, focusFallbackStepId }: CommandBarStepTabsProps) {
  return (
    <nav aria-label="Design steps" data-testid="editor-design-steps" className={stepNavClass(dark)}>
      {steps.map((step) => {
        const StepIcon = STEP_ICONS[step.id];
        return (
          <button
            key={step.id}
            type="button"
            id={step.id === focusFallbackStepId ? GUEST_PROMPT_WORKFLOW_FALLBACK_ID : undefined}
            data-testid={step.testId}
            data-active={step.active ? "true" : "false"}
            aria-current={step.active ? "step" : undefined}
            aria-label={step.label}
            className={stepButtonClass(step.active, dark)}
            onClick={(event) => {
              // Keep focus on the step in every browser, so it survives the panel it replaces.
              event.currentTarget.focus();
              step.onSelect();
            }}
          >
            <StepIcon aria-hidden="true" className="h-5 w-5 md:hidden" />
            <span aria-hidden="true" className={stepNumberClass(step.active, dark)}>
              {step.number}
            </span>
            <span aria-hidden="true">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Phones: a bar fixed to the bottom of the screen. Tablets and up: a segmented control in the bar.
function stepNavClass(dark: boolean) {
  const shape =
    "fixed inset-x-0 bottom-0 z-50 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 gap-1 border-t p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:static md:inline-flex md:h-[30px] md:shrink-0 md:items-center md:gap-0.5 md:rounded-lg md:p-0.5";
  return `${shape} ${dark ? "designer-control md:border" : "border-neutral-200 bg-neutral-100 md:border-0"}`;
}

function stepButtonClass(active: boolean, dark: boolean) {
  const shape =
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold leading-none md:h-[26px] md:flex-row md:gap-1.5 md:rounded-md md:px-2 md:text-sm lg:px-2.5";
  if (dark) return `${shape} ${active ? "designer-control-active" : "designer-work-control"}`;
  return `${shape} ${
    active
      ? "bg-white text-neutral-950 shadow-sm"
      : "text-neutral-600 hover:bg-white/70 hover:text-neutral-900"
  }`;
}

// Wide screens show each step's number beside its name.
function stepNumberClass(active: boolean, dark: boolean) {
  const shape = "hidden h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold lg:inline-flex";
  if (dark) return `${shape} ${active ? "bg-white text-neutral-950" : "bg-white/20"}`;
  return `${shape} ${active ? "bg-neutral-900 text-white" : "bg-neutral-300 text-neutral-700"}`;
}
