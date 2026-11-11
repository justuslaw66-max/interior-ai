import type { FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";

/**
 * The visible faces of a plan's walls: the edges of the wall pieces (bands, corner caps,
 * mitred strips) that border open floor, with every seam between two pieces left out. A
 * layout plan draws its cut walls as these fine lines over a light fill, rather than as one
 * dark mass, and the lines stay true to the walls' real thickness.
 *
 * Each piece is a simple polygon in plan millimetres. An edge is split wherever another piece's
 * edge crosses or touches it; a piece of edge is a face when the point just outside it is in no
 * other piece. Where two pieces share an edge, or one edge runs inside another piece, the point
 * outside lies in the other piece and the piece of edge is dropped.
 */

const OUTSIDE_MM = 1;
const EPSILON = 1e-9;

type Segment = { a: Point; b: Point };

function signedArea(polygon: readonly Point[]) {
  let twice = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    twice += point.xMm * next.zMm - next.xMm * point.zMm;
  });
  return twice / 2;
}

/** Even-odd test; a point on the boundary may fall either way, so callers test a point 1 mm off. */
function inside(point: Point, polygon: readonly Point[]) {
  let result = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index], b = polygon[previous];
    if ((a.zMm > point.zMm) !== (b.zMm > point.zMm)
      && point.xMm < ((b.xMm - a.xMm) * (point.zMm - a.zMm)) / (b.zMm - a.zMm) + a.xMm) result = !result;
  }
  return result;
}

/** Where along `edge` (0 to 1) `other` crosses it, or touches it with an end point. */
function splitParameters(edge: Segment, other: Segment): number[] {
  const dx = edge.b.xMm - edge.a.xMm, dz = edge.b.zMm - edge.a.zMm;
  const ox = other.b.xMm - other.a.xMm, oz = other.b.zMm - other.a.zMm;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < EPSILON) return [];
  const along = (point: Point) => ((point.xMm - edge.a.xMm) * dx + (point.zMm - edge.a.zMm) * dz) / lengthSquared;
  const offLine = (point: Point) => Math.abs((point.xMm - edge.a.xMm) * dz - (point.zMm - edge.a.zMm) * dx) / Math.sqrt(lengthSquared);
  const denominator = dx * oz - dz * ox;
  if (Math.abs(denominator) < EPSILON) {
    // Parallel: only a collinear neighbour's end points split this edge.
    return [other.a, other.b].filter((point) => offLine(point) < 0.01).map(along);
  }
  const t = ((other.a.xMm - edge.a.xMm) * oz - (other.a.zMm - edge.a.zMm) * ox) / denominator;
  const u = ((other.a.xMm - edge.a.xMm) * dz - (other.a.zMm - edge.a.zMm) * dx) / denominator;
  return u >= -EPSILON && u <= 1 + EPSILON ? [t] : [];
}

function edgesOf(polygon: readonly Point[]): Segment[] {
  return polygon.map((a, index) => ({ a, b: polygon[(index + 1) % polygon.length] }));
}

const lerp = (edge: Segment, t: number): Point =>
  ({ xMm: edge.a.xMm + (edge.b.xMm - edge.a.xMm) * t, zMm: edge.a.zMm + (edge.b.zMm - edge.a.zMm) * t });

type Piece = { polygon: readonly Point[]; edges: Segment[] };

/**
 * One edge's face pieces: runs of the edge whose outside is open floor, joined end to end.
 * Where an earlier piece has the same face (a band's end and a corner cap's side), only the
 * earlier piece draws it.
 */
function edgeFaces(edge: Segment, outwardSign: number, others: readonly Piece[], earlier: readonly Piece[]): Point[][] {
  const length = Math.hypot(edge.b.xMm - edge.a.xMm, edge.b.zMm - edge.a.zMm);
  if (length < 0.01) return [];
  const normal = { x: (outwardSign * (edge.b.zMm - edge.a.zMm)) / length, z: (-outwardSign * (edge.b.xMm - edge.a.xMm)) / length };
  const cuts = [0, 1, ...others.flatMap(({ edges }) => edges.flatMap((other) => splitParameters(edge, other)))]
    .filter((t) => t >= 0 && t <= 1).sort((first, second) => first - second);
  const faces: Point[][] = [];
  let run: Point[] | null = null;
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const [start, end] = [cuts[index], cuts[index + 1]];
    if ((end - start) * length < 0.01) continue;
    const middle = lerp(edge, (start + end) / 2);
    const outside = { xMm: middle.xMm + normal.x * OUTSIDE_MM, zMm: middle.zMm + normal.z * OUTSIDE_MM };
    const within = { xMm: middle.xMm - normal.x * OUTSIDE_MM, zMm: middle.zMm - normal.z * OUTSIDE_MM };
    const open = !others.some(({ polygon }) => inside(outside, polygon)) && !earlier.some(({ polygon }) => inside(within, polygon));
    if (!open) { run = null; continue; }
    if (run) run[run.length - 1] = lerp(edge, end);
    else { run = [lerp(edge, start), lerp(edge, end)]; faces.push(run); }
  }
  return faces;
}

/** The wall pieces' visible faces as open polylines (each one straight run of one edge). */
export function planWallFaceLines(polygons: ReadonlyArray<readonly Point[]>): Point[][] {
  const pieces = polygons.filter((polygon) => polygon.length >= 3 && Math.abs(signedArea(polygon)) > 1)
    .map((polygon) => ({ polygon, edges: edgesOf(polygon), sign: Math.sign(signedArea(polygon)) }));
  return pieces.flatMap((piece, index) => {
    const others = pieces.filter((_, otherIndex) => otherIndex !== index), earlier = pieces.slice(0, index);
    // With a positive shoelace area (x, z) the outward normal of an edge (dx, dz) is (dz, -dx);
    // a negative area flips it.
    return piece.edges.flatMap((edge) => edgeFaces(edge, piece.sign, others, earlier));
  });
}

/** A path's closed sub-polygons (M … L … Z), for wall pieces drawn as one path each. */
export function closedPathPolygons(primitive: { path: string; points: readonly Point[] }): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  const tokens = primitive.path.trim().split(/\s+/);
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index];
    if (command === "Z") {
      if (current.length >= 3) polygons.push(current);
      current = [];
      index += 1;
      continue;
    }
    if (command !== "M" && command !== "L") return [];
    if (command === "M") current = [];
    current.push({ xMm: Number(tokens[index + 1]), zMm: Number(tokens[index + 2]) });
    index += 3;
  }
  return polygons;
}
