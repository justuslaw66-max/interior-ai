export type SourcePointPx = { x: number; y: number };

export type SourceVectorSegment = {
  id: string;
  pageNumber: number;
  start: SourcePointPx;
  end: SourcePointPx;
  strokeWidthPx: number;
  /** Detector support, not a claim that the semantic meaning is verified. */
  confidence?: number;
  evidenceKind?: "pdf_vector" | "raster_linework";
  /** Stable PDF draw-subpath provenance; absent for raster-derived segments. */
  sourceSubpathId?: string;
  sourceCommandIndex?: number;
  sourceCommand?: "line" | "close";
};

export type SourceVectorCurveEvidence = {
  id: string;
  pageNumber: number;
  sourceSubpathId: string;
  sourceCommandIndex: number;
  command: "cubic" | "quadratic";
  start: SourcePointPx;
  controlPoints: SourcePointPx[];
  end: SourcePointPx;
};

export type SourceVectorSubpath = {
  id: string;
  index: number;
  closed: boolean;
  segmentIds: string[];
  curveIds: string[];
  bbox: { left: number; top: number; right: number; bottom: number };
};

export type SourceVectorPath = {
  id: string;
  pageNumber: number;
  closed: boolean;
  segmentIds: string[];
  bbox: { left: number; top: number; right: number; bottom: number };
  rectilinearScore: number;
  /** Detector support, not a claim that the path encloses a room. */
  confidence?: number;
  evidenceKind?: "pdf_vector" | "raster_linework";
  /** Curve controls were present; automatic straight-wall topology must reject it. */
  containsCurves?: boolean;
  /** PDF paint operator retained for deterministic layer/topology diagnostics. */
  paintOperation?:
    | "stroke"
    | "fill"
    | "fill_stroke"
    | "clip"
    | "unknown";
  /** Exact PDF operator/subpath context retained for source-symbol matching. */
  sourceOperatorIndex?: number;
  graphicsStateDepth?: number;
  sourceFormPath?: string[];
  sourceTransform?: Matrix2D;
  subpaths?: SourceVectorSubpath[];
  curves?: SourceVectorCurveEvidence[];
};

export type SourceTextEvidence = {
  id: string;
  pageNumber: number;
  text: string;
  center: SourcePointPx;
  widthPx: number;
  heightPx: number;
  evidenceKind?: "positioned_text" | "ocr";
};

export type SemanticRoomLabel = {
  label: string;
  roomType:
    | "living"
    | "dining"
    | "bedroom"
    | "kitchen"
    | "toilet"
    | "service_yard"
    | "shelter"
    | "study"
    | "other";
  centerXRatio: number;
  centerYRatio: number;
  confidence: number;
  evidenceKind?: "positioned_text" | "ocr" | "vision";
};

export type SemanticDimensionLabel = {
  valueMm: number;
  centerXRatio: number;
  centerYRatio: number;
  orientation: "horizontal" | "vertical" | "unknown";
  confidence: number;
  evidenceKind?: "positioned_text" | "ocr" | "vision";
};

export type SemanticOpeningSymbol = {
  kind: "door" | "window" | "open_passage" | "vent" | "louvre";
  operation: "swing" | "sliding" | "folding" | "fixed" | "open" | "unknown";
  centerXRatio: number;
  centerYRatio: number;
  confidence: number;
  evidenceKind?: "positioned_text" | "ocr" | "vision";
};

export type PageSemanticEvidence = {
  roomLabels: SemanticRoomLabel[];
  dimensionLabels: SemanticDimensionLabel[];
  openingSymbols: SemanticOpeningSymbol[];
  entrance?: {
    centerXRatio: number;
    centerYRatio: number;
    confidence: number;
    evidenceKind?: "positioned_text" | "ocr" | "vision";
  } | null;
  notes: string[];
};

export type RegisteredPageEvidence = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  vectorSegments: SourceVectorSegment[];
  vectorPaths: SourceVectorPath[];
  text: SourceTextEvidence[];
  semantics: PageSemanticEvidence;
};

