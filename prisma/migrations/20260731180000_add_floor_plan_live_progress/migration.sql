ALTER TABLE "FloorPlanImportJob"
  ADD COLUMN "statusChangedAt" TIMESTAMP(3);

CREATE INDEX "FloorPlanImportStageEvent_adapterId_extractionVersion_fromStatus_createdAt_idx"
  ON "FloorPlanImportStageEvent"(
    "adapterId",
    "extractionVersion",
    "fromStatus",
    "createdAt"
  );
