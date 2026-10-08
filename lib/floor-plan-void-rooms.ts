/**
 * A void - a duct or shaft, drawn on the plan as a dashed cross over an empty box -
 * is unusable space. The floor-plan vectorizer keeps it as a closed face only so
 * that the walls around it stand where they are drawn; it is never named, listed,
 * measured, floored or furnished. In the canonical document it is a room whose
 * `roomType` is `"void"` and whose name is empty; the plan draws its dashed cross.
 */
export const FLOOR_PLAN_VOID_ROOM_TYPE = "void";

export function isFloorPlanVoidRoom(room: { roomType: string }): boolean {
  return room.roomType === FLOOR_PLAN_VOID_ROOM_TYPE;
}

/** Every room but the voids: the rooms a person names, counts, lists and picks. */
export function namedFloorPlanRooms<T extends { roomType: string }>(rooms: readonly T[]): T[] {
  return rooms.filter((room) => !isFloorPlanVoidRoom(room));
}

/** A room found on an imported page; `void` marks a duct or shaft drawn with a dashed cross. */
type DetectedRoom = { label: string; roomType: string; void?: true; sourceLabels?: readonly unknown[] };

/** The canonical name of a detected room: a void stays unnamed. */
export function canonicalRoomName(detected: DetectedRoom): string {
  return detected.void ? "" : detected.label;
}

/** The canonical type of a detected room: a void is typed as such, so the editor never offers it as a room. */
export function canonicalRoomType(detected: DetectedRoom): string {
  return detected.void ? FLOOR_PLAN_VOID_ROOM_TYPE : detected.roomType;
}

export const VOID_ROOM_PROVENANCE_NOTE =
  "Void (duct or shaft) drawn with a dashed cross, found by the local vectorizer; kept only for the walls around it, never named or furnished";

/**
 * The source labels a detected room offers again as open-plan area labels. A void offers
 * none: it holds a label printed in it only so that the label is not offered elsewhere.
 */
export function openPlanSourceLabels<T extends DetectedRoom>(detected: T): T["sourceLabels"] {
  return detected.void ? undefined : detected.sourceLabels;
}

/** The room inventory's opening words: the closed spaces produced, and the voids, left unnamed. */
export function closedSpacesProduced(rooms: readonly { roomType: string }[]): string {
  const voids = rooms.length - namedFloorPlanRooms(rooms).length;
  const voidNote = voids ? ` (and ${voids} void${voids === 1 ? "" : "s"} drawn with a dashed cross, left unnamed)` : "";
  return `${rooms.length - voids} closed spaces were produced${voidNote}`;
}

export type VoidCrossPoint = { xMm: number; zMm: number };
export type VoidCrossSegment = [VoidCrossPoint, VoidCrossPoint];

const cross = (o: VoidCrossPoint, a: VoidCrossPoint, b: VoidCrossPoint) =>
  (a.xMm - o.xMm) * (b.zMm - o.zMm) - (a.zMm - o.zMm) * (b.xMm - o.xMm);

/** The outline's corners: repeated points and points on a straight run removed. */
function corners(points: readonly VoidCrossPoint[]): VoidCrossPoint[] {
  const distinct = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return Math.hypot(point.xMm - previous.xMm, point.zMm - previous.zMm) > 0.5;
  });
  return distinct.filter((point, index) => {
    const previous = distinct[(index + distinct.length - 1) % distinct.length];
    const next = distinct[(index + 1) % distinct.length];
    const length = Math.hypot(next.xMm - previous.xMm, next.zMm - previous.zMm) || 1;
    return Math.abs(cross(previous, point, next)) / length > 0.5;
  });
}

function inside(point: VoidCrossPoint, polygon: readonly VoidCrossPoint[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.zMm > point.zMm) !== (b.zMm > point.zMm) &&
      point.xMm < ((b.xMm - a.xMm) * (point.zMm - a.zMm)) / (b.zMm - a.zMm) + a.xMm) {
      result = !result;
    }
  }
  return result;
}

