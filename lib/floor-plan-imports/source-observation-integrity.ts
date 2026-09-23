import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanSourceObservation,
  FloorPlanSourceObservationIssue,
} from "./source-observation-manifest";

export type FloorPlanCanonicalObservationTarget = {
  kind: FloorPlanSourceObservation["kind"];
  floorId: string;
  entityId: string;
  measuredMm?: number;
  labelText?: string;
  labelRoomType?: string;
  provenance: FloorPlanEntityProvenanceV2;
  requiredAnchorRoles?: Array<"start" | "midpoint" | "end">;
};

export function collectFloorPlanCanonicalObservationTargets(
  document: FloorPlanDocumentV2
): FloorPlanCanonicalObservationTarget[] {
  return document.floors.flatMap((floor) => [
    ...floor.walls.map((entity) => ({
      kind: "wall" as const,
      floorId: floor.id,
      entityId: entity.id,
      provenance: entity.provenance,
      requiredAnchorRoles: entity.path.kind === "arc"
        ? ["start" as const, "midpoint" as const, "end" as const]
        : ["start" as const, "end" as const],
    })),
    ...floor.openings.map((entity) => ({
      kind: "opening" as const,
      floorId: floor.id,
      entityId: entity.id,
      provenance: entity.provenance,
      requiredAnchorRoles: ["start" as const, "end" as const],
    })),
    ...floor.structures.map((entity) => ({
      kind: "structure" as const,
      floorId: floor.id,
      entityId: entity.id,
      provenance: entity.provenance,
    })),
    ...floor.rooms.map((entity) => ({
      kind: "label" as const,
      floorId: floor.id,
      entityId: entity.id,
      labelText: entity.name,
      labelRoomType: entity.roomType,
      provenance: entity.provenance,
    })),
    ...floor.annotations.map((entity) => ({
      kind: "label" as const,
      floorId: floor.id,
      entityId: entity.id,
      labelText: entity.text,
      provenance: entity.provenance,
    })),
    ...floor.dimensions.map((entity) => ({
      kind: "dimension" as const,
      floorId: floor.id,
      entityId: entity.id,
      measuredMm: entity.measuredMm,
      provenance: entity.provenance,
    })),
  ]);
}

