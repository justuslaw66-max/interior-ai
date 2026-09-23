export type ObjectShadowPolicyInput = {
  category?: string | null;
  quality: "low" | "medium" | "high";
  transparent?: boolean;
};

const NON_SHADOW_CATEGORY_PATTERN =
  /\b(rug|carpet|curtain|sheer|glass|mirror|wall art|artwork|plant|decor)\b/i;

/**
 * Central object-shadow eligibility policy. Light shadow budgets are resolved
 * by FixtureLightManager; this policy prevents low-value or transparent scene
 * objects from consuming shadow-map draw calls.
 */
export function resolveObjectShadowEligibility({
  category,
  quality,
  transparent = false,
}: ObjectShadowPolicyInput): { castShadow: boolean; receiveShadow: boolean } {
  if (quality === "low" || transparent) {
    return { castShadow: false, receiveShadow: false };
  }
  if (NON_SHADOW_CATEGORY_PATTERN.test(category ?? "")) {
    return { castShadow: false, receiveShadow: false };
  }
  return {
    castShadow: true,
    // Imported furniture commonly has dense/discontinuous topology. Room
    // surfaces receive its shadows without enabling costly self-shadowing.
    receiveShadow: false,
  };
}
