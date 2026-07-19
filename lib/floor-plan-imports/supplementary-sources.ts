import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanSourceV2,
} from "@/lib/floor-plan-document-v2";
import {
  compileCandidateFloorPlanDocumentV2,
  parseRenderedPages,
} from "./validation";
import type { FloorPlanRenderedPage } from "./types";
import {
  FLOOR_PLAN_SOURCE_MIME_TYPES,
  type FloorPlanSourceMimeType,
} from "./types";

export const FLOOR_PLAN_SUPPLEMENTARY_SOURCE_MIME_TYPES =
  FLOOR_PLAN_SOURCE_MIME_TYPES;

export type FloorPlanSupplementarySourceMimeType = FloorPlanSourceMimeType;

export type FloorPlanSupplementarySourceDescriptor = {
  id: string;
  fileName: string;
  mimeType: FloorPlanSupplementarySourceMimeType;
  sha256: string;
};

export type FloorPlanSupplementarySourceAttachment = {
  sourceAsset: FloorPlanSupplementarySourceDescriptor;
  renderedPages: readonly FloorPlanRenderedPage[];
};

export type PersistedFloorPlanSupplementarySource = {
  attachedToCandidateAt: Date | string | null;
  renderedPagesJson: unknown;
  sourceAsset: {
    id: string;
    fileName: string;
    mimeType: string;
    sha256: string;
    contentDeletedAt?: Date | string | null;
  };
};

export class FloorPlanSupplementarySourceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`FLOOR_PLAN_SUPPLEMENTARY_SOURCE_${code}: ${message}`);
    this.name = "FloorPlanSupplementarySourceError";
  }
}

function fail(code: string, message: string): never {
  throw new FloorPlanSupplementarySourceError(code, message);
}

export function isFloorPlanSupplementarySourceMimeType(
  mimeType: string
): mimeType is FloorPlanSupplementarySourceMimeType {
  return (FLOOR_PLAN_SUPPLEMENTARY_SOURCE_MIME_TYPES as readonly string[]).includes(
    mimeType
  );
}

export function parseAttachedFloorPlanSupplementarySources(
  rows: readonly PersistedFloorPlanSupplementarySource[]
) {
  return rows
    .filter(
      (row) => row.attachedToCandidateAt && !row.sourceAsset.contentDeletedAt
    )
    .map((row) => ({
      sourceAsset: row.sourceAsset,
      renderedPages: parseSupplementaryRenderedPages(row.renderedPagesJson),
    }));
}

export function parseSupplementaryRenderedPages(value: unknown) {
  // Keep the canonical validation and uniqueness limits identical to primary
  // rendered pages rather than trusting attachment-provided metadata.
  return parseRenderedPages(value);
}

function entityProvenances(
  document: FloorPlanDocumentV2
): FloorPlanEntityProvenanceV2[] {
  return document.floors.flatMap((floor) => [
    ...Object.values(floor.defaults).map((property) => property.provenance),
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
    ...floor.annotations.map((entity) => entity.provenance),
    ...floor.dimensions.map((entity) => entity.provenance),
  ]);
}

function sourceIsGeometryAuthority(document: FloorPlanDocumentV2, sourceId: string) {
  return (
    document.floors.some((floor) =>
      floor.calibrations.some((calibration) => calibration.sourceId === sourceId)
    ) ||
    entityProvenances(document).some((provenance) =>
      provenance.evidence.some((evidence) => evidence.sourceId === sourceId)
    )
  );
}

function canonicalSource(
  attachment: FloorPlanSupplementarySourceAttachment
): FloorPlanSourceV2 {
  const pages = attachment.renderedPages;
  if (!pages.length) fail("UNRENDERED", "supplementary evidence has no rendered pages");
  const { sourceAsset } = attachment;
  return {
    id: sourceAsset.id,
    kind:
      sourceAsset.mimeType === "application/pdf"
        ? "pdf"
        : sourceAsset.mimeType.startsWith("image/")
          ? "raster"
          : "cad",
    name: sourceAsset.fileName,
    mimeType: sourceAsset.mimeType,
    sha256: sourceAsset.sha256.toLowerCase(),
    pageCount: pages.length,
    ...(pages.length === 1
      ? { widthPx: pages[0].widthPx, heightPx: pages[0].heightPx }
      : {}),
  };
}

/**
 * Server-authorized canonical-source attachment. A same-hash manifest
 * placeholder may be replaced, but a supplementary source can never take over
 * geometry calibration or entity provenance from the primary plan source.
 */
export function attachFloorPlanSupplementarySource(input: {
  document: FloorPlanDocumentV2;
  primarySourceId: string;
  attachment: FloorPlanSupplementarySourceAttachment;
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  if (document.verification.tier !== "needs_review") {
    fail("IMMUTABLE", "only a needs-review candidate can attach evidence");
  }
  const durable = canonicalSource(input.attachment);
  if (durable.id === input.primarySourceId) {
    fail("PRIMARY_SOURCE", "supplementary evidence cannot replace the primary source");
  }

  const byId = document.sources.find((source) => source.id === durable.id);
  if (byId) {
    if (
      byId.sha256?.toLowerCase() !== durable.sha256 ||
      byId.mimeType !== durable.mimeType ||
      byId.kind !== durable.kind
    ) {
      fail("SOURCE_COLLISION", "the durable source ID conflicts with candidate provenance");
    }
    document.sources = document.sources.map((source) =>
      source.id === durable.id ? durable : source
    );
    compileCandidateFloorPlanDocumentV2(document);
    return document;
  }

  const placeholders = document.sources.filter(
    (source) =>
      source.id !== input.primarySourceId &&
      source.sha256?.toLowerCase() === durable.sha256 &&
      source.mimeType === durable.mimeType
  );
  if (placeholders.length > 1) {
    fail("AMBIGUOUS_PLACEHOLDER", "multiple candidate sources claim the uploaded hash");
  }
  const placeholder = placeholders[0];
  if (placeholder && sourceIsGeometryAuthority(document, placeholder.id)) {
    fail(
      "GEOMETRY_AUTHORITY",
      "supplementary evidence cannot own calibrations or canonical entity evidence"
    );
  }
  document.sources = placeholder
    ? document.sources.map((source) =>
        source.id === placeholder.id ? durable : source
      )
    : [...document.sources, durable];
  compileCandidateFloorPlanDocumentV2(document);
  return document;
}

export function removeFloorPlanSupplementarySource(input: {
  document: FloorPlanDocumentV2;
  primarySourceId: string;
  sourceAssetId: string;
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  if (document.verification.tier !== "needs_review") {
    fail("IMMUTABLE", "only a needs-review candidate can remove evidence");
  }
  if (input.sourceAssetId === input.primarySourceId) {
    fail("PRIMARY_SOURCE", "the primary geometry source cannot be removed here");
  }
  if (sourceIsGeometryAuthority(document, input.sourceAssetId)) {
    fail(
      "GEOMETRY_AUTHORITY",
      "remove supplementary calibrations or entity evidence before detaching the source"
    );
  }
  document.sources = document.sources.filter(
    (source) => source.id !== input.sourceAssetId
  );
  compileCandidateFloorPlanDocumentV2(document);
  return document;
}
