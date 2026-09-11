import type { CompiledFloorPlanSceneV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanFloorVerticalEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import { markFloorPlanMeasurementProvenanceV2 } from "@/lib/floor-plan-measurement-provenance";
import type {
  FloorPlanConsumerMeasurementEvidenceV2,
  FloorPlanMeasuredPropertyMutationContextV2,
  FloorPlanMeasuredPropertyTargetV2,
} from "@/lib/floor-plan-measured-property-types";
import { failFloorPlanMeasuredPropertyMutationV2 as fail } from "@/lib/floor-plan-measured-property-types";
import {
  appendFloorPlanOpeningOverrideAuditV2,
  planFloorPlanOpeningMutationV2,
  type FloorPlanOpeningMutationPurposeV2,
  type FloorPlanOpeningOverrideAuthorizationV2,
} from "@/lib/floor-plan-opening-mutation-policy";

type ApplicationInput = {
  document: FloorPlanDocumentV2;
  floor: FloorPlanFloorV2;
  currentScene: CompiledFloorPlanSceneV2;
  target: FloorPlanMeasuredPropertyTargetV2;
  valueMm: number;
  evidence: FloorPlanConsumerMeasurementEvidenceV2;
  context: FloorPlanMeasuredPropertyMutationContextV2;
  targetId: string;
  mutationPurpose?: FloorPlanOpeningMutationPurposeV2;
  authorization?: FloorPlanOpeningOverrideAuthorizationV2;
};

function missingVerticalPropertyEvidence(): FloorPlanFloorVerticalEvidenceV2["storeyHeight"] {
  return {
    evidence: "assumed",
    provenance: {
      confidence: 0,
      extractionVersion: "schema-v2-vertical-evidence-backfill",
      evidence: [],
      reviewHistory: [],
    },
  };
}

function floorVerticalEvidence(floor: FloorPlanFloorV2): FloorPlanFloorVerticalEvidenceV2 {
  floor.verticalEvidence ??= {
    elevation: missingVerticalPropertyEvidence(),
    storeyHeight: missingVerticalPropertyEvidence(),
    slabThickness: missingVerticalPropertyEvidence(),
  };
  return floor.verticalEvidence;
}

function mark(input: ApplicationInput, provenance: FloorPlanEntityProvenanceV2) {
  return markFloorPlanMeasurementProvenanceV2(
    provenance, input.document, input.targetId, input.evidence, input.context
  );
}

function applyFloorDefault(input: ApplicationInput & {
  target: Extract<FloorPlanMeasuredPropertyTargetV2, { kind: "floor_default" }>;
}) {
  const property = input.floor.defaults[input.target.property];
  const previous = property.valueMm;
  property.valueMm = input.valueMm;
  property.evidence = input.evidence;
  property.provenance = mark(input, property.provenance);
  return previous;
}

function applyFloorVertical(input: ApplicationInput & {
  target: Extract<FloorPlanMeasuredPropertyTargetV2, {
    kind: "floor_elevation" | "floor_storey_height" | "floor_slab_thickness";
  }>;
}) {
  const propertyName = input.target.kind === "floor_elevation"
    ? "elevation" : input.target.kind === "floor_storey_height"
      ? "storeyHeight" : "slabThickness";
  const previous = propertyName === "elevation"
    ? input.floor.elevationMm : propertyName === "storeyHeight"
      ? input.floor.storeyHeightMm : input.floor.slabThicknessMm;
  if (propertyName === "elevation") input.floor.elevationMm = input.valueMm;
  else if (propertyName === "storeyHeight") input.floor.storeyHeightMm = input.valueMm;
  else input.floor.slabThicknessMm = input.valueMm;
  const property = floorVerticalEvidence(input.floor)[propertyName];
  property.evidence = input.evidence;
  property.provenance = mark(input, property.provenance);
  return previous;
}

function applyWall(input: ApplicationInput & {
  target: Extract<FloorPlanMeasuredPropertyTargetV2, {
    kind: "wall_height" | "wall_base_offset";
  }>;
}) {
  const wall = input.floor.walls.find((candidate) => candidate.id === input.target.wallId);
  const compiledFloor = input.currentScene.floors.find(
    (candidate) => candidate.id === input.floor.id
  );
  const compiledWall = compiledFloor?.walls.find((candidate) => candidate.id === input.target.wallId);
  if (!wall || !compiledWall) fail("UNKNOWN_TARGET", `Unknown wall ${input.target.wallId}.`);
  const previous = input.target.kind === "wall_height"
    ? compiledWall.heightMm : compiledWall.baseOffsetMm;
  if (input.target.kind === "wall_height") {
    wall.heightMm = input.valueMm;
    wall.heightEvidence = input.evidence;
  } else {
    wall.baseOffsetMm = input.valueMm;
    wall.baseOffsetEvidence = input.evidence;
  }
  wall.provenance = mark(input, wall.provenance);
  return previous;
}

function applyStructure(input: ApplicationInput & {
  target: Extract<FloorPlanMeasuredPropertyTargetV2, {
    kind: "structure_height" | "structure_base_offset";
  }>;
}) {
  const structure = input.floor.structures.find(
    (candidate) => candidate.id === input.target.structureId
  );
  if (!structure) fail("UNKNOWN_TARGET", `Unknown structure ${input.target.structureId}.`);
  const previous = input.target.kind === "structure_height"
    ? structure.heightMm : structure.baseOffsetMm;
  if (input.target.kind === "structure_height") {
    structure.heightMm = input.valueMm;
    structure.heightEvidence = input.evidence;
  } else {
    structure.baseOffsetMm = input.valueMm;
    structure.baseOffsetEvidence = input.evidence;
  }
  structure.provenance = mark(input, structure.provenance);
  return previous;
}

type OpeningMeasurementKeys =
  | { valueKey: "widthMm"; evidenceKey: "widthEvidence" }
  | { valueKey: "heightMm"; evidenceKey: "heightEvidence" }
  | { valueKey: "sillHeightMm"; evidenceKey: "sillHeightEvidence" };

function openingMeasurementKeys(
  kind: "opening_width" | "opening_height" | "opening_sill_height"
): OpeningMeasurementKeys {
  if (kind === "opening_width") {
    return { valueKey: "widthMm", evidenceKey: "widthEvidence" };
  }
  if (kind === "opening_height") {
    return { valueKey: "heightMm", evidenceKey: "heightEvidence" };
  }
  return { valueKey: "sillHeightMm", evidenceKey: "sillHeightEvidence" };
}

function appendOpeningOverrideAudit(
  input: ApplicationInput,
  opening: FloorPlanFloorV2["openings"][number],
  auditNote: string | null
) {
  if (!auditNote || !input.authorization) return;
  const sourceId = opening.provenance.evidence[0]?.sourceId ?? input.document.sources[0]?.id;
  if (!sourceId) fail("MUTATION_VALIDATION_FAILED",
    "The opening override requires an auditable source.");
  opening.provenance = appendFloorPlanOpeningOverrideAuditV2({
    provenance: opening.provenance,
    sourceId,
    authorization: input.authorization,
    reviewedAt: input.context.mutatedAt,
    reviewId: `${input.context.mutationId}:${input.targetId}:override`,
    extractionVersion: "consumer-measurement-v1",
  });
}

function applyOpening(input: ApplicationInput & {
  target: Extract<FloorPlanMeasuredPropertyTargetV2, {
    kind: "opening_width" | "opening_height" | "opening_sill_height";
  }>;
}) {
  const opening = input.floor.openings.find(
    (candidate) => candidate.id === input.target.openingId
  );
  if (!opening) fail("UNKNOWN_TARGET", `Unknown opening ${input.target.openingId}.`);
  const { valueKey, evidenceKey } = openingMeasurementKeys(input.target.kind);
  const plan = planFloorPlanOpeningMutationV2({
    opening,
    changes: { [valueKey]: input.valueMm, [evidenceKey]: input.evidence },
    mutationPurpose: input.mutationPurpose ?? "measurement_edit",
    actorId: input.context.actorId,
    evidenceWorkflow: input.evidence === "site_measured" ? "site_measurement" : undefined,
    overrideAuthorization: input.authorization,
  });
  if (plan.status === "requires_override") {
    fail("DOCUMENTED_VALUE_LOCKED",
      plan.explanation ?? "The protected opening measurement requires an override.");
  }
  if (plan.status !== "applied" || !plan.changes) {
    fail("MUTATION_VALIDATION_FAILED",
      plan.explanation ?? "The opening override authorization is invalid.");
  }
  const previous = opening[valueKey] ?? 0;
  Object.assign(opening, plan.changes);
  const provenanceContext = plan.auditNote
    ? { ...input.context, note: plan.auditNote } : input.context;
  opening.provenance = markFloorPlanMeasurementProvenanceV2(
    opening.provenance, input.document, input.targetId, input.evidence, provenanceContext
  );
  appendOpeningOverrideAudit(input, opening, plan.auditNote);
  return previous;
}

export function applyFloorPlanMeasuredValueV2(input: ApplicationInput): number {
  const target = input.target;
  if (target.kind === "floor_default") return applyFloorDefault({ ...input, target });
  if (target.kind === "floor_elevation" || target.kind === "floor_storey_height" ||
      target.kind === "floor_slab_thickness") return applyFloorVertical({ ...input, target });
  if (target.kind === "wall_height" || target.kind === "wall_base_offset") {
    return applyWall({ ...input, target });
  }
  if (target.kind === "structure_height" || target.kind === "structure_base_offset") {
    return applyStructure({ ...input, target });
  }
  return applyOpening({ ...input, target });
}
