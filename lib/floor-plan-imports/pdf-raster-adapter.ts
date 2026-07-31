import { z } from "zod";
import type {
  FloorPlanAnnotationV2,
  FloorPlanDimensionV2,
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanOpeningV2,
  FloorPlanRoomV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanAdapterContext,
  FloorPlanSourceAdapter,
  FloorPlanStageResult,
  StoredFloorPlanSource,
} from "./source-adapter";
import type {
  FloorPlanRenderedPage,
  FloorPlanReviewIssue,
} from "./types";
import { floorPlanMvpBlockingIssueIds } from "./types";
import {
  applySemanticEvidencePrior,
  multiplyMatrices,
  parsePrintedLengthMm,
  pointInPolygon,
  registerRoomBoundaries,
  segmentLengthPx,
  semanticEvidencePrior,
  solveScaleFromRegisteredEvidence,
  transformSourcePoint,
  type Matrix2D,
  type PageSemanticEvidence,
  type RegisteredPageEvidence,
  type SemanticBoundingBox,
  type SourcePointPx,
  type SourceScaleSolution,
  type SourceTextEvidence,
  type SourceVectorPath,
  type SourceVectorSegment,
  type RegisteredRoomBoundary,
} from "./deterministic-evidence";
import {
  ENHANCED_FLOOR_PLAN_EVIDENCE_KIND,
  isEnhancedFloorPlanImportEnabled,
} from "./page-selection";
import type { FloorPlanPageCandidate } from "./types";
import {
  extractRasterLinework,
  normalizeRasterForLinework,
  type RasterLineworkDiagnostics,
} from "./raster-linework";
import {
  createDefaultFloorPlanLocalOcrProvider,
  type FloorPlanLocalOcrProvider,
  type FloorPlanLocalOcrResult,
} from "./local-ocr";
import { detectRegisteredWallFootprintBands } from "./topology-evidence";
import {
  deriveRegisteredWallCenterlines,
  type RegisteredWallCenterlineResult,
} from "./wall-centerline-evidence";
import {
  detectRegisteredOpeningGaps,
  type RegisteredOpeningGapResult,
} from "./opening-gap-evidence";
import {
  assembleRegisteredPlanarFaces,
  assessRegisteredTopologyCompleteness,
  type RegisteredPlanarFaceResult,
} from "./planar-face-evidence";
import { assessRegisteredDirectPathCompleteness } from "./room-topology-completeness";
import {
  inferRoomIdentityFromFixtures,
  registerVisionGuidedRoomBoundaries,
  type VisionGuidedTopologyResult,
} from "./vision-guided-topology";
import { parsePdfDrawPathEvidence } from "./pdf-vector-evidence";
import {
  buildSourceBoundCatalogDraft,
  catalogFloorPlanDraftMatchReference,
  matchPrivateUploadToCatalogDraft,
  resolveCatalogFloorPlanDraftMatch,
  type CatalogFloorPlanDraftMatchReference,
} from "./catalog-draft-match";

const EXTRACTION_VERSION = "pdf-raster-hybrid-2.4.0";
const MAX_PDF_PAGES = 30;
const MAX_SEMANTIC_PAGES = 8;
const MAX_VECTOR_SEGMENTS_PER_PAGE = 20_000;
const MAX_VECTOR_PATHS_PER_PAGE = 8_000;
const PDF_RENDER_SCALE = 2;
const MAX_RENDER_PIXELS = 16_000_000;
const DEFAULT_LOCAL_OCR_PAGES = 8;
const DEFAULT_LOCAL_OCR_TIMEOUT_MS = 12_000;
const MAX_LOCAL_OCR_CANDIDATES_PER_PAGE = 600;

type LocalOcrPageDiagnostics = Pick<
  FloorPlanLocalOcrResult,
  "providerId" | "elapsedMs" | "truncated"
> & {
  attempted: boolean;
  candidateCount: number;
  status: "completed" | "empty" | "timed_out" | "failed";
};

const semanticSchema = z.object({
  planRegion: z
    .object({
      bbox: z.object({
        leftRatio: z.number().min(0).max(1),
        topRatio: z.number().min(0).max(1),
        rightRatio: z.number().min(0).max(1),
        bottomRatio: z.number().min(0).max(1),
      }),
      rotationDegrees: z.number().min(-180).max(180),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
  unitSystem: z.enum(["metric_mm", "metric_cm", "imperial", "unknown"]),
  roomLabels: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      rawText: z.string().trim().max(160),
      roomType: z.enum([
        "living",
        "dining",
        "bedroom",
        "kitchen",
        "toilet",
        "service_yard",
        "shelter",
        "study",
        "other",
      ]),
      centerXRatio: z.number().min(0).max(1),
      centerYRatio: z.number().min(0).max(1),
      bbox: z.object({
        leftRatio: z.number().min(0).max(1),
        topRatio: z.number().min(0).max(1),
        rightRatio: z.number().min(0).max(1),
        bottomRatio: z.number().min(0).max(1),
      }),
      confidence: z.number().min(0).max(1),
    })
  ).max(100),
  roomBoundaries: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      roomType: z.enum([
        "living",
        "dining",
        "bedroom",
        "kitchen",
        "toilet",
        "service_yard",
        "shelter",
        "study",
        "other",
      ]),
      points: z.array(
        z.object({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
        })
      ).min(3).max(24),
      confidence: z.number().min(0).max(1),
    })
  ).max(100),
  dimensionLabels: z.array(
    z.object({
      valueMm: z.number().int().min(100).max(100_000),
      rawText: z.string().trim().max(80),
      centerXRatio: z.number().min(0).max(1),
      centerYRatio: z.number().min(0).max(1),
      orientation: z.enum(["horizontal", "vertical", "unknown"]),
      bbox: z.object({
        leftRatio: z.number().min(0).max(1),
        topRatio: z.number().min(0).max(1),
        rightRatio: z.number().min(0).max(1),
        bottomRatio: z.number().min(0).max(1),
      }),
      extensionStart: z
        .object({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
        })
        .nullable(),
      extensionEnd: z
        .object({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
        })
        .nullable(),
      confidence: z.number().min(0).max(1),
    })
  ).max(200),
  openingSymbols: z.array(
    z.object({
      kind: z.enum(["door", "window", "open_passage", "vent", "louvre"]),
      operation: z.enum(["swing", "sliding", "folding", "fixed", "open", "unknown"]),
      centerXRatio: z.number().min(0).max(1),
      centerYRatio: z.number().min(0).max(1),
      bbox: z.object({
        leftRatio: z.number().min(0).max(1),
        topRatio: z.number().min(0).max(1),
        rightRatio: z.number().min(0).max(1),
        bottomRatio: z.number().min(0).max(1),
      }),
      spanStart: z
        .object({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
        })
        .nullable(),
      spanEnd: z
        .object({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
        })
        .nullable(),
      confidence: z.number().min(0).max(1),
    })
  ).max(200),
  fixtureSymbols: z.array(
    z.object({
      kind: z.enum([
        "toilet",
        "bathtub",
        "shower",
        "basin",
        "kitchen_sink",
        "stove",
        "washer",
        "dryer",
        "other",
      ]),
      centerXRatio: z.number().min(0).max(1),
      centerYRatio: z.number().min(0).max(1),
      bbox: z.object({
        leftRatio: z.number().min(0).max(1),
        topRatio: z.number().min(0).max(1),
        rightRatio: z.number().min(0).max(1),
        bottomRatio: z.number().min(0).max(1),
      }),
      confidence: z.number().min(0).max(1),
    })
  ).max(300),
  entrance: z
    .object({
      centerXRatio: z.number().min(0).max(1),
      centerYRatio: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
  notes: z.array(z.string().max(240)).max(30),
});

type PageScaleSolution = {
  pageNumber: number;
  millimetresPerPixel: number;
  dimensionCount: number;
  rmsResidualMm: number;
  confidence: number;
  evidence?: SourceScaleSolution["evidence"];
  diagnostics?: SourceScaleSolution["diagnostics"];
};