/** The parts of the line a-b that lie inside the polygon. */
function clipToPolygon(a: VoidCrossPoint, b: VoidCrossPoint, polygon: readonly VoidCrossPoint[]): VoidCrossSegment[] {
  const dx = b.xMm - a.xMm;
  const dz = b.zMm - a.zMm;
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const ex = q.xMm - p.xMm;
    const ez = q.zMm - p.zMm;
    const denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const t = ((p.xMm - a.xMm) * ez - (p.zMm - a.zMm) * ex) / denominator;
    const u = ((p.xMm - a.xMm) * dz - (p.zMm - a.zMm) * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((left, right) => left - right);
  const at = (t: number): VoidCrossPoint => ({ xMm: a.xMm + dx * t, zMm: a.zMm + dz * t });
  const pieces: VoidCrossSegment[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const [t0, t1] = [cuts[i], cuts[i + 1]];
    if ((t1 - t0) * Math.hypot(dx, dz) < 1 || !inside(at((t0 + t1) / 2), polygon)) continue;
    const last = pieces[pieces.length - 1];
    if (last && Math.hypot(last[1].xMm - at(t0).xMm, last[1].zMm - at(t0).zMm) < 1e-6) last[1] = at(t1);
    else pieces.push([at(t0), at(t1)]);
  }
  return pieces;
}

const signedArea = (polygon: readonly VoidCrossPoint[]) =>
  polygon.reduce((total, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return total + point.xMm * next.zMm - next.xMm * point.zMm;
  }, 0) / 2;

/**
 * The void's clear inside: its centre-line outline moved in by half of each side's wall.
 * `halfThicknessMm[i]` belongs to the side from `outline[i]` to `outline[i + 1]`.
 */
function insetOutline(
  outline: readonly VoidCrossPoint[],
  halfThicknessMm: readonly number[]
): VoidCrossPoint[] | null {
  const n = outline.length;
  const area = signedArea(outline);
  const sides = outline.map((start, index) => {
    const end = outline[(index + 1) % n];
    const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
    if (length < 1e-6) return null;
    const ux = (end.xMm - start.xMm) / length;
    const uz = (end.zMm - start.zMm) / length;
    const [nx, nz] = area > 0 ? [-uz, ux] : [uz, -ux];
    return { ux, uz, nx, nz, offset: Math.max(0, halfThicknessMm[index] ?? 0) };
  });
  const result: VoidCrossPoint[] = [];
  const atVertex: Array<{ first: number; last: number } | null> = [];
  for (let index = 0; index < n; index += 1) {
    let previousIndex = (index + n - 1) % n;
    while (!sides[previousIndex] && previousIndex !== index) previousIndex = (previousIndex + n - 1) % n;
    const previous = sides[previousIndex];
    const current = sides[index];
    if (!previous || !current) {
      atVertex.push(null);
      continue;
    }
    const vertex = outline[index];
    const first = result.length;
    const cross = previous.ux * current.uz - previous.uz * current.ux;
    if (Math.abs(cross) < 1e-9) {
      // Straight on along one line: where the wall changes thickness the inside steps.
      result.push({ xMm: vertex.xMm + previous.nx * previous.offset, zMm: vertex.zMm + previous.nz * previous.offset });
      if (Math.abs(previous.offset - current.offset) > 0.5) {
        result.push({ xMm: vertex.xMm + current.nx * current.offset, zMm: vertex.zMm + current.nz * current.offset });
      }
    } else {
      // Where the two moved-in sides meet.
      const ax = vertex.xMm + previous.nx * previous.offset;
      const az = vertex.zMm + previous.nz * previous.offset;
      const bx = vertex.xMm + current.nx * current.offset;
      const bz = vertex.zMm + current.nz * current.offset;
      const t = ((bx - ax) * current.uz - (bz - az) * current.ux) / cross;
      result.push({ xMm: ax + previous.ux * t, zMm: az + previous.uz * t });
    }
    atVertex.push({ first, last: result.length - 1 });
  }
  return keepsItsSides(sides, atVertex, result) ? result : null;
}

/**
 * Whether every moved-in side still runs the way it did: walls thicker than the void is
 * wide turn it inside out. `atVertex[i]`: the first and last moved-in points at corner i.
 */
function keepsItsSides(
  sides: ReadonlyArray<{ ux: number; uz: number } | null>,
  atVertex: ReadonlyArray<{ first: number; last: number } | null>,
  result: readonly VoidCrossPoint[]
): boolean {
  const n = sides.length;
  for (let index = 0; index < n; index += 1) {
    const side = sides[index];
    if (!side) continue;
    let nextIndex = (index + 1) % n;
    while (!atVertex[nextIndex] && nextIndex !== index) nextIndex = (nextIndex + 1) % n;
    const from = atVertex[index];
    const to = atVertex[nextIndex];
    if (!from || !to) return false;
    const a = result[from.last];
    const b = result[to.first];
    if ((b.xMm - a.xMm) * side.ux + (b.zMm - a.zMm) * side.uz <= 0) return false;
  }
  return true;
}

/**
 * The dashed cross a void is drawn with: corner to corner of its box. A four-cornered
 * void gets its two diagonals; any other outline gets the lines between its corners
 * farthest apart along the two diagonals, kept to the parts inside it. Given each side's
 * half wall thickness, the box is the void's clear inside, between the wall faces, as
 * the plan draws it.
 */
export function voidRoomCrossSegments(
  outline: readonly VoidCrossPoint[],
  halfThicknessMm?: readonly number[]
): VoidCrossSegment[] {
  let inside_ = outline;
  if (halfThicknessMm && halfThicknessMm.length === outline.length && outline.length >= 3) {
    // (walls thicker than the void is wide would turn it inside out: then the centre-lines are used)
    const moved = insetOutline(outline, halfThicknessMm);
    if (moved && moved.length >= 3) inside_ = moved;
  }
  const polygon = corners(inside_);
  if (polygon.length < 3) return [];
  if (polygon.length === 4) {
    return [
      [polygon[0], polygon[2]],
      [polygon[1], polygon[3]],
    ];
  }
  // Corner to corner: the corners farthest out along the two diagonals (an L's inside corner is
  // never one), kept to the parts inside the outline.
  const farthest = (score: (point: VoidCrossPoint) => number, sign: 1 | -1) =>
    polygon.reduce((best, point) => (sign * score(point) > sign * score(best) + 1e-9 ? point : best));
  const down = (point: VoidCrossPoint) => point.xMm + point.zMm;
  const up = (point: VoidCrossPoint) => point.xMm - point.zMm;
  return [
    ...clipToPolygon(farthest(down, -1), farthest(down, 1), polygon),
    ...clipToPolygon(farthest(up, -1), farthest(up, 1), polygon),
  ];
}

/** A cross line broken into dashes, for outputs that draw only solid strokes. */
export function dashedVoidCrossSegment(
  segment: VoidCrossSegment,
  dashMm = 120,
  gapMm = 80
): VoidCrossSegment[] {
  const [a, b] = segment;
  const length = Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm);
  if (length <= dashMm) return [segment];
  const at = (distance: number): VoidCrossPoint => ({
    xMm: a.xMm + ((b.xMm - a.xMm) * distance) / length,
    zMm: a.zMm + ((b.zMm - a.zMm) * distance) / length,
  });
  const dashes: VoidCrossSegment[] = [];
  for (let start = 0; start < length; start += dashMm + gapMm) {
    dashes.push([at(start), at(Math.min(length, start + dashMm))]);
  }
  return dashes;
}

