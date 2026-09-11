import {
  compileFloorPlanDocumentV2,
  type CompiledFloorPlanSceneV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import { applyFloorPlanMeasuredValueV2 } from "@/lib/floor-plan-measured-value-application";
import {
  failFloorPlanMeasuredPropertyMutationV2 as fail,
  type FloorPlanMeasuredPropertyMutationContextV2,
  type FloorPlanMeasuredPropertyMutationResultV2,
  type FloorPlanMeasuredPropertyMutationV2,
  type FloorPlanMeasuredPropertyTargetV2,
} from "@/lib/floor-plan-measured-property-types";
export {
  FloorPlanMeasuredPropertyMutationErrorV2,
  type FloorPlanConsumerMeasurementEvidenceV2,
  type FloorPlanMeasuredPropertyMutationContextV2,
  type FloorPlanMeasuredPropertyMutationErrorCodeV2,
  type FloorPlanMeasuredPropertyMutationResultV2,
  type FloorPlanMeasuredPropertyMutationV2,
  type FloorPlanMeasuredPropertyTargetV2,
} from "@/lib/floor-plan-measured-property-types";
export {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
} from "@/lib/floor-plan-property-evidence";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function validateContext(context: FloorPlanMeasuredPropertyMutationContextV2): void {
  if (
    !ID_PATTERN.test(context.mutationId) ||
    !ID_PATTERN.test(context.nextRevisionId) ||
    !context.actorId.trim() ||
    Number.isNaN(Date.parse(context.mutatedAt))
  ) {
    fail(
      "INVALID_CONTEXT",
      "Measurement changes require stable mutation/revision IDs, an actor and a timestamp."
    );
  }
}

function validateMeasurement(
  target: FloorPlanMeasuredPropertyTargetV2,
  valueMm: number
): void {
  if (target.kind === "floor_elevation") {
    if (!Number.isSafeInteger(valueMm)) {
      fail("INVALID_MEASUREMENT", "Floor elevations must be integer millimetres.");
    }
    return;
  }
  const acceptsZero =
    target.kind === "opening_sill_height" ||
    target.kind === "floor_slab_thickness" ||
    target.kind === "wall_base_offset" ||
    target.kind === "structure_base_offset" ||
    (target.kind === "floor_default" && target.property === "windowSillHeight");
  if (!Number.isSafeInteger(valueMm) || (acceptsZero ? valueMm < 0 : valueMm <= 0)) {
    fail(
      "INVALID_MEASUREMENT",
      `Measurements must be ${acceptsZero ? "non-negative" : "positive"} integer millimetres.`
    );
  }
}

function getFloor(document: FloorPlanDocumentV2, floorId: string): FloorPlanFloorV2 {
  const floor = document.floors.find((candidate) => candidate.id === floorId);
  if (!floor) fail("UNKNOWN_TARGET", `Unknown floor ${floorId}.`);
  return floor;
}

function compiledEvidence(
  scene: CompiledFloorPlanSceneV2,
  target: FloorPlanMeasuredPropertyTargetV2
): FloorPlanPropertyEvidenceV2 {
  const floor = scene.floors.find((candidate) => candidate.id === target.floorId);
  if (!floor) fail("UNKNOWN_TARGET", `Unknown floor ${target.floorId}.`);
  if (target.kind === "floor_default") return floor.defaults[target.property].evidence;
  if (target.kind === "floor_elevation") return floor.elevationEvidence;
  if (target.kind === "floor_storey_height") return floor.storeyHeightEvidence;
  if (target.kind === "floor_slab_thickness") return floor.slabThicknessEvidence;
  if (target.kind === "wall_height" || target.kind === "wall_base_offset") {
    const wall = floor.walls.find((candidate) => candidate.id === target.wallId);
    if (!wall) fail("UNKNOWN_TARGET", `Unknown wall ${target.wallId}.`);
    return target.kind === "wall_height"
      ? wall.heightEvidence
      : wall.baseOffsetEvidence;
  }
  if (
    target.kind === "structure_height" ||
    target.kind === "structure_base_offset"
  ) {
    const structure = floor.structures.find(
      (candidate) => candidate.id === target.structureId
    );
    if (!structure) fail("UNKNOWN_TARGET", `Unknown structure ${target.structureId}.`);
    return target.kind === "structure_height"
      ? structure.heightEvidence
      : structure.baseOffsetEvidence;
  }
  const opening = floor.openings.find((candidate) => candidate.id === target.openingId);
  if (!opening) fail("UNKNOWN_TARGET", `Unknown opening ${target.openingId}.`);
  if (target.kind === "opening_width") return opening.widthEvidence;
  return target.kind === "opening_height"
    ? opening.heightEvidence
    : opening.sillHeightEvidence;
}

function targetIdentity(target: FloorPlanMeasuredPropertyTargetV2): string {
  if (target.kind === "floor_default") return `${target.floorId}:defaults:${target.property}`;
  if (target.kind === "floor_elevation") return `${target.floorId}:elevation`;
  if (target.kind === "floor_storey_height") return `${target.floorId}:storeyHeight`;
  if (target.kind === "floor_slab_thickness") return `${target.floorId}:slabThickness`;
  if (target.kind === "wall_height") return `${target.wallId}:height`;
  if (target.kind === "wall_base_offset") return `${target.wallId}:baseOffset`;
  if (target.kind === "structure_height") return `${target.structureId}:height`;
  if (target.kind === "structure_base_offset") {
    return `${target.structureId}:baseOffset`;
  }
  const property = target.kind === "opening_width"
    ? "width"
    : target.kind === "opening_height"
      ? "height"
      : "sill";
  return `${target.openingId}:${property}`;
}

/**
 * Applies one auditable vertical measurement without changing any 2D vertex,
 * wall path, opening span, room loop or stable topology ID.
 */
export function applyFloorPlanMeasuredPropertyMutationV2(
  input: FloorPlanDocumentV2,
  mutation: FloorPlanMeasuredPropertyMutationV2,
  context: FloorPlanMeasuredPropertyMutationContextV2
): FloorPlanMeasuredPropertyMutationResultV2 {
  validateContext(context);
  validateMeasurement(mutation.target, mutation.valueMm);
  if (mutation.evidence === "site_measured" && (context.note?.trim().length ?? 0) < 4) {
    fail(
      "SITE_MEASUREMENT_NOTE_REQUIRED",
      "Site-measured values require a short note describing how the measurement was taken."
    );
  }

  let currentScene: CompiledFloorPlanSceneV2;
  try {
    currentScene = compileFloorPlanDocumentV2(input);
  } catch {
    fail("MUTATION_VALIDATION_FAILED", "The existing canonical floor plan is invalid.");
  }
  const previousEvidence = compiledEvidence(currentScene, mutation.target);
  const openingTarget = mutation.target.kind === "opening_width" ||
    mutation.target.kind === "opening_height" ||
    mutation.target.kind === "opening_sill_height";
  if (
    !openingTarget &&
    (previousEvidence === "source_documented" || previousEvidence === "site_measured") &&
    !mutation.allowDocumentedOverride
  ) {
    fail(
      "DOCUMENTED_VALUE_LOCKED",
      "Source-documented and site-measured values stay locked unless an explicit reviewed override is requested."
    );
  }

  const document = structuredClone(input);
  const floor = getFloor(document, mutation.target.floorId);
  const targetId = targetIdentity(mutation.target);
  const previousValueMm = applyFloorPlanMeasuredValueV2({
    document,
    floor,
    currentScene,
    target: mutation.target,
    valueMm: mutation.valueMm,
    evidence: mutation.evidence,
    context,
    targetId,
    mutationPurpose: mutation.mutationPurpose,
    authorization: mutation.openingOverrideAuthorization,
  });

  if (previousValueMm === mutation.valueMm && previousEvidence === mutation.evidence) {
    fail("NO_OP_MUTATION", "The canonical measurement already has this value and evidence state.");
  }

  document.parentRevisionId = input.revisionId;
  document.revisionId = context.nextRevisionId;
  document.verification = {
    tier: "needs_review",
    criticalIssueIds: [...document.verification.criticalIssueIds],
  };

  try {
    const scene = compileFloorPlanDocumentV2(document);
    return {
      document,
      scene,
      changedEntityIds: [targetId],
      previousEvidence,
    };
  } catch (cause) {
    const reason = cause instanceof Error ? ` ${cause.message}` : "";
    fail(
      "MUTATION_VALIDATION_FAILED",
      `The measurement would make the canonical 2D/3D model invalid.${reason}`
    );
  }
}
