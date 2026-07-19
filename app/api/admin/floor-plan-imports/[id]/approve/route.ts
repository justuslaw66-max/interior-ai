import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { assertNoFloorPlanAddressBindingConflicts } from "@/lib/floor-plan-imports/address-binding-conflicts";
import {
  FloorPlanAddressBindingEvidenceError,
  validateFloorPlanAddressBindingEvidence,
} from "@/lib/floor-plan-imports/address-binding-evidence";
import {
  assertFloorPlanConstructionEvidence,
  FloorPlanConstructionEvidenceError,
} from "@/lib/floor-plan-imports/construction-evidence";
import { parseAttachedFloorPlanConstructionSources } from "@/lib/floor-plan-imports/construction-sources";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { requireFloorPlanReviewer } from "@/lib/floor-plan-imports/publication-governance";
import { floorPlanSourceObservationManifestSchema } from "@/lib/floor-plan-imports/source-observation-manifest";
import { parseAttachedFloorPlanSupplementarySources } from "@/lib/floor-plan-imports/supplementary-sources";
import {
  floorPlanPublicDisplayMetadataSchema,
  projectFloorPlanPublicDisplayMetadata,
} from "@/lib/floor-plan-imports/public-display-metadata";
import {
  assertPublicFloorPlanEntityIdsOpaque,
  FloorPlanPublicEntityIdError,
} from "@/lib/floor-plan-imports/public-entity-ids";
import { buildFloorPlanRevisionAuditRecord } from "@/lib/floor-plan-imports/revision-audit";
import { assertFloorPlanSupersedeCoverage } from "@/lib/floor-plan-imports/revision-supersede";
import {
  assertFloorPlanPublicationChecks,
  buildIndependentFloorPlanSourceManifest,
  computeFloorPlanPublicationChecks,
  stampFloorPlanApproval,
} from "@/lib/floor-plan-imports/publication";
import {
  compileCandidateFloorPlanDocumentV2,
  hasUnresolvedCriticalIssues,
  parseAddressBindings,
  parseRenderedPages,
  parseReviewIssues,
  verificationTierSchema,
} from "@/lib/floor-plan-imports/validation";

export const runtime = "nodejs";

