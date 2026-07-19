import {
  pointInPolygon,
  type RegisteredPageEvidence,
  type SemanticRoomLabel,
  type SourcePointPx,
} from "./deterministic-evidence";
import type {
  RegisteredOpeningGapEvidence,
  RegisteredOpeningGapResult,
} from "./opening-gap-evidence";
import type { RegisteredWallFootprintBand } from "./topology-evidence";
import type {
  RegisteredWallCenterlineEvidence,
  RegisteredWallCenterlineResult,
} from "./wall-centerline-evidence";
import { assessRegisteredRoomCoverage } from "./room-topology-completeness";

const DEFAULT_MAX_RAW_EDGES = 4_096;
const DEFAULT_MAX_INTERSECTION_CHECKS = 300_000;
const DEFAULT_MAX_ATOMIC_EDGES = 12_000;
const DEFAULT_MAX_HALF_EDGE_STEPS = 100_000;

export type RegisteredPlanarFaceEdge = {
  evidenceId: string;
  kind: "wall_centerline" | "supported_opening_span";
  thicknessMm: number;
  sourcePathIds: string[];
  sourceSegmentIds: string[];
  openingGapId?: string;
};

export type RegisteredPlanarFaceEvidence = {
  id: string;
  pageNumber: number;
  label: string;
  roomType: SemanticRoomLabel["roomType"];
  confidence: number;
  sourcePoints: SourcePointPx[];
  edges: RegisteredPlanarFaceEdge[];
};

export type PlanarFaceDiagnostics = {
  status: "complete" | "bounded_out" | "ambiguous";
  limitReason: string | null;
  rawEdgeCount: number;
  intersectionCheckCount: number;
  atomicEdgeCount: number;
  closedFaceCount: number;
  registeredFaceCount: number;
  registeredAtomicEdgeCount: number;
  unusedAtomicEdgeCount: number;
  ambiguousEdgeCount: number;
  maxSnapResidualPx: number;
};

export type RegisteredPlanarFaceResult = {
  faces: RegisteredPlanarFaceEvidence[];
  diagnostics: PlanarFaceDiagnostics;
};

type RawEdge = {
  id: string;
  kind: RegisteredPlanarFaceEdge["kind"];
  orientation: "horizontal" | "vertical";
  start: SourcePointPx;
  end: SourcePointPx;
  thicknessMm: number;
  confidence: number;
  sourcePathIds: string[];
  sourceSegmentIds: string[];
  openingGapId?: string;
};

type AtomicEdge = RawEdge & { vertexA: string; vertexB: string };

