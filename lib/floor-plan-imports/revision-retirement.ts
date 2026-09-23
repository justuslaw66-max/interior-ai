import type { Prisma } from "@prisma/client";
import { buildFloorPlanRevisionAuditRecord } from "./revision-audit";
import {
  assertFloorPlanRevisionMutationAllowed,
  type FloorPlanRevisionLifecycleStatus,
} from "./revision-immutability";

type RetirementTransaction = Pick<
  Prisma.TransactionClient,
  "floorPlanRevision" | "floorPlanRevisionAuditEvent"
>;

export type StandaloneFloorPlanRevisionForRetirement = {
  id: string;
  sourceJobId: string;
  publicationStatus: FloorPlanRevisionLifecycleStatus;
  geometryHash: string;
  sourceManifestJson: unknown;
  constructionEvidenceJson: unknown;
  addressBindings: PublishedFloorPlanRevisionForRetirement["addressBindings"];
  sourceJob: PublishedFloorPlanRevisionForRetirement["sourceJob"];
};

export type PublishedFloorPlanRevisionForRetirement = {
  id: string;
  sourceJobId: string;
  publicationStatus: FloorPlanRevisionLifecycleStatus;
  geometryHash: string;
  sourceManifestJson: unknown;
  constructionEvidenceJson: unknown;
  addressBindings: Array<{
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
    sourceEvidenceJson: unknown;
  }>;
  sourceJob: {
    candidateVersion: number;
    sourceAsset: {
      id: string;
      sha256: string;
      mimeType: string;
      fileName: string;
    };
  };
};

/**
 * Runs only inside the caller's serializable supersede transaction. If any
 * later replacement step fails, Prisma rolls this status change and its audit
 * insert back together, leaving the published revision visible.
 */
export async function retirePublishedFloorPlanRevisionForSupersede(input: {
  tx: RetirementTransaction;
  revision: PublishedFloorPlanRevisionForRetirement;
  replacementRevisionId: string;
  actorEmail: string;
  occurredAt: Date;
  reason: string;
}) {
  if (input.revision.publicationStatus !== "published") {
    throw new Error("SUPERSEDE_TARGET_NOT_PUBLISHED");
  }
  assertFloorPlanRevisionMutationAllowed(
    { publicationStatus: input.revision.publicationStatus },
    { publicationStatus: "retired" }
  );
  const retired = await input.tx.floorPlanRevision.updateMany({
    where: { id: input.revision.id, publicationStatus: "published" },
    data: { publicationStatus: "retired" },
  });
  if (retired.count !== 1) throw new Error("SUPERSEDE_CONFLICT");

  const retirementAudit = buildFloorPlanRevisionAuditRecord({
    eventType: "revision_retired",
    revisionId: input.revision.id,
    sourceJobId: input.revision.sourceJobId,
    actorEmail: input.actorEmail,
    occurredAt: input.occurredAt,
    previousStatus: "published",
    nextStatus: "retired",
    geometryHash: input.revision.geometryHash,
    sourceManifest: input.revision.sourceManifestJson,
    constructionEvidence: input.revision.constructionEvidenceJson,
    sourceAsset: input.revision.sourceJob.sourceAsset,
    addressBindings: input.revision.addressBindings,
    candidateVersion: input.revision.sourceJob.candidateVersion,
    replacementRevisionId: input.replacementRevisionId,
    lifecycleReason: input.reason,
  });
  await input.tx.floorPlanRevisionAuditEvent.create({
    data: {
      revisionId: retirementAudit.revisionId,
      eventType: retirementAudit.eventType,
      actorEmail: retirementAudit.actorEmail,
      occurredAt: retirementAudit.occurredAt,
      sourceEvidenceJson: retirementAudit.sourceEvidence as Prisma.InputJsonValue,
      metadataJson: retirementAudit.metadata as Prisma.InputJsonValue,
    },
  });
  return retirementAudit;
}

/**
 * Withdraws an approved or published revision without replacing it. This is
 * intentionally separate from the no-downtime supersede workflow: callers
 * must use it only when an address/library entry should disappear.
 *
 * The caller owns the serializable transaction and source-job consistency
 * check. The conditional update and append-only audit insert are kept in the
 * same transaction so a failed audit can never leave an unaudited retirement.
 */
export async function retireFloorPlanRevisionWithoutReplacement(input: {
  tx: RetirementTransaction;
  revision: StandaloneFloorPlanRevisionForRetirement;
  actorEmail: string;
  occurredAt: Date;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error("RETIRE_REASON_REQUIRED");
  if (reason.length > 2_000) throw new Error("RETIRE_REASON_TOO_LONG");
  if (input.revision.publicationStatus === "retired") {
    throw new Error("RETIRE_ALREADY_RETIRED");
  }
  if (
    input.revision.publicationStatus !== "approved" &&
    input.revision.publicationStatus !== "published"
  ) {
    throw new Error("RETIRE_TARGET_NOT_APPROVED_OR_PUBLISHED");
  }

  const previousStatus = input.revision.publicationStatus;
  assertFloorPlanRevisionMutationAllowed(
    { publicationStatus: previousStatus },
    { publicationStatus: "retired" }
  );
  const retired = await input.tx.floorPlanRevision.updateMany({
    where: { id: input.revision.id, publicationStatus: previousStatus },
    // Deliberately leave approval/publication actors and timestamps intact.
    // In particular a published retirement must retain publishedAt.
    data: { publicationStatus: "retired" },
  });
  if (retired.count !== 1) throw new Error("RETIRE_CONFLICT");

  const retirementAudit = buildFloorPlanRevisionAuditRecord({
    eventType: "revision_retired",
    revisionId: input.revision.id,
    sourceJobId: input.revision.sourceJobId,
    actorEmail: input.actorEmail,
    occurredAt: input.occurredAt,
    previousStatus,
    nextStatus: "retired",
    geometryHash: input.revision.geometryHash,
    sourceManifest: input.revision.sourceManifestJson,
    constructionEvidence: input.revision.constructionEvidenceJson,
    sourceAsset: input.revision.sourceJob.sourceAsset,
    addressBindings: input.revision.addressBindings,
    candidateVersion: input.revision.sourceJob.candidateVersion,
    lifecycleReason: reason,
  });
  await input.tx.floorPlanRevisionAuditEvent.create({
    data: {
      revisionId: retirementAudit.revisionId,
      eventType: retirementAudit.eventType,
      actorEmail: retirementAudit.actorEmail,
      occurredAt: retirementAudit.occurredAt,
      sourceEvidenceJson: retirementAudit.sourceEvidence as Prisma.InputJsonValue,
      metadataJson: retirementAudit.metadata as Prisma.InputJsonValue,
    },
  });
  return retirementAudit;
}
