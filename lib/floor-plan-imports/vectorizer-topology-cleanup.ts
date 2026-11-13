import type { FloorPlanDocumentV2, FloorPlanVertexV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import { hasPdfOwnWalls } from "./pdf-own-walls";
import {
  addVertex,
  directionFrom,
  dropUnusedVertices,
  dropWall,
  mergeWalls,
  moveVertex,
  otherEnd,
  pointToSegment,
  restoreFloor,
  snapshotFloor,
  splitWall,
  type Point,
  type TopologyFloor,
  vertexMap,
  wallLength,
  wallsByVertex,
  wallsStillValid,
} from "./vectorizer-topology-graph";
import { foldAlongside } from "./vectorizer-topology-fold";

/**
 * The model's wall topology cleaned up before review (8 Nov 2026, workstream 1 of
 * claude/handoff-2026-11-08-vectorizer-model-first.md): the clean 2D plan and the 3D view are drawn from these walls, so
 * walls should meet their neighbours at shared ends, with no stubs and no slivers. On a page whose rooms the vectorizer
 * measured, after the document is built, in order:
 *
 * 1. walls within SQUARE_MAX_DEG of level or plumb are squared (HDB plans are drawn square; condo brochures mostly), each
 *    squaring logged, and none moving a vertex more than SQUARE_MAX_MOVE_MM;
 * 2. a short wall running straight on into a longer one at a different thickness takes that thickness (the 3D otherwise
 *    shows a notch), and walls running straight on (within COLLINEAR_DEG) with the same thickness, rooms and kind
 *    become one;
 * 3. a wall no room uses that lies inside another wall's band (DUPLICATE_SHARE of its length) is dropped, and one
 *    lying along a wall for most of that wall's length is folded into it (vectorizer-topology-fold.ts);
 * 4. a free wall end - no other wall ends there - with a wall end or a wall within JOIN_REACH times the thicker wall's
 *    thickness, ahead of it (reaching it turns the wall by JOIN_MAX_TURN_DEG at most), is joined: onto that end, or
 *    onto that wall, split there (a T);
 * 5. a wall no room uses, shorter than STUB_MM (or twice its thickness), whose ends touch nothing, is dropped;
 * 6. steps 1 and 2 again, for what the joins left a little off square or made straight.
 *
 * Every edit is checked against what the compiler refuses (walls crossing or overlapping without a shared end, the
 * same path twice, an opening past its wall's end) and undone if it would be. Rooms are closed loops by construction
 * here; a room the vectorizer could not close never reaches the document (the review draws it). The tolerances are
 * starting points, measured with tools/score/topology.py.
 */
export const TOPOLOGY_CLEANUP_TOLERANCES = Object.freeze({
  JOIN_REACH: 1.5,
  JOIN_MAX_TURN_DEG: 2,
  SQUARE_MAX_DEG: 2,
  SQUARE_MAX_MOVE_MM: 60,
  COLLINEAR_DEG: 1,
  STUB_MM: 300,
  DUPLICATE_SHARE: 0.9,
});

export type TopologyCleanupLog = {
  squared: { wallId: string; degrees: number; movedMm: number }[];
  thickened: number;
  merged: number;
  duplicatesDropped: number;
  folded: number;
  joined: number;
  stubsDropped: number;
  refused: number;
};

const T = TOPOLOGY_CLEANUP_TOLERANCES;

export function cleanVectorizerTopology(floor: TopologyFloor): TopologyCleanupLog {
  const log: TopologyCleanupLog = {
    squared: [], thickened: 0, merged: 0, duplicatesDropped: 0, folded: 0, joined: 0, stubsDropped: 0, refused: 0,
  };
  if (!wallsStillValid(floor)) return log;
  squareWalls(floor, log);
  straightRuns(floor, log);
  dropDuplicates(floor, log);
  log.folded = foldAlongside(floor, (edit) => tryEdit(floor, log, edit));
  joinFreeEnds(floor, log);
  dropStubs(floor, log);
  squareWalls(floor, log);
  straightRuns(floor, log);
  dropUnusedVertices(floor);
  return log;
}

/**
 * The clean-up on an imported document whose rooms the vectorizer measured, behind FLOOR_PLAN_TOPOLOGY_CLEANUP=1 (off
 * unless set, like the vectorizer's other switches in worker.env): what it did, in one line for the job's metrics, or
 * "off". The adapter takes the vectorizer's rooms wherever a page has them, so that is the test here.
 */
export function cleanImportedTopology(
  document: FloorPlanDocumentV2,
  pages: RegisteredPageEvidence[],
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const floor = document.floors[0];
  if (environment.FLOOR_PLAN_TOPOLOGY_CLEANUP !== "1" || !floor) return "off";
  if (!pages.some((page) => (page.vectorizer?.rooms.length ?? 0) > 0) || !floor.rooms.length) return "off";
  // Walls taken from a PDF's own drawing (pdf-own-walls.ts) are exact: there is nothing to repair.
  if (pages.some(hasPdfOwnWalls)) return "off";
  return summarizeTopologyCleanup(cleanVectorizerTopology(floor));
}

/** The log in one line for the job's metrics, every squaring listed (wall, degrees off, largest vertex move). */
export function summarizeTopologyCleanup(log: TopologyCleanupLog) {
  const squared = log.squared.map((entry) => `${entry.wallId} ${entry.degrees}deg ${entry.movedMm}mm`).join(", ");
  return [
    `joined ${log.joined}`,
    `merged ${log.merged}`,
    `thickened ${log.thickened}`,
    `duplicates ${log.duplicatesDropped}`,
    `folded ${log.folded}`,
    `stubs ${log.stubsDropped}`,
    `refused ${log.refused}`,
    `squared ${log.squared.length}${squared ? ` (${squared})` : ""}`,
  ].join("; ").slice(0, 2000);
}

/** Runs an edit; if it fails or leaves the walls invalid, puts the floor back. */
function tryEdit(floor: TopologyFloor, log: TopologyCleanupLog, edit: () => boolean) {
  const saved = snapshotFloor(floor);
  if (edit() && wallsStillValid(floor)) return true;
  restoreFloor(floor, saved);
  log.refused += 1;
  return false;
}

function angleToAxis(wall: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>) {
  const a = vertices.get(wall.path.startVertexId)!;
  const b = vertices.get(wall.path.endVertexId)!;
  const degrees = (Math.atan2(b.zMm - a.zMm, b.xMm - a.xMm) * 180) / Math.PI;
  const level = Math.abs(((degrees % 180) + 270) % 180 - 90);
  const plumb = Math.abs(((degrees % 180) + 180) % 180 - 90);
  return level <= plumb ? { axis: "zMm" as const, off: level } : { axis: "xMm" as const, off: plumb };
}

/** Vertices tied by near-level walls share one z, by near-plumb walls one x: the length-weighted mean of their walls. */
function squareWalls(floor: TopologyFloor, log: TopologyCleanupLog) {
  for (const axis of ["zMm", "xMm"] as const) {
    const vertices = vertexMap(floor);
    const near = floor.walls.filter((wall) => wall.path.kind === "line"
      && angleToAxis(wall, vertices).axis === axis && angleToAxis(wall, vertices).off <= T.SQUARE_MAX_DEG);
    for (const group of connectedGroups(near).map((walls) => walls.map((wall) => wall.id))) squareGroup(floor, log, axis, group);
  }
}

function squareGroup(floor: TopologyFloor, log: TopologyCleanupLog, axis: "xMm" | "zMm", wallIds: string[]) {
  const vertices = vertexMap(floor);
  const group = floor.walls.filter((wall) => wallIds.includes(wall.id));
  const skew = group.filter((wall) => angleToAxis(wall, vertices).off > 1e-9);
  if (!skew.length) return;
  const ids = [...new Set(group.flatMap((wall) => [wall.path.startVertexId, wall.path.endVertexId]))];
  const weight = group.map((wall) => wallLength(wall, vertices));
  const total = weight.reduce((sum, value) => sum + value, 0) || 1;
  const target = Math.round(group.reduce((sum, wall, i) => sum + weight[i]
    * (vertices.get(wall.path.startVertexId)![axis] + vertices.get(wall.path.endVertexId)![axis]) / 2, 0) / total);
  const movedMm = Math.max(...ids.map((id) => Math.abs(vertices.get(id)![axis] - target)));
  if (movedMm > T.SQUARE_MAX_MOVE_MM) return;
  const entries = skew.map((wall) => ({ wallId: wall.id, degrees: round2(angleToAxis(wall, vertices).off), movedMm }));
  const squared = tryEdit(floor, log, () => {
    for (const id of ids) {
      const move = target - vertexMap(floor).get(id)![axis];
      moveVertex(floor, id, axis === "xMm" ? move : 0, axis === "zMm" ? move : 0);
    }
    return true;
  });
  if (squared) log.squared.push(...entries);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Walls joined end to end, as groups. */
function connectedGroups(walls: FloorPlanWallV2[]) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const wall of walls) parent.set(find(wall.path.startVertexId), find(wall.path.endVertexId));
  const groups = new Map<string, FloorPlanWallV2[]>();
  for (const wall of walls) {
    const root = find(wall.path.startVertexId);
    groups.set(root, [...(groups.get(root) ?? []), wall]);
  }
  return [...groups.values()];
}

