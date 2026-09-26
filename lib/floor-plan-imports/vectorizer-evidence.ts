import { createHash } from "node:crypto";
import {
  pointInPolygon,
  semanticEvidencePrior,
  type PageSemanticEvidence,
  type RegisteredPageEvidence,
  type RegisteredRoomBoundary,
  type SemanticRoomLabel,
  type SourcePointPx,
} from "./deterministic-evidence";
import type { RasterDimensionAssociation } from "./raster-dimension-spans";
import type { FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

/**
 * Local floor-plan vectorizer evidence.
 *
 * The vectorizer is a Python program (services/floorplan-vectorizer) that reads
 * one rendered plan page and reports what is drawn on it: room names, printed
 * dimensions with the two points each one measures, doors / windows / doorways
 * as jamb-to-jamb spans, sanitary fixtures, and closed rooms as wall
 * centre-line polygons with measured wall thickness. Nothing leaves the
 * machine. Its output is evidence like any other: scale is still solved and
 * cross-checked by the adapter, and every entity still goes to review.
 */

export {
  VECTORIZER_EVIDENCE_KIND,
  parseFloorPlanVectorizerEvidence,
  type FloorPlanVectorizerEvidence,
} from "./vectorizer-evidence-schema";
export {
  PythonFloorPlanVectorizerProvider,
  createDefaultFloorPlanVectorizerProvider,
  floorPlanVectorizerRuntimeConfiguration,
  type FloorPlanVectorizerPage,
  type FloorPlanVectorizerProvider,
} from "./vectorizer-provider";
export {
  VECTORIZER_SCALE_ESTIMATE_CONFIGURATION,
  vectorizerScaleEstimate,
  vectorizerScaleEstimateAnnotations,
  vectorizerScaleEstimateMessage,
} from "./vectorizer-scale-estimate";

export type RegisteredVectorizerEvidence = {
  exporterVersion: string;
  imageSha256: string;
  scaleHint: FloorPlanVectorizerEvidence["scale"];
  /** Index into `semantics.dimensionLabels` → the measured span, rendered-page pixels. */
  dimensionSpans: Array<{ labelIndex: number; valueMm: number; start: SourcePointPx; end: SourcePointPx }>;
  wallEdges: FloorPlanVectorizerEvidence["wallEdges"];
  rooms: FloorPlanVectorizerEvidence["rooms"];
  diagnostics: FloorPlanVectorizerEvidence["diagnostics"];
};


const scalePoint = (value: readonly [number, number], sx: number, sy: number): SourcePointPx => ({
  x: value[0] * sx,
  y: value[1] * sy,
});

type ScaledPoint = [number, number];

const scalePair = (value: readonly [readonly [number, number], readonly [number, number]], sx: number, sy: number) =>
  [
    [value[0][0] * sx, value[0][1] * sy],
    [value[1][0] * sx, value[1][1] * sy],
  ] as [ScaledPoint, ScaledPoint];

/** The vectorizer's observations as ordinary page semantics, confidence capped by the platform prior. */
function vectorizerSemantics(evidence: FloorPlanVectorizerEvidence): PageSemanticEvidence {
  const kind = "vectorizer" as const;
  // The platform prior is a ceiling; an item the vectorizer itself doubts keeps its lower value.
  const ceiling = semanticEvidencePrior(kind);
  const capped = <T extends { confidence: number }>(item: T): T => ({
    ...item,
    confidence: Math.min(item.confidence, ceiling),
  });
  return {
    planRegion: evidence.semantics.planRegion
      ? { ...capped(evidence.semantics.planRegion), evidenceKind: kind }
      : null,
    unitSystem: evidence.semantics.dimensionLabels.length ? "metric_mm" : "unknown",
    roomLabels: evidence.semantics.roomLabels.map((label) => ({
      ...capped(label),
      rawText: label.label,
      evidenceKind: kind,
    })),
    // Rooms travel as registered wall topology, not as approximate proposals
    // for the vision-guided snapper.
    roomBoundaries: [],
    dimensionLabels: evidence.semantics.dimensionLabels.map(
      ({ spanSourcePx, ...label }) => ({
        ...capped(label),
        extensionEvidenceKind: kind,
        evidenceKind: kind,
        ...(spanSourcePx ? {} : { unpaired: true }),
      })
    ),
    openingSymbols: evidence.semantics.openingSymbols.map((symbol) => ({
      ...capped(symbol),
      evidenceKind: kind,
    })),
    fixtureSymbols: evidence.semantics.fixtureSymbols.map((fixture) => ({
      ...capped(fixture),
      evidenceKind: kind,
    })),
    entrance: null,
    notes: evidence.semantics.notes,
  };
}

/** Spans, wall edges and rooms in rendered-page pixels, for the scale and topology stages. */
function registeredVectorizerEvidence(
  evidence: FloorPlanVectorizerEvidence,
  imageBytes: Uint8Array,
  sx: number,
  sy: number
): RegisteredVectorizerEvidence {
  const estimate = evidence.scale.estimate;
  return {
    exporterVersion: evidence.exporterVersion,
    imageSha256: createHash("sha256").update(imageBytes).digest("hex"),
    scaleHint: {
      ...evidence.scale,
      estimate: estimate
        ? {
            ...estimate,
            doorOpenings: estimate.doorOpenings.map((door) => ({ ...door, sourcePx: scalePair(door.sourcePx, sx, sy) })),
          }
        : null,
    },
    dimensionSpans: evidence.semantics.dimensionLabels.flatMap((label, labelIndex) => label.spanSourcePx ? [{
      labelIndex,
      valueMm: label.valueMm,
      start: scalePoint(label.spanSourcePx[0], sx, sy),
      end: scalePoint(label.spanSourcePx[1], sx, sy),
    }] : []),
    wallEdges: evidence.wallEdges.map((edge) => ({ ...edge, sourcePx: scalePair(edge.sourcePx, sx, sy) })),
    rooms: evidence.rooms.map((room) => ({
      ...room,
      sourcePoints: room.sourcePoints.map((value) => ({ x: value.x * sx, y: value.y * sy })),
    })),
    diagnostics: evidence.diagnostics,
  };
}

/**
 * Registers vectorizer output on a page. Semantic observations are returned
 * for the adapter's ordinary `mergeSemantics`; spans, wall edges and rooms are
 * kept on the page for the scale and topology stages. The analysed image must
 * be the page's rendered derivative, so positions are rendered-page pixels.
 */
export function registerVectorizerEvidence(
  page: RegisteredPageEvidence,
  evidence: FloorPlanVectorizerEvidence,
  imageBytes: Uint8Array
): PageSemanticEvidence {
  const sx = page.widthPx / evidence.page.widthPx;
  const sy = page.heightPx / evidence.page.heightPx;
  if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02) {
    throw new Error("Vectorizer evidence does not belong to the registered page image.");
  }
  page.vectorizer = registeredVectorizerEvidence(evidence, imageBytes, sx, sy);
  return vectorizerSemantics(evidence);
}

