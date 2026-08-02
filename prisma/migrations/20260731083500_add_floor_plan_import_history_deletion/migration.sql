ALTER TABLE "FloorPlanImportJob"
ADD COLUMN "historyDeletedAt" TIMESTAMP(3);

CREATE INDEX "FloorPlanImportJob_userId_historyDeletedAt_createdAt_idx"
ON "FloorPlanImportJob"("userId", "historyDeletedAt", "createdAt");
