/**
 * A found room (a mask in one piece, no holes; floor-plan-review-room-fill.ts) as corners for the room tracer.
 *
 * The outline follows the region's pixel edges, is simplified, and has its nearly level and plumb sides made exactly
 * level and plumb. Each side then moves out to the middle of the wall drawn beyond it, measured in the drawing, so the
 * room's walls stand on their centre lines at the drawn thickness, as the walls the app reads do.
 */

export type OutlinePoint = { x: number; y: number };
type Line = { p: OutlinePoint; t: OutlinePoint };

const SIMPLIFY_MM = 60;
const AXIS_TOLERANCE_DEG = 12;
const MAX_CORNERS = 64;
/** Corners closer than this merge: the room tracer refuses corners under 50 mm apart. */
const MIN_SIDE_MM = 80;
const MAX_WALL_MM = 400;
/** A hollow wall (two thin lines with a gap) counts as one wall across a gap up to this. */
const HOLLOW_GAP_MM = 250;

// Directions clockwise on the page (y down): east, south, west, north.
const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
// The pixels ahead-left and ahead-right of a corner point, per direction, as offsets from the point.
const AHEAD = [[[0, -1], [0, 0]], [[0, 0], [-1, 0]], [[-1, 0], [-1, -1]], [[-1, -1], [0, -1]]] as const;

function inRegion(region: Uint8Array, w: number, h: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1;
}

function turn(region: Uint8Array, w: number, h: number, x: number, y: number, dir: number) {
  const [[lx, ly], [rx, ry]] = AHEAD[dir];
  if (inRegion(region, w, h, x + lx, y + ly)) return (dir + 3) % 4;
  if (inRegion(region, w, h, x + rx, y + ry)) return dir;
  return (dir + 1) % 4;
}

/** The region's outer boundary along pixel edges, clockwise on the page, as its corner points. */
export function traceBoundary(region: Uint8Array, w: number, h: number): OutlinePoint[] {
  const first = region.indexOf(1);
  if (first < 0) return [];
  const start = { x: first % w, y: Math.floor(first / w) };
  const corners: OutlinePoint[] = [];
  let x = start.x, y = start.y, dir = 0;
  for (let steps = 0; steps < 4 * (w + 1) * (h + 1); steps += 1) {
    const next = turn(region, w, h, x, y, dir);
    if (next !== dir || !steps) corners.push({ x, y });
    dir = next;
    x += STEP[dir][0];
    y += STEP[dir][1];
    if (x === start.x && y === start.y) break;
  }
  return corners;
}

function distanceToSegment(p: OutlinePoint, a: OutlinePoint, b: OutlinePoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function simplifyOpen(points: OutlinePoint[], tolerance: number): OutlinePoint[] {
  if (points.length < 3) return points;
  const a = points[0], b = points[points.length - 1];
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], a, b);
    if (distance > worst) { worst = distance; index = i; }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplifyOpen(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyOpen(points.slice(index), tolerance)];
}

