import {
  compileFloorPlanDocumentV2,
  type CompiledFloorPlanSceneV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanFloorV2,
  FloorPlanFloorVerticalEvidenceV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

const MEASUREMENT_EXTRACTION_VERSION = "consumer-measurement-v1";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

export type FloorPlanConsumerMeasurementEvidenceV2 = Extract<
  FloorPlanPropertyEvidenceV2,
  "user_confirmed" | "site_measured"
>;

export type FloorPlanMeasuredPropertyTargetV2 =
  | {
      kind: "floor_default";
      floorId: string;
      property: keyof FloorPlanFloorV2["defaults"];
    }
  | { kind: "floor_elevation"; floorId: string }
  | { kind: "floor_storey_height"; floorId: string }
  | { kind: "floor_slab_thickness"; floorId: string }
  | { kind: "wall_height"; floorId: string; wallId: string }
  | { kind: "wall_base_offset"; floorId: string; wallId: string }
  | { kind: "opening_height"; floorId: string; openingId: string }
  | { kind: "opening_sill_height"; floorId: string; openingId: string }
  | { kind: "structure_height"; floorId: string; structureId: string }
  | { kind: "structure_base_offset"; floorId: string; structureId: string };

export type FloorPlanMeasuredPropertyMutationV2 = {
  target: FloorPlanMeasuredPropertyTargetV2;
  valueMm: number;
  evidence: FloorPlanConsumerMeasurementEvidenceV2;
  /** Required when deliberately replacing source-documented or measured data. */
  allowDocumentedOverride?: boolean;
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

function fail(
  code: FloorPlanMeasuredPropertyMutationErrorCodeV2,
  message: string
): never {
  throw new FloorPlanMeasuredPropertyMutationErrorV2(code, message);
}

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
  return target.kind === "opening_height"
    ? opening.heightEvidence
    : opening.sillHeightEvidence;
}

function ensureMeasurementSource(
  document: FloorPlanDocumentV2,
  evidence: FloorPlanConsumerMeasurementEvidenceV2,
  context: FloorPlanMeasuredPropertyMutationContextV2,
  provenance: FloorPlanEntityProvenanceV2
): string {
  if (evidence === "site_measured") {
    const existing = document.sources.find((source) => source.kind === "site_measurement");
    if (existing) return existing.id;
    const id = `site-measurement:${context.mutationId}`;
    document.sources.push({
      id,
      kind: "site_measurement",
      name: "Consumer site-measurement attestation",
      mimeType: "application/vnd.interior-ai.site-measurement+json",
    });
    return id;
  }
  const sourceId = provenance.evidence[0]?.sourceId ?? document.sources[0]?.id;
  if (!sourceId) fail("MUTATION_VALIDATION_FAILED", "The plan has no source for measurement provenance.");
  return sourceId;
}

function markProvenance(
  provenance: FloorPlanEntityProvenanceV2,
  document: FloorPlanDocumentV2,
  targetId: string,
  evidence: FloorPlanConsumerMeasurementEvidenceV2,
  context: FloorPlanMeasuredPropertyMutationContextV2
): FloorPlanEntityProvenanceV2 {
  const basis: FloorPlanEvidenceBasisV2 = evidence;
  const sourceId = ensureMeasurementSource(document, evidence, context, provenance);
  return {
    confidence: evidence === "site_measured" ? 1 : Math.max(0.8, provenance.confidence),
    extractionVersion: MEASUREMENT_EXTRACTION_VERSION,
    evidence: [
      ...provenance.evidence,
      {
        sourceId,
        basis,
        confidence: evidence === "site_measured" ? 1 : 0.9,
        extractorVersion: MEASUREMENT_EXTRACTION_VERSION,
        note:
          context.note?.trim() ||
          (evidence === "site_measured"
            ? "Consumer recorded a site measurement."
            : "Consumer explicitly confirmed the displayed value."),
      },
    ],
    reviewHistory: [
      ...provenance.reviewHistory.filter(
        (record) => record.id !== `${context.mutationId}:${targetId}`
      ),
      {
        id: `${context.mutationId}:${targetId}`,
        action: "confirmed",
        reviewerId: context.actorId,
        reviewedAt: context.mutatedAt,
        note:
          context.note?.trim() ||
          (evidence === "site_measured"
            ? "Recorded as site measured; independent review is still required."
            : "Consumer confirmed the displayed measurement."),
      },
    ],
  };
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
  return `${target.openingId}:${target.kind === "opening_height" ? "height" : "sill"}`;
}

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

function ensureFloorVerticalEvidence(
  floor: FloorPlanFloorV2
): FloorPlanFloorVerticalEvidenceV2 {
  floor.verticalEvidence ??= {
    elevation: missingVerticalPropertyEvidence(),
    storeyHeight: missingVerticalPropertyEvidence(),
    slabThickness: missingVerticalPropertyEvidence(),
  };
  return floor.verticalEvidence;
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
  if (
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
  let previousValueMm: number;

  if (mutation.target.kind === "floor_default") {
    const property = floor.defaults[mutation.target.property];
    previousValueMm = property.valueMm;
    property.valueMm = mutation.valueMm;
    property.evidence = mutation.evidence;
    property.provenance = markProvenance(
      property.provenance,
      document,
      targetId,
      mutation.evidence,
      context
    );
  } else if (
    mutation.target.kind === "floor_elevation" ||
    mutation.target.kind === "floor_storey_height" ||
    mutation.target.kind === "floor_slab_thickness"
  ) {
    const propertyName =
      mutation.target.kind === "floor_elevation"
        ? "elevation"
        : mutation.target.kind === "floor_storey_height"
          ? "storeyHeight"
          : "slabThickness";
    previousValueMm =
      propertyName === "elevation"
        ? floor.elevationMm
        : propertyName === "storeyHeight"
          ? floor.storeyHeightMm
          : floor.slabThicknessMm;
    if (propertyName === "elevation") floor.elevationMm = mutation.valueMm;
    else if (propertyName === "storeyHeight") {
      floor.storeyHeightMm = mutation.valueMm;
    } else floor.slabThicknessMm = mutation.valueMm;
    const verticalEvidence = ensureFloorVerticalEvidence(floor);
    const property = verticalEvidence[propertyName];
    property.evidence = mutation.evidence;
    property.provenance = markProvenance(
      property.provenance,
      document,
      targetId,
      mutation.evidence,
      context
    );
  } else if (
    mutation.target.kind === "wall_height" ||
    mutation.target.kind === "wall_base_offset"
  ) {
    const target = mutation.target;
    const wall = floor.walls.find((candidate) => candidate.id === target.wallId);
    if (!wall) fail("UNKNOWN_TARGET", `Unknown wall ${target.wallId}.`);
    const compiledWall = currentScene.floors
      .find((candidate) => candidate.id === floor.id)!
      .walls.find((candidate) => candidate.id === wall.id)!;
    if (target.kind === "wall_height") {
      previousValueMm = compiledWall.heightMm;
      wall.heightMm = mutation.valueMm;
      wall.heightEvidence = mutation.evidence;
    } else {
      previousValueMm = compiledWall.baseOffsetMm;
      wall.baseOffsetMm = mutation.valueMm;
      wall.baseOffsetEvidence = mutation.evidence;
    }
    wall.provenance = markProvenance(
      wall.provenance,
      document,
      targetId,
      mutation.evidence,
      context
    );
  } else if (
    mutation.target.kind === "structure_height" ||
    mutation.target.kind === "structure_base_offset"
  ) {
    const target = mutation.target;
    const structure = floor.structures.find(
      (candidate) => candidate.id === target.structureId
    );
    if (!structure) fail("UNKNOWN_TARGET", `Unknown structure ${target.structureId}.`);
    if (target.kind === "structure_height") {
      previousValueMm = structure.heightMm;
      structure.heightMm = mutation.valueMm;
      structure.heightEvidence = mutation.evidence;
    } else {
      previousValueMm = structure.baseOffsetMm;
      structure.baseOffsetMm = mutation.valueMm;
      structure.baseOffsetEvidence = mutation.evidence;
    }
    structure.provenance = markProvenance(
      structure.provenance,
      document,
      targetId,
      mutation.evidence,
      context
    );
  } else {
    const target = mutation.target;
    const opening = floor.openings.find(
      (candidate) => candidate.id === target.openingId
    );
    if (!opening) fail("UNKNOWN_TARGET", `Unknown opening ${target.openingId}.`);
    const compiledOpening = currentScene.floors
      .find((candidate) => candidate.id === floor.id)!
      .openings.find((candidate) => candidate.id === opening.id)!;
    if (target.kind === "opening_height") {
      previousValueMm = compiledOpening.heightMm;
      opening.heightMm = mutation.valueMm;
      opening.heightEvidence = mutation.evidence;
    } else {
      previousValueMm = compiledOpening.sillHeightMm;
      opening.sillHeightMm = mutation.valueMm;
      opening.sillHeightEvidence = mutation.evidence;
    }
    opening.provenance = markProvenance(
      opening.provenance,
      document,
      targetId,
      mutation.evidence,
      context
    );
  }

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

export function floorPlanPropertyEvidenceLabel(
  evidence: FloorPlanPropertyEvidenceV2
): string {
  if (evidence === "source_documented") return "Source documented";
  if (evidence === "user_confirmed") return "User confirmed";
  if (evidence === "site_measured") return "Site measured";
  return "Assumed";
}

export function floorPlanPropertyEvidenceIsEditable(
  evidence: FloorPlanPropertyEvidenceV2
): boolean {
  return evidence === "assumed" || evidence === "user_confirmed";
}
