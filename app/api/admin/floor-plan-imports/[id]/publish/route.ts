import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { assertNoFloorPlanAddressBindingConflicts } from "@/lib/floor-plan-imports/address-binding-conflicts";
import { validateFloorPlanAddressBindingEvidence } from "@/lib/floor-plan-imports/address-binding-evidence";
import { assertFloorPlanRevisionMutationAllowed } from "@/lib/floor-plan-imports/revision-immutability";
import { buildFloorPlanRevisionAuditRecord } from "@/lib/floor-plan-imports/revision-audit";
import { retirePublishedFloorPlanRevisionForSupersede } from "@/lib/floor-plan-imports/revision-retirement";
import { assertFloorPlanSupersedeCoverage } from "@/lib/floor-plan-imports/revision-supersede";
import { parseAttachedFloorPlanSupplementarySources } from "@/lib/floor-plan-imports/supplementary-sources";
import { assertFloorPlanConstructionEvidence } from "@/lib/floor-plan-imports/construction-evidence";
import { parseAttachedFloorPlanConstructionSources } from "@/lib/floor-plan-imports/construction-sources";
import { assertPublicFloorPlanEntityIdsOpaque } from "@/lib/floor-plan-imports/public-entity-ids";
import {
  assertDistinctFloorPlanReviewerPublisher,
  requireFloorPlanPublisher,
} from "@/lib/floor-plan-imports/publication-governance";
import { floorPlanSourceObservationManifestSchema } from "@/lib/floor-plan-imports/source-observation-manifest";
import { assertFloorPlanPublicMetadataApprovalIntegrity } from "@/lib/floor-plan-imports/public-display-metadata";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  compileCandidateFloorPlanDocumentV2,
  parseRenderedPages,
} from "@/lib/floor-plan-imports/validation";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function metadataString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let publishedBy: string;
  try {
    publishedBy = requireFloorPlanPublisher(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Publisher role required", 403);
  }
  const { id } = await params;

  const job = await prisma.floorPlanImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      candidateVersion: true,
      renderedPagesJson: true,
      sourceAsset: {
        select: { id: true, sha256: true, mimeType: true, fileName: true },
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
      revision: {
        select: {
          id: true,
          publicationStatus: true,
          verificationTier: true,
          geometryHash: true,
          documentJson: true,
          sourceManifestJson: true,
          sourceObservationManifestJson: true,
          constructionEvidenceJson: true,
          approvedAt: true,
          approvedByEmail: true,
          publicMetadata: true,
          auditEvents: {
            where: { eventType: "revision_approved" },
            select: { metadataJson: true },
            take: 1,
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
      },
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  if (!job.revision) return error("Approve an immutable revision before publishing", 409);
  const alreadyPublished =
    job.status === "published" && job.revision.publicationStatus === "published";
  if (
    !alreadyPublished &&
    (job.status !== "ready" || job.revision.publicationStatus !== "approved")
  ) {
    return error("Only an approved, ready floor plan can be published", 409);
  }

  let approvedDocument: FloorPlanDocumentV2;
  try {
    const compiled = compileCandidateFloorPlanDocumentV2(job.revision.documentJson);
    approvedDocument = compiled.document;
    const observationManifest = floorPlanSourceObservationManifestSchema.parse(
      job.revision.sourceObservationManifestJson
    );
    if (
      observationManifest.recordedByReviewerId.trim().toLowerCase() !==
      job.revision.approvedByEmail?.trim().toLowerCase()
    ) {
      return error("The approved source observations failed their reviewer integrity check", 409);
    }
    assertFloorPlanPublicMetadataApprovalIntegrity({
      metadata: job.revision.publicMetadata,
      revisionApprovedAt: job.revision.approvedAt,
      revisionApprovedByEmail: job.revision.approvedByEmail,
    });
    assertPublicFloorPlanEntityIdsOpaque(compiled.document, {
      privateValues: [
        job.id,
        job.sourceAsset.id,
        job.sourceAsset.fileName,
        ...job.supplementarySources.flatMap(({ sourceAsset }) => [
          sourceAsset.id,
          sourceAsset.fileName,
        ]),
        ...job.constructionSources.flatMap(({ sourceAsset }) => [
          sourceAsset.id,
          sourceAsset.fileName,
        ]),
      ],
    });
    if (
      compiled.scene.geometryHash !== job.revision.geometryHash ||
      compiled.document.verification.tier !== job.revision.verificationTier
    ) {
      return error("The approved revision failed its integrity check", 409);
    }
    const supplementarySources = parseAttachedFloorPlanSupplementarySources(
      job.supplementarySources
    );
    const addressBindings = validateFloorPlanAddressBindingEvidence(job.revision.addressBindings, {
      document: compiled.document,
      sourceAsset: job.sourceAsset,
      renderedPages: parseRenderedPages(job.renderedPagesJson),
      supplementarySources,
    });
    if (job.revision.verificationTier === "construction_verified") {
      const constructionSources = parseAttachedFloorPlanConstructionSources(
        job.constructionSources
      );
      assertFloorPlanConstructionEvidence(
        compiled.document,
        job.revision.constructionEvidenceJson,
        {
          durableSources: constructionSources.map((entry) => ({
            ...entry.sourceAsset,
            evidenceKind: entry.evidenceKind,
            authorizedAt: entry.authorizedAt,
            authorizedBy: entry.authorizedByEmail,
          })),
          addressBindings,
        }
      );
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid FloorPlanDocumentV2";
    return error(message, 409);
  }
  if (alreadyPublished) {
    return NextResponse.json({ revisionId: job.revision.id, published: true });
  }

  try {
    assertDistinctFloorPlanReviewerPublisher({
      reviewerEmail: job.revision.approvedByEmail,
      publisherEmail: publishedBy,
    });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Maker-checker review required", 409);
  }

  try {
    const publishedAt = new Date();
    const approvalMetadata = job.revision.auditEvents[0]?.metadataJson;
    const supersedesRevisionId = metadataString(
      approvalMetadata,
      "supersedesRevisionId"
    );
    const supersedeReason = metadataString(approvalMetadata, "lifecycleReason");
    if (
      supersedesRevisionId &&
      (approvedDocument.parentRevisionId !== supersedesRevisionId ||
        !supersedeReason ||
        supersedeReason.length < 10)
    ) {
      return error("The approved replacement lineage failed its integrity check", 409);
    }
    assertFloorPlanRevisionMutationAllowed(
      { publicationStatus: job.revision.publicationStatus },
      { publicationStatus: "published" }
    );
    await prisma.$transaction(async (tx) => {
      const bindings = job.revision!.addressBindings;
      const superseded = supersedesRevisionId
        ? await tx.floorPlanRevision.findUnique({
            where: { id: supersedesRevisionId },
            select: {
              id: true,
              sourceJobId: true,
              publicationStatus: true,
              geometryHash: true,
              sourceManifestJson: true,
              constructionEvidenceJson: true,
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
              sourceJob: {
                select: {
                  candidateVersion: true,
                  sourceAsset: {
                    select: { id: true, sha256: true, mimeType: true, fileName: true },
                  },
                },
              },
            },
          })
        : null;
      if (supersedesRevisionId && !superseded) {
        throw new Error("SUPERSEDE_TARGET_NOT_FOUND");
      }
      if (superseded?.publicationStatus !== "published") {
        if (superseded) throw new Error("SUPERSEDE_TARGET_NOT_PUBLISHED");
      }
      if (superseded) {
        assertFloorPlanSupersedeCoverage({
          replaced: superseded.addressBindings,
          replacement: bindings,
        });
      }
      const existingBindings = bindings.length
        ? await tx.floorPlanAddressBinding.findMany({
            where: {
              revisionId: superseded
                ? { notIn: [job.revision!.id, superseded.id] }
                : { not: job.revision!.id },
              revision: { publicationStatus: { in: ["approved", "published"] } },
              OR: bindings.flatMap((binding) => [
                {
                  countryCode: binding.countryCode,
                  addressNormalized: binding.addressNormalized,
                },
                {
                  countryCode: binding.countryCode,
                  block: binding.block,
                  street: binding.street,
                },
              ]),
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
              role: true,
            },
          })
        : [];
      assertNoFloorPlanAddressBindingConflicts({
        incoming: bindings,
        existing: existingBindings,
      });
      if (superseded) {
        await retirePublishedFloorPlanRevisionForSupersede({
          tx,
          revision: superseded,
          replacementRevisionId: job.revision!.id,
          actorEmail: publishedBy,
          occurredAt: publishedAt,
          reason: supersedeReason!,
        });
      }
      const revisionUpdate = await tx.floorPlanRevision.updateMany({
        where: { id: job.revision!.id, publicationStatus: "approved" },
        data: {
          publicationStatus: "published",
          publishedAt,
          publishedByEmail: publishedBy,
        },
      });
      const jobUpdate = await tx.floorPlanImportJob.updateMany({
        where: { id, status: "ready" },
        data: { status: "published", progress: 100 },
      });
      if (revisionUpdate.count !== 1 || jobUpdate.count !== 1) {
        throw new Error("PUBLISH_CONFLICT");
      }
      const auditRecord = buildFloorPlanRevisionAuditRecord({
        eventType: "revision_published",
        revisionId: job.revision!.id,
        sourceJobId: job.id,
        actorEmail: publishedBy,
        occurredAt: publishedAt,
        previousStatus: "approved",
        nextStatus: "published",
        geometryHash: job.revision!.geometryHash,
        sourceManifest: job.revision!.sourceManifestJson,
        constructionEvidence: job.revision!.constructionEvidenceJson,
        sourceAsset: job.sourceAsset,
        addressBindings: job.revision!.addressBindings,
        candidateVersion: job.candidateVersion,
        ...(superseded
          ? {
              supersedesRevisionId: superseded.id,
              lifecycleReason: supersedeReason,
            }
          : {}),
      });
      await tx.floorPlanRevisionAuditEvent.create({
        data: {
          revisionId: auditRecord.revisionId,
          eventType: auditRecord.eventType,
          actorEmail: auditRecord.actorEmail,
          occurredAt: auditRecord.occurredAt,
          sourceEvidenceJson: auditRecord.sourceEvidence as Prisma.InputJsonValue,
          metadataJson: auditRecord.metadata as Prisma.InputJsonValue,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ revisionId: job.revision.id, published: true });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "PUBLISH_CONFLICT") {
      return error("The floor plan changed while it was being published", 409);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_TARGET_NOT_FOUND") {
      return error("The published revision to replace was not found", 404);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_TARGET_NOT_PUBLISHED") {
      return error("The revision to replace is no longer published", 409);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_CONFLICT") {
      return error("The revision to replace changed; reload both imports", 409);
    }
    if (cause instanceof Error && cause.message.startsWith("SUPERSEDE_ADDRESS_GAP:")) {
      return error(cause.message.replace("SUPERSEDE_ADDRESS_GAP: ", ""), 409);
    }
    if (cause instanceof Error && cause.message.includes("ADDRESS_BINDING_CONFLICT")) {
      return error(cause.message.replace(/^.*ADDRESS_BINDING_CONFLICT:\s*/, ""), 409);
    }
    if (cause instanceof Error && cause.message.includes("FLOOR_PLAN_REVISION_IMMUTABLE")) {
      return error(cause.message.replace(/^.*FLOOR_PLAN_REVISION_IMMUTABLE:\s*/, ""), 409);
    }
    console.error("Floor-plan publication failed", cause);
    return error("Unable to publish the floor plan", 500);
  }
}
