-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM (
  'received',
  'normalizing',
  'optimized',
  'preview_generated',
  'metadata_extracted',
  'needs_mapping',
  'needs_review',
  'approved',
  'published',
  'failed'
);

-- CreateTable
CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'received',
  "sourceBrand" TEXT,
  "sourceFileName" TEXT NOT NULL,
  "sourceFileUrl" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "notes" TEXT,
  "errorMessage" TEXT,
  "rawMetadataJson" JSONB,
  "reportJson" JSONB,
  "rawFileUrl" TEXT,
  "normalizedFileUrl" TEXT,
  "optimizedFileUrl" TEXT,
  "thumbnailUrl" TEXT,
  "metadataReportUrl" TEXT,
  "qaReportUrl" TEXT,
  "normalizedAssetId" TEXT,
  "catalogItemId" TEXT,

  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_uploadedByUserId_idx" ON "ImportJob"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ImportJob_normalizedAssetId_idx" ON "ImportJob"("normalizedAssetId");

-- CreateIndex
CREATE INDEX "ImportJob_catalogItemId_idx" ON "ImportJob"("catalogItemId");

-- AddForeignKey
ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
