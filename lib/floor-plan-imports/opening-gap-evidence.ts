import {
  type RegisteredPageEvidence,
  type SemanticOpeningSymbol,
  type SourcePointPx,
} from "./deterministic-evidence";
import type { RegisteredWallCenterlineEvidence } from "./wall-centerline-evidence";
import { findRegisteredSourceOpeningSupport } from "./opening-symbol-evidence";

const DEFAULT_MAX_GAP_CANDIDATES = 512;
const DEFAULT_MAX_SUPPORT_CHECKS = 750_000;

export type RegisteredOpeningGapEvidence = {
  id: string;
  pageNumber: number;
  orientation: "horizontal" | "vertical";
  start: SourcePointPx;
  end: SourcePointPx;
  widthPx: number;
  widthMm: number;
  thicknessMm: number;
  beforeCenterlineId: string;
  afterCenterlineId: string;
  kind: "door" | "window";
  operation: "swing" | "sliding" | "folding" | "fixed";
  proof:
    | "swing_arc_and_leaf"
    | "sliding_staggered_panels"
    | "folding_connected_leaves"
    | "paired_fixed_frame_lines";
  confidence: number;
  supportPathIds: string[];
  supportSubpathIds: string[];
  supportSegmentIds: string[];
  supportCurveIds: string[];
  semanticEvidenceKind?: SemanticOpeningSymbol["evidenceKind"];
};

export type OpeningGapDiagnostics = {
  status: "complete" | "bounded_out";
  limitReason: string | null;
  collinearGroupCount: number;
  gapCandidateCount: number;
  supportedGapCount: number;
  ambiguousGapCount: number;
  supportCheckCount: number;
  sourceSymbolMatchCounts: {
    swing: number;
    sliding: number;
    folding: number;
    fixed: number;
  };
};

export type RegisteredOpeningGapResult = {
  gaps: RegisteredOpeningGapEvidence[];
  diagnostics: OpeningGapDiagnostics;
};

type GapCandidate = {
  orientation: "horizontal" | "vertical";
  start: SourcePointPx;
  end: SourcePointPx;
  widthPx: number;
  widthMm: number;
  thicknessMm: number;
  thicknessPx: number;
  before: RegisteredWallCenterlineEvidence;
  after: RegisteredWallCenterlineEvidence;
};

