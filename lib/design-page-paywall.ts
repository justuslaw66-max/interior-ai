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
