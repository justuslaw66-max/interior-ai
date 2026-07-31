import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "./status";
import {
  assessFloorPlanRetentionPurge,
  type FloorPlanAssetDeletionReason,
  type FloorPlanRetentionAsset,
  type FloorPlanRetentionDecisionCode,
} from "./privacy";
import type { FloorPlanImportStatus } from "./types";
import { scrubRetainedFloorPlanSourceManifest } from "./retention-manifest";
import {
  enqueueFloorPlanExternalDeletion,
  floorPlanContentDeletionPatch,
  floorPlanSourceContentDeletionPatch,
} from "./retention-outbox";
import {
  savedFloorPlanUnderlaySourceLink,
  scrubPrivateFloorPlanUnderlayFromSnapshot,
  type FloorPlanSavedUnderlayScrubResult,
} from "./retention-underlay";

export {
  floorPlanContentDeletionPatch,
  floorPlanSourceContentDeletionPatch,
} from "./retention-outbox";
export type { FloorPlanExternalContentDeleter } from "./retention-outbox";
export { scrubPrivateFloorPlanUnderlayFromSnapshot } from "./retention-underlay";
export type { FloorPlanSavedUnderlayScrubResult } from "./retention-underlay";

const DEFAULT_CLEANUP_LIMIT = 50;
const MAX_CLEANUP_LIMIT = 500;

type RetentionRevisionRow = {
  publicationStatus: string;
  approvedAt: Date | null;
  publishedAt: Date | null;
};

type RetentionJobSummaryRow = {
  id: string;
  userId: string;
  status: string;
  sourceRetentionExpiresAt: Date;
  sourceDeletionRequestedAt: Date | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  revision: RetentionRevisionRow | null;
};

type RetentionDerivedRow = {
  id: string;
  jobId: string;
  storageProvider: "database" | "external";
  storageKey: string;
  contentDeletedAt: Date | null;
};

type RetentionAttachedSourceRow = {
  sourceAsset: {
    id: string;
    storageProvider: "database" | "external";
    storageKey: string;
    contentDeletedAt: Date | null;
    supplementaryUses: Array<{ jobId: string }>;
    constructionUses: Array<{ jobId: string }>;
  };
};

type RetentionJobRow = RetentionJobSummaryRow & {
  sourceAssetId: string;
  sourceManifestJson: unknown;
  sourceAsset: {
    id: string;
    sha256: string;
    ownerScope: string;
    storageProvider: "database" | "external";
    storageKey: string;
    contentDeletedAt: Date | null;
    importJobs: RetentionJobSummaryRow[];
  };
};

type RetentionDesignRow = {
  id: string;
  snapshot: unknown;
};

