-- Add workflow-related columns to ImportJob
ALTER TABLE "ImportJob" ADD COLUMN "workflowStage" TEXT DEFAULT 'intake';
ALTER TABLE "ImportJob" ADD COLUMN "workflowBlockers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ImportJob" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "dimensionsVerificationStatus" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "sourceSku" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "sourceProductUrl" TEXT;
