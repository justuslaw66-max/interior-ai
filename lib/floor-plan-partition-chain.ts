import type { FloorPlanDirectedWallReferenceV2 as Ref, FloorPlanFloorV2, FloorPlanRoomWallLoopV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import { topologyMutationFail as fail } from "@/lib/floor-plan-topology-mutation-support";

function pathsToBoundary(floor: FloorPlanFloorV2, start: string, boundary: Set<string>, added: FloorPlanWallV2) {
  const found: { vertexId: string; refs: Ref[] }[] = [];
  let visits = 0;
  const visit = (vertexId: string, refs: Ref[], visited: Set<string>) => {
    if (++visits > 1000) fail("UNRESOLVED_BOUNDARY", "This partition graph has too many competing routes; simplify loose walls before closing a room.");
    if (boundary.has(vertexId)) { found.push({ vertexId, refs }); return; }
    if (found.length > 1) return;
    for (const wall of floor.walls) {
      if (wall.id === added.id || wall.adjacentRoomIds.length || visited.has(wall.id)) continue;
      const forward = wall.path.startVertexId === vertexId;
      if (!forward && wall.path.endVertexId !== vertexId) continue;
      visit(forward ? wall.path.endVertexId : wall.path.startVertexId,
        [...refs, { wallId: wall.id, direction: forward ? "forward" : "reverse" }], new Set([...visited, wall.id]));
    }
  };
  // Valid canonical intersections keep the graph small; bound traversal for adversarial drafts.
  if (floor.walls.filter((wall) => !wall.adjacentRoomIds.length).length > 100) {
    fail("UNRESOLVED_BOUNDARY", "Resolve existing loose partitions before extending this wall chain (100-wall limit).");
  }
  visit(start, [], new Set());
  if (found.length > 1) fail("UNRESOLVED_BOUNDARY", "This wall joins multiple boundary routes. Split or remove ambiguous branches before closing the room.");
  return found[0];
}

export function partitionChain(floor: FloorPlanFloorV2, outer: FloorPlanRoomWallLoopV2, wall: FloorPlanWallV2) {
  const boundary = new Set(outer.walls.flatMap((ref) => {
    const entry = floor.walls.find(({ id }) => id === ref.wallId)!;
    return [entry.path.startVertexId, entry.path.endVertexId];
  }));
  const from = pathsToBoundary(floor, wall.path.startVertexId, boundary, wall);
  const to = pathsToBoundary(floor, wall.path.endVertexId, boundary, wall);
  if (!from || !to) return null;
  if (from.vertexId === to.vertexId || from.refs.some((ref) => to.refs.some((other) => ref.wallId === other.wallId))) {
    fail("UNRESOLVED_BOUNDARY", "An enclosed interior loop needs a reviewed room and hole boundary; this partition cannot be accepted as a room division.");
  }
  const refs: Ref[] = [...reversePartitionChain(from.refs), { wallId: wall.id, direction: "forward" }, ...to.refs];
  return { start: from.vertexId, end: to.vertexId, refs };
}

export function reversePartitionChain(refs: Ref[]): Ref[] {
  return [...refs].reverse().map((ref) => ({ wallId: ref.wallId, direction: ref.direction === "forward" ? "reverse" : "forward" }));
}