export type SourceScaleSolution = {
  millimetresPerPixel: number;
  dimensionCount: number;
  rmsResidualMm: number;
  confidence: number;
  evidence: Array<{
    valueMm: number;
    observedLengthPx: number;
    residualMm: number;
    segmentId: string;
    start: SourcePointPx;
    end: SourcePointPx;
  }>;
};

export type RegisteredRoomBoundary = {
  key: string;
  label: string;
  roomType: SemanticRoomLabel["roomType"];
  confidence: number;
  pathId: string;
  bbox: SourceVectorPath["bbox"];
  /** Ordered source-space boundary. The bounding box is never used as geometry. */
  sourcePoints: SourcePointPx[];
  registrationKind?: "closed_source_path" | "assembled_wall_topology";
  sourceEdges?: Array<{
    evidenceId: string;
    kind: "wall_centerline" | "supported_opening_span";
    thicknessMm: number;
    sourcePathIds: string[];
    sourceSegmentIds: string[];
    opening?: {
      id: string;
      kind: "door" | "window";
      operation: "swing" | "sliding" | "folding" | "fixed";
      proof:
        | "swing_arc_and_leaf"
        | "sliding_staggered_panels"
        | "folding_connected_leaves"
        | "paired_fixed_frame_lines";
      widthMm: number;
      confidence: number;
      supportPathIds: string[];
      supportSubpathIds: string[];
      supportSegmentIds: string[];
      supportCurveIds: string[];
    };
  }>;
};

/** @deprecated Use RegisteredRoomBoundary. Retained for source compatibility. */
export type RegisteredRoomRect = RegisteredRoomBoundary;

const SEMANTIC_EVIDENCE_PRIOR = {
  positioned_text: 0.98,
  ocr: 0.72,
  vision: 0.55,
} as const;

export function semanticEvidencePrior(
  evidenceKind: keyof typeof SEMANTIC_EVIDENCE_PRIOR
) {
  return SEMANTIC_EVIDENCE_PRIOR[evidenceKind];
}

/**
 * Replaces a classifier's self-reported certainty with a platform-owned prior.
 * Geometry confidence is added later from registered linework and topology.
 */
export function applySemanticEvidencePrior(
  semantics: PageSemanticEvidence,
  evidenceKind: keyof typeof SEMANTIC_EVIDENCE_PRIOR
): PageSemanticEvidence {
  const confidence = semanticEvidencePrior(evidenceKind);
  return {
    roomLabels: semantics.roomLabels.map((item) => ({
      ...item,
      confidence,
      evidenceKind,
    })),
    dimensionLabels: semantics.dimensionLabels.map((item) => ({
      ...item,
      confidence,
      evidenceKind,
    })),
    openingSymbols: semantics.openingSymbols.map((item) => ({
      ...item,
      confidence,
      evidenceKind,
    })),
    entrance: semantics.entrance
      ? { ...semantics.entrance, confidence, evidenceKind }
      : null,
    notes: [...semantics.notes],
  };
}

export type Matrix2D = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

