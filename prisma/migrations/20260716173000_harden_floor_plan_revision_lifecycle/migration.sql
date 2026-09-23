-- Once approved, a revision must never be downgraded to draft. Without this
-- guard, a direct status downgrade could make the next canonical-field update
-- appear to originate from a mutable draft and bypass the immutability check.
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
    NEW."sourceJobId" IS DISTINCT FROM OLD."sourceJobId" OR
    NEW."geometryHash" IS DISTINCT FROM OLD."geometryHash" OR
    NEW."documentJson" IS DISTINCT FROM OLD."documentJson" OR
    NEW."sourceManifestJson" IS DISTINCT FROM OLD."sourceManifestJson" OR
    NEW."constructionEvidenceJson" IS DISTINCT FROM OLD."constructionEvidenceJson" OR
    NEW."verificationTier" IS DISTINCT FROM OLD."verificationTier"
  ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_IMMUTABLE: canonical revision fields cannot change after approval';
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
