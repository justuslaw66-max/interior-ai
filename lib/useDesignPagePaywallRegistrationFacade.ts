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

type WorkspaceDeferredBillingActions = Omit<
  LifecycleBillingActions,
  "replaceUrl" | "logFunnelEvent"
>;

export type DesignPagePaywallSearchParams = Pick<
  URLSearchParams,
  "get" | "toString"
>;

export type UseDesignPageWorkspaceDeferredPaywallRegistrationInput = {
  boundaries: { paywall: DesignPagePaywallTelemetryRegistration };
  navigation: DesignPagePaywallNavigation;
  searchParams: DesignPagePaywallSearchParams;
  state: {
    identity: Pick<LifecycleBilling["state"], "authenticated" | "designId">;
    route: Pick<LifecycleBilling["state"], "pathname">;
    billing: Pick<
      LifecycleBilling["state"],
      "upgradeReason" | "pricingLayoutVariant"
    >;
    telemetry: Pick<
      UseDesignPagePaywallTelemetryLifecycleInput["state"]["telemetry"],
      "mode"
    >;
    access: UseDesignPagePaywallTelemetryLifecycleInput["state"]["access"];
  };
  actions: {
    billing: WorkspaceDeferredBillingActions;
    lifecycle: UseDesignPagePaywallTelemetryLifecycleInput["actions"];
  };
};

/**
 * Adapts workspace-owned identity and UI state to the deferred billing slot.
 * Query keys stay here while the existing lifecycle wrapper retains router
 * identity and the callback/effect order used by billing synchronization.
 */
export function useDesignPageWorkspaceDeferredPaywallRegistration({
  boundaries: { paywall },
  navigation,
  searchParams,
  state,
  actions,
}: UseDesignPageWorkspaceDeferredPaywallRegistrationInput) {
  const { authenticated, designId } = state.identity;

  return useDesignPageDeferredPaywallLifecycle({
    navigation,
    billing: {
      state: {
        authenticated,
        designId,
        stripeSessionId: searchParams.get("session_id"),
        refreshPlanRequested:
          searchParams.get("refresh_plan") !== null,
        currentSearch: searchParams.toString(),
        pathname: state.route.pathname,
        upgradeReason: state.billing.upgradeReason,
        pricingLayoutVariant: state.billing.pricingLayoutVariant,
      },
      actions: {
        ...actions.billing,
        logFunnelEvent: paywall.actions.logFunnelEvent,
      },
      configuration: {
        paywallContextMeta: paywall.derived.paywallContextMeta,
      },
    },
    state: {
      telemetry: {
        designId,
        mode: state.telemetry.mode,
        isAuthenticated: authenticated,
      },
      access: state.access,
      synchronization: {
        paywallVariant: paywall.state.paywallVariant,
        pricingLayout: paywall.state.resolvedPricingLayout,
      },
      qa: {
        hooksEnabled: paywall.state.qaPaywallHooksEnabled,
        paywallOpenParam: searchParams.get("paywall_open"),
        plansOpenParam: searchParams.get("plans_open"),
      },
    },
    actions: actions.lifecycle,
  });
}
