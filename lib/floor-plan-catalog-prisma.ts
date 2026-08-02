import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  PublishedFloorPlanRevisionDataSource,
  PublishedFloorPlanRevisionListInput,
} from "@/lib/floor-plan-catalog-repository";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";
import { projectPublicFloorPlanAuthoredVariantGroups } from "@/lib/floor-plan-authored-variant-links";

function addressBindingWhere(
  input: PublishedFloorPlanRevisionListInput
): Prisma.FloorPlanAddressBindingWhereInput {
  const evidenceRequired: Prisma.FloorPlanAddressBindingWhereInput = {
    role: "catalog",
    sourceEvidenceJson: { not: Prisma.DbNull },
  };
  if (input.browse) return evidenceRequired;

  // Use one selective token as the database prefilter, then let the repository's
  // normalized pure matcher enforce every token. Requiring every raw token here
  // would incorrectly reject common aliases such as "St" versus "Street".
  const anchorToken =
    input.queryTokens.find((token) => /^\d+[a-z]?$/i.test(token)) ??
    [...input.queryTokens]
      .filter((token) => !["street", "road", "avenue", "singapore", "sg"].includes(token))
      .sort((left, right) => right.length - left.length)[0] ??
    input.queryTokens[0];
  const tokenClauses: Prisma.FloorPlanAddressBindingWhereInput[] = anchorToken
    ? [{
      OR: [
        { addressNormalized: { contains: anchorToken, mode: "insensitive" } },
        { block: { contains: anchorToken, mode: "insensitive" } },
        { street: { contains: anchorToken, mode: "insensitive" } },
        { postalCode: { contains: anchorToken, mode: "insensitive" } },
        { countryCode: { equals: anchorToken, mode: "insensitive" } },
      ],
    }]
    : [];
  const unitClauses: Prisma.FloorPlanAddressBindingWhereInput[] =
    input.unitQuery
      ? [
          { stack: { equals: input.unitQuery.stack, mode: "insensitive" } },
          {
            OR: [
              { floorMin: null },
              { floorMin: { lte: input.unitQuery.floor } },
            ],
          },
          {
            OR: [
              { floorMax: null },
              { floorMax: { gte: input.unitQuery.floor } },
            ],
          },
        ]
      : [];
  return { AND: [evidenceRequired, ...tokenClauses, ...unitClauses] };
}

function publishedCatalogKeysetWhere(
  input: PublishedFloorPlanRevisionListInput
): Prisma.FloorPlanAddressBindingWhereInput | null {
  if (!input.after) return null;
  const publishedAt = new Date(input.after.publishedAt);
  return {
    OR: [
      { revision: { is: { publishedAt: { lt: publishedAt } } } },
      {
        AND: [
          { revision: { is: { publishedAt } } },
          { revisionId: { gt: input.after.revisionId } },
        ],
      },
      {
        AND: [
          { revision: { is: { publishedAt } } },
          { revisionId: input.after.revisionId },
          { id: { gt: input.after.bindingId } },
        ],
      },
    ],
  };
}

/** Prisma implementation is deliberately behind the repository data-source surface. */
export const prismaPublishedFloorPlanRevisionDataSource: PublishedFloorPlanRevisionDataSource = {
  async listPublishedRevisions(input) {
    const bindingWhere = addressBindingWhere(input);
    const keysetWhere = publishedCatalogKeysetWhere(input);
    const candidates = await prisma.floorPlanAddressBinding.findMany({
      where: {
        AND: [bindingWhere, ...(keysetWhere ? [keysetWhere] : [])],
        revision: {
          is: {
            publicationStatus: "published",
            publishedAt: { not: null },
            verificationTier: { in: ["source_verified", "construction_verified"] },
            publicMetadata: { isNot: null },
          },
        },
      },
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
        sourceEvidenceJson: true,
        revision: {
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
            publicMetadata: {
              select: {
                projectName: true,
                label: true,
                flatType: true,
                floorAreaSqm: true,
                previewUrl: true,
                sourceUrl: true,
                sourceTitle: true,
                sourcePage: true,
                publisher: true,
                approvedAt: true,
                approvedByEmail: true,
              },
            },
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
            authoredVariantOptions: {
              select: {
                group: {
                  select: {
                    groupKey: true,
                    label: true,
                    publicationStatus: true,
                    approvedByEmail: true,
                    publishedAt: true,
                    publishedByEmail: true,
                    options: {
                      select: {
                        optionKey: true,
                        label: true,
                        revisionId: true,
                        addressBindingId: true,
                        geometryHash: true,
                        sourceId: true,
                        sourcePage: true,
                        defaultSelected: true,
                        sourceEvidenceJson: true,
                        revision: {
                          select: {
                            id: true,
                            geometryHash: true,
                            verificationTier: true,
                            publicationStatus: true,
                            publishedAt: true,
                          },
                        },
                        addressBinding: {
                          select: { id: true, revisionId: true, transform: true, role: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { revision: { publishedAt: "desc" } },
        { revisionId: "asc" },
        { id: "asc" },
      ],
      take: input.take + 1,
    });

    const hasMore = candidates.length > input.take;
    const scanned = candidates.slice(0, input.take);
    const lastCandidate = scanned.at(-1);
    const lastScannedKey = lastCandidate?.revision.publishedAt
      ? {
          publishedAt: lastCandidate.revision.publishedAt.toISOString(),
          revisionId: lastCandidate.revisionId,
          bindingId: lastCandidate.id,
        }
      : null;
    const rows = scanned.flatMap((candidate) => {
      const { revision, sourceEvidenceJson, revisionId: _revisionId, ...binding } = candidate;
      const integrityBinding = { ...binding, sourceEvidenceJson };
      const row = { ...revision, addressBindings: [integrityBinding] };
      if (!assessFloorPlanServingIntegrity(row).valid) {
        return [];
      }
      if (!revision.publishedAt) {
        return [];
      }
      return [{
        id: revision.id,
        geometryHash: revision.geometryHash,
        verificationTier: revision.verificationTier,
        publishedAt: revision.publishedAt,
        approvedByEmail: revision.approvedByEmail,
        publishedByEmail: revision.publishedByEmail,
        documentJson: revision.documentJson,
        sourceManifestJson: revision.sourceManifestJson,
        publicMetadata: revision.publicMetadata,
        authoredConfigurationGroups: projectPublicFloorPlanAuthoredVariantGroups(
          revision.authoredVariantOptions.map((entry) => entry.group),
          revision.id,
          binding.id
        ),
        addressBindings: [binding],
        catalogKey: {
          publishedAt: revision.publishedAt.toISOString(),
          revisionId: revision.id,
          bindingId: binding.id,
        },
      }];
    });
    return { rows, lastScannedKey, hasMore };
  },
};