/** A floor's rooms and walls as far as the void crosses need them (the compiled scene's floor). */
type VoidRoomFloor = {
  rooms: ReadonlyArray<{
    id: string;
    roomType: string;
    wallLoops: ReadonlyArray<{ kind: string; walls: ReadonlyArray<{ wallId: string; start: VoidCrossPoint }> }>;
  }>;
  walls: ReadonlyArray<{ id: string; thicknessMm: number }>;
};

/** Every void's dashed cross on the floor, as dashes with stable ids, for outputs that draw only solid strokes. */
export function voidRoomCrossDashes(floor: VoidRoomFloor): Array<{ id: string; dash: VoidCrossSegment }> {
  const wallThickness = new Map(floor.walls.map((wall) => [wall.id, wall.thicknessMm]));
  return floor.rooms.filter(isFloorPlanVoidRoom).flatMap((room) => {
    const outer = room.wallLoops.find((loop) => loop.kind === "outer")?.walls ?? [];
    const cross = voidRoomCrossSegments(
      outer.map((ref) => ref.start),
      outer.map((ref) => (wallThickness.get(ref.wallId) ?? 0) / 2)
    );
    return cross.flatMap((segment, lineIndex) =>
      dashedVoidCrossSegment(segment).map((dash, dashIndex) => ({ id: `${room.id}:void-cross:${lineIndex}:${dashIndex}`, dash }))
    );
  });
}
