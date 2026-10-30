/**
 * Where along a wall's face a built-in run can stand (lib/room-built-in-region.ts). Everything is in the face's own frame, in
 * millimetres: [along the face, from it into the room]. A run of depth D whose back stands `back` off the face covers, at
 * each point along it, the cross-section from `back` to `back` + D; it can stand over a stretch where every cross-section
 * keeps `clearance` from every obstacle (another wall's solid, a laminate panel, a column).
 */

/** A point in a face's frame, in millimetres: [along the face, into the room]. */
export type FacePoint = readonly [number, number];

/** Something a run keeps clear of: a convex outline in a face's frame (two points for a segment). */
export type FaceObstacle = readonly FacePoint[];

/** The part of a convex outline where `keep` holds, `keep` being one side of the line `y = edgeY` (Sutherland–Hodgman). */
function clipAtY(points: readonly FacePoint[], edgeY: number, above: boolean): FacePoint[] {
  const keep = (point: FacePoint) => (above ? point[1] >= edgeY : point[1] <= edgeY);
  const output: FacePoint[] = [];
  const closed = points.length > 2 ? points.length : points.length - 1;
  points.forEach((point, index) => {
    if (keep(point)) output.push(point);
    if (index >= closed) return;
    const next = points[(index + 1) % points.length];
    if (keep(point) !== keep(next)) {
      const t = (edgeY - point[1]) / (next[1] - point[1]);
      output.push([point[0] + (next[0] - point[0]) * t, edgeY]);
    }
  });
  return output;
}

/** The outline cut to the strip from y0 to y1. */
export function clipToStrip(points: readonly FacePoint[], y0: number, y1 = Number.POSITIVE_INFINITY): FacePoint[] {
  const above = clipAtY(points, y0, true);
  return Number.isFinite(y1) ? clipAtY(above, y1, false) : above;
}

function spanOf(points: readonly FacePoint[]): [number, number] | null {
  if (!points.length) return null;
  const values = points.map((point) => point[0]);
  return [Math.min(...values), Math.max(...values)];
}

/**
 * The stretch along the face over which a cross-section from y0 to y1 comes nearer than `clearance` to the obstacle (or, with
 * no clearance, meets it): the obstacle grown by a disc of that radius, cut to the strip. It is convex, so one stretch.
 */
export function getObstacleReach(obstacle: FaceObstacle, y0: number, y1: number, clearance: number): [number, number] | null {
  const spans: Array<[number, number] | null> = [spanOf(clipToStrip(obstacle, y0, y1))];
  if (clearance > 0) {
    const sides = obstacle.length > 2 ? obstacle.length : obstacle.length - 1;
    for (let index = 0; index < sides; index += 1) {
      const start = obstacle[index], end = obstacle[(index + 1) % obstacle.length];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (!(length > 0)) continue;
      const ns = (-(end[1] - start[1]) / length) * clearance, ny = ((end[0] - start[0]) / length) * clearance;
      const band: FacePoint[] = [[start[0] + ns, start[1] + ny], [end[0] + ns, end[1] + ny], [end[0] - ns, end[1] - ny], [start[0] - ns, start[1] - ny]];
      spans.push(spanOf(clipToStrip(band, y0, y1)));
    }
    obstacle.forEach(([s, y]) => {
      const dy = Math.max(0, y0 - y, y - y1);
      if (dy < clearance) {
        const half = Math.sqrt(clearance * clearance - dy * dy);
        spans.push([s - half, s + half]);
      }
    });
  }
  const found = spans.filter((span): span is [number, number] => span !== null);
  if (!found.length) return null;
  return [Math.min(...found.map(([from]) => from)), Math.max(...found.map(([, to]) => to))];
}

/**
 * The stretches of [from, to] where a run's cross-sections, from y0 to y1, keep `clearance` from every obstacle they would
 * meet along the face: one that stands between y0 and y1 (another wall at its end, a column beside it), measured from the
 * nearest point of its part in front of the run's back, wherever that is. One wholly in front of the run (the wall across a
 * narrow room) or behind its back keeps none: the run may stand up to it, or over it. With no clearance, a run may touch an
 * obstacle (end on its face) but not overlap it.
 */
export function getObstacleFreeSpans(
  obstacles: readonly FaceObstacle[], y0: number, y1: number, clearance: number, from: number, to: number
): Array<[number, number]> {
  if (!(to > from)) return [];
  // Met when it stands more than a thousandth of a mm into the run's depth (one flush with its back or front isn't), and kept
  // clear of from its part in front of the run's back.
  const [back, front] = y1 - y0 > 0.002 ? [y0 + 0.001, y1 - 0.001] : [y0, y1];
  const blocked = obstacles
    .filter((obstacle) => clipToStrip(obstacle, back, front).length > 0)
    .map((obstacle) => getObstacleReach(clipToStrip(obstacle, y0), y0, y1, clearance))
    .filter((reach): reach is [number, number] => reach !== null && reach[1] > from && reach[0] < to)
    .sort((left, right) => left[0] - right[0]);
  const free: Array<[number, number]> = [];
  let cursor = from;
  for (const [blockFrom, blockTo] of blocked) {
    if (blockFrom > cursor) free.push([cursor, Math.min(blockFrom, to)]);
    cursor = Math.max(cursor, blockTo);
    if (cursor >= to) break;
  }
  if (cursor < to) free.push([cursor, to]);
  return free.filter(([start, end]) => end > start);
}
