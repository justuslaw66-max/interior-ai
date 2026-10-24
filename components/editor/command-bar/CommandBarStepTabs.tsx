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
 * Selects a step and keeps focus on it in every browser, so it survives the panel it replaces. A
 * modal over the page (the product drawer) keeps the bar inert until the switch closes it, so the
 * step takes focus once that has happened, if nothing else did (UX AX5).
 */
function selectStep(button: HTMLButtonElement, step: CommandBarStep) {
  button.focus();
  step.onSelect();
  window.requestAnimationFrame(() => {
    if (document.activeElement === document.body && button.isConnected) button.focus();
  });
}

/**
 * The three design steps, Plan · Furnish · Shop, always in view (audit finding ED1). From tablet
 * width up they sit in the command bar. Phones have no room for them there, so the same nav
 * becomes a bar along the bottom of the screen, as in the phone mockups.
 */
export function CommandBarStepTabs({ steps, focusFallbackStepId }: CommandBarStepTabsProps) {
  return (
    <nav aria-label="Design steps" data-testid="editor-design-steps" className={stepNavClass()}>
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
            className={stepButtonClass(step.active)}
            onClick={(event) => selectStep(event.currentTarget, step)}
          >
            <StepIcon aria-hidden="true" className="h-5 w-5 md:hidden" />
            <span aria-hidden="true" className={stepNumberClass(step.active)}>
              {step.number}
            </span>
            <span aria-hidden="true">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Phones: a bar fixed to the bottom of the screen, with the current step a raised card (in dark, a
// #1C1C1E bar and a #2C2C2E card: J, 24 Oct). From md: the centre of the bar, as a segmented control
// of 36px steps with the current one black, near-white in dark (UX 4c, the approved TopBar mockup).
function stepNavClass() {
  const shape =
    "fixed inset-x-0 bottom-0 z-50 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 gap-1 border-t p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:static md:inline-flex md:h-11 md:shrink-0 md:items-center md:gap-1 md:rounded-xl md:p-1";
  return `${shape} border-separator bg-surface-tab-bar md:border-0 md:bg-control-track`;
}

function stepButtonClass(active: boolean) {
  const shape =
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold leading-none md:h-9 md:flex-row md:gap-2 md:rounded-[9px] md:px-3 md:text-sm md:font-bold xl:pl-2.5 xl:pr-4";
  return `${shape} ${
    active
      ? "bg-surface-floating text-label shadow-sm md:bg-control-primary md:text-control-on-primary md:shadow-none"
      : "text-label-secondary hover:bg-control-track-hover hover:text-label md:text-control-label-idle"
  }`;
}

// From xl each step shows its number beside its name.
function stepNumberClass(active: boolean) {
  const shape = "hidden h-5 w-5 items-center justify-center rounded-full text-xs font-bold xl:inline-flex";
  return `${shape} ${active ? "bg-control-on-primary text-control-primary" : "bg-control-badge text-control-label-idle"}`;
}