type VectorizerSpan = RegisteredVectorizerEvidence["dimensionSpans"][number];

/**
 * Semantics were merged after registration, so a span finds its dimension
 * again by value and extension points rather than by its original index.
 */
function vectorizerLabelIndex(page: RegisteredPageEvidence, span: VectorizerSpan): number {
  const center = { x: (span.start.x + span.end.x) / 2, y: (span.start.y + span.end.y) / 2 };
  return page.semantics.dimensionLabels.findIndex(
    (label) =>
      (label.evidenceKind === "vectorizer" || label.extensionEvidenceKind === "vectorizer") &&
      label.valueMm === span.valueMm &&
      label.extensionStart !== undefined &&
      label.extensionEnd !== undefined &&
      Math.hypot(
        ((label.extensionStart.xRatio + label.extensionEnd.xRatio) / 2) * page.widthPx - center.x,
        ((label.extensionStart.yRatio + label.extensionEnd.yRatio) / 2) * page.heightPx - center.y
      ) <= 2
  );
}

function sourceSupportedObservation(
  page: RegisteredPageEvidence,
  labelIndex: number,
  span: VectorizerSpan
): RasterDimensionAssociation | null {
  const label = page.semantics.dimensionLabels[labelIndex];
  if (!label?.extensionStart || !label.extensionEnd) return null;
  return {
    labelIndex,
    valueMm: label.valueMm,
    hintStart: { x: label.extensionStart.xRatio * page.widthPx, y: label.extensionStart.yRatio * page.heightPx },
    hintEnd: { x: label.extensionEnd.xRatio * page.widthPx, y: label.extensionEnd.yRatio * page.heightPx },
    start: span.start,
    end: span.end,
    lineCoverage: 1,
    status: "source_supported",
    reason: null,
  };
}

