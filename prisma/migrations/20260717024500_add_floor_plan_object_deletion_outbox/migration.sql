CREATE TYPE "FloorPlanObjectDeletionKind" AS ENUM ('source', 'derived');
CREATE TYPE "FloorPlanObjectDeletionStatus" AS ENUM (
  'pending',
  'processing',
  'completed',
  'dead_letter'
);

CREATE TABLE "FloorPlanObjectDeletionOutbox" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "kind" "FloorPlanObjectDeletionKind" NOT NULL,
  "sourceAssetId" TEXT,
  "derivedAssetId" TEXT,
  "storageKey" TEXT NOT NULL,
  "deletionReason" VARCHAR(40) NOT NULL,
  "status" "FloorPlanObjectDeletionStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" VARCHAR(64),
  "leaseOwner" VARCHAR(160),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorMessage" VARCHAR(2000),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "FloorPlanObjectDeletionOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanObjectDeletionOutbox_asset_kind_check" CHECK (
    ("kind" = 'source' AND "sourceAssetId" IS NOT NULL AND "derivedAssetId" IS NULL) OR
    ("kind" = 'derived' AND "derivedAssetId" IS NOT NULL AND "sourceAssetId" IS NULL)
  ),
  CONSTRAINT "FloorPlanObjectDeletionOutbox_attempts_check" CHECK (
    "attemptCount" >= 0 AND "maxAttempts" >= 1 AND "attemptCount" <= "maxAttempts"
  ),
  CONSTRAINT "FloorPlanObjectDeletionOutbox_reason_check" CHECK (
    "deletionReason" IN ('retention_expired', 'owner_requested')
  ),
  CONSTRAINT "FloorPlanObjectDeletionOutbox_storage_key_check" CHECK (
    length(btrim("storageKey")) > 0
  ),
  CONSTRAINT "FloorPlanObjectDeletionOutbox_state_check" CHECK (
    (
      "status" = 'pending' AND
      "nextAttemptAt" IS NOT NULL AND
      "leaseToken" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL AND
      "completedAt" IS NULL
    ) OR (
      "status" = 'processing' AND
      "leaseToken" IS NOT NULL AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND
      "completedAt" IS NULL
    ) OR (
      "status" = 'completed' AND
      "nextAttemptAt" IS NULL AND
      "leaseToken" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL AND
      "completedAt" IS NOT NULL
    ) OR (
      "status" = 'dead_letter' AND
      "nextAttemptAt" IS NULL AND
      "leaseToken" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL AND
      "completedAt" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "FloorPlanObjectDeletionOutbox_sourceAssetId_key"
  ON "FloorPlanObjectDeletionOutbox"("sourceAssetId");
CREATE UNIQUE INDEX "FloorPlanObjectDeletionOutbox_derivedAssetId_key"
  ON "FloorPlanObjectDeletionOutbox"("derivedAssetId");
CREATE UNIQUE INDEX "FloorPlanObjectDeletionOutbox_kind_storageKey_key"
  ON "FloorPlanObjectDeletionOutbox"("kind", "storageKey");
CREATE INDEX "FloorPlanObjectDeletionOutbox_status_nextAttemptAt_createdAt_idx"
  ON "FloorPlanObjectDeletionOutbox"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "FloorPlanObjectDeletionOutbox_status_leaseExpiresAt_idx"
  ON "FloorPlanObjectDeletionOutbox"("status", "leaseExpiresAt");
CREATE INDEX "FloorPlanObjectDeletionOutbox_leaseToken_idx"
  ON "FloorPlanObjectDeletionOutbox"("leaseToken");

ALTER TABLE "FloorPlanObjectDeletionOutbox"
  ADD CONSTRAINT "FloorPlanObjectDeletionOutbox_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "FloorPlanSourceAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FloorPlanObjectDeletionOutbox"
  ADD CONSTRAINT "FloorPlanObjectDeletionOutbox_derivedAssetId_fkey"
  FOREIGN KEY ("derivedAssetId") REFERENCES "FloorPlanDerivedAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
