import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  PublishedFloorPlanRevisionDataSource,
  PublishedFloorPlanRevisionListInput,
} from "@/lib/floor-plan-catalog-repository";
import { projectFloorPlanPublicDisplayMetadata } from "@/lib/floor-plan-imports/public-display-metadata";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";

function addressBindingWhere(
  input: PublishedFloorPlanRevisionListInput
): Prisma.FloorPlanAddressBindingWhereInput {
  const evidenceRequired: Prisma.FloorPlanAddressBindingWhereInput = {
    role: input.targetRevisionId
      ? { in: ["catalog", "authored_variant"] }
      : "catalog",
    sourceEvidenceJson: { not: Prisma.DbNull },
  };
  if (input.mode === "browse") return evidenceRequired;

  const anchorToken =
    input.addressTokens.find((token) => /^\d+[a-z]?$/i.test(token)) ??
    [...input.addressTokens]
      .filter((token) => !["street", "road", "avenue", "singapore", "sg"].includes(token))
      .sort((left, right) => right.length - left.length)[0] ??
    input.addressTokens[0];
  const addressClauses: Prisma.FloorPlanAddressBindingWhereInput[] = anchorToken
    ? [{
        OR: [
          { addressNormalized: { contains: anchorToken, mode: "insensitive" } },
          { block: { contains: anchorToken, mode: "insensitive" } },
          { street: { contains: anchorToken, mode: "insensitive" } },
          { postalCode: { contains: anchorToken, mode: "insensitive" } },
        ],
      }]
    : [];
  const unitClauses: Prisma.FloorPlanAddressBindingWhereInput[] = input.unit
    ? [
        { countryCode: input.countryCode },
        { stack: { equals: input.unit.stack, mode: "insensitive" } },
        { OR: [{ floorMin: null }, { floorMin: { lte: input.unit.floor } }] },
        { OR: [{ floorMax: null }, { floorMax: { gte: input.unit.floor } }] },
      ]
    : [];
  return { AND: [evidenceRequired, ...addressClauses, ...unitClauses] };
}

function publicRevisionKeysetWhere(
  input: PublishedFloorPlanRevisionListInput
): Prisma.FloorPlanRevisionWhereInput | null {
  if (!input.after) return null;
  const publishedAt = new Date(input.after.publishedAt);
  return {
    OR: [
      { publishedAt: { lt: publishedAt } },
      { AND: [{ publishedAt }, { id: { gt: input.after.revisionId } }] },
    ],
  };
}

const sourceJobSelect = {
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
} satisfies Prisma.FloorPlanImportJobSelect;

const variantOptionsSelect = {
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
} satisfies Prisma.FloorPlanAuthoredVariantOptionSelect;

/** Prisma pages immutable public revisions, never private binding rows. */
export const prismaPublishedFloorPlanRevisionDataSource: PublishedFloorPlanRevisionDataSource = {
  async listPublishedRevisions(input) {
    const bindingWhere = addressBindingWhere(input);
    const keysetWhere = publicRevisionKeysetWhere(input);
    const candidates = await prisma.floorPlanRevision.findMany({
      where: {
        AND: [
          {
            publicationStatus: "published",
            publishedAt: { not: null },
            verificationTier: { in: ["source_verified", "construction_verified"] },
            publicMetadata: { isNot: null },
            addressBindings: { some: bindingWhere },
            ...(input.targetRevisionId ? { id: input.targetRevisionId } : {}),
          },
          ...(keysetWhere ? [keysetWhere] : []),
        ],
      },
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
        sourceJob: { select: sourceJobSelect },
        addressBindings: {
          select: {
            id: true,
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
          orderBy: { id: "asc" },
        },
        authoredVariantOptions: { select: variantOptionsSelect },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: input.take + 1,
    });

    const hasMore = candidates.length > input.take;
    const scanned = candidates.slice(0, input.take);
    const lastCandidate = scanned.at(-1);
    const lastScannedKey = lastCandidate?.publishedAt
      ? {
          publishedAt: lastCandidate.publishedAt.toISOString(),
          revisionId: lastCandidate.id,
        }
      : null;
    const rows = scanned.flatMap((revision) => {
      const row = revision;
      if (!revision.publishedAt || !assessFloorPlanServingIntegrity(row).valid) {
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
        publicMetadata: revision.publicMetadata ? projectFloorPlanPublicDisplayMetadata(revision.publicMetadata) : null,
        authoredVariantGroups: revision.authoredVariantOptions.map((entry) => entry.group),
        addressBindings: revision.addressBindings.map((binding) => ({
          id: binding.id,
          countryCode: binding.countryCode,
          addressNormalized: binding.addressNormalized,
          block: binding.block,
          street: binding.street,
          postalCode: binding.postalCode,
          stack: binding.stack,
          floorMin: binding.floorMin,
          floorMax: binding.floorMax,
          transform: binding.transform,
          role: binding.role,
        })),
        catalogKey: {
          publishedAt: revision.publishedAt.toISOString(),
          revisionId: revision.id,
        },
      }];
    });
    return { rows, lastScannedKey, hasMore };
  },
};
