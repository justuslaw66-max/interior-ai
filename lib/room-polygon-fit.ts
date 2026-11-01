import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";
import {
  findNearestFurnitureFit, getFurnitureFaces, isFurnitureFootprintClear, type FurnitureFaces, type FurnitureRoomContext,
} from "@/lib/furniture-room-fit";

/**
 * Placement in a drawn or imported room's outline (a custom polygon): whether a point or an item's box stands inside it, and
 * the clamp that keeps an item inside it (clampToRoom in lib/design-page-geometry.ts, which re-exports these).
 */

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPointOnSegment(
  point: RoomPlanPolygonPoint,
  first: RoomPlanPolygonPoint,
  second: RoomPlanPolygonPoint,
  epsilon = EDITOR_GEOMETRY_TOLERANCES.polygonMeters
): boolean {
  const cross =
    (point.z - first.z) * (second.x - first.x) -
    (point.x - first.x) * (second.z - first.z);
  if (Math.abs(cross) > epsilon) return false;

  return (
    point.x >= Math.min(first.x, second.x) - epsilon &&
    point.x <= Math.max(first.x, second.x) + epsilon &&
    point.z >= Math.min(first.z, second.z) - epsilon &&
    point.z <= Math.max(first.z, second.z) + epsilon
  );
}

export function isPointInsideRoomPolygon(
  point: RoomPlanPolygonPoint,
  polygon: RoomPlanPolygonPoint[]
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (isPointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function isPointInsideRoomPolygonWithHoles(
  point: RoomPlanPolygonPoint,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][] = []
): boolean {
  return (
    isPointInsideRoomPolygon(point, polygon) &&
    !holes.some(
      (hole) => hole.length >= 3 && isPointInsideRoomPolygon(point, hole)
    )
  );
}

function lineSegmentsIntersect(
  firstStart: RoomPlanPolygonPoint,
  firstEnd: RoomPlanPolygonPoint,
  secondStart: RoomPlanPolygonPoint,
  secondEnd: RoomPlanPolygonPoint
): boolean {
  const cross = (
    origin: RoomPlanPolygonPoint,
    first: RoomPlanPolygonPoint,
    second: RoomPlanPolygonPoint
  ) =>
    (first.x - origin.x) * (second.z - origin.z) -
    (first.z - origin.z) * (second.x - origin.x);
  const firstSideA = cross(firstStart, firstEnd, secondStart);
  const firstSideB = cross(firstStart, firstEnd, secondEnd);
  const secondSideA = cross(secondStart, secondEnd, firstStart);
  const secondSideB = cross(secondStart, secondEnd, firstEnd);
  const epsilon = EDITOR_GEOMETRY_TOLERANCES.polygonMeters;

  if (
    Math.abs(firstSideA) <= epsilon &&
    isPointOnSegment(secondStart, firstStart, firstEnd, epsilon)
  ) return true;
  if (
    Math.abs(firstSideB) <= epsilon &&
    isPointOnSegment(secondEnd, firstStart, firstEnd, epsilon)
  ) return true;
  if (
    Math.abs(secondSideA) <= epsilon &&
    isPointOnSegment(firstStart, secondStart, secondEnd, epsilon)
  ) return true;
  if (
    Math.abs(secondSideB) <= epsilon &&
    isPointOnSegment(firstEnd, secondStart, secondEnd, epsilon)
  ) return true;

  return (
    firstSideA * firstSideB < -epsilon &&
    secondSideA * secondSideB < -epsilon
  );
}

export function polygonIntersectsFootprint(
  polygon: RoomPlanPolygonPoint[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const footprint = [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ },
  ];
  if (polygon.some((point) => point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ) ||
    footprint.some((point) => isPointInsideRoomPolygon(point, polygon))) return true;

  return polygon.some((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return footprint.some((corner, edgeIndex) =>
      lineSegmentsIntersect(
        point,
        next,
        corner,
        footprint[(edgeIndex + 1) % footprint.length]
      )
    );
  });
}

export function isFootprintInsideRoomPolygon(
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][] = []
): boolean {
  const samplePoints: RoomPlanPolygonPoint[] = [
    { x: x - halfWidth, z: z - halfDepth },
    { x, z: z - halfDepth },
    { x: x + halfWidth, z: z - halfDepth },
    { x: x - halfWidth, z },
    { x, z },
    { x: x + halfWidth, z },
    { x: x - halfWidth, z: z + halfDepth },
    { x, z: z + halfDepth },
    { x: x + halfWidth, z: z + halfDepth },
  ];

  if (
    !samplePoints.every((samplePoint) =>
      isPointInsideRoomPolygonWithHoles(samplePoint, polygon, holes)
    )
  ) return false;

  return !holes.some(
    (hole) =>
      hole.length >= 3 &&
      polygonIntersectsFootprint(
        hole,
        x - halfWidth,
        x + halfWidth,
        z - halfDepth,
        z + halfDepth
      )
  );
}

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const clampToBounds = (x: number, z: number, bounds: Bounds): [number, number] =>
  [clampValue(x, bounds.minX, bounds.maxX), clampValue(z, bounds.minZ, bounds.maxZ)];

