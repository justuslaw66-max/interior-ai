import type { RegisteredPageEvidence, SourcePointPx, SourceVectorSegment } from "./deterministic-evidence";

/**
 * A dimension line drawn between arrowheads measures from tip to tip (14 Nov 2026). AutoCAD draws the line from one
 * arrowhead's base to the other's and each head as a small closed triangle beyond it (Thomson Reserve: 11 px heads on a
 * 430 px line). Measured on the line alone every span came out 22 px short, so the printed figures disagreed by up to
 * 8% and no scale was accepted; tip to tip they agree. A line end with no such head is left where it is.
 */
export const DIMENSION_ARROWHEAD_LIMITS = Object.freeze({
  /** A head's longer side, in page pixels. */
  maxHeadPx: 40,
  /** How far a head's base may lie from the line's end, and its tip from the line's axis, in page pixels. */
  touchPx: 1.5,
});

type Head = { corners: SourcePointPx[] };

const heads = new WeakMap<RegisteredPageEvidence, Head[]>();

/** The page's small closed triangles (three distinct corners), found once. */
function headsOf(page: RegisteredPageEvidence) {
  const known = heads.get(page);
  if (known) return known;
  const byId = new Map(page.vectorSegments.map((segment) => [segment.id, segment]));
  const found = page.vectorPaths.flatMap((path): Head[] => {
    const { left, top, right, bottom } = path.bbox;
    if (!path.closed || Math.max(right - left, bottom - top) > DIMENSION_ARROWHEAD_LIMITS.maxHeadPx) return [];
    const corners: SourcePointPx[] = [];
    for (const id of path.segmentIds) {
      const segment = byId.get(id);
      for (const point of segment ? [segment.start, segment.end] : []) {
        if (!corners.some((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) < 0.5)) corners.push(point);
      }
    }
    return corners.length === 3 ? [{ corners }] : [];
  });
  heads.set(page, found);
  return found;
}

/** Where a line's end moves to: the tip of an arrowhead whose base it touches and which points on along the line. */
function tipBeyond(end: SourcePointPx, along: { x: number; y: number }, page: RegisteredPageEvidence) {
  const { touchPx } = DIMENSION_ARROWHEAD_LIMITS;
  let tip: SourcePointPx | null = null, reach = 0;
  for (const { corners } of headsOf(page)) {
    const offsets = corners.map((corner) => ({ corner, ahead: (corner.x - end.x) * along.x + (corner.y - end.y) * along.y,
      aside: Math.abs((corner.x - end.x) * along.y - (corner.y - end.y) * along.x) }));
    const base = offsets.filter((offset) => Math.abs(offset.ahead) <= touchPx);
    const point = offsets.find((offset) => offset.ahead > touchPx && offset.aside <= touchPx);
    if (base.length !== 2 || !point || point.ahead <= reach) continue;
    // The base straddles the line: one corner either side of it.
    const side = (offset: (typeof base)[number]) => (offset.corner.x - end.x) * along.y - (offset.corner.y - end.y) * along.x;
    if (side(base[0]) * side(base[1]) >= 0) continue;
    tip = point.corner;
    reach = point.ahead;
  }
  return tip;
}

/** The span a dimension line measures: tip to tip where it is drawn between arrowheads, else its own two ends. */
export function dimensionSpan(page: RegisteredPageEvidence, segment: SourceVectorSegment) {
  const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
  if (length === 0) return { start: segment.start, end: segment.end, lengthPx: 0 };
  const along = { x: (segment.end.x - segment.start.x) / length, y: (segment.end.y - segment.start.y) / length };
  const start = tipBeyond(segment.start, { x: -along.x, y: -along.y }, page) ?? segment.start;
  const end = tipBeyond(segment.end, along, page) ?? segment.end;
  return { start, end, lengthPx: Math.hypot(end.x - start.x, end.y - start.y) };
}
