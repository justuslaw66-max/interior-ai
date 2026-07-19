CREATE TABLE "FloorPlanConstructionSource" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "jobId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "evidenceKind" VARCHAR(32) NOT NULL,
  "renderedPagesJson" JSONB NOT NULL DEFAULT '[]',
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorizedByEmail" TEXT,
  "attachedToCandidateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FloorPlanConstructionSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanConstructionSource_evidenceKind_check"
    CHECK ("evidenceKind" IN ('unit_cad', 'as_built', 'site_measurement'))
);

CREATE UNIQUE INDEX "FloorPlanConstructionSource_jobId_sourceAssetId_key"
  ON "FloorPlanConstructionSource"("jobId", "sourceAssetId");
CREATE INDEX "FloorPlanConstructionSource_jobId_createdAt_idx"
  ON "FloorPlanConstructionSource"("jobId", "createdAt");
CREATE INDEX "FloorPlanConstructionSource_sourceAssetId_idx"
  ON "FloorPlanConstructionSource"("sourceAssetId");
CREATE INDEX "FloorPlanConstructionSource_evidenceKind_idx"
  ON "FloorPlanConstructionSource"("evidenceKind");

ALTER TABLE "FloorPlanConstructionSource"
  ADD CONSTRAINT "FloorPlanConstructionSource_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FloorPlanImportJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanConstructionSource"
  ADD CONSTRAINT "FloorPlanConstructionSource_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "FloorPlanSourceAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "guard_floor_plan_construction_source_immutability"()
RETURNS trigger AS $$
DECLARE
  target_job_id TEXT;
BEGIN
  target_job_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."jobId" ELSE NEW."jobId" END;
  IF EXISTS (
    SELECT 1 FROM "FloorPlanRevision" revision
    WHERE revision."sourceJobId" = target_job_id
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_CONSTRUCTION_SOURCE_IMMUTABLE: approved evidence cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanConstructionSource_immutability_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "FloorPlanConstructionSource"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_construction_source_immutability"();

CREATE OR REPLACE FUNCTION "delete_orphan_floor_plan_construction_asset"()
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
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FloorPlanConstructionSource" attachment
      WHERE attachment."sourceAssetId" = source."id"
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanConstructionSource_delete_orphan_asset"
AFTER DELETE ON "FloorPlanConstructionSource"
FOR EACH ROW EXECUTE FUNCTION "delete_orphan_floor_plan_construction_asset"();

-- The pre-existing supplementary trigger must also preserve assets that are
-- referenced by the new construction-evidence attachment role.
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
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FloorPlanConstructionSource" attachment
      WHERE attachment."sourceAssetId" = source."id"
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