/**
 * The adapter's own tick search stays authoritative. Where it could not
 * support a printed dimension, the span the vectorizer measured between that
 * dimension's two stops stands in, so the same cross-checked solver decides.
 */
export function mergeVectorizerDimensionSpans(page: RegisteredPageEvidence) {
  const registered = page.vectorizer;
  if (!registered?.dimensionSpans.length) return 0;
  const observations: RasterDimensionAssociation[] = [
    ...(page.dimensionSpanEvidence?.observations ?? []),
  ];
  let added = 0;
  const hint = registered.scaleHint.basis === "explicit_dimension" ? registered.scaleHint.millimetresPerPixel : null;
  for (const span of registered.dimensionSpans) {
    // Only spans that agree with their printed number to two pixels are offered as source-supported; a looser span
    // would be reported by the cross-check as a conflict and sink an otherwise good scale.
    const lengthPx = Math.hypot(span.end.x - span.start.x, span.end.y - span.start.y);
    if (!hint || Math.abs(span.valueMm / hint - lengthPx) > 2) continue;
    const labelIndex = vectorizerLabelIndex(page, span);
    const observation = sourceSupportedObservation(page, labelIndex, span);
    if (!observation) continue;
    const existing = observations.findIndex((entry) => entry.labelIndex === labelIndex);
    if (existing >= 0 && observations[existing].status === "source_supported") continue;
    if (existing >= 0) observations[existing] = observation;
    else observations.push(observation);
    added += 1;
  }
  if (added) {
    page.dimensionSpanEvidence = {
      coordinateSpace: "rendered_px",
      imageSha256: page.dimensionSpanEvidence?.imageSha256 ?? registered.imageSha256,
      observations,
    };
  }
  return added;
}

function labelsInside(page: RegisteredPageEvidence, polygon: SourcePointPx[]): SemanticRoomLabel[] {
  return page.semantics.roomLabels.filter(
    (label) =>
      label.confidence >= 0.45 &&
      pointInPolygon(
        { x: label.centerXRatio * page.widthPx, y: label.centerYRatio * page.heightPx },
        polygon
      )
  );
}

type VectorizerWallEdge = RegisteredVectorizerEvidence["wallEdges"][number];
type RegisteredSourceEdge = NonNullable<RegisteredRoomBoundary["sourceEdges"]>[number];

const asPoint = (value: readonly [number, number] | null | undefined): SourcePointPx | undefined =>
  value ? { x: value[0], y: value[1] } : undefined;

/** A drawn door, window or doorway on a wall edge, measured jamb to jamb with the accepted scale. */
function registeredOpening(edge: VectorizerWallEdge, millimetresPerPixel: number): RegisteredSourceEdge["opening"] {
  if (!edge.opening) return undefined;
  const widthPx = Math.hypot(edge.sourcePx[1][0] - edge.sourcePx[0][0], edge.sourcePx[1][1] - edge.sourcePx[0][1]);
  return {
    id: `vectorizer:${edge.id}`,
    kind: edge.opening.kind,
    operation: edge.opening.operation,
    proof: "vectorizer_drawn_symbol" as const,
    widthMm: Math.round(widthPx * millimetresPerPixel),
    confidence: edge.opening.confidence,
    supportPathIds: [],
    supportSubpathIds: [],
    supportSegmentIds: [],
    supportCurveIds: [],
    hingeSourcePx: asPoint(edge.opening.hingeSourcePx),
    swingTowardSourcePx: asPoint(edge.opening.swingTowardSourcePx),
    double: edge.opening.handing === "double",
  };
}

