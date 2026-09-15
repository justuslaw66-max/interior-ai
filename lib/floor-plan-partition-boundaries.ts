import type { FloorPlanDirectedWallReferenceV2 as Ref, FloorPlanFloorV2, FloorPlanRoomWallLoopV2 as Loop } from "@/lib/floor-plan-document-v2";
import { topologyMutationFail as fail } from "@/lib/floor-plan-topology-mutation-support";

/** Chord-based room splitting cannot validate retained arcs; preserve them without approximation. */
export function assertStraightPartitionFloor(floor: FloorPlanFloorV2) {
  if (floor.walls.some(({ path }) => path.kind === "arc")) {
    fail("ARC_MUTATION_UNSUPPORTED", "Curved boundaries are retained. Adding or joining partitions on a floor containing curved walls is not supported; keep the existing geometry or use a reviewed straight-wall plan.");
  }
}

export function partitionReferenceEnds(floor: FloorPlanFloorV2, reference: Ref) {
  const wall = floor.walls.find(({ id }) => id === reference.wallId);
  if (!wall) return fail("UNKNOWN_WALL", `Missing boundary wall ${reference.wallId}.`);
  return reference.direction === "forward"
    ? [wall.path.startVertexId, wall.path.endVertexId]
    : [wall.path.endVertexId, wall.path.startVertexId];
}

export function partitionLoopPoints(floor: FloorPlanFloorV2, loop: Loop) {
  return loop.walls.map((ref) => {
    const point = floor.vertices.find(({ id }) => id === partitionReferenceEnds(floor, ref)[0]);
    if (!point) return fail("UNKNOWN_VERTEX", "A room boundary vertex is missing.");
    return point;
  });
}

/** Stitch surviving directed boundaries without changing line or arc geometry. */
export function mergePartitionLoops(floor: FloorPlanFloorV2, loops: Loop[], shared: Set<string>): Loop[] {
  const outerIds = new Set(loops.filter(({ kind }) => kind === "outer").flatMap(({ walls }) => walls.map(({ wallId }) => wallId)));
  const remaining = loops.flatMap(({ walls }) => walls.filter(({ wallId }) => !shared.has(wallId)));
  const result: Loop[] = [];
  while (remaining.length) {
    const ordered = [remaining.shift()!];
    const first = partitionReferenceEnds(floor, ordered[0])[0];
    let end = partitionReferenceEnds(floor, ordered[0])[1];
    while (end !== first) {
      const choices = remaining.filter((ref) => partitionReferenceEnds(floor, ref)[0] === end);
      if (choices.length !== 1) fail("UNRESOLVED_BOUNDARY", "Keep one unambiguous, closed boundary before removing this wall.");
      const ref = choices[0];
      ordered.push(ref); remaining.splice(remaining.indexOf(ref), 1);
      end = partitionReferenceEnds(floor, ref)[1];
    }
    result.push({ kind: ordered.some(({ wallId }) => outerIds.has(wallId)) ? "outer" : "hole", walls: ordered });
  }
  if (result.filter(({ kind }) => kind === "outer").length !== 1) {
    fail("UNRESOLVED_BOUNDARY", "These rooms must form one connected outer boundary after removal.");
  }
  return result.sort((a, b) => Number(b.kind === "outer") - Number(a.kind === "outer"));
}
