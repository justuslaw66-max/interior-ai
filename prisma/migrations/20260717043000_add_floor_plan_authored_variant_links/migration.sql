CREATE TABLE "FloorPlanAuthoredVariantGroup" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "groupKey" VARCHAR(200) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "publicationStatus" "FloorPlanPublicationStatus" NOT NULL DEFAULT 'approved',
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "approvedByEmail" VARCHAR(320) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "publishedByEmail" VARCHAR(320),

  CONSTRAINT "FloorPlanAuthoredVariantGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanAuthoredVariantGroup_lifecycle_check" CHECK (
    ("publicationStatus" = 'approved' AND "publishedAt" IS NULL AND "publishedByEmail" IS NULL) OR
    ("publicationStatus" = 'published' AND "publishedAt" IS NOT NULL AND "publishedByEmail" IS NOT NULL)
  )
);

CREATE TABLE "FloorPlanAuthoredVariantOption" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "groupId" TEXT NOT NULL,
  "optionKey" VARCHAR(200) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "revisionId" TEXT NOT NULL,
  "addressBindingId" TEXT NOT NULL,
  "geometryHash" CHAR(64) NOT NULL,
  "sourceId" VARCHAR(200) NOT NULL,
  "sourcePage" INTEGER,
  "defaultSelected" BOOLEAN NOT NULL DEFAULT false,
  "sourceEvidenceJson" JSONB NOT NULL,

  CONSTRAINT "FloorPlanAuthoredVariantOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanAuthoredVariantOption_geometry_hash_check" CHECK (
    "geometryHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "FloorPlanAuthoredVariantOption_source_page_check" CHECK (
    "sourcePage" IS NULL OR "sourcePage" > 0
  ),
  CONSTRAINT "FloorPlanAuthoredVariantOption_source_evidence_object_check" CHECK (
    jsonb_typeof("sourceEvidenceJson") = 'object'
  )
);

CREATE UNIQUE INDEX "FloorPlanAuthoredVariantGroup_groupKey_key"
  ON "FloorPlanAuthoredVariantGroup"("groupKey");
CREATE INDEX "FloorPlanAuthoredVariantGroup_publicationStatus_publishedAt_idx"
  ON "FloorPlanAuthoredVariantGroup"("publicationStatus", "publishedAt");
CREATE UNIQUE INDEX "FloorPlanAuthoredVariantOption_groupId_optionKey_key"
  ON "FloorPlanAuthoredVariantOption"("groupId", "optionKey");
CREATE UNIQUE INDEX "FloorPlanAuthoredVariantOption_groupId_revisionId_key"
  ON "FloorPlanAuthoredVariantOption"("groupId", "revisionId");
CREATE UNIQUE INDEX "FloorPlanAuthoredVariantOption_groupId_addressBindingId_key"
  ON "FloorPlanAuthoredVariantOption"("groupId", "addressBindingId");
CREATE UNIQUE INDEX "FloorPlanAuthoredVariantOption_one_default_per_group"
  ON "FloorPlanAuthoredVariantOption"("groupId") WHERE "defaultSelected" = true;
CREATE INDEX "FloorPlanAuthoredVariantOption_revisionId_idx"
  ON "FloorPlanAuthoredVariantOption"("revisionId");
CREATE INDEX "FloorPlanAuthoredVariantOption_addressBindingId_idx"
  ON "FloorPlanAuthoredVariantOption"("addressBindingId");

ALTER TABLE "FloorPlanAuthoredVariantOption"
  ADD CONSTRAINT "FloorPlanAuthoredVariantOption_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "FloorPlanAuthoredVariantGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloorPlanAuthoredVariantOption"
  ADD CONSTRAINT "FloorPlanAuthoredVariantOption_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "FloorPlanRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloorPlanAuthoredVariantOption"
  ADD CONSTRAINT "FloorPlanAuthoredVariantOption_addressBindingId_fkey"
  FOREIGN KEY ("addressBindingId") REFERENCES "FloorPlanAddressBinding"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_floor_plan_authored_variant_mutation()
RETURNS trigger AS $$
DECLARE
  group_status "FloorPlanPublicationStatus";
BEGIN
  IF TG_TABLE_NAME = 'FloorPlanAuthoredVariantGroup' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Approved floor-plan authored variant groups are immutable';
    END IF;
    IF OLD."publicationStatus" = 'approved' AND
       NEW."publicationStatus" = 'published' AND
       OLD."id" = NEW."id" AND
       OLD."groupKey" = NEW."groupKey" AND
       OLD."label" = NEW."label" AND
       OLD."approvedAt" = NEW."approvedAt" AND
       OLD."approvedByEmail" = NEW."approvedByEmail" AND
       (SELECT count(*) FROM "FloorPlanAuthoredVariantOption" WHERE "groupId" = OLD."id") >= 2 AND
       (SELECT count(*) FROM "FloorPlanAuthoredVariantOption" WHERE "groupId" = OLD."id" AND "defaultSelected") = 1
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Approved floor-plan authored variant groups are immutable';
  END IF;

  SELECT "publicationStatus" INTO group_status
  FROM "FloorPlanAuthoredVariantGroup"
  WHERE "id" = COALESCE(OLD."groupId", NEW."groupId");
  IF group_status IN ('approved', 'published', 'retired') THEN
    RAISE EXCEPTION 'Approved floor-plan authored variant options are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanAuthoredVariantGroup_immutable"
  BEFORE UPDATE OR DELETE ON "FloorPlanAuthoredVariantGroup"
  FOR EACH ROW EXECUTE FUNCTION prevent_floor_plan_authored_variant_mutation();

CREATE TRIGGER "FloorPlanAuthoredVariantOption_immutable"
  BEFORE UPDATE OR DELETE ON "FloorPlanAuthoredVariantOption"
  FOR EACH ROW EXECUTE FUNCTION prevent_floor_plan_authored_variant_mutation();
