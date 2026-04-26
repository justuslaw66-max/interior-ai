type EventMeta = Record<string, unknown> | null | undefined;

export type PaywallEventLike = {
  eventType: string;
  meta?: EventMeta;
};

export type PaywallVariantRow = {
  variant: string;
  upgradeClicks: number;
  checkoutStarts: number;
  clickToCheckoutRate: string;
  primaryClicks: number;
  secondaryClicks: number;
  monthlySelections: number;
  yearlySelections: number;
  annualHighlightSelections: number;
};

export type PaywallPerformanceSummary = {
  rows: PaywallVariantRow[];
  winnerVariant: string | null;
  winnerSummary: string;
  reviewNotes: string[];
  totalUpgradeClicks: number;
  totalCheckoutStarts: number;
  isDecisionReady: boolean;
  decisionStatusLabel: string;
  sampleTargetPerVariant: number;
  minimumVariantSample: number;
  reviewWindowDays: number;
};

function getMetaString(meta: EventMeta, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function computePaywallPerformanceSummary(events: PaywallEventLike[]): PaywallPerformanceSummary {
  const reviewWindowDays = 7;
  const sampleTargetPerVariant = 10;
  const variantMap = new Map<string, Omit<PaywallVariantRow, "clickToCheckoutRate">>();

  const ensureRow = (variant: string) => {
    const existing = variantMap.get(variant);
    if (existing) return existing;

    const created = {
      variant,
      upgradeClicks: 0,
      checkoutStarts: 0,
      primaryClicks: 0,
      secondaryClicks: 0,
      monthlySelections: 0,
      yearlySelections: 0,
      annualHighlightSelections: 0,
    };
    variantMap.set(variant, created);
    return created;
  };

  for (const event of events) {
    const variant = getMetaString(event.meta, "cta_variant") ?? "unknown";
    const row = ensureRow(variant);

    if (event.eventType === "upgrade_clicked") {
      row.upgradeClicks += 1;
      const position = getMetaString(event.meta, "cta_position") ?? "";
      const cta = getMetaString(event.meta, "cta") ?? "";
      const pricingLayout = getMetaString(event.meta, "pricing_layout") ?? "";
      if (position.includes("primary")) row.primaryClicks += 1;
      if (position.includes("secondary")) row.secondaryClicks += 1;
      if (cta === "monthly") row.monthlySelections += 1;
      if (cta === "yearly") row.yearlySelections += 1;
      if (pricingLayout === "annual_highlight") row.annualHighlightSelections += 1;
    }

    if (event.eventType === "checkout_started") {
      row.checkoutStarts += 1;
      const interval = getMetaString(event.meta, "interval") ?? "";
      const pricingLayout = getMetaString(event.meta, "pricing_layout") ?? "";
      if (interval === "monthly") row.monthlySelections += 1;
      if (interval === "yearly") row.yearlySelections += 1;
      if (pricingLayout === "annual_highlight") row.annualHighlightSelections += 1;
    }
  }

  const rows: PaywallVariantRow[] = Array.from(variantMap.values())
    .map((row) => ({
      ...row,
      clickToCheckoutRate: formatPercent(row.checkoutStarts, row.upgradeClicks),
    }))
    .sort((left, right) => {
      const leftRate = left.upgradeClicks ? left.checkoutStarts / left.upgradeClicks : 0;
      const rightRate = right.upgradeClicks ? right.checkoutStarts / right.upgradeClicks : 0;
      if (rightRate !== leftRate) return rightRate - leftRate;
      return right.upgradeClicks - left.upgradeClicks;
    });

  const winner = rows[0] ?? null;
  const totalUpgradeClicks = rows.reduce((sum, row) => sum + row.upgradeClicks, 0);
  const totalCheckoutStarts = rows.reduce((sum, row) => sum + row.checkoutStarts, 0);
  const minimumVariantSample = rows.length
    ? rows.reduce((min, row) => Math.min(min, row.upgradeClicks), Number.POSITIVE_INFINITY)
    : 0;
  const isDecisionReady = rows.length >= 2 && rows.every((row) => row.upgradeClicks >= sampleTargetPerVariant);
  const winnerSummary = winner
    ? `${winner.variant} leads with ${winner.clickToCheckoutRate} click-to-checkout conversion across ${winner.upgradeClicks} upgrade clicks.`
    : "Not enough paywall CTA data yet.";
  const decisionStatusLabel = isDecisionReady
    ? `Decision-ready: both variants have at least ${sampleTargetPerVariant} upgrade clicks in the last ${reviewWindowDays} days.`
    : `Still collecting: wait for at least ${sampleTargetPerVariant} upgrade clicks per variant before changing copy.`;

  const reviewNotes: string[] = [];
  if (!rows.length) {
    reviewNotes.push("Collect at least one week of upgrade CTA data before making copy changes.");
  } else {
    if (winner) {
      reviewNotes.push(
        winner.variant === "see_pricing"
          ? "Pricing-first messaging is currently stronger. Keep testing direct pricing language and annual savings framing."
          : "Benefit-led export messaging is currently stronger. Keep value-forward copy above pricing details."
      );
    }

    const yearlyTotal = rows.reduce((sum, row) => sum + row.yearlySelections, 0);
    const monthlyTotal = rows.reduce((sum, row) => sum + row.monthlySelections, 0);
    if (yearlyTotal < monthlyTotal) {
      reviewNotes.push("Yearly selections trail monthly. Consider making annual savings more explicit in the first viewport.");
    } else {
      reviewNotes.push("Yearly selections are competitive. Keep annual savings visible in both modal and pricing sheet.");
    }

    const annualHighlightTotal = rows.reduce((sum, row) => sum + row.annualHighlightSelections, 0);
    if (annualHighlightTotal > 0) {
      reviewNotes.push("Annual-highlight pricing layout is live. Compare yearly mix before changing checkout copy again.");
    }

    const weakVariant = rows.find((row) => row.upgradeClicks >= 5 && row.checkoutStarts === 0);
    if (weakVariant) {
      reviewNotes.push(`Variant ${weakVariant.variant} is attracting clicks without checkout starts. Refresh its headline or CTA framing next week.`);
    }
  }

  return {
    rows,
    winnerVariant: winner?.variant ?? null,
    winnerSummary,
    reviewNotes,
    totalUpgradeClicks,
    totalCheckoutStarts,
    isDecisionReady,
    decisionStatusLabel,
    sampleTargetPerVariant,
    minimumVariantSample,
    reviewWindowDays,
  };
}