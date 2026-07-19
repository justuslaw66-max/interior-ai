import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanSourceKindV2,
  FloorPlanSourceV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanConstructionEvidenceKind } from "./construction-vertical-evidence";
import { FLOOR_PLAN_SOURCE_MIME_TYPES } from "./types";

export type PersistedFloorPlanConstructionSource = {
  evidenceKind: string;
  authorizedAt: Date | string;
  authorizedByEmail: string | null;
  attachedToCandidateAt: Date | string;
  sourceAsset: {
    id: string;
    fileName: string;
    mimeType: string;
    sha256: string;
    contentDeletedAt?: Date | string | null;
  };
};

export type AttachedFloorPlanConstructionSource = {
  evidenceKind: FloorPlanConstructionEvidenceKind;
  authorizedAt: Date | string;
  authorizedByEmail: string;
  sourceAsset: PersistedFloorPlanConstructionSource["sourceAsset"];
};

export class FloorPlanConstructionSourceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`FLOOR_PLAN_CONSTRUCTION_SOURCE_${code}: ${message}`);
    this.name = "FloorPlanConstructionSourceError";
  }
}

function fail(code: string, message: string): never {
  throw new FloorPlanConstructionSourceError(code, message);
}

export function isFloorPlanConstructionEvidenceKind(
  value: string
): value is FloorPlanConstructionEvidenceKind {
  return value === "unit_cad" || value === "as_built" || value === "site_measurement";
}

function isCadMimeType(mimeType: string) {
  return /(?:dxf|dwg|acad|autocad|ifc|step)/i.test(mimeType);
}

export function assertFloorPlanConstructionSourceFormat(
  evidenceKind: FloorPlanConstructionEvidenceKind,
  mimeType: string
) {
  if (!(FLOOR_PLAN_SOURCE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    fail("UNSUPPORTED_FORMAT", "the evidence file format is not supported");
  }
  if (evidenceKind === "unit_cad" && !isCadMimeType(mimeType)) {
    fail("CAD_REQUIRED", "unit CAD evidence must be DXF, DWG, IFC, or STEP");
  }
  if (evidenceKind === "site_measurement" && isCadMimeType(mimeType)) {
    fail(
      "REPORT_REQUIRED",
      "site-measurement evidence must be a signed PDF or image report"
    );
  }
}

function canonicalKind(
  evidenceKind: FloorPlanConstructionEvidenceKind
): Extract<FloorPlanSourceKindV2, "cad" | "as_built" | "site_measurement"> {
  if (evidenceKind === "unit_cad") return "cad";
  if (evidenceKind === "as_built") return "as_built";
  return "site_measurement";
}

export function parseAttachedFloorPlanConstructionSources(
  rows: readonly PersistedFloorPlanConstructionSource[]
): AttachedFloorPlanConstructionSource[] {
  return rows.map((row) => {
    if (!isFloorPlanConstructionEvidenceKind(row.evidenceKind)) {
      fail("INVALID_ROLE", `unsupported durable evidence role ${row.evidenceKind}`);
    }
    const authorizedByEmail = row.authorizedByEmail?.trim();
    if (!row.authorizedAt || !row.attachedToCandidateAt || !authorizedByEmail) {
      fail("UNAUTHORIZED", "construction evidence is not authorized and attached");
    }
    if (row.sourceAsset.contentDeletedAt) {
      fail("SOURCE_DELETED", "authorized construction evidence content was deleted");
    }
    assertFloorPlanConstructionSourceFormat(
      row.evidenceKind,
      row.sourceAsset.mimeType
    );
    return {
      evidenceKind: row.evidenceKind,
      authorizedAt: row.authorizedAt,
      authorizedByEmail,
      sourceAsset: row.sourceAsset,
    };
  });
}

function allProvenances(
  document: FloorPlanDocumentV2
): FloorPlanEntityProvenanceV2[] {
  return document.floors.flatMap((floor) => [
    ...Object.values(floor.defaults).map((property) => property.provenance),
    ...(floor.verticalEvidence
      ? Object.values(floor.verticalEvidence)
          .map((property) => property.provenance)
          .filter((value): value is FloorPlanEntityProvenanceV2 => Boolean(value))
      : []),
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
    ...floor.annotations.map((entity) => entity.provenance),
    ...floor.dimensions.map((entity) => entity.provenance),
  ]);
}

function sourceIsReferenced(document: FloorPlanDocumentV2, sourceId: string) {
  return (
    document.floors.some((floor) =>
      floor.calibrations.some((calibration) => calibration.sourceId === sourceId)
    ) ||
    allProvenances(document).some((provenance) =>
      provenance.evidence.some((evidence) => evidence.sourceId === sourceId)
    )
  );
}

function canonicalSource(
  evidenceKind: FloorPlanConstructionEvidenceKind,
  sourceAsset: PersistedFloorPlanConstructionSource["sourceAsset"]
): FloorPlanSourceV2 {
  assertFloorPlanConstructionSourceFormat(evidenceKind, sourceAsset.mimeType);
  return {
    id: sourceAsset.id,
    kind: canonicalKind(evidenceKind),
    name: sourceAsset.fileName,
    mimeType: sourceAsset.mimeType,
    sha256: sourceAsset.sha256.toLowerCase(),
  };
}

export function attachFloorPlanConstructionSource(input: {
  document: FloorPlanDocumentV2;
  primarySourceId: string;
  evidenceKind: FloorPlanConstructionEvidenceKind;
  sourceAsset: PersistedFloorPlanConstructionSource["sourceAsset"];
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  if (document.verification.tier !== "needs_review") {
    fail("IMMUTABLE", "only a needs-review candidate can attach construction evidence");
  }
  if (input.sourceAsset.id === input.primarySourceId) {
    fail(
      "PRIMARY_SOURCE",
      "the primary extraction source cannot be reclassified as construction evidence"
    );
  }
  const durable = canonicalSource(input.evidenceKind, input.sourceAsset);
  const existing = document.sources.find((source) => source.id === durable.id);
  if (
    existing &&
    (existing.sha256?.toLowerCase() !== durable.sha256 ||
      existing.mimeType !== durable.mimeType ||
      existing.kind !== durable.kind)
  ) {
    fail("SOURCE_COLLISION", "the durable source ID conflicts with candidate provenance");
  }
  const hashMatches = document.sources.filter(
    (source) =>
      source.id !== durable.id &&
      source.sha256?.toLowerCase() === durable.sha256 &&
      source.mimeType === durable.mimeType
  );
  if (hashMatches.length) {
    fail(
      "DUPLICATE_SOURCE",
      "construction evidence is already represented by another canonical source ID"
    );
  }
  document.sources = existing
    ? document.sources.map((source) => (source.id === durable.id ? durable : source))
    : [...document.sources, durable];
  return document;
}

export function removeFloorPlanConstructionSource(input: {
  document: FloorPlanDocumentV2;
  primarySourceId: string;
  sourceAssetId: string;
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  if (document.verification.tier !== "needs_review") {
    fail("IMMUTABLE", "only a needs-review candidate can remove construction evidence");
  }
  if (input.sourceAssetId === input.primarySourceId) {
    fail("PRIMARY_SOURCE", "the primary source cannot be removed here");
  }
  if (sourceIsReferenced(document, input.sourceAssetId)) {
    fail(
      "SOURCE_REFERENCED",
      "remove calibrations and entity/property evidence before detaching this source"
    );
  }
  document.sources = document.sources.filter(
    (source) => source.id !== input.sourceAssetId
  );
  return document;
}
