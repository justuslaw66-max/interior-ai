import type { ConstraintResult } from "@/lib/constraints/evaluate";
import type { AiLayoutProposal, LayoutPlan } from "@/lib/design-page-types";
import type { DesignItem } from "@/lib/room-types";

type AiLayoutFitRisk = NonNullable<AiLayoutProposal["fitRisk"]>;

export type PendingAiLayoutProposal = AiLayoutProposal & {
  plan: LayoutPlan;
  items: DesignItem[];
  appliedRugRule: boolean;
};

export function collectAiLayoutValidationSummary(
  constraintResultsByItem: ConstraintResult[][]
): {
  warnings: string[];
  validationRisk: AiLayoutFitRisk;
} {
  const warnings = new Map<string, string>();
  let validationRisk: AiLayoutFitRisk = "low";

  for (const results of constraintResultsByItem) {
    for (const result of results) {
      if (result.level !== "warn" && result.level !== "error") continue;
      warnings.set(result.message, result.message);
      validationRisk =
        result.level === "error" ? "high" : validationRisk === "high" ? "high" : "medium";
    }
  }

  return {
    warnings: [...warnings.values()],
    validationRisk,
  };
}

export function mergeAiLayoutFitRisk(
  planFitRisk: AiLayoutProposal["fitRisk"],
  validationRisk: AiLayoutFitRisk
): AiLayoutProposal["fitRisk"] {
  if (validationRisk === "high") return "high";
  if (validationRisk === "medium" && planFitRisk !== "high") return "medium";
  return planFitRisk;
}

export function buildPendingAiLayoutProposal(params: {
  plan: LayoutPlan;
  items: DesignItem[];
  appliedRugRule: boolean;
  sourceLabel: string;
  style: string;
  budget: string;
  validationWarnings?: string[];
  validationRisk?: AiLayoutFitRisk;
  itemNameByProductId: (productId: string) => string | undefined;
  nowMs?: number;
}): PendingAiLayoutProposal {
  const validationRisk = params.validationRisk ?? "low";
  const warnings = [
    ...(params.plan.quality?.warnings ?? []),
    ...(params.validationWarnings ?? []),
  ];
  const requestedRoles = params.plan.meta?.requestedRoles ?? [];
  const missingRoles =
    params.plan.quality?.requestedMissing ?? params.plan.quality?.requiredMissing ?? [];

  return {
    id: `ai-layout-${params.nowMs ?? Date.now()}-${params.plan.meta?.seed ?? "seed"}`,
    plan: params.plan,
    items: params.items,
    appliedRugRule: params.appliedRugRule,
    itemNames: params.items.map(
      (item) => params.itemNameByProductId(item.productId) ?? item.productId
    ),
    warnings,
    fitRisk: mergeAiLayoutFitRisk(params.plan.quality?.fitRisk, validationRisk),
    completeness: params.plan.quality?.completeness,
    sourceLabel: params.sourceLabel,
    style: params.plan.meta?.style ?? params.style,
    budget: params.plan.meta?.budget ?? params.budget,
    seed: params.plan.meta?.seed,
    requestedRoles,
    missingRoles,
  };
}
