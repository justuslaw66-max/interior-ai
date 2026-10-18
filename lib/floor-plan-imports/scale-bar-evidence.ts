import type { RegisteredPageEvidence, SourcePointPx, SourceTextEvidence } from "./deterministic-evidence";

/**
 * Reads a printed scale bar ("0 1 2 3 4 5 METRES" over a ruled bar) from vector evidence. Brochure plans rarely print
 * dimensions but often carry a bar; its ticks are exact vector geometry, so once its numbers are read the drawing
 * scale follows without a reviewer. Numbers come from the PDF's own text or, when the designer outlined the type, from
 * local OCR of the strip beside the bar. A reading is accepted only when at least three numbers from 0 (four when the 0
 * was not read), named in metres or millimetres, land on vector ticks that fit one straight scale.
 */

export type ScaleBarWord = { text: string; center: SourcePointPx; widthPx: number; heightPx: number };
export type ScaleBarLabelSource = "pdf_text" | "local_ocr";

export type ScaleBarEvidence = {
  millimetresPerPixel: number;
  /** Ticks of the smallest and largest numbers, on the bar. */
  start: SourcePointPx;
  end: SourcePointPx;
  lengthMm: number;
  values: number[];
  tickXs: number[];
  unit: "m" | "mm";
  rmsResidualPx: number;
  labelSource: ScaleBarLabelSource;
};

/** A ruled bar found from geometry alone: evenly spaced ticks under one band, numbers not yet read. */
export type ScaleBarGeometry = { left: number; right: number; top: number; bottom: number; ticks: number[] };

type Token = { value: number | null; unit: "m" | "mm" | null; x: number; y: number; heightPx: number };
type Edge = { x: number; top: number; bottom: number; end?: true };
type Fit = { a: number; b: number; rms: number };

const UNIT = /^(m|mm|mtrs?|metres?|meters?)\.?$/i;
const NUMBER = /^(\d+(?:\.\d+)?)$/;
const NUMBER_WITH_UNIT = /^(\d+(?:\.\d+)?)(m|mm|mtrs?|metres?|meters?)\.?$/i;

function unitOf(text: string): "m" | "mm" {
  return text.toLowerCase().startsWith("mm") ? "mm" : "m";
}

function tokenOf(text: string, x: number, y: number, heightPx: number): Token | null {
  const attached = NUMBER_WITH_UNIT.exec(text);
  if (attached) return { value: Number(attached[1]), unit: unitOf(attached[2]), x, y, heightPx };
  if (NUMBER.test(text)) return { value: Number(text), unit: null, x, y, heightPx };
  if (UNIT.test(text)) return { value: null, unit: unitOf(text), x, y, heightPx };
  return null;
}

/** Splits a positioned text run into tokens; a token's position is taken in proportion to its characters. */
export function scaleBarTokens(words: readonly ScaleBarWord[]): Token[] {
  return words.flatMap((word) => {
    const length = Math.max(1, word.text.length);
    const left = word.center.x - word.widthPx / 2;
    const tokens: Token[] = [];
    for (const match of word.text.matchAll(/\S+/g)) {
      const middle = (match.index ?? 0) + match[0].length / 2;
      const token = tokenOf(match[0], left + (middle / length) * word.widthPx, word.center.y, word.heightPx);
      if (token) tokens.push(token);
    }
    return tokens;
  });
}

function rows(tokens: Token[]): Token[][] {
  const sorted = [...tokens].sort((left, right) => left.y - right.y);
  const result: Token[][] = [];
  for (const token of sorted) {
    const row = result[result.length - 1];
    const tolerance = row ? 0.6 * Math.max(token.heightPx, ...row.map((entry) => entry.heightPx)) : 0;
    if (row && Math.abs(token.y - row[0].y) <= tolerance) row.push(token);
    else result.push([token]);
  }
  return result.map((row) => row.sort((left, right) => left.x - right.x));
}

