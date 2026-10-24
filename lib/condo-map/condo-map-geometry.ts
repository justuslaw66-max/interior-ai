import type { LonLat } from "./condo-map-data";

/**
 * Whether two outlines on the map meet: one has a corner inside the other, or their edges cross. The admin condo map
 * uses it to find Mapbox's own building on a development's site where a browser draws it in spite of the clip layer
 * (Safari did, 24 Oct 2026), so the page can hide it. Lon/lat are treated as flat: the outlines are tens of metres.
 */
export type Ring = readonly (readonly [number, number])[];
type Box = { west: number; south: number; east: number; north: number };

export function ringBox(ring: Ring): Box {
  const lons = ring.map((point) => point[0]);
  const lats = ring.map((point) => point[1]);
  return { west: Math.min(...lons), south: Math.min(...lats), east: Math.max(...lons), north: Math.max(...lats) };
}

function boxesMeet(a: Box, b: Box): boolean {
  return a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;
}

export function pointInRing(point: readonly [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function side(p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number {
  return Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
}

export function segmentsCross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number]
): boolean {
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

export function ringsMeet(first: Ring, second: Ring): boolean {
  if (!boxesMeet(ringBox(first), ringBox(second))) return false;
  if (first.some((point) => pointInRing(point, second)) || second.some((point) => pointInRing(point, first))) return true;
  for (let i = 0; i + 1 < first.length; i++) {
    for (let j = 0; j + 1 < second.length; j++) {
      if (segmentsCross(first[i], first[i + 1], second[j], second[j + 1])) return true;
    }
  }
  return false;
}

/** The outer rings of a rendered feature's Polygon or MultiPolygon, or none for anything else. */
export function outerRings(geometry: { type: string; coordinates: unknown } | null | undefined): Ring[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const polygons: unknown[] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.flatMap((polygon) => {
    const outer: unknown = Array.isArray(polygon) ? polygon[0] : null;
    return Array.isArray(outer) && outer.every(isLonLat) ? [outer] : [];
  });
}

function isLonLat(point: unknown): point is LonLat {
  return Array.isArray(point) && point.length >= 2 && typeof point[0] === "number" && typeof point[1] === "number";
}