function pointDistance(left: SourcePointPx, right: SourcePointPx) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function semanticForGap(page: RegisteredPageEvidence, gap: GapCandidate) {
  const center = {
    x: (gap.start.x + gap.end.x) / 2,
    y: (gap.start.y + gap.end.y) / 2,
  };
  const maxDistance = Math.max(gap.widthPx, gap.thicknessPx * 3);
  return page.semantics.openingSymbols
    .filter((symbol) => symbol.confidence >= 0.45)
    .map((symbol) => ({
      symbol,
      distance: pointDistance(center, {
        x: symbol.centerXRatio * page.widthPx,
        y: symbol.centerYRatio * page.heightPx,
      }),
    }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance)[0]?.symbol;
}

function groupCenterlines(
  page: RegisteredPageEvidence,
  centerlines: RegisteredWallCenterlineEvidence[]
) {
  const tolerancePx = Math.max(
    0.25,
    Math.hypot(page.widthPx, page.heightPx) * 0.00015
  );
  const groups: RegisteredWallCenterlineEvidence[][] = [];
  for (const centerline of centerlines) {
    const constant =
      centerline.orientation === "horizontal"
        ? centerline.start.y
        : centerline.start.x;
    const group = groups.find((entries) => {
      const first = entries[0];
      const firstConstant =
        first.orientation === "horizontal" ? first.start.y : first.start.x;
      return (
        first.orientation === centerline.orientation &&
        Math.abs(firstConstant - constant) <= tolerancePx
      );
    });
    if (group) group.push(centerline);
    else groups.push([centerline]);
  }
  return { groups, tolerancePx };
}

/**
 * Registers a wall gap only when its two jamb centerlines are collinear and a
 * source-vector swing symbol or multi-line frame independently supports it.
 * Semantic anchors may classify that source geometry but never set its span.
 */
export function detectRegisteredOpeningGaps(
  page: RegisteredPageEvidence,
  centerlines: RegisteredWallCenterlineEvidence[],
  millimetresPerPixel: number,
  options: {
    minWidthMm?: number;
    maxWidthMm?: number;
    maxGapCandidates?: number;
    maxSupportChecks?: number;
  } = {}
): RegisteredOpeningGapResult {
  const minWidthMm = options.minWidthMm ?? 400;
  const maxWidthMm = options.maxWidthMm ?? 3_000;
  const maxGapCandidates = options.maxGapCandidates ?? DEFAULT_MAX_GAP_CANDIDATES;
  const maxSupportChecks = options.maxSupportChecks ?? DEFAULT_MAX_SUPPORT_CHECKS;
  const diagnostics: OpeningGapDiagnostics = {
    status: "complete",
    limitReason: null,
    collinearGroupCount: 0,
    gapCandidateCount: 0,
    supportedGapCount: 0,
    ambiguousGapCount: 0,
    supportCheckCount: 0,
    sourceSymbolMatchCounts: {
      swing: 0,
      sliding: 0,
      folding: 0,
      fixed: 0,
    },
  };
  const boundedOut = (reason: string): RegisteredOpeningGapResult => ({
    gaps: [],
    diagnostics: { ...diagnostics, status: "bounded_out", limitReason: reason },
  });
  if (!Number.isFinite(millimetresPerPixel) || millimetresPerPixel <= 0) {
    return boundedOut("scale_unavailable");
  }
  const { groups, tolerancePx } = groupCenterlines(page, centerlines);
  diagnostics.collinearGroupCount = groups.length;
  const candidates: GapCandidate[] = [];
  for (const group of groups) {
    const orientation = group[0].orientation;
    const sorted = [...group].sort((left, right) =>
      orientation === "horizontal"
        ? left.start.x - right.start.x
        : left.start.y - right.start.y
    );
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const before = sorted[index];
      const after = sorted[index + 1];
      const beforeEnd = orientation === "horizontal" ? before.end.x : before.end.y;
      const afterStart = orientation === "horizontal" ? after.start.x : after.start.y;
      const widthPx = afterStart - beforeEnd;
      if (widthPx <= tolerancePx) continue;
      const widthMm = Math.round(widthPx * millimetresPerPixel);
      if (widthMm < minWidthMm || widthMm > maxWidthMm) continue;
      if (
        Math.abs(before.thicknessMm - after.thicknessMm) >
        Math.max(20, Math.min(before.thicknessMm, after.thicknessMm) * 0.2)
      ) {
        continue;
      }
      const constant =
        orientation === "horizontal"
          ? (before.end.y + after.start.y) / 2
          : (before.end.x + after.start.x) / 2;
      candidates.push({
        orientation,
        start:
          orientation === "horizontal"
            ? { x: beforeEnd, y: constant }
            : { x: constant, y: beforeEnd },
        end:
          orientation === "horizontal"
            ? { x: afterStart, y: constant }
            : { x: constant, y: afterStart },
        widthPx,
        widthMm,
        thicknessMm: Math.round((before.thicknessMm + after.thicknessMm) / 2),
        thicknessPx: (before.thicknessPx + after.thicknessPx) / 2,
        before,
        after,
      });
      if (candidates.length > maxGapCandidates) return boundedOut("gap_candidate_limit");
    }
  }
  diagnostics.gapCandidateCount = candidates.length;

  const provisional: RegisteredOpeningGapEvidence[] = [];
  let bounded = false;
  const countCheck = () => {
    diagnostics.supportCheckCount += 1;
    if (diagnostics.supportCheckCount > maxSupportChecks) bounded = true;
    return !bounded;
  };
  for (const [index, candidate] of candidates.entries()) {
    const boundarySegmentIds = new Set([
      ...candidate.before.boundarySegmentIds,
      ...candidate.after.boundarySegmentIds,
    ]);
    const sourceSupport = findRegisteredSourceOpeningSupport(
      page,
      candidate,
      boundarySegmentIds,
      countCheck
    );
    for (const operation of ["swing", "sliding", "folding", "fixed"] as const) {
      diagnostics.sourceSymbolMatchCounts[operation] +=
        sourceSupport.matchCounts[operation];
    }
    if (bounded || sourceSupport.boundedOut) {
      return boundedOut("support_check_limit");
    }
    if (sourceSupport.ambiguous) {
      diagnostics.ambiguousGapCount += 1;
      continue;
    }
    const support = sourceSupport.support;
    if (!support) continue;
    const semantic = semanticForGap(page, candidate);
    provisional.push({
      id: `opening-gap-${page.pageNumber}-${index + 1}`,
      pageNumber: page.pageNumber,
      orientation: candidate.orientation,
      start: candidate.start,
      end: candidate.end,
      widthPx: candidate.widthPx,
      widthMm: candidate.widthMm,
      thicknessMm: candidate.thicknessMm,
      beforeCenterlineId: candidate.before.id,
      afterCenterlineId: candidate.after.id,
      kind: support.kind,
      operation: support.operation,
      proof: support.proof,
      confidence: support.confidence,
      supportPathIds: support.pathIds,
      supportSubpathIds: support.subpathIds,
      supportSegmentIds: support.segmentIds,
      supportCurveIds: support.curveIds,
      semanticEvidenceKind: semantic?.evidenceKind,
    });
  }

  const supportUse = new Map<string, number>();
  for (const gap of provisional) {
    const ids = new Set([
      ...gap.supportPathIds,
      ...gap.supportSubpathIds,
      ...gap.supportSegmentIds,
      ...gap.supportCurveIds,
    ]);
    for (const id of ids) {
      supportUse.set(id, (supportUse.get(id) ?? 0) + 1);
    }
  }
  const gaps = provisional.filter((gap) => {
    const ids = new Set([
      ...gap.supportPathIds,
      ...gap.supportSubpathIds,
      ...gap.supportSegmentIds,
      ...gap.supportCurveIds,
    ]);
    const ambiguous = [...ids].some((id) => (supportUse.get(id) ?? 0) > 1);
    if (ambiguous) diagnostics.ambiguousGapCount += 1;
    return !ambiguous;
  });
  diagnostics.supportedGapCount = gaps.length;
  return { gaps, diagnostics };
}