type ExtractionEnvelope = {
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

type PdfOperatorList = {
  fnArray: number[];
  argsArray: unknown[][];
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function emptySemantics(): PageSemanticEvidence {
  return {
    planRegion: null,
    unitSystem: "unknown",
    roomLabels: [],
    roomBoundaries: [],
    dimensionLabels: [],
    openingSymbols: [],
    fixtureSymbols: [],
    entrance: null,
    notes: [],
  };
}

function mergeSemantics(
  deterministic: PageSemanticEvidence,
  semantic: PageSemanticEvidence | null,
  preferSemantic = false
): PageSemanticEvidence {
  if (!semantic) return deterministic;
  const distanceBetween = (
    left: { centerXRatio: number; centerYRatio: number },
    right: { centerXRatio: number; centerYRatio: number }
  ) =>
    Math.hypot(
      left.centerXRatio - right.centerXRatio,
      left.centerYRatio - right.centerYRatio
    );
  const preferred = preferSemantic ? semantic : deterministic;
  const supplemental = preferSemantic ? deterministic : semantic;
  const roomLabels = [...preferred.roomLabels];
  for (const candidate of supplemental.roomLabels) {
    const normalizedLabel = candidate.label.trim().toLocaleLowerCase();
    if (
      roomLabels.some(
        (existing) =>
          existing.label.trim().toLocaleLowerCase() === normalizedLabel &&
          distanceBetween(existing, candidate) <= 0.04
      )
    ) {
      continue;
    }
    roomLabels.push(candidate);
  }
  const roomBoundaries = [...(preferred.roomBoundaries ?? [])];
  for (const candidate of supplemental.roomBoundaries ?? []) {
    const centroid = candidate.points.reduce(
      (total, point) => ({
        centerXRatio: total.centerXRatio + point.xRatio / candidate.points.length,
        centerYRatio: total.centerYRatio + point.yRatio / candidate.points.length,
      }),
      { centerXRatio: 0, centerYRatio: 0 }
    );
    const normalizedLabel = candidate.label.trim().toLocaleLowerCase();
    if (
      roomBoundaries.some((existing) => {
        const existingCentroid = existing.points.reduce(
          (total, point) => ({
            centerXRatio:
              total.centerXRatio + point.xRatio / existing.points.length,
            centerYRatio:
              total.centerYRatio + point.yRatio / existing.points.length,
          }),
          { centerXRatio: 0, centerYRatio: 0 }
        );
        return (
          existing.label.trim().toLocaleLowerCase() === normalizedLabel &&
          distanceBetween(existingCentroid, centroid) <= 0.04
        );
      })
    ) {
      continue;
    }
    roomBoundaries.push(candidate);
  }
  const dimensionLabels = [...preferred.dimensionLabels];
  for (const candidate of supplemental.dimensionLabels) {
    if (
      dimensionLabels.some(
        (existing) =>
          Math.abs(existing.valueMm - candidate.valueMm) <=
            Math.max(10, candidate.valueMm * 0.01) &&
          (existing.orientation === candidate.orientation ||
            existing.orientation === "unknown" ||
            candidate.orientation === "unknown") &&
          distanceBetween(existing, candidate) <= 0.04
      )
    ) {
      continue;
    }
    dimensionLabels.push(candidate);
  }
  const openingSymbols = [...preferred.openingSymbols];
  for (const candidate of supplemental.openingSymbols) {
    if (
      openingSymbols.some(
        (existing) =>
          existing.kind === candidate.kind &&
          distanceBetween(existing, candidate) <= 0.04
      )
    ) {
      continue;
    }
    openingSymbols.push(candidate);
  }
  const fixtureSymbols = [...(preferred.fixtureSymbols ?? [])];
  for (const candidate of supplemental.fixtureSymbols ?? []) {
    if (
      fixtureSymbols.some(
        (existing) =>
          existing.kind === candidate.kind &&
          distanceBetween(existing, candidate) <= 0.035
      )
    ) {
      continue;
    }
    fixtureSymbols.push(candidate);
  }
  return {
    planRegion: preferred.planRegion ?? supplemental.planRegion ?? null,
    unitSystem:
      preferred.unitSystem && preferred.unitSystem !== "unknown"
        ? preferred.unitSystem
        : supplemental.unitSystem ?? "unknown",
    roomLabels,
    roomBoundaries,
    dimensionLabels,
    openingSymbols,
    fixtureSymbols,
    entrance: preferred.entrance ?? supplemental.entrance,
    notes: [...supplemental.notes, ...preferred.notes],
  };
}

/** Chooses likely plan pages before spending the bounded semantic-model budget. */
export function rankFloorPlanSemanticPages(
  pages: readonly RegisteredPageEvidence[]
) {
  return [...pages].sort((left, right) => {
    return (
      floorPlanSemanticPageScore(right) -
        floorPlanSemanticPageScore(left) ||
      left.pageNumber - right.pageNumber
    );
  });
}

function floorPlanSemanticPageScore(page: RegisteredPageEvidence) {
  return (
    page.semantics.roomLabels.length * 10_000 +
    page.semantics.dimensionLabels.length * 500 +
    page.semantics.openingSymbols.length * 250 +
    Math.min(page.vectorPaths.length, 500) * 30 +
    Math.min(page.vectorSegments.length, 20_000) * 0.02 +
    Math.min(page.text.length, 1_000) * 2
  );
}

function buildPageCandidates(
  pages: readonly RegisteredPageEvidence[]
): FloorPlanPageCandidate[] {
  return rankFloorPlanSemanticPages(pages).map((page, index) => ({
    pageNumber: page.pageNumber,
    rank: index + 1,
    score: Number(floorPlanSemanticPageScore(page).toFixed(2)),
    widthPx: page.widthPx,
    heightPx: page.heightPx,
    roomLabelCount: page.semantics.roomLabels.length,
    dimensionLabelCount: page.semantics.dimensionLabels.length,
    openingSymbolCount: page.semantics.openingSymbols.length,
    vectorPathCount: page.vectorPaths.length,
    vectorSegmentCount: page.vectorSegments.length,
  }));
}

function roomTypeFromLabel(label: string): PageSemanticEvidence["roomLabels"][number]["roomType"] | null {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return null;
  if (/bed|master|main room/.test(normalized)) return "bedroom";
  if (/kitchen/.test(normalized)) return "kitchen";
  if (/bath|wc|toilet/.test(normalized)) return "toilet";
  if (/service yard|utility/.test(normalized)) return "service_yard";
  if (/shelter|store/.test(normalized)) return "shelter";
  if (/study/.test(normalized)) return "study";
  if (/living/.test(normalized)) return "living";
  if (/dining/.test(normalized)) return "dining";
  return null;
}

function semanticsFromPositionedText(
  text: SourceTextEvidence[],
  widthPx: number,
  heightPx: number
): PageSemanticEvidence {
  const result = emptySemantics();
  for (const item of text) {
    const evidenceKind = item.evidenceKind ?? "positioned_text";
    const confidence = semanticEvidencePrior(evidenceKind);
    const roomType = roomTypeFromLabel(item.text);
    if (roomType) {
      result.roomLabels.push({
        label: item.text.trim(),
        roomType,
        centerXRatio: item.center.x / widthPx,
        centerYRatio: item.center.y / heightPx,
        confidence,
        evidenceKind,
      });
    }
    const normalized = item.text.replace(/[,\s]/g, "");
    const parsedImperialMm = parsePrintedLengthMm(item.text);
    if (/^\d{3,5}$/.test(normalized) || parsedImperialMm !== null) {
      const valueMm = parsedImperialMm ?? Number(normalized);
      result.dimensionLabels.push({
        valueMm,
        rawText: item.text,
        centerXRatio: item.center.x / widthPx,
        centerYRatio: item.center.y / heightPx,
        orientation: item.widthPx >= item.heightPx ? "horizontal" : "vertical",
        confidence,
        evidenceKind,
      });
    }
  }
  return result;
}

export function sourceTextEvidenceFromLocalOcr(
  pageNumber: number,
  result: FloorPlanLocalOcrResult
): SourceTextEvidence[] {
  return result.candidates.map((candidate, index) => ({
    id: `p${pageNumber}-ocr${index + 1}`,
    pageNumber,
    text: candidate.text,
    center: {
      x: (candidate.bbox.left + candidate.bbox.right) / 2,
      y: (candidate.bbox.top + candidate.bbox.bottom) / 2,
    },
    widthPx: candidate.bbox.right - candidate.bbox.left,
    heightPx: candidate.bbox.bottom - candidate.bbox.top,
    evidenceKind: "ocr",
  }));
}

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  maximum: number
) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(maximum, value)
    : fallback;
}

function localOcrFailureStatus(cause: unknown): LocalOcrPageDiagnostics["status"] {
  return cause instanceof Error && cause.message === "LOCAL_OCR_TIMEOUT"
    ? "timed_out"
    : "failed";
}

async function applyLocalOcrEvidence(
  pages: RegisteredPageEvidence[],
  renderedPages: FloorPlanRenderedPage[],
  context: FloorPlanAdapterContext,
  provider: FloorPlanLocalOcrProvider | null
) {
  const diagnostics = new Map<number, LocalOcrPageDiagnostics>();
  if (!provider || !context.store.readDerivative) return diagnostics;
  const pageLimit = boundedEnvironmentInteger(
    "FLOOR_PLAN_LOCAL_OCR_MAX_PAGES",
    DEFAULT_LOCAL_OCR_PAGES,
    MAX_SEMANTIC_PAGES
  );
  const timeoutMs = boundedEnvironmentInteger(
    "FLOOR_PLAN_LOCAL_OCR_TIMEOUT_MS",
    DEFAULT_LOCAL_OCR_TIMEOUT_MS,
    30_000
  );
  const renderedByPage = new Map(
    renderedPages.map((page) => [page.pageNumber, page])
  );
  const selected = rankFloorPlanSemanticPages(
    pages.filter(
      (page) =>
        page.text.length < 4 ||
        (page.semantics.roomLabels.length === 0 &&
          page.semantics.dimensionLabels.length < 2)
    )
  ).slice(0, pageLimit);
  for (const page of selected) {
    if (context.signal?.aborted) break;
    const rendered = renderedByPage.get(page.pageNumber);
    if (!rendered) continue;
    try {
      const derivative = await context.store.readDerivative(rendered.assetKey);
      if (!derivative || derivative.mimeType !== "image/png") continue;
      const result = await provider.recognizePage(
        {
          pageNumber: page.pageNumber,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
          mimeType: "image/png",
          bytes: derivative.bytes,
        },
        {
          timeoutMs,
          maxCandidates: MAX_LOCAL_OCR_CANDIDATES_PER_PAGE,
          minSourceConfidence: 45,
          signal: context.signal,
        }
      );
      const ocrText = sourceTextEvidenceFromLocalOcr(page.pageNumber, result);
      page.text.push(...ocrText);
      page.semantics = mergeSemantics(
        page.semantics,
        semanticsFromPositionedText(ocrText, page.widthPx, page.heightPx)
      );
      diagnostics.set(page.pageNumber, {
        providerId: result.providerId,
        elapsedMs: result.elapsedMs,
        truncated: result.truncated,
        attempted: true,
        candidateCount: ocrText.length,
        status: ocrText.length ? "completed" : "empty",
      });
      if (!ocrText.length) {
        page.semantics.notes.push(
          "Local OCR found no reliable positioned text. Confirm labels and dimensions manually."
        );
      }
    } catch (cause) {
      const status = localOcrFailureStatus(cause);
      diagnostics.set(page.pageNumber, {
        providerId: provider.id,
        elapsedMs: timeoutMs,
        truncated: false,
        attempted: true,
        candidateCount: 0,
        status,
      });
      page.semantics.notes.push(
        status === "timed_out"
          ? "Local OCR reached its page time limit. Confirm labels and dimensions manually."
          : "Local OCR was unavailable. Confirm labels and dimensions manually."
      );
    }
  }
  return diagnostics;
}

