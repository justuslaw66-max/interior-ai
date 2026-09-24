import type { RegisteredPageEvidence, SourcePointPx, SourceVectorSegment } from "./deterministic-evidence";
import { sourceSegmentsForWalls } from "./source-wall-linework";

export type RasterBoundaryProposal = {
  id: string; start: SourcePointPx; end: SourcePointPx;
  proof: "solid_stroke" | "paired_rails"; segmentIds: string[];
};
type Rail = { segment: SourceVectorSegment; horizontal: boolean; constant: number; from: number; to: number; width: number };

function asRail(segment: SourceVectorSegment): Rail | null {
  const dx = Math.abs(segment.end.x - segment.start.x), dy = Math.abs(segment.end.y - segment.start.y);
  if (Math.max(dx, dy) < 24 || Math.min(dx, dy) > 0.25) return null;
  const horizontal = dx > dy, a = segment.start, b = segment.end;
  return { segment, horizontal, constant: horizontal ? (a.y + b.y) / 2 : (a.x + b.x) / 2,
    from: horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
    to: horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y), width: segment.strokeWidthPx ?? 0 };
}
const at = (rail: Rail, along: number, constant = rail.constant) =>
  rail.horizontal ? { x: along, y: constant } : { x: constant, y: along };
const overlap = (a: Rail, b: Rail) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));

function insidePlan(page: RegisteredPageEvidence, rail: Rail) {
  const region = page.semantics.planRegion;
  if (!region || region.confidence < 0.5) return false;
  return [at(rail, rail.from), at(rail, rail.to)].every(p =>
    p.x >= region.bbox.leftRatio * page.widthPx && p.x <= region.bbox.rightRatio * page.widthPx &&
    p.y >= region.bbox.topRatio * page.heightPx && p.y <= region.bbox.bottomRatio * page.heightPx);
}

function inFixture(page: RegisteredPageEvidence, rail: Rail) {
  const p = at(rail, (rail.from + rail.to) / 2);
  return (page.semantics.fixtureSymbols ?? []).some(f => f.bbox && f.confidence >= 0.5 &&
    p.x >= f.bbox.leftRatio * page.widthPx && p.x <= f.bbox.rightRatio * page.widthPx &&
    p.y >= f.bbox.topRatio * page.heightPx && p.y <= f.bbox.bottomRatio * page.heightPx);
}

function railPair(a: Rail, b: Rail, rails: Rail[], mmPerPx: number): RasterBoundaryProposal | null {
  if (a.horizontal !== b.horizontal || a.width > 2.5 || b.width > 2.5) return null;
  const gap = Math.abs(a.constant - b.constant), length = overlap(a, b);
  if (gap * mmPerPx < 60 || gap * mmPerPx > 600 || length < 24 || length < 4 * gap) return null;
  // Multiple parallel rails can be windows, louvres or fixtures. Never choose a
  // convenient pair from that ambiguous evidence or bridge an interrupted rail.
  const first = Math.min(a.constant, b.constant), last = Math.max(a.constant, b.constant);
  const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
  if (rails.some(r => r !== a && r !== b && r.horizontal === a.horizontal &&
    r.constant > first - gap * 1.5 && r.constant < last + gap * 1.5 &&
    Math.min(to, r.to) - Math.max(from, r.from) >= Math.min(12, length * 0.2))) return null;
  return { id: [a.segment.id, b.segment.id].sort().join("--"), start: at(a, from, (first + last) / 2),
    end: at(a, to, (first + last) / 2), proof: "paired_rails", segmentIds: [a.segment.id, b.segment.id] };
}

/** Local source candidates only. These spans never close a face, establish a
 * building wall/width, or enter automatic canonical topology. */
export function rasterBoundaryProposals(page: RegisteredPageEvidence, mmPerPx: number): RasterBoundaryProposal[] {
  if (!Number.isFinite(mmPerPx) || mmPerPx <= 0) return [];
  const rails = sourceSegmentsForWalls(page).filter(s => s.evidenceKind === "raster_linework")
    .flatMap(s => { const r = asRail(s); return r ? [r] : []; });
  if (rails.length > 512) return [];
  const eligible = rails.filter(r => insidePlan(page, r) && !inFixture(page, r));
  const solid = eligible.filter(r => r.width >= 4 && r.width * mmPerPx >= 60 && r.width * mmPerPx <= 600)
    .filter(r => !eligible.some(other => other !== r && other.horizontal === r.horizontal && other.width > r.width &&
      Math.abs(other.constant - r.constant) <= (other.width + r.width) / 2 + 1 && overlap(r, other) >= (r.to - r.from) * 0.9))
    .map(r => ({ id: r.segment.id, start: at(r, r.from), end: at(r, r.to), proof: "solid_stroke" as const, segmentIds: [r.segment.id] }));
  const pairs = eligible.flatMap((a, i) => eligible.slice(i + 1).flatMap(b => {
    const proposal = railPair(a, b, rails, mmPerPx); return proposal ? [proposal] : [];
  }));
  return [...solid, ...pairs].slice(0, 256);
}
