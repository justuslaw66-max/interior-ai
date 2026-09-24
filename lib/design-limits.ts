/**
 * How many saved designs an account may keep (audit finding MD6). Free accounts keep at most
 * FREE_PLAN_DESIGN_LIMIT; Pro has no limit. The design routes enforce it, and My designs shows it.
 */
export const FREE_PLAN_DESIGN_LIMIT = 20;

export function designLimitForPlan(plan: string | null | undefined): number | null {
  return plan === "pro" ? null : FREE_PLAN_DESIGN_LIMIT;
}

export function freePlanDesignLimitReachedMessage(action: "create" | "import" = "create") {
  return `Free beta limit reached (max ${FREE_PLAN_DESIGN_LIMIT} designs). Upgrade to ${action} more.`;
}
