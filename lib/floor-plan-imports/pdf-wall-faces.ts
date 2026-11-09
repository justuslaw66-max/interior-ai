import type { FloorPlanSourceCalibrationV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence, SourceVectorSegment } from "./deterministic-evidence";
import { buildFloorPlanSourceProjection } from "./source-projection";

/**
 * A vector PDF page's own drawing, in plan millimetres, for snapping the vectorizer's walls to it (pdf-wall-snap.ts):
 * the level and plumb lines it strokes (the walls' faces among them) and the ground its black fills cover (HDB draws
 * structural walls and columns solid black). A vector PDF's lettering is often stroked too (CAD fonts plotted as
 * lines); its strokes are short and fall below the face length.
 */
export type PdfFace = { axis: "x" | "z"; at: number; from: number; to: number };

export const PDF_FACE_LIMITS = {
  /** Shorter strokes are lettering, ticks and symbol details. */
  minFaceMm: 250,
  /** A stroke this far off level or plumb is not a wall face here. */
  maxSkewDeg: 0.5,
  /** Fill coverage is kept on a grid of this cell. */
  fillCellMm: 20,
  /** A filled shape this small is a dot (a dimension's end); a stroke this short at 30-60 degrees is a tick. */
  markMaxMm: 150,
  tickMaxMm: 250,
  /** A face with this many dots or ticks on it (within the distance) is a dimension line, not a wall's face. */
  dimensionMarks: 2,
  markReachMm: 40,
} as const;

type Projection = NonNullable<ReturnType<typeof buildFloorPlanSourceProjection>>;
type Px = { x: number; y: number };

export class PdfFillGround {
  private readonly cells = new Set<number>();
  private readonly cell = PDF_FACE_LIMITS.fillCellMm;
  private key(i: number, j: number) {
    return (i + 50_000) * 100_000 + (j + 50_000);
  }
  /** Marks the cells whose centres a filled triangle covers. */
  addTriangle(a: { xMm: number; zMm: number }, b: { xMm: number; zMm: number }, c: { xMm: number; zMm: number }) {
    const xs = [a.xMm, b.xMm, c.xMm], zs = [a.zMm, b.zMm, c.zMm];
    const side = (p: { x: number; z: number }, u: typeof a, v: typeof a) => (v.xMm - u.xMm) * (p.z - u.zMm) - (v.zMm - u.zMm) * (p.x - u.xMm);
    for (let i = Math.floor(Math.min(...xs) / this.cell); i <= Math.floor(Math.max(...xs) / this.cell); i++) {
      for (let j = Math.floor(Math.min(...zs) / this.cell); j <= Math.floor(Math.max(...zs) / this.cell); j++) {
        const p = { x: (i + 0.5) * this.cell, z: (j + 0.5) * this.cell };
        const s1 = side(p, a, b), s2 = side(p, b, c), s3 = side(p, c, a);
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) this.cells.add(this.key(i, j));
      }
    }
  }
  covered(point: { xMm: number; zMm: number }) {
    return this.cells.has(this.key(Math.floor(point.xMm / this.cell), Math.floor(point.zMm / this.cell)));
  }
  /** The filled cells as [i, j] grid indices (cell i spans i*cell to (i+1)*cell mm). */
  indices() {
    return [...this.cells].map((key) => [Math.floor(key / 100_000) - 50_000, (key % 100_000) - 50_000] as const);
  }
  get cellMm() {
    return this.cell;
  }
  get size() {
    return this.cells.size;
  }
}

function face(a: { xMm: number; zMm: number }, b: { xMm: number; zMm: number }): PdfFace | null {
  const dx = b.xMm - a.xMm, dz = b.zMm - a.zMm, length = Math.hypot(dx, dz);
  if (length < PDF_FACE_LIMITS.minFaceMm) return null;
  const skew = (Math.atan2(Math.min(Math.abs(dx), Math.abs(dz)), Math.max(Math.abs(dx), Math.abs(dz))) * 180) / Math.PI;
  if (skew > PDF_FACE_LIMITS.maxSkewDeg) return null;
  return Math.abs(dz) >= Math.abs(dx)
    ? { axis: "x", at: (a.xMm + b.xMm) / 2, from: Math.min(a.zMm, b.zMm), to: Math.max(a.zMm, b.zMm) }
    : { axis: "z", at: (a.zMm + b.zMm) / 2, from: Math.min(a.xMm, b.xMm), to: Math.max(a.xMm, b.xMm) };
}

