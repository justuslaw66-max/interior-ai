export type ProBillingInterval = "monthly" | "yearly";

export const PRO_PLAN_PRICING = {
  monthly: {
    amountMinor: 2990,
    currency: "sgd",
    label: "S$29.90/month",
  },
  yearly: {
    amountMinor: 24990,
    currency: "sgd",
    label: "S$249.90/year",
    effectiveMonthlyLabel: "S$20.83/month, billed yearly",
  },
} as const;

export const PRO_YEARLY_SAVINGS_LABEL =
  "Best value: save S$108.90/year (about 30%)";

export function parseProBillingInterval(
  value: unknown,
  defaultInterval: ProBillingInterval | null = null
): ProBillingInterval | null {
  if (value === undefined && defaultInterval) return defaultInterval;
  return value === "monthly" || value === "yearly" ? value : null;
}