function pointKey(point: SourcePointPx) {
  return `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
}

function edgeKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function signedArea(points: SourcePointPx[]) {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function normalizedRawEdges(
  page: RegisteredPageEvidence,
  centerlines: RegisteredWallCenterlineEvidence[],
  gaps: RegisteredOpeningGapEvidence[],
  tolerancePx: number,
  diagnostics: PlanarFaceDiagnostics
) {
  const raw: RawEdge[] = [
    ...centerlines.map((centerline) => ({
      id: centerline.id,
      kind: "wall_centerline" as const,
      orientation: centerline.orientation,
      start: centerline.start,
      end: centerline.end,
      thicknessMm: centerline.thicknessMm,
      confidence: centerline.confidence,
      sourcePathIds: [centerline.pathId],
      sourceSegmentIds: centerline.boundarySegmentIds,
    })),
    ...gaps.map((gap) => ({
      id: gap.id,
      kind: "supported_opening_span" as const,
      orientation: gap.orientation,
      start: gap.start,
      end: gap.end,
      thicknessMm: gap.thicknessMm,
      confidence: gap.confidence,
      sourcePathIds: gap.supportPathIds,
      sourceSegmentIds: gap.supportSegmentIds,
      openingGapId: gap.id,
    })),
  ];
  const groups: RawEdge[][] = [];
  for (const edge of raw) {
    const dx = Math.abs(edge.end.x - edge.start.x);
    const dy = Math.abs(edge.end.y - edge.start.y);
    if (
      (edge.orientation === "horizontal" && dy > tolerancePx) ||
      (edge.orientation === "vertical" && dx > tolerancePx)
    ) {
      return null;
    }
    const constant = edge.orientation === "horizontal" ? edge.start.y : edge.start.x;
    const group = groups.find((items) => {
      const first = items[0];
      const firstConstant =
        first.orientation === "horizontal" ? first.start.y : first.start.x;
      return first.orientation === edge.orientation && Math.abs(firstConstant - constant) <= tolerancePx;
    });
    if (group) group.push(edge);
    else groups.push([edge]);
  }
  for (const group of groups) {
    const orientation = group[0].orientation;
    const constant =
      group.reduce(
        (sum, edge) =>
          sum + (orientation === "horizontal" ? edge.start.y : edge.start.x),
        0
      ) / group.length;
    for (const edge of group) {
      const original = orientation === "horizontal" ? edge.start.y : edge.start.x;
      diagnostics.maxSnapResidualPx = Math.max(
        diagnostics.maxSnapResidualPx,
        Math.abs(original - constant)
      );
      if (orientation === "horizontal") {
        edge.start = { x: Math.min(edge.start.x, edge.end.x), y: constant };
        edge.end = { x: Math.max(edge.start.x, edge.end.x), y: constant };
      } else {
        edge.start = { x: constant, y: Math.min(edge.start.y, edge.end.y) };
        edge.end = { x: constant, y: Math.max(edge.start.y, edge.end.y) };
      }
    }
  }
  diagnostics.rawEdgeCount = raw.length;
  return raw;
}

function splitEdges(
  raw: RawEdge[],
  diagnostics: PlanarFaceDiagnostics,
  maxIntersectionChecks: number,
  maxAtomicEdges: number,
  tolerancePx: number
) {
  const splitValues = new Map<string, number[]>();
  for (const edge of raw) {
    splitValues.set(
      edge.id,
      edge.orientation === "horizontal"
        ? [edge.start.x, edge.end.x]
        : [edge.start.y, edge.end.y]
    );
  }
  for (let leftIndex = 0; leftIndex < raw.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < raw.length; rightIndex += 1) {
      diagnostics.intersectionCheckCount += 1;
      if (diagnostics.intersectionCheckCount > maxIntersectionChecks) return null;
      const left = raw[leftIndex];
      const right = raw[rightIndex];
      if (left.orientation === right.orientation) {
        const sameConstant =
          left.orientation === "horizontal"
            ? Math.abs(left.start.y - right.start.y) <= tolerancePx
            : Math.abs(left.start.x - right.start.x) <= tolerancePx;
        if (!sameConstant) continue;
        const leftFrom = left.orientation === "horizontal" ? left.start.x : left.start.y;
        const leftTo = left.orientation === "horizontal" ? left.end.x : left.end.y;
        const rightFrom = right.orientation === "horizontal" ? right.start.x : right.start.y;
        const rightTo = right.orientation === "horizontal" ? right.end.x : right.end.y;
        for (const value of [leftFrom, leftTo]) {
          if (value > rightFrom + tolerancePx && value < rightTo - tolerancePx) {
            splitValues.get(right.id)!.push(value);
          }
        }
        for (const value of [rightFrom, rightTo]) {
          if (value > leftFrom + tolerancePx && value < leftTo - tolerancePx) {
            splitValues.get(left.id)!.push(value);
          }
        }
        continue;
      }
      const horizontal = left.orientation === "horizontal" ? left : right;
      const vertical = left.orientation === "vertical" ? left : right;
      const x = vertical.start.x;
      const y = horizontal.start.y;
      if (
        x >= horizontal.start.x - tolerancePx &&
        x <= horizontal.end.x + tolerancePx &&
        y >= vertical.start.y - tolerancePx &&
        y <= vertical.end.y + tolerancePx
      ) {
        splitValues.get(horizontal.id)!.push(x);
        splitValues.get(vertical.id)!.push(y);
      }
    }
  }

  const atomicByKey = new Map<string, AtomicEdge>();
  for (const edge of raw) {
    const values = [...new Set(splitValues.get(edge.id)!.map((value) => value.toFixed(3)))]
      .map(Number)
      .sort((left, right) => left - right);
    for (let index = 0; index < values.length - 1; index += 1) {
      const from = values[index];
      const to = values[index + 1];
      if (to - from <= tolerancePx) continue;
      const start =
        edge.orientation === "horizontal"
          ? { x: from, y: edge.start.y }
          : { x: edge.start.x, y: from };
      const end =
        edge.orientation === "horizontal"
          ? { x: to, y: edge.start.y }
          : { x: edge.start.x, y: to };
      const vertexA = pointKey(start);
      const vertexB = pointKey(end);
      const key = edgeKey(vertexA, vertexB);
      const existing = atomicByKey.get(key);
      if (existing) {
        const incompatible =
          existing.kind !== edge.kind ||
          Math.abs(existing.thicknessMm - edge.thicknessMm) > 20;
        if (incompatible) {
          diagnostics.ambiguousEdgeCount += 1;
          return null;
        }
        existing.sourcePathIds = [
          ...new Set([...existing.sourcePathIds, ...edge.sourcePathIds]),
        ].sort();
        existing.sourceSegmentIds = [
          ...new Set([...existing.sourceSegmentIds, ...edge.sourceSegmentIds]),
        ].sort();
        existing.confidence = Math.min(existing.confidence, edge.confidence);
        continue;
      }
      atomicByKey.set(key, { ...edge, start, end, vertexA, vertexB });
      if (atomicByKey.size > maxAtomicEdges) return null;
    }
  }
  diagnostics.atomicEdgeCount = atomicByKey.size;
  return atomicByKey;
}

/** Assembles only mathematically closed planar faces from proven edge spans. */
export function assembleRegisteredPlanarFaces(
  page: RegisteredPageEvidence,
  centerlines: RegisteredWallCenterlineEvidence[],
  gaps: RegisteredOpeningGapEvidence[],
  options: {
    maxRawEdges?: number;
    maxIntersectionChecks?: number;
    maxAtomicEdges?: number;
    maxHalfEdgeSteps?: number;
  } = {}
): RegisteredPlanarFaceResult {
  const maxRawEdges = options.maxRawEdges ?? DEFAULT_MAX_RAW_EDGES;
  const maxIntersectionChecks =
    options.maxIntersectionChecks ?? DEFAULT_MAX_INTERSECTION_CHECKS;
  const maxAtomicEdges = options.maxAtomicEdges ?? DEFAULT_MAX_ATOMIC_EDGES;
  const maxHalfEdgeSteps =
    options.maxHalfEdgeSteps ?? DEFAULT_MAX_HALF_EDGE_STEPS;
  const diagnostics: PlanarFaceDiagnostics = {
    status: "complete",
    limitReason: null,
    rawEdgeCount: 0,
    intersectionCheckCount: 0,
    atomicEdgeCount: 0,
    closedFaceCount: 0,
    registeredFaceCount: 0,
    registeredAtomicEdgeCount: 0,
    unusedAtomicEdgeCount: 0,
    ambiguousEdgeCount: 0,
    maxSnapResidualPx: 0,
  };
  const fail = (
    status: PlanarFaceDiagnostics["status"],
    reason: string
  ): RegisteredPlanarFaceResult => ({
    faces: [],
    diagnostics: { ...diagnostics, status, limitReason: reason },
  });
  if (centerlines.length + gaps.length > maxRawEdges) {
    return fail("bounded_out", "raw_edge_limit");
  }
  const tolerancePx = Math.max(
    0.25,
    Math.hypot(page.widthPx, page.heightPx) * 0.00015
  );
  const raw = normalizedRawEdges(page, centerlines, gaps, tolerancePx, diagnostics);
  if (!raw) return fail("ambiguous", "non_axis_aligned_edge");
  const atomic = splitEdges(
    raw,
    diagnostics,
    maxIntersectionChecks,
    maxAtomicEdges,
    tolerancePx
  );
  if (!atomic) {
    return fail(
      diagnostics.intersectionCheckCount > maxIntersectionChecks ||
        diagnostics.atomicEdgeCount > maxAtomicEdges
        ? "bounded_out"
        : "ambiguous",
      diagnostics.intersectionCheckCount > maxIntersectionChecks
        ? "intersection_check_limit"
        : diagnostics.atomicEdgeCount > maxAtomicEdges
          ? "atomic_edge_limit"
          : "overlapping_edge_conflict"
    );
  }

  const points = new Map<string, SourcePointPx>();
  const adjacency = new Map<string, string[]>();
  for (const edge of atomic.values()) {
    points.set(edge.vertexA, edge.start);
    points.set(edge.vertexB, edge.end);
    adjacency.set(edge.vertexA, [...(adjacency.get(edge.vertexA) ?? []), edge.vertexB]);
    adjacency.set(edge.vertexB, [...(adjacency.get(edge.vertexB) ?? []), edge.vertexA]);
  }
  for (const [vertex, neighbours] of adjacency) {
    const origin = points.get(vertex)!;
    adjacency.set(
      vertex,
      [...new Set(neighbours)].sort((left, right) => {
        const leftPoint = points.get(left)!;
        const rightPoint = points.get(right)!;
        return (
          Math.atan2(leftPoint.y - origin.y, leftPoint.x - origin.x) -
          Math.atan2(rightPoint.y - origin.y, rightPoint.x - origin.x)
        );
      })
    );
  }

  const visited = new Set<string>();
  const cycles: Array<{ points: SourcePointPx[]; edges: AtomicEdge[] }> = [];
  let halfEdgeSteps = 0;
  for (const edge of atomic.values()) {
    for (const [start, end] of [
      [edge.vertexA, edge.vertexB],
      [edge.vertexB, edge.vertexA],
    ] as const) {
      const initial = `${start}>${end}`;
      if (visited.has(initial)) continue;
      const cycleVertices: string[] = [];
      const cycleEdges: AtomicEdge[] = [];
      let previous = start;
      let current = end;
      let closed = false;
      while (true) {
        halfEdgeSteps += 1;
        if (halfEdgeSteps > maxHalfEdgeSteps) {
          return fail("bounded_out", "half_edge_step_limit");
        }
        const directed = `${previous}>${current}`;
        if (visited.has(directed)) break;
        visited.add(directed);
        cycleVertices.push(previous);
        const atom = atomic.get(edgeKey(previous, current));
        if (!atom) break;
        cycleEdges.push(atom);
        const neighbours = adjacency.get(current) ?? [];
        const reverseIndex = neighbours.indexOf(previous);
        if (reverseIndex < 0 || neighbours.length < 2) break;
        const next = neighbours[(reverseIndex - 1 + neighbours.length) % neighbours.length];
        previous = current;
        current = next;
        if (previous === start && current === end) {
          closed = true;
          break;
        }
        if (cycleVertices.length > atomic.size + 1) break;
      }
      if (!closed || new Set(cycleVertices).size !== cycleVertices.length) continue;
      const cyclePoints = cycleVertices.map((vertex) => points.get(vertex)!);
      if (cyclePoints.length < 3 || signedArea(cyclePoints) <= tolerancePx ** 2) continue;
      cycles.push({ points: cyclePoints, edges: cycleEdges });
    }
  }
  diagnostics.closedFaceCount = cycles.length;
  const minWidth = page.widthPx * 0.055;
  const minHeight = page.heightPx * 0.045;
  const maxWidth = page.widthPx * 0.85;
  const maxHeight = page.heightPx * 0.85;
  const faces: RegisteredPlanarFaceEvidence[] = [];
  const registeredAtomicEdges = new Set<string>();
  for (const cycle of cycles) {
    const bbox = {
      left: Math.min(...cycle.points.map((point) => point.x)),
      right: Math.max(...cycle.points.map((point) => point.x)),
      top: Math.min(...cycle.points.map((point) => point.y)),
      bottom: Math.max(...cycle.points.map((point) => point.y)),
    };
    const width = bbox.right - bbox.left;
    const height = bbox.bottom - bbox.top;
    if (
      width < minWidth ||
      height < minHeight ||
      width > maxWidth ||
      height > maxHeight
    ) continue;
    const labels = page.semantics.roomLabels.filter((label) => {
      if (label.confidence < 0.45) return false;
      return pointInPolygon(
        {
          x: label.centerXRatio * page.widthPx,
          y: label.centerYRatio * page.heightPx,
        },
        cycle.points
      );
    });
    if (labels.length > 1) continue;
    const label = labels[0];
    const genericRoomNumber = faces.filter((face) => face.roomType === "other").length + 1;
    faces.push({
      id: `registered-face-${page.pageNumber}-${faces.length + 1}`,
      pageNumber: page.pageNumber,
      label: label?.label ?? `Room ${genericRoomNumber}`,
      roomType: label?.roomType ?? "other",
      confidence: Math.min(
        label?.confidence ?? 0.7,
        ...cycle.edges.map((edge) => edge.confidence)
      ),
      sourcePoints: cycle.points,
      edges: cycle.edges.map((edge) => ({
        evidenceId: edge.id,
        kind: edge.kind,
        thicknessMm: edge.thicknessMm,
        sourcePathIds: edge.sourcePathIds,
        sourceSegmentIds: edge.sourceSegmentIds,
        openingGapId: edge.openingGapId,
      })),
    });
    for (const edge of cycle.edges) {
      registeredAtomicEdges.add(edgeKey(edge.vertexA, edge.vertexB));
    }
  }
  diagnostics.registeredFaceCount = faces.length;
  diagnostics.registeredAtomicEdgeCount = registeredAtomicEdges.size;
  diagnostics.unusedAtomicEdgeCount = Math.max(
    0,
    atomic.size - registeredAtomicEdges.size
  );
  return { faces, diagnostics };
}

export type RegisteredTopologyCompleteness = {
  complete: boolean;
  blockers: string[];
};

/**
 * Applies the all-or-nothing promotion gate. A few proven faces are retained
 * as review evidence but cannot become canonical rooms while any labelled
 * space, wall band, edge or plausible opening gap remains unaccounted for.
 */
export function assessRegisteredTopologyCompleteness(
  page: RegisteredPageEvidence,
  bands: RegisteredWallFootprintBand[],
  centerlines: RegisteredWallCenterlineResult,
  openingGaps: RegisteredOpeningGapResult,
  planarFaces: RegisteredPlanarFaceResult
): RegisteredTopologyCompleteness {
  const blockers: string[] = [];
  if (centerlines.diagnostics.status !== "complete") {
    blockers.push("centerline_search_incomplete");
  }
  if (openingGaps.diagnostics.status !== "complete") {
    blockers.push("opening_search_incomplete");
  }
  if (planarFaces.diagnostics.status !== "complete") {
    blockers.push("face_search_incomplete");
  }
  blockers.push(...assessRegisteredRoomCoverage(page, planarFaces.faces).blockers);
  if (planarFaces.diagnostics.unusedAtomicEdgeCount > 0) {
    blockers.push("unused_registered_edges");
  }
  if (
    openingGaps.diagnostics.supportedGapCount !==
    openingGaps.diagnostics.gapCandidateCount
  ) {
    blockers.push("unsupported_opening_gaps");
  }
  if (openingGaps.diagnostics.ambiguousGapCount > 0) {
    blockers.push("ambiguous_opening_support");
  }
  const pairedPathIds = new Set(
    centerlines.centerlines.map((centerline) => centerline.pathId)
  );
  if (bands.some((band) => !pairedPathIds.has(band.pathId))) {
    blockers.push("unpaired_wall_bands");
  }
  return { complete: blockers.length === 0, blockers: [...new Set(blockers)] };
}
