import type {
  PlanSymbolArc,
  PlanSymbolEllipse,
  PlanSymbolPoint,
  PlanSymbolPolyline,
  PlanSymbolRect,
  PlanSymbolShape,
  PlanSymbolStroke,
} from "./plan-symbol-types";

type StyleOptions = { dashed?: boolean; fill?: boolean };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function rect(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  stroke: PlanSymbolStroke,
  radius = 0,
  style: StyleOptions = {}
): PlanSymbolRect {
  const safeRadius = clamp(radius, 0, Math.min(width, depth) / 2);
  return { type: "rect", cx, cz, width, depth, radius: safeRadius, stroke, ...style };
}

/** A rectangle given by its edges: left, back, right, front. */
export function box(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  stroke: PlanSymbolStroke,
  radius = 0,
  style: StyleOptions = {}
): PlanSymbolRect {
  return rect((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), stroke, radius, style);
}

export function ellipse(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  stroke: PlanSymbolStroke,
  style: StyleOptions = {}
): PlanSymbolEllipse {
  return { type: "ellipse", cx, cz, rx, rz, stroke, ...style };
}

export function circle(
  cx: number,
  cz: number,
  r: number,
  stroke: PlanSymbolStroke,
  style: StyleOptions = {}
): PlanSymbolEllipse {
  return ellipse(cx, cz, r, r, stroke, style);
}

export function arc(
  cx: number,
  cz: number,
  r: number,
  startDeg: number,
  endDeg: number,
  stroke: PlanSymbolStroke,
  style: StyleOptions = {}
): PlanSymbolArc {
  return { type: "arc", cx, cz, r, startDeg, endDeg, stroke, ...style };
}

export function polyline(
  points: PlanSymbolPoint[],
  closed: boolean,
  stroke: PlanSymbolStroke,
  style: StyleOptions = {}
): PlanSymbolPolyline {
  return { type: "polyline", points, closed, stroke, ...style };
}

export function line(
  from: PlanSymbolPoint,
  to: PlanSymbolPoint,
  stroke: PlanSymbolStroke,
  style: StyleOptions = {}
): PlanSymbolPolyline {
  return polyline([from, to], false, stroke, style);
}

/** Rotates points about the origin (degrees from +x towards +z), then moves them. */
export function placePoints(
  points: readonly PlanSymbolPoint[],
  angleDeg: number,
  dx: number,
  dz: number
): PlanSymbolPoint[] {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([x, z]) => [x * cos - z * sin + dx, x * sin + z * cos + dz] as const);
}

/** A rounded rectangle centred on the origin, as points (for shapes that turn). */
export function roundedRectPoints(width: number, depth: number, radius: number): PlanSymbolPoint[] {
  const r = clamp(radius, 0, Math.min(width, depth) / 2);
  const hw = width / 2;
  const hd = depth / 2;
  if (r === 0) return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const corners: Array<[number, number, number]> = [
    [hw - r, -hd + r, -90],
    [hw - r, hd - r, 0],
    [-hw + r, hd - r, 90],
    [-hw + r, -hd + r, 180],
  ];
  const points: PlanSymbolPoint[] = [];
  for (const [cx, cz, start] of corners) {
    for (let step = 0; step <= 4; step += 1) {
      const radians = ((start + step * 22.5) * Math.PI) / 180;
      points.push([cx + r * Math.cos(radians), cz + r * Math.sin(radians)]);
    }
  }
  return points;
}

/**
 * A cushion: a square whose sides bow in and whose corners stay pointed,
 * the way a plump pillow reads from above.
 */
export function cushion(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  angleDeg: number,
  stroke: PlanSymbolStroke
): PlanSymbolPolyline {
  const hw = width / 2;
  const hd = depth / 2;
  const bow = Math.min(width, depth) * 0.06;
  const corners: PlanSymbolPoint[] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const points: PlanSymbolPoint[] = [];
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const [nx, nz] = inwardNormal(corner, next);
    for (let step = 0; step < 6; step += 1) {
      const t = step / 6;
      const sag = Math.sin(Math.PI * t) * bow;
      points.push([
        corner[0] + (next[0] - corner[0]) * t + nx * sag,
        corner[1] + (next[1] - corner[1]) * t + nz * sag,
      ]);
    }
  });
  return polyline(placePoints(points, angleDeg, cx, cz), true, stroke, { fill: true });
}

function inwardNormal(from: PlanSymbolPoint, to: PlanSymbolPoint): PlanSymbolPoint {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz) || 1;
  // Corners run clockwise on screen (+x, then +z), so the inside is to the right.
  return [-dz / length, dx / length];
}

/**
 * A dining chair whose seat faces `facingDeg` (degrees from +x towards +z),
 * centred at (cx, cz). Chairs around a table are drawn lighter than the table.
 */
export function chair(
  cx: number,
  cz: number,
  facingDeg: number,
  width: number,
  depth: number,
  stroke: PlanSymbolStroke = "detail"
): PlanSymbolShape[] {
  const turn = facingDeg - 90;
  const backDepth = clamp(depth * 0.14, 0.04, 0.07);
  const seat = roundedRectPoints(width, depth - backDepth * 0.6, width * 0.16).map(
    ([x, z]) => [x, z + backDepth * 0.3] as const
  );
  const back = roundedRectPoints(width * 0.94, backDepth, backDepth / 2).map(
    ([x, z]) => [x, z - depth / 2 + backDepth / 2] as const
  );
  return [
    polyline(placePoints(seat, turn, cx, cz), true, stroke, { fill: true }),
    polyline(placePoints(back, turn, cx, cz), true, stroke, { fill: true }),
  ];
}

/** Evenly spaced positions along [from, to], at the centres of `count` equal parts. */
export function spread(from: number, to: number, count: number): number[] {
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, index) => from + step * (index + 0.5));
}

/** The lines dividing [from, to] into `count` equal parts. */
export function dividers(from: number, to: number, count: number): number[] {
  const step = (to - from) / count;
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => from + step * (index + 1));
}
