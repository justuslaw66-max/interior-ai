import type { FloorPlanAnnotationV2 } from "../floor-plan-document-v2";
import { INTERIOR_ITEM_REVIEW_CONFIGURATION } from "../floor-plan-source-span-review";
import type { PageSemanticEvidence } from "./deterministic-evidence";

/** Apply a saved classification only to its source/page proposal. Preserve the
 * retained observations and ordinal IDs, including proposals after this one. */
export function applySourceOpeningReviews(semantics: PageSemanticEvidence, annotations: FloorPlanAnnotationV2[],
  sourceId: string, pageNumber: number): PageSemanticEvidence {
  const reviewed = new Set(annotations.filter(a => a.scope === "reference" &&
    a.configurationId === INTERIOR_ITEM_REVIEW_CONFIGURATION && a.geometry.kind === "source_drawing" &&
    a.geometry.sourceId === sourceId && a.geometry.pageNumber === pageNumber &&
    a.provenance.reviewHistory.length > 0 && a.provenance.evidence.some(e => e.basis === "user_confirmed"))
    .map(a => a.id));
  return { ...semantics, openingSymbols: semantics.openingSymbols.map((symbol, index) =>
    reviewed.has(`source-proposal:${pageNumber}:opening:${index}`)
      ? { ...symbol, confidence: 0, spanStart: undefined, spanEnd: undefined }
      : symbol) };
}