export function transformSourcePoint(matrix: Matrix2D, point: SourcePointPx): SourcePointPx {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

export function segmentLengthPx(segment: SourceVectorSegment) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function midpoint(segment: SourceVectorSegment): SourcePointPx {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

type DimensionCandidate = {
  dimensionIndex: number;
  valueMm: number;
  observedLengthPx: number;
  ratio: number;
  distancePx: number;
  segmentId: string;
  start: SourcePointPx;
  end: SourcePointPx;
};

/**
 * Solves scale only when at least two printed dimensions independently agree.
 * Semantic positions select nearby vector dimension lines; final scale comes
 * from the vector length and printed integer value, never a model coordinate.
 */
export function solveScaleFromRegisteredEvidence(
  page: RegisteredPageEvidence
): SourceScaleSolution | null {
  const dimensions = page.semantics.dimensionLabels.filter(
    (dimension) =>
      Number.isSafeInteger(dimension.valueMm) &&
      dimension.valueMm >= 100 &&
      dimension.valueMm <= 100_000 &&
      dimension.confidence >= 0.45
  );
  if (dimensions.length < 2 || page.vectorSegments.length === 0) return null;

  const pageDiagonal = Math.hypot(page.widthPx, page.heightPx);
  const candidates: DimensionCandidate[] = [];
  dimensions.forEach((dimension, dimensionIndex) => {
    const center = {
      x: dimension.centerXRatio * page.widthPx,
      y: dimension.centerYRatio * page.heightPx,
    };
    const ranked = page.vectorSegments
      .map((segment) => {
        const dx = Math.abs(segment.end.x - segment.start.x);
        const dy = Math.abs(segment.end.y - segment.start.y);
        const orientation = dx >= dy ? "horizontal" : "vertical";
        const lengthPx = segmentLengthPx(segment);
        const lineCenter = midpoint(segment);
        return {
          segment,
          orientation,
          lengthPx,
          distancePx: Math.hypot(lineCenter.x - center.x, lineCenter.y - center.y),
        };
      })
      .filter((entry) => {
        if (entry.lengthPx < pageDiagonal * 0.025) return false;
        if (entry.distancePx > pageDiagonal * 0.16) return false;
        return (
          dimension.orientation === "unknown" ||
          dimension.orientation === entry.orientation
        );
      })
      .sort((left, right) => left.distancePx - right.distancePx)
      .slice(0, 8);

    for (const entry of ranked) {
      const ratio = dimension.valueMm / entry.lengthPx;
      if (ratio < 0.05 || ratio > 500) continue;
      candidates.push({
        dimensionIndex,
        valueMm: dimension.valueMm,
        observedLengthPx: entry.lengthPx,
        ratio,
        distancePx: entry.distancePx,
        segmentId: entry.segment.id,
        start: entry.segment.start,
        end: entry.segment.end,
      });
    }
  });
  if (candidates.length < 2) return null;

  const clusters: Array<{
    candidates: DimensionCandidate[];
    distancePx: number;
    millimetresPerPixel: number;
    evidence: SourceScaleSolution["evidence"];
    rmsResidualMm: number;
    relativeResidual: number;
  }> = [];
  const localAnchorRadiusPx = pageDiagonal * 0.035;
  for (const center of candidates) {
    const cluster: DimensionCandidate[] = [];
    for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
      const match = candidates
        .filter((candidate) => candidate.dimensionIndex === dimensionIndex)
        .filter((candidate) => Math.abs(candidate.ratio / center.ratio - 1) <= 0.035)
        .sort((left, right) => left.distancePx - right.distancePx)[0];
      if (match) cluster.push(match);
    }
    // Printed dimensions are local annotations. Dense plans often repeat the
    // same lengths elsewhere, so distant ratio matches may support an already
    // local solution but can never establish one by themselves.
    const anchored = cluster.filter(
      (candidate) => candidate.distancePx <= localAnchorRadiusPx
    );
    if (anchored.length < 2) continue;
    const distance = anchored.reduce(
      (sum, candidate) => sum + candidate.distancePx,
      0
    );
    const millimetresPerPixel = median(
      anchored.map((candidate) => candidate.ratio)
    );
    const evidence = anchored.map((candidate) => {
      const residualMm =
        candidate.observedLengthPx * millimetresPerPixel - candidate.valueMm;
      return {
        valueMm: candidate.valueMm,
        observedLengthPx: candidate.observedLengthPx,
        residualMm,
        segmentId: candidate.segmentId,
        start: candidate.start,
        end: candidate.end,
      };
    });
    const rmsResidualMm = Math.sqrt(
      evidence.reduce((sum, item) => sum + item.residualMm ** 2, 0) /
        evidence.length
    );
    const relativeResidual =
      rmsResidualMm /
      Math.max(1, median(anchored.map((item) => item.valueMm)));
    if (relativeResidual > 0.02) continue;
    const equivalent = clusters.find(
      (entry) =>
        Math.abs(entry.millimetresPerPixel / millimetresPerPixel - 1) <= 0.035
    );
    if (
      !equivalent ||
      anchored.length > equivalent.candidates.length ||
      (anchored.length === equivalent.candidates.length &&
        distance < equivalent.distancePx)
    ) {
      if (equivalent) clusters.splice(clusters.indexOf(equivalent), 1);
      clusters.push({
        candidates: anchored,
        distancePx: distance,
        millimetresPerPixel,
        evidence,
        rmsResidualMm,
        relativeResidual,
      });
    }
  }
  clusters.sort(
    (left, right) =>
      right.candidates.length - left.candidates.length ||
      left.distancePx - right.distancePx
  );
  const best = clusters[0];
  if (!best) return null;
  const bestMeanDistancePx = best.distancePx / best.candidates.length;
  // A competing scale must have comparable independent support and be locally
  // anchored to its labels. Repeated lengths elsewhere in a dense plan are
  // distractors, not a second scale system. Two nearby, similarly supported
  // systems still fail closed because the page may contain multiple drawings.
  if (
    clusters.slice(1).some(
      (entry) => {
        const conflicting =
          Math.abs(entry.millimetresPerPixel / best.millimetresPerPixel - 1) >
          0.035;
        const comparableSupport =
          entry.candidates.length >=
          Math.max(2, Math.ceil(best.candidates.length * 0.6));
        const meanDistancePx = entry.distancePx / entry.candidates.length;
        const locallyAnchored =
          meanDistancePx <=
          Math.max(bestMeanDistancePx * 2.5, pageDiagonal * 0.025);
        return conflicting && comparableSupport && locallyAnchored;
      }
    )
  ) {
    return null;
  }
  return {
    millimetresPerPixel: best.millimetresPerPixel,
    dimensionCount: best.candidates.length,
    rmsResidualMm: best.rmsResidualMm,
    confidence: Math.max(
      0,
      Math.min(
        1,
        0.7 + best.candidates.length * 0.06 - best.relativeResidual * 5
      )
    ),
    evidence: best.evidence,
  };
}

function containsPoint(
  bbox: SourceVectorPath["bbox"],
  point: SourcePointPx,
  padding = 0
) {
  return (
    point.x >= bbox.left - padding &&
    point.x <= bbox.right + padding &&
    point.y >= bbox.top - padding &&
    point.y <= bbox.bottom + padding
  );
}

function pointsNear(left: SourcePointPx, right: SourcePointPx, tolerancePx: number) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerancePx;
}