function runsStraightOn(first: FloorPlanWallV2, second: FloorPlanWallV2, at: string, vertices: Map<string, FloorPlanVertexV2>) {
  const a = directionFrom(first, at, vertices);
  const b = directionFrom(second, at, vertices);
  return a.x * b.x + a.z * b.z <= -Math.cos((T.COLLINEAR_DEG * Math.PI) / 180);
}

function sameKind(first: FloorPlanWallV2, second: FloorPlanWallV2) {
  return first.classification === second.classification
    && first.heightMm === second.heightMm && first.baseOffsetMm === second.baseOffsetMm
    && [...first.adjacentRoomIds].sort().join("|") === [...second.adjacentRoomIds].sort().join("|");
}

/** Short pieces take the thickness of the longer wall they run straight on into; then straight runs become one wall. */
function straightRuns(floor: TopologyFloor, log: TopologyCleanupLog) {
  let vertices = vertexMap(floor);
  for (const wall of floor.walls) {
    if (wall.path.kind !== "line") continue;
    const length = wallLength(wall, vertices);
    if (length >= wall.thicknessMm) continue;
    const ends = wallsByVertex(floor);
    const longer = [wall.path.startVertexId, wall.path.endVertexId].flatMap((at) => (ends.get(at) ?? [])
      .filter((other) => other !== wall && other.path.kind === "line" && runsStraightOn(wall, other, at, vertices)))
      .filter((other) => wallLength(other, vertices) > length)
      .sort((left, right) => wallLength(right, vertices) - wallLength(left, vertices))[0];
    if (longer && longer.thicknessMm !== wall.thicknessMm) {
      wall.thicknessMm = longer.thicknessMm;
      log.thickened += 1;
    }
  }
  for (let merging = true; merging;) {
    merging = false;
    vertices = vertexMap(floor);
    for (const [at, walls] of wallsByVertex(floor)) {
      const [first, second] = walls;
      if (walls.length !== 2 || first.path.kind !== "line" || second.path.kind !== "line") continue;
      if (Math.abs(first.thicknessMm - second.thicknessMm) > 1 || !sameKind(first, second)) continue;
      if (!runsStraightOn(first, second, at, vertices)) continue;
      if (tryEdit(floor, log, () => (mergeWalls(floor, first, second, at), true))) {
        log.merged += 1;
        merging = true;
        break;
      }
    }
  }
}

