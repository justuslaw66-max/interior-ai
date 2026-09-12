import type { CompiledFloorPlanSceneV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanOpeningMutationPurposeV2,
  FloorPlanOpeningOverrideAuthorizationV2,
} from "@/lib/floor-plan-opening-override-authorization";

export type FloorPlanConsumerMeasurementEvidenceV2 = Extract<
  FloorPlanPropertyEvidenceV2,
  "user_confirmed" | "site_measured"
>;

export type FloorPlanMeasuredPropertyTargetV2 =
  | { kind: "floor_default"; floorId: string; property: keyof FloorPlanFloorV2["defaults"] }
  | { kind: "floor_elevation"; floorId: string }
  | { kind: "floor_storey_height"; floorId: string }
  | { kind: "floor_slab_thickness"; floorId: string }
  | { kind: "wall_height"; floorId: string; wallId: string }
  | { kind: "wall_base_offset"; floorId: string; wallId: string }
  | { kind: "opening_width"; floorId: string; openingId: string }
  | { kind: "opening_height"; floorId: string; openingId: string }
  | { kind: "opening_sill_height"; floorId: string; openingId: string }
  | { kind: "structure_height"; floorId: string; structureId: string }
  | { kind: "structure_base_offset"; floorId: string; structureId: string };

export type FloorPlanMeasuredPropertyMutationV2 = {
  target: FloorPlanMeasuredPropertyTargetV2;
  valueMm: number;
  evidence: FloorPlanConsumerMeasurementEvidenceV2;
  /** @deprecated This flag cannot authorize an opening measurement. */
  allowDocumentedOverride?: boolean;
  openingOverrideAuthorization?: FloorPlanOpeningOverrideAuthorizationV2;
  mutationPurpose?: FloorPlanOpeningMutationPurposeV2;
};

export type FloorPlanMeasuredPropertyMutationContextV2 = {
  mutationId: string;
  nextRevisionId: string;
  actorId: string;
  mutatedAt: string;
  note?: string;
};

export type FloorPlanMeasuredPropertyMutationResultV2 = {
  document: FloorPlanDocumentV2;
  scene: CompiledFloorPlanSceneV2;
  changedEntityIds: string[];
  previousEvidence: FloorPlanPropertyEvidenceV2;
};

export type FloorPlanMeasuredPropertyMutationErrorCodeV2 =
  | "INVALID_CONTEXT"
  | "INVALID_MEASUREMENT"
  | "UNKNOWN_TARGET"
  | "DOCUMENTED_VALUE_LOCKED"
  | "SITE_MEASUREMENT_NOTE_REQUIRED"
  | "NO_OP_MUTATION"
  | "MUTATION_VALIDATION_FAILED";

export class FloorPlanMeasuredPropertyMutationErrorV2 extends Error {
  readonly code: FloorPlanMeasuredPropertyMutationErrorCodeV2;

  constructor(code: FloorPlanMeasuredPropertyMutationErrorCodeV2, message: string) {
    super(message);
    this.name = "FloorPlanMeasuredPropertyMutationErrorV2";
    this.code = code;
  }
}

export function failFloorPlanMeasuredPropertyMutationV2(
  code: FloorPlanMeasuredPropertyMutationErrorCodeV2,
  message: string
): never {
  throw new FloorPlanMeasuredPropertyMutationErrorV2(code, message);
}
