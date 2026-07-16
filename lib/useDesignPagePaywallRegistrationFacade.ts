"use client";

import { useCallback } from "react";

import {
  useDesignPagePaywallTelemetryController,
  type UseDesignPagePaywallTelemetryControllerInput,
} from "@/lib/useDesignPagePaywallTelemetryController";
import {
  useDesignPagePaywallTelemetryLifecycle,
  type UseDesignPagePaywallTelemetryLifecycleInput,
} from "@/lib/useDesignPagePaywallTelemetryLifecycle";

export type UseDesignPagePaywallTelemetryRegistrationInput =
  UseDesignPagePaywallTelemetryControllerInput;

export type DesignPagePaywallTelemetryRegistration = ReturnType<
  typeof useDesignPagePaywallTelemetryController
>;

/** Registers the early telemetry controller at its existing workspace slot. */
export function useDesignPagePaywallTelemetryRegistration(
  input: UseDesignPagePaywallTelemetryRegistrationInput
): DesignPagePaywallTelemetryRegistration {
  return useDesignPagePaywallTelemetryController(input);
}

export type UseDesignPageWorkspacePaywallRegistrationInput = Omit<
  UseDesignPagePaywallTelemetryRegistrationInput,
  "configuration"
>;

/** Adapts workspace state to early telemetry while owning environment reads. */
export function useDesignPageWorkspacePaywallRegistration(
  input: UseDesignPageWorkspacePaywallRegistrationInput
): DesignPagePaywallTelemetryRegistration {
  return useDesignPagePaywallTelemetryRegistration({
    ...input,
    configuration: {
      environment: {
        nodeEnv: process.env.NODE_ENV,
        enableQaHooks: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS,
        paywallWinnerDefault:
          process.env.NEXT_PUBLIC_PAYWALL_WINNER_DEFAULT,
        paywallFallbackVariant:
          process.env.NEXT_PUBLIC_PAYWALL_FALLBACK_VARIANT,
        paywallForceFallback:
          process.env.NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK,
        paywallExperimentSlot:
          process.env.NEXT_PUBLIC_PAYWALL_EXPERIMENT_SLOT,
      },
    },
  });
}

type LifecycleBilling =
  UseDesignPagePaywallTelemetryLifecycleInput["billing"];
type LifecycleBillingActions = LifecycleBilling["actions"];

export type DesignPagePaywallNavigation = {
  replace: (url: string, options: { scroll: false }) => void;
};

export type UseDesignPageDeferredPaywallLifecycleInput = {
  navigation: DesignPagePaywallNavigation;
  billing: Omit<LifecycleBilling, "actions"> & {
    actions: Omit<LifecycleBillingActions, "replaceUrl">;
  };
  state: UseDesignPagePaywallTelemetryLifecycleInput["state"];
  actions: UseDesignPagePaywallTelemetryLifecycleInput["actions"];
};

/**
 * Registers the late billing/paywall lifecycle at its existing workspace slot.
 * The URL adapter intentionally stays immediately before the lifecycle hook so
 * its hook and effect ordering remains unchanged.
 */
export function useDesignPageDeferredPaywallLifecycle({
  navigation,
  billing,
  state,
  actions,
}: UseDesignPageDeferredPaywallLifecycleInput) {
  const replaceDesignUrl = useCallback(
    (url: string) => navigation.replace(url, { scroll: false }),
    [navigation]
  );

  return useDesignPagePaywallTelemetryLifecycle({
    billing: {
      ...billing,
      actions: { ...billing.actions, replaceUrl: replaceDesignUrl },
    },
    state,
    actions,
  });
}
