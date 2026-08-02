CREATE TYPE "FloorPlanAddressBindingRole" AS ENUM ('catalog', 'authored_variant');

ALTER TABLE "FloorPlanAddressBinding"
  ADD COLUMN "role" "FloorPlanAddressBindingRole" NOT NULL DEFAULT 'catalog';

ALTER TABLE "FloorPlanAuthoredVariantGroup"
  ALTER COLUMN "approvedAt" DROP NOT NULL,
  ALTER COLUMN "approvedByEmail" DROP NOT NULL,
  ALTER COLUMN "publicationStatus" SET DEFAULT 'draft',
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "retiredByEmail" VARCHAR(320),
  ADD COLUMN "retirementReason" VARCHAR(1000);

ALTER TABLE "FloorPlanAuthoredVariantGroup"
  DROP CONSTRAINT "FloorPlanAuthoredVariantGroup_lifecycle_check";
ALTER TABLE "FloorPlanAuthoredVariantGroup"
  ADD CONSTRAINT "FloorPlanAuthoredVariantGroup_lifecycle_check" CHECK (
    ("publicationStatus" = 'draft' AND
      "approvedAt" IS NULL AND "approvedByEmail" IS NULL AND
      "publishedAt" IS NULL AND "publishedByEmail" IS NULL AND
      "retiredAt" IS NULL AND "retiredByEmail" IS NULL AND "retirementReason" IS NULL) OR
    ("publicationStatus" = 'approved' AND
      "approvedAt" IS NOT NULL AND "approvedByEmail" IS NOT NULL AND
      "publishedAt" IS NULL AND "publishedByEmail" IS NULL AND
      "retiredAt" IS NULL AND "retiredByEmail" IS NULL AND "retirementReason" IS NULL) OR
    ("publicationStatus" = 'published' AND
      "approvedAt" IS NOT NULL AND "approvedByEmail" IS NOT NULL AND
      "publishedAt" IS NOT NULL AND "publishedByEmail" IS NOT NULL AND
      "retiredAt" IS NULL AND "retiredByEmail" IS NULL AND "retirementReason" IS NULL) OR
    ("publicationStatus" = 'retired' AND
      "approvedAt" IS NOT NULL AND "approvedByEmail" IS NOT NULL AND
      "publishedAt" IS NOT NULL AND "publishedByEmail" IS NOT NULL AND
      "retiredAt" IS NOT NULL AND "retiredByEmail" IS NOT NULL AND
      length(btrim("retirementReason")) >= 10)
  );

CREATE UNIQUE INDEX "FloorPlanAddressBinding_id_revisionId_key"
  ON "FloorPlanAddressBinding"("id", "revisionId");
ALTER TABLE "FloorPlanAuthoredVariantOption"
  ADD CONSTRAINT "FloorPlanAuthoredVariantOption_binding_revision_fkey"
  FOREIGN KEY ("addressBindingId", "revisionId")
  REFERENCES "FloorPlanAddressBinding"("id", "revisionId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_floor_plan_authored_variant_mutation()
RETURNS trigger AS $$
DECLARE
  group_status "FloorPlanPublicationStatus";
BEGIN
  IF TG_TABLE_NAME = 'FloorPlanAuthoredVariantGroup' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Floor-plan authored variant groups are immutable';
    END IF;

    IF OLD."id" <> NEW."id" OR
       OLD."groupKey" <> NEW."groupKey" OR
       OLD."label" <> NEW."label" OR
       OLD."createdAt" <> NEW."createdAt"
    THEN
      RAISE EXCEPTION 'Floor-plan authored variant group identity is immutable';
    END IF;

    IF OLD."publicationStatus" = 'draft' AND
       NEW."publicationStatus" = 'approved' AND
       OLD."approvedAt" IS NULL AND OLD."approvedByEmail" IS NULL AND
       NEW."approvedAt" IS NOT NULL AND NEW."approvedByEmail" IS NOT NULL AND
       (SELECT count(*) FROM "FloorPlanAuthoredVariantOption" WHERE "groupId" = OLD."id") >= 2 AND
       (SELECT count(*) FROM "FloorPlanAuthoredVariantOption" WHERE "groupId" = OLD."id" AND "defaultSelected") = 1 AND
       NOT EXISTS (
         SELECT 1
         FROM "FloorPlanAuthoredVariantOption" option
         JOIN "FloorPlanRevision" revision ON revision."id" = option."revisionId"
         JOIN "FloorPlanAddressBinding" binding ON binding."id" = option."addressBindingId"
         WHERE option."groupId" = OLD."id" AND (
           revision."publicationStatus" <> 'published' OR
           revision."publishedAt" IS NULL OR
           revision."geometryHash" <> option."geometryHash" OR
           binding."revisionId" <> option."revisionId" OR
           (option."defaultSelected" AND binding."role" <> 'catalog') OR
           (NOT option."defaultSelected" AND binding."role" <> 'authored_variant')
         )
       )
    THEN
      RETURN NEW;
    END IF;

    IF OLD."publicationStatus" = 'approved' AND
       NEW."publicationStatus" = 'published' AND
       OLD."approvedAt" = NEW."approvedAt" AND
       OLD."approvedByEmail" = NEW."approvedByEmail" AND
       NEW."publishedAt" IS NOT NULL AND NEW."publishedByEmail" IS NOT NULL AND
       lower(NEW."publishedByEmail") <> lower(OLD."approvedByEmail")
    THEN
      RETURN NEW;
    END IF;

    IF OLD."publicationStatus" = 'published' AND
       NEW."publicationStatus" = 'retired' AND
       OLD."approvedAt" = NEW."approvedAt" AND
       OLD."approvedByEmail" = NEW."approvedByEmail" AND
       OLD."publishedAt" = NEW."publishedAt" AND
       OLD."publishedByEmail" = NEW."publishedByEmail" AND
       NEW."retiredAt" IS NOT NULL AND NEW."retiredByEmail" IS NOT NULL AND
       length(btrim(NEW."retirementReason")) >= 10
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Floor-plan authored variant lifecycle transition is not allowed';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT "publicationStatus" INTO group_status
    FROM "FloorPlanAuthoredVariantGroup" WHERE "id" = NEW."groupId";
    IF group_status = 'draft' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Options can only be inserted while an authored variant group is draft';
  END IF;

  RAISE EXCEPTION 'Floor-plan authored variant options are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "FloorPlanAuthoredVariantOption_immutable"
  ON "FloorPlanAuthoredVariantOption";
CREATE TRIGGER "FloorPlanAuthoredVariantOption_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "FloorPlanAuthoredVariantOption"
  FOR EACH ROW EXECUTE FUNCTION prevent_floor_plan_authored_variant_mutation();
