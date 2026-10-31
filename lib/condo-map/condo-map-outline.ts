import type { CondoFeatureCollection, LonLat } from "./condo-map-data";
import { segmentsCross } from "./condo-map-geometry";

/**
 * A unit's painted floor, smoothed for the admin condo map (J, 31 Oct 2026: the painted floor looked "rougher with
 * small sharp details" beside a unit's brochure plan). The masters trace each unit's outline off its plan, and about a
 * quarter of the traced edges are under 15 cm: steps and slants the tracing left along a wall, which the map paints
 * 4 cm thick and lights, so each shows as a small sharp edge. The map closes each slit or spike narrower than
 * OUTLINE_SLIT_M at its mouth, then draws the outline through the corners that stand more than OUTLINE_TOLERANCE_M off
 * the line between their neighbours (Douglas-Peucker), so a recess or a column stays and a step of a few centimetres
 * goes. Only the map's drawing changes: map.json keeps the masters' outlines.
 *
 * An outline the smoothing would spoil (edges crossing, or its area off by more than OUTLINE_AREA_SLACK) is drawn as
 * traced.
 */
export const OUTLINE_TOLERANCE_M = 0.12;
export const OUTLINE_SLIT_M = 0.25;
export const OUTLINE_SLIT_AREA_M2 = 0.5;
export const OUTLINE_AREA_SLACK = 0.03;

type Point = readonly [number, number];

/** Metres east and north of the ring's first corner (the outlines are tens of metres, so flat is close enough). */
function toMetres(ring: readonly LonLat[], latDeg: number): Point[] {
  const east = 111_320 * Math.cos((latDeg * Math.PI) / 180);
  const north = 110_574;
  const [lon0, lat0] = ring[0];
  return ring.map(([lon, lat]) => [(lon - lon0) * east, (lat - lat0) * north] as const);
}

function offLine(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dx * (start[1] - point[1]) - dy * (start[0] - point[0])) / length;
}

/** Douglas-Peucker between two kept corners, without recursion: marks the corners that stand off the line. */
function keepCorners(points: readonly Point[], first: number, last: number, toleranceM: number, keep: boolean[]): void {
  const spans: Array<[number, number]> = [[first, last]];
  while (spans.length > 0) {
    const [from, to] = spans.pop() ?? [0, 0];
    let farthest = -1;
    let distance = toleranceM;
    for (let index = from + 1; index < to; index++) {
      const off = offLine(points[index], points[from], points[to]);
      if (off > distance) [farthest, distance] = [index, off];
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    spans.push([from, farthest], [farthest, to]);
  }
}

function area(points: readonly Point[]): number {
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) twice += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  return Math.abs(twice) / 2;
}

/** Whether any two edges of a closed outline that don't share a corner cross. */
function crossesItself(points: readonly Point[]): boolean {
  const count = points.length;
  for (let i = 0; i < count; i++) {
    for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) continue;
      if (segmentsCross(points[i], points[(i + 1) % count], points[j], points[(j + 1) % count])) return true;
    }
  }
  return false;
}

/**
 * The corners left once each slit or spike is closed: a run of up to three corners that goes out and comes back
 * through a mouth narrower than OUTLINE_SLIT_M, holding under OUTLINE_SLIT_AREA_M2, is cut off at its mouth.
 */
function closeSlits(points: readonly Point[]): number[] {
  const kept: number[] = [];
  for (let index = 0; index < points.length; index++) {
    kept.push(index);
    for (let span = 4; span >= 2; span--) {
      const end = index + span;
      if (end >= points.length) continue;
      const run = points.slice(index, end + 1);
      if (Math.hypot(run[0][0] - run[span][0], run[0][1] - run[span][1]) >= OUTLINE_SLIT_M || area(run) >= OUTLINE_SLIT_AREA_M2) continue;
      index = end - 1;
      break;
    }
  }
  return kept;
}

/** A closed ring (first corner repeated last) through its corners that stand more than the tolerance off their line. */
export function smoothRing(ring: readonly LonLat[], latDeg: number, toleranceM = OUTLINE_TOLERANCE_M): LonLat[] {
  const traced = ring.slice(0, -1);
  if (traced.length < 4) return [...ring];
  const tracedPoints = toMetres(traced, latDeg);
  // the first corner always stays, so every point keeps the same origin
  const unslit = closeSlits(tracedPoints);
  const points = unslit.map((index) => tracedPoints[index]);
  // two corners far apart anchor the ring; each way round between them is smoothed on its own
  const far = points.reduce((best, point, index) => (Math.hypot(...point) > Math.hypot(...points[best]) ? index : best), 0);
  const loop = [...points, points[0]];
  const keep = loop.map((_, index) => index === 0 || index === far || index === points.length);
  keepCorners(loop, 0, far, toleranceM, keep);
  keepCorners(loop, far, points.length, toleranceM, keep);
  const kept = unslit.filter((_, index) => keep[index]);
  const keptPoints = kept.map((index) => tracedPoints[index]);
  if (kept.length < 3 || crossesItself(keptPoints)) return [...ring];
  if (Math.abs(area(keptPoints) - area(tracedPoints)) > OUTLINE_AREA_SLACK * area(tracedPoints)) return [...ring];
  return [...kept, kept[0]].map((index) => traced[index]);
}

/** A collection with each outline smoothed (a feature's properties and every other ring as they were). */
export function smoothOutlines<Properties>(collection: CondoFeatureCollection<Properties>, latDeg: number): CondoFeatureCollection<Properties> {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const [outer, ...holes] = feature.geometry.coordinates;
      return { ...feature, geometry: { ...feature.geometry, coordinates: [smoothRing(outer, latDeg), ...holes] } };
    }),
  };
}
