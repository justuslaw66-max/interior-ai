"use client";

import {
  useDesignPageOnboarding,
  type UseDesignPageOnboardingOptions,
} from "@/lib/useDesignPageOnboarding";

export type UseDesignPageOnboardingRegistrationFacadeInput =
  UseDesignPageOnboardingOptions;

export type DesignPageOnboardingRegistration = {
  state: ReturnType<typeof useDesignPageOnboarding>["state"];
};

/** Keeps onboarding effects in their established late workspace slot. */
export function useDesignPageOnboardingRegistrationFacade({
  state,
  actions,
  configuration,
}: UseDesignPageOnboardingRegistrationFacadeInput): DesignPageOnboardingRegistration {
  const { state: onboardingState } = useDesignPageOnboarding({
    state,
    actions,
    configuration,
  });

  return { state: onboardingState };
}