/** A wall edge with its measured thickness, converted with the adapter's accepted scale. */
function registeredSourceEdge(edge: VectorizerWallEdge, millimetresPerPixel: number): RegisteredSourceEdge {
  const thicknessMm = Math.max(40, Math.min(600, Math.round((edge.thicknessPx * millimetresPerPixel) / 5) * 5));
  return {
    evidenceId: `vectorizer:${edge.id}`,
    kind: edge.kind,
    thicknessMm,
    sourcePathIds: [],
    sourceSegmentIds: [],
    opening: registeredOpening(edge, millimetresPerPixel),
  };
}

/**
 * Vectorizer rooms as registered boundaries: wall centre-line polygons whose
 * every side carries measured thickness and, where a door, window or doorway
 * stands in it, that opening. Thickness is converted with the adapter's
 * accepted scale, never with the vectorizer's own.
 */
export function vectorizerRoomBoundaries(
  page: RegisteredPageEvidence,
  millimetresPerPixel: number
): RegisteredRoomBoundary[] {
  const registered = page.vectorizer;
  if (!registered) return [];
  const edgeById = new Map(registered.wallEdges.map((edge) => [edge.id, edge]));
  return registered.rooms.flatMap((room, index): RegisteredRoomBoundary[] => {
    if (room.edgeIds.length !== room.sourcePoints.length) return [];
    const edges = room.edgeIds.map((id) => edgeById.get(id));
    if (edges.some((edge) => !edge)) return [];
    const sourceLabels = labelsInside(page, room.sourcePoints);
    const xs = room.sourcePoints.map((value) => value.x);
    const ys = room.sourcePoints.map((value) => value.y);
    const named = sourceLabels[0];
    return [
      {
        key: `room-${index + 1}`,
        label: named?.label ?? (room.label || `Room ${index + 1}`),
        roomType: named?.roomType ?? room.roomType,
        confidence: room.confidence,
        pathId: `vectorizer:${room.key}`,
        bbox: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) },
        sourcePoints: room.sourcePoints,
        sourceLabels,
        registrationKind: "vectorizer_wall_topology",
        sourceEdges: edges.map((edge) => registeredSourceEdge(edge!, millimetresPerPixel)),
      },
    ];
  });
}

/**
 * Hinge end and handing of a swing door against the direction of the wall that
 * hosts it (`left` swings towards (-dz, dx) of start → end, as the opening
 * primitives draw it).
 */
export function swingAgainstWall(
  wallStart: SourcePointPx,
  wallEnd: SourcePointPx,
  opening: { hingeSourcePx?: SourcePointPx; swingTowardSourcePx?: SourcePointPx; double?: boolean }
): { hinge: "start" | "end" | "none" | "unknown"; handing: "left" | "right" | "double" | "unknown" } {
  if (opening.double) return { hinge: "none", handing: "double" };
  if (!opening.hingeSourcePx || !opening.swingTowardSourcePx) {
    return { hinge: "unknown", handing: "unknown" };
  }
  const distance = (a: SourcePointPx, b: SourcePointPx) => Math.hypot(a.x - b.x, a.y - b.y);
  const hinge =
    distance(opening.hingeSourcePx, wallStart) <= distance(opening.hingeSourcePx, wallEnd)
      ? "start"
      : "end";
  const dx = wallEnd.x - wallStart.x;
  const dz = wallEnd.y - wallStart.y;
  const side =
    -dz * (opening.swingTowardSourcePx.x - opening.hingeSourcePx.x) +
    dx * (opening.swingTowardSourcePx.y - opening.hingeSourcePx.y);
  return { hinge, handing: side >= 0 ? "left" : "right" };
}
