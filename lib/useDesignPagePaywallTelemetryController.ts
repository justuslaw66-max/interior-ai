"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { getAnonId } from "@/lib/anon";
import { track, trackProductEvent } from "@/lib/analytics";
import {
  ANNUAL_PLAN_SAVINGS_LABEL,
  buildPaywallContextMeta,
  getPaywallExperimentEnvConfig,
  getPrimaryUpgradeCtaLabel,
  resolvePaywallVariant,
  resolvePricingLayoutVariant,
  type FunnelEventName,
  type PaywallExperimentSlot,
  type PricingLayoutVariant,
  type UpgradeCtaVariant,
} from "@/lib/design-page-paywall";
import type { DesignItem } from "@/lib/room-types";

export type DesignPageUpgradeReason =
  | "designer"
  | "export_images"
  | "export_pdf"
  | null;

type PaywallEnvironment = Parameters<
  typeof getPaywallExperimentEnvConfig
>[0];

export type UseDesignPagePaywallTelemetryControllerInput = {
  state: {
    identity: {
      designId: string | null;
      shareToken: string | null;
      userId: string | null;
    };
    paywall: {
      variantOverride: string | null;
      upgradeReason: DesignPageUpgradeReason;
      ctaVariant: UpgradeCtaVariant;
      pricingLayout: PricingLayoutVariant;
    };
    editor: {
      canUseDesigner: boolean;
      simplePlanControls: boolean;
      mode: "homeowner" | "designer";
      isAuthenticated: boolean;
    };
    navigation: { currentSearch: string; pathname: string };
  };
  refs: { items: MutableRefObject<DesignItem[]> };
  actions: {
    setSimplePlanControls: Dispatch<SetStateAction<boolean>>;
    replaceUrl: (url: string) => void;
  };
  configuration: { environment: PaywallEnvironment };
};

export type DesignPageUpgradeDialogCopy = {
  description: string;
  exportWorkflowBenefit: string;
  pricingGuidance: string;
};

export function buildDesignPageUpgradeDialogCopy({
  reason,
  experimentSlot,
}: {
  reason: DesignPageUpgradeReason;
  experimentSlot: PaywallExperimentSlot;
}): DesignPageUpgradeDialogCopy {
  const description =
    reason === "export_images"
      ? "Free gives you a preview. Pro unlocks clean HD room images, multiple camera angles, and presentation-ready exports."
      : reason === "export_pdf"
        ? "Free includes a watermarked one-page preview. Pro unlocks clean PDFs, room summaries, and client-ready export packs."
        : reason === "designer"
          ? "Designer mode, presentation tools, and polished export workflows are available on the Pro plan."
          : "Unlock clean exports, designer tools, and a faster client presentation workflow.";

  return {
    description,
    exportWorkflowBenefit:
      experimentSlot === "value_stack_v2"
        ? "Client-ready exports in minutes with less manual formatting"
        : "Room summaries and smoother designer workflow",
    pricingGuidance:
      experimentSlot === "value_stack_v2"
        ? "Teams with weekly client reviews usually recover yearly pricing within the first month."
        : "Use yearly if you expect to export for more than 2 active projects this quarter.",
  };
}