/** A wall no room uses, lying inside a parallel wall's band for most of its length. */
function dropDuplicates(floor: TopologyFloor, log: TopologyCleanupLog) {
  for (const id of floor.walls.map((candidate) => candidate.id)) {
    const wall = floor.walls.find((candidate) => candidate.id === id);
    if (!wall || wall.adjacentRoomIds.length || wall.path.kind !== "line") continue;
    const vertices = vertexMap(floor);
    const host = floor.walls.find((other) => other !== wall && other.path.kind === "line"
      && insideBand(wall, other, vertices) >= T.DUPLICATE_SHARE);
    if (host && tryEdit(floor, log, () => dropWall(floor, wall))) log.duplicatesDropped += 1;
  }
}

/** The share of the wall's length lying inside the other wall's band (parallel within 2 degrees), 0 to 1. */
function insideBand(wall: FloorPlanWallV2, other: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>) {
  const a = vertices.get(other.path.startVertexId)!;
  const length = wallLength(other, vertices);
  if (!length) return 0;
  const along = directionFrom(other, a.id, vertices);
  const own = directionFrom(wall, wall.path.startVertexId, vertices);
  if (Math.abs(along.x * own.z - along.z * own.x) > Math.sin((2 * Math.PI) / 180)) return 0;
  const ends = [wall.path.startVertexId, wall.path.endVertexId].map((id) => vertices.get(id)!);
  const across = ends.map((p) => (p.xMm - a.xMm) * -along.z + (p.zMm - a.zMm) * along.x);
  const slack = Math.max(10, other.thicknessMm * 0.05);
  if (across.some((c) => Math.abs(c) + wall.thicknessMm / 2 > other.thicknessMm / 2 + slack)) return 0;
  const s = ends.map((p) => (p.xMm - a.xMm) * along.x + (p.zMm - a.zMm) * along.z);
  const covered = Math.min(length, Math.max(...s)) - Math.max(0, Math.min(...s));
  return Math.max(0, covered) / (wallLength(wall, vertices) || 1);
}

