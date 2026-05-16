export type FunnelEventName =
  | "landing_viewed"
  | "design_started"
  | "first_item_added"
  | "third_item_added"
  | "export_clicked"
  | "upgrade_clicked"
  | "checkout_started";

export type UpgradeCtaVariant = "unlock_pro_exports" | "see_pricing";

export type PricingLayoutVariant = "default" | "annual_highlight";

export type PaywallExperimentSlot = "control" | "value_stack_v2";

export type PaywallContextMeta = {
  cta_variant: UpgradeCtaVariant;
  pricing_layout: PricingLayoutVariant;
  experiment_slot: PaywallExperimentSlot;
  force_fallback: boolean;
};

export type PaywallExperimentEnvConfig = {
  qaPaywallHooksEnabled: boolean;
  paywallWinnerDefault: UpgradeCtaVariant | null;
  paywallFallbackVariant: UpgradeCtaVariant;
  paywallForceFallback: boolean;
  paywallExperimentSlot: PaywallExperimentSlot;
};

export const ANNUAL_PLAN_SAVINGS_LABEL = "Best value: yearly plan saves 20%";

export const hashStringToVariant = (value: string): UpgradeCtaVariant => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 2 === 0 ? "unlock_pro_exports" : "see_pricing";
};

export const normalizeUpgradeVariant = (value: string | null): UpgradeCtaVariant | null => {
  if (value === "unlock_pro_exports" || value === "see_pricing") return value;
  return null;
};

export const normalizeExperimentSlot = (value: string | null): PaywallExperimentSlot => {
  if (value === "value_stack_v2") return "value_stack_v2";
  return "control";
};

const isTruthyEnvFlag = (value: string | undefined): boolean => value === "1" || value === "true";

export const getPaywallExperimentEnvConfig = (params: {
  nodeEnv: string | undefined;
  enableQaHooks: string | undefined;
  paywallWinnerDefault: string | undefined;
  paywallFallbackVariant: string | undefined;
  paywallForceFallback: string | undefined;
  paywallExperimentSlot: string | undefined;
}): PaywallExperimentEnvConfig => {
  const qaPaywallHooksEnabled =
    params.nodeEnv !== "production" || isTruthyEnvFlag(params.enableQaHooks);
  const paywallWinnerDefault = normalizeUpgradeVariant(params.paywallWinnerDefault ?? null);
  const paywallFallbackVariant =
    normalizeUpgradeVariant(params.paywallFallbackVariant ?? null) ?? "unlock_pro_exports";
  const paywallForceFallback = isTruthyEnvFlag(params.paywallForceFallback);
  const paywallExperimentSlot = normalizeExperimentSlot(params.paywallExperimentSlot ?? null);

  return {
    qaPaywallHooksEnabled,
    paywallWinnerDefault,
    paywallFallbackVariant,
    paywallForceFallback,
    paywallExperimentSlot,
  };
};

export const resolvePaywallVariant = (params: {
  qaPaywallHooksEnabled: boolean;
  paywallVariantOverride: string | null;
  storageVariantOverride: string | null;
  paywallForceFallback: boolean;
  paywallFallbackVariant: UpgradeCtaVariant;
  paywallWinnerDefault: UpgradeCtaVariant | null;
  seed: string;
}): UpgradeCtaVariant => {
  const override = params.qaPaywallHooksEnabled
    ? normalizeUpgradeVariant(params.paywallVariantOverride) ?? normalizeUpgradeVariant(params.storageVariantOverride)
    : null;
  if (override) return override;
  if (params.paywallForceFallback) return params.paywallFallbackVariant;
  if (params.paywallWinnerDefault) return params.paywallWinnerDefault;
  return hashStringToVariant(params.seed);
};

export const resolvePricingLayoutVariant = (
  paywallVariant: UpgradeCtaVariant,
): PricingLayoutVariant => {
  return paywallVariant === "see_pricing" ? "annual_highlight" : "default";
};

export const getPrimaryUpgradeCtaLabel = (upgradeCtaVariant: UpgradeCtaVariant): string => {
  return upgradeCtaVariant === "see_pricing" ? "See pricing" : "Unlock Pro exports";
};

export const buildPaywallContextMeta = (params: {
  ctaVariant: UpgradeCtaVariant;
  pricingLayout: PricingLayoutVariant;
  experimentSlot: PaywallExperimentSlot;
  forceFallback: boolean;
}): PaywallContextMeta => {
  return {
    cta_variant: params.ctaVariant,
    pricing_layout: params.pricingLayout,
    experiment_slot: params.experimentSlot,
    force_fallback: params.forceFallback,
  };
};