/**
 * The places the clamp tries for an item's centre: each x and each z where its box (grown by the wall inset) meets the
 * outline's bounds, an outline corner or a hole's corner, in the order the clamp lists them.
 */
function candidatePlaces(
  polygon: readonly RoomPlanPolygonPoint[], holes: readonly RoomPlanPolygonPoint[][], halfWidth: number, halfDepth: number,
  bounds: Bounds, clamped: [number, number]
): [number[], number[]] {
  const { minX, maxX, minZ, maxZ } = bounds;
  const xCandidates = new Set<number>([clamped[0], minX, maxX]);
  const zCandidates = new Set<number>([clamped[1], minZ, maxZ]);
  for (const point of polygon) {
    xCandidates.add(clampValue(point.x - halfWidth, minX, maxX));
    xCandidates.add(clampValue(point.x + halfWidth, minX, maxX));
    zCandidates.add(clampValue(point.z - halfDepth, minZ, maxZ));
    zCandidates.add(clampValue(point.z + halfDepth, minZ, maxZ));
  }
  const holeClearanceX = halfWidth + EDITOR_GEOMETRY_TOLERANCES.clearanceMeters;
  const holeClearanceZ = halfDepth + EDITOR_GEOMETRY_TOLERANCES.clearanceMeters;
  for (const point of holes.flat()) {
    xCandidates.add(clampValue(point.x - holeClearanceX, minX, maxX));
    xCandidates.add(clampValue(point.x + holeClearanceX, minX, maxX));
    zCandidates.add(clampValue(point.z - holeClearanceZ, minZ, maxZ));
    zCandidates.add(clampValue(point.z + holeClearanceZ, minZ, maxZ));
  }
  return [[...xCandidates], [...zCandidates]];
}

type Pair = { distance: number; i: number; j: number };

/**
 * The candidate (xs[a], zs[b]) nearest (x, z) that `fits`, and among equally near ones the first in the clamp's order (by
 * x, then z), or null. Pairs are taken nearest first from a heap, so a room of hundreds of corners tests only those
 * nearer than the answer, where it tested all of them.
 */
export function nearestFittingCandidate(
  xs: readonly number[], zs: readonly number[], x: number, z: number, fits: (atX: number, atZ: number) => boolean
): [number, number] | null {
  const order = (values: readonly number[], from: number) => values.map((value, index) => ({ value, index, square: (value - from) ** 2 }))
    .sort((first, second) => first.square - second.square || first.index - second.index);
  const [byX, byZ] = [order(xs, x), order(zs, z)];
  if (!byX.length || !byZ.length) return null;
  const heap: Pair[] = [];
  const before = (a: Pair, b: Pair) => a.distance < b.distance || (a.distance === b.distance &&
    (byX[a.i].index < byX[b.i].index || (byX[a.i].index === byX[b.i].index && byZ[a.j].index < byZ[b.j].index)));
  const push = (i: number, j: number) => {
    if (i >= byX.length || j >= byZ.length) return;
    heap.push({ distance: byX[i].square + byZ[j].square, i, j });
    for (let at = heap.length - 1; at > 0;) {
      const parent = (at - 1) >> 1;
      if (!before(heap[at], heap[parent])) break;
      [heap[at], heap[parent]] = [heap[parent], heap[at]];
      at = parent;
    }
  };
  const pop = (): Pair => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let at = 0; ;) {
        const [left, right] = [2 * at + 1, 2 * at + 2];
        let least = at;
        if (left < heap.length && before(heap[left], heap[least])) least = left;
        if (right < heap.length && before(heap[right], heap[least])) least = right;
        if (least === at) break;
        [heap[at], heap[least]] = [heap[least], heap[at]];
        at = least;
      }
    }
    // Each pair once: along z from every pair, along x from the first z only.
    push(top.i, top.j + 1);
    if (top.j === 0) push(top.i + 1, 0);
    return top;
  };
  push(0, 0);
  while (heap.length) {
    // All pairs as near as the nearest left, in the clamp's order: the first that fits is its choice.
    const batch = [pop()];
    while (heap.length && heap[0].distance === batch[0].distance) batch.push(pop());
    batch.sort((a, b) => byX[a.i].index - byX[b.i].index || byZ[a.j].index - byZ[b.j].index);
    const found = batch.find(({ i, j }) => fits(byX[i].value, byZ[j].value));
    if (found) return [byX[found.i].value, byZ[found.j].value];
  }
  return null;
}

/**
 * A piece of furniture as it stands: its own size (metres) and turn, how far it keeps off the walls, and what is known of the
 * room beyond its outline (the rooms next door). Built-ins on furniture's rule pass none and keep the line's box test.
 */
export type ClampedItem = { width: number; depth: number; rotationY: number; clearance: number; context: FurnitureRoomContext };

/**
 * Placement containment's test in a drawn or imported room. For furniture whose room is known (`item`, and faces for the
 * outline), its real footprint in the room and 2 cm off every wall, panel and column as the room's 3D view draws them
 * (lib/furniture-room-fit.ts); otherwise the line's: its box (`effectiveWidth` × `effectiveDepth`, grown by `wall`) inside the
 * outline and out of its holes.
 */