/** The numbers of a row that read as a bar: rising to the right from 0, ending at (or carrying) a unit. */
function labelRun(row: Token[]): { labels: Token[]; unit: "m" | "mm" } | null {
  const unitIndex = row.findIndex((token) => token.unit !== null);
  if (unitIndex < 0) return null;
  const unit = row[unitIndex].unit!;
  const end = row[unitIndex].value === null ? unitIndex - 1 : unitIndex;
  const labels: Token[] = [];
  for (let index = end; index >= 0 && row[index].value !== null; index -= 1) {
    if (labels.length && row[index].value! >= labels[0].value!) break;
    labels.unshift(row[index]);
    if (row[index].value === 0) break;
  }
  // OCR can miss the 0 at the start of a bar; four rising numbers then stand without it.
  return labels.length >= (labels[0].value === 0 ? 3 : 4) ? { labels, unit } : null;
}

function fitLine(points: Array<{ value: number; x: number }>): Fit {
  const n = points.length;
  const meanV = points.reduce((sum, point) => sum + point.value, 0) / n;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const covariance = points.reduce((sum, point) => sum + (point.value - meanV) * (point.x - meanX), 0);
  const variance = points.reduce((sum, point) => sum + (point.value - meanV) ** 2, 0);
  const b = variance > 0 ? covariance / variance : 0;
  const a = meanX - b * meanV;
  const rms = Math.sqrt(points.reduce((sum, point) => sum + (a + b * point.value - point.x) ** 2, 0) / n);
  return { a, b, rms };
}

function verticalEdges(page: RegisteredPageEvidence): Edge[] {
  const maxHeight = Math.max(6, page.heightPx * 0.04);
  return page.vectorSegments.flatMap((segment) => {
    const dy = Math.abs(segment.end.y - segment.start.y);
    if (Math.abs(segment.end.x - segment.start.x) > 0.6 || dy < 1.5 || dy > maxHeight) return [];
    return [{ x: (segment.start.x + segment.end.x) / 2, top: Math.min(segment.start.y, segment.end.y),
      bottom: Math.max(segment.start.y, segment.end.y) }];
  });
}

/** Where a bar's divisions meet: vertical edges, and the ends of its horizontal edges (a bar drawn as filled
 *  triangles has a vertical edge on one side of each division only). */
function tickMarks(page: RegisteredPageEvidence): Edge[] {
  const ends = page.vectorSegments.flatMap((segment) => {
    const dx = Math.abs(segment.end.x - segment.start.x);
    if (Math.abs(segment.end.y - segment.start.y) > 0.6 || dx < 3) return [];
    const y = (segment.start.y + segment.end.y) / 2;
    return [segment.start.x, segment.end.x].map((x) => ({ x, top: y, bottom: y, end: true as const }));
  });
  return [...verticalEdges(page), ...ends];
}

/** Ticks on one side of the label row: edges that sit wholly above or wholly below it, close to it. */
function sideEdges(edges: Edge[], labels: Token[], side: "above" | "below"): Edge[] {
  const height = Math.max(...labels.map((label) => label.heightPx));
  const top = Math.min(...labels.map((label) => label.y)) - height / 2;
  const bottom = Math.max(...labels.map((label) => label.y)) + height / 2;
  const reach = 6 * height;
  // Positions estimated inside a long text run can fall short of the end ticks: allow one label spacing either side.
  const margin = Math.max(2 * height, (labels[labels.length - 1].x - labels[0].x) / (labels.length - 1));
  const left = labels[0].x - margin, right = labels[labels.length - 1].x + margin;
  return edges.filter((edge) => edge.x >= left && edge.x <= right && (side === "below"
    ? edge.top >= bottom - 0.5 && edge.top <= bottom + reach
    : edge.bottom <= top + 0.5 && edge.bottom >= top - reach));
}

type Snapped = Array<{ value: number; x: number; edge: Edge }>;

function snapWith(labels: Token[], edges: Edge[], line: Pick<Fit, "a" | "b">, tolerance: number): Snapped {
  return labels.flatMap((label) => {
    const predicted = line.a + line.b * label.value!;
    // A vertical edge within reach beats any edge end: ends only stand in for a missing vertical.
    const cost = (edge: Edge) => Math.abs(edge.x - predicted) + (edge.end ? tolerance : 0);
    let best: Edge | null = null;
    for (const edge of edges) {
      if (Math.abs(edge.x - predicted) <= tolerance && (!best || cost(edge) < cost(best))) best = edge;
    }
    return best ? [{ value: label.value!, x: best.x, edge: best }] : [];
  });
}

