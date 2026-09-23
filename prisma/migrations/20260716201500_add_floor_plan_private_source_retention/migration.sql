ALTER TABLE "FloorPlanSourceAsset"
  ADD COLUMN "contentDeletedAt" TIMESTAMP(3),
  ADD COLUMN "contentDeletionReason" VARCHAR(40);

ALTER TABLE "FloorPlanDerivedAsset"
  ADD COLUMN "contentDeletedAt" TIMESTAMP(3),
  ADD COLUMN "contentDeletionReason" VARCHAR(40);

ALTER TABLE "FloorPlanImportJob"
  ADD COLUMN "trainingBenchmarkOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trainingBenchmarkOptInAt" TIMESTAMP(3),
  ADD COLUMN "trainingBenchmarkConsentVersion" VARCHAR(80),
  ADD COLUMN "trainingBenchmarkRevokedAt" TIMESTAMP(3),
  ADD COLUMN "sourceRetentionExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  ADD COLUMN "sourceDeletionRequestedAt" TIMESTAMP(3);

CREATE INDEX "FloorPlanImportJob_sourceRetentionExpiresAt_idx"
  ON "FloorPlanImportJob"("sourceRetentionExpiresAt");

CREATE INDEX "FloorPlanImportJob_sourceAssetId_sourceRetentionExpiresAt_idx"
  ON "FloorPlanImportJob"("sourceAssetId", "sourceRetentionExpiresAt");

ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_training_consent_coherent"
  CHECK (
    (
      "trainingBenchmarkOptIn" = true
      AND "trainingBenchmarkOptInAt" IS NOT NULL
      AND "trainingBenchmarkConsentVersion" IS NOT NULL
      AND "trainingBenchmarkRevokedAt" IS NULL
    )
    OR
    (
      "trainingBenchmarkOptIn" = false
      AND (
        (
          "trainingBenchmarkOptInAt" IS NULL
          AND "trainingBenchmarkConsentVersion" IS NULL
          AND "trainingBenchmarkRevokedAt" IS NULL
        )
        OR
        (
          "trainingBenchmarkOptInAt" IS NOT NULL
          AND "trainingBenchmarkConsentVersion" IS NOT NULL
          AND "trainingBenchmarkRevokedAt" IS NOT NULL
        )
      )
    )
  ),
  ADD CONSTRAINT "FloorPlanImportJob_retention_after_creation"
  CHECK ("sourceRetentionExpiresAt" >= "createdAt");

ALTER TABLE "FloorPlanSourceAsset"
  ADD CONSTRAINT "FloorPlanSourceAsset_content_deletion_coherent"
  CHECK (
    ("contentDeletedAt" IS NULL AND "contentDeletionReason" IS NULL)
    OR
    (
      "contentDeletedAt" IS NOT NULL
      AND "contentDeletionReason" IN ('retention_expired', 'owner_requested')
    )
  );

ALTER TABLE "FloorPlanDerivedAsset"
  ADD CONSTRAINT "FloorPlanDerivedAsset_content_deletion_coherent"
  CHECK (
    ("contentDeletedAt" IS NULL AND "contentDeletionReason" IS NULL)
    OR
    (
      "contentDeletedAt" IS NOT NULL
      AND "contentDeletionReason" IN ('retention_expired', 'owner_requested')
    )
  );
