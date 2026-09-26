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

/** The plan's limit, said up front: "7 of 20 designs on the Free plan." Pro has none. */
export function designLimitSummary(count: number, limit: number | null) {
  if (limit === null) return null;
  return { text: `${count} of ${limit} designs on the Free plan.`, reached: count >= limit };
}
