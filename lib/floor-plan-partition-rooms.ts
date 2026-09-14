import type {
  FloorPlanDirectedWallReferenceV2 as WallRef,
  FloorPlanFloorV2,
  FloorPlanRoomV2,
  FloorPlanRoomWallLoopV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import { partitionChain, reversePartitionChain } from "@/lib/floor-plan-partition-chain";
import {
  assertUnusedGlobalEntityId,
  demoteTopologyProvenance as demote,
  topologyMutationFail as fail,
  type FloorPlanTopologyMutationStateV2 as State,
} from "@/lib/floor-plan-topology-mutation-support";

function ends(floor: FloorPlanFloorV2, reference: WallRef) {
  const wall = floor.walls.find(({ id }) => id === reference.wallId);
  if (!wall) return fail("UNKNOWN_WALL", `Missing boundary wall ${reference.wallId}.`);
  return reference.direction === "forward"
    ? [wall.path.startVertexId, wall.path.endVertexId]
    : [wall.path.endVertexId, wall.path.startVertexId];
}

export function partitionLoopPoints(floor: FloorPlanFloorV2, loop: FloorPlanRoomWallLoopV2) {
  return loop.walls.map((ref) => {
    const point = floor.vertices.find(({ id }) => id === ends(floor, ref)[0]);
    if (!point) return fail("UNKNOWN_VERTEX", "A room boundary vertex is missing.");
    return point;
  });
}

/** Reuses canonical directed boundaries, preserving curved paths and hole loops. */
function stitchBoundary(floor: FloorPlanFloorV2, references: WallRef[]): WallRef[] {
  const remaining = [...references];
  const ordered: WallRef[] = [];
  while (remaining.length) {
    const nextStart = ordered.length ? ends(floor, ordered[ordered.length - 1])[1] : null;
    const index = nextStart === null ? 0 : remaining.findIndex((ref) => ends(floor, ref)[0] === nextStart);
    if (index < 0) fail("UNRESOLVED_BOUNDARY", "These rooms cannot form one continuous boundary.");
    ordered.push(...remaining.splice(index, 1));
  }
  if (!ordered.length || ends(floor, ordered[0])[0] !== ends(floor, ordered[ordered.length - 1])[1]) {
    fail("UNRESOLVED_BOUNDARY", "Keep the exterior envelope closed before removing this wall.");
  }
  return ordered;
}

export function refreshPartitionAdjacency(floor: FloorPlanFloorV2, state: State) {
  for (const wall of floor.walls) {
    const ids = floor.rooms.filter((room) => room.wallLoops.some((loop) => loop.walls.some((ref) => ref.wallId === wall.id))).map(({ id }) => id);
    if ([...ids].sort().join() === [...wall.adjacentRoomIds].sort().join()) continue;
    wall.adjacentRoomIds = ids;
    wall.provenance = demote(wall.provenance, wall.id, "Changed room membership", state);
  }
}

export function mergeRoomsAtRemovedWall(
  floor: FloorPlanFloorV2, wall: FloorPlanWallV2, keepRoomId: string | undefined, state: State
) {
  const rooms = floor.rooms.filter((room) => wall.adjacentRoomIds.includes(room.id));
  if (!rooms.length) return;
  if (rooms.length !== 2) fail("UNRESOLVED_BOUNDARY", "This wall bounds the floor or a hole. A replacement closed boundary is required before removal.");
  const keep = rooms.find(({ id }) => id === keepRoomId);
  if (!keep) return fail("ROOM_CHOICE_REQUIRED", "Choose which room's name and finishes the combined space will keep.");
  const removed = rooms.find(({ id }) => id !== keep.id)!;
  const loops = rooms.flatMap((room) => room.wallLoops.filter((loop) => loop.kind === "outer"));
  if (loops.length !== 2) fail("UNRESOLVED_BOUNDARY", "Each merged room must have one outer boundary.");
  const shared = new Set(floor.walls.filter((candidate) => rooms.every((room) => candidate.adjacentRoomIds.includes(room.id))).map(({ id }) => id));
  const outer = stitchBoundary(floor, loops.flatMap((loop) => loop.walls.filter((ref) => !shared.has(ref.wallId))));
  keep.wallLoops = [{ kind: "outer", walls: outer }, ...rooms.flatMap((room) => room.wallLoops.filter((loop) => loop.kind === "hole"))];
  keep.provenance = demote(keep.provenance, keep.id, `Merged room ${removed.id} into ${keep.id}; retained chosen name and finishes`, state);
  floor.rooms = floor.rooms.filter(({ id }) => id !== removed.id);
  state.changedIds.add(removed.id);
}

function splitLoops(floor: FloorPlanFloorV2, room: FloorPlanRoomV2, wall: FloorPlanWallV2) {
  const outer = room.wallLoops.find((loop) => loop.kind === "outer");
  if (!outer) return null;
  const chain = partitionChain(floor, outer, wall);
  if (!chain) return null;
  const start = outer.walls.findIndex((ref) => ends(floor, ref)[0] === chain.start);
  const end = outer.walls.findIndex((ref) => ends(floor, ref)[0] === chain.end);
  if (start < 0 || end < 0 || start === end) return null;
  const rotated = [...outer.walls.slice(start), ...outer.walls.slice(0, start)];
  const count = (end - start + outer.walls.length) % outer.walls.length;
  const first: FloorPlanRoomWallLoopV2 = { kind: "outer", walls: [...rotated.slice(0, count), ...reversePartitionChain(chain.refs)] };
  const second: FloorPlanRoomWallLoopV2 = { kind: "outer", walls: [...rotated.slice(count), ...chain.refs] };
  return { first, second };
}

export function divideRoomAtAddedWall(
  floor: FloorPlanFloorV2, wall: FloorPlanWallV2, newRoomId: string | undefined, newRoomName: string | undefined, state: State
) {
  const candidates = floor.rooms.flatMap((room) => {
    const loops = splitLoops(floor, room, wall);
    return loops ? [{ room, ...loops }] : [];
  });
  if (!candidates.length) return; // Freestanding/partial walls never invent rooms.
  if (candidates.length !== 1) fail("UNRESOLVED_BOUNDARY", "The partition must divide exactly one room.");
  if (!newRoomId || !newRoomName?.trim()) return fail("ROOM_CHOICE_REQUIRED", "Name the new room and choose its identity before adding a dividing partition.");
  assertUnusedGlobalEntityId(state.document, newRoomId, "New room ID");
  const { room, first, second } = candidates[0];
  const firstHoles: FloorPlanRoomWallLoopV2[] = [];
  const secondHoles: FloorPlanRoomWallLoopV2[] = [];
  for (const hole of room.wallLoops.filter((loop) => loop.kind === "hole")) {
    const point = partitionLoopPoints(floor, hole)[0];
    if (isPointInPlanarRing(point, partitionLoopPoints(floor, first))) firstHoles.push(hole);
    else secondHoles.push(hole);
  }
  room.wallLoops = [first, ...firstHoles];
  room.provenance = demote(room.provenance, room.id, `Divided room with wall ${wall.id}; new child ${newRoomId}`, state);
  floor.rooms.push({
    ...room, id: newRoomId, name: newRoomName.trim(), wallLoops: [second, ...secondHoles],
    provenance: demote(room.provenance, newRoomId, `Split from room ${room.id}; finishes inherited for review`, state),
  });
}
