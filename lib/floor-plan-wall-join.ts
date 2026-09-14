import type { FloorPlanFloorV2, FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutation-types";
import { attachPartitionEndpoint } from "@/lib/floor-plan-wall-attachment";
import { divideRoomAtAddedWall, refreshPartitionAdjacency } from "@/lib/floor-plan-partition-rooms";
import { assertTopologyInteger, topologyMutationFail as fail, type FloorPlanTopologyMutationStateV2 as State } from "@/lib/floor-plan-topology-mutation-support";

type Join = Extract<FloorPlanTopologyMutationV2, { kind: "join_wall_endpoint" }>;

function assertJoinTarget(floor: FloorPlanFloorV2, operation: Join) {
  assertTopologyInteger(operation.to.xMm, "Join target X"); assertTopologyInteger(operation.to.zMm, "Join target Z");
  const hosts = floor.walls.filter(({ id }) => id !== operation.wallId);
  const endpoints = new Set(hosts.flatMap((wall) => [wall.path.startVertexId, wall.path.endVertexId]));
  const corners = floor.vertices.filter((vertex) => endpoints.has(vertex.id) && vertex.xMm === operation.to.xMm && vertex.zMm === operation.to.zMm);
  if (corners.length > 1) fail("UNRESOLVED_BOUNDARY", "This point contains multiple wall-corner identities. Repair the ambiguous junction before joining it.");
  if (corners.length === 1) return;
  const matching = hosts.filter((wall) => {
    if (wall.path.kind !== "line") return false;
    const start = floor.vertices.find(({ id }) => id === wall.path.startVertexId)!;
    const end = floor.vertices.find(({ id }) => id === wall.path.endVertexId)!;
    const dx = end.xMm - start.xMm, dz = end.zMm - start.zMm;
    const px = operation.to.xMm - start.xMm, pz = operation.to.zMm - start.zMm, dot = px * dx + pz * dz;
    return px * dz === pz * dx && dot > 0 && dot < dx * dx + dz * dz;
  });
  if (matching.length !== 1) fail("UNRESOLVED_BOUNDARY", "Choose a point exactly on one existing straight wall centreline or an existing wall corner.");
}

/** Merge references only after the endpoint has been moved and its dependants reviewed. */
function remapJoinedVertex(floor: FloorPlanFloorV2, from: string, to: string, state: State) {
  if (from === to) return;
  const replace = (id: string) => id === from ? to : id;
  for (const wall of floor.walls) {
    wall.path.startVertexId = replace(wall.path.startVertexId); wall.path.endVertexId = replace(wall.path.endVertexId);
    if (wall.path.kind === "arc") wall.path.centerVertexId = replace(wall.path.centerVertexId);
  }
  for (const structure of floor.structures) structure.vertexIds = structure.vertexIds.map(replace);
  for (const annotation of floor.annotations) {
    const geometry = annotation.geometry;
    if (geometry.kind === "point") geometry.vertexId = replace(geometry.vertexId);
    else if ("vertexIds" in geometry) geometry.vertexIds = geometry.vertexIds.map(replace);
  }
  for (const dimension of floor.dimensions) {
    dimension.fromVertexId = replace(dimension.fromVertexId); dimension.toVertexId = replace(dimension.toVertexId);
  }
  floor.vertices = floor.vertices.filter(({ id }) => id !== from);
  state.changedIds.add(from);
}

export function joinCanonicalWallEndpoint(floor: FloorPlanFloorV2, operation: Join, state: State,
  moveVertex: (vertexId: string, to: FloorPlanPointMmV2) => void) {
  const wall = floor.walls.find(({ id }) => id === operation.wallId);
  if (!wall) return fail("UNKNOWN_WALL", `Unknown wall ${operation.wallId}.`);
  if (wall.path.kind !== "line") fail("ARC_MUTATION_UNSUPPORTED", "Curved walls are retained; joining their constrained endpoints is not supported.");
  const vertexId = operation.endpoint === "start" ? wall.path.startVertexId : wall.path.endVertexId;
  const incident = floor.walls.filter((candidate) => candidate.path.startVertexId === vertexId || candidate.path.endVertexId === vertexId);
  if (incident.length !== 1) fail("UNRESOLVED_BOUNDARY", "Join a free wall endpoint. This endpoint already belongs to a room corner or shared junction.");
  assertJoinTarget(floor, operation);
  moveVertex(vertexId, operation.to);
  const joinedId = attachPartitionEndpoint(floor, vertexId, state);
  remapJoinedVertex(floor, vertexId, joinedId, state);
  divideRoomAtAddedWall(floor, wall, operation.newRoomId, operation.newRoomName, state);
  refreshPartitionAdjacency(floor, state);
}