/** Douglas-Peucker on a closed outline, split at the point farthest from its first point. */
export function simplifyClosed(points: OutlinePoint[], tolerance: number): OutlinePoint[] {
  if (points.length < 4) return points;
  let far = 0;
  points.forEach((p, i) => { if (Math.hypot(p.x - points[0].x, p.y - points[0].y) > Math.hypot(points[far].x - points[0].x, points[far].y - points[0].y)) far = i; });
  const first = simplifyOpen(points.slice(0, far + 1), tolerance);
  const second = simplifyOpen([...points.slice(far), points[0]], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Whether most of a region's outline runs level or plumb (a square room, not one drawn at an angle). */
export function squareToPage(region: Uint8Array, w: number, h: number, tolerancePx: number) {
  const sides = simplifyClosed(traceBoundary(region, w, h), tolerancePx);
  let level = 0, total = 0;
  sides.forEach((a, i) => {
    const b = sides[(i + 1) % sides.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    total += length;
    if (Math.abs(angle - 90 * Math.round(angle / 90)) <= AXIS_TOLERANCE_DEG) level += length;
  });
  return total > 0 && level >= 0.75 * total;
}

/** The line through a side; nearly level or plumb sides made exactly so, through their middle. */
function sideLine(a: OutlinePoint, b: OutlinePoint): Line {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const angle = (Math.atan2(t.y, t.x) * 180) / Math.PI;
  const offAxis = Math.abs(angle - 90 * Math.round(angle / 90));
  if (offAxis > AXIS_TOLERANCE_DEG) return { p: a, t };
  const level = Math.abs(t.x) >= Math.abs(t.y);
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { p: middle, t: level ? { x: Math.sign(t.x), y: 0 } : { x: 0, y: Math.sign(t.y) } };
}

/** Where two consecutive sides meet; two parallel sides (a step) meet through `near`, giving two corners. */
function meet(first: Line, second: Line, near: OutlinePoint): OutlinePoint[] {
  const cross = first.t.x * second.t.y - first.t.y * second.t.x;
  if (Math.abs(cross) < 0.2) {
    const on = (line: Line) => {
      const s = (near.x - line.p.x) * line.t.x + (near.y - line.p.y) * line.t.y;
      return { x: line.p.x + s * line.t.x, y: line.p.y + s * line.t.y };
    };
    return [on(first), on(second)];
  }
  const s = ((second.p.x - first.p.x) * second.t.y - (second.p.y - first.p.y) * second.t.x) / cross;
  return [{ x: first.p.x + s * first.t.x, y: first.p.y + s * first.t.y }];
}

/** Corners from side lines: each two consecutive lines meet; corners too close together merge. */
function cornersOf(lines: Line[], near: OutlinePoint[], minSide: number): OutlinePoint[] {
  const corners = lines.flatMap((line, i) => meet(lines[(i + lines.length - 1) % lines.length], line, near[i]));
  const merged: OutlinePoint[] = [];
  for (const corner of corners) {
    const last = merged[merged.length - 1];
    if (last && Math.hypot(corner.x - last.x, corner.y - last.y) < minSide) {
      merged[merged.length - 1] = { x: (last.x + corner.x) / 2, y: (last.y + corner.y) / 2 };
    } else merged.push(corner);
  }
  const head = merged[0], tail = merged[merged.length - 1];
  if (merged.length > 3 && Math.hypot(head.x - tail.x, head.y - tail.y) < minSide) merged.pop();
  return merged;
}

/** The ink beyond a side at one point, along the outward normal n: its thickness and the paper before it, in px. */
function inkAcross(ink: Uint8Array, w: number, h: number, from: OutlinePoint, n: OutlinePoint, mmPerPx: number) {
  const reach = Math.ceil((MAX_WALL_MM + HOLLOW_GAP_MM) / mmPerPx) + 3;
  const gapLimit = Math.max(1, Math.round(HOLLOW_GAP_MM / mmPerPx));
  let first = -1, last = -1, gap = 0;
  for (let step = 0; step < reach; step += 1) {
    const x = Math.floor(from.x + n.x * (step + 0.5)), y = Math.floor(from.y + n.y * (step + 0.5));
    const isInk = x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x] === 1;
    if (isInk) { if (first < 0) first = step; last = step; gap = 0; continue; }
    if (first < 0 && step > 2) return null;
    if (first >= 0 && ++gap > gapLimit) break;
  }
  if (first < 0) return null;
  const thickness = last - first + 1;
  return thickness * mmPerPx > MAX_WALL_MM ? null : { before: first, thickness };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** How far each side moves out to its wall's centre line (px), and the wall's thickness (px) where measured. */
function wallsBeyond(corners: OutlinePoint[], ink: Uint8Array, w: number, h: number, mmPerPx: number) {
  return corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
    const samples = [0.2, 0.35, 0.5, 0.65, 0.8]
      .map((f) => inkAcross(ink, w, h, { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }, n, mmPerPx))
      .filter((sample): sample is { before: number; thickness: number } => sample !== null);
    if (samples.length < 3) return { shift: 0, thickness: null };
    const thickness = median(samples.map((sample) => sample.thickness));
    return { shift: median(samples.map((sample) => sample.before)) + thickness / 2, thickness };
  });
}

/**
 * Corners (page px of the mask) for a room region: its outline simplified and squared, every side on the centre line
 * of the wall drawn beyond it. `wallThicknessMm` is the walls' typical drawn thickness (null where none was measured).
 */
export function roomCornersFromRegion(region: Uint8Array, ink: Uint8Array, w: number, h: number, mmPerPx: number) {
  const boundary = traceBoundary(region, w, h);
  let tolerance = Math.max(1, SIMPLIFY_MM / mmPerPx);
  let corners: OutlinePoint[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1, tolerance *= 1.5) {
    const simple = simplifyClosed(boundary, tolerance);
    corners = cornersOf(simple.map((a, i) => sideLine(a, simple[(i + 1) % simple.length])), simple, MIN_SIDE_MM / mmPerPx);
    if (corners.length <= MAX_CORNERS) break;
  }
  if (corners.length < 3 || corners.length > MAX_CORNERS) return null;
  const walls = wallsBeyond(corners, ink, w, h, mmPerPx);
  const lines = corners.map((a, i) => {
    const line = sideLine(a, corners[(i + 1) % corners.length]);
    const n = { x: line.t.y, y: -line.t.x };
    return { p: { x: line.p.x + n.x * walls[i].shift, y: line.p.y + n.y * walls[i].shift }, t: line.t };
  });
  const placed = cornersOf(lines, corners, MIN_SIDE_MM / mmPerPx);
  const measured = walls.flatMap((wall) => (wall.thickness === null ? [] : [wall.thickness * mmPerPx]));
  return {
    corners: placed.length >= 3 ? placed : corners,
    wallThicknessMm: measured.length ? Math.round(median(measured) / 10) * 10 : null,
  };
}
