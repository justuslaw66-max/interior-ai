import type { FloorPlanDirectedWallReferenceV2 as Ref, FloorPlanFloorV2, FloorPlanRoomWallLoopV2 as Loop, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import { partitionLoopPoints } from "@/lib/floor-plan-partition-boundaries";
import { reversePartitionChain } from "@/lib/floor-plan-partition-chain";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import { assertUnusedGlobalEntityId, demoteTopologyProvenance as demote, topologyMutationFail as fail, type FloorPlanTopologyMutationStateV2 as State } from "@/lib/floor-plan-topology-mutation-support";

function looseCycle(floor: FloorPlanFloorV2, added: FloorPlanWallV2): Loop | null {
  const walls = floor.walls.filter((wall) => wall.id !== added.id && !wall.adjacentRoomIds.length);
  if (walls.length > 100) fail("UNRESOLVED_BOUNDARY", "Resolve existing loose partitions before closing a room (100-wall limit).");
  const found: Ref[][] = [];
  let visits = 0;
  const visit = (id: string, refs: Ref[], visited: Set<string>) => {
    if (++visits > 1000) fail("UNRESOLVED_BOUNDARY", "Simplify the competing loose-wall routes before closing this room.");
    if (id === added.path.startVertexId) { found.push(refs); return; }
    if (found.length > 1) return;
    for (const wall of walls) {
      const forward = wall.path.startVertexId === id;
      if (!forward && wall.path.endVertexId !== id) continue;
      const next = forward ? wall.path.endVertexId : wall.path.startVertexId;
      if (visited.has(next)) continue;
      visit(next, [...refs, { wallId: wall.id, direction: forward ? "forward" : "reverse" }], new Set([...visited, next]));
    }
  };
  visit(added.path.endVertexId, [], new Set([added.path.endVertexId]));
  if (found.length > 1) fail("UNRESOLVED_BOUNDARY", "This closure forms competing rooms. Close one simple room boundary at a time.");
  if (!found.length) return null;
  if (found[0].length < 2) fail("UNRESOLVED_BOUNDARY", "A room needs at least three distinct wall edges; remove the overlapping wall.");
  return { kind: "outer", walls: [{ wallId: added.id, direction: "forward" }, ...found[0]] };
}

function enclosedParent(floor: FloorPlanFloorV2, cycle: Loop) {
  const boundaryIds = new Set(floor.rooms.flatMap((room) => room.wallLoops.flatMap((loop) => loop.walls.map(({ wallId }) => wallId))));
  const relevant = new Set([...boundaryIds, ...cycle.walls.map(({ wallId }) => wallId)]);
  if (floor.walls.some(({ id, path }) => relevant.has(id) && path.kind === "arc")) {
    fail("ARC_MUTATION_UNSUPPORTED", "Curved boundaries are retained. Creating an enclosed room beside them needs a reviewed curved-boundary edit.");
  }
  const points = partitionLoopPoints(floor, cycle);
  const boundaryVertices = new Set(floor.walls.filter(({ id }) => boundaryIds.has(id)).flatMap(({ path }) => [path.startVertexId, path.endVertexId]));
  if (points.some(({ id }) => boundaryVertices.has(id))) fail("UNRESOLVED_BOUNDARY", "An enclosed room must stay clear of existing room corners; use a dividing partition between boundary points.");
  const candidates = floor.rooms.filter((room) => points.every((point) =>
    room.wallLoops.some((loop) => loop.kind === "outer" && isPointInPlanarRing(point, partitionLoopPoints(floor, loop))) &&
    !room.wallLoops.some((loop) => loop.kind === "hole" && isPointInPlanarRing(point, partitionLoopPoints(floor, loop)))));
  if (candidates.length !== 1) return fail("UNRESOLVED_BOUNDARY", "An enclosed partition must lie entirely inside one existing room, clear of holes and other rooms.");
  return candidates[0];
}

export function encloseRoomAtAddedWall(floor: FloorPlanFloorV2, wall: FloorPlanWallV2,
  newRoomId: string | undefined, newRoomName: string | undefined, state: State): boolean {
  const cycle = looseCycle(floor, wall);
  if (!cycle) return false;
  const parent = enclosedParent(floor, cycle);
  if (!newRoomId || !newRoomName?.trim()) return fail("ROOM_CHOICE_REQUIRED", "Name the new room before closing this enclosed partition.");
  assertUnusedGlobalEntityId(state.document, newRoomId, "New room ID");
  (state.roomSplits ??= []).push({ floorId: floor.id, parentRoomId: parent.id, newRoomId });
  const ring = partitionLoopPoints(floor, cycle);
  const childHoles = parent.wallLoops.filter((loop) => loop.kind === "hole" && isPointInPlanarRing(partitionLoopPoints(floor, loop)[0], ring));
  parent.wallLoops = [...parent.wallLoops.filter((loop) => !childHoles.includes(loop)), { kind: "hole", walls: reversePartitionChain(cycle.walls) }];
  parent.provenance = demote(parent.provenance, parent.id, `Enclosed room ${newRoomId}; retained surrounding room identity`, state);
  floor.rooms.push({ ...parent, id: newRoomId, name: newRoomName.trim(), wallLoops: [cycle, ...childHoles],
    provenance: demote(parent.provenance, newRoomId, `Split from room ${parent.id}; finishes inherited for review`, state) });
  return true;
}
