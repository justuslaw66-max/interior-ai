import type { FloorPlanFloorV2, FloorPlanVertexV2 } from "@/lib/floor-plan-document-v2";
import { splitWall } from "@/lib/floor-plan-wall-split";
import { topologyMutationFail as fail, type FloorPlanTopologyMutationStateV2 as State } from "@/lib/floor-plan-topology-mutation-support";

/** Exact canonical junctions: no tolerance snapping or direction changes to authored coordinates. */
export function attachPartitionEndpoint(floor: FloorPlanFloorV2, vertexId: string, state: State): string {
  const vertex = floor.vertices.find(({ id }) => id === vertexId)!;
  const usedAtSamePoint = floor.vertices.find((candidate) => candidate.id !== vertexId &&
    candidate.xMm === vertex.xMm && candidate.zMm === vertex.zMm &&
    floor.walls.some((wall) => wall.path.startVertexId === candidate.id || wall.path.endVertexId === candidate.id));
  if (usedAtSamePoint) return usedAtSamePoint.id;
  for (const wall of [...floor.walls]) {
    if (wall.path.startVertexId === vertexId || wall.path.endVertexId === vertexId) continue;
    const start = floor.vertices.find(({ id }) => id === wall.path.startVertexId)!;
    const end = floor.vertices.find(({ id }) => id === wall.path.endVertexId)!;
    if (!strictlyOnSegment(vertex, start, end)) continue;
    if (wall.path.kind !== "line") fail("ARC_MUTATION_UNSUPPORTED", "Attach to an existing curve endpoint; splitting a curved wall is not supported.");
    splitWall(floor, { kind: "split_wall", floorId: floor.id, wallId: wall.id,
      offsetMm: Math.hypot(vertex.xMm - start.xMm, vertex.zMm - start.zMm),
      newVertexId: vertex.id, newWallId: `${state.context.mutationId}:split:${wall.id}:${vertex.id}` }, state, vertex);
  }
  return vertexId;
}

function strictlyOnSegment(point: FloorPlanVertexV2, start: FloorPlanVertexV2, end: FloorPlanVertexV2) {
  const dx = end.xMm - start.xMm, dz = end.zMm - start.zMm;
  const px = point.xMm - start.xMm, pz = point.zMm - start.zMm;
  const dot = px * dx + pz * dz;
  return px * dz === pz * dx && dot > 0 && dot < dx * dx + dz * dz;
}
