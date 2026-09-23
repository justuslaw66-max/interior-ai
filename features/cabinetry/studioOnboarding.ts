export type CabinetGuidedStepId =
  | "type"
  | "space"
  | "size"
  | "layout"
  | "style"
  | "review";

export type CabinetStudioExperience = "guided" | "detailed";

export interface CabinetPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CabinetOnboardingAction {
  id: "template" | "dimensions" | "module" | "place" | "reopen";
  order: 1 | 2 | 3 | 4 | 5;
  guidedStep: "type" | "size" | "layout" | "review";
  title: string;
  description: string;
}

export const CABINET_ONBOARDING_STORAGE_KEY =
  "interior-ai:millwork-onboarding-dismissed:v1";
export const CABINET_EXPERIENCE_STORAGE_KEY =
  "interior-ai:millwork-experience:v1";

/**
 * The deliberately small first-use curriculum from the product specification.
 * Keep this list limited to the five essential actions; feature-level help stays
 * beside the relevant control instead of growing into an up-front tour.
 */
export const CABINET_ONBOARDING_ACTIONS = [
  {
    id: "template",
    order: 1,
    guidedStep: "type",
    title: "Choose a template",
    description:
      "Pick the visual starting point closest to what you need. Every choice remains editable.",
  },
  {
    id: "dimensions",
    order: 2,
    guidedStep: "size",
    title: "Change dimensions",
    description:
      "Enter the available width, height, and depth. The model updates from the same measurements.",
  },
  {
    id: "module",
    order: 3,
    guidedStep: "layout",
    title: "Edit a module",
    description:
      "Select a bay to change its doors, drawers, shelves, or width without rebuilding the assembly.",
  },
  {
    id: "place",
    order: 4,
    guidedStep: "review",
    title: "Place it into the room",
    description:
      "Resolve any blocking issue, then use Place in plan to add the generated assembly to the room.",
  },
  {
    id: "reopen",
    order: 5,
    guidedStep: "review",
    title: "Reopen it later",
    description:
      "Select the placed millwork in the room and edit it again; its parametric definition stays attached.",
  },
] as const satisfies readonly CabinetOnboardingAction[];

export function getCabinetOnboardingActionsForStep(
  step: CabinetGuidedStepId
): readonly CabinetOnboardingAction[] {
  return CABINET_ONBOARDING_ACTIONS.filter(
    (action) => action.guidedStep === step
  );
}

export function isCabinetOnboardingDismissed(
  storage: CabinetPreferenceStorage | null | undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(CABINET_ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissCabinetOnboarding(
  storage: CabinetPreferenceStorage | null | undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(CABINET_ONBOARDING_STORAGE_KEY, "true");
  } catch {
    // Storage is optional; the caller still keeps the guidance hidden in memory.
  }
}

export function readCabinetExperiencePreference(
  storage: CabinetPreferenceStorage | null | undefined
): CabinetStudioExperience | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(CABINET_EXPERIENCE_STORAGE_KEY);
    return value === "guided" || value === "detailed" ? value : null;
  } catch {
    return null;
  }
}

export function writeCabinetExperiencePreference(
  storage: CabinetPreferenceStorage | null | undefined,
  experience: CabinetStudioExperience
): void {
  if (!storage) return;
  try {
    storage.setItem(CABINET_EXPERIENCE_STORAGE_KEY, experience);
  } catch {
    // The chosen workspace still applies to this mounted Studio instance.
  }
}
