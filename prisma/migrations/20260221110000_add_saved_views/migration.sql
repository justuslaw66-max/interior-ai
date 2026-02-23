-- Add camera saved views to designs
ALTER TABLE "Design"
ADD COLUMN "savedViews" JSONB;