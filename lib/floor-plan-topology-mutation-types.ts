import type {
  CompiledFloorPlanSceneV2,
  FloorPlanValidationIssueV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDimensionV2,
  FloorPlanDocumentV2,
  FloorPlanOpeningV2,
  FloorPlanPointMmV2,
  FloorPlanStructureV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";

export type FloorPlanTopologyMutationContextV2 = {
  mutationId: string;
  nextRevisionId: string;
  actorId: string;
  mutatedAt: string;
  note?: string;
  extractionVersion?: string;
};

export type FloorPlanOpeningDraftV2 = Omit<FloorPlanOpeningV2, "provenance">;
export type FloorPlanOpeningChangesV2 = Partial<
  Omit<FloorPlanOpeningDraftV2, "id">
>;
export type FloorPlanWallChangesV2 = Partial<
  Pick<FloorPlanWallV2, "thicknessMm" | "classification">
>;
export type FloorPlanVertexDraftV2 = Omit<FloorPlanVertexV2, "provenance">;
export type FloorPlanStructureDraftV2 = Omit<FloorPlanStructureV2, "provenance">;
export type FloorPlanStructureChangesV2 = Partial<
  Omit<FloorPlanStructureDraftV2, "id">
>;
export type FloorPlanDimensionDraftV2 = Omit<FloorPlanDimensionV2, "provenance">;
export type FloorPlanDimensionChangesV2 = Partial<
  Omit<FloorPlanDimensionDraftV2, "id">
>;

export type FloorPlanTopologyMutationV2 =
  | {
      kind: "move_vertex";
      floorId: string;
      vertexId: string;
      to: FloorPlanPointMmV2;
    }
  | {
      kind: "move_wall";
      floorId: string;
      wallId: string;
      deltaXMm: number;
      deltaZMm: number;
    }
  | {
      kind: "update_wall";
      floorId: string;
      wallId: string;
      changes: FloorPlanWallChangesV2;
    }
  | {
      kind: "split_wall";
      floorId: string;
      wallId: string;
      offsetMm: number;
      newVertexId: string;
      newWallId: string;
    }
  | {
      kind: "add_opening";
      floorId: string;
      opening: FloorPlanOpeningDraftV2;
    }
  | {
      kind: "update_opening";
      floorId: string;
      openingId: string;
      changes: FloorPlanOpeningChangesV2;
    }
  | {
      kind: "remove_opening";
      floorId: string;
      openingId: string;
    }
  | {
      kind: "add_structure";
      floorId: string;
      structure: FloorPlanStructureDraftV2;
      /** New polygon vertices; existing floor vertices may also be referenced. */
      vertices?: FloorPlanVertexDraftV2[];
    }
  | {
      kind: "update_structure";
      floorId: string;
      structureId: string;
      changes: FloorPlanStructureChangesV2;
      /** Replacement polygon vertices created atomically with the structure update. */
      vertices?: FloorPlanVertexDraftV2[];
    }
  | {
      kind: "remove_structure";
      floorId: string;
      structureId: string;
    }
  | {
      kind: "add_dimension";
      floorId: string;
      dimension: FloorPlanDimensionDraftV2;
    }
  | {
      kind: "update_dimension";
      floorId: string;
      dimensionId: string;
      changes: FloorPlanDimensionChangesV2;
    }
  | {
      kind: "remove_dimension";
      floorId: string;
      dimensionId: string;
    };

export type FloorPlanTopologyMutationResultV2 = {
  document: FloorPlanDocumentV2;
  scene: CompiledFloorPlanSceneV2;
  changedEntityIds: string[];
};

export type FloorPlanTopologyMutationErrorCodeV2 =
  | "INVALID_CONTEXT"
  | "INVALID_SOURCE_DOCUMENT"
  | "UNKNOWN_FLOOR"
  | "UNKNOWN_VERTEX"
  | "UNKNOWN_WALL"
  | "UNKNOWN_OPENING"
  | "UNKNOWN_STRUCTURE"
  | "UNKNOWN_DIMENSION"
  | "DUPLICATE_ENTITY_ID"
  | "INVALID_ENTITY_ID"
  | "UNREFERENCED_NEW_VERTEX"
  | "NON_INTEGER_MILLIMETRES"
  | "NO_OP_MUTATION"
  | "ARC_MUTATION_UNSUPPORTED"
  | "INVALID_SPLIT"
  | "SPAN_CROSSES_SPLIT"
  | "MUTATION_VALIDATION_FAILED";

export class FloorPlanTopologyMutationErrorV2 extends Error {
  readonly code: FloorPlanTopologyMutationErrorCodeV2;
  readonly validationIssues: FloorPlanValidationIssueV2[];

  constructor(
    code: FloorPlanTopologyMutationErrorCodeV2,
    message: string,
    validationIssues: FloorPlanValidationIssueV2[] = []
  ) {
    super(message);
    this.name = "FloorPlanTopologyMutationErrorV2";
    this.code = code;
    this.validationIssues = validationIssues;
  }
}
