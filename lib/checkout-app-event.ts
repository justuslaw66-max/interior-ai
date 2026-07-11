import type {
  PaywallExperimentSlot,
  PricingLayoutVariant,
  UpgradeCtaVariant,
} from "@/lib/design-page-paywall";

export type CheckoutTrackingContext = {
  interval: "monthly" | "yearly";
  source: "plans_sheet" | "upgrade_modal";
  designId: string | null;
  reason: string;
  ctaVariant: UpgradeCtaVariant | null;
  pricingLayout: PricingLayoutVariant | null;
  experimentSlot: PaywallExperimentSlot | null;
  forceFallback: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function normalizeCheckoutTrackingContext(input: unknown): CheckoutTrackingContext {
  const body = asRecord(input);
  const ctaVariant =
    body.ctaVariant === "unlock_pro_exports" || body.ctaVariant === "see_pricing"
      ? body.ctaVariant
      : null;
  const pricingLayout =
    body.pricingLayout === "default" || body.pricingLayout === "annual_highlight"
      ? body.pricingLayout
      : null;
  const experimentSlot =
    body.experimentSlot === "control" || body.experimentSlot === "value_stack_v2"
      ? body.experimentSlot
      : null;

  return {
    interval: body.interval === "yearly" ? "yearly" : "monthly",
    source: body.source === "plans_sheet" ? "plans_sheet" : "upgrade_modal",
    designId: boundedString(body.designId, 128),
    reason: boundedString(body.reason, 80) ?? "unknown",
    ctaVariant,
    pricingLayout,
    experimentSlot,
    forceFallback: body.forceFallback === true,
  };
}

export function buildCheckoutStartedEventMeta(input: {
  tracking: CheckoutTrackingContext;
  priceId: string;
  sessionId: string;
}) {
  return {
    provider: "stripe",
    priceId: input.priceId,
    sessionId: input.sessionId,
    interval: input.tracking.interval,
    source: input.tracking.source,
    designId: input.tracking.designId,
    reason: input.tracking.reason,
    cta_variant: input.tracking.ctaVariant,
    pricing_layout: input.tracking.pricingLayout,
    experiment_slot: input.tracking.experimentSlot,
    force_fallback: input.tracking.forceFallback,
  };
}
