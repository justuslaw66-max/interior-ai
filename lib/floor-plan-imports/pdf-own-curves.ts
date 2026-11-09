import type { DrawnCommand } from "./pdf-drawing-recorder";

/**
 * Smooth runs of curves redrawn with fewer curves where one bends within `tolerancePx` of them (9 Nov 2026). A
 * font's letter is drawn from many short curves (a TrueType letter's quadratics each become a cubic), and a page of
 * small lettering would otherwise need more points than the candidate can hold. Corners stay corners: a run ends
 * wherever the direction turns.
 */
type Point = [number, number];
const CORNER_COSINE = Math.cos((4 * Math.PI) / 180);
/** The most curves one fitted curve stands for. */
const MAX_RUN = 8;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const unit = (v: Point): Point | null => { const n = Math.hypot(v[0], v[1]); return n > 1e-9 ? [v[0] / n, v[1] / n] : null; };
const at = (p: Point[], t: number): Point => {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
    u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
};
/** A cubic's direction leaving its start and arriving at its end (a zero handle borrows the next point). */
const startDirection = (p: Point[]) => unit(sub(p[1], p[0])) ?? unit(sub(p[2], p[0])) ?? unit(sub(p[3], p[0]));
const endDirection = (p: Point[]) => unit(sub(p[3], p[2])) ?? unit(sub(p[3], p[1])) ?? unit(sub(p[3], p[0]));

/** How far a point lies from a polyline. */
function distanceToLine(p: Point, line: Point[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], d = sub(line[i], a), length = dot(d, d);
    const t = length > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / length)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t));
  }
  return best;
}

function samples(run: Point[][], perCurve: number): Point[] {
  const out: Point[] = [run[0][0]];
  for (const curve of run) for (let i = 1; i <= perCurve; i++) out.push(at(curve, i / perCurve));
  return out;
}

/** One cubic from the run's start to its end, leaving and arriving as the run does (least squares on the handle
 * lengths over chord-length parameters), or null where it strays more than the tolerance. */
function fitRun(run: Point[][], tolerancePx: number): Point[] | null {
  const p0 = run[0][0], p3 = run[run.length - 1][3];
  const t0 = startDirection(run[0]), t1 = endDirection(run[run.length - 1]);
  if (!t0 || !t1) return null;
  const pts = samples(run, 8);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lengths[lengths.length - 1];
  if (total < 1e-6) return null;
  let c11 = 0, c12 = 0, c22 = 0, x1 = 0, x2 = 0;
  pts.forEach((p, i) => {
    const t = lengths[i] / total, u = 1 - t;
    const a1: Point = [t0[0] * 3 * u * u * t, t0[1] * 3 * u * u * t], a2: Point = [-t1[0] * 3 * u * t * t, -t1[1] * 3 * u * t * t];
    const base = at([p0, p0, p3, p3], t), r = sub(p, base);
    c11 += dot(a1, a1); c12 += dot(a1, a2); c22 += dot(a2, a2); x1 += dot(a1, r); x2 += dot(a2, r);
  });
  const det = c11 * c22 - c12 * c12;
  if (Math.abs(det) < 1e-12) return null;
  const alpha1 = (x1 * c22 - x2 * c12) / det, alpha2 = (c11 * x2 - c12 * x1) / det;
  if (alpha1 <= 0 || alpha2 <= 0 || alpha1 > total || alpha2 > total) return null;
  const fitted: Point[] = [p0, [p0[0] + t0[0] * alpha1, p0[1] + t0[1] * alpha1], [p3[0] - t1[0] * alpha2, p3[1] - t1[1] * alpha2], p3];
  const fittedLine = Array.from({ length: 33 }, (_, i) => at(fitted, i / 32));
  const runLine = samples(run, 8);
  // Both ways round: every point of the run near the new curve, and every point of the new curve near the run.
  if (runLine.some((p) => distanceToLine(p, fittedLine) > tolerancePx) || fittedLine.some((p) => distanceToLine(p, runLine) > tolerancePx)) return null;
  return fitted;
}

/** The commands with each smooth run of curves redrawn as few curves as the tolerance allows. */
export function simplifiedCurves(commands: DrawnCommand[], tolerancePx: number): DrawnCommand[] {
  const out: DrawnCommand[] = [];
  let current: Point = [0, 0], start: Point = [0, 0];
  let run: Point[][] = [];
  const flush = () => {
    let i = 0;
    while (i < run.length) {
      let best = i, fitted: Point[] | null = null;
      for (let j = i + 1; j < Math.min(run.length, i + MAX_RUN); j++) {
        const turn = dot(endDirection(run[j - 1]) ?? [0, 0], startDirection(run[j]) ?? [0, 0]);
        if (turn < CORNER_COSINE) break;
        const candidate = fitRun(run.slice(i, j + 1), tolerancePx);
        if (!candidate) break;
        best = j; fitted = candidate;
      }
      const curve = fitted ?? run[i];
      out.push({ op: "C", p: [curve[1][0], curve[1][1], curve[2][0], curve[2][1], curve[3][0], curve[3][1]] });
      i = best + 1;
    }
    run = [];
  };
  for (const c of commands) {
    if (c.op === "C") { run.push([current, [c.p[0], c.p[1]], [c.p[2], c.p[3]], [c.p[4], c.p[5]]]); current = [c.p[4], c.p[5]]; continue; }
    flush();
    out.push(c);
    if (c.op === "M") current = start = c.p;
    else if (c.op === "L") current = c.p;
    else current = start;
  }
  flush();
  return out;
}
