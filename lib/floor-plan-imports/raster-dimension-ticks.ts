import type { SourcePointPx } from "./deterministic-evidence";

export type GrayRaster = { width: number; height: number; data: Uint8Array };
type Direction = { x: number; y: number };
type Tick = SourcePointPx & { score: number };
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const coverage = (values: number[]) => values.filter((value) => value >= 18).length / values.length;

function ink(raster: GrayRaster, x: number, y: number) {
  const px = Math.round(x), py = Math.round(y);
  return px < 0 || py < 0 || px >= raster.width || py >= raster.height ? 0 : 255 - raster.data[py * raster.width + px];
}

function stroke(raster: GrayRaster, point: SourcePointPx, direction: Direction, from: number, to: number) {
  return Array.from({ length: to - from }, (_, index) => {
    const t = index + from;
    return Math.max(...[-1, 0, 1].map((offset) => ink(raster,
      point.x + direction.x * t - direction.y * offset, point.y + direction.y * t + direction.x * offset)));
  });
}

function tickScore(raster: GrayRaster, point: SourcePointPx, hint: SourcePointPx, inward: Direction) {
  const center = mean([-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ink(raster, point.x + dx, point.y + dy))));
  if (center < 45) return null;
  const along = stroke(raster, point, inward, 3, 15);
  const left = stroke(raster, point, { x: -inward.y, y: inward.x }, 3, 10);
  const right = stroke(raster, point, { x: inward.y, y: -inward.x }, 3, 10);
  if (coverage(along) < 0.8 || Math.max(coverage(left), coverage(right)) < 0.85 || Math.min(coverage(left), coverage(right)) < 0.4) return null;
  return center + 0.3 * Math.min(mean(left), mean(right)) + 0.2 * mean(along) - 0.5 * Math.hypot(point.x - hint.x, point.y - hint.y);
}

function refineTick(raster: GrayRaster, point: Tick): Tick {
  let weight = 0, x = 0, y = 0;
  for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) {
    const value = ink(raster, point.x + dx, point.y + dy) ** 2;
    weight += value; x += value * (point.x + dx); y += value * (point.y + dy);
  }
  return { x: x / weight, y: y / weight, score: point.score };
}

/** Hints bound a search only. A dark tick, perpendicular witness stroke and inward line must be present. */
export function locateDimensionTick(raster: GrayRaster, hint: SourcePointPx, inward: Direction) {
  const candidates: Tick[] = [];
  for (let y = Math.round(hint.y) - 16; y <= Math.round(hint.y) + 16; y += 1) {
    for (let x = Math.round(hint.x) - 16; x <= Math.round(hint.x) + 16; x += 1) {
      const score = tickScore(raster, { x, y }, hint, inward);
      if (score !== null) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { tick: null, reason: "tick_not_supported" as const };
  const competitor = candidates.find((point) => Math.hypot(point.x - best.x, point.y - best.y) > 7);
  if (competitor && competitor.score >= best.score * 0.9) return { tick: null, reason: "ambiguous_ticks" as const };
  return { tick: refineTick(raster, best), reason: null };
}

export function dimensionLineCoverage(raster: GrayRaster, first: SourcePointPx, second: SourcePointPx) {
  const length = Math.hypot(second.x - first.x, second.y - first.y);
  if (length < 16) return 0;
  return coverage(stroke(raster, first, { x: (second.x - first.x) / length, y: (second.y - first.y) / length }, 4, Math.round(length) - 4));
}
