import { updateAnnotationText } from "@/lib/floor-plan-annotation-mutations";
import { splitWall } from "@/lib/floor-plan-wall-split";
import { compileFloorPlanDocumentV2, FloorPlanDocumentValidationErrorV2 } from "@/lib/floor-plan-compiler-v2";
import { addCanonicalPartition, removeCanonicalPartition } from "@/lib/floor-plan-partition-mutations";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanPointMmV2,
} from "@/lib/floor-plan-document-v2";
import {
  mutateFloorPlanDimensionV2,
  mutateFloorPlanOpeningV2,
  mutateFloorPlanStructureV2,
  type FloorPlanEntityMutationServicesV2,
} from "@/lib/floor-plan-structure-dimension-mutations";
import {
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanTopologyMutationContextV2,
  type FloorPlanTopologyMutationResultV2,
  type FloorPlanTopologyMutationV2,
  type FloorPlanWallChangesV2,
} from "@/lib/floor-plan-topology-mutation-types";
import {
  TOPOLOGY_ID_PATTERN as ID_PATTERN,
  addTopologyStructureVertices as validateNewVertices,
  assertKnownFloorVertices as assertKnownVertices,
  assertTopologyInteger as assertInteger,
  assertUnusedGlobalEntityId,
  demoteTopologyProvenance as demoteProvenance,
  approveOpeningEvidenceOverride,
  inferredTopologyProvenance as inferredProvenanceForNewEntity,
  pruneUnreferencedFloorVertices as pruneUnreferencedStructureVertices,
  topologyMutationFail as fail,
  type FloorPlanTopologyMutationStateV2 as MutationState,
} from "@/lib/floor-plan-topology-mutation-support";

export {
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanOpeningChangesV2,
  type FloorPlanOpeningDraftV2,
  type FloorPlanDimensionChangesV2,
  type FloorPlanDimensionDraftV2,
  type FloorPlanStructureChangesV2,
  type FloorPlanStructureDraftV2,
  type FloorPlanVertexDraftV2,
  type FloorPlanTopologyMutationContextV2,
  type FloorPlanTopologyMutationErrorCodeV2,
  type FloorPlanTopologyMutationResultV2,
  type FloorPlanTopologyMutationV2,
  type FloorPlanWallChangesV2,
} from "@/lib/floor-plan-topology-mutation-types";

function validateContext(context: FloorPlanTopologyMutationContextV2): void {
  if (!ID_PATTERN.test(context.mutationId) || !ID_PATTERN.test(context.nextRevisionId)) {
    fail("INVALID_CONTEXT", "Mutation and revision IDs must be stable ASCII identifiers.");
  }
  if (!context.actorId.trim() || Number.isNaN(Date.parse(context.mutatedAt))) {
    fail("INVALID_CONTEXT", "A mutation requires an actor and ISO-compatible timestamp.");
  }
  if (context.extractionVersion !== undefined && !context.extractionVersion.trim()) {
    fail("INVALID_CONTEXT", "Mutation extractionVersion cannot be empty.");
  }
}

function floorById(document: FloorPlanDocumentV2, floorId: string): FloorPlanFloorV2 {
  const floor = document.floors.find((candidate) => candidate.id === floorId);
  if (!floor) fail("UNKNOWN_FLOOR", `Unknown floor: ${floorId}.`);
  return floor;
}

function rejectArcVertexMutation(floor: FloorPlanFloorV2, vertexIds: Set<string>): void {
  const arc = floor.walls.find(
    (wall) =>
      wall.path.kind === "arc" &&
      [wall.path.startVertexId, wall.path.endVertexId, wall.path.centerVertexId].some(
        (vertexId) => vertexIds.has(vertexId)
      )
  );
  if (arc) {
    fail(
      "ARC_MUTATION_UNSUPPORTED",
      `Wall ${arc.id} is an arc; its constrained vertices cannot be moved by the straight-wall editor.`
    );
  }
}

