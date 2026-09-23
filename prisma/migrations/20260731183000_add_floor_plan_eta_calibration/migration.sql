CREATE TABLE "FloorPlanImportEtaPrediction" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "jobId" TEXT NOT NULL,
  "fromStatus" "FloorPlanImportJobStatus" NOT NULL,
  "outcomeStatus" "FloorPlanImportJobStatus",
  "adapterId" VARCHAR(160),
  "extractionVersion" VARCHAR(160),
  "lowerMs" INTEGER NOT NULL,
  "upperMs" INTEGER NOT NULL,
  "confidence" VARCHAR(16),
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "actualRemainingMs" INTEGER,
  CONSTRAINT "FloorPlanImportEtaPrediction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanImportEtaPrediction_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "FloorPlanImportJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FloorPlanImportEtaPrediction_range_check"
    CHECK (
      "lowerMs" >= 0 AND
      "upperMs" >= "lowerMs" AND
      ("actualRemainingMs" IS NULL OR "actualRemainingMs" >= 0)
    )
);

CREATE UNIQUE INDEX "FloorPlanImportEtaPrediction_jobId_fromStatus_key"
  ON "FloorPlanImportEtaPrediction"("jobId", "fromStatus");

CREATE INDEX "FloorPlanImportEtaPrediction_adapterId_extractionVersion_fromStatus_createdAt_idx"
  ON "FloorPlanImportEtaPrediction"(
    "adapterId",
    "extractionVersion",
    "fromStatus",
    "createdAt"
  );
