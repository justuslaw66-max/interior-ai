-- AlterTable
ALTER TABLE "Design" ADD COLUMN "style" TEXT;
ALTER TABLE "Design" ADD COLUMN "budget" TEXT;

-- AlterTable
ALTER TABLE "ProductClick" ADD COLUMN "clickKey" TEXT;

-- Backfill clickKey for existing rows
UPDATE "ProductClick"
SET "clickKey" = md5("id" || '-' || random()::text)
WHERE "clickKey" IS NULL;

-- Make clickKey required
ALTER TABLE "ProductClick" ALTER COLUMN "clickKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProductClick_clickKey_key" ON "ProductClick"("clickKey");

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "clickKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversionEvent_clickKey_idx" ON "ConversionEvent"("clickKey");

-- CreateIndex
CREATE INDEX "ConversionEvent_eventType_idx" ON "ConversionEvent"("eventType");
