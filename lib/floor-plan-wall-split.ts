import type { FloorPlanFloorV2, FloorPlanVertexV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutation-types";
import { assertTopologyInteger as assertInteger, assertUnusedGlobalEntityId, demoteTopologyProvenance as demoteProvenance, topologyMutationFail as fail, type FloorPlanTopologyMutationStateV2 as MutationState } from "@/lib/floor-plan-topology-mutation-support";

function remapWallSpansAfterSplit(
  floor: FloorPlanFloorV2,
  wallId: string,
  newWallId: string,
  splitOffsetMm: number,
  state: MutationState
): void {
  for (const opening of floor.openings) {
    if (opening.wallId !== wallId) continue;
    const end = opening.offsetMm + opening.widthMm;
    if (opening.offsetMm < splitOffsetMm && end > splitOffsetMm) {
      fail("SPAN_CROSSES_SPLIT", `Opening ${opening.id} crosses the requested wall split.`);
    }
    if (opening.offsetMm >= splitOffsetMm) {
      assertInteger(opening.offsetMm - splitOffsetMm, "Rehosted opening offset; choose an exact millimetre split clear of this opening");
      opening.wallId = newWallId;
      opening.offsetMm -= splitOffsetMm;
      opening.provenance = demoteProvenance(
        opening.provenance,
        opening.id,
        `Remapped opening after splitting wall ${wallId}`,
        state
      );
    }
  }
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind !== "wall_span" || annotation.geometry.wallId !== wallId) continue;
    const end = annotation.geometry.offsetMm + annotation.geometry.widthMm;
    if (annotation.geometry.offsetMm < splitOffsetMm && end > splitOffsetMm) {
      fail("SPAN_CROSSES_SPLIT", `Annotation ${annotation.id} crosses the requested wall split.`);
    }
    if (annotation.geometry.offsetMm >= splitOffsetMm) {
      assertInteger(annotation.geometry.offsetMm - splitOffsetMm, "Rehosted annotation offset");
      annotation.geometry.wallId = newWallId;
      annotation.geometry.offsetMm -= splitOffsetMm;
      annotation.provenance = demoteProvenance(
        annotation.provenance,
        annotation.id,
        `Remapped annotation after splitting wall ${wallId}`,
        state
      );
    }
  }
}

export function splitWall(
  floor: FloorPlanFloorV2,
  operation: Extract<FloorPlanTopologyMutationV2, { kind: "split_wall" }>,
  state: MutationState,
  existingVertex?: FloorPlanVertexV2
): void {
  if (!existingVertex) {
    assertInteger(operation.offsetMm, "Wall split offset");
    assertUnusedGlobalEntityId(state.document, operation.newVertexId, "Split vertex ID");
  }
  assertUnusedGlobalEntityId(state.document, operation.newWallId, "Split wall ID");
  if (operation.newVertexId === operation.newWallId) {
    fail("DUPLICATE_ENTITY_ID", "The new split wall and vertex need different IDs.");
  }
  const wallIndex = floor.walls.findIndex((candidate) => candidate.id === operation.wallId);
  if (wallIndex < 0) fail("UNKNOWN_WALL", `Unknown wall: ${operation.wallId}.`);
  const wall = floor.walls[wallIndex];
  if (wall.path.kind !== "line") {
    fail("ARC_MUTATION_UNSUPPORTED", `Wall ${wall.id} is an arc and cannot be split by this operation.`);
  }
  const start = floor.vertices.find((vertex) => vertex.id === wall.path.startVertexId)!;
  const end = floor.vertices.find((vertex) => vertex.id === wall.path.endVertexId)!;
  const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  if (operation.offsetMm <= 0 || operation.offsetMm >= length) {
    fail("INVALID_SPLIT", `Wall ${wall.id} must be split strictly between its endpoints.`);
  }
  const ratio = operation.offsetMm / length;
  const splitX = existingVertex?.xMm ?? start.xMm + (end.xMm - start.xMm) * ratio;
  const splitZ = existingVertex?.zMm ?? start.zMm + (end.zMm - start.zMm) * ratio;
  if (!Number.isSafeInteger(splitX) || !Number.isSafeInteger(splitZ)) {
    fail("NON_INTEGER_MILLIMETRES", "The requested split does not land on an exact integer-mm point.");
  }
  if ((splitX - start.xMm) * (end.zMm - start.zMm) !== (splitZ - start.zMm) * (end.xMm - start.xMm)) {
    fail("INVALID_SPLIT", "The attachment point must lie exactly on the wall centreline.");
  }
  commitSplit(floor, operation, state, wallIndex, { xMm: splitX, zMm: splitZ }, existingVertex);
}

function commitSplit(
  floor: FloorPlanFloorV2, operation: Extract<FloorPlanTopologyMutationV2, { kind: "split_wall" }>,
  state: MutationState, wallIndex: number, point: { xMm: number; zMm: number }, existingVertex?: FloorPlanVertexV2
) {
  const wall = floor.walls[wallIndex];
  const start = floor.vertices.find((vertex) => vertex.id === wall.path.startVertexId)!;
  remapWallSpansAfterSplit(floor, wall.id, operation.newWallId, operation.offsetMm, state);
  const originalEndVertexId = wall.path.endVertexId;
  const reason = `Split wall ${wall.id} at ${operation.offsetMm} mm`;
  const vertex: FloorPlanVertexV2 = {
    id: operation.newVertexId,
    ...point,
    provenance: demoteProvenance(start.provenance, operation.newVertexId, reason, state),
  };
  wall.path.endVertexId = operation.newVertexId;
  wall.provenance = demoteProvenance(wall.provenance, wall.id, reason, state);
  const newWall: FloorPlanWallV2 = {
    ...wall,
    id: operation.newWallId,
    path: {
      kind: "line",
      startVertexId: operation.newVertexId,
      endVertexId: originalEndVertexId,
    },
    adjacentRoomIds: [...wall.adjacentRoomIds],
    provenance: demoteProvenance(wall.provenance, operation.newWallId, reason, state),
  };
  if (!existingVertex) floor.vertices.push(vertex);
  floor.walls.splice(wallIndex + 1, 0, newWall);

  updateSplitRoomLoops(floor, wall, newWall, reason, state);
}

function updateSplitRoomLoops(floor: FloorPlanFloorV2, wall: FloorPlanWallV2, newWall: FloorPlanWallV2, reason: string, state: MutationState) {
  for (const room of floor.rooms) {
    let changed = false;
    for (const loop of room.wallLoops) {
      loop.walls = loop.walls.flatMap((reference) => {
        if (reference.wallId !== wall.id) return [reference];
        changed = true;
        return reference.direction === "forward"
          ? [reference, { wallId: newWall.id, direction: "forward" as const }]
          : [
              { wallId: newWall.id, direction: "reverse" as const },
              reference,
            ];
      });
    }
    if (changed) room.provenance = demoteProvenance(room.provenance, room.id, reason, state);
  }
}
