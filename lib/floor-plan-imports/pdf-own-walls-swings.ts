import type { RegisteredPageEvidence, SourcePointPx, SourceVectorSegment } from "./deterministic-evidence";
import type { Swing } from "./pdf-own-walls-grid";

type Path = RegisteredPageEvidence["vectorPaths"][number];
type Curve = NonNullable<Path["curves"]>[number];

/**
 * A door's swing is one stroked arc. Most drawings write it as one curved path; AutoCAD's export of Thomson Reserve
 * writes it as a chain of separate paths, a few pixels of arc each (14 Nov 2026), so every piece read as a swing of its
 * own and no door was found. Curved paths that meet end to end and run on in the same direction are one arc here. Two
 * arcs that meet at a sharp turn (the leaves of a pair, meeting at the middle) stay two. Thomson also draws some arcs as
 * one path of short straight pieces each turning a little the same way: such a path is an arc too.
 */
export const PDF_OWN_SWING_LIMITS = Object.freeze({
  /** Ends this near, in page pixels, meet. */
  meetPx: 0.75,
  /** An arc runs on where its direction turns by less than this, in degrees, where the pieces meet. */
  maxTurnDegrees: 30,
  /** A path of straight pieces is an arc where it has at least this many, each turning the same way by at most
   * `pieceTurnDegrees`, the whole turning between these. */
  minPieces: 6, pieceTurnDegrees: 20, arcMinDegrees: 60, arcMaxDegrees: 200,
});

/** The corner(s) of a box furthest from an arc's control points: where a swing is hinged. */
function swingOf(box: { left: number; top: number; right: number; bottom: number }, controls: SourcePointPx[]): Swing {
  const { left, top, right, bottom } = box;
  const corners: [number, number][] = [[left, top], [right, top], [left, bottom], [right, bottom]];
  if (!controls.length) return { left, top, right, bottom, hinges: corners };
  const x = controls.reduce((sum, point) => sum + point.x, 0) / controls.length, y = controls.reduce((sum, point) => sum + point.y, 0) / controls.length;
  const away = corners.map(([cx, cy]) => Math.hypot(cx - x, cy - y)), most = Math.max(...away);
  return { left, top, right, bottom, hinges: corners.filter((_, index) => away[index] >= 0.9 * most) };
}

function unit(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 1e-9 ? { x: x / length, y: y / length } : null;
}

/** An arc piece: its box, the points that bulge it (control points, or a polyline's corners), its two ends with the
 * direction away from the piece at each. */
type Arc = { box: Path["bbox"]; bulge: SourcePointPx[]; ends: [End, End] };
type End = { at: SourcePointPx; outward: { x: number; y: number } | null };

function curvedArc(path: Path, curves: Curve[]): Arc {
  const first = curves[0], last = curves[curves.length - 1];
  const after = first.controlPoints[0] ?? first.end, before = last.controlPoints[last.controlPoints.length - 1] ?? last.start;
  return { box: path.bbox, bulge: curves.flatMap((curve) => curve.controlPoints), ends: [
    { at: first.start, outward: unit(first.start.x - after.x, first.start.y - after.y) },
    { at: last.end, outward: unit(last.end.x - before.x, last.end.y - before.y) },
  ] };
}

/** A path of short straight pieces turning steadily one way, as an arc; null where it is not one. */
function polylineArc(path: Path, pieces: SourceVectorSegment[]): Arc | null {
  const { minPieces, pieceTurnDegrees, arcMinDegrees, arcMaxDegrees } = PDF_OWN_SWING_LIMITS;
  if (pieces.length < minPieces) return null;
  let total = 0, sign = 0;
  for (let k = 1; k < pieces.length; k += 1) {
    const a = pieces[k - 1], b = pieces[k];
    if (Math.hypot(b.start.x - a.end.x, b.start.y - a.end.y) > 0.1) return null;
    const turn = Math.atan2(b.end.y - b.start.y, b.end.x - b.start.x) - Math.atan2(a.end.y - a.start.y, a.end.x - a.start.x);
    const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(wrapped) > (pieceTurnDegrees * Math.PI) / 180 || wrapped * sign < 0) return null;
    if (wrapped !== 0) sign = Math.sign(wrapped);
    total += wrapped;
  }
  const degrees = (Math.abs(total) * 180) / Math.PI;
  if (degrees < arcMinDegrees || degrees > arcMaxDegrees) return null;
  const first = pieces[0], last = pieces[pieces.length - 1];
  return { box: path.bbox, bulge: pieces.slice(1).map((piece) => piece.start), ends: [
    { at: first.start, outward: unit(first.start.x - first.end.x, first.start.y - first.end.y) },
    { at: last.end, outward: unit(last.end.x - last.start.x, last.end.y - last.start.y) },
  ] };
}

/** The arc a stroked path draws, if it draws one: its curves, or straight pieces turning steadily. */
export function arcOf(path: Path, segments: ReadonlyMap<string, SourceVectorSegment>): Arc | null {
  const curves = path.curves ?? [];
  if (curves.length) return curvedArc(path, curves);
  return polylineArc(path, path.segmentIds.flatMap((id) => { const segment = segments.get(id); return segment ? [segment] : []; }));
}

/** Whether two ends join one arc: they meet, and the arc runs on through them (outward directions opposed). */
function runsOn(a: End, b: End) {
  if (Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) > PDF_OWN_SWING_LIMITS.meetPx) return false;
  if (!a.outward || !b.outward) return false;
  return -(a.outward.x * b.outward.x + a.outward.y * b.outward.y) >= Math.cos((PDF_OWN_SWING_LIMITS.maxTurnDegrees * Math.PI) / 180);
}

type Buckets = Map<string, { arc: number; end: End }[]>;
const CELL_PX = PDF_OWN_SWING_LIMITS.meetPx * 2;
const cellKey = (x: number, y: number, dx = 0, dy = 0) => `${Math.floor(x / CELL_PX) + dx},${Math.floor(y / CELL_PX) + dy}`;

/** The ends already seen in an end's cell and the eight around it. */
function endsNear(buckets: Buckets, end: End) {
  const found: { arc: number; end: End }[] = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) found.push(...(buckets.get(cellKey(end.at.x, end.at.y, dx, dy)) ?? []));
  return found;
}

/** The page's swings: each arc, its pieces joined, as a box with its hinge corner(s). */
export function pageSwings(arcs: readonly Arc[]): Swing[] {
  const parent = arcs.map((_, index) => index);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const buckets: Buckets = new Map();
  arcs.forEach((arc, index) => {
    for (const end of arc.ends) {
      for (const other of endsNear(buckets, end)) if (other.arc !== index && runsOn(end, other.end)) parent[root(index)] = root(other.arc);
      const key = cellKey(end.at.x, end.at.y);
      buckets.set(key, [...(buckets.get(key) ?? []), { arc: index, end }]);
    }
  });
  const groups = new Map<number, Arc[]>();
  arcs.forEach((arc, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), arc]));
  return [...groups.values()].map((group) => swingOf({
    left: Math.min(...group.map((arc) => arc.box.left)), top: Math.min(...group.map((arc) => arc.box.top)),
    right: Math.max(...group.map((arc) => arc.box.right)), bottom: Math.max(...group.map((arc) => arc.box.bottom)),
  }, group.flatMap((arc) => arc.bulge)));
}
