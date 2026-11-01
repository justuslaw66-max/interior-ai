import { isInsideRing, signedArea, type BuiltInRegion } from "@/lib/room-built-in-region";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/** Whether a built-in's footprint (a convex outline, room-local metres) stands in a room's finished region (lib/room-built-in-region.ts). */

type Point = RoomPlanPolygonPoint;

/** True when the convex outlines overlap by more than a touch (separating axes). */
function convexOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  for (const shape of [first, second]) {
    for (let index = 0; index < shape.length; index += 1) {
      const start = shape[index], end = shape[(index + 1) % shape.length];
      const ax = -(end.z - start.z), az = end.x - start.x;
      if (ax === 0 && az === 0) continue;
      const project = (points: readonly Point[]) => points.map((point) => point.x * ax + point.z * az);
      const a = project(first), b = project(second);
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false;
    }
  }
  return true;
}

function boundsOf(points: readonly Point[]) {
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** True when the segments cross at a point inside both (touching ends don't count). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** True when the ring (an outline or a column) cuts into the convex footprint `corners`. */
function ringCutsInto(ring: readonly Point[], corners: readonly Point[]): boolean {
  const inside = (point: Point) => corners.every((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return ((next.x - corner.x) * (point.z - corner.z) - (next.z - corner.z) * (point.x - corner.x)) * Math.sign(signedArea(corners)) > 0;
  });
  return ring.some(inside) || ring.some((start, index) => corners.some((corner, cornerIndex) =>
    segmentsCross(start, ring[(index + 1) % ring.length], corner, corners[(cornerIndex + 1) % corners.length])));
}

/**
 * True when the convex footprint `corners` (room-local metres) keeps `depth` metres off every exposed face (region.faces),
 * along its stretch (the band in front of it where a recorded baseboard stands), touching that band at most.
 */
export function isFootprintClearOfFaces(region: BuiltInRegion, corners: readonly Point[], depth: number): boolean {
  if (!(depth > 0)) return true;
  const bounds = boundsOf(corners);
  return !region.faces.some((face) => {
    const off = (point: Point) => ({ x: point.x + face.nx * depth, z: point.z + face.nz * depth });
    const band = [face.start, face.end, off(face.end), off(face.start)], other = boundsOf(band);
    return other.maxX > bounds.minX && other.minX < bounds.maxX && other.maxZ > bounds.minZ && other.minZ < bounds.maxZ && convexOverlap(band, corners);
  });
}

/** True when the convex footprint `corners` (room-local metres) stands in the region, touching its edges at most. */
export function isFootprintInBuiltInRegion(region: BuiltInRegion, corners: readonly Point[]): boolean {
  if (!corners.every((corner) => isInsideRing(corner, region.outline)) || ringCutsInto(region.outline, corners)) return false;
  const bounds = boundsOf(corners);
  const near = (points: readonly Point[]) => {
    const other = boundsOf(points);
    return other.maxX > bounds.minX && other.minX < bounds.maxX && other.maxZ > bounds.minZ && other.minZ < bounds.maxZ;
  };
  if (region.solids.some((solid) => near(solid) && convexOverlap(solid, corners))) return false;
  return !region.holes.some((hole) => near(hole) &&
    (ringCutsInto(hole, corners) || corners.some((corner) => isInsideRing(corner, hole))));
}