export function isPlacedItemInsideRoomPolygon(
  x: number, z: number, effectiveWidth: number, effectiveDepth: number, wall: number,
  polygon: RoomPlanPolygonPoint[], holes: RoomPlanPolygonPoint[][], item?: ClampedItem
): boolean {
  const faces = item && getFurnitureFaces(polygon, holes, item.clearance, item.context);
  if (item && faces) return isFurnitureFootprintClear(faces, x, z, item.width, item.depth, item.rotationY);
  return isFootprintInsideRoomPolygon(x, z, effectiveWidth / 2 + wall, effectiveDepth / 2 + wall, polygon, holes);
}

/**
 * An item's centre kept inside a drawn or imported room's outline: its box, `effectiveWidth` × `effectiveDepth` and grown by
 * `wall`, inside the outline and out of its holes (isFootprintInsideRoomPolygon): where it is, else the nearest of the
 * candidate places, else `fallbackBounds`. That is the line's clamp, and a built-in's on furniture's rule. Furniture (`item`)
 * whose room is known keeps that place where its real footprint is clear of the room's walls, panels and columns as its 3D
 * view draws them (lib/furniture-room-fit.ts); where it isn't, it goes to the nearest place to the target that is.
 */
export function clampToCustomPolygonRoom(
  x: number,
  z: number,
  effectiveWidth: number,
  effectiveDepth: number,
  wall: number,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][],
  fallbackBounds: Bounds,
  item?: ClampedItem
): [number, number] {
  // Where the box fits nowhere, the room's bounds, as the line does for an item that can't fit.
  const placed = clampAsSampled(x, z, effectiveWidth, effectiveDepth, wall, polygon, holes) ?? clampToBounds(x, z, fallbackBounds);
  const faces = item && getFurnitureFaces(polygon, holes, item.clearance, item.context);
  return item && faces ? keepClearOfWalls(faces, placed, x, z, polygon, item) : placed;
}

/**
 * Where the clamp's place leaves the item's footprint nearer a wall, panel or column than its clearance (an outside corner, a
 * thin spike, an arc between the box's nine sample points), the nearest place to the target where it is clear, searched out
 * from the target as far as the outline reaches; where none is, the clamp's place, as the line does for an item that can't
 * fit (containment then refuses it).
 */
function keepClearOfWalls(
  faces: FurnitureFaces, placed: [number, number], x: number, z: number, polygon: RoomPlanPolygonPoint[], item: ClampedItem
): [number, number] {
  const { width, depth, rotationY } = item;
  if (isFurnitureFootprintClear(faces, placed[0], placed[1], width, depth, rotationY)) return placed;
  const key = `${width}:${depth}:${rotationY}`, known = nowhere.get(faces) ?? new Set<string>();
  if (known.has(key)) return placed;
  // The nearest place within a reach is the nearest of all once one is found: first a little past how far the line moved it
  // (the nearest clear place is most often just past the line's), then as far as the room reaches.
  const moved = Math.hypot(placed[0] - x, placed[1] - z);
  const near = findNearestFurnitureFit(faces, x, z, width, depth, rotationY, Math.max(0.02, moved) * 1.1 + 0.03);
  if (near) return near;
  const xs = polygon.map((point) => point.x), zs = polygon.map((point) => point.z);
  const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + Math.hypot(width, depth);
  const far = findNearestFurnitureFit(faces, x, z, width, depth, rotationY, span + moved);
  if (far) return far;
  // Clear nowhere in the room: so it stays, for this size and turn, while the room's walls are the same (a drag's frames).
  nowhere.set(faces, known.add(key));
  return placed;
}

// The sizes and turns furniture fits nowhere clear in a room, by its walls as drawn.
const nowhere = new WeakMap<FurnitureFaces, Set<string>>();

function clampAsSampled(
  x: number,
  z: number,
  effectiveWidth: number,
  effectiveDepth: number,
  wall: number,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][]
): [number, number] | null {
  if (polygon.length < 3) return null;
  const halfWidth = effectiveWidth / 2 + wall, halfDepth = effectiveDepth / 2 + wall;
  const bounds = {
    minX: Math.min(...polygon.map((point) => point.x)) + halfWidth, maxX: Math.max(...polygon.map((point) => point.x)) - halfWidth,
    minZ: Math.min(...polygon.map((point) => point.z)) + halfDepth, maxZ: Math.max(...polygon.map((point) => point.z)) - halfDepth,
  };
  if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) return null;
  const fits = (atX: number, atZ: number) => isFootprintInsideRoomPolygon(atX, atZ, halfWidth, halfDepth, polygon, holes);
  const clamped = clampToBounds(x, z, bounds);
  if (fits(clamped[0], clamped[1])) return clamped;
  const [xs, zs] = candidatePlaces(polygon, holes, halfWidth, halfDepth, bounds, clamped);
  return nearestFittingCandidate(xs, zs, x, z, fits);
}