/** Numbers to ticks: first by where the numbers are printed, then again by the line through the ticks found, which
 *  corrects positions estimated inside a long text run. */
function snapToTicks(labels: Token[], edges: Edge[]): Snapped {
  const gaps = labels.slice(1).map((label, index) => label.value! - labels[index].value!);
  let line: Pick<Fit, "a" | "b"> = fitLine(labels.map((label) => ({ value: label.value!, x: label.x })));
  let snapped: Snapped = [];
  for (let pass = 0; pass < 3; pass += 1) {
    const next = snapWith(labels, edges, line, 0.3 * Math.abs(line.b) * Math.min(...gaps));
    if (next.length <= snapped.length) break;
    snapped = next;
    if (snapped.length >= 2) line = fitLine(snapped);
  }
  return snapped;
}

function readRun(edges: Edge[], run: { labels: Token[]; unit: "m" | "mm" },
  labelSource: ScaleBarLabelSource): ScaleBarEvidence | null {
  let best: ReturnType<typeof snapToTicks> = [];
  for (const side of ["below", "above"] as const) {
    const snapped = snapToTicks(run.labels, sideEdges(edges, run.labels, side));
    if (snapped.length > best.length) best = snapped;
  }
  if (best.length < 3) return null;
  const fit = fitLine(best);
  const span = best[best.length - 1].x - best[0].x;
  if (fit.b <= 0 || fit.rms > Math.max(0.6, 0.004 * span)) return null;
  const millimetresPerPixel = (run.unit === "m" ? 1000 : 1) / fit.b;
  if (millimetresPerPixel < 0.5 || millimetresPerPixel > 1000) return null;
  const y = best.map((entry) => (entry.edge.top + entry.edge.bottom) / 2).sort((l, r) => l - r)[Math.floor(best.length / 2)];
  const first = best[0], last = best[best.length - 1];
  return {
    millimetresPerPixel, start: { x: fit.a + fit.b * first.value, y }, end: { x: fit.a + fit.b * last.value, y },
    lengthMm: (last.value - first.value) * (run.unit === "m" ? 1000 : 1), values: best.map((entry) => entry.value),
    tickXs: best.map((entry) => entry.x), unit: run.unit, rmsResidualPx: fit.rms, labelSource,
  };
}

/** The scale bar these words label, if any; the reading with the most ticks wins. */
export function readScaleBar(page: RegisteredPageEvidence, words: readonly ScaleBarWord[],
  labelSource: ScaleBarLabelSource): ScaleBarEvidence | null {
  const edges = tickMarks(page);
  let best: ScaleBarEvidence | null = null;
  for (const row of rows(scaleBarTokens(words))) {
    const run = labelRun(row);
    const reading = run ? readRun(edges, run, labelSource) : null;
    if (reading && (!best || reading.values.length > best.values.length)) best = reading;
  }
  return best;
}

export function scaleBarWordsFromText(text: readonly SourceTextEvidence[]): ScaleBarWord[] {
  return text.filter((entry) => Math.abs(entry.rotationDegrees ?? 0) < 5).map((entry) => ({
    text: entry.text, center: entry.center, widthPx: entry.widthPx, heightPx: entry.heightPx,
  }));
}

function uniqueSorted(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > tolerance);
}

/** The sorted position nearest `target` within `tolerance`, by binary search. */
function nearest(xs: number[], target: number, tolerance: number): number | undefined {
  let low = 0, high = xs.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (xs[middle] < target) low = middle + 1;
    else high = middle;
  }
  const candidates = [xs[low - 1], xs[low]].filter((x) => x !== undefined && Math.abs(x - target) <= tolerance);
  return candidates.sort((l, r) => Math.abs(l - target) - Math.abs(r - target))[0];
}

function runFrom(xs: number[], start: number, gap: number): number[] {
  const tolerance = Math.max(0.6, gap * 0.015);
  const run = [start];
  for (let hit = nearest(xs, start + gap, tolerance); hit !== undefined; hit = nearest(xs, hit + gap, tolerance)) run.push(hit);
  return run;
}

