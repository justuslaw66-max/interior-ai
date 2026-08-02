ALTER TABLE "FloorPlanImportJob"
  ADD COLUMN "leaseToken" VARCHAR(64),
  ADD COLUMN "leaseOwner" VARCHAR(160),
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastRecoveredAt" TIMESTAMP(3);

CREATE INDEX "FloorPlanImportJob_status_nextAttemptAt_leaseExpiresAt_idx"
  ON "FloorPlanImportJob"("status", "nextAttemptAt", "leaseExpiresAt");

CREATE INDEX "FloorPlanImportJob_leaseToken_idx"
  ON "FloorPlanImportJob"("leaseToken");

ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_attemptCount_nonnegative"
  CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "FloorPlanImportJob_retryCount_nonnegative"
  CHECK ("retryCount" >= 0),
  ADD CONSTRAINT "FloorPlanImportJob_maxAttempts_positive"
  CHECK ("maxAttempts" > 0),
  ADD CONSTRAINT "FloorPlanImportJob_lease_complete"
  CHECK (
    ("leaseToken" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
    OR
    ("leaseToken" IS NOT NULL AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  );
