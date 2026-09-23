CREATE TABLE "FloorPlanSupplementarySource" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "jobId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "purpose" VARCHAR(64) NOT NULL DEFAULT 'address_binding_evidence',
  "renderedPagesJson" JSONB NOT NULL DEFAULT '[]',
  "uploadedByEmail" TEXT,
  "attachedToCandidateAt" TIMESTAMP(3),
  "attachedByEmail" TEXT,

  CONSTRAINT "FloorPlanSupplementarySource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanSupplementarySource_purpose_check"
    CHECK ("purpose" = 'address_binding_evidence')
);

CREATE UNIQUE INDEX "FloorPlanSupplementarySource_jobId_sourceAssetId_key"
  ON "FloorPlanSupplementarySource"("jobId", "sourceAssetId");
CREATE INDEX "FloorPlanSupplementarySource_jobId_createdAt_idx"
  ON "FloorPlanSupplementarySource"("jobId", "createdAt");
CREATE INDEX "FloorPlanSupplementarySource_sourceAssetId_idx"
  ON "FloorPlanSupplementarySource"("sourceAssetId");

-- Deleted assets are immutable tombstones. Preserve owner-scoped dedupe among
-- live generations while allowing a later re-upload to create a new row.
CREATE UNIQUE INDEX "FloorPlanSourceAsset_live_owner_content_key"
  ON "FloorPlanSourceAsset"("ownerScope", "sha256", "fileName", "mimeType")
  WHERE "contentDeletedAt" IS NULL;

UPDATE "FloorPlanSourceAsset"
SET "fileName" = 'deleted-floor-plan-source'
WHERE "contentDeletedAt" IS NOT NULL;

ALTER TABLE "FloorPlanSupplementarySource"
  ADD CONSTRAINT "FloorPlanSupplementarySource_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FloorPlanImportJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanSupplementarySource"
  ADD CONSTRAINT "FloorPlanSupplementarySource_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "FloorPlanSourceAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supplementary evidence is review-state data until approval and immutable
-- evidence afterwards. Enforce that boundary in the database as well as the
-- admin routes so a missed application check cannot rewrite published proof.
CREATE OR REPLACE FUNCTION "guard_floor_plan_supplementary_source_immutability"()
RETURNS trigger AS $$
DECLARE
  target_job_id TEXT;
BEGIN
  target_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."jobId" ELSE NEW."jobId" END;
  IF EXISTS (
    SELECT 1 FROM "FloorPlanRevision" revision
    WHERE revision."sourceJobId" = target_job_id
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_SUPPLEMENTARY_SOURCE_IMMUTABLE: approved evidence cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanSupplementarySource_immutability_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "FloorPlanSupplementarySource"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_supplementary_source_immutability"();

-- Job deletion cascades the attachment row. Its job-scoped source asset is
-- then removed only when no primary import or other attachment references it,
-- preventing orphaned source bytes without risking a shared asset.
CREATE OR REPLACE FUNCTION "delete_orphan_floor_plan_supplementary_asset"()
RETURNS trigger AS $$
BEGIN
  DELETE FROM "FloorPlanSourceAsset" source
  WHERE source."id" = OLD."sourceAssetId"
    AND NOT EXISTS (
      SELECT 1 FROM "FloorPlanImportJob" job
      WHERE job."sourceAssetId" = source."id"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FloorPlanSupplementarySource" attachment
      WHERE attachment."sourceAssetId" = source."id"
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanSupplementarySource_delete_orphan_asset"
AFTER DELETE ON "FloorPlanSupplementarySource"
FOR EACH ROW EXECUTE FUNCTION "delete_orphan_floor_plan_supplementary_asset"();
