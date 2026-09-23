-- Address bindings are part of an approved revision's evidence. Keep their
-- lifecycle append-only and record who approved/published each exact selector.
CREATE TYPE "FloorPlanRevisionAuditEventType" AS ENUM (
  'revision_approved',
  'revision_published',
  'revision_retired'
);

CREATE TABLE "FloorPlanRevisionAuditEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "revisionId" TEXT NOT NULL,
  "eventType" "FloorPlanRevisionAuditEventType" NOT NULL,
  "actorEmail" TEXT,
  "sourceEvidenceJson" JSONB NOT NULL,
  "metadataJson" JSONB,
  CONSTRAINT "FloorPlanRevisionAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanRevisionAuditEvent_sourceEvidence_object_check"
    CHECK (jsonb_typeof("sourceEvidenceJson") = 'object')
);

CREATE UNIQUE INDEX "FloorPlanRevisionAuditEvent_revisionId_eventType_key"
  ON "FloorPlanRevisionAuditEvent"("revisionId", "eventType");
CREATE INDEX "FloorPlanRevisionAuditEvent_revisionId_occurredAt_idx"
  ON "FloorPlanRevisionAuditEvent"("revisionId", "occurredAt");
CREATE INDEX "FloorPlanRevisionAuditEvent_eventType_occurredAt_idx"
  ON "FloorPlanRevisionAuditEvent"("eventType", "occurredAt");

ALTER TABLE "FloorPlanRevisionAuditEvent"
  ADD CONSTRAINT "FloorPlanRevisionAuditEvent_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "FloorPlanRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve lifecycle history for any revision created before this migration.
-- Older records do not have a dedicated action payload, so the backfill says
-- so explicitly and snapshots the immutable source and address evidence that
-- is available now.
INSERT INTO "FloorPlanRevisionAuditEvent" (
  "id",
  "createdAt",
  "occurredAt",
  "revisionId",
  "eventType",
  "actorEmail",
  "sourceEvidenceJson",
  "metadataJson"
)
SELECT
  'fpra_' || substr(md5(revision."id" || ':revision_approved'), 1, 20),
  CURRENT_TIMESTAMP,
  coalesce(revision."approvedAt", revision."createdAt"),
  revision."id",
  'revision_approved'::"FloorPlanRevisionAuditEventType",
  revision."approvedByEmail",
  jsonb_build_object(
    'sourceJobId', revision."sourceJobId",
    'sourceAsset', jsonb_build_object(
      'id', source."id",
      'sha256', source."sha256",
      'mimeType', source."mimeType",
      'fileName', source."fileName"
    ),
    'sourceManifestStoredOnImmutableRevision', true,
    'addressBindings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', binding."id",
          'countryCode', binding."countryCode",
          'addressNormalized', binding."addressNormalized",
          'block', binding."block",
          'street', binding."street",
          'postalCode', binding."postalCode",
          'stack', binding."stack",
          'floorMin', binding."floorMin",
          'floorMax', binding."floorMax",
          'transform', binding."transform",
          'sourceEvidence', binding."sourceEvidenceJson"
        ) ORDER BY binding."id"
      )
      FROM "FloorPlanAddressBinding" binding
      WHERE binding."revisionId" = revision."id"
    ), '[]'::jsonb)
  ),
  jsonb_build_object(
    'backfilled', true,
    'geometryHash', revision."geometryHash",
    'previousStatus', null,
    'nextStatus', 'approved'
  )
FROM "FloorPlanRevision" revision
JOIN "FloorPlanImportJob" job ON job."id" = revision."sourceJobId"
JOIN "FloorPlanSourceAsset" source ON source."id" = job."sourceAssetId"
WHERE revision."publicationStatus" IN ('approved', 'published', 'retired')
ON CONFLICT ("revisionId", "eventType") DO NOTHING;

INSERT INTO "FloorPlanRevisionAuditEvent" (
  "id",
  "createdAt",
  "occurredAt",
  "revisionId",
  "eventType",
  "actorEmail",
  "sourceEvidenceJson",
  "metadataJson"
)
SELECT
  'fpra_' || substr(md5(revision."id" || ':revision_published'), 1, 20),
  CURRENT_TIMESTAMP,
  coalesce(revision."publishedAt", revision."updatedAt"),
  revision."id",
  'revision_published'::"FloorPlanRevisionAuditEventType",
  revision."publishedByEmail",
  jsonb_build_object(
    'sourceJobId', revision."sourceJobId",
    'sourceAsset', jsonb_build_object(
      'id', source."id",
      'sha256', source."sha256",
      'mimeType', source."mimeType",
      'fileName', source."fileName"
    ),
    'sourceManifestStoredOnImmutableRevision', true,
    'addressBindings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', binding."id",
          'countryCode', binding."countryCode",
          'addressNormalized', binding."addressNormalized",
          'block', binding."block",
          'street', binding."street",
          'postalCode', binding."postalCode",
          'stack', binding."stack",
          'floorMin', binding."floorMin",
          'floorMax', binding."floorMax",
          'transform', binding."transform",
          'sourceEvidence', binding."sourceEvidenceJson"
        ) ORDER BY binding."id"
      )
      FROM "FloorPlanAddressBinding" binding
      WHERE binding."revisionId" = revision."id"
    ), '[]'::jsonb)
  ),
  jsonb_build_object(
    'backfilled', true,
    'geometryHash', revision."geometryHash",
    'previousStatus', 'approved',
    'nextStatus', 'published'
  )