type RetentionTransaction = {
  $queryRaw<T>(query: unknown): Promise<T>;
  floorPlanImportJob: {
    findUnique(args: unknown): Promise<RetentionJobRow | null>;
    findMany(args: unknown): Promise<
      Array<{ id: string; sourceManifestJson?: unknown }>
    >;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  floorPlanDerivedAsset: {
    findMany(args: unknown): Promise<RetentionDerivedRow[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  floorPlanSupplementarySource: {
    findMany(args: unknown): Promise<RetentionAttachedSourceRow[]>;
  };
  floorPlanConstructionSource: {
    findMany(args: unknown): Promise<RetentionAttachedSourceRow[]>;
  };
  floorPlanSourceAsset: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  floorPlanObjectDeletionOutbox: {
    upsert(args: unknown): Promise<{
      id: string;
      status: "pending" | "processing" | "completed" | "dead_letter";
    }>;
  };
  design: {
    findMany(args: unknown): Promise<RetentionDesignRow[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

type RetentionClient = RetentionTransaction & {
  $transaction<T>(
    callback: (transaction: RetentionTransaction) => Promise<T>
  ): Promise<T>;
  floorPlanImportJob: RetentionTransaction["floorPlanImportJob"];
};

type FloorPlanUnderlaySaveRetentionClient = {
  $queryRaw<T>(query: unknown): Promise<T>;
  floorPlanImportJob: {
    findFirst(args: unknown): Promise<{
      sourceAsset: { sha256: string; contentDeletedAt: Date | null };
    } | null>;
  };
  floorPlanSourceAsset: {
    findMany(args: unknown): Promise<
      Array<{ sha256: string; contentDeletedAt: Date | null }>
    >;
  };
};

export type FloorPlanRetentionPurgeResult = {
  jobId: string;
  code: FloorPlanRetentionDecisionCode;
  sourceContentDeleted: boolean;
  sourceAlreadyDeleted: boolean;
  derivedContentDeleted: number;
  designUnderlaysScrubbed: number;
  externalContentQueued: number;
  externalContentSkipped: number;
  affectedJobIds: string[];
};

export type FloorPlanRetentionCleanupSummary = {
  scanned: number;
  purged: number;
  sourceContentDeleted: number;
  derivedContentDeleted: number;
  externalContentQueued: number;
  skipped: Record<string, number>;
  results: FloorPlanRetentionPurgeResult[];
};

export class FloorPlanRetentionError extends Error {
  constructor(
    public readonly code: FloorPlanRetentionDecisionCode,
    message: string
  ) {
    super(message);
    this.name = "FloorPlanRetentionError";
  }
}

function boundedCleanupLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_CLEANUP_LIMIT;
  return Math.min(MAX_CLEANUP_LIMIT, Math.max(1, Math.round(value!)));
}

/**
 * Prevents a queued create/update from restoring private underlay bytes after
 * the matching source-deletion transaction commits. Both paths lock the source
 * row before touching Design, so whichever transaction wins is authoritative.
 */
export async function sanitizePrivateFloorPlanUnderlayForSave(input: {
  snapshot: unknown;
  ownerUserId: string;
  client?: unknown;
}): Promise<FloorPlanSavedUnderlayScrubResult> {
  const link = savedFloorPlanUnderlaySourceLink(input.snapshot);
  if (!link || (!link.sourceJobId && !link.sourceAssetSha256)) {
    return { snapshot: input.snapshot, scrubbed: false };
  }
  const client = (input.client ?? prisma) as FloorPlanUnderlaySaveRetentionClient;

  if (link.sourceJobId) {
    await client.$queryRaw(
      Prisma.sql`
        SELECT source."id"
        FROM "FloorPlanSourceAsset" source
        INNER JOIN "FloorPlanImportJob" job
          ON job."sourceAssetId" = source."id"
        WHERE job."id" = ${link.sourceJobId}
          AND job."userId" = ${input.ownerUserId}
        FOR UPDATE OF source
      `
    );
    const job = await client.floorPlanImportJob.findFirst({
      where: { id: link.sourceJobId, userId: input.ownerUserId },
      select: {
        sourceAsset: { select: { sha256: true, contentDeletedAt: true } },
      },
    });
    if (job) {
      if (!job.sourceAsset.contentDeletedAt) {
        return { snapshot: input.snapshot, scrubbed: false };
      }
      return scrubPrivateFloorPlanUnderlayFromSnapshot({
        snapshot: input.snapshot,
        affectedJobIds: [link.sourceJobId],
        sourceAssetSha256: job.sourceAsset.sha256,
      });
    }
  }

  if (!link.sourceAssetSha256) {
    return { snapshot: input.snapshot, scrubbed: false };
  }
  await client.$queryRaw(
    Prisma.sql`
      SELECT "id"
      FROM "FloorPlanSourceAsset"
      WHERE "ownerScope" = ${input.ownerUserId}
        AND "sha256" = ${link.sourceAssetSha256}
      ORDER BY "id"
      FOR UPDATE
    `
  );
  const sources = await client.floorPlanSourceAsset.findMany({
    where: {
      ownerScope: input.ownerUserId,
      sha256: link.sourceAssetSha256,
    },
    select: { sha256: true, contentDeletedAt: true },
  });
  const hasRetainedSource = sources.some((source) => !source.contentDeletedAt);
  const hasDeletedSource = sources.some((source) => source.contentDeletedAt);
  if (!hasDeletedSource || hasRetainedSource) {
    return { snapshot: input.snapshot, scrubbed: false };
  }
  return scrubPrivateFloorPlanUnderlayFromSnapshot({
    snapshot: input.snapshot,
    affectedJobIds: [],
    sourceAssetSha256: link.sourceAssetSha256,
  });
}

function retentionAsset(row: RetentionJobRow): FloorPlanRetentionAsset {
  return {
    id: row.sourceAsset.id,
    ownerScope: row.sourceAsset.ownerScope,
    contentDeletedAt: row.sourceAsset.contentDeletedAt,
    jobs: row.sourceAsset.importJobs.map((job) => ({
      ...job,
      status: job.status as FloorPlanImportStatus,
    })),
  };
}

function decisionError(code: FloorPlanRetentionDecisionCode) {
  switch (code) {
    case "owner_boundary":
    case "not_found":
      return new FloorPlanRetentionError("not_found", "Floor-plan import not found");
    case "protected_revision":
      return new FloorPlanRetentionError(
        code,
        "Approved or published floor-plan evidence cannot be deleted"
      );
    case "active_lease":
      return new FloorPlanRetentionError(
        code,
        "The floor plan is still being processed; try again when processing finishes"
      );
    case "processing_incomplete":
      return new FloorPlanRetentionError(
        code,
        "Finish or cancel every import using this uploaded source before deleting it"
      );
    default:
      return new FloorPlanRetentionError(code, "Floor-plan content cannot be deleted");
  }
}

function jobSelect() {
  return {
    id: true,
    userId: true,
    status: true,
    sourceAssetId: true,
    sourceRetentionExpiresAt: true,
    sourceDeletionRequestedAt: true,
    sourceManifestJson: true,
    leaseToken: true,
    leaseExpiresAt: true,
    revision: {
      select: {
        publicationStatus: true,
        approvedAt: true,
        publishedAt: true,
      },
    },
    sourceAsset: {
      select: {
        id: true,
        sha256: true,
        ownerScope: true,
        storageProvider: true,
        storageKey: true,
        contentDeletedAt: true,
        importJobs: {
          select: {
            id: true,
            userId: true,
            status: true,
            sourceRetentionExpiresAt: true,
            sourceDeletionRequestedAt: true,
            leaseToken: true,
            leaseExpiresAt: true,
            revision: {
              select: {
                publicationStatus: true,
                approvedAt: true,
                publishedAt: true,
              },
            },
          },
        },
      },
    },
  };
}

export class PrismaFloorPlanRetentionService {
  constructor(private readonly client: unknown = prisma) {}

  private prismaClient() {
    return this.client as RetentionClient;
  }

  private async purgeOne(input: {
    jobId: string;
    reason: FloorPlanAssetDeletionReason;
    now: Date;
    ownerUserId?: string;
    dryRun?: boolean;
  }): Promise<FloorPlanRetentionPurgeResult> {
    try {
      return await this.prismaClient().$transaction(async (transaction) => {
      const preliminary = await transaction.floorPlanImportJob.findUnique({
        where: { id: input.jobId },
        select: {
          id: true,
          userId: true,
          sourceAssetId: true,
        },
      });
      if (!preliminary || (input.ownerUserId && preliminary.userId !== input.ownerUserId)) {
        if (input.ownerUserId) throw decisionError("not_found");
        return {
          jobId: input.jobId,
          code: "not_found",
          sourceContentDeleted: false,
          sourceAlreadyDeleted: false,
          derivedContentDeleted: 0,
          designUnderlaysScrubbed: 0,
          externalContentQueued: 0,
          externalContentSkipped: 0,
          affectedJobIds: [],
        };
      }

      // Serializes retention cleanup against owner-scoped source re-uploads.
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "FloorPlanSourceAsset" WHERE "id" = ${preliminary.sourceAssetId} FOR UPDATE`
      );
      const row = await transaction.floorPlanImportJob.findUnique({
        where: { id: input.jobId },
        select: jobSelect(),
      });
      if (!row || (input.ownerUserId && row.userId !== input.ownerUserId)) {
        if (input.ownerUserId) throw decisionError("not_found");
        return {
          jobId: input.jobId,
          code: "not_found",
          sourceContentDeleted: false,
          sourceAlreadyDeleted: false,
          derivedContentDeleted: 0,
          designUnderlaysScrubbed: 0,
          externalContentQueued: 0,
          externalContentSkipped: 0,
          affectedJobIds: [],
        };
      }

      const decision = assessFloorPlanRetentionPurge({
        asset: retentionAsset(row),
        targetJobId: row.id,
        mode: input.reason,
        now: input.now,
        ownerUserId: input.ownerUserId,
      });
      if (decision.code !== "purge") {
        if (input.ownerUserId) throw decisionError(decision.code);
        return {
          jobId: input.jobId,
          code: decision.code,
          sourceContentDeleted: false,
          sourceAlreadyDeleted: Boolean(row.sourceAsset.contentDeletedAt),
          derivedContentDeleted: 0,
          designUnderlaysScrubbed: 0,
          externalContentQueued: 0,
          externalContentSkipped: 0,
          affectedJobIds: [],
        };
      }
      if (input.dryRun) {
        return {
          jobId: input.jobId,
          code: "purge",
          sourceContentDeleted: decision.purgeSource && !row.sourceAsset.contentDeletedAt,
          sourceAlreadyDeleted: Boolean(row.sourceAsset.contentDeletedAt),
          derivedContentDeleted: 0,
          designUnderlaysScrubbed: 0,
          externalContentQueued: 0,
          externalContentSkipped: 0,
          affectedJobIds: decision.affectedJobIds,
        };
      }

      if (decision.failJobIds.length > 0) {
        const failed = await transaction.floorPlanImportJob.updateMany({
          where: {
            id: { in: decision.failJobIds },
            status: {
              in: [
                "received",
                "rendered",
                "extracted",
                "scale_solved",
                "topology_built",
                "validating",
                "needs_review",
              ],
            },
            OR: [
              { leaseToken: null },
              { leaseExpiresAt: { lte: input.now } },
            ],
          },
          data: {
            status: "failed",
            statusChangedAt: input.now,
            progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
            errorMessage:
              "Private floor-plan source retention expired before the import finished",
            leaseToken: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastErrorAt: input.now,
          },
        });
        if (failed.count !== decision.failJobIds.length) {
          throw new Error("FLOOR_PLAN_RETENTION_RACE");
        }
      }

      if (input.reason === "owner_requested") {
        await transaction.floorPlanImportJob.updateMany({
          where: {
            id: { in: decision.affectedJobIds },
            trainingBenchmarkOptIn: true,
          },
          data: {
            trainingBenchmarkOptIn: false,
            trainingBenchmarkRevokedAt: input.now,
            sourceDeletionRequestedAt: input.now,
          },
        });
      }
      await transaction.floorPlanImportJob.updateMany({
        where: {
          id: { in: decision.affectedJobIds },
          revision: { is: null },
        },
        data: { sourceDeletionRequestedAt: input.now },
      });

      const supplementarySources =
        await transaction.floorPlanSupplementarySource.findMany({
          where: { jobId: { in: decision.affectedJobIds } },
          select: {
            sourceAsset: {
              select: {
                id: true,
                storageProvider: true,
                storageKey: true,
                contentDeletedAt: true,
                supplementaryUses: { select: { jobId: true } },
                constructionUses: { select: { jobId: true } },
              },
            },
          },
        });
      const constructionSources =
        await transaction.floorPlanConstructionSource.findMany({
          where: { jobId: { in: decision.affectedJobIds } },
          select: {
            sourceAsset: {
              select: {
                id: true,
                storageProvider: true,
                storageKey: true,
                contentDeletedAt: true,
                supplementaryUses: { select: { jobId: true } },
                constructionUses: { select: { jobId: true } },
              },
            },
          },
        });
      const attachedSources = [
        ...new Map(
          [...supplementarySources, ...constructionSources].map((entry) => [
            entry.sourceAsset.id,
            entry,
          ])
        ).values(),
      ];
      const attachedSourceIds = [
        ...new Set(attachedSources.map((entry) => entry.sourceAsset.id)),
      ].sort();
      if (attachedSourceIds.length > 0) {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "FloorPlanSourceAsset" WHERE "id" IN (${Prisma.join(
            attachedSourceIds
          )}) ORDER BY "id" FOR UPDATE`
        );
      }

      const derivatives = await transaction.floorPlanDerivedAsset.findMany({
        where: {
          jobId: { in: decision.purgeDerivedJobIds },
          contentDeletedAt: null,
        },
        select: {
          id: true,
          jobId: true,
          storageProvider: true,
          storageKey: true,
          contentDeletedAt: true,
        },
      });
      const databaseDerivativeIds = derivatives
        .filter((asset) => asset.storageProvider === "database")
        .map((asset) => asset.id);
      let derivedContentDeleted = 0;
      let externalContentQueued = 0;
      let externalContentSkipped = 0;
      if (databaseDerivativeIds.length > 0) {
        const deleted = await transaction.floorPlanDerivedAsset.updateMany({
          where: { id: { in: databaseDerivativeIds }, contentDeletedAt: null },
          data: {
            ...floorPlanContentDeletionPatch(input.reason, input.now),
          },
        });
        derivedContentDeleted += deleted.count;
      }
      for (const derivative of derivatives.filter(
        (asset) => asset.storageProvider === "external"
      )) {
        const queued = await enqueueFloorPlanExternalDeletion(transaction, {
          kind: "derived",
          assetId: derivative.id,
          storageKey: derivative.storageKey,
          reason: input.reason,
        });
        if (queued.queued) externalContentQueued += 1;
        else externalContentSkipped += 1;
      }

      let sourceContentDeleted = false;
      if (decision.purgeSource && !row.sourceAsset.contentDeletedAt) {
        if (row.sourceAsset.storageProvider === "external") {
          const queued = await enqueueFloorPlanExternalDeletion(transaction, {
            kind: "source",
            assetId: row.sourceAsset.id,
            storageKey: row.sourceAsset.storageKey,
            reason: input.reason,
          });
          if (queued.queued) externalContentQueued += 1;
          else externalContentSkipped += 1;
        } else {
          const deleted = await transaction.floorPlanSourceAsset.updateMany({
            where: { id: row.sourceAsset.id, contentDeletedAt: null },
            data: {
              ...floorPlanSourceContentDeletionPatch(input.reason, input.now),
            },
          });
          sourceContentDeleted = deleted.count === 1;
        }
      }

      // Attached address and construction evidence share the job retention
      // boundary. They remain
      // durable once a revision exists (the policy above blocks deletion), but
      // unapproved source bytes cannot survive expiry indefinitely.
      for (const entry of attachedSources) {
        const source = entry.sourceAsset;
        if (source.contentDeletedAt) continue;
        const canClear = [
          ...source.supplementaryUses,
          ...source.constructionUses,
        ].every((usage) => decision.affectedJobIds.includes(usage.jobId));
        if (!canClear) {
          externalContentSkipped += 1;
          continue;
        }
        if (source.storageProvider === "external") {
          const queued = await enqueueFloorPlanExternalDeletion(transaction, {
            kind: "source",
            assetId: source.id,
            storageKey: source.storageKey,
            reason: input.reason,
          });
          if (queued.queued) externalContentQueued += 1;
          else externalContentSkipped += 1;
        } else {
          await transaction.floorPlanSourceAsset.updateMany({
            where: { id: source.id, contentDeletedAt: null },
            data: {
              ...floorPlanSourceContentDeletionPatch(input.reason, input.now),
            },
          });
        }
      }

      const affectedManifests = await transaction.floorPlanImportJob.findMany({
        where: {
          id: { in: decision.affectedJobIds },
          revision: { is: null },
        },
        select: { id: true, sourceManifestJson: true },
      });
      for (const affected of affectedManifests) {
        const scrubbedManifest = scrubRetainedFloorPlanSourceManifest(
          affected.sourceManifestJson
        );
        if (!scrubbedManifest.scrubbed) continue;
        const scrubbed = await transaction.floorPlanImportJob.updateMany({
          where: { id: affected.id, revision: { is: null } },
          data: {
            sourceManifestJson:
              scrubbedManifest.manifest as Prisma.InputJsonValue,
          },
        });
        if (scrubbed.count !== 1) throw new Error("FLOOR_PLAN_RETENTION_RACE");
      }

      let designUnderlaysScrubbed = 0;
      if (
        input.reason === "owner_requested" &&
        (sourceContentDeleted || Boolean(row.sourceAsset.contentDeletedAt))
      ) {
        // Lock owner designs so an already-running save cannot race this scrub
        // inside the deletion transaction.
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Design" WHERE "userId" = ${row.userId} FOR UPDATE`
        );
        const designs = await transaction.design.findMany({
          where: { userId: row.userId, snapshot: { not: Prisma.DbNull } },
          select: { id: true, snapshot: true },
        });
        for (const design of designs) {
          const scrubbed = scrubPrivateFloorPlanUnderlayFromSnapshot({
            snapshot: design.snapshot,
            affectedJobIds: decision.affectedJobIds,
            sourceAssetSha256: row.sourceAsset.sha256,
          });
          if (!scrubbed.scrubbed) continue;
          const updated = await transaction.design.updateMany({
            where: { id: design.id, userId: row.userId },
            data: { snapshot: scrubbed.snapshot as Prisma.InputJsonValue },
          });
          if (updated.count !== 1) throw new Error("FLOOR_PLAN_RETENTION_RACE");
          designUnderlaysScrubbed += 1;
        }
      }

      return {
        jobId: row.id,
        code: "purge",
        sourceContentDeleted,
        sourceAlreadyDeleted: Boolean(row.sourceAsset.contentDeletedAt),
        derivedContentDeleted,
        designUnderlaysScrubbed,
        externalContentQueued,
        externalContentSkipped,
        affectedJobIds: decision.affectedJobIds,
      };
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "FLOOR_PLAN_RETENTION_RACE") {
        if (input.ownerUserId) throw decisionError("active_lease");
        return {
          jobId: input.jobId,
          code: "active_lease",
          sourceContentDeleted: false,
          sourceAlreadyDeleted: false,
          derivedContentDeleted: 0,
          designUnderlaysScrubbed: 0,
          externalContentQueued: 0,
          externalContentSkipped: 0,
          affectedJobIds: [],
        };
      }
      throw cause;
    }
  }

  async requestOwnerDeletion(input: {
    jobId: string;
    ownerUserId: string;
    now?: Date;
  }) {
    return this.purgeOne({
      jobId: input.jobId,
      ownerUserId: input.ownerUserId,
      reason: "owner_requested",
      now: input.now ?? new Date(),
    });
  }

  async cleanupExpired(input: {
    limit?: number;
    now?: Date;
    dryRun?: boolean;
  } = {}): Promise<FloorPlanRetentionCleanupSummary> {
    const now = input.now ?? new Date();
    const limit = boundedCleanupLimit(input.limit);
    const candidates = await this.prismaClient().floorPlanImportJob.findMany({
      where: {
        sourceRetentionExpiresAt: { lte: now },
        revision: { is: null },
        OR: [
          { sourceAsset: { is: { contentDeletedAt: null } } },
          { derivedAssets: { some: { contentDeletedAt: null } } },
          {
            supplementarySources: {
              some: { sourceAsset: { is: { contentDeletedAt: null } } },
            },
          },
          {
            constructionSources: {
              some: { sourceAsset: { is: { contentDeletedAt: null } } },
            },
          },
        ],
      },
      orderBy: [{ sourceRetentionExpiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    const results: FloorPlanRetentionPurgeResult[] = [];
    for (const candidate of candidates) {
      results.push(
        await this.purgeOne({
          jobId: candidate.id,
          reason: "retention_expired",
          now,
          dryRun: input.dryRun,
        })
      );
    }
    const skipped: Record<string, number> = {};
    for (const result of results) {
      if (result.code === "purge") continue;
      skipped[result.code] = (skipped[result.code] ?? 0) + 1;
    }
    return {
      scanned: candidates.length,
      purged: results.filter((result) => result.code === "purge").length,
      sourceContentDeleted: results.filter(
        (result) => result.sourceContentDeleted
      ).length,
      derivedContentDeleted: results.reduce(
        (sum, result) => sum + result.derivedContentDeleted,
        0
      ),
      externalContentQueued: results.reduce(
        (sum, result) => sum + result.externalContentQueued,
        0
      ),
      skipped,
      results,
    };
  }
}
