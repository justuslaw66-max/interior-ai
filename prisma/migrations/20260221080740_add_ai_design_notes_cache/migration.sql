-- CreateTable
CREATE TABLE "AiDesignNotes" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "designHash" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDesignNotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDesignNotes_designId_idx" ON "AiDesignNotes"("designId");

-- CreateIndex
CREATE UNIQUE INDEX "AiDesignNotes_designId_designHash_mode_key" ON "AiDesignNotes"("designId", "designHash", "mode");
