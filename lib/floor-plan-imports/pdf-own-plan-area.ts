import type { RegisteredPageEvidence } from "./deterministic-evidence";
import type { DrawnShape } from "./pdf-drawing-recorder";

/**
 * The part of a sheet that holds the plan the import reads (J, 10 Nov 2026: "fix it now"). A brochure sheet such as
 * Thomson Reserve's prints two plans, tables, notes, a key plan and a logo: its whole drawing is far over what the
 * candidate can hold, and its pictures cannot be drawn as lines, so its traced view stayed blank. Drawn alone, one plan
 * fits easily (pdf-own-drawing.ts draws it; the rest of the sheet is left out, with a page note).
 *
 * The plan is the largest group of walls lying close together: the vectorizer's wall edges and rooms where it read the
 * page, or else the sheet's own solid dark fills (walls drawn solid, and the ticks of their dimension chains). Where
 * two plans weigh nearly the same (an approved plan and a show-unit plan of the same unit), the first in reading order
 * is taken. The area adds a margin for the dimension chains and labels around it.
 */
export const PLAN_AREA_SETTINGS = Object.freeze({
  /** Walls and rooms closer than this share of the sheet's longer side belong to one plan. */
  gapShare: 0.03,
  /** The margin around the vectorizer's walls, as a share of the plan's longer side (dimension chains, labels). */
  marginShare: 0.12,
  /** The margin around the drawing's dark fills, which already reach the dimension ticks: their figures and labels. */
  drawingMarginShare: 0.03,
  minMarginPx: 40,
  /** Plans weighing at least this share of the heaviest are as good as it: the first in reading order is taken. */
  tieShare: 0.9,
  /** A dark fill (tone at most this, 0 black) at least this thick in page pixels is a wall or a tick, not a hairline. */
  darkTone: 80,
  minFillThicknessPx: 3,
  /** An area covering more of the sheet than this is the whole sheet: nothing is gained by drawing it alone. */
  maxSheetShare: 0.85,
  /** Beyond this many walls and rooms the grouping is not attempted. */
  maxBoxes: 6000,
});

type Box = [number, number, number, number];
type Item = { box: Box; weight: number };

function itemsOf(vectorizer: NonNullable<RegisteredPageEvidence["vectorizer"]>): Item[] {
  const walls = vectorizer.wallEdges.map(({ sourcePx: [a, b] }): Item => ({
    box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    weight: Math.hypot(b[0] - a[0], b[1] - a[1]),
  }));
  const rooms = vectorizer.rooms.flatMap(({ sourcePoints }): Item[] => {
    if (!sourcePoints.length) return [];
    const xs = sourcePoints.map((p) => p.x), ys = sourcePoints.map((p) => p.y);
    const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    return [{ box, weight: 2 * (box[2] - box[0] + box[3] - box[1]) }];
  });
  return [...walls, ...rooms].filter(({ box }) => box.every(Number.isFinite));
}

/** The sheet's solid dark fills in page pixels, weighted by area: walls drawn solid, and their dimension ticks. */
function fillItems(shapes: readonly DrawnShape[], scale: number): Item[] {
  const { darkTone, minFillThicknessPx } = PLAN_AREA_SETTINGS;
  return shapes.flatMap((shape): Item[] => {
    const [left, top, right, bottom] = shape.bbox.map((value) => value * scale);
    if (shape.kind !== "fill" || shape.letter || shape.tone > darkTone) return [];
    if (Math.min(right - left, bottom - top) < minFillThicknessPx) return [];
    return [{ box: [left, top, right, bottom], weight: (right - left) * (bottom - top) }];
  });
}

/** Groups of items whose boxes come within `gap` of each other (union-find). */
function groups(items: Item[], gap: number): Item[][] {
  const parent = items.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (near(items[i].box, items[j].box, gap)) parent[root(i)] = root(j);
  }
  const byRoot = new Map<number, Item[]>();
  items.forEach((item, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), item]));
  return [...byRoot.values()];
}

function near(a: Box, b: Box, gap: number) {
  return a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
}

function boundsOf(items: Item[]): Box {
  return [Math.min(...items.map((i) => i.box[0])), Math.min(...items.map((i) => i.box[1])),
    Math.max(...items.map((i) => i.box[2])), Math.max(...items.map((i) => i.box[3]))];
}

/** The plan's bounds: the heaviest group (the first in reading order among near ties), with any group lying over it. */
function planBounds(found: Item[][]): Box {
  const weight = (group: Item[]) => group.reduce((sum, item) => sum + item.weight, 0);
  const heaviest = Math.max(...found.map(weight));
  const placed = found.map((group) => ({ group, box: boundsOf(group) }));
  const plans = placed.filter(({ group }) => weight(group) >= PLAN_AREA_SETTINGS.tieShare * heaviest);
  let box = plans.reduce((first, plan) => (readsBefore(plan.box, first.box) ? plan : first)).box;
  for (let grown = true; grown;) {
    grown = false;
    for (const other of placed) {
      if (!near(other.box, box, 0) || within(other.box, box)) continue;
      box = boundsOf([{ box, weight: 0 }, { box: other.box, weight: 0 }]);
      grown = true;
    }
  }
  return box;
}

/** Reading order: the plan higher on the sheet, or level with it (overlapping rows) and further left. */
function readsBefore(a: Box, b: Box) {
  return a[3] <= b[1] || (a[1] < b[3] && a[0] < b[0]);
}

function within(a: Box, b: Box) {
  return a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
}

function areaAround(items: Item[], widthPx: number, heightPx: number, marginShare: number): Box | null {
  if (!items.length || items.length > PLAN_AREA_SETTINGS.maxBoxes) return null;
  const [left, top, right, bottom] = planBounds(groups(items, PLAN_AREA_SETTINGS.gapShare * Math.max(widthPx, heightPx)));
  const margin = Math.max(PLAN_AREA_SETTINGS.minMarginPx, marginShare * Math.max(right - left, bottom - top));
  const area: Box = [Math.max(0, left - margin), Math.max(0, top - margin), Math.min(widthPx, right + margin), Math.min(heightPx, bottom + margin)];
  const share = ((area[2] - area[0]) * (area[3] - area[1])) / (widthPx * heightPx);
  return share > 0 && share <= PLAN_AREA_SETTINGS.maxSheetShare ? area : null;
}

/** The plan's area on the sheet from the vectorizer's reading, in page pixels (left, top, right, bottom), or null where
 * there is none to draw alone. */
export function pdfPlanArea(page: Pick<RegisteredPageEvidence, "vectorizer" | "widthPx" | "heightPx">): Box | null {
  return areaAround(page.vectorizer ? itemsOf(page.vectorizer) : [], page.widthPx, page.heightPx, PLAN_AREA_SETTINGS.marginShare);
}

/** The plan's area from the sheet's own drawing (`scale` turns its shapes' device pixels into page pixels), for a page
 * the vectorizer did not read; null where there is none. */
export function pdfDrawingPlanArea(drawing: { shapes: readonly DrawnShape[]; scale: number; widthPx: number; heightPx: number }): Box | null {
  return areaAround(fillItems(drawing.shapes, drawing.scale), drawing.widthPx, drawing.heightPx, PLAN_AREA_SETTINGS.drawingMarginShare);
}
