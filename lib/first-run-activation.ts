export type FirstRunActivationStepId =
  | "choose_template"
  | "add_or_adjust_item"
  | "save_design"
  | "share_or_export";

export type FirstRunActivationStep = {
  id: FirstRunActivationStepId;
  label: string;
  complete: boolean;
};

export type FirstRunActivationState = {
  steps: FirstRunActivationStep[];
  complete: boolean;
  nextStep: FirstRunActivationStep | null;
  progressPercent: number;
};

export function buildFirstRunActivationState(input: {
  templateChosen: boolean;
  itemCount: number;
  saveState: "idle" | "saving" | "saved" | "failed";
  shareToken?: string | null;
  exportOpened?: boolean;
}): FirstRunActivationState {
  const steps: FirstRunActivationStep[] = [
    {
      id: "choose_template",
      label: "Choose a template",
      complete: input.templateChosen,
    },
    {
      id: "add_or_adjust_item",
      label: "Add or adjust an item",
      complete: input.itemCount > 0,
    },
    {
      id: "save_design",
      label: "Save the design",
      complete: input.saveState === "saved",
    },
    {
      id: "share_or_export",
      label: "Share or export",
      complete: Boolean(input.shareToken || input.exportOpened),
    },
  ];
  const completeCount = steps.filter((step) => step.complete).length;

  return {
    steps,
    complete: completeCount === steps.length,
    nextStep: steps.find((step) => !step.complete) ?? null,
    progressPercent: Math.round((completeCount / steps.length) * 100),
  };
}
