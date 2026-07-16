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