type FreeEnd = { wall: FloorPlanWallV2; at: string };

function freeEnds(floor: TopologyFloor): FreeEnd[] {
  const ends = wallsByVertex(floor);
  return floor.walls.flatMap((wall) => wall.path.kind !== "line" ? [] : [wall.path.startVertexId, wall.path.endVertexId]
    .filter((at) => ends.get(at)?.length === 1)
    .map((at) => ({ wall, at })));
}

/** Free ends joined onto a wall end or a wall ahead of them, nearest first; where joining onto the nearest would
 * leave the walls invalid (a wall crossing on the way, say), the next. */
function joinFreeEnds(floor: TopologyFloor, log: TopologyCleanupLog) {
  const tried = new Set<string>();
  for (let end = nextEnd(floor, tried); end; end = nextEnd(floor, tried)) {
    tried.add(`${end.wall.id}:${end.at}`);
    for (const target of joinTargets(floor, end)) {
      if (tryEdit(floor, log, () => joinOnto(floor, end, target))) {
        log.joined += 1;
        break;
      }
    }
  }
}

function joinOnto(floor: TopologyFloor, end: FreeEnd, target: JoinTarget) {
  const vertices = vertexMap(floor);
  const wall = floor.walls.find((candidate) => candidate.id === end.wall.id)!;
  const alongBefore = wallsAlongside(floor, wall);
  let onto = target.vertexId ? vertices.get(target.vertexId)! : null;
  if (!onto && target.wallId) {
    const host = floor.walls.find((candidate) => candidate.id === target.wallId)!;
    const start = vertices.get(host.path.startVertexId)!;
    onto = addVertex(floor, target.point, start);
    if (!splitWall(floor, host, onto, Math.hypot(onto.xMm - start.xMm, onto.zMm - start.zMm))) return false;
  }
  if (!onto) return false;
  wall.path = wall.path.startVertexId === end.at
    ? { kind: "line", startVertexId: onto.id, endVertexId: wall.path.endVertexId }
    : { kind: "line", startVertexId: wall.path.startVertexId, endVertexId: onto.id };
  // Sliding an end on along its wall must not lay the wall along another one it wasn't along.
  return wallsAlongside(floor, wall) <= alongBefore;
}

/** How many walls this one runs along: parallel within 2 degrees, the bands overlapping, for more than 20 mm. */
function wallsAlongside(floor: TopologyFloor, wall: FloorPlanWallV2) {
  const vertices = vertexMap(floor);
  const a = vertices.get(wall.path.startVertexId)!;
  const length = wallLength(wall, vertices);
  if (!length) return 0;
  const along = directionFrom(wall, a.id, vertices);
  return floor.walls.filter((other) => {
    if (other === wall || other.path.kind !== "line") return false;
    const ends = [other.path.startVertexId, other.path.endVertexId].map((id) => vertices.get(id)!);
    const own = directionFrom(other, ends[0].id, vertices);
    if (Math.abs(along.x * own.z - along.z * own.x) > Math.sin((2 * Math.PI) / 180)) return false;
    const across = Math.abs((ends[0].xMm - a.xMm) * -along.z + (ends[0].zMm - a.zMm) * along.x);
    if (across >= (wall.thicknessMm + other.thicknessMm) / 2) return false;
    const s = ends.map((p) => (p.xMm - a.xMm) * along.x + (p.zMm - a.zMm) * along.z);
    return Math.min(length, Math.max(...s)) - Math.max(0, Math.min(...s)) > 20;
  }).length;
}