async function renderPdf(
  source: StoredFloorPlanSource,
  context: FloorPlanAdapterContext
): Promise<FloorPlanRenderedPage[]> {
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);
  const loadingTask = getDocument({
    data: source.bytes.slice(),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has ${pdf.numPages} pages; the import limit is ${MAX_PDF_PAGES}`);
    }
    const result: FloorPlanRenderedPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (context.signal?.aborted) throw new Error("Floor-plan import was cancelled");
      const page = await pdf.getPage(pageNumber);
      const unitViewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const pixelScale = Math.min(
        1,
        Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, unitViewport.width * unitViewport.height))
      );
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE * pixelScale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const canvasContext = canvas.getContext("2d");
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      const bytes = new Uint8Array(canvas.toBuffer("image/png"));
      const assetKey = await context.store.putDerivative({
        jobId: context.jobId,
        fileName: `page-${pageNumber}.png`,
        mimeType: "image/png",
        bytes,
      });
      result.push({
        pageNumber,
        widthPx: canvas.width,
        heightPx: canvas.height,
        assetKey,
      });
    }
    return result;
  } finally {
    await loadingTask.destroy();
  }
}

async function renderRaster(
  source: StoredFloorPlanSource,
  context: FloorPlanAdapterContext
): Promise<FloorPlanRenderedPage[]> {
  const normalized = await normalizeRasterForLinework(source.bytes);
  const assetKey = await context.store.putDerivative({
    jobId: context.jobId,
    fileName: "page-1.png",
    mimeType: "image/png",
    bytes: normalized.bytes,
  });
  return [
    {
      pageNumber: 1,
      widthPx: normalized.widthPx,
      heightPx: normalized.heightPx,
      assetKey,
      normalization: normalized.normalization,
    },
  ];
}

async function extractRasterEvidence(
  source: StoredFloorPlanSource,
  renderedPages: FloorPlanRenderedPage[],
  context: FloorPlanAdapterContext
): Promise<{
  pages: RegisteredPageEvidence[];
  diagnostics: Map<number, RasterLineworkDiagnostics>;
}> {
  const pages: RegisteredPageEvidence[] = [];
  const diagnostics = new Map<number, RasterLineworkDiagnostics>();
  for (const page of renderedPages) {
    try {
      const stored = context.store.readDerivative
        ? await context.store.readDerivative(page.assetKey)
        : null;
      let bytes = stored?.bytes;
      if (!bytes) {
        const normalized = await normalizeRasterForLinework(source.bytes);
        bytes = normalized.bytes;
      }
      const extracted = await extractRasterLinework(bytes, {
        pageNumber: page.pageNumber,
        expectedWidthPx: page.widthPx,
        expectedHeightPx: page.heightPx,
        normalization: page.normalization,
      });
      diagnostics.set(page.pageNumber, extracted.diagnostics);
      const semantics = emptySemantics();
      semantics.notes.push(
        extracted.vectorPaths.length
          ? `Deterministic raster linework found ${extracted.vectorSegments.length} axis-aligned segments and ${extracted.vectorPaths.length} conservative closed cycles. Room meaning, scale and openings still require independent evidence.`
          : "Raster linework did not contain a conservative closed rectilinear cycle. Keep the source underlay and use guided calibration/tracing."
      );
      pages.push({
        pageNumber: page.pageNumber,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        vectorSegments: extracted.vectorSegments,
        vectorPaths: extracted.vectorPaths,
        text: [],
        semantics,
      });
    } catch (cause) {
      const semantics = emptySemantics();
      semantics.notes.push(
        `Raster linework extraction unavailable: ${cause instanceof Error ? cause.message : "unknown error"}. Keep the source underlay and use guided tracing.`
      );
      pages.push({
        pageNumber: page.pageNumber,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        vectorSegments: [],
        vectorPaths: [],
        text: [],
        semantics,
      });
    }
  }
  return { pages, diagnostics };
}

async function extractPdfEvidence(
  source: StoredFloorPlanSource,
  renderedPages: FloorPlanRenderedPage[]
): Promise<RegisteredPageEvidence[]> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: source.bytes.slice(),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    const pages: RegisteredPageEvidence[] = [];
    for (const rendered of renderedPages) {
      const page = await pdf.getPage(rendered.pageNumber);
      const viewport = page.getViewport({
        scale: rendered.widthPx / page.getViewport({ scale: 1 }).width,
      });
      const operatorList = (await page.getOperatorList()) as unknown as PdfOperatorList;
      const textContent = await page.getTextContent();
      const text: SourceTextEvidence[] = [];
      for (const item of textContent.items.slice(0, 5_000)) {
        if (!("str" in item) || !("transform" in item)) continue;
        const typed = item as unknown as PdfTextItem;
        const matrix = multiplyMatrices(
          viewport.transform as Matrix2D,
          typed.transform.slice(0, 6) as Matrix2D
        );
        const origin = transformSourcePoint(matrix, { x: 0, y: 0 });
        const widthPx = Math.abs(typed.width * viewport.scale);
        const heightPx = Math.max(1, Math.abs(typed.height * viewport.scale));
        text.push({
          id: `p${rendered.pageNumber}-text${text.length + 1}`,
          pageNumber: rendered.pageNumber,
          text: typed.str,
          center: { x: origin.x + widthPx / 2, y: origin.y - heightPx / 2 },
          widthPx,
          heightPx,
        });
      }

      const segments: SourceVectorSegment[] = [];
      const paths: SourceVectorPath[] = [];
      let transform = viewport.transform as Matrix2D;
      let lineWidthSource = 1;
      let drawPathIndex = 0;
      let curveCount = 0;
      const stack: Array<{ transform: Matrix2D; lineWidthSource: number }> = [];
      const formStack: Array<{
        id: string;
        transform: Matrix2D;
        lineWidthSource: number;
      }> = [];
      let formIndex = 0;
      const paintOperationFor = (value: unknown): SourceVectorPath["paintOperation"] => {
        const operation = Number(value);
        if (operation === OPS.stroke || operation === OPS.closeStroke) return "stroke";
        if (operation === OPS.fill || operation === OPS.eoFill) return "fill";
        if (
          operation === OPS.fillStroke ||
          operation === OPS.eoFillStroke ||
          operation === OPS.closeFillStroke ||
          operation === OPS.closeEOFillStroke
        ) return "fill_stroke";
        if (operation === OPS.clip || operation === OPS.eoClip) return "clip";
        return "unknown";
      };
      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const fn = operatorList.fnArray[index];
        const args = operatorList.argsArray[index] ?? [];
        if (fn === OPS.paintFormXObjectBegin) {
          const id = `p${rendered.pageNumber}-form${++formIndex}`;
          formStack.push({
            id,
            transform: [...transform] as Matrix2D,
            lineWidthSource,
          });
          const rawMatrix = args[0];
          const values =
            Array.isArray(rawMatrix) || ArrayBuffer.isView(rawMatrix)
              ? Array.from(rawMatrix as Iterable<number>).map(Number)
              : [];
          if (values.length >= 6) {
            transform = multiplyMatrices(
              transform,
              values.slice(0, 6) as Matrix2D
            );
          }
        } else if (fn === OPS.paintFormXObjectEnd) {
          const restored = formStack.pop();
          if (restored) {
            transform = restored.transform;
            lineWidthSource = restored.lineWidthSource;
          }
        } else if (fn === OPS.save) {
          stack.push({ transform: [...transform] as Matrix2D, lineWidthSource });
        } else if (fn === OPS.restore) {
          const restored = stack.pop();
          if (restored) {
            transform = restored.transform;
            lineWidthSource = restored.lineWidthSource;
          }
        } else if (fn === OPS.transform && args.length >= 6) {
          transform = multiplyMatrices(
            transform,
            args.slice(0, 6).map(Number) as Matrix2D
          );
        } else if (fn === OPS.setLineWidth && args.length > 0) {
          lineWidthSource = Math.max(0.01, Number(args[0]));
        } else if (fn === OPS.constructPath) {
          drawPathIndex += 1;
          if (paths.length >= MAX_VECTOR_PATHS_PER_PAGE) continue;
          const containers = args[1];
          const first = Array.isArray(containers) ? containers[0] : null;
          const data = first && typeof first === "object" && Symbol.iterator in first
            ? Array.from(first as Iterable<number>)
            : [];
          const parsed = parsePdfDrawPathEvidence({
            data,
            matrix: transform,
            pageNumber: rendered.pageNumber,
            pathIndex: drawPathIndex,
            strokeWidthPx: Math.max(
              0.1,
              lineWidthSource * Math.hypot(transform[0], transform[1])
            ),
            paintOperation: paintOperationFor(args[0]),
            sourceOperatorIndex: index,
            graphicsStateDepth: stack.length + formStack.length,
            sourceFormPath: formStack.map((form) => form.id),
            maxSegments: MAX_VECTOR_SEGMENTS_PER_PAGE - segments.length,
            maxCurves: MAX_VECTOR_SEGMENTS_PER_PAGE - curveCount,
          });
          if (!parsed) continue;
          paths.push(parsed.path);
          segments.push(...parsed.segments);
          curveCount += parsed.path.curves?.length ?? 0;
        }
      }
      const deterministic = semanticsFromPositionedText(
        text,
        rendered.widthPx,
        rendered.heightPx
      );
      pages.push({
        pageNumber: rendered.pageNumber,
        widthPx: rendered.widthPx,
        heightPx: rendered.heightPx,
        vectorSegments: segments,
        vectorPaths: paths,
        text,
        semantics: deterministic,
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

async function classifyRenderedPage(
  page: FloorPlanRenderedPage,
  context: FloorPlanAdapterContext,
  detail: "low" | "original",
  planCrop?: SemanticBoundingBox | null
): Promise<PageSemanticEvidence | null> {
  if (
    process.env.FLOOR_PLAN_VISION_ENABLED !== "1" ||
    !process.env.OPENAI_API_KEY ||
    process.env.FLOOR_PLAN_VISION_DISABLED === "1" ||
    !context.store.readDerivative
  ) {
    return null;
  }
  const derivative = await context.store.readDerivative(page.assetKey);
  if (!derivative) return null;
  const requestedCrop =
    planCrop &&
    planCrop.rightRatio > planCrop.leftRatio &&
    planCrop.bottomRatio > planCrop.topRatio
      ? {
          leftRatio: Math.max(0, Math.min(1, planCrop.leftRatio)),
          topRatio: Math.max(0, Math.min(1, planCrop.topRatio)),
          rightRatio: Math.max(0, Math.min(1, planCrop.rightRatio)),
          bottomRatio: Math.max(0, Math.min(1, planCrop.bottomRatio)),
        }
      : null;
  let imageMimeType = derivative.mimeType;
  let imageBytes = derivative.bytes;
  if (
    requestedCrop &&
    (requestedCrop.rightRatio - requestedCrop.leftRatio) *
      (requestedCrop.bottomRatio - requestedCrop.topRatio) >=
      0.05
  ) {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const sourceImage = await loadImage(Buffer.from(derivative.bytes));
    const leftPx = Math.floor(requestedCrop.leftRatio * sourceImage.width);
    const topPx = Math.floor(requestedCrop.topRatio * sourceImage.height);
    const widthPx = Math.max(
      1,
      Math.ceil(
        (requestedCrop.rightRatio - requestedCrop.leftRatio) *
          sourceImage.width
      )
    );
    const heightPx = Math.max(
      1,
      Math.ceil(
        (requestedCrop.bottomRatio - requestedCrop.topRatio) *
          sourceImage.height
      )
    );
    const canvas = createCanvas(widthPx, heightPx);
    canvas
      .getContext("2d")
      .drawImage(
        sourceImage,
        leftPx,
        topPx,
        widthPx,
        heightPx,
        0,
        0,
        widthPx,
        heightPx
      );
    imageBytes = new Uint8Array(canvas.toBuffer("image/png"));
    imageMimeType = "image/png";
  }
  const [{ default: OpenAI }, { zodTextFormat }] = await Promise.all([
    import("openai"),
    import("openai/helpers/zod"),
  ]);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const semanticInstructions =
    detail === "original"
      ? "Analyze the confirmed floor-plan crop exhaustively at original detail. Propose every visually closed architectural face, including small bathrooms, toilets, closets, washrooms, utility rooms, and unlabeled enclosed spaces. Detect recognizable plan symbols for toilets, bathtubs, showers, basins, kitchen sinks, stoves, washers, and dryers. Use a sanitary fixture cluster such as a toilet with a bathtub, shower, or basin to classify an unlabeled enclosed face as Bathroom with roomType toilet, and return that face boundary even when no room text is printed. Fixture symbols are semantic evidence only: they are never walls, openings, or furniture to create. When Family Room, Dining Area, and Kitchen share one undivided face, return one Open Plan boundary and keep all three printed labels. Follow visible architectural wall faces through supported door, window, and passage gaps, using the fewest vertices needed. A room polygon is only a proposal: deterministic source-line snapping will accept or reject every edge. Do not omit a closed face merely because its name is missing or ambiguous. Never treat furniture, fixtures, cabinetry, appliances, hatching, text boxes, dimension strokes, decoration, or editor UI as architecture. Never invent measurements, wall spans, or 3D heights."
      : "Classify floor-plan semantics for page ranking and crop location. Locate the main plan region and rotation, page unit system, room-label boxes, approximate architectural room boundaries, printed dimension labels with approximate extension endpoints, entrance, door/window/passage spans, and recognizable sanitary or appliance fixture symbols. Room polygons are non-authoritative proposals that will be checked against deterministic source linework. Fixtures provide room-type evidence but are never architecture or furniture to create. Never treat colored UI overlays, selection boxes, furniture, fixtures, cabinetry, text boxes, dimension lines, or decoration as room boundaries. Never invent measurements, widths, or 3D heights.";
  const response = await client.responses.parse({
    model: process.env.FLOOR_PLAN_VISION_MODEL || "gpt-5.6",
    store: false,
    input: [
      {
        role: "system",
        content: semanticInstructions,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              detail === "original"
                ? "Return the confirmed plan region, units, every visible room or area label, every closed architectural face proposal, printed dimensions, architectural openings, and every recognizable sanitary or appliance fixture symbol. Explicitly inspect every toilet, bathtub, shower, and basin cluster for an unlabeled bathroom face. Preserve open-plan labels as separate point observations while returning one shared face."
                : "Return the plan region, units, visible room labels, source-supported room boundary proposals, printed dimensions, architectural openings, and recognizable sanitary or appliance fixture symbols. Ignore furniture, decoration, and editor UI overlays.",
          },
          {
            type: "input_image",
            image_url: `data:${imageMimeType};base64,${Buffer.from(
              imageBytes
            ).toString("base64")}`,
            detail,
          },
        ],
      },
    ],
    text: { format: zodTextFormat(semanticSchema, "floor_plan_semantics") },
  });
  if (!response.output_parsed) return null;
  const ratioPoint = (
    point: { xRatio: number; yRatio: number } | null
  ) =>
    point && requestedCrop
      ? {
          xRatio:
            requestedCrop.leftRatio +
            point.xRatio *
              (requestedCrop.rightRatio - requestedCrop.leftRatio),
          yRatio:
            requestedCrop.topRatio +
            point.yRatio *
              (requestedCrop.bottomRatio - requestedCrop.topRatio),
        }
      : point;
  const ratioBox = (bbox: SemanticBoundingBox) =>
    requestedCrop
      ? {
          leftRatio:
            requestedCrop.leftRatio +
            bbox.leftRatio *
              (requestedCrop.rightRatio - requestedCrop.leftRatio),
          topRatio:
            requestedCrop.topRatio +
            bbox.topRatio *
              (requestedCrop.bottomRatio - requestedCrop.topRatio),
          rightRatio:
            requestedCrop.leftRatio +
            bbox.rightRatio *
              (requestedCrop.rightRatio - requestedCrop.leftRatio),
          bottomRatio:
            requestedCrop.topRatio +
            bbox.bottomRatio *
              (requestedCrop.bottomRatio - requestedCrop.topRatio),
        }
      : bbox;
  const center = (xRatio: number, yRatio: number) =>
    ratioPoint({ xRatio, yRatio })!;
  return applySemanticEvidencePrior(
    {
      ...response.output_parsed,
      planRegion: response.output_parsed.planRegion
        ? {
            ...response.output_parsed.planRegion,
            bbox: ratioBox(response.output_parsed.planRegion.bbox),
          }
        : null,
      roomLabels: response.output_parsed.roomLabels.map((room) => ({
        ...room,
        centerXRatio: center(room.centerXRatio, room.centerYRatio).xRatio,
        centerYRatio: center(room.centerXRatio, room.centerYRatio).yRatio,
        bbox: ratioBox(room.bbox),
      })),
      roomBoundaries: response.output_parsed.roomBoundaries.map((room) => ({
        ...room,
        points: room.points.map((point) => ratioPoint(point)!),
      })),
      dimensionLabels: response.output_parsed.dimensionLabels.map(
        ({
          extensionStart,
          extensionEnd,
          centerXRatio,
          centerYRatio,
          ...dimension
        }) => ({
          ...dimension,
          centerXRatio: center(centerXRatio, centerYRatio).xRatio,
          centerYRatio: center(centerXRatio, centerYRatio).yRatio,
          bbox: ratioBox(dimension.bbox),
          ...(extensionStart
            ? { extensionStart: ratioPoint(extensionStart)! }
            : {}),
          ...(extensionEnd
            ? { extensionEnd: ratioPoint(extensionEnd)! }
            : {}),
        })
      ),
      openingSymbols: response.output_parsed.openingSymbols.map(
        ({
          spanStart,
          spanEnd,
          centerXRatio,
          centerYRatio,
          ...opening
        }) => ({
          ...opening,
          centerXRatio: center(centerXRatio, centerYRatio).xRatio,
          centerYRatio: center(centerXRatio, centerYRatio).yRatio,
          bbox: ratioBox(opening.bbox),
          ...(spanStart ? { spanStart: ratioPoint(spanStart)! } : {}),
          ...(spanEnd ? { spanEnd: ratioPoint(spanEnd)! } : {}),
        })
      ),
      fixtureSymbols: response.output_parsed.fixtureSymbols.map(
        ({ centerXRatio, centerYRatio, ...fixture }) => ({
          ...fixture,
          centerXRatio: center(centerXRatio, centerYRatio).xRatio,
          centerYRatio: center(centerXRatio, centerYRatio).yRatio,
          bbox: ratioBox(fixture.bbox),
        })
      ),
      entrance: response.output_parsed.entrance
        ? {
            ...response.output_parsed.entrance,
            centerXRatio: center(
              response.output_parsed.entrance.centerXRatio,
              response.output_parsed.entrance.centerYRatio
            ).xRatio,
            centerYRatio: center(
              response.output_parsed.entrance.centerXRatio,
              response.output_parsed.entrance.centerYRatio
            ).yRatio,
          }
        : null,
    },
    "vision"
  );
}

function asEnvelope(candidate: Record<string, unknown> | null): ExtractionEnvelope {
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

function issue(
  id: string,
  code: string,
  message: string,
  severity: FloorPlanReviewIssue["severity"]
): FloorPlanReviewIssue {
  return { id, code, message, severity, resolved: false };
}

function unresolvedIssues(issues: FloorPlanReviewIssue[]) {
  return issues.filter((entry) => !entry.resolved);
}

function makeProvenance(
  sourceId: string,
  pageNumber: number,
  confidence: number,
  basis: "explicit_dimension" | "vector_traced" | "raster_traced" | "inferred",
  note?: string
): FloorPlanEntityProvenanceV2 {
  return {
    confidence,
    extractionVersion: EXTRACTION_VERSION,
    evidence: [
      {
        sourceId,
        basis,
        confidence,
        extractorVersion: EXTRACTION_VERSION,
        pageNumber,
        note,
      },
    ],
    reviewHistory: [],
  };
}

function safeId(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function pointToSegmentDistance(
  point: SourcePointPx,
  start: SourcePointPx,
  end: SourcePointPx
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
  return { distance: Math.hypot(point.x - projected.x, point.y - projected.y), ratio };
}

export type RegisteredPageTopology = {
  rooms: RegisteredRoomBoundary[];
  wallFootprintBandCount: number;
  centerlines: RegisteredWallCenterlineResult;
  openingGaps: RegisteredOpeningGapResult;
  planarFaces: RegisteredPlanarFaceResult;
  visionGuided?: VisionGuidedTopologyResult;
  promotionComplete: boolean;
  promotionBlockers: string[];
};

function addPromotionBlockers(
  topology: RegisteredPageTopology,
  blockers: readonly string[]
): RegisteredPageTopology {
  if (blockers.length === 0) return topology;
  return {
    ...topology,
    rooms: [],
    promotionComplete: false,
    promotionBlockers: [
      ...new Set([...blockers, ...topology.promotionBlockers]),
    ],
  };
}

function unavailableRegisteredPageTopology(
  wallFootprintBandCount: number,
  reason: string
): RegisteredPageTopology {
  return {
    rooms: [],
    wallFootprintBandCount,
    centerlines: {
      centerlines: [],
      diagnostics: {
        status: "bounded_out",
        limitReason: reason,
        inputBandCount: wallFootprintBandCount,
        evaluatedBandCount: 0,
        atomicIntervalCount: 0,
        rejectedThicknessCount: 0,
        junctionExtensionCount: 0,
        centerlineCount: 0,
      },
    },
    openingGaps: {
      gaps: [],
      diagnostics: {
        status: "bounded_out",
        limitReason: reason,
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
      },
    },
    planarFaces: {
      faces: [],
      diagnostics: {
        status: "bounded_out",
        limitReason: reason,
        rawEdgeCount: 0,
        intersectionCheckCount: 0,
        atomicEdgeCount: 0,
        closedFaceCount: 0,
        registeredFaceCount: 0,
        registeredAtomicEdgeCount: 0,
        unusedAtomicEdgeCount: 0,
        ambiguousEdgeCount: 0,
        maxSnapResidualPx: 0,
      },
    },
    promotionComplete: false,
    promotionBlockers: [reason],
  };
}

function applyVisionGuidedFallback(
  topology: RegisteredPageTopology,
  visionGuided: VisionGuidedTopologyResult
): RegisteredPageTopology {
  if (visionGuided.complete) {
    return {
      ...topology,
      rooms: visionGuided.rooms,
      visionGuided,
      promotionComplete: true,
      promotionBlockers: [],
    };
  }
  if (visionGuided.diagnostics.proposalCount === 0) return topology;
  return addPromotionBlockers(
    { ...topology, visionGuided },
    visionGuided.blockers
  );
}

export function registerSupportedPageTopology(
  page: RegisteredPageEvidence,
  scale: PageScaleSolution | null
): RegisteredPageTopology {
  const directRooms = registerRoomBoundaries(page);
  const wallFootprintBands = detectRegisteredWallFootprintBands(page);
  const directCompleteness = directRooms.length
    ? assessRegisteredDirectPathCompleteness(
        page,
        directRooms,
        wallFootprintBands
      )
    : null;
  if (directCompleteness?.complete) {
    return {
      ...unavailableRegisteredPageTopology(
        wallFootprintBands.length,
        "direct_closed_paths_preferred"
      ),
      rooms: directRooms,
      promotionComplete: true,
      promotionBlockers: [],
    };
  }
  const directBlockers = directCompleteness?.blockers ?? [];
  // Registration is pixel-space work. Run it even before scale is solved so a
  // scale failure cannot silently suppress every room proposal and diagnostic.
  const visionGuided = registerVisionGuidedRoomBoundaries(page);
  if (!scale) {
    return addPromotionBlockers(
      {
        ...unavailableRegisteredPageTopology(
          wallFootprintBands.length,
          "scale_unavailable"
        ),
        visionGuided,
      },
      directBlockers
    );
  }
  const centerlines = deriveRegisteredWallCenterlines(
    page,
    wallFootprintBands,
    scale.millimetresPerPixel
  );
  if (centerlines.diagnostics.status !== "complete") {
    return applyVisionGuidedFallback(
      addPromotionBlockers({
        ...unavailableRegisteredPageTopology(
          wallFootprintBands.length,
          centerlines.diagnostics.limitReason ?? "centerline_evidence_unavailable"
        ),
        centerlines,
      }, directBlockers),
      visionGuided
    );
  }
  const openingGaps = detectRegisteredOpeningGaps(
    page,
    centerlines.centerlines,
    scale.millimetresPerPixel
  );
  if (openingGaps.diagnostics.status !== "complete") {
    return applyVisionGuidedFallback(
      addPromotionBlockers({
        ...unavailableRegisteredPageTopology(
          wallFootprintBands.length,
          openingGaps.diagnostics.limitReason ?? "opening_evidence_unavailable"
        ),
        centerlines,
        openingGaps,
      }, directBlockers),
      visionGuided
    );
  }
  const planarFaces = assembleRegisteredPlanarFaces(
    page,
    centerlines.centerlines,
    openingGaps.gaps
  );
  if (planarFaces.diagnostics.status !== "complete") {
    return applyVisionGuidedFallback(
      addPromotionBlockers({
        ...unavailableRegisteredPageTopology(
          wallFootprintBands.length,
          planarFaces.diagnostics.limitReason ?? "planar_faces_unavailable"
        ),
        centerlines,
        openingGaps,
        planarFaces,
      }, directBlockers),
      visionGuided
    );
  }
  const gapById = new Map(openingGaps.gaps.map((gap) => [gap.id, gap]));
  const completeness = assessRegisteredTopologyCompleteness(
    page,
    wallFootprintBands,
    centerlines,
    openingGaps,
    planarFaces
  );
  const registeredRooms: RegisteredRoomBoundary[] = planarFaces.faces.map((face, index) => {
    const sourceFixtures = (page.semantics.fixtureSymbols ?? []).filter(
      (fixture) =>
        fixture.confidence >= 0.5 &&
        pointInPolygon(
          {
            x: fixture.centerXRatio * page.widthPx,
            y: fixture.centerYRatio * page.heightPx,
          },
          face.sourcePoints
        )
    );
    const fixtureIdentity =
      face.sourceLabels.length === 0
        ? inferRoomIdentityFromFixtures(sourceFixtures)
        : null;
    return {
    key: `room-${index + 1}`,
    label: fixtureIdentity?.label ?? face.label,
    roomType: fixtureIdentity?.roomType ?? face.roomType,
    confidence: Math.min(
      face.confidence,
      fixtureIdentity?.confidence ?? face.confidence
    ),
    pathId: face.id,
    bbox: {
      left: Math.min(...face.sourcePoints.map((point) => point.x)),
      top: Math.min(...face.sourcePoints.map((point) => point.y)),
      right: Math.max(...face.sourcePoints.map((point) => point.x)),
      bottom: Math.max(...face.sourcePoints.map((point) => point.y)),
    },
    sourcePoints: face.sourcePoints,
    sourceLabels: face.sourceLabels,
    sourceFixtures,
    registrationKind: "assembled_wall_topology",
    sourceEdges: face.edges.map((edge) => {
      const gap = edge.openingGapId
        ? gapById.get(edge.openingGapId)
        : undefined;
      return {
        evidenceId: edge.evidenceId,
        kind: edge.kind,
        thicknessMm: edge.thicknessMm,
        sourcePathIds: edge.sourcePathIds,
        sourceSegmentIds: edge.sourceSegmentIds,
        opening: gap
          ? {
              id: gap.id,
              kind: gap.kind,
              operation: gap.operation,
              proof: gap.proof,
              widthMm: gap.widthMm,
              confidence: gap.confidence,
              supportPathIds: gap.supportPathIds,
              supportSubpathIds: gap.supportSubpathIds,
              supportSegmentIds: gap.supportSegmentIds,
              supportCurveIds: gap.supportCurveIds,
            }
          : undefined,
      };
    }),
  };
  });
  const deterministicTopology = addPromotionBlockers({
    rooms: completeness.complete ? registeredRooms : [],
    wallFootprintBandCount: wallFootprintBands.length,
    centerlines,
    openingGaps,
    planarFaces,
    promotionComplete: completeness.complete,
    promotionBlockers: completeness.blockers,
  }, completeness.complete ? [] : directBlockers);
  return completeness.complete
    ? deterministicTopology
    : applyVisionGuidedFallback(deterministicTopology, visionGuided);
}

function buildCanonicalCandidate(
  envelope: ExtractionEnvelope,
  jobId: string
): {
  document: FloorPlanDocumentV2;
  issues: FloorPlanReviewIssue[];
  topology: RegisteredPageTopology;
} {
  const issues: FloorPlanReviewIssue[] = [];
  const eligiblePages = envelope.selectedPageNumber
    ? envelope.pages.filter(
        (candidate) => candidate.pageNumber === envelope.selectedPageNumber
      )
    : envelope.pages;
  const ranked = eligiblePages
    .map((page) => {
      const scale =
        envelope.scales?.find((entry) => entry.pageNumber === page.pageNumber) ??
        (envelope.scale?.pageNumber === page.pageNumber ? envelope.scale : null);
      return { page, topology: registerSupportedPageTopology(page, scale) };
    })
    .sort(
      (left, right) =>
        right.topology.rooms.length - left.topology.rooms.length ||
        left.page.pageNumber - right.page.pageNumber
    );
  const selected = ranked[0];
  const page = selected?.page ?? eligiblePages[0];
  const rooms = selected?.topology.rooms ?? [];
  const topology =
    selected?.topology ?? unavailableRegisteredPageTopology(0, "page_unavailable");
  const scale = page
    ? (envelope.scales?.find((entry) => entry.pageNumber === page.pageNumber) ??
      (envelope.scale?.pageNumber === page.pageNumber ? envelope.scale : null))
    : null;
  if (!scale || !page) {
    const solvedOtherPage =
      page &&
      (envelope.scales ?? (envelope.scale ? [envelope.scale] : [])).find(
        (entry) => entry.pageNumber !== page.pageNumber
      );
    issues.push(
      issue(
        "scale-review",
        "scale_unresolved",
        solvedOtherPage
          ? `Dimensions were solved on source page ${solvedOtherPage.pageNumber}, but the selected plan is on page ${page.pageNumber}. Confirm dimensions from this plan page before geometry can be trusted.`
          : "Confirm one known distance. At least two printed dimensions must agree before automatic geometry can be trusted.",
        "critical"
      )
    );
  }
  if (!page || rooms.length === 0) {
    issues.push(
      issue(
        "room-topology-review",
        "room_topology_unresolved",
        topology.wallFootprintBandCount
          ? `${topology.wallFootprintBandCount} source-authored wall-footprint bands yielded ${topology.centerlines.centerlines.length} unambiguous wall centerlines, ${topology.openingGaps.gaps.length} source-supported opening gaps and ${topology.planarFaces.faces.length} closed face candidates, but the complete-plan gate failed (${topology.promotionBlockers.join(", ")}). No partial topology was promoted; continue with registered opening review and guided tracing.`
          : topology.promotionBlockers.length
            ? `Closed source room paths failed the complete-plan gate (${topology.promotionBlockers.join(", ")}). No partial topology was promoted; continue with guided tracing.`
          : "Room boundaries could not be registered to deterministic source linework. Continue with the guided tracing underlay.",
        "critical"
      )
    );
  }

  const sourceId = envelope.source.id;
  const pageNumber = page?.pageNumber ?? 1;
  const millimetresPerPixel = scale?.millimetresPerPixel ?? 1;
  const geometryBasis =
    envelope.source.mimeType === "application/pdf"
      ? ("vector_traced" as const)
      : ("raster_traced" as const);
  const geometryEvidenceName =
    geometryBasis === "vector_traced"
      ? "deterministic PDF vector linework"
      : "deterministic raster linework";
  const vertices: FloorPlanVertexV2[] = [];
  const walls: FloorPlanWallV2[] = [];
  const canonicalRooms: FloorPlanRoomV2[] = [];
  const openings: FloorPlanOpeningV2[] = [];
  const openingByEvidenceId = new Map<string, FloorPlanOpeningV2>();
  const dimensions: FloorPlanDimensionV2[] = [];
  const annotations: FloorPlanAnnotationV2[] = [];
  const vertexByPoint = new Map<string, FloorPlanVertexV2>();
  const wallBySpan = new Map<
    string,
    { wall: FloorPlanWallV2; start: SourcePointPx; end: SourcePointPx }
  >();

  const getVertex = (xPx: number, yPx: number, confidence: number) => {
    const xMm = Math.round(xPx * millimetresPerPixel);
    const zMm = Math.round(yPx * millimetresPerPixel);
    const key = `${xMm}:${zMm}`;
    const existing = vertexByPoint.get(key);
    if (existing) return existing;
    const mergeToleranceMm = Math.max(2, millimetresPerPixel * 0.5);
    const nearby = vertices.find(
      (vertex) =>
        Math.hypot(vertex.xMm - xMm, vertex.zMm - zMm) <=
        mergeToleranceMm
    );
    if (nearby) {
      vertexByPoint.set(key, nearby);
      return nearby;
    }
    const vertex: FloorPlanVertexV2 = {
      id: `v${vertices.length + 1}`,
      xMm,
      zMm,
      provenance: makeProvenance(
        sourceId,
        pageNumber,
        confidence,
        geometryBasis,
        `Snapped to ${geometryEvidenceName}`
      ),
    };
    vertices.push(vertex);
    vertexByPoint.set(key, vertex);
    return vertex;
  };
  const getVertexAtMillimetres = (
    xMm: number,
    zMm: number,
    confidence: number,
    note: string
  ) => {
    const key = `${xMm}:${zMm}`;
    const existing = vertexByPoint.get(key);
    if (existing) return existing;
    const vertex: FloorPlanVertexV2 = {
      id: `v${vertices.length + 1}`,
      xMm,
      zMm,
      provenance: makeProvenance(
        sourceId,
        pageNumber,
        confidence,
        geometryBasis,
        note
      ),
    };
    vertices.push(vertex);
    vertexByPoint.set(key, vertex);
    return vertex;
  };
  const annotatedSourceLabels = new Set<string>();
  const allRoomCorners = rooms.flatMap((room) => room.sourcePoints);
  const splitRoomBoundaryEdges = (room: RegisteredRoomBoundary) =>
    room.sourcePoints.flatMap((sourceStart, side) => {
      const sourceEnd =
        room.sourcePoints[(side + 1) % room.sourcePoints.length];
      const edgeLength = Math.hypot(
        sourceEnd.x - sourceStart.x,
        sourceEnd.y - sourceStart.y
      );
      const candidates = [
        { point: sourceStart, ratio: 0 },
        { point: sourceEnd, ratio: 1 },
        ...allRoomCorners.flatMap((point) => {
          const projected = pointToSegmentDistance(
            point,
            sourceStart,
            sourceEnd
          );
          if (
            projected.distance > 0.75 ||
            projected.ratio <= 0.001 ||
            projected.ratio >= 0.999
          ) {
            return [];
          }
          return [{ point, ratio: projected.ratio }];
        }),
      ].sort((left, right) => left.ratio - right.ratio);
      const unique = candidates.filter(
        (candidate, index) =>
          index === 0 ||
          Math.abs(candidate.ratio - candidates[index - 1].ratio) *
            Math.max(1, edgeLength) >
            0.5
      );
      return unique.slice(0, -1).flatMap((candidate, index) => {
        const next = unique[index + 1];
        if (
          !next ||
          Math.hypot(
            candidate.point.x - next.point.x,
            candidate.point.y - next.point.y
          ) < 0.5
        ) {
          return [];
        }
        return [
          {
            sourceStart: candidate.point,
            sourceEnd: next.point,
            edgeEvidence: room.sourceEdges?.[side],
          },
        ];
      });
    });
  const sourceLabelKey = (label: {
    label: string;
    centerXRatio: number;
    centerYRatio: number;
  }) =>
    `${label.label.trim().toLocaleLowerCase()}:${label.centerXRatio.toFixed(5)}:${label.centerYRatio.toFixed(5)}`;
  const addSourceLabelAnnotation = (
    label: NonNullable<RegisteredRoomBoundary["sourceLabels"]>[number],
    reason: string
  ) => {
    if (!page) return;
    const key = sourceLabelKey(label);
    if (annotatedSourceLabels.has(key)) return;
    annotatedSourceLabels.add(key);
    const labelVertex = getVertex(
      label.centerXRatio * page.widthPx,
      label.centerYRatio * page.heightPx,
      label.confidence
    );
    annotations.push({
      id: `source-space-label-${annotations.length + 1}`,
      kind: "label",
      text: label.label,
      geometry: { kind: "point", vertexId: labelVertex.id },
      configurationId: "source-open-plan-label",
      provenance: makeProvenance(
        sourceId,
        pageNumber,
        label.confidence,
        "inferred",
        reason
      ),
    });
  };

  for (const [roomIndex, detected] of rooms.entries()) {
    // Labels are semantic evidence and may contain a resident name or other
    // private drawing text. Canonical IDs must remain opaque because they are
    // preserved in immutable geometry hashes and public revisions.
    const roomId = `room-${roomIndex + 1}`;
    const roomWalls: FloorPlanRoomV2["wallLoops"][number]["walls"] = [];
    for (const {
      sourceStart,
      sourceEnd,
      edgeEvidence,
    } of splitRoomBoundaryEdges(detected)) {
      const start = getVertex(sourceStart.x, sourceStart.y, detected.confidence);
      const end = getVertex(sourceEnd.x, sourceEnd.y, detected.confidence);
      const forwardKey = `${start.id}:${end.id}`;
      const reverseKey = `${end.id}:${start.id}`;
      const existing = wallBySpan.get(reverseKey) ?? wallBySpan.get(forwardKey);
      if (existing) {
        if (!existing.wall.adjacentRoomIds.includes(roomId)) {
          existing.wall.adjacentRoomIds.push(roomId);
        }
        roomWalls.push({
          wallId: existing.wall.id,
          direction: existing.wall.path.startVertexId === start.id ? "forward" : "reverse",
        });
        if (edgeEvidence?.opening && !openingByEvidenceId.has(edgeEvidence.opening.id)) {
          const wallLengthMm = Math.round(
            Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm)
          );
          const opening: FloorPlanOpeningV2 = {
            id: `opening-${openings.length + 1}`,
            wallId: existing.wall.id,
            kind: edgeEvidence.opening.kind,
            operation: edgeEvidence.opening.operation,
            offsetMm: 0,
            widthMm: wallLengthMm,
            hinge: "unknown",
            handing: "unknown",
            provenance: makeProvenance(
              sourceId,
              pageNumber,
              edgeEvidence.opening.confidence,
              geometryBasis,
              `Opening span registered from ${edgeEvidence.opening.proof} source vectors ${[
                ...edgeEvidence.opening.supportSubpathIds,
                ...edgeEvidence.opening.supportSegmentIds,
                ...edgeEvidence.opening.supportCurveIds,
              ].join(", ")}`
            ),
          };
          openings.push(opening);
          openingByEvidenceId.set(edgeEvidence.opening.id, opening);
        }
        continue;
      }
      const wall: FloorPlanWallV2 = {
        id: `w${walls.length + 1}`,
        path: { kind: "line", startVertexId: start.id, endVertexId: end.id },
        thicknessMm: edgeEvidence?.thicknessMm ?? 200,
        classification: "interior",
        adjacentRoomIds: [roomId],
        provenance: makeProvenance(
          sourceId,
          pageNumber,
          detected.confidence,
          geometryBasis,
          edgeEvidence
            ? `Wall centerline and ${edgeEvidence.thicknessMm} mm thickness paired from source boundaries ${edgeEvidence.sourceSegmentIds.join(", ")}`
            : "Wall path registered from the containing source path; thickness requires review"
        ),
      };
      walls.push(wall);
      wallBySpan.set(forwardKey, { wall, start: sourceStart, end: sourceEnd });
      roomWalls.push({ wallId: wall.id, direction: "forward" });
      if (edgeEvidence?.opening && !openingByEvidenceId.has(edgeEvidence.opening.id)) {
        const wallLengthMm = Math.round(
          Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm)
        );
        const opening: FloorPlanOpeningV2 = {
          id: `opening-${openings.length + 1}`,
          wallId: wall.id,
          kind: edgeEvidence.opening.kind,
          operation: edgeEvidence.opening.operation,
          offsetMm: 0,
          widthMm: wallLengthMm,
          hinge: "unknown",
          handing: "unknown",
          provenance: makeProvenance(
            sourceId,
            pageNumber,
            edgeEvidence.opening.confidence,
            geometryBasis,
            `Opening span registered from ${edgeEvidence.opening.proof} source vectors ${[
              ...edgeEvidence.opening.supportSubpathIds,
              ...edgeEvidence.opening.supportSegmentIds,
              ...edgeEvidence.opening.supportCurveIds,
            ].join(", ")}`
          ),
        };
        openings.push(opening);
        openingByEvidenceId.set(edgeEvidence.opening.id, opening);
      }
    }
    canonicalRooms.push({
      id: roomId,
      name: detected.label,
      roomType: detected.roomType,
      wallLoops: [{ kind: "outer", walls: roomWalls }],
      provenance: makeProvenance(
        sourceId,
        pageNumber,
        detected.confidence,
        geometryBasis,
        (detected.sourceFixtures?.length ?? 0) > 0 &&
          detected.roomType === "toilet"
          ? "Unlabeled bathroom classified from a sanitary fixture cluster; its closed boundary was accepted only after every edge registered to deterministic source wall linework"
          : detected.registrationKind === "assembled_wall_topology"
            ? "Semantic label classified a mathematically closed face assembled only from paired source wall boundaries and supported opening spans"
            : detected.registrationKind === "vision_guided_source_snap"
              ? "Semantic boundary proposal accepted only after every edge snapped to deterministic source linework and the closed-room topology passed validation"
              : `Semantic label associated with a closed ${geometryEvidenceName} path`
      ),
    });
    if ((detected.sourceLabels?.length ?? 0) > 1 && page) {
      for (const sourceLabel of detected.sourceLabels ?? []) {
        addSourceLabelAnnotation(
          sourceLabel,
          "Source room label preserved as an editable open-plan area label"
        );
      }
    }
  }

  // Classification is part of the canonical geometry contract and drives the
  // exterior-only 3D dollhouse cutaway. Older raster candidates marked every
  // wall as interior, which forced the renderer to guess from incomplete room
  // ownership and allowed camera movement to remove room partitions.
  for (const wall of walls) {
    wall.classification =
      wall.adjacentRoomIds.length > 1 ? "interior" : "exterior";
  }

  if (page && canonicalRooms.length > 0) {
    const mappedLabels = new Set(
      rooms.flatMap((room) => (room.sourceLabels ?? []).map(sourceLabelKey))
    );
    for (const sourceLabel of page.semantics.roomLabels) {
      if (mappedLabels.has(sourceLabelKey(sourceLabel))) continue;
      addSourceLabelAnnotation(
        sourceLabel,
        "Printed area label did not map unambiguously to one closed face and was preserved as an editable annotation"
      );
    }
  }

  if (page && walls.length > 0) {
    for (const symbol of page.semantics.openingSymbols) {
      if (symbol.confidence < 0.5) continue;
      const sourcePoint = {
        x: symbol.centerXRatio * page.widthPx,
        y: symbol.centerYRatio * page.heightPx,
      };
      const rankedWalls = [...wallBySpan.values()]
        .map((entry) => ({ entry, ...pointToSegmentDistance(sourcePoint, entry.start, entry.end) }))
        .sort((left, right) => left.distance - right.distance);
      const nearest = rankedWalls[0];
      const secondNearest = rankedWalls.find(
        (entry) => entry.entry.wall.id !== nearest?.entry.wall.id
      );
      const pageDiagonal = Math.hypot(page.widthPx, page.heightPx);
      const hostUnambiguous = Boolean(
        nearest &&
          nearest.distance <= pageDiagonal * 0.04 &&
          (!secondNearest ||
            secondNearest.distance - nearest.distance >
              pageDiagonal * 0.008)
      );
      const addOpeningSuggestion = (
        wallSpan?: { wallId: string; offsetMm: number; widthMm: number }
      ) => {
        const kindLabel = symbol.kind.replace(/_/g, " ");
        const geometry: FloorPlanAnnotationV2["geometry"] = wallSpan
          ? {
              kind: "wall_span",
              wallId: wallSpan.wallId,
              offsetMm: wallSpan.offsetMm,
              widthMm: wallSpan.widthMm,
            }
          : {
              kind: "point",
              vertexId: getVertex(
                sourcePoint.x,
                sourcePoint.y,
                symbol.confidence
              ).id,
            };
        annotations.push({
          id: `source-opening-suggestion-${annotations.length + 1}`,
          kind: "note",
          text: `Possible ${kindLabel}`,
          geometry,
          configurationId: "source-opening-suggestion",
          provenance: makeProvenance(
            sourceId,
            pageNumber,
            symbol.confidence,
            "inferred",
            "Semantic opening retained as an editable suggestion because its source span or host wall was ambiguous"
          ),
        });
      };
      if (!nearest || !hostUnambiguous) {
        addOpeningSuggestion();
        continue;
      }
      const lengthMm = Math.round(segmentLengthPx({
        id: "candidate",
        pageNumber,
        start: nearest.entry.start,
        end: nearest.entry.end,
        strokeWidthPx: 1,
      }) * millimetresPerPixel);
      if (lengthMm < 400) continue;
      if (
        openings.some(
          (opening) =>
            opening.wallId === nearest.entry.wall.id &&
            opening.offsetMm === 0 &&
            opening.widthMm >= lengthMm - 1
        )
      ) continue;
      const requestedWidth = symbol.kind === "window" ? 1200 : 900;
      const sourceSpan =
        symbol.spanStart && symbol.spanEnd
          ? [
              {
                x: symbol.spanStart.xRatio * page.widthPx,
                y: symbol.spanStart.yRatio * page.heightPx,
              },
              {
                x: symbol.spanEnd.xRatio * page.widthPx,
                y: symbol.spanEnd.yRatio * page.heightPx,
              },
            ] as const
          : null;
      const snappedSpan = sourceSpan
        ? sourceSpan.map((point) =>
            pointToSegmentDistance(
              point,
              nearest.entry.start,
              nearest.entry.end
            )
          )
        : null;
      const spanEndpointsSupported =
        snappedSpan?.every(
          (entry) =>
            entry.distance <=
            Math.hypot(page.widthPx, page.heightPx) * 0.025
        ) ?? false;
      const spanWidthMm =
        spanEndpointsSupported && snappedSpan
          ? Math.round(
              Math.abs(snappedSpan[1].ratio - snappedSpan[0].ratio) *
                lengthMm
            )
          : 0;
      const spanSupported =
        spanEndpointsSupported &&
        spanWidthMm >= 300 &&
        spanWidthMm <= Math.min(5_000, lengthMm * 0.8);
      const widthMm = Math.max(
        100,
        Math.min(spanSupported ? spanWidthMm : requestedWidth, lengthMm)
      );
      const centerMm = Math.round(
        (spanSupported && snappedSpan
          ? (snappedSpan[0].ratio + snappedSpan[1].ratio) / 2
          : nearest.ratio) * lengthMm
      );
      const offsetMm = Math.max(0, Math.min(lengthMm - widthMm, centerMm - Math.round(widthMm / 2)));
      const kind = symbol.kind;
      const operation =
        kind === "window" || kind === "vent" || kind === "louvre"
          ? "fixed"
          : kind === "open_passage"
            ? "open"
            : symbol.operation === "unknown" || symbol.operation === "fixed" || symbol.operation === "open"
              ? "swing"
              : symbol.operation;
      if (!spanSupported) {
        addOpeningSuggestion({
          wallId: nearest.entry.wall.id,
          offsetMm,
          widthMm,
        });
        continue;
      }
      if (
        openings.some(
          (opening) =>
            opening.wallId === nearest.entry.wall.id &&
            Math.max(opening.offsetMm, offsetMm) <
              Math.min(
                opening.offsetMm + opening.widthMm,
                offsetMm + widthMm
              )
        )
      ) {
        continue;
      }
      openings.push({
        id: `opening-${openings.length + 1}`,
        wallId: nearest.entry.wall.id,
        kind,
        operation,
        offsetMm,
        widthMm,
        hinge: "unknown",
        handing: "unknown",
        provenance: makeProvenance(
          sourceId,
          pageNumber,
          Math.min(0.65, symbol.confidence),
          "inferred",
          spanSupported
            ? "Semantic opening span snapped to a deterministic host wall; handing needs review"
            : "Symbol classified semantically and snapped to a deterministic wall; width and handing need review"
        ),
      });
    }
  }

  if (page && scale && walls.length > 0) {
    for (const [index, evidence] of (scale.evidence ?? []).entries()) {
      const sourceDx = evidence.end.x - evidence.start.x;
      const sourceDy = evidence.end.y - evidence.start.y;
      const dx = Math.abs(sourceDx);
      const dy = Math.abs(sourceDy);
      const axis: FloorPlanDimensionV2["axis"] =
        Math.min(dx, dy) <= Math.max(1, Math.max(dx, dy) * 0.02)
          ? dx >= dy
            ? "horizontal"
            : "vertical"
          : "aligned";
      const from = getVertexAtMillimetres(
        Math.round(evidence.start.x * millimetresPerPixel),
        Math.round(evidence.start.y * millimetresPerPixel),
        scale.confidence,
        `Printed dimension anchor registered from source span ${evidence.segmentId}`
      );
      const sourceLength = Math.max(1, Math.hypot(sourceDx, sourceDy));
      const direction =
        axis === "horizontal"
          ? { x: sourceDx >= 0 ? 1 : -1, z: 0 }
          : axis === "vertical"
            ? { x: 0, z: sourceDy >= 0 ? 1 : -1 }
            : {
                x: sourceDx / sourceLength,
                z: sourceDy / sourceLength,
              };
      const to = getVertexAtMillimetres(
        Math.round(from.xMm + direction.x * evidence.valueMm),
        Math.round(from.zMm + direction.z * evidence.valueMm),
        scale.confidence,
        `Printed dimension endpoint registered from source span ${evidence.segmentId}; accepted residual ${Math.round(Math.abs(evidence.residualMm))} mm`
      );
      const actual = Math.hypot(to.xMm - from.xMm, to.zMm - from.zMm);
      if (Math.abs(actual - evidence.valueMm) > 1) continue;
      dimensions.push({
        id: `dimension-${index + 1}`,
        fromVertexId: from.id,
        toVertexId: to.id,
        axis,
        measuredMm: evidence.valueMm,
        provenance: makeProvenance(
          sourceId,
          pageNumber,
          scale.confidence,
          "explicit_dimension",
          `Printed dimension registered from source segment ${evidence.segmentId}`
        ),
      });
    }
  }

  if (page) {
    issues.push(
      issue(
        "room-inventory-review",
        "rooms_confirmation",
        `${canonicalRooms.length} closed spaces were produced. ${page.semantics.roomLabels.length} room labels were detected; unnamed spaces use generic Room 1, Room 2 labels and can be named later.`,
        "warning"
      )
    );
  }
  if (page) {
    const detectedCount = page.semantics.dimensionLabels.length;
    const guidance = detectedCount > dimensions.length
      ? "The remaining printed dimensions are suggested follow-up checks."
      : detectedCount > 0
        ? "Confirm that no printed dimension was missed or mapped to the wrong endpoints."
        : "No printed dimensions were detected; the separate scale and minimum-dimension gates must still pass before this layout can be used.";
    issues.push(
      issue(
        "dimension-reconciliation-review",
        "dimensions_confirmation",
        `${dimensions.length} of ${detectedCount} detected printed dimensions were reconciled exactly. ${guidance}`,
        dimensions.length === 0 ? "critical" : "warning"
      )
    );
  }
  issues.push(
    issue(
      "structural-elements-review",
      "structures_confirmation",
      "Confirm every column, shaft, ledge, service strip, void and structural core. None are promoted unless their source boundary is explicit.",
      "warning"
    )
  );

  if (canonicalRooms.length > 0) {
    issues.push(
      issue(
        "exterior-boundary-review",
        "exterior_boundary_confirmation",
        "Confirm the exterior boundary and wall thicknesses against the highlighted source overlay.",
        "critical"
      )
    );
  }
  issues.push(
    issue(
      "opening-review",
      "openings_confirmation",
      openings.length
        ? "Confirm every door, window, passage, vent and louvre. Detected spans are source-snapped but widths and handing remain uncertain."
        : "No complete opening set could be proven. Add or confirm doors, windows, passages, vents and louvres.",
      "warning"
    ),
    issue(
      "entrance-review",
      "entrance_confirmation",
      "Confirm the main entrance and inward/outward orientation.",
      "critical"
    ),
    issue(
      "height-review",
      "assumed_heights_confirmation",
      "Optional 3D defaults remain visibly assumed: 2600 mm walls, 2100 mm doors and 900 mm window sills. Review or replace them later; they do not change the exact 2D room and dimension baseline.",
      "warning"
    )
  );

  const assumed = (valueMm: number) => ({
    valueMm,
    evidence: "assumed" as const,
    provenance: makeProvenance(
      sourceId,
      pageNumber,
      0,
      "inferred",
      "Visible default; not source-verified"
    ),
  });
  const assumedVertical = (valueMm: number) => {
    const { valueMm: _valueMm, ...evidence } = assumed(valueMm);
    return evidence;
  };
  const criticalIssueIds = floorPlanMvpBlockingIssueIds(issues);
  const document: FloorPlanDocumentV2 = {
    schemaVersion: 2,
    units: "mm",
    id: safeId(`import-${jobId}`, "floor-plan-import"),
    revisionId: safeId(`candidate-${jobId}-1`, "candidate-revision"),
    createdAt: new Date().toISOString(),
    verification: { tier: "needs_review", criticalIssueIds },
    sources: [
      {
        id: sourceId,
        kind: envelope.source.mimeType === "application/pdf" ? "pdf" : "raster",
        name: envelope.source.fileName,
        mimeType: envelope.source.mimeType,
        sha256: envelope.source.sha256,
        pageCount: envelope.pages.length,
        widthPx: page?.widthPx,
        heightPx: page?.heightPx,
      },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Level 1",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: 2800,
        slabThicknessMm: 150,
        verticalEvidence: {
          elevation: assumedVertical(0),
          storeyHeight: assumedVertical(2800),
          slabThickness: assumedVertical(150),
        },
        defaults: {
          wallHeight: assumed(2600),
          doorHeight: assumed(2100),
          windowHeight: assumed(1200),
          windowSillHeight: assumed(900),
        },
        calibrations:
          scale && page
            ? [
                {
                  id: "source-registration-1",
                  sourceId,
                  pageNumber: page.pageNumber,
                  imageWidthPx: page.widthPx,
                  imageHeightPx: page.heightPx,
                  controlPoints: [
                    { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
                    {
                      sourcePx: { x: page.widthPx, y: 0 },
                      planMm: {
                        xMm: Math.round(page.widthPx * scale.millimetresPerPixel),
                        zMm: 0,
                      },
                    },
                  ],
                  rmsErrorPx: scale.rmsResidualMm / scale.millimetresPerPixel,
                },
              ]
            : [],
        vertices,
        walls,
        rooms: canonicalRooms,
        openings,
        structures: [],
        annotations,
        dimensions,
      },
    ],
  };
  return { document, issues, topology };
}

export class PdfRasterFloorPlanSourceAdapter implements FloorPlanSourceAdapter {
  readonly id = "pdf-raster-hybrid";
  readonly extractionVersion = EXTRACTION_VERSION;
  private readonly localOcrProvider: FloorPlanLocalOcrProvider | null;

  constructor(options: { localOcrProvider?: FloorPlanLocalOcrProvider | null } = {}) {
    this.localOcrProvider =
      options.localOcrProvider === undefined
        ? createDefaultFloorPlanLocalOcrProvider()
        : options.localOcrProvider;
  }

  supports(source: { mimeType: string }) {
    return ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
      source.mimeType
    );
  }

  async render(source: StoredFloorPlanSource, context: FloorPlanAdapterContext) {
    return source.mimeType === "application/pdf"
      ? renderPdf(source, context)
      : renderRaster(source, context);
  }

  async extract(
    source: StoredFloorPlanSource,
    renderedPages: FloorPlanRenderedPage[],
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult> {
    let rasterEvidence: Awaited<ReturnType<typeof extractRasterEvidence>> | null;
    let pages: RegisteredPageEvidence[];
    if (source.mimeType === "application/pdf") {
      const pdfPages = await extractPdfEvidence(source, renderedPages);
      const weakPageNumbers = new Set(
        pdfPages
          .filter((page) => page.vectorPaths.length === 0)
          .map((page) => page.pageNumber)
      );
      const rasterFallback = weakPageNumbers.size
        ? await extractRasterEvidence(
            source,
            renderedPages.filter((page) => weakPageNumbers.has(page.pageNumber)),
            context
          )
        : null;
      const rasterByPage = new Map(
        (rasterFallback?.pages ?? []).map((page) => [page.pageNumber, page])
      );
      pages = pdfPages.map((page) => {
        const fallback = rasterByPage.get(page.pageNumber);
        if (!fallback || fallback.vectorPaths.length === 0) return page;
        return {
          ...page,
          vectorSegments: fallback.vectorSegments,
          vectorPaths: fallback.vectorPaths,
          semantics: {
            ...page.semantics,
            notes: [...page.semantics.notes, ...fallback.semantics.notes],
          },
        };
      });
      rasterEvidence = rasterFallback
        ? {
            pages: pages.filter((page) => rasterByPage.has(page.pageNumber)),
            diagnostics: rasterFallback.diagnostics,
          }
        : null;
    } else {
      rasterEvidence = await extractRasterEvidence(source, renderedPages, context);
      pages = rasterEvidence.pages;
    }
    const localOcrDiagnostics = await applyLocalOcrEvidence(
      pages,
      renderedPages,
      context,
      this.localOcrProvider
    );
    const semanticPages = rankFloorPlanSemanticPages(pages).slice(
      0,
      MAX_SEMANTIC_PAGES
    );
    const renderedByPage = new Map(
      renderedPages.map((page) => [page.pageNumber, page])
    );
    for (const page of semanticPages) {
      const rendered = renderedByPage.get(page.pageNumber);
      if (!rendered) continue;
      try {
        const semantic = await classifyRenderedPage(rendered, context, "low");
        page.semantics = mergeSemantics(page.semantics, semantic);
      } catch (cause) {
        page.semantics.notes.push(
          `Semantic classification unavailable: ${cause instanceof Error ? cause.message : "unknown error"}`
        );
      }
    }
    const enhanced = isEnhancedFloorPlanImportEnabled();
    const pageCandidates = buildPageCandidates(pages);
    const envelope: ExtractionEnvelope = {
      kind: enhanced
        ? ENHANCED_FLOOR_PLAN_EVIDENCE_KIND
        : "floor_plan_deterministic_evidence_v1",
      source: {
        id: source.id,
        fileName: source.fileName,
        mimeType: source.mimeType,
        sha256: source.sha256,
      },
      pages,
      renderedPages,
      ...(enhanced
        ? {
            pageCandidates,
            selectedPageNumber:
              pageCandidates.length === 1
                ? pageCandidates[0].pageNumber
                : null,
          }
        : {}),
      scale: null,
      scales: [],
      catalogDraftMatch: null,
    };
    const catalogDraftMatch = await matchPrivateUploadToCatalogDraft({
      source,
      renderedPages,
      context,
    });
    envelope.catalogDraftMatch = catalogDraftMatch
      ? catalogFloorPlanDraftMatchReference(catalogDraftMatch)
      : null;
    return {
      candidate: envelope as unknown as Record<string, unknown>,
      sourceManifest: {
        schemaVersion: 1,
        extractorVersion: EXTRACTION_VERSION,
        source: envelope.source,
        privacy: {
          trainingOptIn: context.privacy.trainingBenchmarkOptIn,
          benchmarkOptIn: context.privacy.trainingBenchmarkOptIn,
          consentVersion: context.privacy.trainingBenchmarkConsentVersion,
          consentRecordedAt:
            context.privacy.trainingBenchmarkOptInAt?.toISOString() ?? null,
          consentRevokedAt:
            context.privacy.trainingBenchmarkRevokedAt?.toISOString() ?? null,
          retentionExpiresAt:
            context.privacy.sourceRetentionExpiresAt.toISOString(),
        },
        pages: pages.map((page) => {
          const raster = rasterEvidence?.diagnostics.get(page.pageNumber);
          return {
            pageNumber: page.pageNumber,
            widthPx: page.widthPx,
            heightPx: page.heightPx,
            vectorSegmentCount: page.vectorSegments.length,
            vectorPathCount: page.vectorPaths.length,
            vectorSubpathCount: page.vectorPaths.reduce(
              (total, path) => total + (path.subpaths?.length ?? 0),
              0
            ),
            nativeCurveCommandCount: page.vectorPaths.reduce(
              (total, path) => total + (path.curves?.length ?? 0),
              0
            ),
            sourceFormCount: new Set(
              page.vectorPaths.flatMap((path) => path.sourceFormPath ?? [])
            ).size,
            wallFootprintBandCount:
              detectRegisteredWallFootprintBands(page).length,
            lineworkEvidenceKind: raster ? "raster_linework" : "pdf_vector",
            rasterLineworkConfidence: raster?.confidence ?? null,
            rasterLineworkWeakReason: raster?.weakReason ?? null,
            rasterCycleSearchCapped: raster?.cycleSearchCapped ?? false,
            rasterCycleSearchLimitReason:
              raster?.cycleSearchLimitReason ?? null,
            rasterNormalization:
              raster?.normalization ??
              renderedPages.find(
                (rendered) => rendered.pageNumber === page.pageNumber
              )?.normalization ??
              null,
            positionedTextCount: page.text.length,
            localOcr: localOcrDiagnostics.get(page.pageNumber) ?? {
              providerId: this.localOcrProvider?.id ?? null,
              attempted: false,
              status: this.localOcrProvider ? "not_selected" : "disabled",
              candidateCount: 0,
              elapsedMs: 0,
              truncated: false,
            },
            selectedForSemanticClassification: semanticPages.some(
              (entry) => entry.pageNumber === page.pageNumber
            ),
            selectedForGeometry:
              pageCandidates.length === 1 &&
              pageCandidates[0].pageNumber === page.pageNumber,
            semanticRoomLabelCount: page.semantics.roomLabels.length,
            semanticDimensionCount: page.semantics.dimensionLabels.length,
            semanticOpeningCount: page.semantics.openingSymbols.length,
            semanticFixtureCount: page.semantics.fixtureSymbols?.length ?? 0,
          };
        }),
      },
      reviewIssues: [],
      metrics: {
        pageCount: pages.length,
        vectorPageCount: pages.filter((page) => page.vectorSegments.length > 0).length,
        rasterLineworkPageCount: rasterEvidence
          ? pages.filter((page) => page.vectorSegments.length > 0).length
          : 0,
        localOcrPageCount: [...localOcrDiagnostics.values()].filter(
          (entry) => entry.attempted
        ).length,
        localOcrCandidateCount: [...localOcrDiagnostics.values()].reduce(
          (total, entry) => total + entry.candidateCount,
          0
        ),
        externalVisionEnabled: process.env.FLOOR_PLAN_VISION_ENABLED === "1",
        visionAttempted:
          process.env.FLOOR_PLAN_VISION_ENABLED === "1" &&
          Boolean(process.env.OPENAI_API_KEY),
        visionSucceeded: pages.some((page) =>
          page.semantics.roomLabels.some(
            (entry) => entry.evidenceKind === "vision"
          ) ||
          page.semantics.dimensionLabels.some(
            (entry) => entry.evidenceKind === "vision"
          ) ||
          page.semantics.openingSymbols.some(
            (entry) => entry.evidenceKind === "vision"
          ) ||
          (page.semantics.fixtureSymbols ?? []).some(
            (entry) => entry.evidenceKind === "vision"
          )
        ),
        candidatePlanPageCount: pageCandidates.length,
        labelObservationCount: pages.reduce(
          (total, page) => total + page.semantics.roomLabels.length,
          0
        ),
        roomBoundaryProposalCount: pages.reduce(
          (total, page) =>
            total + (page.semantics.roomBoundaries?.length ?? 0),
          0
        ),
        dimensionObservationCount: pages.reduce(
          (total, page) => total + page.semantics.dimensionLabels.length,
          0
        ),
        openingObservationCount: pages.reduce(
          (total, page) => total + page.semantics.openingSymbols.length,
          0
        ),
        fixtureObservationCount: pages.reduce(
          (total, page) => total + (page.semantics.fixtureSymbols?.length ?? 0),
          0
        ),
        catalogDraftMatched: Boolean(catalogDraftMatch),
        catalogDraftMatchKind: catalogDraftMatch?.matchKind ?? null,
        catalogDraftLayoutId: catalogDraftMatch?.layout.layout_id ?? null,
      },
    };
  }

  async solveScale(
    result: FloorPlanStageResult,
    context?: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult> {
    const envelope = asEnvelope(result.candidate);
    const selectedPages = envelope.selectedPageNumber
      ? envelope.pages.filter(
          (page) => page.pageNumber === envelope.selectedPageNumber
        )
      : envelope.pages;
    if (
      envelope.kind === ENHANCED_FLOOR_PLAN_EVIDENCE_KIND &&
      envelope.selectedPageNumber &&
      context
    ) {
      const selectedPage = selectedPages[0];
      const rendered = envelope.renderedPages?.find(
        (page) => page.pageNumber === selectedPage?.pageNumber
      );
      if (selectedPage && rendered) {
        try {
          const semantic = await classifyRenderedPage(
            rendered,
            context,
            "original",
            selectedPage.semantics.planRegion?.bbox
          );
          selectedPage.semantics = mergeSemantics(
            selectedPage.semantics,
            semantic,
            true
          );
        } catch (cause) {
          selectedPage.semantics.notes.push(
            `Selected-page semantic classification unavailable: ${
              cause instanceof Error ? cause.message : "unknown error"
            }`
          );
        }
      }
    }
    const solutions = selectedPages
      .map((page) => ({ page, solution: solveScaleFromRegisteredEvidence(page) }))
      .filter((entry) => entry.solution !== null)
      .sort(
        (left, right) =>
          (right.solution?.dimensionCount ?? 0) - (left.solution?.dimensionCount ?? 0)
      );
    const best = solutions[0];
    const scales: PageScaleSolution[] = solutions.flatMap(({ page, solution }) =>
      solution
        ? [
            {
              pageNumber: page.pageNumber,
              millimetresPerPixel: solution.millimetresPerPixel,
              dimensionCount: solution.dimensionCount,
              rmsResidualMm: solution.rmsResidualMm,
              confidence: solution.confidence,
              evidence: solution.evidence,
              diagnostics: solution.diagnostics,
            },
          ]
        : []
    );
    const next: ExtractionEnvelope = {
      ...envelope,
      scales,
      scale:
        best?.solution
          ? {
              pageNumber: best.page.pageNumber,
              millimetresPerPixel: best.solution.millimetresPerPixel,
              dimensionCount: best.solution.dimensionCount,
              rmsResidualMm: best.solution.rmsResidualMm,
              confidence: best.solution.confidence,
              evidence: best.solution.evidence,
              diagnostics: best.solution.diagnostics,
            }
          : null,
    };
    return {
      ...result,
      candidate: next as unknown as Record<string, unknown>,
      sourceManifest: result.sourceManifest
        ? {
            ...result.sourceManifest,
            selectedPageNumber: next.selectedPageNumber ?? next.scale?.pageNumber ?? null,
            scale: next.scale
              ? {
                  pageNumber: next.scale.pageNumber,
                  dimensionCount: next.scale.dimensionCount,
                  rmsResidualMm: next.scale.rmsResidualMm,
                  confidence: next.scale.confidence,
                  diagnostics: next.scale.diagnostics ?? null,
                }
              : null,
            pages: Array.isArray(result.sourceManifest.pages)
              ? result.sourceManifest.pages.map((value) => {
                  if (!value || typeof value !== "object" || Array.isArray(value)) {
                    return value;
                  }
                  const page = value as Record<string, unknown>;
                  return {
                    ...page,
                    selectedForGeometry:
                      page.pageNumber ===
                      (next.selectedPageNumber ?? next.scale?.pageNumber),
                  };
                })
              : result.sourceManifest.pages,
          }
        : result.sourceManifest,
      metrics: {
        ...result.metrics,
        scaleSolved: Boolean(next.scale),
        scaleDimensionCount: next.scale?.dimensionCount ?? 0,
        scaleResidualMm: next.scale?.rmsResidualMm ?? null,
        scaleSingleSegmentCandidateCount:
          next.scale?.diagnostics?.singleSegmentCandidateCount ?? 0,
        scaleCompoundSpanCandidateCount:
          next.scale?.diagnostics?.compoundSpanCandidateCount ?? 0,
        scaleUnsupportedSpanCount:
          next.scale?.diagnostics?.rejectedUnsupportedSpan ?? 0,
      },
    };
  }

  async buildTopology(
    result: FloorPlanStageResult,
    context: FloorPlanAdapterContext
  ): Promise<FloorPlanStageResult> {
    const envelope = asEnvelope(result.candidate);
    const matchedCatalogDraft = envelope.catalogDraftMatch
      ? resolveCatalogFloorPlanDraftMatch(envelope.catalogDraftMatch)
      : null;
    if (matchedCatalogDraft) {
      const source = await context.store.readSource(envelope.source.id);
      const page = envelope.pages[0];
      const matched = source && page
        ? buildSourceBoundCatalogDraft({
            match: matchedCatalogDraft,
            source,
            page,
            jobId: context.jobId,
          })
        : null;
      if (matched) {
        return {
          ...result,
          candidate: matched.document as unknown as Record<string, unknown>,
          reviewIssues: [...result.reviewIssues, ...matched.reviewIssues],
          metrics: {
            ...result.metrics,
            roomCount: matched.document.floors[0]?.rooms.length ?? 0,
            wallCount: matched.document.floors[0]?.walls.length ?? 0,
            openingCount: matched.document.floors[0]?.openings.length ?? 0,
            catalogDraftMatched: true,
            catalogDraftMatchKind: matchedCatalogDraft.matchKind,
            catalogDraftLayoutId: matchedCatalogDraft.layout.layout_id,
          },
        };
      }
    }
    const built = buildCanonicalCandidate(envelope, context.jobId);
    return {
      ...result,
      candidate: built.document as unknown as Record<string, unknown>,
      reviewIssues: [...result.reviewIssues, ...built.issues],
      metrics: {
        ...result.metrics,
        roomCount: built.document.floors[0]?.rooms.length ?? 0,
        wallCount: built.document.floors[0]?.walls.length ?? 0,
        openingCount: built.document.floors[0]?.openings.length ?? 0,
        exteriorWallCount:
          built.document.floors[0]?.walls.filter(
            (wall) => wall.classification === "exterior"
          ).length ?? 0,
        sharedInteriorWallCount:
          built.document.floors[0]?.walls.filter(
            (wall) =>
              wall.classification === "interior" &&
              wall.adjacentRoomIds.length > 1
          ).length ?? 0,
        shortWallOwnershipSpanCount:
          built.document.floors[0]?.walls.filter((wall) => {
            if (wall.path.kind !== "line") return false;
            const floor = built.document.floors[0];
            const start = floor?.vertices.find(
              (vertex) => vertex.id === wall.path.startVertexId
            );
            const end = floor?.vertices.find(
              (vertex) => vertex.id === wall.path.endVertexId
            );
            return Boolean(
              start &&
                end &&
                Math.hypot(
                  end.xMm - start.xMm,
                  end.zMm - start.zMm
                ) < wall.thicknessMm
            );
          }).length ?? 0,
        geometrySnapRejectCount:
          built.topology.visionGuided?.diagnostics.rejectedProposalCount ?? 0,
        geometryInvalidProposalRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .invalidProposal ?? 0,
        geometryPlanRegionRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .outsidePlanRegion ?? 0,
        geometryUnsupportedEdgeRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .unsupportedEdge ?? 0,
        geometryCornerRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .unsnappableCorner ?? 0,
        geometryPolygonRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .invalidPolygon ?? 0,
        geometryLabelRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .ambiguousLabel ?? 0,
        geometryFixtureConflictRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .incompatibleFixtureCluster ?? 0,
        geometryResidualRejectCount:
          built.topology.visionGuided?.diagnostics.rejectionCounts
            .excessiveResidual ?? 0,
        geometryMedianSourceDeviationPx:
          built.topology.visionGuided?.diagnostics
            .medianSourceDeviationPx ?? 0,
        geometryMaxSourceDeviationPx:
          built.topology.visionGuided?.diagnostics.maxSourceDeviationPx ?? 0,
        wallFootprintBandCount: envelope.pages.reduce(
          (total, page) =>
            total + detectRegisteredWallFootprintBands(page).length,
          0
        ),
        registeredWallCenterlineCount:
          built.topology.centerlines.centerlines.length,
        registeredOpeningGapCount: built.topology.openingGaps.gaps.length,
        registeredOpeningGapOperations:
          built.topology.openingGaps.gaps
            .map((gap) => gap.operation)
            .join(","),
        registeredOpeningGapProofs:
          built.topology.openingGaps.gaps
            .map((gap) => gap.proof)
            .join(","),
        registeredSwingSymbolMatchCount:
          built.topology.openingGaps.diagnostics.sourceSymbolMatchCounts.swing,
        registeredSlidingSymbolMatchCount:
          built.topology.openingGaps.diagnostics.sourceSymbolMatchCounts.sliding,
        registeredFoldingSymbolMatchCount:
          built.topology.openingGaps.diagnostics.sourceSymbolMatchCounts.folding,
        registeredFixedSymbolMatchCount:
          built.topology.openingGaps.diagnostics.sourceSymbolMatchCounts.fixed,
        registeredPlanarFaceCount: built.topology.planarFaces.faces.length,
        registeredCenterlineStatus:
          built.topology.centerlines.diagnostics.status,
        registeredOpeningGapStatus:
          built.topology.openingGaps.diagnostics.status,
        registeredPlanarFaceStatus:
          built.topology.planarFaces.diagnostics.status,
        registeredTopologyPromotionComplete:
          built.topology.promotionComplete,
        registeredTopologyPromotionBlockers:
          built.topology.promotionBlockers.join(","),
      },
    };
  }

  async validate(result: FloorPlanStageResult): Promise<FloorPlanStageResult> {
    const document = result.candidate as unknown as FloorPlanDocumentV2;
    const criticalIssueIds = floorPlanMvpBlockingIssueIds(
      unresolvedIssues(result.reviewIssues)
    );
    return {
      ...result,
      candidate: {
        ...document,
        verification: {
          tier: "needs_review",
          criticalIssueIds,
        },
      } as unknown as Record<string, unknown>,
    };
  }
}
