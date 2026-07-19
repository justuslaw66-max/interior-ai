-- Public discovery fields are deliberately separate from internal source and
-- observation manifests. Only this allowlisted row may feed catalog display.
CREATE TABLE "FloorPlanRevisionPublicMetadata" (
  "revisionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectName" VARCHAR(160) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "flatType" VARCHAR(80) NOT NULL,
  "floorAreaSqm" DOUBLE PRECISION,
  "previewUrl" VARCHAR(2048) NOT NULL,
  "sourceUrl" VARCHAR(2048),
  "sourceTitle" VARCHAR(200),
  "sourcePage" INTEGER,
  "publisher" VARCHAR(160) NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "approvedByEmail" VARCHAR(320) NOT NULL,

  CONSTRAINT "FloorPlanRevisionPublicMetadata_pkey" PRIMARY KEY ("revisionId"),
  CONSTRAINT "FloorPlanRevisionPublicMetadata_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "FloorPlanRevision"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FloorPlanRevisionPublicMetadata_floorAreaSqm_check"
    CHECK ("floorAreaSqm" IS NULL OR ("floorAreaSqm" >= 5 AND "floorAreaSqm" <= 5000)),
  CONSTRAINT "FloorPlanRevisionPublicMetadata_source_tuple_check"
    CHECK (
      ("sourceUrl" IS NULL AND "sourceTitle" IS NULL AND "sourcePage" IS NULL) OR
      ("sourceUrl" IS NOT NULL AND "sourceTitle" IS NOT NULL AND "sourcePage" BETWEEN 1 AND 10000)
    ),
  CONSTRAINT "FloorPlanRevisionPublicMetadata_required_text_check"
    CHECK (
      length(btrim("projectName")) >= 2 AND
      length(btrim("label")) >= 2 AND
      length(btrim("flatType")) >= 2 AND
      length(btrim("publisher")) >= 2 AND
      length(btrim("previewUrl")) >= 2
    )
);

CREATE INDEX "FloorPlanRevisionPublicMetadata_projectName_idx"
  ON "FloorPlanRevisionPublicMetadata"("projectName");
CREATE INDEX "FloorPlanRevisionPublicMetadata_flatType_idx"
  ON "FloorPlanRevisionPublicMetadata"("flatType");

CREATE OR REPLACE FUNCTION "guard_floor_plan_public_metadata"()
RETURNS trigger AS $$
DECLARE
  revision_status "FloorPlanPublicationStatus";
  revision_approved_at TIMESTAMP(3);
  revision_approved_by TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'FLOOR_PLAN_PUBLIC_METADATA_IMMUTABLE: approve a new revision to change public display fields';
  END IF;

  SELECT "publicationStatus", "approvedAt", "approvedByEmail"
    INTO revision_status, revision_approved_at, revision_approved_by
    FROM "FloorPlanRevision"
    WHERE "id" = NEW."revisionId";
  IF revision_status NOT IN ('approved', 'published', 'retired') OR
     revision_approved_at IS NULL OR
     revision_approved_at IS DISTINCT FROM NEW."approvedAt" OR
     revision_approved_by IS NULL OR
     lower(btrim(revision_approved_by)) IS DISTINCT FROM lower(btrim(NEW."approvedByEmail")) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_PUBLIC_METADATA_REVIEW_MISMATCH: metadata must be approved with its immutable revision';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanRevisionPublicMetadata_immutability_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "FloorPlanRevisionPublicMetadata"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_public_metadata"();

CREATE OR REPLACE FUNCTION "require_floor_plan_public_metadata_for_publish"()
RETURNS trigger AS $$
BEGIN
  IF NEW."publicationStatus" = 'published' AND
     OLD."publicationStatus" IS DISTINCT FROM 'published' AND
     NOT EXISTS (
       SELECT 1 FROM "FloorPlanRevisionPublicMetadata" metadata
       WHERE metadata."revisionId" = NEW."id"
         AND metadata."approvedAt" = NEW."approvedAt"
         AND lower(btrim(metadata."approvedByEmail")) = lower(btrim(NEW."approvedByEmail"))
     ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_PUBLIC_METADATA_REQUIRED: approved public display metadata is required before publication';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanRevision_public_metadata_required_guard"
BEFORE UPDATE ON "FloorPlanRevision"
FOR EACH ROW EXECUTE FUNCTION "require_floor_plan_public_metadata_for_publish"();