/** The longest run of evenly spaced positions. Ticks in between are allowed, such as a first metre in quarters. */
function evenRun(xs: number[], minimumGap: number): number[] {
  let best: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < Math.min(xs.length, i + 10); j += 1) {
      const gap = xs[j] - xs[i];
      const run = gap >= minimumGap ? runFrom(xs, xs[i], gap) : [];
      if (run.length > best.length) best = run;
    }
  }
  return best;
}

function horizontalCoverage(page: RegisteredPageEvidence, left: number, right: number, top: number, bottom: number) {
  const covered = page.vectorSegments.filter((segment) => Math.abs(segment.end.y - segment.start.y) <= 0.6 &&
    segment.start.y >= top - 1 && segment.start.y <= bottom + 1)
    .map((segment) => [Math.max(left, Math.min(segment.start.x, segment.end.x)), Math.min(right, Math.max(segment.start.x, segment.end.x))])
    .filter(([from, to]) => to > from).sort((l, r) => l[0] - r[0]);
  let total = 0, reach = left;
  for (const [from, to] of covered) {
    if (to > reach) { total += to - Math.max(from, reach); reach = to; }
  }
  return total / Math.max(1, right - left);
}

/** Ruled bars found from geometry alone, for reading their numbers when the PDF has no text for them. */
export function findScaleBarGeometry(page: RegisteredPageEvidence, limit = 2): ScaleBarGeometry[] {
  const bands = new Map<number, Edge[]>();
  for (const edge of verticalEdges(page)) {
    const key = Math.round((edge.top + edge.bottom) / 2 / 12);
    for (const band of [key - 1, key, key + 1]) bands.set(band, [...(bands.get(band) ?? []), edge]);
  }
  const found: Array<ScaleBarGeometry & { score: number }> = [];
  for (const edges of bands.values()) {
    const run = evenRun(uniqueSorted(edges.map((edge) => edge.x), 0.75), Math.max(8, page.widthPx * 0.008));
    const left = run[0], right = run[run.length - 1];
    if (run.length < 4 || right - left > page.widthPx * 0.5) continue;
    const inRun = edges.filter((edge) => edge.x >= left - 0.75 && edge.x <= right + 0.75);
    const top = Math.min(...inRun.map((edge) => edge.top)), bottom = Math.max(...inRun.map((edge) => edge.bottom));
    // A bar is a thin band of long divisions; stair treads and mullions are tall for their spacing.
    if (bottom - top > 0.8 * ((right - left) / (run.length - 1))) continue;
    if (horizontalCoverage(page, left, right, top, bottom) < 0.9) continue;
    found.push({ left, right, top, bottom, ticks: run, score: run.length });
  }
  const kept: ScaleBarGeometry[] = [];
  for (const { score: _score, ...bar } of found.sort((l, r) => r.score - l.score)) {
    if (!kept.some((other) => overlaps(other, bar))) kept.push(bar);
  }
  return kept.slice(0, limit);
}

/** The same bar seen from a neighbouring band: the boxes overlap. */
function overlaps(left: ScaleBarGeometry, right: ScaleBarGeometry) {
  return Math.min(left.right, right.right) > Math.max(left.left, right.left) &&
    Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top);
}

/** Where the numbers of a ruled bar are printed: a strip above it, then one below, wide enough for the unit word. */
export function scaleBarLabelStrips(page: RegisteredPageEvidence, bar: ScaleBarGeometry) {
  const gap = (bar.right - bar.left) / Math.max(1, bar.ticks.length - 1);
  const height = Math.max(24, 2.5 * (bar.bottom - bar.top));
  const left = Math.max(0, bar.left - gap), right = Math.min(page.widthPx, bar.right + 3.5 * gap);
  return [
    { left, right, top: Math.max(0, bar.top - height), bottom: bar.top - 0.5 },
    { left, right, top: bar.bottom + 0.5, bottom: Math.min(page.heightPx, bar.bottom + height) },
  ].filter((strip) => strip.bottom - strip.top >= 6);
}
