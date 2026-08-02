import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPublicFloorPlanRevisionPayload } from "@/lib/floor-plan-imports/public-document";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const SAFE_PUBLIC_REVISION_CACHE_CONTROL = "no-store, max-age=0";

function notFound() {
  return NextResponse.json(
    { error: "Floor-plan revision not found" },
    {
      status: 404,
      headers: { "Cache-Control": SAFE_PUBLIC_REVISION_CACHE_CONTROL },
    }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const revision = await prisma.floorPlanRevision.findFirst({
    where: {
      id,
      publicationStatus: "published",
      publishedAt: { not: null },
      verificationTier: { in: ["source_verified", "construction_verified"] },
      publicMetadata: { isNot: null },
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
  });
  if (!revision) {
    return notFound();
  }
  let payload;
  try {
    if (!assessFloorPlanServingIntegrity(revision).valid) {
      throw new Error("Published revision failed serving-integrity checks");
    }
    if (!revision.publicMetadata) {
      throw new Error("Published revision is missing approved public metadata");
    }
    payload = buildPublicFloorPlanRevisionPayload({
      ...revision,
      publicMetadata: revision.publicMetadata,
    });
    const hasCatalogBinding = revision.addressBindings.some(
      (binding) => binding.role === "catalog"
    );
    const hasPublishedVariantLink = payload.revision.authoredConfigurationGroups.some(
      (group) => group.options.some(
        (option) =>
          option.revisionId === revision.id &&
          revision.addressBindings.some(
            (binding) =>
              binding.id === option.addressBinding.id &&
              binding.role === "authored_variant"
          )
      )
    );
    if (!hasCatalogBinding && !hasPublishedVariantLink) {
      throw new Error("Variant-only revision has no published authored relationship");
    }
  } catch {
    // Fail closed: a published row with incomplete source evidence is not a
    // public floor plan, even if legacy data managed to retain that status.
    return notFound();
  }
  return NextResponse.json(
    payload,
    {
      headers: {
        "Cache-Control": SAFE_PUBLIC_REVISION_CACHE_CONTROL,
      },
    }
  );
}
