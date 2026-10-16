import type { FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

type WallEdge = FloorPlanVectorizerEvidence["wallEdges"][number];
type Geometry = Pick<FloorPlanVectorizerEvidence, "wallEdges" | "rooms">;

/** A level or plumb wall edge with its faces at the accepted scale (millimetres from the page origin). */
type AxisEdge = {
  edge: WallEdge;
  level: boolean;
  from: number;
  to: number;
  lo: number;
  hi: number;
  low: number;
  high: number;
};

/** A wall's thickness in the document: whole millimetres for a level or plumb wall (its faces were put on whole
 * millimetres, `alignVectorizerFaces`), 5 mm steps as before for a slanted one, whose faces nothing lines up. */
export function vectorizerThicknessMm(sourcePx: WallEdge["sourcePx"], thicknessPx: number, millimetresPerPixel: number) {
  const [[x0, y0], [x1, y1]] = sourcePx, step = x0 === x1 || y0 === y1 ? 1 : 5;
  return Math.max(40, Math.min(600, Math.round((thicknessPx * millimetresPerPixel) / step) * step));
}

const MIN_THICKNESS_MM = 40;
const MAX_THICKNESS_MM = 600;

function axisEdge(edge: WallEdge, millimetresPerPixel: number): AxisEdge | null {
  const [[x0, y0], [x1, y1]] = edge.sourcePx;
  const level = y0 === y1 && x0 !== x1;
  if ((!level && !(x0 === x1 && y0 !== y1)) || edge.thicknessPx <= 0) return null;
  const centre = level ? y0 : x0;
  const lo = (centre - edge.thicknessPx / 2) * millimetresPerPixel;
  const hi = (centre + edge.thicknessPx / 2) * millimetresPerPixel;
  const [from, to] = level ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(y0, y1), Math.max(y0, y1)];
  return { edge, level, from, to, lo, hi, low: Math.round(lo), high: Math.round(hi) };
}

/** Another edge of the same direction, end to end or alongside (a pixel apart at most), with this face on the same millimetre. */
function shared(axis: AxisEdge, side: "low" | "high", all: AxisEdge[]) {
  return all.some((other) => other !== axis && other.level === axis.level
    && other.from <= axis.to + 1 && other.to >= axis.from - 1 && other[side] === axis[side]);
}

/**
 * Whole-millimetre centre and thickness whose two faces are the drawn faces put on the nearest millimetre. A wall's
 * thickness of an odd number of millimetres would put its centre-line between two millimetres, so one face gives by a
 * millimetre: the one no neighbour shares (else the one the rounding moved more).
 */
function faceFirst(axis: AxisEdge, all: AxisEdge[]) {
  let { low, high } = axis;
  if ((high - low) % 2 !== 0) {
    const lowShared = shared(axis, "low", all);
    const highShared = shared(axis, "high", all);
    const moveHigh = lowShared !== highShared ? lowShared : Math.abs(axis.hi - high) >= Math.abs(axis.lo - low);
    if (moveHigh) high += axis.hi > high ? 1 : -1;
    else low += axis.lo > low ? 1 : -1;
  }
  const thickness = high - low;
  if (thickness < MIN_THICKNESS_MM || thickness > MAX_THICKNESS_MM) return null;
  return { centre: (low + high) / 2, thickness };
}

/**
 * Faces first (round 37, J, 14 Oct: a face the drawing has straight "should follow the original floor plan, it should
 * be 0mm"). The document keeps whole millimetres, and rounding each wall's centre-line and thickness on its own put
 * the faces of two walls that share one drawn face up to 3.5 mm apart: a step in the plan and the 3D. So each level or
 * plumb wall edge takes its faces from the drawing, puts them on the nearest whole millimetre, and its centre-line and
 * thickness follow from them; walls sharing a drawn face then share it to the millimetre. Returns the evidence with
 * those centre-lines (as rendered-page pixels that land on them at this scale) and thicknesses; slanted edges and the
 * along-the-wall ends stay as measured.
 */
export function alignVectorizerFaces<T extends Geometry>(registered: T, millimetresPerPixel: number): T {
  if (!(millimetresPerPixel > 0)) return registered;
  const axes = registered.wallEdges.flatMap((edge) => axisEdge(edge, millimetresPerPixel) ?? []);
  const fitted = new Map(axes.flatMap((axis) => {
    const fit = faceFirst(axis, axes);
    return fit ? [[axis.edge.id, { level: axis.level, ...fit }] as const] : [];
  }));
  const across = (value: number) => value / millimetresPerPixel;
  const wallEdges = registered.wallEdges.map((edge) => {
    const fit = fitted.get(edge.id);
    if (!fit) return edge;
    const [[x0, y0], [x1, y1]] = edge.sourcePx;
    const at = across(fit.centre);
    return {
      ...edge,
      sourcePx: (fit.level ? [[x0, at], [x1, at]] : [[at, y0], [at, y1]]) as WallEdge["sourcePx"],
      thicknessPx: across(fit.thickness),
    };
  });
  const rooms = registered.rooms.map((room) => {
    const points = room.sourcePoints.map((point) => ({ ...point }));
    const length = (index: number) => {
      const a = room.sourcePoints[index];
      const b = room.sourcePoints[(index + 1) % room.sourcePoints.length];
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const order = room.edgeIds.map((_, index) => index).sort((a, b) => length(a) - length(b));
    for (const index of order) {                             // (the longer side last: it wins a straight joint)
      const fit = fitted.get(room.edgeIds[index]);
      if (!fit) continue;
      const at = across(fit.centre);
      for (const point of [points[index], points[(index + 1) % points.length]]) {
        if (fit.level) point.y = at;
        else point.x = at;
      }
    }
    return { ...room, sourcePoints: points };
  });
  return { ...registered, wallEdges, rooms };
}
