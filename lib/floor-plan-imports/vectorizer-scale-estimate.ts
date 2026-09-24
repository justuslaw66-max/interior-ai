import type { FloorPlanAnnotationV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "./deterministic-evidence";

/**
 * The scale the vectorizer estimated where a plan prints no dimensions. It is
 * offered to the reviewer as a suggestion with the door openings it rests on;
 * the adapter never accepts it on its own.
 */

export const VECTORIZER_SCALE_ESTIMATE_CONFIGURATION = "source-scale-estimate";

/** The estimate the vectorizer made where the plan prints no dimensions, in page pixels; null when it made none. */
export function vectorizerScaleEstimate(page: RegisteredPageEvidence | undefined) {
  const hint = page?.vectorizer?.scaleHint;
  if (!hint || hint.basis !== "estimated_door_leaf" || !hint.millimetresPerPixel || !hint.estimate) return null;
  return { millimetresPerPixel: hint.millimetresPerPixel, ...hint.estimate };
}

/** One sentence for the scale review when only an estimate exists. */
export function vectorizerScaleEstimateMessage(page: RegisteredPageEvidence | undefined) {
  const estimate = vectorizerScaleEstimate(page);
  if (!estimate) return null;
  const doors = estimate.doorOpenings.length;
  return (
    `No printed dimension could be confirmed on this page. The local vectorizer estimates about ${estimate.millimetresPerPixel.toFixed(1)} mm per pixel ` +
    `from ${estimate.swingsMeasured} door swing${estimate.swingsMeasured === 1 ? "" : "s"}, assuming ${Math.round(estimate.assumedLeafMm)} mm leaves. ` +
    (doors
      ? `${doors} door opening${doors === 1 ? " is" : "s are"} marked on the plan: confirm one with its real width, or accept the assumed width to continue with an approximate scale.`
      : "Confirm one known distance before geometry can be trusted.")
  );
}

/** Door openings the estimate can be checked against, as reference marks the scale review can pick up. */
export function vectorizerScaleEstimateAnnotations(
  page: RegisteredPageEvidence,
  sourceId: string,
  version: string
): FloorPlanAnnotationV2[] {
  const estimate = vectorizerScaleEstimate(page);
  if (!estimate) return [];
  return estimate.doorOpenings.map((door, index) => ({
    id: `${VECTORIZER_SCALE_ESTIMATE_CONFIGURATION}:${page.pageNumber}:${index}`,
    kind: "note" as const,
    scope: "reference" as const,
    text: `Door opening ${index + 1}: about ${door.widthMmAtEstimate} mm if the estimated scale holds (door leaves assumed ${Math.round(estimate.assumedLeafMm)} mm). Not a confirmed measurement.`,
    configurationId: VECTORIZER_SCALE_ESTIMATE_CONFIGURATION,
    geometry: {
      kind: "source_drawing" as const,
      sourceId,
      pageNumber: page.pageNumber,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      command: "line" as const,
      points: [
        { x: door.sourcePx[0][0], y: door.sourcePx[0][1] },
        { x: door.sourcePx[1][0], y: door.sourcePx[1][1] },
      ],
    },
    provenance: {
      confidence: 0,
      extractionVersion: version,
      reviewHistory: [],
      evidence: [
        {
          sourceId,
          pageNumber: page.pageNumber,
          basis: "inferred" as const,
          confidence: 0,
          extractorVersion: version,
          note: "Door opening measured by the local vectorizer; its width in millimetres is an estimate from an assumed leaf width, never an accepted scale.",
        },
      ],
    },
  }));
}

/** What the adapter keeps on the page between pipeline stages (plain JSON). */
