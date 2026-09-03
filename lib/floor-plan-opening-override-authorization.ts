import type {
  FloorPlanEntityProvenanceV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

export type FloorPlanOpeningEvidenceFieldV2 = "width" | "height" | "sill";

export type FloorPlanOpeningMutationPurposeV2 =
  | "measurement_edit"
  | "opening_kind_change"
  | "import_review_correction"
  | "scale_calibration";

export type FloorPlanOpeningOverrideFieldAuthorizationV2 = {
  field: FloorPlanOpeningEvidenceFieldV2;
  currentRawValueMm: number | undefined;
  proposedRawValueMm: number | undefined;
  currentEvidence: FloorPlanPropertyEvidenceV2;
  replacementEvidence: Extract<
    FloorPlanPropertyEvidenceV2,
    "user_confirmed" | "site_measured"
  >;
};

export type FloorPlanOpeningOverrideAuthorizationV2 = {
  schemaVersion: "floor-plan-opening-override/v1";
  openingId: string;
  fields: FloorPlanOpeningOverrideFieldAuthorizationV2[];
  mutationPurpose: FloorPlanOpeningMutationPurposeV2;
  authorizationContext: "pro_review";
  actorId: string;
  reason: string;
  auditNote: string;
};

/** @deprecated Use FloorPlanOpeningOverrideAuthorizationV2. */
export type FloorPlanOpeningReviewedOverrideV2 =
  FloorPlanOpeningOverrideAuthorizationV2;

export function appendFloorPlanOpeningOverrideAuditV2(input: {
  provenance: FloorPlanEntityProvenanceV2;
  sourceId: string;
  authorization: FloorPlanOpeningOverrideAuthorizationV2;
  reviewedAt: string;
  reviewId: string;
  extractionVersion: string;
}): FloorPlanEntityProvenanceV2 {
  const note = `${input.authorization.reason.trim()} ${input.authorization.auditNote.trim()}`;
  const bases = [...new Set(input.authorization.fields.map(
    (field) => field.replacementEvidence
  ))];
  return {
    ...input.provenance,
    confidence: Math.max(input.provenance.confidence, 0.9),
    evidence: [
      ...input.provenance.evidence,
      ...bases.map((basis) => ({
        sourceId: input.sourceId,
        basis,
        confidence: basis === "site_measured" ? 1 : 0.9,
        extractorVersion: input.extractionVersion,
        note,
      })),
    ],
    reviewHistory: [
      ...input.provenance.reviewHistory.filter((record) => record.id !== input.reviewId),
      {
        id: input.reviewId,
        action: "approved",
        reviewerId: input.authorization.actorId,
        reviewedAt: input.reviewedAt,
        note,
      },
    ],
  };
}
