import type { RegisteredPageEvidence,SourceScaleSolution } from "./deterministic-evidence";
import type { FloorPlanRenderedPage,FloorPlanPageCandidate } from "./types";
import { ENHANCED_FLOOR_PLAN_EVIDENCE_KIND } from "./page-selection";
import type { CatalogFloorPlanDraftMatchReference } from "./catalog-draft-match";

export type PageScaleSolution = {
  pageNumber: number;
  millimetresPerPixel: number;
  dimensionCount: number;
  rmsResidualMm: number;
  confidence: number;
  evidence?: SourceScaleSolution["evidence"];
  diagnostics?: SourceScaleSolution["diagnostics"];
  /** "assumed_opening_width": no printed dimension could be confirmed and the scale is the vectorizer's estimate from
   *  door swings taken as standard leaves. Geometry built on it is approximate and the scale review stays critical. */
  basis?: "printed" | "assumed_opening_width";
};

export type ExtractionEnvelope = {
  kind:
    | "floor_plan_deterministic_evidence_v1"
    | typeof ENHANCED_FLOOR_PLAN_EVIDENCE_KIND;
  source: {
    id: string;
    fileName: string;
    mimeType: string;
    sha256: string;
  };
  pages: RegisteredPageEvidence[];
  renderedPages?: FloorPlanRenderedPage[];
  pageCandidates?: FloorPlanPageCandidate[];
  selectedPageNumber?: number | null;
  scale: PageScaleSolution | null;
  /** Page-bound solutions prevent dimensions from one brochure page scaling another. */
  scales?: PageScaleSolution[];
  catalogDraftMatch?: CatalogFloorPlanDraftMatchReference | null;
};

export function asEnvelope(candidate: Record<string, unknown> | null): ExtractionEnvelope {
  if (
    !candidate ||
    ![
      "floor_plan_deterministic_evidence_v1",
      ENHANCED_FLOOR_PLAN_EVIDENCE_KIND,
    ].includes(String(candidate.kind))
  ) {
    throw new Error("Floor-plan extraction evidence is missing");
  }
  return candidate as unknown as ExtractionEnvelope;
}