function normalizeObservedLabel(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Deliberately small, explicit equivalence groups for common plan wording.
 * Unknown synonyms fail closed; reviewers must correct the canonical label or
 * record the text exactly instead of relying on broad semantic guessing.
 */
const SUPPORTED_LABEL_EQUIVALENCE_GROUPS = [
  ["living room", "living"],
  ["living dining", "living and dining"],
  ["main bedroom", "master bedroom"],
  ["bath wc", "bath and wc", "bathroom", "bathroom wc"],
  ["household shelter", "hs"],
] as const;

function sourceLabelMatchesCanonical(observedText: string, canonicalText: string) {
  const observed = normalizeObservedLabel(observedText);
  const canonical = normalizeObservedLabel(canonicalText);
  if (observed === canonical) return true;
  return SUPPORTED_LABEL_EQUIVALENCE_GROUPS.some(
    (group) =>
      group.some((entry) => entry === observed) &&
      group.some((entry) => entry === canonical)
  );
}

function sourceLabelMatchesRoomType(observedText: string, roomType: string) {
  const observed = normalizeObservedLabel(observedText);
  switch (normalizeObservedLabel(roomType).replace(/ /g, "_")) {
    case "living":
    case "living_room":
      return /^(living|living room|living dining|living and dining)$/.test(observed);
    case "dining":
    case "dining_room":
      return /^(dining|dining room|living dining|living and dining)$/.test(observed);
    case "bedroom":
      return /^(main |master )?bedroom(?: [0-9]+)?$/.test(observed);
    case "kitchen":
      return observed === "kitchen";
    case "toilet":
    case "bathroom":
      return /^(bath wc|bath and wc|bathroom|bathroom wc|toilet)(?: [0-9]+)?$/.test(observed);
    case "study":
    case "home_office":
      return /^(study|study room|home office)$/.test(observed);
    case "custom":
    case "other":
      return true;
    default:
      return false;
  }
}

function sortedAnchorFingerprint(
  anchors: Array<{ pageNumber: number; role: string; xPx: number; yPx: number }>
) {
  return anchors
    .map((anchor) => `${anchor.pageNumber}:${anchor.role}:${anchor.xPx}:${anchor.yPx}`)
    .sort()
    .join("|");
}

function validateObservationAnchorLinkage(input: {
  observation: FloorPlanSourceObservation;
  target: FloorPlanCanonicalObservationTarget;
  sourceId: string;
}): FloorPlanSourceObservationIssue[] {
  const requiredRoles = input.target.requiredAnchorRoles;
  if (!requiredRoles) return [];
  const observedRoles = input.observation.anchorsPx.map((anchor) => anchor.role).sort();
  const expectedRoles = [...requiredRoles].sort();
  if (
    observedRoles.length !== expectedRoles.length ||
    observedRoles.some((role, index) => role !== expectedRoles[index])
  ) {
    return [{
      code: "OBSERVATION_ANCHOR_ROLE_MISMATCH",
      message: `${input.observation.kind} observations require exactly ${requiredRoles.join(", ")} anchors`,
      observationId: input.observation.id,
      canonicalEntityId: input.observation.canonicalEntityId,
    }];
  }

  const observed = input.observation.anchorsPx.map((anchor) => ({
    pageNumber: input.observation.pageNumber,
    role: anchor.role,
    xPx: anchor.xPx,
    yPx: anchor.yPx,
  }));
  const provenance = input.target.provenance.evidence
    .filter((evidence) => evidence.sourceId === input.sourceId)
    .flatMap((evidence) =>
      (evidence.sourceAnchors ?? []).map((anchor) => ({
        pageNumber: evidence.pageNumber ?? -1,
        role: anchor.role,
        xPx: anchor.sourcePx.x,
        yPx: anchor.sourcePx.y,
      }))
    );
  if (sortedAnchorFingerprint(observed) === sortedAnchorFingerprint(provenance)) {
    return [];
  }
  return [{
    code: "OBSERVATION_PROVENANCE_ANCHOR_MISMATCH",
    message: "Independent source anchors must exactly match the canonical entity's primary-source page, roles and pixels",
    observationId: input.observation.id,
    canonicalEntityId: input.observation.canonicalEntityId,
  }];
}

export function validateFloorPlanObservationTargetIntegrity(input: {
  observation: FloorPlanSourceObservation;
  target: FloorPlanCanonicalObservationTarget;
  sourceId: string;
}): FloorPlanSourceObservationIssue[] {
  const issues: FloorPlanSourceObservationIssue[] = [];
  if (
    input.observation.kind === "label" &&
    input.target.labelText &&
    !sourceLabelMatchesCanonical(
      input.observation.observedText ?? "",
      input.target.labelText
    )
  ) {
    issues.push({
      code: "OBSERVED_LABEL_MISMATCH",
      message: `Visible label “${input.observation.observedText ?? ""}” does not match canonical label “${input.target.labelText}”`,
      observationId: input.observation.id,
      canonicalEntityId: input.observation.canonicalEntityId,
    });
  }
  if (
    input.observation.kind === "label" &&
    input.target.labelRoomType &&
    !sourceLabelMatchesRoomType(
      input.observation.observedText ?? "",
      input.target.labelRoomType
    )
  ) {
    issues.push({
      code: "OBSERVED_LABEL_TYPE_MISMATCH",
      message: `Visible label “${input.observation.observedText ?? ""}” is not compatible with canonical room type “${input.target.labelRoomType}”`,
      observationId: input.observation.id,
      canonicalEntityId: input.observation.canonicalEntityId,
    });
  }
  issues.push(...validateObservationAnchorLinkage(input));
  return issues;
}
