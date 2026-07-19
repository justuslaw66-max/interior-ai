-- Keep reviewer-authored source observations separate from extractor output.
-- Existing immutable revisions remain readable, but any new approval or
-- publication transition must carry a versioned observation manifest.
ALTER TABLE "FloorPlanImportJob"
  ADD COLUMN "sourceObservationManifestJson" JSONB,
  ADD COLUMN "sourceObservationVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FloorPlanRevision"
  ADD COLUMN "sourceObservationManifestJson" JSONB;

ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_sourceObservationVersion_nonnegative_check"
  CHECK ("sourceObservationVersion" >= 0),
  ADD CONSTRAINT "FloorPlanImportJob_sourceObservationManifest_object_check"
  CHECK (
    "sourceObservationManifestJson" IS NULL OR
    jsonb_typeof("sourceObservationManifestJson") = 'object'
  );

ALTER TABLE "FloorPlanRevision"
  ADD CONSTRAINT "FloorPlanRevision_sourceObservationManifest_object_check"
  CHECK (
    "sourceObservationManifestJson" IS NULL OR
    jsonb_typeof("sourceObservationManifestJson") = 'object'
  );

CREATE OR REPLACE FUNCTION "require_floor_plan_source_observation_manifest"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."publicationStatus" IN ('approved', 'published')
     AND NEW."sourceObservationManifestJson" IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'FLOOR_PLAN_SOURCE_OBSERVATIONS_REQUIRED: independently recorded source observations are required before approval';
    ELSIF OLD."publicationStatus" NOT IN ('approved', 'published', 'retired') THEN
      RAISE EXCEPTION 'FLOOR_PLAN_SOURCE_OBSERVATIONS_REQUIRED: independently recorded source observations are required before approval';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanRevision_source_observation_required_guard"
BEFORE INSERT OR UPDATE ON "FloorPlanRevision"
FOR EACH ROW EXECUTE FUNCTION "require_floor_plan_source_observation_manifest"();

-- Public publication is a maker-checker action. An identifiable publisher
-- must be different from the identifiable reviewer. This is intentionally a
-- database invariant as well as an API authorization check.
CREATE OR REPLACE FUNCTION "require_floor_plan_distinct_reviewer_publisher"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."publicationStatus" = 'published' AND (
    NEW."approvedByEmail" IS NULL OR
    NEW."publishedByEmail" IS NULL OR
    btrim(NEW."approvedByEmail") = '' OR
    btrim(NEW."publishedByEmail") = '' OR
    lower(btrim(NEW."approvedByEmail")) = lower(btrim(NEW."publishedByEmail"))
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_MAKER_CHECKER_REQUIRED: publisher must be an identifiable actor different from the reviewer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanRevision_maker_checker_guard"
BEFORE INSERT OR UPDATE ON "FloorPlanRevision"
FOR EACH ROW EXECUTE FUNCTION "require_floor_plan_distinct_reviewer_publisher"();

-- Extend the existing immutable revision guard to cover the independent
-- observation manifest copied onto an approved revision.
CREATE OR REPLACE FUNCTION "guard_floor_plan_revision_immutability"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publicationStatus" IN ('approved', 'published', 'retired') THEN
      RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: approved floor-plan revisions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."publicationStatus" IN ('approved', 'published', 'retired') AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."sourceJobId" IS DISTINCT FROM OLD."sourceJobId" OR
    NEW."geometryHash" IS DISTINCT FROM OLD."geometryHash" OR
    NEW."documentJson" IS DISTINCT FROM OLD."documentJson" OR
    NEW."sourceManifestJson" IS DISTINCT FROM OLD."sourceManifestJson" OR
    NEW."sourceObservationManifestJson" IS DISTINCT FROM OLD."sourceObservationManifestJson" OR
    NEW."constructionEvidenceJson" IS DISTINCT FROM OLD."constructionEvidenceJson" OR
    NEW."verificationTier" IS DISTINCT FROM OLD."verificationTier" OR
    NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" OR
    NEW."approvedByEmail" IS DISTINCT FROM OLD."approvedByEmail"
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: canonical revision and approval audit fields cannot change after approval';
  END IF;

  IF OLD."publicationStatus" IN ('published', 'retired') AND (
    NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR
    NEW."publishedByEmail" IS DISTINCT FROM OLD."publishedByEmail"
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: publication audit fields cannot change after publication';
  END IF;

  IF OLD."publicationStatus" = 'approved'
     AND NEW."publicationStatus" NOT IN ('approved', 'published', 'retired') THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: approved revisions cannot return to draft';
  END IF;

  IF OLD."publicationStatus" = 'published'
     AND NEW."publicationStatus" NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: published revisions may only remain published or be retired';
  END IF;

  IF OLD."publicationStatus" = 'retired'
     AND NEW."publicationStatus" <> 'retired' THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: retired revisions cannot be reactivated';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
