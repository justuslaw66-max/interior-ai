"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { track } from "@/lib/analytics";
import type { FunnelEventName, PricingLayoutVariant } from "@/lib/design-page-paywall";
import type { Plan } from "@/lib/plan";

type UpgradeReason = "designer" | "export_images" | "export_pdf" | null;
type CheckoutInterval = "monthly" | "yearly";

type DesignPageBillingState = {
  authenticated: boolean;
  designId: string | null;
  stripeSessionId: string | null;
  refreshPlanRequested: boolean;
  currentSearch: string;
  pathname: string;
  upgradeReason: UpgradeReason;
  pricingLayoutVariant: PricingLayoutVariant;
};

type DesignPageBillingActions = {
  setPlan: Dispatch<SetStateAction<Plan>>;
  setShowUpgrade: Dispatch<SetStateAction<boolean>>;
  setUpgradeReason: Dispatch<SetStateAction<UpgradeReason>>;
  setShowPlans: Dispatch<SetStateAction<boolean>>;
  requestSignIn: () => void;
  replaceUrl: (url: string) => void;
  showToast: (message: string) => void;
  logFunnelEvent: (eventType: FunnelEventName, meta?: Record<string, unknown>) => void;
};

export function useDesignPageBilling({
  state,
  actions,
  configuration,
}: {
  state: DesignPageBillingState;
  actions: DesignPageBillingActions;
  configuration: { paywallContextMeta: Record<string, unknown> };
}) {
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const {
    authenticated,
    designId,
    stripeSessionId,
    refreshPlanRequested,
    currentSearch,
    pathname,
    upgradeReason,
    pricingLayoutVariant,
  } = state;
  const {
    setPlan,
    setShowUpgrade,
    setUpgradeReason,
    setShowPlans,
    requestSignIn,
    replaceUrl,
    showToast,
    logFunnelEvent,
  } = actions;
  const { paywallContextMeta } = configuration;

  const cleanUrlParameter = useCallback(
    (name: string) => {
      const parameters = new URLSearchParams(currentSearch);
      parameters.delete(name);
      const query = parameters.toString();
      replaceUrl(query ? `${pathname}?${query}` : pathname);
    },
    [currentSearch, pathname, replaceUrl]
  );

  const refreshPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/me");
      const data = await response.json().catch(() => ({}));
      const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
      setPlan(nextPlan);
      if (nextPlan === "pro") {
        setShowUpgrade(false);
        setUpgradeReason(null);
      }
      showToast(`Plan status: ${nextPlan === "pro" ? "Pro" : "Free"}`);
      track("plan_refreshed", { plan: nextPlan });
    } catch {
      showToast("Failed to refresh plan status");
      setPlan("free");
    }
  }, [
    setPlan,
    setShowUpgrade,
    setUpgradeReason,
    showToast,
  ]);

  const openBillingPortal = useCallback(async () => {
    if (!authenticated) {
      requestSignIn();
      return;
    }
    if (openingBillingPortal) return;

    setOpeningBillingPortal(true);
    try {
      showToast("Opening billing portal...");
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) {
        const message = data?.error || "Unable to open billing portal. Please try again.";
        showToast(message);
        console.warn("Portal request failed:", message);
        return;
      }
      window.location.href = data.url as string;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open billing portal";
      showToast(message);
      console.warn("Billing portal request failed:", error);
    } finally {
      setOpeningBillingPortal(false);
    }
  }, [authenticated, openingBillingPortal, requestSignIn, showToast]);

  const startCheckout = useCallback(
    async (interval: CheckoutInterval = "monthly") => {
      if (!authenticated) {
        requestSignIn();
        return;
      }

      setStartingCheckout(true);
      try {
        const analytics = {
          source: "upgrade_modal",
          interval,
          reason: upgradeReason ?? "unknown",
          ...paywallContextMeta,
        };
        track("checkout_started", { ...analytics, design_id: designId ?? null });
        logFunnelEvent("checkout_started", analytics);
        showToast("Opening checkout...");
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data?.error || "Unable to start checkout right now.";
          showToast(message);
          console.warn("Checkout request failed:", message);
          return;
        }
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        showToast("No checkout URL returned. Please try again.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to start checkout right now.";
        console.warn("Failed to start checkout:", error);
        showToast(message);
      } finally {
        setStartingCheckout(false);
      }
    },
    [
      authenticated,
      designId,
      logFunnelEvent,
      paywallContextMeta,
      requestSignIn,
      showToast,
      upgradeReason,
    ]
  );

  const openPlansFromUpgrade = useCallback(() => {
    const analytics = {
      source: "upgrade_modal",
      cta: "see_plans",
      reason: upgradeReason || "unknown",
      cta_position: "primary",
      ...paywallContextMeta,
    };
    track("upgrade_clicked", analytics);
    logFunnelEvent("upgrade_clicked", analytics);
    setShowPlans(true);
  }, [logFunnelEvent, paywallContextMeta, setShowPlans, upgradeReason]);

  const signInFromUpgrade = useCallback(() => {
    const analytics = {
      source: "upgrade_modal",
      cta: "sign_in_google",
      reason: upgradeReason || "unknown",
      cta_position: "secondary",
      ...paywallContextMeta,
    };
    track("upgrade_clicked", analytics);
    logFunnelEvent("upgrade_clicked", analytics);
    track("upgrade_prompt_clicked", { reason: upgradeReason || "unknown" });
    requestSignIn();
  }, [logFunnelEvent, paywallContextMeta, requestSignIn, upgradeReason]);

  const closeUpgradeDialog = useCallback(() => {
    setShowUpgrade(false);
    setUpgradeReason(null);
  }, [setShowUpgrade, setUpgradeReason]);

  const closePlansDialog = useCallback(() => setShowPlans(false), [setShowPlans]);

  const manageBillingFromPlans = useCallback(() => {
    setShowPlans(false);
    void openBillingPortal();
  }, [openBillingPortal, setShowPlans]);

  const startCheckoutFromPlans = useCallback(
    (interval: CheckoutInterval) => {
      setShowPlans(false);
      const intervalIsPrimaryLeft =
        pricingLayoutVariant === "annual_highlight"
          ? interval === "yearly"
          : interval === "monthly";
      const analytics = {
        source: "plans_sheet",
        cta: interval,
        reason: upgradeReason || "unknown",
        cta_position: intervalIsPrimaryLeft
          ? "plans_primary_left"
          : "plans_primary_right",
        ...paywallContextMeta,
      };
      track("upgrade_clicked", analytics);
      logFunnelEvent("upgrade_clicked", analytics);
      void startCheckout(interval);
    },
    [
      logFunnelEvent,
      paywallContextMeta,
      pricingLayoutVariant,
      setShowPlans,
      startCheckout,
      upgradeReason,
    ]
  );

  useEffect(() => {
    void refreshPlan();
  }, [refreshPlan]);

  useEffect(() => {
    if (!stripeSessionId) return;
    let alive = true;
    const syncPlanAfterCheckout = async () => {
      try {
        const response = await fetch("/api/me");
        const data = await response.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        if (nextPlan === "pro") setShowUpgrade(false);
      } catch {
        return;
      } finally {
        cleanUrlParameter("session_id");
      }
    };
    void syncPlanAfterCheckout();
    return () => {
      alive = false;
    };
  }, [cleanUrlParameter, setPlan, setShowUpgrade, stripeSessionId]);

  useEffect(() => {
    if (!refreshPlanRequested) return;
    let alive = true;
    const syncPlanAfterPortal = async () => {
      try {
        const response = await fetch("/api/me");
        const data = await response.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        showToast(
          nextPlan === "pro"
            ? "Plan updated! You now have Pro access."
            : "Plan information refreshed."
        );
      } catch {
        console.warn("Failed to sync plan after portal return");
      } finally {
        if (alive) cleanUrlParameter("refresh_plan");
      }
    };
    void syncPlanAfterPortal();
    return () => {
      alive = false;
    };
  }, [cleanUrlParameter, refreshPlanRequested, setPlan, showToast]);

  return {
    state: { startingCheckout, openingBillingPortal },
    actions: {
      refreshPlan,
      openBillingPortal,
      startCheckout,
      openPlansFromUpgrade,
      signInFromUpgrade,
      closeUpgradeDialog,
      closePlansDialog,
      manageBillingFromPlans,
      startCheckoutFromPlans,
    },
  };
}
