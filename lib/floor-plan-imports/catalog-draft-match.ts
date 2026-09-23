import { createHash } from "node:crypto";
import { catalogV1LayoutToFloorPlanDocumentV2 } from "@/lib/floor-plan-catalog-v1-adapter";
import type {
  FloorPlanDimensionV2,
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanSourceCalibrationPointV2,
} from "@/lib/floor-plan-document-v2";
import {
  getAllFloorPlanLibraryCatalogs,
  type FloorPlanLibraryCatalogEntry,
} from "@/lib/floor-plan-library-yaml";
import type {
  FloorPlanLibraryCatalog,
  FloorPlanLibraryLayout,
} from "@/lib/floor-plan-library-schema";
import type {
  PageSemanticEvidence,
  RegisteredPageEvidence,
} from "./deterministic-evidence";
import { readCatalogFloorPlanPreviewAsset } from "./catalog-preview-asset";
import type {
  FloorPlanAdapterContext,
  StoredFloorPlanSource,
} from "./source-adapter";
import type { FloorPlanRenderedPage, FloorPlanReviewIssue } from "./types";

const MATCHER_VERSION = "catalog-private-draft-match-1";
const SIGNATURE_SIZE = 64;
const MAX_VISUAL_DIFFERENCE = 0.018;
const MIN_VISUAL_MARGIN = 0.008;

export type CatalogFloorPlanDraftMatch = {
  catalog: FloorPlanLibraryCatalogEntry;
  layout: FloorPlanLibraryLayout;
  matchKind: "exact_preview_hash" | "unique_visual_match";
  visualDifference: number;
};

export type CatalogFloorPlanDraftMatchReference = {
  planId: string;
  layoutId: string;
  matchKind: CatalogFloorPlanDraftMatch["matchKind"];
  visualDifference: number;
};

export function catalogFloorPlanDraftMatchReference(
  match: CatalogFloorPlanDraftMatch
): CatalogFloorPlanDraftMatchReference {
  return {
    planId: match.catalog.floor_plan.plan_id,
    layoutId: match.layout.layout_id,
    matchKind: match.matchKind,
    visualDifference: match.visualDifference,
  };
}

