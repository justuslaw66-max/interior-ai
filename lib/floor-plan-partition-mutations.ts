import type { FloorPlanFloorV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutation-types";
import {
  addTopologyStructureVertices, assertKnownFloorVertices, assertUnusedGlobalEntityId,
  inferredTopologyProvenance, topologyMutationFail as fail,
  type FloorPlanTopologyMutationStateV2 as State,
} from "@/lib/floor-plan-topology-mutation-support";
import { divideRoomAtAddedWall, mergeRoomsAtRemovedWall, refreshPartitionAdjacency } from "@/lib/floor-plan-partition-rooms";
import { assertStraightPartitionFloor, partitionLoopPoints } from "@/lib/floor-plan-partition-boundaries";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import { attachPartitionEndpoint } from "@/lib/floor-plan-wall-attachment";

type Add = Extract<FloorPlanTopologyMutationV2, { kind: "add_wall" }>;
type Remove = Extract<FloorPlanTopologyMutationV2, { kind: "remove_wall" }>;

function assertInteriorPartition(floor: FloorPlanFloorV2, operation: Add) {
  const start = floor.vertices.find(({ id }) => id === operation.startVertexId)!;
  const end = floor.vertices.find(({ id }) => id === operation.endVertexId)!;
  const midpoint = { xMm: (start.xMm + end.xMm) / 2, zMm: (start.zMm + end.zMm) / 2 };
  const inside = floor.rooms.some((room) => {
    const outer = room.wallLoops.find((loop) => loop.kind === "outer");
    return outer && isPointInPlanarRing(midpoint, partitionLoopPoints(floor, outer)) &&
      !room.wallLoops.some((loop) => loop.kind === "hole" && isPointInPlanarRing(midpoint, partitionLoopPoints(floor, loop)));
  });
  if (!inside) fail("UNRESOLVED_BOUNDARY", "Place the partition inside an existing room, clear of holes and the exterior envelope.");
}

export function addCanonicalPartition(floor: FloorPlanFloorV2, operation: Add, state: State) {
  assertStraightPartitionFloor(floor);
  assertUnusedGlobalEntityId(state.document, operation.wallId, "New wall ID");
  const ids = [operation.startVertexId, operation.endVertexId];
  addTopologyStructureVertices(floor, operation.vertices ?? [], new Set(ids), state);
  assertUnusedGlobalEntityId(state.document, operation.wallId, "New wall ID");
  assertKnownFloorVertices(floor, ids);
  assertInteriorPartition(floor, operation);
  const attachedIds = ids.map((id) => attachPartitionEndpoint(floor, id, state));
  const wall = {
    id: operation.wallId,
    path: { kind: "line" as const, startVertexId: attachedIds[0], endVertexId: attachedIds[1] },
    thicknessMm: operation.thicknessMm,
    heightMm: operation.heightMm,
    heightEvidence: operation.heightMm === undefined ? undefined : "user_confirmed" as const,
    baseOffsetMm: operation.baseOffsetMm,
    baseOffsetEvidence: operation.baseOffsetMm === undefined ? undefined : "user_confirmed" as const,
    classification: "partition" as const,
    adjacentRoomIds: [],
    provenance: inferredTopologyProvenance(floor, operation.wallId, "User-authored proposed partition; structural status unknown", state),
  };
  floor.walls.push(wall);
  divideRoomAtAddedWall(floor, wall, operation.newRoomId, operation.newRoomName, state);
  refreshPartitionAdjacency(floor, state);
}

function detachWallAnnotations(floor: FloorPlanFloorV2, wallId: string, state: State) {
  const wall = floor.walls.find(({ id }) => id === wallId)!;
  const start = floor.vertices.find(({ id }) => id === wall.path.startVertexId)!;
  const end = floor.vertices.find(({ id }) => id === wall.path.endVertexId)!;
  const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind !== "wall_span" || annotation.geometry.wallId !== wallId) continue;
    const span = annotation.geometry;
    const vertices = [span.offsetMm, span.offsetMm + span.widthMm].map((offset, index) => ({
      id: `${state.context.mutationId}:annotation:${annotation.id}:${index}`,
      xMm: Math.round(start.xMm + (end.xMm - start.xMm) * offset / length),
      zMm: Math.round(start.zMm + (end.zMm - start.zMm) * offset / length),
      provenance: annotation.provenance,
    }));
    for (const vertex of vertices) {
      assertUnusedGlobalEntityId(state.document, vertex.id, "Detached annotation vertex");
      floor.vertices.push(vertex);
    }
    // Preserve a historical source mark independently of the removed host.
    annotation.geometry = { kind: "polyline", vertexIds: vertices.map(({ id }) => id) };
    annotation.scope = "reference";
    state.changedIds.add(annotation.id);
  }
}

export function removeCanonicalPartition(floor: FloorPlanFloorV2, operation: Remove, state: State) {
  const wall = floor.walls.find(({ id }) => id === operation.wallId);
  if (!wall) return fail("UNKNOWN_WALL", `Unknown wall ${operation.wallId}.`);
  if (wall.path.kind !== "line") fail("ARC_MUTATION_UNSUPPORTED", "Curved walls are preserved; curved boundary removal is not supported.");
  const openings = floor.openings.filter((opening) => opening.wallId === wall.id).map(({ id }) => id).sort();
  if (openings.join() !== [...new Set(operation.confirmedOpeningIds)].sort().join()) {
    fail("WALL_DEPENDENCIES_CHANGED", "Review the current doors and windows on this wall before confirming removal.");
  }
  mergeRoomsAtRemovedWall(floor, wall, operation.keepRoomId, state);
  detachWallAnnotations(floor, wall.id, state);
  floor.openings = floor.openings.filter((opening) => opening.wallId !== wall.id);
  floor.walls = floor.walls.filter(({ id }) => id !== wall.id);
  [wall.id, ...openings].forEach((id) => state.changedIds.add(id));
  refreshPartitionAdjacency(floor, state);
}
