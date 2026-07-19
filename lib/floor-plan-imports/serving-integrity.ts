import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { validateFloorPlanAddressBindingEvidence } from "./address-binding-evidence";
import { assertFloorPlanConstructionEvidence } from "./construction-evidence";
import {
  parseAttachedFloorPlanConstructionSources,
  type PersistedFloorPlanConstructionSource,
} from "./construction-sources";
import { assertPublicFloorPlanEntityIdsOpaque } from "./public-entity-ids";
import { hasPublicFloorPlanPublicationEvidence } from "./publication-evidence";
import { assertFloorPlanPublicMetadataApprovalIntegrity } from "./public-display-metadata";
import {
  parseAttachedFloorPlanSupplementarySources,
  type PersistedFloorPlanSupplementarySource,
} from "./supplementary-sources";
import { parseRenderedPages } from "./validation";

export type FloorPlanServingIntegrityIssue = {
  code:
    | "publication_evidence_invalid"
    | "public_metadata_invalid"
    | "canonical_document_invalid"
    | "geometry_hash_mismatch"
    | "public_entity_ids_invalid"
    | "rendered_pages_invalid"
    | "supplementary_sources_invalid"
    | "construction_sources_invalid"
    | "construction_evidence_invalid"
    | "address_binding_invalid"
    | "no_valid_address_binding";
  message: string;
  bindingId?: string;
};

export type FloorPlanServingIntegrityInput = {
  id: string;
  geometryHash: string;
  verificationTier: string;
  publicationStatus: string;
  publishedAt: Date | string | null;
  approvedAt?: Date | string | null;
  approvedByEmail: string | null;
  publishedByEmail: string | null;
  documentJson: unknown;
  sourceManifestJson: unknown;
  constructionEvidenceJson: unknown;
  publicMetadata?: {
    projectName: string;
    label: string;
    flatType: string;
    floorAreaSqm: number | null;
    previewUrl: string;
    sourceUrl: string | null;
    sourceTitle: string | null;
    sourcePage: number | null;
    publisher: string;
    approvedAt?: Date | string | null;
    approvedByEmail?: string | null;
  } | null;
  sourceJob: {
    renderedPagesJson: unknown;
    sourceAsset: {
      id: string;
      sha256: string;
      mimeType: string;
      contentDeletedAt?: Date | string | null;
    };
    supplementarySources: readonly PersistedFloorPlanSupplementarySource[];
    constructionSources: readonly PersistedFloorPlanConstructionSource[];
  };
  addressBindings: ReadonlyArray<{
    id: string;
    countryCode: string;
    addressNormalized: string;
    block: string;
    street: string;
    postalCode: string | null;
    stack: string | null;
    floorMin: number | null;
    floorMax: number | null;
    transform: string;
    role?: "catalog" | "authored_variant";
    sourceEvidenceJson: unknown;
  }>;
};

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "integrity validation failed";
}

/**
 * Deep, read-only monitor used outside the latency-sensitive public search
 * path. Public search already fails closed; this audit makes corrupt or stale
 * published rows observable before a consumer reports a missing result.
 */
export function assessFloorPlanServingIntegrity(
  revision: FloorPlanServingIntegrityInput
) {
  const issues: FloorPlanServingIntegrityIssue[] = [];
  const document = revision.documentJson as FloorPlanDocumentV2;
  if (
    revision.publicationStatus !== "published" ||
    !hasPublicFloorPlanPublicationEvidence({
      revisionId: revision.id,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      publishedAt: revision.publishedAt,
      approvedByEmail: revision.approvedByEmail,
      publishedByEmail: revision.publishedByEmail,
      sourceManifest: revision.sourceManifestJson,
      document: revision.documentJson,
    })
  ) {
    issues.push({
      code: "publication_evidence_invalid",
      message: "The published revision no longer satisfies the public evidence contract.",
    });
  }

  try {
    assertFloorPlanPublicMetadataApprovalIntegrity({
      metadata: revision.publicMetadata,
      revisionApprovedAt: revision.approvedAt,
      revisionApprovedByEmail: revision.approvedByEmail,
    });
  } catch (cause) {
    issues.push({ code: "public_metadata_invalid", message: message(cause) });
  }

  try {
    const compiled = compileFloorPlanDocumentV2(document);
    if (compiled.geometryHash !== revision.geometryHash) {
      issues.push({
        code: "geometry_hash_mismatch",
        message: "The canonical document does not match the persisted geometry hash.",
      });
    }
  } catch (cause) {
    issues.push({ code: "canonical_document_invalid", message: message(cause) });
  }

  try {
    assertPublicFloorPlanEntityIdsOpaque(document);
  } catch (cause) {
    issues.push({ code: "public_entity_ids_invalid", message: message(cause) });
  }

  let renderedPages: ReturnType<typeof parseRenderedPages> = [];
  try {
    renderedPages = parseRenderedPages(revision.sourceJob.renderedPagesJson);
  } catch (cause) {
    issues.push({ code: "rendered_pages_invalid", message: message(cause) });
  }

  let supplementarySources: ReturnType<
    typeof parseAttachedFloorPlanSupplementarySources
  > = [];
  try {
    supplementarySources = parseAttachedFloorPlanSupplementarySources(
      revision.sourceJob.supplementarySources
    );
  } catch (cause) {
    issues.push({ code: "supplementary_sources_invalid", message: message(cause) });
  }

  let constructionSources: ReturnType<
    typeof parseAttachedFloorPlanConstructionSources
  > = [];
  try {
    constructionSources = parseAttachedFloorPlanConstructionSources(
      revision.sourceJob.constructionSources
    );
  } catch (cause) {
    issues.push({ code: "construction_sources_invalid", message: message(cause) });
  }

  let validBindings = 0;
  for (const binding of revision.addressBindings) {
    try {
      validateFloorPlanAddressBindingEvidence([binding], {
        document,
        sourceAsset: revision.sourceJob.sourceAsset,
        renderedPages,
        supplementarySources,
      });
      validBindings += 1;
    } catch (cause) {
      issues.push({
        code: "address_binding_invalid",
        bindingId: binding.id,
        message: message(cause),
      });
    }
  }
  if (validBindings === 0) {
    issues.push({
      code: "no_valid_address_binding",
      message: "A published revision must retain at least one valid address binding.",
    });
  }

  if (revision.verificationTier === "construction_verified") {
    try {
      assertFloorPlanConstructionEvidence(
        document,
        revision.constructionEvidenceJson,
        {
          durableSources: constructionSources.map((entry) => ({
            ...entry.sourceAsset,
            evidenceKind: entry.evidenceKind,
            authorizedAt: entry.authorizedAt,
            authorizedBy: entry.authorizedByEmail,
          })),
          addressBindings: revision.addressBindings,
        }
      );
    } catch (cause) {
      issues.push({
        code: "construction_evidence_invalid",
        message: message(cause),
      });
    }
  }

  return {
    revisionId: revision.id,
    valid: issues.length === 0,
    validBindings,
    checkedBindings: revision.addressBindings.length,
    issues,
  };
}
