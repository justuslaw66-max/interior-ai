import type {
  FloorPlanFloorV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import { findCanonicalWallIntersectionProblems } from "@/lib/floor-plan-geometry-validation";

/**
 * The wall graph of one imported floor, for the topology clean-up (vectorizer-topology-cleanup.ts): lengths, which walls
 * end at a vertex, and the edits the clean-up makes - split a wall at a vertex, merge two walls into one, drop a wall -
 * each keeping every reference to the wall in step (the rooms' wall loops, the openings on it, the notes spanning it).
 * Only line walls are edited; arcs are left as drawn.
 */
export type TopologyFloor = Pick<
  FloorPlanFloorV2,
  "vertices" | "walls" | "rooms" | "openings" | "annotations" | "dimensions" | "structures"
>;

export type Point = { xMm: number; zMm: number };

export function vertexMap(floor: TopologyFloor) {
  return new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
}

/** Walls by the vertices they end at. */
export function wallsByVertex(floor: TopologyFloor) {
  const ends = new Map<string, FloorPlanWallV2[]>();
  for (const wall of floor.walls) {
    for (const id of [wall.path.startVertexId, wall.path.endVertexId]) {
      ends.set(id, [...(ends.get(id) ?? []), wall]);
    }
  }
  return ends;
}

export function wallLength(wall: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>) {
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  return start && end ? Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm) : 0;
}

export function otherEnd(wall: FloorPlanWallV2, vertexId: string) {
  return wall.path.startVertexId === vertexId ? wall.path.endVertexId : wall.path.startVertexId;
}

/** A unit vector along the wall, from the given vertex out along it. */
export function directionFrom(wall: FloorPlanWallV2, vertexId: string, vertices: Map<string, FloorPlanVertexV2>) {
  const from = vertices.get(vertexId)!;
  const to = vertices.get(otherEnd(wall, vertexId))!;
  const length = Math.hypot(to.xMm - from.xMm, to.zMm - from.zMm) || 1;
  return { x: (to.xMm - from.xMm) / length, z: (to.zMm - from.zMm) / length };
}

/** The distance from a point to a segment, and where along it (0 at a, 1 at b) the nearest point is. */
export function pointToSegment(point: Point, a: Point, b: Point) {
  const dx = b.xMm - a.xMm;
  const dz = b.zMm - a.zMm;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.xMm - a.xMm) * dx + (point.zMm - a.zMm) * dz) / lengthSquared)) : 0;
  return { distance: Math.hypot(point.xMm - (a.xMm + t * dx), point.zMm - (a.zMm + t * dz)), t };
}

/** A new vertex at whole millimetres with an id no vertex has. */
export function addVertex(floor: TopologyFloor, at: Point, provenanceOf: FloorPlanVertexV2): FloorPlanVertexV2 {
  const ids = new Set(floor.vertices.map((vertex) => vertex.id));
  let next = floor.vertices.length + 1;
  while (ids.has(`v${next}`)) next += 1;
  const vertex = { id: `v${next}`, xMm: Math.round(at.xMm), zMm: Math.round(at.zMm), provenance: provenanceOf.provenance };
  floor.vertices.push(vertex);
  return vertex;
}

function freshWallId(floor: TopologyFloor) {
  const ids = new Set(floor.walls.map((wall) => wall.id));
  let next = floor.walls.length + 1;
  while (ids.has(`w${next}`)) next += 1;
  return `w${next}`;
}

/** Things placed along a wall by an offset from its start: its openings and the notes spanning it. */
function spansOn(floor: TopologyFloor, wallId: string) {
  const openings = floor.openings.filter((opening) => opening.wallId === wallId);
  const notes = floor.annotations.flatMap((annotation) =>
    annotation.geometry.kind === "wall_span" && annotation.geometry.wallId === wallId ? [annotation.geometry] : []);
  return [...openings, ...notes];
}

/**
 * Splits a line wall at a vertex lying on it (at `atMm` from its start): the wall keeps the first part, a new wall
 * the rest. Refused (null) where an opening or a spanning note would be cut in two.
 */
