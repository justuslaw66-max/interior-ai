import type { FloorPlanAssetDeletionReason } from "./privacy";

export type FloorPlanExternalContentDeleter = (input: {
  kind: "source" | "derived";
  storageKey: string;
}) => Promise<void>;

export type FloorPlanObjectDeletionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "dead_letter";

export type FloorPlanObjectDeletionKind = "source" | "derived";

type EnqueueDeletionClient = {
  floorPlanObjectDeletionOutbox: {
    upsert(args: unknown): Promise<{
      id: string;
      status: FloorPlanObjectDeletionStatus;
    }>;
  };
};

export type FloorPlanExternalDeletionRequest = {
  kind: FloorPlanObjectDeletionKind;
  assetId: string;
  storageKey: string;
  reason: FloorPlanAssetDeletionReason;
};

export type FloorPlanExternalDeletionEnqueueResult = {
  id: string;
  status: FloorPlanObjectDeletionStatus;
  queued: boolean;
};

export function floorPlanObjectDeletionErrorMessage(cause: unknown) {
  const message =
    cause instanceof Error ? cause.message : "External deletion failed";
  return message.trim().slice(0, 2_000) || "External deletion failed";
}

export function floorPlanObjectDeletionRetryDelayMs(attemptNumber: number) {
  const exponent = Math.max(0, Math.min(10, attemptNumber - 1));
  return Math.min(60 * 60_000, 5_000 * 2 ** exponent);
}

/** Deliberately omits hashes, manifests, dimensions and provenance metadata. */
export function floorPlanContentDeletionPatch(
  reason: FloorPlanAssetDeletionReason,
  deletedAt: Date
) {
  return {
    bytes: null,
    externalUrl: null,
    contentDeletedAt: deletedAt,
    contentDeletionReason: reason,
  } as const;
}

export function floorPlanSourceContentDeletionPatch(
  reason: FloorPlanAssetDeletionReason,
  deletedAt: Date
) {
  return {
    ...floorPlanContentDeletionPatch(reason, deletedAt),
    fileName: "deleted-floor-plan-source",
  } as const;
}

/**
 * Enqueues an external deletion in the caller's retention transaction. The
 * unique asset relation makes repeated cleanup runs idempotent. Existing
 * retries and leases are never reset by another retention sweep.
 */
export async function enqueueFloorPlanExternalDeletion(
  client: EnqueueDeletionClient,
  input: FloorPlanExternalDeletionRequest
): Promise<FloorPlanExternalDeletionEnqueueResult> {
  const source = input.kind === "source";
  const row = await client.floorPlanObjectDeletionOutbox.upsert({
    where: source
      ? { sourceAssetId: input.assetId }
      : { derivedAssetId: input.assetId },
    create: {
      kind: input.kind,
      sourceAssetId: source ? input.assetId : null,
      derivedAssetId: source ? null : input.assetId,
      storageKey: input.storageKey,
      deletionReason: input.reason,
    },
    // Owner deletion is stronger than scheduled expiry. Never downgrade it,
    // and never reset queue state or attempts during an idempotent re-enqueue.
    update:
      input.reason === "owner_requested"
        ? { deletionReason: "owner_requested" }
        : {},
    select: { id: true, status: true },
  });
  if (row.status === "completed") {
    throw new Error("FLOOR_PLAN_DELETION_OUTBOX_COMPLETED_WITH_LIVE_ASSET");
  }
  return {
    id: row.id,
    status: row.status,
    queued: row.status === "pending" || row.status === "processing",
  };
}