function buildClosedSegmentChain(
  segments: SourceVectorSegment[],
  first: SourcePointPx,
  current: SourcePointPx,
  tolerancePx: number
) {
  const points = [first, current];
  const remaining = segments.slice(1);
  while (remaining.length > 0) {
    const matchIndex = remaining.findIndex(
      (segment) =>
        pointsNear(current, segment.start, tolerancePx) ||
        pointsNear(current, segment.end, tolerancePx)
    );
    if (matchIndex < 0) return null;
    const [match] = remaining.splice(matchIndex, 1);
    current = pointsNear(current, match.start, tolerancePx)
      ? match.end
      : match.start;
    points.push(current);
  }
  if (!pointsNear(points[points.length - 1], first, tolerancePx)) return null;
  points.pop();
  return points.length >= 3 ? points : null;
}

/**
 * Reconstructs the actual closed source path. Raster cycles are synthesized
 * from four proven axis-line intersections, while PDF vectors retain every
 * authored corner instead of being expanded to their bounding rectangle.
 */
export function sourcePointsForClosedPath(
  page: RegisteredPageEvidence,
  path: SourceVectorPath
): SourcePointPx[] | null {
  if (!path.closed) return null;
  if (path.containsCurves) return null;
  if (path.evidenceKind === "raster_linework") {
    return [
      { x: path.bbox.left, y: path.bbox.top },
      { x: path.bbox.right, y: path.bbox.top },
      { x: path.bbox.right, y: path.bbox.bottom },
      { x: path.bbox.left, y: path.bbox.bottom },
    ];
  }
  const segmentById = new Map(
    page.vectorSegments.map((segment) => [segment.id, segment])
  );
  const segments = path.segmentIds.map((id) => segmentById.get(id));
  if (segments.length < 3 || segments.some((segment) => !segment)) return null;
  const complete = segments as SourceVectorSegment[];
  const tolerancePx = Math.max(0.75, Math.hypot(page.widthPx, page.heightPx) * 0.00075);
  return (
    buildClosedSegmentChain(
      complete,
      complete[0].start,
      complete[0].end,
      tolerancePx
    ) ??
    buildClosedSegmentChain(
      complete,
      complete[0].end,
      complete[0].start,
      tolerancePx
    )
  );
}

