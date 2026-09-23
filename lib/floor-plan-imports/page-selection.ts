import type { FloorPlanPageCandidate } from "./types";

export const ENHANCED_FLOOR_PLAN_EVIDENCE_KIND =
  "floor_plan_deterministic_evidence_v2";

type EnhancedFloorPlanEvidenceEnvelope = Record<string, unknown> & {
  kind: typeof ENHANCED_FLOOR_PLAN_EVIDENCE_KIND;
  pageCandidates: FloorPlanPageCandidate[];
  selectedPageNumber: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pageCandidate(value: unknown): FloorPlanPageCandidate | null {
  const candidate = record(value);
  if (
    !candidate ||
    !Number.isSafeInteger(candidate.pageNumber) ||
    Number(candidate.pageNumber) < 1 ||
    !Number.isSafeInteger(candidate.rank) ||
    Number(candidate.rank) < 1
  ) {
    return null;
  }
  const boundedCount = (entry: unknown) =>
    Number.isSafeInteger(entry) && Number(entry) >= 0 ? Number(entry) : 0;
  const finite = (entry: unknown) =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : 0;
  return {
    pageNumber: Number(candidate.pageNumber),
    rank: Number(candidate.rank),
    score: finite(candidate.score),
    widthPx: boundedCount(candidate.widthPx),
    heightPx: boundedCount(candidate.heightPx),
    roomLabelCount: boundedCount(candidate.roomLabelCount),
    dimensionLabelCount: boundedCount(candidate.dimensionLabelCount),
    openingSymbolCount: boundedCount(candidate.openingSymbolCount),
    vectorPathCount: boundedCount(candidate.vectorPathCount),
    vectorSegmentCount: boundedCount(candidate.vectorSegmentCount),
  };
}

export function isEnhancedFloorPlanImportEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  return environment.FLOOR_PLAN_IMPORT_ENHANCED_DETECTION !== "0";
}

export function readFloorPlanPageSelection(candidate: unknown): {
  candidates: FloorPlanPageCandidate[];
  selectedPageNumber: number | null;
  required: boolean;
} | null {
  const envelope = record(candidate);
  if (envelope?.kind !== ENHANCED_FLOOR_PLAN_EVIDENCE_KIND) return null;
  const candidates = Array.isArray(envelope.pageCandidates)
    ? envelope.pageCandidates
        .map(pageCandidate)
        .filter((entry): entry is FloorPlanPageCandidate => Boolean(entry))
        .sort((left, right) => left.rank - right.rank)
    : [];
  const selectedPageNumber =
    Number.isSafeInteger(envelope.selectedPageNumber) &&
    candidates.some(
      (entry) => entry.pageNumber === Number(envelope.selectedPageNumber)
    )
      ? Number(envelope.selectedPageNumber)
      : null;
  return {
    candidates,
    selectedPageNumber,
    required: candidates.length > 1,
  };
}

export function selectFloorPlanImportPage(
  candidate: unknown,
  pageNumber: number
): EnhancedFloorPlanEvidenceEnvelope {
  const envelope = record(candidate);
  const selection = readFloorPlanPageSelection(envelope);
  if (!envelope || !selection) {
    throw new Error("This import does not support source-page selection");
  }
  if (
    !Number.isSafeInteger(pageNumber) ||
    !selection.candidates.some((entry) => entry.pageNumber === pageNumber)
  ) {
    throw new Error("Select one of the available floor-plan pages");
  }
  return {
    ...envelope,
    kind: ENHANCED_FLOOR_PLAN_EVIDENCE_KIND,
    pageCandidates: selection.candidates,
    selectedPageNumber: pageNumber,
  };
}

export function markSelectedFloorPlanManifestPage(
  sourceManifest: unknown,
  pageNumber: number
) {
  const manifest = record(sourceManifest);
  if (!manifest || !Array.isArray(manifest.pages)) return manifest;
  return {
    ...manifest,
    selectedPageNumber: pageNumber,
    pages: manifest.pages.map((value) => {
      const page = record(value);
      return page
        ? {
            ...page,
            selectedForGeometry: page.pageNumber === pageNumber,
          }
        : value;
    }),
  };
}
