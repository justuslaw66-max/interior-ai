import type { GrayRaster } from "./raster-dimension-ticks";

type Point = { x: number; y: number };
type Run = { first: number; last: number };
type Strip = { rows: number[][]; along: number[]; across: number[]; length: number; margin: number };
type Rails = { offsets: number[]; ink: number[][]; crossbars: boolean[]; crossInk: number[] };
export type RasterOpeningEnds = { start: Point; end: Point; method: "window_frame" | "wall_jambs" };
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const coverage = (values: number[]) => values.length && values.every(Number.isFinite)
  ? values.filter((value) => value >= 18).length / values.length : Number.NaN;

function sample(raster: GrayRaster, x: number, y: number) {
  // Missing image pixels cannot prove a rail terminates outside a frame.
  if (x < 0 || y < 0 || x >= raster.width - 1 || y >= raster.height - 1) return Number.NaN;
  const px = Math.floor(x), py = Math.floor(y), dx = x - px, dy = y - py;
  const ink = (xx: number, yy: number) => 255 - raster.data[yy * raster.width + xx];
  return ink(px, py) * (1 - dx) * (1 - dy) + ink(px + 1, py) * dx * (1 - dy) +
    ink(px, py + 1) * (1 - dx) * dy + ink(px + 1, py + 1) * dx * dy;
}

function buildStrip(raster: GrayRaster, start: Point, end: Point): Strip | null {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(length) || length < 24 || length > 1024) return null;
  const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  const margin = Math.min(60, Math.max(24, length * 0.75));
  const along = Array.from({ length: Math.ceil(length + margin * 2) }, (_, i) => i - margin);
  const across = Array.from({ length: 57 }, (_, i) => i / 2 - 14);
  const rows = along.map((t) => across.map((s) => sample(raster, start.x + ux * t - uy * s, start.y + uy * t + ux * s)));
  return { rows, along, across, length, margin };
}

function quartile(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) / 4;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function findRails(strip: Strip, window: boolean): Rails | null {
  const selected = strip.rows.filter((_, i) => !window || (strip.along[i] > strip.length * 0.15 && strip.along[i] < strip.length * 0.85));
  const profile = strip.across.map((_, i) => mean(selected.map((row) => row[i])));
  const smoothed = profile.map((value, i) => ((profile[i - 1] ?? 0) + 2 * value + (profile[i + 1] ?? 0)) / 4);
  const peaks = smoothed.flatMap((value, i) => i > 0 && i < profile.length - 1 && value >= 18 &&
    value >= smoothed[i - 1] && value > smoothed[i + 1] ? [{ i, value }] : []).sort((a, b) => b.value - a.value);
  const separated: typeof peaks = [];
  for (const peak of peaks) if (separated.every((other) => Math.abs(peak.i - other.i) >= 4)) separated.push(peak);
  const count = window ? 3 : 2;
  if (separated.length < count || (separated[count]?.value ?? 0) >= separated[count - 1].value * 0.85) return null;
  const indices = separated.slice(0, count).map(({ i }) => i).sort((a, b) => a - b);
  const offsets = indices.map((i) => strip.across[i]), width = offsets.at(-1)! - offsets[0];
  if (width < 3 || width > 20) return null;
  if (window && Math.max(offsets[1] - offsets[0], offsets[2] - offsets[1]) > 1.5 * Math.min(offsets[1] - offsets[0], offsets[2] - offsets[1])) return null;
  const corridor = strip.rows.map((row) => row.slice(indices[0] + 1, indices.at(-1)));
  return { offsets, ink: indices.map((i) => strip.rows.map((row) => Math.max(...row.slice(i - 1, i + 2)))),
    crossbars: corridor.map((row) => quartile(row) >= 18), crossInk: corridor.map(mean) };
}

function runs(values: boolean[]): Run[] {
  const result: Run[] = [];
  let first: number | null = null;
  for (let i = 0; i <= values.length; i += 1) {
    if (values[i] && first === null) first = i;
    if (!values[i] && first !== null) { result.push({ first, last: i - 1 }); first = null; }
  }
  return result;
}

