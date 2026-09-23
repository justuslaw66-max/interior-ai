"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import { track } from "@/lib/analytics";
import type {
  PricingLayoutVariant,
  UpgradeCtaVariant,
} from "@/lib/design-page-paywall";
import { useDesignPageBilling } from "@/lib/useDesignPageBilling";

type BillingInput = Parameters<typeof useDesignPageBilling>[0];
type EditorAudienceMode = "homeowner" | "designer";

export type UseDesignPagePaywallTelemetryLifecycleInput = {
  billing: BillingInput;
  state: {
    telemetry: {
      designId: string | null;
      mode: EditorAudienceMode;
      isAuthenticated: boolean;
    };
    access: {
      wantsDesigner: boolean;
      canUseDesigner: boolean;
      showUpgrade: boolean;
    };
    synchronization: {
      paywallVariant: UpgradeCtaVariant;
      pricingLayout: PricingLayoutVariant;
    };
    qa: {
      hooksEnabled: boolean;
      paywallOpenParam: string | null;
      plansOpenParam: string | null;
    };
  };
  actions: {
    setMode: Dispatch<SetStateAction<EditorAudienceMode>>;
    setUpgradeCtaVariant: Dispatch<SetStateAction<UpgradeCtaVariant>>;
    setPricingLayoutVariant: Dispatch<SetStateAction<PricingLayoutVariant>>;
  };
};

/**
 * Composes billing with the late paywall/telemetry effects. The effect order in
 * this hook intentionally mirrors the former workspace registration order.
 */
export function useDesignPagePaywallTelemetryLifecycle({
  billing,
  state,
  actions,
}: UseDesignPagePaywallTelemetryLifecycleInput) {
  const {
    setMode,
    setUpgradeCtaVariant,
    setPricingLayoutVariant,
  } = actions;
  const editorOpenedRef = useRef(false);
  const landingTrackedRef = useRef(false);
  const designerAttemptRef = useRef(false);
  const upgradeShownRef = useRef(false);
  const billingController = useDesignPageBilling(billing);
  const { designId, mode, isAuthenticated } = state.telemetry;
  const { wantsDesigner, canUseDesigner, showUpgrade } = state.access;
  const { paywallVariant, pricingLayout } = state.synchronization;
  const { hooksEnabled, paywallOpenParam, plansOpenParam } = state.qa;
  const {
    setShowUpgrade,
    setUpgradeReason,
    setShowPlans,
    logFunnelEvent,
  } = billing.actions;

  useEffect(() => {
    if (editorOpenedRef.current) return;
    track("editor_opened", {
      design_id: designId ?? null,
      room_type: "living_room",
      mode,
      is_guest: !isAuthenticated,
    });
    editorOpenedRef.current = true;
  }, [designId, isAuthenticated, mode]);

  useEffect(() => {
    if (landingTrackedRef.current) return;
    track("landing_viewed", {
      design_id: designId ?? null,
      mode,
      is_guest: !isAuthenticated,
    });
    logFunnelEvent("landing_viewed", {
      mode,
      is_guest: !isAuthenticated,
    });
    landingTrackedRef.current = true;
  }, [designId, isAuthenticated, logFunnelEvent, mode]);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      const key = "ph_guest_started";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      track("guest_session_start", { is_guest: true });
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!wantsDesigner) return;
    if (!canUseDesigner) {
      if (!designerAttemptRef.current) {
        track("mode_designer_attempted", { is_pro: false });
        designerAttemptRef.current = true;
      }
      setShowUpgrade(true);
      setMode("homeowner");
      return;
    }
    setMode("designer");
  }, [
    canUseDesigner,
    setMode,
    setShowUpgrade,
    wantsDesigner,
  ]);

  useEffect(() => {
    if (!showUpgrade) {
      upgradeShownRef.current = false;
      return;
    }
    if (upgradeShownRef.current) return;
    track("upgrade_prompt_shown", { reason: "mode_designer" });
    upgradeShownRef.current = true;
  }, [showUpgrade]);

  useEffect(() => {
    setUpgradeCtaVariant(paywallVariant);
  }, [paywallVariant, setUpgradeCtaVariant]);

  useEffect(() => {
    setPricingLayoutVariant(pricingLayout);
  }, [pricingLayout, setPricingLayoutVariant]);

  useEffect(() => {
    if (!hooksEnabled) return;
    if (paywallOpenParam !== "1") return;
    setUpgradeReason((current) => current ?? "designer");
    setShowUpgrade(true);
  }, [hooksEnabled, paywallOpenParam, setShowUpgrade, setUpgradeReason]);

  useEffect(() => {
    if (!hooksEnabled) return;
    if (plansOpenParam !== "1") return;
    setShowPlans(true);
  }, [hooksEnabled, plansOpenParam, setShowPlans]);

  return billingController;
}
