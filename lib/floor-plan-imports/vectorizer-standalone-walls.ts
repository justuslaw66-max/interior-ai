import type {
  FloorPlanEntityProvenanceV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import {
  floorPlanLineSegmentsIntersect,
  floorPlanPointOnLineSegment,
} from "@/lib/floor-plan-geometry-validation";
import {
  pointInPolygon,
  type RegisteredPageEvidence,
  type RegisteredRoomBoundary,
} from "./deterministic-evidence";
import { alignVectorizerFaces, vectorizerThicknessMm } from "./vectorizer-face-millimetres";

type StandaloneWallInput = {
  page: RegisteredPageEvidence | undefined;
  rooms: RegisteredRoomBoundary[];
  millimetresPerPixel: number;
  vertices: FloorPlanVertexV2[];
  walls: FloorPlanWallV2[];
  getVertex: (xPx: number, yPx: number, confidence: number) => FloorPlanVertexV2;
  provenance: (confidence: number, note: string) => FloorPlanEntityProvenanceV2;
};

type Segment = { start: FloorPlanVertexV2; end: FloorPlanVertexV2 };
type Placed = Segment & { thicknessMm: number };
/** A wall drawn level (along x) or plumb (along z): its centre-line's cross coordinate, its run and half thickness. */
type AxisWall = { plumb: boolean; at: number; from: number; to: number; half: number };
/** Where a face or end may go (targets) and where it may not (it would only touch a wall: the plan draws a seam). */
type Moves = { targets: number[]; touching: number[] };

const STANDALONE_CONFIDENCE = 0.7;
const STANDALONE_NOTE =
  "Wall drawn on the source where no room side runs (a column standing out past a wall, or a wall with the same room on both sides)";
/**
 * The app keeps vertices in whole millimetres and thicknesses in 5 mm steps, so two faces the drawing shows as one
 * can come out up to 3.5 mm apart (half a millimetre for each centre-line, 1.25 mm for each thickness): a step J saw.
 */
const SAME_FACE_MM = 3.5;

/**
 * The vectorizer's wall edges that none of its rooms uses (exporter 0.28.0+): wall the drawing has where no room side
 * runs, such as a column standing out past a wall's face or end, or a study's wall where the study is open to the
 * living room. They become walls with no room on either side, so the plan and the 3D view show them; a wall standing
 * inside a room is interior, one outside every room exterior (it goes with the facade in the cutaway view). Only on a
 * page whose rooms the vectorizer measured. A wall whose centre-line would cross another's without a shared end (the
 * compiler refuses the whole document for that) is left out; nothing here changes a room or its walls. A new wall's
 * face or free end that the app's rounding has put beside a neighbour's, facing the same way, is lined up with it.
 */
export function addVectorizerStandaloneWalls(input: StandaloneWallInput) {
  const registered = input.page?.vectorizer && alignVectorizerFaces(input.page.vectorizer, input.millimetresPerPixel);
  const vectorizerRooms = input.rooms.length > 0
    && input.rooms.every((room) => room.registrationKind === "vectorizer_wall_topology");
  if (!registered || !vectorizerRooms) return 0;
  const roomEdgeIds = new Set(registered.rooms.flatMap((room) => room.edgeIds));
  const vertexById = new Map(input.vertices.map((vertex) => [vertex.id, vertex]));
  const placed = input.walls.flatMap((wall): Placed[] => {
    if (wall.path.kind !== "line") return [];
    const start = vertexById.get(wall.path.startVertexId);
    const end = vertexById.get(wall.path.endVertexId);
    return start && end ? [{ start, end, thicknessMm: wall.thicknessMm }] : [];
  });
  const used = new Set(placed.flatMap((wall) => [wall.start, wall.end]));
  let added = 0;
  for (const edge of registered.wallEdges) {
    if (roomEdgeIds.has(edge.id) || edge.opening) continue;
    const [from, to] = edge.sourcePx;
    const candidate: Placed = {
      start: input.getVertex(from[0], from[1], STANDALONE_CONFIDENCE),
      end: input.getVertex(to[0], to[1], STANDALONE_CONFIDENCE),
      thicknessMm: vectorizerThicknessMm(edge.sourcePx, edge.thicknessPx, input.millimetresPerPixel),
    };
    if (candidate.start.id === candidate.end.id || !placeClear(candidate, placed, used)) continue;
    const middle = { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 };
    const inside = registered.rooms.some((room) => !room.shaft && pointInPolygon(middle, room.sourcePoints));
    input.walls.push({
      id: `w${input.walls.length + 1}`,
      path: { kind: "line", startVertexId: candidate.start.id, endVertexId: candidate.end.id },
      thicknessMm: candidate.thicknessMm,
      classification: inside ? "interior" : "exterior",
      adjacentRoomIds: [],
      provenance: input.provenance(STANDALONE_CONFIDENCE, STANDALONE_NOTE),
    });
    placed.push(candidate);
    used.add(candidate.start).add(candidate.end);
    added += 1;
  }
  return added;
}

/**
 * Lines the candidate up with its neighbours (moving only vertices no wall uses yet), then tells whether the compiler
 * would take it; if the lined-up wall would cross another, its vertices go back and the wall as drawn is judged.
 */
function placeClear(candidate: Placed, placed: Placed[], used: Set<FloorPlanVertexV2>) {
  const before = [candidate.start, candidate.end].map((vertex) => ({ vertex, xMm: vertex.xMm, zMm: vertex.zMm }));
  lineUp(candidate, placed, used);
  if (!placed.some((wall) => conflicts(candidate, wall))) return true;
  for (const { vertex, xMm, zMm } of before) Object.assign(vertex, { xMm, zMm });
  return !placed.some((wall) => conflicts(candidate, wall));
}

/** The candidate's faces (when both its vertices are new), then each new end, onto the line beside them. */
function lineUp(candidate: Placed, placed: Placed[], used: Set<FloorPlanVertexV2>) {
  const first = axisWall(candidate);
  if (!first) return;
  const others = placed.flatMap((wall) => axisWall(wall) ?? []);
  const fresh = [candidate.start, candidate.end].filter((vertex) => !used.has(vertex));
  const across = first.plumb ? "xMm" : "zMm";
  const along = first.plumb ? "zMm" : "xMm";
  if (fresh.length === 2) {
    const shift = nearestMove([first.at - first.half, first.at + first.half], faceMoves(first, others));
    for (const vertex of fresh) vertex[across] = Math.round(vertex[across] + shift);
  }
  const own = axisWall(candidate) ?? first;
  for (const vertex of fresh) {
    const outward = vertex[along] === own.from ? -1 : 1;
    vertex[along] = Math.round(vertex[along] + nearestMove([vertex[along]], endMoves(own, outward, others)));
  }
}

function axisWall(wall: Placed): AxisWall | null {
  const { start, end } = wall;
  const half = wall.thicknessMm / 2;
  if (start.xMm === end.xMm && start.zMm !== end.zMm) {
    return { plumb: true, at: start.xMm, from: Math.min(start.zMm, end.zMm), to: Math.max(start.zMm, end.zMm), half };
  }
  if (start.zMm === end.zMm && start.xMm !== end.xMm) {
    return { plumb: false, at: start.zMm, from: Math.min(start.xMm, end.xMm), to: Math.max(start.xMm, end.xMm), half };
  }
  return null;
}

/** A parallel neighbour alongside: each of the wall's faces may go onto its face facing the same way, never onto the
 * other one (the two walls would only touch). The moves are given per face, low face first. */
function faceMoves(own: AxisWall, others: AxisWall[]): Moves[] {
  const along = others.filter((other) => other.plumb === own.plumb
    && Math.min(other.to, own.to) - Math.max(other.from, own.from) > 0);
  const low = along.map((other) => other.at - other.half);
  const high = along.map((other) => other.at + other.half);
  return [{ targets: low, touching: high }, { targets: high, touching: low }];
}

/** A free end may go onto the far face of a wall across it that it runs through (the two make one straight face), or
 * onto the same end of a parallel wall beside it; never onto the near face of a wall across (it would only touch). */
function endMoves(own: AxisWall, outward: number, others: AxisWall[]): Moves[] {
  const targets: number[] = [];
  const touching: number[] = [];
  for (const other of others) {
    if (other.plumb !== own.plumb) {
      if (Math.min(other.to, own.at + own.half) - Math.max(other.from, own.at - own.half) <= 0) continue;
      targets.push(other.at + outward * other.half);
      touching.push(other.at - outward * other.half);
    } else if (Math.abs(other.at - own.at) <= other.half + own.half + 1) {
      targets.push(outward < 0 ? other.from : other.to);
    }
  }
  return [{ targets, touching }];
}

/** No move when a face or end already lines up exactly; otherwise the smallest one within rounding's reach that
 * leaves nothing only touching. */
function nearestMove(positions: number[], moves: Moves[]) {
  const offsets = positions.flatMap((position, i) => moves[i].targets.map((target) => target - position));
  if (offsets.some((offset) => Math.abs(offset) < 0.01)) return 0;
  const touches = (offset: number) => positions.some((position, i) =>
    moves[i].touching.some((face) => Math.abs(position + offset - face) < 0.5));
  const allowed = offsets.filter((offset) => Math.abs(offset) <= SAME_FACE_MM && !touches(offset));
  return allowed.reduce((best, offset) => (Math.abs(offset) < Math.abs(best) ? offset : best), allowed[0] ?? 0);
}

/** What the compiler refuses between two line walls: crossing without a shared end, or running along each other. */
function conflicts(first: Segment, second: Segment) {
  if (!floorPlanLineSegmentsIntersect(first.start, first.end, second.start, second.end)) return false;
  const shared = [first.start, first.end].find((vertex) => vertex === second.start || vertex === second.end);
  if (!shared) return true;
  const firstOther = shared === first.start ? first.end : first.start;
  const secondOther = shared === second.start ? second.end : second.start;
  return floorPlanPointOnLineSegment(firstOther, second.start, second.end)
    || floorPlanPointOnLineSegment(secondOther, first.start, first.end);
}