/** The outline of every filled shape (each subpath of a fill path), in page pixels. */
function fillRings(page: RegisteredPageEvidence, segments: Map<string, SourceVectorSegment>) {
  const rings: Px[][] = [];
  for (const path of page.vectorPaths) {
    if (path.evidenceKind === "raster_linework" || (path.paintOperation !== "fill" && path.paintOperation !== "fill_stroke")) continue;
    for (const subpath of path.subpaths ?? [{ segmentIds: path.segmentIds }]) {
      const points = subpath.segmentIds.flatMap((id) => { const s = segments.get(id); return s ? [s.start, s.end] : []; });
      rings.push(points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y));
    }
  }
  return rings;
}

/** Filled shapes as triangles (each fanned from its first point), in page pixels. */
function fillTriangles(page: RegisteredPageEvidence, segments: Map<string, SourceVectorSegment>) {
  return fillRings(page, segments).flatMap((ring) => ring.slice(1, -1).map((point, i) => [ring[0], point, ring[i + 2]]));
}

type Mm = { xMm: number; zMm: number };

/** The dots and ticks a dimension line carries at its ends and extension lines, in plan millimetres. */
function dimensionMarks(rings: Px[][], strokes: SourceVectorSegment[], mm: (p: Px) => Mm | null) {
  const marks: Mm[] = [];
  for (const ring of rings) {
    const points = ring.map(mm).filter((p): p is Mm => p !== null);
    if (!points.length) continue;
    const xs = points.map((p) => p.xMm), zs = points.map((p) => p.zMm);
    if (Math.max(...xs) - Math.min(...xs) > PDF_FACE_LIMITS.markMaxMm || Math.max(...zs) - Math.min(...zs) > PDF_FACE_LIMITS.markMaxMm) continue;
    marks.push({ xMm: (Math.max(...xs) + Math.min(...xs)) / 2, zMm: (Math.max(...zs) + Math.min(...zs)) / 2 });
  }
  for (const stroke of strokes) {
    const a = mm(stroke.start), b = mm(stroke.end);
    if (!a || !b) continue;
    const dx = Math.abs(b.xMm - a.xMm), dz = Math.abs(b.zMm - a.zMm), angle = (Math.atan2(dz, dx) * 180) / Math.PI;
    if (Math.hypot(dx, dz) <= PDF_FACE_LIMITS.tickMaxMm && angle >= 30 && angle <= 60) marks.push({ xMm: (a.xMm + b.xMm) / 2, zMm: (a.zMm + b.zMm) / 2 });
  }
  return marks;
}

function isDimensionLine(face: PdfFace, marks: Mm[]) {
  const reach = PDF_FACE_LIMITS.markReachMm;
  let on = 0;
  const seen: number[] = [];
  for (const mark of marks) {
    const [across, along] = face.axis === "x" ? [mark.xMm, mark.zMm] : [mark.zMm, mark.xMm];
    if (Math.abs(across - face.at) > reach || along < face.from - reach || along > face.to + reach) continue;
    if (seen.some((s) => Math.abs(s - along) < reach)) continue;
    seen.push(along);
    if (++on >= PDF_FACE_LIMITS.dimensionMarks) return true;
  }
  return false;
}

/**
 * The page's level and plumb lines and its fills, in plan millimetres through the page's calibration, or null for a
 * page without the PDF's own linework (a picture, a scan) or without a calibration. A line carrying a dimension's dots
 * or ticks is left out: it is a dimension line, and one beside a wall would pair with the wall's face.
 */
export function pdfPageDrawing(page: RegisteredPageEvidence, calibration: FloorPlanSourceCalibrationV2 | undefined) {
  const projection: Projection | null = calibration ? buildFloorPlanSourceProjection(calibration) : null;
  const native = page.vectorSegments.filter((segment) => segment.evidenceKind !== "raster_linework");
  if (!projection || native.length === 0) return null;
  const mm = (point: Px) => projection.unproject(point);
  const faces: PdfFace[] = [];
  const addFace = (from: Px, to: Px) => {
    const a = mm(from), b = mm(to);
    const found = a && b ? face(a, b) : null;
    if (found) faces.push(found);
  };
  for (const segment of native) addFace(segment.start, segment.end);
  const fills = new PdfFillGround();
  const segments = new Map(page.vectorSegments.map((segment) => [segment.id, segment]));
  // A filled shape's closing edge is not a segment; its other edges are (a line drawn as a thin filled box has its
  // faces only there).
  const rings = fillRings(page, segments);
  for (const ring of rings) if (ring.length > 2) addFace(ring[ring.length - 1], ring[0]);
  for (const triangle of fillTriangles(page, segments)) {
    const [a, b, c] = triangle.map(mm);
    if (a && b && c) fills.addTriangle(a, b, c);
  }
  const marks = dimensionMarks(rings, native, mm);
  return { faces: faces.filter((f) => !isDimensionLine(f, marks)), fills, dimensionLines: faces.filter((f) => isDimensionLine(f, marks)).length };
}
