import type {
  FloorPlanOpeningV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import {
  planFloorPlanOpeningMutationV2,
  type FloorPlanOpeningPolicyChangesV2,
} from "@/lib/floor-plan-opening-mutation-policy";
import type {
  FloorPlanOpeningEvidenceFieldV2,
  FloorPlanOpeningMutationPurposeV2,
  FloorPlanOpeningOverrideAuthorizationV2,
} from "@/lib/floor-plan-opening-override-authorization";

const FIELD_ORDER: FloorPlanOpeningEvidenceFieldV2[] = ["width", "height", "sill"];

export function createFloorPlanOpeningOverrideAuthorizationV2(input: {
  opening: FloorPlanOpeningV2;
  changes: FloorPlanOpeningPolicyChangesV2;
  mutationPurpose: FloorPlanOpeningMutationPurposeV2;
  actorId: string;
  reason: string;
  auditNote: string;
  replacementEvidence?: Extract<
    FloorPlanPropertyEvidenceV2,
    "user_confirmed" | "site_measured"
  >;
}): FloorPlanOpeningOverrideAuthorizationV2 {
  const plan = planFloorPlanOpeningMutationV2({
    opening: input.opening,
    changes: input.changes,
    mutationPurpose: input.mutationPurpose,
    actorId: input.actorId,
  });
  const fields = FIELD_ORDER.filter((field) => plan.fields[field].requiresOverride)
    .map((field) => ({
      field,
      currentRawValueMm: plan.fields[field].currentRawValueMm,
      proposedRawValueMm: plan.fields[field].proposedRawValueMm,
      currentEvidence: plan.fields[field].currentEvidence,
      replacementEvidence: input.replacementEvidence ?? "user_confirmed",
    }));
  if (!fields.length) {
    throw new Error("The requested opening change does not require an override authorization.");
  }
  return {
    schemaVersion: "floor-plan-opening-override/v1",
    openingId: input.opening.id,
    fields,
    mutationPurpose: input.mutationPurpose,
    authorizationContext: "pro_review",
    actorId: input.actorId,
    reason: input.reason,
    auditNote: input.auditNote,
  };
}
