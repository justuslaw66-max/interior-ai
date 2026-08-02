import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import {
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanTopologyMutationContextV2,
  type FloorPlanTopologyMutationErrorCodeV2,
  type FloorPlanVertexDraftV2,
} from "@/lib/floor-plan-topology-mutation-types";

const MUTATION_EXTRACTION_VERSION = "floor-plan-topology-editor-v1";
export const TOPOLOGY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

export type FloorPlanTopologyMutationStateV2 = {
  document: FloorPlanDocumentV2;
  context: FloorPlanTopologyMutationContextV2;
  changedIds: Set<string>;
  operationIndex: number;
};

type FloorEntityCollection =
  | "calibrations"
  | "vertices"
  | "walls"
  | "rooms"
  | "openings"
  | "structures"
  | "annotations"
  | "dimensions";

const FLOOR_ENTITY_COLLECTIONS: FloorEntityCollection[] = [
  "calibrations",
  "vertices",
  "walls",
  "rooms",
  "openings",
  "structures",
  "annotations",
  "dimensions",
];

export function topologyMutationFail(
  code: FloorPlanTopologyMutationErrorCodeV2,
  message: string
): never {
  throw new FloorPlanTopologyMutationErrorV2(code, message);
}

export function assertTopologyInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    topologyMutationFail(
      "NON_INTEGER_MILLIMETRES",
      `${label} must be a safe integer millimetre value.`
    );
  }
}

function hasGlobalEntityId(document: FloorPlanDocumentV2, id: string): boolean {
  if (document.sources.some((source) => source.id === id)) return true;
  return document.floors.some(
    (floor) =>
      floor.id === id ||
      FLOOR_ENTITY_COLLECTIONS.some((collection) =>
        floor[collection].some((entity) => entity.id === id)
      )
  );
}

export function assertUnusedGlobalEntityId(
  document: FloorPlanDocumentV2,
  id: string,
  label: string
): void {
  if (!TOPOLOGY_ID_PATTERN.test(id)) {
    topologyMutationFail(
      "INVALID_ENTITY_ID",
      `${label} must be a stable ASCII identifier.`
    );
  }
  if (hasGlobalEntityId(document, id)) {
    topologyMutationFail(
      "DUPLICATE_ENTITY_ID",
      `${label} ${id} is already in use.`
    );
  }
}

export function demoteTopologyProvenance(
  provenance: FloorPlanEntityProvenanceV2,
  entityId: string,
  reason: string,
  state: FloorPlanTopologyMutationStateV2
): FloorPlanEntityProvenanceV2 {
  const extractionVersion =
    state.context.extractionVersion ?? MUTATION_EXTRACTION_VERSION;
  const reviewId = `${state.context.mutationId}:${state.operationIndex}:${entityId}`;
  state.changedIds.add(entityId);
  return {
    confidence: Math.min(provenance.confidence, 0.5),
    extractionVersion,
    evidence: provenance.evidence.map((evidence) => ({
      ...evidence,
      basis: "inferred",
      confidence: Math.min(evidence.confidence, 0.5),
      extractorVersion: extractionVersion,
      calibrationId: undefined,
      sourceAnchors: undefined,
      note: [evidence.note, `${reason}; source registration requires review.`]
        .filter(Boolean)
        .join(" "),
    })),
    reviewHistory: [
      ...provenance.reviewHistory.filter((record) => record.id !== reviewId),
      {
        id: reviewId,
        action: "corrected",
        reviewerId: state.context.actorId,
        reviewedAt: state.context.mutatedAt,
        note: [reason, state.context.note, "Needs independent review."]
          .filter(Boolean)
          .join(" "),
      },
    ],
  };
}

export function inferredTopologyProvenance(
  floor: FloorPlanFloorV2,
  entityId: string,
  reason: string,
  state: FloorPlanTopologyMutationStateV2
): FloorPlanEntityProvenanceV2 {
  const seed =
    floor.vertices[0]?.provenance ?? floor.defaults.wallHeight.provenance;
  return demoteTopologyProvenance(seed, entityId, reason, state);
}

export function addTopologyStructureVertices(
  floor: FloorPlanFloorV2,
  vertices: readonly FloorPlanVertexDraftV2[],
  referencedVertexIds: ReadonlySet<string>,
  state: FloorPlanTopologyMutationStateV2
): void {
  const operationIds = new Set<string>();
  for (const vertex of vertices) {
    assertUnusedGlobalEntityId(state.document, vertex.id, "Vertex ID");
    if (operationIds.has(vertex.id)) {
      topologyMutationFail(
        "DUPLICATE_ENTITY_ID",
        `Vertex ID ${vertex.id} is repeated in this operation.`
      );
    }
    operationIds.add(vertex.id);
    assertTopologyInteger(vertex.xMm, `Vertex ${vertex.id} x`);
    assertTopologyInteger(vertex.zMm, `Vertex ${vertex.id} z`);
    if (!referencedVertexIds.has(vertex.id)) {
      topologyMutationFail(
        "UNREFERENCED_NEW_VERTEX",
        `New vertex ${vertex.id} must be referenced by the structure being edited.`
      );
    }
  }
  for (const vertex of vertices) {
    floor.vertices.push({
      ...vertex,
      provenance: inferredTopologyProvenance(
        floor,
        vertex.id,
        `Added structure vertex ${vertex.id}`,
        state
      ),
    });
  }
}

export function assertKnownFloorVertices(
  floor: FloorPlanFloorV2,
  vertexIds: readonly string[]
): void {
  const known = new Set(floor.vertices.map((vertex) => vertex.id));
  const missing = vertexIds.find((vertexId) => !known.has(vertexId));
  if (missing) topologyMutationFail("UNKNOWN_VERTEX", `Unknown vertex: ${missing}.`);
}

function vertexHasReference(floor: FloorPlanFloorV2, vertexId: string): boolean {
  if (
    floor.walls.some(
      (wall) =>
        wall.path.startVertexId === vertexId ||
        wall.path.endVertexId === vertexId ||
        (wall.path.kind === "arc" && wall.path.centerVertexId === vertexId)
    ) ||
    floor.structures.some((structure) => structure.vertexIds.includes(vertexId))
  ) {
    return true;
  }
  if (
    floor.annotations.some((annotation) => {
      const geometry = annotation.geometry;
      return (
        (geometry.kind === "point" && geometry.vertexId === vertexId) ||
        (geometry.kind === "polygon" && geometry.vertexIds.includes(vertexId))
      );
    })
  ) {
    return true;
  }
  return floor.dimensions.some(
    (dimension) =>
      dimension.fromVertexId === vertexId || dimension.toVertexId === vertexId
  );
}

export function pruneUnreferencedFloorVertices(
  floor: FloorPlanFloorV2,
  candidateIds: ReadonlySet<string>,
  state: FloorPlanTopologyMutationStateV2
): void {
  floor.vertices = floor.vertices.filter((vertex) => {
    if (!candidateIds.has(vertex.id) || vertexHasReference(floor, vertex.id)) {
      return true;
    }
    state.changedIds.add(vertex.id);
    return false;
  });
}