const MAX_FLOOR_PLAN_APPROVAL_BODY_BYTES = 4 * 1024 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let approvedBy: string;
  try {
    approvedBy = requireFloorPlanReviewer(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Reviewer role required", 403);
  }
  const { id } = await params;
  let payload: Record<string, unknown>;
  try {
    payload = await readBoundedJsonObject(
      request,
      MAX_FLOOR_PLAN_APPROVAL_BODY_BYTES
    );
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Floor-plan approval payload is too large", 413);
    }
    return error("Invalid approval payload", 400);
  }

  try {
    const verificationTier = verificationTierSchema.parse(payload.verificationTier);
    const submittedAddressBindings = parseAddressBindings(payload.addressBindings);
    const supersedesRevisionId =
      typeof payload.supersedesRevisionId === "string"
        ? payload.supersedesRevisionId.trim()
        : "";
    const supersedeReason =
      typeof payload.supersedeReason === "string" ? payload.supersedeReason.trim() : "";
    if (supersedesRevisionId && supersedeReason.length < 10) {
      return error("A supersede reason of at least 10 characters is required", 400);
    }
    if (!supersedesRevisionId && supersedeReason) {
      return error("supersedeReason requires supersedesRevisionId", 400);
    }
    const expectedCandidateVersion = payload.candidateVersion;
    if (!Number.isInteger(expectedCandidateVersion)) {
      return error("candidateVersion is required", 400);
    }
    const expectedSourceObservationVersion = payload.sourceObservationVersion;
    if (!Number.isInteger(expectedSourceObservationVersion)) {
      return error("sourceObservationVersion is required", 400);
    }
    const submittedConstructionEvidence = payload.constructionEvidence;
    const publicDisplayMetadata = floorPlanPublicDisplayMetadataSchema.parse(
      payload.publicDisplayMetadata
    );
    if (verificationTier === "construction_verified" && !submittedConstructionEvidence) {
      return error("Construction verification requires as-built or measured evidence", 400);
    }
    if (verificationTier === "source_verified" && submittedConstructionEvidence) {
      return error("Construction evidence can only be attached to construction-verified revisions", 400);
    }

    const job = await prisma.floorPlanImportJob.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        candidateJson: true,
        candidateVersion: true,
        sourceObservationVersion: true,
        sourceObservationManifestJson: true,
        renderedPagesJson: true,
        reviewIssuesJson: true,
        sourceAsset: {
          select: {
            id: true,
            sha256: true,
            mimeType: true,
            fileName: true,
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
        revision: { select: { id: true } },
      },
    });
    if (!job) return error("Floor-plan import not found", 404);
    if (job.revision) return error("This import already has an approved immutable revision", 409);
    if (job.status !== "ready") return error("Only ready imports can be approved", 409);
    if (job.candidateVersion !== expectedCandidateVersion) {
      return error("The candidate changed; review the latest version before approval", 409);
    }
    if (job.sourceObservationVersion !== expectedSourceObservationVersion) {
      return error("The source observation manifest changed; review the latest version", 409);
    }
    const sourceObservationManifest = floorPlanSourceObservationManifestSchema.parse(
      job.sourceObservationManifestJson
    );
    if (sourceObservationManifest.candidateVersion !== job.candidateVersion) {
      return error("Source observations are stale for this candidate", 409);
    }
    const { document: candidate } = compileCandidateFloorPlanDocumentV2(job.candidateJson);
    assertPublicFloorPlanEntityIdsOpaque(candidate, {
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
    const renderedPages = parseRenderedPages(job.renderedPagesJson);
    const supplementarySources = parseAttachedFloorPlanSupplementarySources(
      job.supplementarySources
    );
    const constructionSources = parseAttachedFloorPlanConstructionSources(
      job.constructionSources
    );
    const reviewIssues = parseReviewIssues(job.reviewIssuesJson);
    if (hasUnresolvedCriticalIssues(reviewIssues)) {
      return error("Critical review issues block approval", 409);
    }

    const approvedAt = new Date();
    const approvedDocument = stampFloorPlanApproval({
      document: candidate,
      tier: verificationTier,
      reviewerId: approvedBy,
      reviewedAt: approvedAt.toISOString(),
      note: sourceObservationManifest.reviewerNotes,
    });
    if (supersedesRevisionId) {
      // Keep lineage inside the immutable canonical document as well as the
      // append-only lifecycle audit. Consumers can then compare a saved plan
      // with its direct replacement without relying on publication timestamps.
      approvedDocument.parentRevisionId = supersedesRevisionId;
    }
    const addressBindings = validateFloorPlanAddressBindingEvidence(
      submittedAddressBindings,
      {
        document: approvedDocument,
        sourceAsset: job.sourceAsset,
        renderedPages,
        supplementarySources,
        reviewer: { id: approvedBy, reviewedAt: approvedAt.toISOString() },
      }
    );
    assertNoFloorPlanAddressBindingConflicts({ incoming: addressBindings });
    const constructionEvidence =
      verificationTier === "construction_verified"
        ? assertFloorPlanConstructionEvidence(
            approvedDocument,
            submittedConstructionEvidence,
            {
              durableSources: constructionSources.map((entry) => ({
                ...entry.sourceAsset,
                evidenceKind: entry.evidenceKind,
                authorizedAt: entry.authorizedAt,
                authorizedBy: entry.authorizedByEmail,
              })),
              addressBindings,
            }
          )
        : null;
    const publication = computeFloorPlanPublicationChecks({
      document: approvedDocument,
      observationManifest: sourceObservationManifest,
      sourceAssetId: job.sourceAsset.id,
      sourceSha256: job.sourceAsset.sha256,
      sourceMimeType: job.sourceAsset.mimeType,
      renderedPages,
    });
    assertFloorPlanPublicationChecks(publication.checks);
    const independentManifest = buildIndependentFloorPlanSourceManifest({
      document: approvedDocument,
      observationManifest: sourceObservationManifest,
      checks: publication.checks,
      geometryHash: publication.geometryHash,
      dimensionEvidenceMode: publication.dimensionEvidenceMode,
      sourceOverlayVerification: publication.sourceOverlayVerification,
      reviewerId: approvedBy,
      reviewedAt: approvedAt.toISOString(),
      renderedPages,
    });

    const revision = await prisma.$transaction(async (tx) => {
      // Claim the exact reviewed candidate before creating its immutable
      // revision. This row lock prevents a concurrent admin correction or
      // consumer apply from making the source job diverge from the revision.
      const claimedJob = await tx.floorPlanImportJob.updateMany({
        where: {
          id,
          status: "ready",
          candidateVersion: expectedCandidateVersion as number,
          sourceObservationVersion: expectedSourceObservationVersion as number,
          revision: { is: null },
        },
        data: {
          sourceManifestJson: independentManifest as Prisma.InputJsonValue,
        },
      });
      if (claimedJob.count !== 1) throw new Error("APPROVAL_CONFLICT");

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
      if (superseded?.id === approvedDocument.revisionId) {
        throw new Error("SUPERSEDE_TARGET_SAME_REVISION");
      }
      if (superseded) {
        assertFloorPlanSupersedeCoverage({
          replaced: superseded.addressBindings,
          replacement: addressBindings,
        });
      }

      const existingBindings = addressBindings.length
        ? await tx.floorPlanAddressBinding.findMany({
            where: {
              ...(superseded ? { revisionId: { not: superseded.id } } : {}),
              revision: { publicationStatus: { in: ["approved", "published"] } },
              OR: addressBindings.flatMap((binding) => [
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
        incoming: addressBindings,
        existing: existingBindings,
      });

      const created = await tx.floorPlanRevision.create({
        data: {
          id: approvedDocument.revisionId,
          sourceJobId: id,
          geometryHash: publication.geometryHash,
          documentJson: approvedDocument as unknown as Prisma.InputJsonValue,
          sourceManifestJson: independentManifest as Prisma.InputJsonValue,
          sourceObservationManifestJson:
            sourceObservationManifest as Prisma.InputJsonValue,
          ...(constructionEvidence
            ? { constructionEvidenceJson: constructionEvidence as Prisma.InputJsonValue }
            : {}),
          verificationTier,
          publicationStatus: "approved",
          approvedAt,
          approvedByEmail: approvedBy,
          publicMetadata: {
            create: {
              ...publicDisplayMetadata,
              approvedAt,
              approvedByEmail: approvedBy,
            },
          },
          addressBindings: {
            create: addressBindings.map((binding) => ({
              countryCode: binding.countryCode,
              addressNormalized: binding.addressNormalized,
              block: binding.block,
              street: binding.street,
              postalCode: binding.postalCode ?? null,
              stack: binding.stack ?? null,
              floorMin: binding.floorMin ?? null,
              floorMax: binding.floorMax ?? null,
              transform: binding.transform,
              role: binding.role,
              ...(binding.sourceEvidence
                ? { sourceEvidenceJson: binding.sourceEvidence as Prisma.InputJsonValue }
                : {}),
            })),
          },
        },
        select: {
          id: true,
          geometryHash: true,
          verificationTier: true,
          publicationStatus: true,
        },
      });
      const persisted = await tx.floorPlanRevision.findUnique({
        where: { id: created.id },
        select: {
          geometryHash: true,
          documentJson: true,
          sourceManifestJson: true,
          sourceObservationManifestJson: true,
          constructionEvidenceJson: true,
          publicMetadata: true,
        },
      });
      if (!persisted) throw new Error("REVISION_PERSISTENCE_MISMATCH");
      const persistedDocument = compileCandidateFloorPlanDocumentV2(
        persisted.documentJson
      );
      if (
        persisted.geometryHash !== publication.geometryHash ||
        persistedDocument.scene.geometryHash !== publication.geometryHash ||
        hashCanonicalJson(persistedDocument.document) !==
        hashCanonicalJson(approvedDocument) ||
        hashCanonicalJson(persisted.sourceManifestJson) !==
          hashCanonicalJson(independentManifest) ||
        hashCanonicalJson(persisted.sourceObservationManifestJson) !==
          hashCanonicalJson(sourceObservationManifest) ||
        hashCanonicalJson(persisted.constructionEvidenceJson) !==
          hashCanonicalJson(constructionEvidence) ||
        !persisted.publicMetadata ||
        hashCanonicalJson(
          projectFloorPlanPublicDisplayMetadata(persisted.publicMetadata)
        ) !== hashCanonicalJson(publicDisplayMetadata)
      ) {
        throw new Error("REVISION_PERSISTENCE_MISMATCH");
      }
      const persistedBindings = await tx.floorPlanAddressBinding.findMany({
        where: { revisionId: created.id },
        orderBy: { id: "asc" },
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
      });
      const auditRecord = buildFloorPlanRevisionAuditRecord({
        eventType: "revision_approved",
        revisionId: created.id,
        sourceJobId: id,
        actorEmail: approvedBy,
        occurredAt: approvedAt,
        previousStatus: null,
        nextStatus: "approved",
        geometryHash: publication.geometryHash,
        sourceManifest: independentManifest,
        constructionEvidence,
        sourceAsset: job.sourceAsset,
        addressBindings: persistedBindings,
        candidateVersion: expectedCandidateVersion as number,
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
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(
      {
        revision,
        ...(supersedesRevisionId
          ? { supersededRevisionId: supersedesRevisionId, awaitingPublication: true }
          : {}),
      },
      { status: 201 }
    );
  } catch (cause) {
    if (cause instanceof ZodError) return error("Invalid approval payload", 400);
    if (cause instanceof FloorPlanAddressBindingEvidenceError) {
      return error(cause.message, 400);
    }
    if (cause instanceof FloorPlanConstructionEvidenceError) {
      return error(cause.message, 400);
    }
    if (cause instanceof FloorPlanPublicEntityIdError) {
      return error(
        "Canonical entity IDs must use opaque generated identifiers before approval",
        409
      );
    }
    if (cause instanceof Error && cause.message === "APPROVAL_CONFLICT") {
      return error("The floor plan changed while it was being approved", 409);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_TARGET_NOT_FOUND") {
      return error("The published revision to replace was not found", 404);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_TARGET_NOT_PUBLISHED") {
      return error("Only a currently published revision can be superseded", 409);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_TARGET_SAME_REVISION") {
      return error("A revision cannot supersede itself", 409);
    }
    if (cause instanceof Error && cause.message === "SUPERSEDE_CONFLICT") {
      return error("The published revision changed; reload both imports", 409);
    }
    if (cause instanceof Error && cause.message.startsWith("SUPERSEDE_ADDRESS_GAP:")) {
      return error(cause.message.replace("SUPERSEDE_ADDRESS_GAP: ", ""), 409);
    }
    if (cause instanceof Error && cause.message === "REVISION_PERSISTENCE_MISMATCH") {
      console.error("Floor-plan revision failed its database round-trip integrity check");
      return error("Unable to persist the verified floor-plan revision", 500);
    }
    if (
      cause instanceof Error &&
      (cause.message.startsWith("FloorPlanDocumentV2 validation failed:") ||
        cause.message.startsWith("candidate ") ||
        cause.message === "floorMin cannot exceed floorMax")
    ) {
      return error(cause.message, 400);
    }
    if (cause instanceof Error && cause.message.includes("ADDRESS_BINDING_CONFLICT")) {
      return error(cause.message.replace(/^.*ADDRESS_BINDING_CONFLICT:\s*/, ""), 409);
    }
    if (
      cause instanceof Error &&
      cause.message.startsWith("Floor-plan publication gates failed:")
    ) {
      return error(cause.message, 409);
    }
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "P2002"
    ) {
      return error("This document revision or source job was already approved", 409);
    }
    console.error("Floor-plan approval failed", cause);
    return error("Unable to approve the floor plan", 500);
  }
}