/** Owns early paywall resolution and the stable app-event transport. */
export function useDesignPagePaywallTelemetryController({
  state,
  refs,
  actions,
  configuration,
}: UseDesignPagePaywallTelemetryControllerInput) {
  const { setSimplePlanControls, replaceUrl } = actions;
  useEffect(() => {
    if (!state.editor.canUseDesigner && !state.editor.simplePlanControls) {
      setSimplePlanControls(true);
    }
  }, [
    setSimplePlanControls,
    state.editor.canUseDesigner,
    state.editor.simplePlanControls,
  ]);

  const firstInteractionRef = useRef(false);
  const designStartedTrackedRef = useRef(false);
  const {
    nodeEnv,
    enableQaHooks,
    paywallWinnerDefault: configuredPaywallWinnerDefault,
    paywallFallbackVariant: configuredPaywallFallbackVariant,
    paywallForceFallback: configuredPaywallForceFallback,
    paywallExperimentSlot: configuredPaywallExperimentSlot,
  } = configuration.environment;
  const environment = useMemo(
    () =>
      getPaywallExperimentEnvConfig({
        nodeEnv,
        enableQaHooks,
        paywallWinnerDefault: configuredPaywallWinnerDefault,
        paywallFallbackVariant: configuredPaywallFallbackVariant,
        paywallForceFallback: configuredPaywallForceFallback,
        paywallExperimentSlot: configuredPaywallExperimentSlot,
      }),
    [
      configuredPaywallExperimentSlot,
      configuredPaywallFallbackVariant,
      configuredPaywallForceFallback,
      configuredPaywallWinnerDefault,
      enableQaHooks,
      nodeEnv,
    ]
  );
  const {
    qaPaywallHooksEnabled,
    paywallForceFallback,
    paywallExperimentSlot,
  } = environment;
  const { identity, paywall } = state;

  const paywallVariant = useMemo(() => {
    if (typeof window === "undefined") {
      return "unlock_pro_exports" as UpgradeCtaVariant;
    }
    return resolvePaywallVariant({
      qaPaywallHooksEnabled: environment.qaPaywallHooksEnabled,
      paywallVariantOverride: paywall.variantOverride,
      storageVariantOverride: window.localStorage.getItem(
        "paywall_variant_override"
      ),
      paywallForceFallback: environment.paywallForceFallback,
      paywallFallbackVariant: environment.paywallFallbackVariant,
      paywallWinnerDefault: environment.paywallWinnerDefault,
      seed: identity.userId ?? identity.designId ?? getAnonId(),
    });
  }, [
    environment,
    identity.designId,
    identity.userId,
    paywall.variantOverride,
  ]);

  const resolvedPricingLayout = useMemo<PricingLayoutVariant>(() => {
    return resolvePricingLayoutVariant(paywallVariant);
  }, [paywallVariant]);

  const logFunnelEvent = useCallback(
    (eventType: FunnelEventName, meta?: Record<string, unknown>) => {
      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          designId: identity.designId,
          shareToken: identity.shareToken,
          meta,
        }),
      }).catch(() => undefined);
    },
    [identity.designId, identity.shareToken]
  );

  const trackFirstInteraction = useCallback(() => {
    if (firstInteractionRef.current) return;
    track("editor_first_interaction", {
      design_id: identity.designId ?? null,
      items_count: refs.items.current.length,
      room_type: "living_room",
      mode: state.editor.mode,
      is_guest: !state.editor.isAuthenticated,
    });

    if (!designStartedTrackedRef.current) {
      track("design_started", {
        design_id: identity.designId ?? null,
        mode: state.editor.mode,
        is_guest: !state.editor.isAuthenticated,
      });
      trackProductEvent("project_started", {
        mode: state.editor.mode === "designer" ? "pro" : "consumer",
        itemCount: refs.items.current.length,
        firstInSession: true,
      });
      logFunnelEvent("design_started", {
        mode: state.editor.mode,
        is_guest: !state.editor.isAuthenticated,
      });
      designStartedTrackedRef.current = true;
    }

    firstInteractionRef.current = true;
  }, [
    identity.designId,
    logFunnelEvent,
    refs.items,
    state.editor.isAuthenticated,
    state.editor.mode,
  ]);

  const setUrlMode = (nextMode: "designer" | "homeowner") => {
    const parameters = new URLSearchParams(state.navigation.currentSearch);
    if (nextMode === "designer") {
      parameters.set("mode", "designer");
    } else {
      parameters.delete("mode");
    }
    const query = parameters.toString();
    replaceUrl(
      query ? `${state.navigation.pathname}?${query}` : state.navigation.pathname
    );
  };

  const upgradeCopy = buildDesignPageUpgradeDialogCopy({
    reason: paywall.upgradeReason,
    experimentSlot: paywallExperimentSlot,
  });

  return {
    state: {
      qaPaywallHooksEnabled,
      paywallVariant,
      resolvedPricingLayout,
    },
    derived: {
      primaryUpgradeCtaLabel: getPrimaryUpgradeCtaLabel(paywall.ctaVariant),
      annualPlanSavingsLabel: ANNUAL_PLAN_SAVINGS_LABEL,
      upgradeDialogDescription: upgradeCopy.description,
      upgradeDialogExportWorkflowBenefit: upgradeCopy.exportWorkflowBenefit,
      upgradeDialogPricingGuidance: upgradeCopy.pricingGuidance,
      paywallContextMeta: buildPaywallContextMeta({
        ctaVariant: paywall.ctaVariant,
        pricingLayout: paywall.pricingLayout,
        experimentSlot: paywallExperimentSlot,
        forceFallback: paywallForceFallback,
      }),
    },
    configuration: { environment },
    actions: { logFunnelEvent, trackFirstInteraction, setUrlMode },
  };
}