FROM "FloorPlanRevision" revision
JOIN "FloorPlanImportJob" job ON job."id" = revision."sourceJobId"
JOIN "FloorPlanSourceAsset" source ON source."id" = job."sourceAssetId"
WHERE revision."publicationStatus" = 'published'
   OR (
     revision."publicationStatus" = 'retired'
     AND revision."publishedAt" IS NOT NULL
   )
ON CONFLICT ("revisionId", "eventType") DO NOTHING;

INSERT INTO "FloorPlanRevisionAuditEvent" (
  "id",
  "createdAt",
  "occurredAt",
  "revisionId",
  "eventType",
  "actorEmail",
  "sourceEvidenceJson",
  "metadataJson"
)
SELECT
  'fpra_' || substr(md5(revision."id" || ':revision_retired'), 1, 20),
  CURRENT_TIMESTAMP,
  revision."updatedAt",
  revision."id",
  'revision_retired'::"FloorPlanRevisionAuditEventType",
  coalesce(revision."publishedByEmail", revision."approvedByEmail"),
  jsonb_build_object(
    'sourceJobId', revision."sourceJobId",
    'sourceAsset', jsonb_build_object(
      'id', source."id",
      'sha256', source."sha256",
      'mimeType', source."mimeType",
      'fileName', source."fileName"
    ),
    'sourceManifestStoredOnImmutableRevision', true,
    'addressBindings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', binding."id",
          'countryCode', binding."countryCode",
          'addressNormalized', binding."addressNormalized",
          'block', binding."block",
          'street', binding."street",
          'postalCode', binding."postalCode",
          'stack', binding."stack",
          'floorMin', binding."floorMin",
          'floorMax', binding."floorMax",
          'transform', binding."transform",
          'sourceEvidence', binding."sourceEvidenceJson"
        ) ORDER BY binding."id"
      )
      FROM "FloorPlanAddressBinding" binding
      WHERE binding."revisionId" = revision."id"
    ), '[]'::jsonb)
  ),
  jsonb_build_object(
    'backfilled', true,
    'geometryHash', revision."geometryHash",
    'previousStatus', CASE
      WHEN revision."publishedAt" IS NULL THEN 'approved'
      ELSE 'published'
    END,
    'nextStatus', 'retired'
  )
FROM "FloorPlanRevision" revision
JOIN "FloorPlanImportJob" job ON job."id" = revision."sourceJobId"
JOIN "FloorPlanSourceAsset" source ON source."id" = job."sourceAssetId"
WHERE revision."publicationStatus" = 'retired'
ON CONFLICT ("revisionId", "eventType") DO NOTHING;

CREATE OR REPLACE FUNCTION "guard_floor_plan_revision_audit_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'FLOOR_PLAN_REVISION_AUDIT_APPEND_ONLY: lifecycle events cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanRevisionAuditEvent_append_only_guard"
BEFORE UPDATE OR DELETE ON "FloorPlanRevisionAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_revision_audit_append_only"();

-- A lifecycle status is valid only when the matching immutable audit event is
-- present by commit time. Deferral lets the application create the revision,
-- binding rows and rich audit snapshot in one transaction.
CREATE OR REPLACE FUNCTION "require_floor_plan_revision_audit_event"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."publicationStatus" IN ('approved', 'published', 'retired')
     AND NOT EXISTS (
       SELECT 1 FROM "FloorPlanRevisionAuditEvent" event
       WHERE event."revisionId" = NEW."id"
         AND event."eventType" = 'revision_approved'
     ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_AUDIT_REQUIRED: approval event is missing';
  END IF;

  IF NEW."publicationStatus" IN ('published', 'retired')
     AND NEW."publishedAt" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "FloorPlanRevisionAuditEvent" event
       WHERE event."revisionId" = NEW."id"
         AND event."eventType" = 'revision_published'
     ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_AUDIT_REQUIRED: publication event is missing';
  END IF;

  IF NEW."publicationStatus" = 'retired'
     AND NOT EXISTS (
       SELECT 1 FROM "FloorPlanRevisionAuditEvent" event
       WHERE event."revisionId" = NEW."id"
         AND event."eventType" = 'revision_retired'
     ) THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_AUDIT_REQUIRED: retirement event is missing';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "FloorPlanRevision_audit_required_guard"
AFTER INSERT OR UPDATE ON "FloorPlanRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_floor_plan_revision_audit_event"();

-- Approved bindings cannot be edited, re-parented or deleted. They remain as
-- the historical record after retirement; a correction gets a new revision.
CREATE OR REPLACE FUNCTION "guard_floor_plan_address_binding_immutability"()
RETURNS TRIGGER AS $$
DECLARE
  old_status "FloorPlanPublicationStatus";
  new_status "FloorPlanPublicationStatus";
BEGIN
  SELECT "publicationStatus" INTO old_status
    FROM "FloorPlanRevision"
    WHERE "id" = OLD."revisionId";

  IF TG_OP = 'UPDATE' THEN
    SELECT "publicationStatus" INTO new_status
      FROM "FloorPlanRevision"
      WHERE "id" = NEW."revisionId";
  END IF;

  IF old_status IN ('approved', 'published', 'retired')
     OR new_status IN ('approved', 'published', 'retired') THEN
    RAISE EXCEPTION 'FLOOR_PLAN_ADDRESS_BINDING_IMMUTABLE: create a new revision to correct an approved address binding';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanAddressBinding_immutability_guard"
BEFORE UPDATE OR DELETE ON "FloorPlanAddressBinding"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_address_binding_immutability"();

-- Approval/publication actors and timestamps are audit data too. Allow the
-- one-way status transition, but never let its recorded identity be rewritten.
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