function markVertexDependants(
  floor: FloorPlanFloorV2,
  vertexIds: Set<string>,
  reason: string,
  state: MutationState
): void {
  const affectedWallIds = new Set<string>();
  for (const vertex of floor.vertices) {
    if (vertexIds.has(vertex.id)) {
      vertex.provenance = demoteProvenance(vertex.provenance, vertex.id, reason, state);
    }
  }
  for (const wall of floor.walls) {
    if (
      vertexIds.has(wall.path.startVertexId) ||
      vertexIds.has(wall.path.endVertexId)
    ) {
      affectedWallIds.add(wall.id);
      wall.provenance = demoteProvenance(wall.provenance, wall.id, reason, state);
    }
  }
  for (const room of floor.rooms) {
    if (room.wallLoops.some((loop) => loop.walls.some((ref) => affectedWallIds.has(ref.wallId)))) {
      room.provenance = demoteProvenance(room.provenance, room.id, reason, state);
    }
  }
  for (const opening of floor.openings) {
    if (affectedWallIds.has(opening.wallId)) {
      opening.provenance = demoteProvenance(opening.provenance, opening.id, reason, state);
    }
  }
  for (const structure of floor.structures) {
    if (structure.vertexIds.some((id) => vertexIds.has(id))) {
      structure.provenance = demoteProvenance(structure.provenance, structure.id, reason, state);
    }
  }
  for (const annotation of floor.annotations) {
    const geometry = annotation.geometry;
    const affected =
      (geometry.kind === "point" && vertexIds.has(geometry.vertexId)) ||
      ("vertexIds" in geometry && geometry.vertexIds.some((id) => vertexIds.has(id))) ||
      (geometry.kind === "wall_span" && affectedWallIds.has(geometry.wallId));
    if (affected) {
      annotation.provenance = demoteProvenance(annotation.provenance, annotation.id, reason, state);
    }
  }
  for (const dimension of floor.dimensions) {
    if (vertexIds.has(dimension.fromVertexId) || vertexIds.has(dimension.toVertexId)) {
      dimension.measuredMm = updatedDimensionMeasurement(floor, dimension);
      dimension.label = undefined; // Historical printed text remains in the immutable original.
      dimension.provenance = demoteProvenance(dimension.provenance, dimension.id, reason, state);
    }
  }
}

function updatedDimensionMeasurement(floor: FloorPlanFloorV2, dimension: FloorPlanFloorV2["dimensions"][number]) {
  const from = floor.vertices.find(({ id }) => id === dimension.fromVertexId)!;
  const to = floor.vertices.find(({ id }) => id === dimension.toVertexId)!;
  if (dimension.axis === "horizontal") return Math.abs(to.xMm - from.xMm);
  if (dimension.axis === "vertical") return Math.abs(to.zMm - from.zMm);
  return Math.round(Math.hypot(to.xMm - from.xMm, to.zMm - from.zMm));
}

function moveVertex(
  floor: FloorPlanFloorV2,
  vertexId: string,
  to: FloorPlanPointMmV2,
  state: MutationState
): void {
  assertInteger(to.xMm, "Vertex x");
  assertInteger(to.zMm, "Vertex z");
  const vertex = floor.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex) fail("UNKNOWN_VERTEX", `Unknown vertex: ${vertexId}.`);
  if (vertex.xMm === to.xMm && vertex.zMm === to.zMm) {
    fail("NO_OP_MUTATION", `Vertex ${vertexId} is already at the requested position.`);
  }
  rejectArcVertexMutation(floor, new Set([vertexId]));
  vertex.xMm = to.xMm;
  vertex.zMm = to.zMm;
  markVertexDependants(floor, new Set([vertexId]), `Moved vertex ${vertexId}`, state);
}

function moveWall(
  floor: FloorPlanFloorV2,
  wallId: string,
  deltaXMm: number,
  deltaZMm: number,
  state: MutationState
): void {
  assertInteger(deltaXMm, "Wall x delta");
  assertInteger(deltaZMm, "Wall z delta");
  if (deltaXMm === 0 && deltaZMm === 0) fail("NO_OP_MUTATION", "Wall translation cannot be zero.");
  const wall = floor.walls.find((candidate) => candidate.id === wallId);
  if (!wall) fail("UNKNOWN_WALL", `Unknown wall: ${wallId}.`);
  if (wall.path.kind !== "line") {
    fail("ARC_MUTATION_UNSUPPORTED", `Wall ${wallId} is an arc and cannot be translated by this operation.`);
  }
  const vertexIds = new Set([wall.path.startVertexId, wall.path.endVertexId]);
  rejectArcVertexMutation(floor, vertexIds);
  for (const vertex of floor.vertices) {
    if (vertexIds.has(vertex.id)) {
      assertInteger(vertex.xMm + deltaXMm, `Moved vertex ${vertex.id} x`);
      assertInteger(vertex.zMm + deltaZMm, `Moved vertex ${vertex.id} z`);
      vertex.xMm += deltaXMm;
      vertex.zMm += deltaZMm;
    }
  }
  markVertexDependants(floor, vertexIds, `Moved wall ${wallId}`, state);
}

function updateWall(
  floor: FloorPlanFloorV2,
  wallId: string,
  changes: FloorPlanWallChangesV2,
  state: MutationState
): void {
  const wall = floor.walls.find((candidate) => candidate.id === wallId);
  if (!wall) fail("UNKNOWN_WALL", `Unknown wall: ${wallId}.`);
  if (changes.thicknessMm !== undefined) {
    assertInteger(changes.thicknessMm, "Wall thickness");
  }
  const changedKeys = Object.keys(changes) as Array<keyof FloorPlanWallChangesV2>;
  if (!changedKeys.length || changedKeys.every((key) => changes[key] === wall[key])) {
    fail("NO_OP_MUTATION", `Wall ${wallId} update has no changes.`);
  }
  Object.assign(wall, changes);
  if (changes.heightMm !== undefined) wall.heightEvidence = "user_confirmed";
  if (changes.baseOffsetMm !== undefined) wall.baseOffsetEvidence = "user_confirmed";
  wall.provenance = demoteProvenance(
    wall.provenance,
    wall.id,
    `Updated wall ${wall.id}`,
    state
  );
}