function weightedPosition(strip: Strip, rails: Rails, run: Run) {
  let position = 0, weight = 0;
  for (let i = run.first; i <= run.last; i += 1) { position += strip.along[i] * rails.crossInk[i]; weight += rails.crossInk[i]; }
  return position / weight;
}

function framePairSupported(strip: Strip, rails: Rails, first: Run, second: Run) {
  const start = (first.first + first.last) / 2, end = (second.first + second.last) / 2;
  if (first.first < 12 || second.last + 12 >= strip.rows.length || second.first - first.last < 18) return false;
  if (strip.along[Math.floor(start)] >= strip.length / 2 || strip.along[Math.floor(end)] <= strip.length / 2) return false;
  if (end - start < strip.length * 0.5 || end - start > strip.length * 2) return false;
  if (!rails.ink.every((rail) => coverage(rail.slice(first.last + 3, second.first - 2)) >= 0.85)) return false;
  return coverage(rails.ink[1].slice(first.first - 12, first.first - 4)) <= 0.35 &&
    coverage(rails.ink[1].slice(second.last + 5, second.last + 13)) <= 0.35;
}

function windowEnds(strip: Strip, rails: Rails) {
  const caps = runs(rails.crossbars), candidates: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < caps.length; i += 1) for (let j = i + 1; j < caps.length; j += 1) {
    if (framePairSupported(strip, rails, caps[i], caps[j])) candidates.push({
      start: weightedPosition(strip, rails, caps[i]), end: weightedPosition(strip, rails, caps[j]) });
  }
  return candidates;
}

function wallGapSupported(strip: Strip, rails: Rails, gap: Run) {
  const { first, last } = gap, length = last - first + 1;
  if (first < 12 || last + 12 >= strip.rows.length || length < strip.length * 0.35 || length > strip.length * 1.8) return false;
  if (Math.max(strip.along[first], 0) >= Math.min(strip.along[last], strip.length)) return false;
  if (Math.abs(strip.along[first]) > strip.margin || Math.abs(strip.along[last] - strip.length) > strip.margin) return false;
  if (!rails.ink.every((rail) => coverage(rail.slice(first - 12, first - 4)) >= 0.85 && coverage(rail.slice(last + 5, last + 13)) >= 0.85)) return false;
  return rails.crossbars.slice(first - 5, first + 1).some(Boolean) && rails.crossbars.slice(last, last + 6).some(Boolean);
}

function doorEnds(strip: Strip, rails: Rails) {
  return rails.ink.flatMap((rail) => runs(rail.map((value) => value < 18)).filter((gap) => wallGapSupported(strip, rails, gap))
    .map(({ first, last }) => ({ start: (strip.along[first - 1] + strip.along[first]) / 2,
      end: (strip.along[last] + strip.along[last + 1]) / 2 })));
}

/** A bounded hint selects a ribbon only. Paired jambs or a complete three-rail frame must exist in the pixels. */
export function locateRasterOpeningEnds(raster: GrayRaster, start: Point, end: Point, kind: string): {
  span: RasterOpeningEnds | null; reason: string;
} {
  if (kind !== "door" && kind !== "window") return { span: null, reason: "unsupported_symbol" };
  const strip = buildStrip(raster, start, end);
  if (!strip) return { span: null, reason: "unsupported_search_span" };
  const rails = findRails(strip, kind === "window");
  if (!rails) return { span: null, reason: "rail_pattern_missing_or_ambiguous" };
  const candidates = kind === "window" ? windowEnds(strip, rails) : doorEnds(strip, rails);
  const distinct = candidates.filter((item, index) => !candidates.slice(0, index).some((other) =>
    Math.abs(item.start - other.start) <= 3 && Math.abs(item.end - other.end) <= 3));
  if (distinct.length !== 1) return { span: null, reason: distinct.length ? "ambiguous_jambs" : "jamb_pair_missing" };
  const at = (t: number) => ({ x: start.x + (end.x - start.x) / strip.length * t, y: start.y + (end.y - start.y) / strip.length * t });
  return { span: { start: at(distinct[0].start), end: at(distinct[0].end), method: kind === "window" ? "window_frame" : "wall_jambs" }, reason: "source_supported" };
}
