import type { RegisteredPageEvidence, SourceTextEvidence } from "./deterministic-evidence";
import { pdfPathsPlanArea } from "./pdf-own-plan-area";
import { roomTypeFromLabel } from "./room-type-from-label";
import { diagnoseSourceScale } from "./source-scale-cross-check";
import { VECTORIZER_EVIDENCE_KIND, type FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

/**
 * A vector PDF page's own reading, for its own walls (pdf-own-walls.ts), with no picture reader (14 Nov 2026). The
 * builder needs from a reader only what is lettered: the scale, the dimension lines (to leave them out of the walls),
 * where the plan is, and the room names. A page that prints its dimensions as text has all of these in its own
 * drawing, exactly: the scale from its figures and their dimension lines (source-scale-cross-check.ts), the plan from
 * its solid fills (pdf-own-plan-area.ts), the names from its lettering. Reading the page as a picture is then not
 * needed: on Thomson Reserve's A1 sheet it ran out of memory (6.2 GB). The plan lies within its dimension chains (a
 * chain runs the plan's whole width or height); where the sheet's solid fills reach further, so does the plan.
 */
export const PDF_OWN_TEXT_LIMITS = Object.freeze({
  /** Lines of a stacked name: each centred within this share of the narrower line, or starting within this many line
   * heights of the line above, no further apart than this many line heights. */
  stackCentreShare: 0.5, stackLeftLines: 0.25, stackGapLines: 1.6,
  /** A line printed within this share of the names' size is one (fixture letters are printed smaller). */
  sizeShare: 0.12,
  /** The plan is what its dimension chains measure, with this share of its longer side beyond them. */
  chainMarginShare: 0.05,
});

type Evidence = FloorPlanVectorizerEvidence;
type Box = [number, number, number, number];

const EXPORTER = "pdf-own-text 1";

/** Lettering that can be (part of) a room name: a letter in it, and no bracketed qualifier such as "(non-strata)". */
const nameLike = (text: string) => /[A-Za-z]/.test(text) && !/^\(.*\)$/.test(text.trim());

/** The size room names are printed at: the commonest height among the plan's lettering. */
function nameSize(lines: SourceTextEvidence[]) {
  const counts = new Map<number, number>();
  for (const line of lines) counts.set(Math.round(line.heightPx), (counts.get(Math.round(line.heightPx)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

/** The plan's room names: lines at the names' size, lines stacked one under another read as one name. */
export function ownRoomNames(text: readonly SourceTextEvidence[], area: Box | null) {
  const inside = (line: SourceTextEvidence) => !area || (line.center.x >= area[0] && line.center.x <= area[2] && line.center.y >= area[1] && line.center.y <= area[3]);
  const lines = text.filter((line) => !line.reviewRequired && nameLike(line.text) && inside(line));
  const size = nameSize(lines);
  if (size === null) return [];
  const { sizeShare, stackCentreShare, stackLeftLines, stackGapLines } = PDF_OWN_TEXT_LIMITS;
  const named = lines.filter((line) => Math.abs(line.heightPx - size) <= sizeShare * size).sort((a, b) => a.center.y - b.center.y);
  const level = (line: SourceTextEvidence) => !line.rotationDegrees;
  const used = new Set<SourceTextEvidence>(), names: { lines: SourceTextEvidence[] }[] = [];
  const below = (upper: SourceTextEvidence) => (level(upper) ? named.find((other) => !used.has(other) && level(other) && stacked(upper, other)) : undefined);
  for (const line of named) {
    if (used.has(line)) continue;
    const stack = [line];
    used.add(line);
    for (let next = below(line); next; next = below(next)) {
      stack.push(next);
      used.add(next);
    }
    names.push({ lines: stack });
  }
  return names.map(({ lines: stack }) => {
    const left = Math.min(...stack.map((l) => l.center.x - l.widthPx / 2)), right = Math.max(...stack.map((l) => l.center.x + l.widthPx / 2));
    const top = Math.min(...stack.map((l) => l.center.y - l.heightPx / 2)), bottom = Math.max(...stack.map((l) => l.center.y + l.heightPx / 2));
    // A line ending in "/" or "-" carries on into the next with no space ("LIVING/" "DINING").
    const label = stack.map((l) => l.text.trim()).reduce((joined, next) => (/[/-]$/.test(joined) ? joined + next : `${joined} ${next}`));
    return { label, box: [left, top, right, bottom] as Box, roomType: roomTypeFromLabel(label) ?? "other" };
  });

  function stacked(upper: SourceTextEvidence, lower: SourceTextEvidence) {
    const gap = lower.center.y - upper.center.y;
    const centred = Math.abs(lower.center.x - upper.center.x) <= stackCentreShare * Math.min(upper.widthPx, lower.widthPx);
    const leftAligned = Math.abs(lower.center.x - lower.widthPx / 2 - (upper.center.x - upper.widthPx / 2)) <= stackLeftLines * upper.heightPx;
    return gap > 0 && gap <= stackGapLines * upper.heightPx && (centred || leftAligned);
  }
}

const ratioBox = ([left, top, right, bottom]: Box, widthPx: number, heightPx: number) => ({
  leftRatio: Math.max(0, left / widthPx), topRatio: Math.max(0, top / heightPx),
  rightRatio: Math.min(1, right / widthPx), bottomRatio: Math.min(1, bottom / heightPx),
});

/** The plan's area: its dimension chains' bounds with a margin, and the solid fills' area where that reaches further. */
function planArea(chains: { start: { x: number; y: number }; end: { x: number; y: number } }[], fills: Box | null, widthPx: number, heightPx: number): Box | null {
  const xs = chains.flatMap(({ start, end }) => [start.x, end.x]), ys = chains.flatMap(({ start, end }) => [start.y, end.y]);
  if (!xs.length) return fills;
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const margin = PDF_OWN_TEXT_LIMITS.chainMarginShare * Math.max(box[2] - box[0], box[3] - box[1]);
  const around: Box = [Math.max(0, box[0] - margin), Math.max(0, box[1] - margin), Math.min(widthPx, box[2] + margin), Math.min(heightPx, box[3] + margin)];
  return fills ? [Math.min(around[0], fills[0]), Math.min(around[1], fills[1]), Math.max(around[2], fills[2]), Math.max(around[3], fills[3])] : around;
}

/** The page's own reading, or null where it gives no scale from its printed dimensions. */
export function pdfOwnTextEvidence(page: RegisteredPageEvidence): Evidence | null {
  // The scale solver notes the figures it set aside on the page it reads: it reads a copy here.
  const diagnosis = diagnoseSourceScale({ ...page, semantics: { ...page.semantics, notes: [...page.semantics.notes] } });
  const scale = diagnosis.status === "accepted" ? diagnosis.candidate : null;
  if (!scale) return null;
  const { widthPx, heightPx } = page;
  const area = planArea(scale.evidence, pdfPathsPlanArea(page.vectorPaths, widthPx, heightPx), widthPx, heightPx);
  const dimensionLabels = scale.evidence.map((evidence) => {
    const mid = { x: (evidence.start.x + evidence.end.x) / 2, y: (evidence.start.y + evidence.end.y) / 2 };
    const level = Math.abs(evidence.end.x - evidence.start.x) >= Math.abs(evidence.end.y - evidence.start.y);
    return { valueMm: Math.round(evidence.valueMm), rawText: String(Math.round(evidence.valueMm)), centerXRatio: mid.x / widthPx, centerYRatio: mid.y / heightPx,
      orientation: level ? "horizontal" as const : "vertical" as const, confidence: 1,
      spanSourcePx: [[evidence.start.x, evidence.start.y], [evidence.end.x, evidence.end.y]] as [[number, number], [number, number]] };
  });
  const roomLabels = ownRoomNames(page.text, area).map((name) => ({
    label: name.label.slice(0, 120), roomType: name.roomType, confidence: 1,
    centerXRatio: (name.box[0] + name.box[2]) / 2 / widthPx, centerYRatio: (name.box[1] + name.box[3]) / 2 / heightPx,
    bbox: ratioBox(name.box, widthPx, heightPx),
  }));
  return {
    kind: VECTORIZER_EVIDENCE_KIND, exporterVersion: EXPORTER,
    page: { widthPx, heightPx, coordinateSpace: "source_image_px" },
    scale: { millimetresPerPixel: scale.millimetresPerPixel, basis: "explicit_dimension", dimensionCount: scale.dimensionCount, needsReview: false },
    semantics: {
      planRegion: area ? { bbox: ratioBox(area, widthPx, heightPx), rotationDegrees: 0, confidence: 1 } : null,
      roomLabels: roomLabels.slice(0, 100), dimensionLabels: dimensionLabels.slice(0, 200), openingSymbols: [], fixtureSymbols: [],
      notes: [`Read from the PDF's own lettering and dimensions: scale ${scale.millimetresPerPixel.toFixed(3)} mm/px from ${scale.dimensionCount} dimensions; ${roomLabels.length} names.`],
    },
    wallEdges: [], rooms: [], diagnostics: { pdfOwnText: true },
  };
}