function entityMutationServices(
  floor: FloorPlanFloorV2,
  state: MutationState
): FloorPlanEntityMutationServicesV2 {
  return {
    actorId: state.context.actorId,
    changedIds: state.changedIds,
    fail,
    assertInteger,
    assertUnusedGlobalId: (id, label) =>
      assertUnusedGlobalEntityId(state.document, id, label),
    assertKnownVertices: (ids) => assertKnownVertices(floor, ids),
    addNewVertices: (vertices, ids) =>
      validateNewVertices(floor, vertices, ids, state),
    pruneUnreferencedVertices: (ids) =>
      pruneUnreferencedStructureVertices(floor, ids, state),
    inferredProvenance: (id, reason) =>
      inferredProvenanceForNewEntity(floor, id, reason, state),
    demoteProvenance: (provenance, id, reason) =>
      demoteProvenance(provenance, id, reason, state),
    approveOpeningEvidenceOverride: (provenance, id, authorization) => approveOpeningEvidenceOverride(provenance, id, authorization, state),
  };
}

function applyOperation(state: MutationState, operation: FloorPlanTopologyMutationV2): void {
  const floor = floorById(state.document, operation.floorId);
  if (operation.kind === "update_annotation_text") return updateAnnotationText(floor, operation.annotationId, operation.text, state);
  if (operation.kind === "add_wall") return addCanonicalPartition(floor, operation, state);
  if (operation.kind === "remove_wall") return removeCanonicalPartition(floor, operation, state);
  if (operation.kind === "move_vertex") return moveVertex(floor, operation.vertexId, operation.to, state);
  if (operation.kind === "move_wall") {
    return moveWall(floor, operation.wallId, operation.deltaXMm, operation.deltaZMm, state);
  }
  if (operation.kind === "update_wall") {
    return updateWall(floor, operation.wallId, operation.changes, state);
  }
  if (operation.kind === "split_wall") return splitWall(floor, operation, state);
  if (
    operation.kind === "add_opening" ||
    operation.kind === "update_opening" ||
    operation.kind === "remove_opening"
  ) {
    return mutateFloorPlanOpeningV2(
      floor,
      operation,
      entityMutationServices(floor, state)
    );
  }
  if (
    operation.kind === "add_structure" ||
    operation.kind === "update_structure" ||
    operation.kind === "remove_structure"
  ) {
    return mutateFloorPlanStructureV2(
      floor,
      operation,
      entityMutationServices(floor, state)
    );
  }
  return mutateFloorPlanDimensionV2(
    floor,
    operation,
    entityMutationServices(floor, state)
  );
}

export function applyFloorPlanTopologyMutationsV2(
  source: FloorPlanDocumentV2,
  operations: readonly FloorPlanTopologyMutationV2[],
  context: FloorPlanTopologyMutationContextV2
): FloorPlanTopologyMutationResultV2 {
  validateContext(context);
  if (!operations.length) fail("NO_OP_MUTATION", "At least one topology operation is required.");
  if (context.nextRevisionId === source.revisionId) {
    fail("INVALID_CONTEXT", "A topology mutation must create a distinct immutable revision ID.");
  }
  try {
    compileFloorPlanDocumentV2(source);
  } catch (error) {
    if (error instanceof FloorPlanDocumentValidationErrorV2) {
      throw new FloorPlanTopologyMutationErrorV2(
        "INVALID_SOURCE_DOCUMENT",
        "The source floor-plan document is invalid and cannot be edited safely.",
        error.issues
      );
    }
    throw error;
  }

  const document = structuredClone(source);
  document.parentRevisionId = source.revisionId;
  document.revisionId = context.nextRevisionId;
  document.createdAt = context.mutatedAt;
  document.verification = {
    tier: "needs_review",
    criticalIssueIds: Array.from(
      new Set([...source.verification.criticalIssueIds, `topology-mutation:${context.mutationId}`])
    ).sort(),
  };
  const state: MutationState = {
    document,
    context,
    changedIds: new Set<string>(),
    operationIndex: 0,
  };
  operations.forEach((operation, index) => {
    state.operationIndex = index;
    applyOperation(state, operation);
  });

  try {
    const scene = compileFloorPlanDocumentV2(document);
    return {
      document,
      scene,
      changedEntityIds: [...state.changedIds].sort(),
    };
  } catch (error) {
    if (error instanceof FloorPlanDocumentValidationErrorV2) {
      throw new FloorPlanTopologyMutationErrorV2(
        "MUTATION_VALIDATION_FAILED",
        "The mutation was rejected because it would create invalid canonical geometry.",
        error.issues
      );
    }
    throw error;
  }
}

export function applyFloorPlanTopologyMutationV2(
  source: FloorPlanDocumentV2,
  operation: FloorPlanTopologyMutationV2,
  context: FloorPlanTopologyMutationContextV2
): FloorPlanTopologyMutationResultV2 {
  return applyFloorPlanTopologyMutationsV2(source, [operation], context);
}
