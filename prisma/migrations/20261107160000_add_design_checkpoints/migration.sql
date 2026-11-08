-- CreateTable
CREATE TABLE "DesignCheckpoint" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(32) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "roomWidth" DOUBLE PRECISION NOT NULL,
    "roomDepth" DOUBLE PRECISION NOT NULL,
    "items" JSONB NOT NULL,
    "zones" JSONB,
    "savedViews" JSONB,
    "snapshot" JSONB,

    CONSTRAINT "DesignCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignCheckpoint_designId_createdAt_idx" ON "DesignCheckpoint"("designId", "createdAt");

-- AddForeignKey
ALTER TABLE "DesignCheckpoint" ADD CONSTRAINT "DesignCheckpoint_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