export function splitWall(floor: TopologyFloor, wall: FloorPlanWallV2, at: FloorPlanVertexV2, atMm: number) {
  const spans = spansOn(floor, wall.id);
  if (spans.some((span) => span.offsetMm < atMm && span.offsetMm + span.widthMm > atMm)) return null;
  const rest: FloorPlanWallV2 = {
    ...wall,
    id: freshWallId(floor),
    path: { kind: "line", startVertexId: at.id, endVertexId: wall.path.endVertexId },
    adjacentRoomIds: [...wall.adjacentRoomIds],
  };
  wall.path = { kind: "line", startVertexId: wall.path.startVertexId, endVertexId: at.id };
  floor.walls.push(rest);
  for (const span of spans) {
    if (span.offsetMm < atMm) continue;
    if ("wallId" in span) span.wallId = rest.id;
    span.offsetMm = Math.round(span.offsetMm - atMm);
  }
  for (const room of floor.rooms) {
    for (const loop of room.wallLoops) {
      loop.walls = loop.walls.flatMap((reference) => {
        if (reference.wallId !== wall.id) return [reference];
        const first = { wallId: wall.id, direction: reference.direction };
        const second = { wallId: rest.id, direction: reference.direction };
        return reference.direction === "forward" ? [first, second] : [second, first];
      });
    }
  }
  return rest;
}

/**
 * Merges two line walls meeting at a vertex only they use into one wall (the first keeps its id), from the first's far
 * end to the second's. The caller checks they run straight on, with the same thickness and the same rooms.
 */
export function mergeWalls(floor: TopologyFloor, first: FloorPlanWallV2, second: FloorPlanWallV2, at: string) {
  const vertices = vertexMap(floor);
  const firstLength = wallLength(first, vertices);
  const secondLength = wallLength(second, vertices);
  const firstOut = first.path.endVertexId === at;
  const secondOut = second.path.startVertexId === at;
  for (const span of spansOn(floor, first.id)) {
    if (!firstOut) span.offsetMm = Math.round(firstLength - span.offsetMm - span.widthMm);
  }
  for (const span of spansOn(floor, second.id)) {
    span.offsetMm = Math.round(firstLength + (secondOut ? span.offsetMm : secondLength - span.offsetMm - span.widthMm));
    if ("wallId" in span) span.wallId = first.id;
  }
  first.path = { kind: "line", startVertexId: otherEnd(first, at), endVertexId: otherEnd(second, at) };
  for (const room of floor.rooms) {
    for (const loop of room.wallLoops) mergeInLoop(loop, first.id, second.id, firstOut);
  }
  floor.walls.splice(floor.walls.indexOf(second), 1);
}

/** In a loop running through both walls (one after the other, either way round), the pair becomes the merged wall. */
function mergeInLoop(
  loop: FloorPlanFloorV2["rooms"][number]["wallLoops"][number],
  firstId: string,
  secondId: string,
  firstOut: boolean
) {
  const firstIndex = loop.walls.findIndex((reference) => reference.wallId === firstId);
  const secondIndex = loop.walls.findIndex((reference) => reference.wallId === secondId);
  if (firstIndex < 0 || secondIndex < 0) return;
  const firstReference = loop.walls[firstIndex];
  // The loop walks the first wall towards the shared vertex exactly when it then walks the merged wall forward.
  const towardShared = (firstReference.direction === "forward") === firstOut;
  loop.walls[firstIndex] = { wallId: firstId, direction: towardShared ? "forward" : "reverse" };
  loop.walls.splice(secondIndex, 1);
}

/**
 * Moves a vertex, keeping what lies along the walls starting there where it was on the drawing: an opening's offset is
 * measured from its wall's start, so a start moving along the wall by m takes m off it (kept within the wall).
 */
