import type { FloorPlanAnnotationV2, FloorPlanSourceCalibrationV2 } from "../floor-plan-document-v2";
import { inversePhotoMatrix, mapPhotoPoint } from "../floor-plan-photo-math";
import { sourceDrawingGeometryError } from "../floor-plan-source-drawing";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import { rasterBoundaryProposals } from "./raster-boundary-proposals";
import { sourceOpeningSpan } from "./raster-opening-spans";

const automaticBoundary = (id: string) => id.startsWith("source-local-boundary:");
const consumerReviewed = (a: FloorPlanAnnotationV2) => a.provenance.reviewHistory.length > 0 ||
  a.provenance.evidence.some(e => e.basis === "user_confirmed" || e.basis === "site_measured");

/** Keep unresolved local evidence visible after mapping back to the original.
 * New extraction must not overwrite a consumer's earlier source corrections. */
export function mergePhotoReferenceReview(original: FloorPlanAnnotationV2[], page: RegisteredPageEvidence,
  calibration: FloorPlanSourceCalibrationV2, mmPerPx: number) {
  const correction = calibration.photoCorrection;
  if (!correction) return structuredClone(original);
  const inverse = inversePhotoMatrix(correction.originalToCorrected);
  const retained = original.filter(a => !automaticBoundary(a.id) || consumerReviewed(a));
  const result = new Map(structuredClone(retained).map(a => [a.id, a]));
  const add = (id: string, text: string, points: Array<{ x: number; y: number }>, note: string) => {
    const prior = result.get(id); if (prior && consumerReviewed(prior)) return;
    const geometry = { kind: "source_drawing" as const, sourceId: calibration.sourceId, pageNumber: calibration.pageNumber,
      widthPx: calibration.imageWidthPx, heightPx: calibration.imageHeightPx, command: "line" as const,
      points: points.map(p => mapPhotoPoint(inverse, p)) };
    if (sourceDrawingGeometryError(geometry)) return;
    result.set(id, { id, scope: "reference", kind: "note", text, geometry,
      provenance: { confidence: 0, extractionVersion: "photo-local-reference-v1", reviewHistory: [],
        evidence: [{ sourceId: calibration.sourceId, pageNumber: calibration.pageNumber, basis: "raster_traced", confidence: 0,
          extractorVersion: "photo-local-reference-v1", note: `${note} Pending source review; not accepted canonical geometry.` }] } });
  };
  for (const span of rasterBoundaryProposals(page, mmPerPx)) add(`source-local-boundary:${page.pageNumber}:${span.id}`,
    `Locally detected boundary candidate: ${span.proof === "solid_stroke" ? "solid stroke" : "paired rails"}; confirm building meaning`,
    [span.start, span.end], `Evidence ${span.segmentIds.join(", ")}; no gap closure or verified thickness is inferred.`);
  page.semantics.openingSymbols.forEach((symbol, index) => {
    const span = sourceOpeningSpan(page, symbol, index);
    if (span.pixelSupported && span.points) add(`source-proposal:${page.pageNumber}:opening:${index}`,
      `Pixel-supported ${symbol.kind} span; host and operation need review`, span.points,
      "A captured hint selected the sampling region; local jamb/frame pixels supplied these endpoints.");
  });
  return [...result.values()];
}