function nextEnd(floor: TopologyFloor, tried: Set<string>) {
  return freeEnds(floor).find((end) => !tried.has(`${end.wall.id}:${end.at}`)) ?? null;
}

type JoinTarget = { distance: number; vertexId?: string; wallId?: string; point: Point };

/** The wall ends and walls within the reach of a free end and ahead of it, nearest first (an end before a wall at
 * the same distance): moving the end there may slide it along its wall but not turn the wall by more than
 * JOIN_MAX_TURN_DEG. */
function joinTargets(floor: TopologyFloor, end: FreeEnd): JoinTarget[] {
  const vertices = vertexMap(floor);
  const from = vertices.get(end.at)!;
  const far = vertices.get(otherEnd(end.wall, end.at))!;
  const length = Math.hypot(from.xMm - far.xMm, from.zMm - far.zMm) || 1;
  const turns = (p: Point) => {
    const reach = Math.hypot(p.xMm - far.xMm, p.zMm - far.zMm) || 1;
    const along = ((p.xMm - far.xMm) * (from.xMm - far.xMm) + (p.zMm - far.zMm) * (from.zMm - far.zMm)) / (reach * length);
    return along < Math.cos((T.JOIN_MAX_TURN_DEG * Math.PI) / 180);
  };
  const ok = (p: Point, distance: number, thickness: number) =>
    distance <= T.JOIN_REACH * Math.max(end.wall.thicknessMm, thickness) && !turns(p);
  const targets: JoinTarget[] = [];
  for (const [id, walls] of wallsByVertex(floor)) {
    if (id === end.at || id === far.id) continue;
    const p = vertices.get(id)!;
    const distance = Math.hypot(p.xMm - from.xMm, p.zMm - from.zMm);
    if (ok(p, distance, Math.max(...walls.map((wall) => wall.thicknessMm)))) targets.push({ distance, vertexId: id, point: p });
  }
  for (const host of floor.walls) {
    if (host === end.wall || host.path.kind !== "line") continue;
    const a = vertices.get(host.path.startVertexId)!;
    const b = vertices.get(host.path.endVertexId)!;
    const { distance, t } = pointToSegment(from, a, b);
    const point = { xMm: Math.round(a.xMm + t * (b.xMm - a.xMm)), zMm: Math.round(a.zMm + t * (b.zMm - a.zMm)) };
    if (t > 0 && t < 1 && ok(point, distance, host.thicknessMm)) targets.push({ distance: distance + 0.5, wallId: host.id, point });
  }
  return targets.sort((left, right) => left.distance - right.distance);
}

/** Walls no room uses, short, with nothing at or near either end. */
function dropStubs(floor: TopologyFloor, log: TopologyCleanupLog) {
  for (const id of floor.walls.map((candidate) => candidate.id)) {
    const wall = floor.walls.find((candidate) => candidate.id === id);
    if (!wall || wall.adjacentRoomIds.length || wall.path.kind !== "line") continue;
    const vertices = vertexMap(floor);
    if (wallLength(wall, vertices) >= Math.max(T.STUB_MM, 2 * wall.thicknessMm)) continue;
    const loose = freeEnds(floor).filter((end) => end.wall === wall && !nearAnything(floor, end));
    if (loose.length === 2 && tryEdit(floor, log, () => dropWall(floor, wall))) log.stubsDropped += 1;
  }
}

function nearAnything(floor: TopologyFloor, end: FreeEnd) {
  const vertices = vertexMap(floor);
  const p = vertices.get(end.at)!;
  return floor.walls.some((other) => other !== end.wall && pointToSegment(p,
    vertices.get(other.path.startVertexId)!, vertices.get(other.path.endVertexId)!).distance
    <= T.JOIN_REACH * Math.max(end.wall.thicknessMm, other.thicknessMm));
}
