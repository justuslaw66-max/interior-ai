-- CreateTable
CREATE TABLE "AppEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "userId" TEXT,
  "designId" TEXT,
  "shareToken" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppEvent_eventType_idx" ON "AppEvent"("eventType");

-- CreateIndex
CREATE INDEX "AppEvent_createdAt_idx" ON "AppEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_designId_idx" ON "AppEvent"("designId");

-- CreateIndex
CREATE INDEX "AppEvent_shareToken_idx" ON "AppEvent"("shareToken");

-- CreateTable
CREATE TABLE "ModelAsset" (
  "id" TEXT NOT NULL,
  "modelUrl" TEXT NOT NULL,
  "thumbUrl" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "aabbCenterX" DOUBLE PRECISION NOT NULL,
  "aabbCenterY" DOUBLE PRECISION NOT NULL,
  "aabbCenterZ" DOUBLE PRECISION NOT NULL,
  "aabbSizeX" DOUBLE PRECISION NOT NULL,
  "aabbSizeY" DOUBLE PRECISION NOT NULL,
  "aabbSizeZ" DOUBLE PRECISION NOT NULL,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "dimsDmm" INTEGER NOT NULL,
  "dimsHmm" INTEGER NOT NULL,
  "dimsWmm" INTEGER NOT NULL,
  "groundAligned" BOOLEAN NOT NULL DEFAULT true,
  "pivotOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pivotOffsetZ" DOUBLE PRECISION NOT NULL DEFAULT 0,

  CONSTRAINT "ModelAsset_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CatalogItem"
  ADD CONSTRAINT "CatalogItem_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "ModelAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_normalizedAssetId_fkey"
  FOREIGN KEY ("normalizedAssetId") REFERENCES "ModelAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