export function pointInPolygon(point: SourcePointPx, polygon: SourcePointPx[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonFillRatio(
  points: SourcePointPx[],
  bbox: SourceVectorPath["bbox"]
) {
  const twiceArea = Math.abs(
    points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0)
  );
  const boxArea = Math.max(
    1,
    (bbox.right - bbox.left) * (bbox.bottom - bbox.top)
  );
  return twiceArea / 2 / boxArea;
}

/** Associates optional semantic names with trustworthy closed source boundaries. */
export function registerRoomBoundaries(
  page: RegisteredPageEvidence
): RegisteredRoomBoundary[] {
  const minWidth = page.widthPx * 0.055;
  const minHeight = page.heightPx * 0.045;
  const maxWidth = page.widthPx * 0.85;
  const maxHeight = page.heightPx * 0.85;
  const candidates = page.vectorPaths.flatMap((path) => {
    const width = path.bbox.right - path.bbox.left;
    const height = path.bbox.bottom - path.bbox.top;
    if (
      !path.closed ||
      path.containsCurves ||
      path.rectilinearScore < 0.8 ||
      (path.confidence ?? 1) < 0.68 ||
      width < minWidth ||
      height < minHeight ||
      width > maxWidth ||
      height > maxHeight
    ) return [];
    const sourcePoints = sourcePointsForClosedPath(page, path);
    return sourcePoints ? [{ path, sourcePoints }] : [];
  });

  const result: RegisteredRoomBoundary[] = [];
  const usedPaths = new Set<string>();
  for (const label of page.semantics.roomLabels.filter((entry) => entry.confidence >= 0.45)) {
    const center = {
      x: label.centerXRatio * page.widthPx,
      y: label.centerYRatio * page.heightPx,
    };
    const candidate = candidates
      .filter(
        (entry) =>
          containsPoint(entry.path.bbox, center, 3) &&
          pointInPolygon(center, entry.sourcePoints)
      )
      .sort((left, right) => {
        const leftArea =
          (left.path.bbox.right - left.path.bbox.left) *
          (left.path.bbox.bottom - left.path.bbox.top);
        const rightArea =
          (right.path.bbox.right - right.path.bbox.left) *
          (right.path.bbox.bottom - right.path.bbox.top);
        return leftArea - rightArea;
      })[0];
    const path = candidate?.path;
    if (!path || usedPaths.has(path.id)) continue;
    usedPaths.add(path.id);
    result.push({
      key: `room-${result.length + 1}`,
      label: label.label,
      roomType: label.roomType,
      confidence: Math.min(
        label.confidence,
        path.rectilinearScore,
        path.confidence ?? 1
      ),
      pathId: path.id,
      bbox: path.bbox,
      sourcePoints: candidate.sourcePoints,
      registrationKind: "closed_source_path",
    });
  }
  let genericRoomNumber = 1;
  for (const candidate of candidates) {
    if (usedPaths.has(candidate.path.id)) continue;
    // Unlabelled raster linework can be furniture, tiling or image noise. Only
    // source-authored vector paths may use the generic-name fallback; raster
    // plans remain available for guided tracing instead of inventing rooms.
    if (candidate.path.evidenceKind !== "pdf_vector") continue;
    // Thin closed wall footprints and frames are not room interiors. Labels
    // previously prevented their promotion; unlabeled rooms need this explicit
    // geometry-only guard.
    if (polygonFillRatio(candidate.sourcePoints, candidate.path.bbox) < 0.5) {
      continue;
    }
    usedPaths.add(candidate.path.id);
    result.push({
      key: `room-${result.length + 1}`,
      label: `Room ${genericRoomNumber}`,
      roomType: "other",
      confidence: Math.min(
        0.7,
        candidate.path.rectilinearScore,
        candidate.path.confidence ?? 1
      ),
      pathId: candidate.path.id,
      bbox: candidate.path.bbox,
      sourcePoints: candidate.sourcePoints,
      registrationKind: "closed_source_path",
    });
    genericRoomNumber += 1;
  }
  return result;
}

/** @deprecated Use registerRoomBoundaries. */
export const registerRoomRectangles = registerRoomBoundaries;