export function moveVertex(floor: TopologyFloor, vertexId: string, dxMm: number, dzMm: number) {
  const vertices = vertexMap(floor);
  const vertex = vertices.get(vertexId);
  if (!vertex) return;
  const starting = floor.walls.filter((wall) => wall.path.kind === "line" && wall.path.startVertexId === vertexId);
  const before = starting.map((wall) => directionFrom(wall, vertexId, vertices));
  vertex.xMm += dxMm;
  vertex.zMm += dzMm;
  starting.forEach((wall, index) => {
    const moved = dxMm * before[index].x + dzMm * before[index].z;
    const length = wallLength(wall, vertices);
    for (const span of spansOn(floor, wall.id)) {
      span.offsetMm = Math.max(0, Math.min(Math.round(span.offsetMm - moved), Math.floor(length - span.widthMm)));
    }
  });
}

/** Removes a wall no room, opening or note uses. */
export function dropWall(floor: TopologyFloor, wall: FloorPlanWallV2) {
  if (wall.adjacentRoomIds.length || spansOn(floor, wall.id).length) return false;
  floor.walls.splice(floor.walls.indexOf(wall), 1);
  return true;
}

/** Removes vertices nothing uses any more (walls, rooms' notes and labels, dimensions, structures). */
export function dropUnusedVertices(floor: TopologyFloor) {
  const used = new Set<string>();
  for (const wall of floor.walls) {
    used.add(wall.path.startVertexId).add(wall.path.endVertexId);
    if (wall.path.kind === "arc") used.add(wall.path.centerVertexId);
  }
  for (const dimension of floor.dimensions) used.add(dimension.fromVertexId).add(dimension.toVertexId);
  for (const structure of floor.structures) structure.vertexIds.forEach((id) => used.add(id));
  for (const annotation of floor.annotations) {
    const geometry = annotation.geometry as { vertexId?: string; vertexIds?: string[] };
    if (geometry.vertexId) used.add(geometry.vertexId);
    geometry.vertexIds?.forEach((id) => used.add(id));
  }
  const kept = floor.vertices.filter((vertex) => used.has(vertex.id));
  floor.vertices.splice(0, floor.vertices.length, ...kept);
}

/** Whether the floor's walls are still ones the compiler takes: every one long enough, no two crossing or running
 * along each other without a shared end, no two on the same path, every opening and spanning note on its wall. */
export function wallsStillValid(floor: TopologyFloor) {
  const vertices = vertexMap(floor);
  const keys = new Set<string>();
  for (const wall of floor.walls) {
    if (wall.path.startVertexId === wall.path.endVertexId || wallLength(wall, vertices) < 1) return false;
    const key = [wall.path.startVertexId, wall.path.endVertexId].sort().join("|");
    if (keys.has(key)) return false;
    keys.add(key);
  }
  const lines = floor.walls.flatMap((wall, wallIndex) => {
    const start = vertices.get(wall.path.startVertexId);
    const end = vertices.get(wall.path.endVertexId);
    if (wall.path.kind !== "line" || !start || !end) return [];
    return [{ wallIndex, start, end, startVertexId: start.id, endVertexId: end.id }];
  });
  const intersections = findCanonicalWallIntersectionProblems(lines);
  if (intersections.budgetExceeded || intersections.problems.length) return false;
  const lengths = new Map(floor.walls.map((wall) => [wall.id, wallLength(wall, vertices)]));
  return floor.walls.every((wall) => spansOn(floor, wall.id).every((span) =>
    span.offsetMm >= 0 && span.offsetMm + span.widthMm <= (lengths.get(wall.id) ?? 0) + 0.5));
}

/** A copy of the floor's editable parts, to put back if an edit leaves the walls invalid. */
export function snapshotFloor(floor: TopologyFloor) {
  return structuredClone({
    vertices: floor.vertices,
    walls: floor.walls,
    rooms: floor.rooms,
    openings: floor.openings,
    annotations: floor.annotations,
  });
}

export function restoreFloor(floor: TopologyFloor, saved: ReturnType<typeof snapshotFloor>) {
  floor.vertices.splice(0, floor.vertices.length, ...saved.vertices);
  floor.walls.splice(0, floor.walls.length, ...saved.walls);
  floor.rooms.splice(0, floor.rooms.length, ...saved.rooms);
  floor.openings.splice(0, floor.openings.length, ...saved.openings);
  floor.annotations.splice(0, floor.annotations.length, ...saved.annotations);
}