export function resolveCatalogFloorPlanDraftMatch(
  reference: CatalogFloorPlanDraftMatchReference
): CatalogFloorPlanDraftMatch | null {
  const catalog = getAllFloorPlanLibraryCatalogs().find(
    (entry) => entry.floor_plan.plan_id === reference.planId
  );
  const layout = catalog?.layouts.find(
    (entry) => entry.layout_id === reference.layoutId
  );
  return catalog && layout
    ? {
        catalog,
        layout,
        matchKind: reference.matchKind,
        visualDifference: reference.visualDifference,
      }
    : null;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

type PreviewCandidate = {
  catalog: FloorPlanLibraryCatalogEntry;
  layout: FloorPlanLibraryLayout;
  bytes: Uint8Array;
};

function loadPreviewCandidates(): PreviewCandidate[] {
  return getAllFloorPlanLibraryCatalogs().flatMap((catalog) =>
    catalog.layouts.flatMap((layout) => {
      const bytes = readCatalogFloorPlanPreviewAsset(layout.preview_url);
      if (!bytes) return [];
      return [{
        catalog,
        layout,
        bytes,
      }];
    })
  );
}

async function rasterSignature(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");
  const rendered = await sharp(bytes)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .trim({ background: "#ffffff", threshold: 16 })
    .resize({
      width: SIGNATURE_SIZE,
      height: SIGNATURE_SIZE,
      fit: "contain",
      background: "#ffffff",
    })
    .raw()
    .toBuffer();
  return new Uint8Array(rendered);
}

export function floorPlanRasterSignatureDifference(
  left: Uint8Array,
  right: Uint8Array
) {
  if (left.length === 0 || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += Math.abs(left[index] - right[index]);
  }
  return difference / left.length / 255;
}

/**
 * Matches only private uploads to an existing editable draft. Exact bytes are
 * preferred; re-encoded rasters need both a low visual error and a clear lead
 * over the next layout. An ambiguous near-duplicate always falls back to the
 * normal detection/review workflow.
 */
export async function matchPrivateUploadToCatalogDraft(input: {
  source: StoredFloorPlanSource;
  renderedPages: FloorPlanRenderedPage[];
  context: FloorPlanAdapterContext;
}): Promise<CatalogFloorPlanDraftMatch | null> {
  const previews = loadPreviewCandidates();
  const exact = previews.find((candidate) => sha256(candidate.bytes) === input.source.sha256);
  if (exact) {
    return {
      catalog: exact.catalog,
      layout: exact.layout,
      matchKind: "exact_preview_hash",
      visualDifference: 0,
    };
  }
  if (input.renderedPages.length !== 1 || !input.context.store.readDerivative) {
    return null;
  }
  const derivative = await input.context.store.readDerivative(
    input.renderedPages[0].assetKey
  );
  if (!derivative?.bytes.length) return null;
  try {
    const sourceSignature = await rasterSignature(derivative.bytes);
    const scored = await Promise.all(
      previews.map(async (candidate) => ({
        candidate,
        difference: floorPlanRasterSignatureDifference(
          sourceSignature,
          await rasterSignature(candidate.bytes)
        ),
      }))
    );
    scored.sort((left, right) => left.difference - right.difference);
    const best = scored[0];
    const runnerUp = scored[1];
    if (
      !best ||
      best.difference > MAX_VISUAL_DIFFERENCE ||
      (runnerUp && runnerUp.difference - best.difference < MIN_VISUAL_MARGIN)
    ) {
      return null;
    }
    return {
      catalog: best.candidate.catalog,
      layout: best.candidate.layout,
      matchKind: "unique_visual_match",
      visualDifference: best.difference,
    };
  } catch {
    return null;
  }
}

function normalizedLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function inferredRoomType(value: string) {
  const normalized = value.toLowerCase();
  if (/bed/.test(normalized)) return "bedroom";
  if (/kitchen/.test(normalized)) return "kitchen";
  if (/bath|wc|toilet/.test(normalized)) return "toilet";
  if (/shelter|store/.test(normalized)) return "shelter";
  if (/living/.test(normalized)) return "living";
  if (/dining/.test(normalized)) return "dining";
  if (/study/.test(normalized)) return "study";
  return "other";
}

function labelMatchScore(
  room: FloorPlanLibraryLayout["template"]["rooms"][number],
  semantic: PageSemanticEvidence["roomLabels"][number]
) {
  const roomLabel = normalizedLabel(room.source_label ?? room.name ?? room.id);
  const semanticLabel = normalizedLabel(semantic.label);
  if (roomLabel === semanticLabel) return 4;
  if (roomLabel.includes(semanticLabel) || semanticLabel.includes(roomLabel)) return 3;
  return inferredRoomType(room.source_label ?? room.name ?? room.id) === semantic.roomType
    ? 1
    : 0;
}

function calibrationControls(
  layout: FloorPlanLibraryLayout,
  page: RegisteredPageEvidence
) {
  const usedSemanticIndexes = new Set<number>();
  const controls: FloorPlanSourceCalibrationPointV2[] = [];
  const orderedRooms = [
    ...layout.template.rooms.filter((room) => !room.plan_polygon),
    ...layout.template.rooms.filter((room) => room.plan_polygon),
  ];
  for (const room of orderedRooms) {
    const best = page.semantics.roomLabels
      .map((semantic, index) => ({
        semantic,
        index,
        score: usedSemanticIndexes.has(index) ? 0 : labelMatchScore(room, semantic),
      }))
      .filter((entry) => entry.score > 0 && entry.semantic.confidence >= 0.45)
      .sort((left, right) => right.score - left.score || right.semantic.confidence - left.semantic.confidence)[0];
    if (!best) continue;
    usedSemanticIndexes.add(best.index);
    controls.push({
      sourcePx: {
        x: best.semantic.centerXRatio * page.widthPx,
        y: best.semantic.centerYRatio * page.heightPx,
      },
      planMm: {
        xMm: Math.round(room.x * 1_000),
        zMm: Math.round(room.z * 1_000),
      },
    });
  }
  return controls;
}

function roomVertexIds(floor: FloorPlanFloorV2, roomId: string) {
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const room = floor.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return [];
  return [...new Set(room.wallLoops.flatMap((loop) =>
    loop.walls.flatMap((reference) => {
      const wall = wallById.get(reference.wallId);
      if (!wall) return [];
      return wall.path.kind === "line"
        ? [wall.path.startVertexId, wall.path.endVertexId]
        : [wall.path.startVertexId, wall.path.endVertexId, wall.path.centerVertexId];
    })
  ))];
}

function explicitDimensionProvenance(
  sourceId: string,
  pageNumber: number,
  confidence: number,
  label: string
): FloorPlanEntityProvenanceV2 {
  return {
    confidence,
    extractionVersion: MATCHER_VERSION,
    evidence: [{
      sourceId,
      basis: "explicit_dimension",
      confidence,
      extractorVersion: MATCHER_VERSION,
      pageNumber,
      note: `${label} was read from the matched private source and reconciled exactly to the editable draft.`,
    }],
    reviewHistory: [],
  };
}

function addDetectedDimensions(input: {
  floor: FloorPlanFloorV2;
  layout: FloorPlanLibraryLayout;
  page: RegisteredPageEvidence;
  sourceId: string;
}) {
  const vertexById = new Map(input.floor.vertices.map((vertex) => [vertex.id, vertex]));
  const detected = input.page.semantics.dimensionLabels.filter(
    (dimension) => dimension.confidence >= 0.45
  );
  const dimensions: FloorPlanDimensionV2[] = [];
  const usedGeometry = new Set<string>();
  for (const room of input.layout.template.rooms) {
    const ids = roomVertexIds(input.floor, room.id);
    for (const axis of ["horizontal", "vertical"] as const) {
      const requestedMm = Math.round(
        (axis === "horizontal" ? room.width : room.depth) * 1_000
      );
      const semantic = detected
        .filter((entry) => entry.valueMm === requestedMm)
        .sort((left, right) => right.confidence - left.confidence)[0];
      if (!semantic) continue;
      const pairs = ids.flatMap((fromId, fromIndex) =>
        ids.slice(fromIndex + 1).map((toId) => ({
          from: vertexById.get(fromId)!,
          to: vertexById.get(toId)!,
        }))
      );
      const pair = pairs.find(({ from, to }) =>
        axis === "horizontal"
          ? from.zMm === to.zMm && Math.abs(to.xMm - from.xMm) === requestedMm
          : from.xMm === to.xMm && Math.abs(to.zMm - from.zMm) === requestedMm
      );
      if (!pair) continue;
      const ordered = [pair.from.id, pair.to.id].sort();
      const key = `${axis}:${ordered.join(":")}`;
      if (usedGeometry.has(key)) continue;
      usedGeometry.add(key);
      dimensions.push({
        id: `matched-dimension-${dimensions.length + 1}`,
        label: `${room.source_label ?? room.name ?? room.id} ${axis}`,
        fromVertexId: pair.from.id,
        toVertexId: pair.to.id,
        axis,
        measuredMm: requestedMm,
        provenance: explicitDimensionProvenance(
          input.sourceId,
          input.page.pageNumber,
          semantic.confidence,
          `${requestedMm} mm`
        ),
      });
    }
  }
  input.floor.dimensions = dimensions;
}

function uploadedSourceKind(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf" as const;
  if (mimeType.startsWith("image/")) return "raster" as const;
  return "cad" as const;
}

function matchedDraftIssues(
  match: CatalogFloorPlanDraftMatch,
  dimensionCount: number
): FloorPlanReviewIssue[] {
  return [
    {
      id: "catalog-draft-match-review",
      code: "rooms_confirmation",
      message: `Matched ${match.layout.label} to an existing editable draft (${match.matchKind === "exact_preview_hash" ? "identical source image" : `unique visual match, ${(match.visualDifference * 100).toFixed(2)}% difference`}). Rooms and walls are ready for designing; verify them against site measurements before construction.`,
      severity: "warning",
      resolved: false,
    },
    {
      id: "catalog-draft-dimension-review",
      code: "dimensions_confirmation",
      message: `${dimensionCount} printed dimension${dimensionCount === 1 ? " was" : "s were"} reconciled exactly to the editable draft. Check any remaining labels when convenient.`,
      severity: "warning",
      resolved: false,
    },
    {
      id: "catalog-draft-opening-review",
      code: "openings_confirmation",
      message: "Door and window positions came from the matched editable draft. Confirm handing, sill heights and any renovation changes before relying on them.",
      severity: "warning",
      resolved: false,
    },
    {
      id: "catalog-draft-height-review",
      code: "assumed_heights_confirmation",
      message: "The 3D plan uses visibly assumed wall, door and window heights until you replace them with measured values.",
      severity: "warning",
      resolved: false,
    },
  ];
}

/** Builds a private, source-bound design draft without publishing the catalog fixture. */
export function buildSourceBoundCatalogDraft(input: {
  match: CatalogFloorPlanDraftMatch;
  source: StoredFloorPlanSource;
  page: RegisteredPageEvidence;
  jobId: string;
}): { document: FloorPlanDocumentV2; reviewIssues: FloorPlanReviewIssue[] } | null {
  const adapted = catalogV1LayoutToFloorPlanDocumentV2(
    input.match.catalog as FloorPlanLibraryCatalog,
    input.match.layout,
    {
      createdAt: new Date().toISOString(),
      documentId: `import-${input.jobId}`,
      revisionId: `candidate-${input.jobId}-matched-1`,
    }
  );
  const document = structuredClone(adapted.document);
  const floor = document.floors[0];
  if (!floor) return null;
  const controls = calibrationControls(input.match.layout, input.page);
  if (controls.length < 2) return null;
  document.sources = [
    {
      id: input.source.id,
      kind: uploadedSourceKind(input.source.mimeType),
      name: input.source.fileName,
      mimeType: input.source.mimeType,
      sha256: input.source.sha256,
      pageCount: 1,
      widthPx: input.page.widthPx,
      heightPx: input.page.heightPx,
    },
    ...document.sources,
  ];
  floor.name = input.match.layout.label;
  floor.calibrations = [{
    id: "matched-source-registration-1",
    sourceId: input.source.id,
    pageNumber: input.page.pageNumber,
    imageWidthPx: input.page.widthPx,
    imageHeightPx: input.page.heightPx,
    controlPoints: controls,
  }];
  addDetectedDimensions({
    floor,
    layout: input.match.layout,
    page: input.page,
    sourceId: input.source.id,
  });
  if (floor.dimensions.length === 0) return null;
  document.verification = { tier: "needs_review", criticalIssueIds: [] };
  return {
    document,
    reviewIssues: matchedDraftIssues(input.match, floor.dimensions.length),
  };
}
