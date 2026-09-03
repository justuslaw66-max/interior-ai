import type { FloorPlanOpeningKindV2, FloorPlanOpeningV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanOpeningPolicyInput,
  planFloorPlanOpeningMutationV2,
} from "@/lib/floor-plan-opening-mutation-policy";

export type FloorPlanOpeningKindCorrectionPlan = {
  resetsSill: boolean;
  locked: boolean;
  changes: Pick<FloorPlanOpeningV2, "sillHeightMm" | "sillHeightEvidence"> | Record<string, never>;
};

export function planFloorPlanOpeningKindCorrection(
  opening: FloorPlanOpeningV2 | undefined,
  newKind: FloorPlanOpeningKindV2
): FloorPlanOpeningKindCorrectionPlan {
  if (!opening) return { resetsSill: false, locked: false, changes: {} };
  const plan = planFloorPlanOpeningMutationV2({
    opening: floorPlanOpeningPolicyInput(opening),
    changes: { kind: newKind },
  });
  const resetsSill = plan.fields.sill.valueChanged;
  const locked = plan.status === "requires_override" || plan.status === "blocked";
  return {
    resetsSill,
    locked,
    changes: resetsSill && !locked && plan.changes
      ? {
          sillHeightMm: plan.changes.sillHeightMm,
          sillHeightEvidence: plan.changes.sillHeightEvidence,
        }
      : {},
  };
}
