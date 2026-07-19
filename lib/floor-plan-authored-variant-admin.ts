import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";
import { prisma } from "@/lib/prisma";
import type { FloorPlanAuthoredVariantRevisionSnapshot } from "@/lib/floor-plan-authored-variant-links";

export async function loadFloorPlanAuthoredVariantRevisionSnapshots(
  references: Array<{ revisionId: string; addressBindingId: string }>
): Promise<FloorPlanAuthoredVariantRevisionSnapshot[]> {
  const revisionIds = [...new Set(references.map((entry) => entry.revisionId))];
  const revisions = await prisma.floorPlanRevision.findMany({
    where: { id: { in: revisionIds } },
    select: {
      id: true,
      geometryHash: true,
      verificationTier: true,
      publicationStatus: true,
      publishedAt: true,
      approvedAt: true,
      approvedByEmail: true,
      publishedByEmail: true,
      documentJson: true,
      sourceManifestJson: true,
      constructionEvidenceJson: true,
      publicMetadata: true,
      sourceJob: {
        select: {
          renderedPagesJson: true,
          sourceAsset: {
            select: {
              id: true,
              sha256: true,
              mimeType: true,
              contentDeletedAt: true,
            },
          },
          supplementarySources: {
            select: {
              attachedToCandidateAt: true,
              renderedPagesJson: true,
              sourceAsset: {
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  sha256: true,
                  contentDeletedAt: true,
                },
              },
            },
          },
          constructionSources: {
            select: {
              evidenceKind: true,
              authorizedAt: true,
              authorizedByEmail: true,
              attachedToCandidateAt: true,
              sourceAsset: {
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  sha256: true,
                  contentDeletedAt: true,
                },
              },
            },
          },
        },
      },
      addressBindings: {
        select: {
          id: true,
          revisionId: true,
          countryCode: true,
          addressNormalized: true,
          block: true,
          street: true,
          postalCode: true,
          stack: true,
          floorMin: true,
          floorMax: true,
          transform: true,
          role: true,
          sourceEvidenceJson: true,
        },
      },
    },
  });
  const referenceByRevision = new Map(
    references.map((entry) => [entry.revisionId, entry.addressBindingId])
  );
  return revisions.flatMap((revision) => {
    const addressBinding = revision.addressBindings.find(
      (binding) => binding.id === referenceByRevision.get(revision.id)
    );
    if (!addressBinding) return [];
    return [{
      id: revision.id,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      publicationStatus: revision.publicationStatus,
      publishedAt: revision.publishedAt,
      document: revision.documentJson as unknown as FloorPlanDocumentV2,
      servingIntegrityValid: assessFloorPlanServingIntegrity(revision).valid,
      addressBinding: {
        id: addressBinding.id,
        revisionId: addressBinding.revisionId,
        countryCode: addressBinding.countryCode,
        addressNormalized: addressBinding.addressNormalized,
        block: addressBinding.block,
        street: addressBinding.street,
        postalCode: addressBinding.postalCode,
        stack: addressBinding.stack,
        floorMin: addressBinding.floorMin,
        floorMax: addressBinding.floorMax,
        transform: addressBinding.transform as FloorPlanAddressTransform,
        role: addressBinding.role,
      },
    }];
  });
}
