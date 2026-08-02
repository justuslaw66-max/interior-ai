CREATE TYPE "FloorPlanImportJobStatus" AS ENUM (
  'received',
  'rendered',
  'extracted',
  'scale_solved',
  'topology_built',
  'validating',
  'needs_review',
  'ready',
  'applied',
  'published',
  'failed'
);

CREATE TYPE "FloorPlanSourceStorageProvider" AS ENUM ('database', 'external');
CREATE TYPE "FloorPlanVerificationTier" AS ENUM (
  'unverified',
  'source_verified',
  'construction_verified'
);
CREATE TYPE "FloorPlanPublicationStatus" AS ENUM ('draft', 'approved', 'published', 'retired');
CREATE TYPE "FloorPlanAddressTransform" AS ENUM (
  'normal',
  'mirror_x',
  'mirror_z',
  'rotate_90',
  'rotate_180',
  'rotate_270',
  'mirror_x_rotate_90',
  'mirror_x_rotate_270'
);

CREATE TABLE "FloorPlanSourceAsset" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sha256" VARCHAR(64) NOT NULL,
    "dedupeKey" VARCHAR(64) NOT NULL,
    "ownerScope" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "storageProvider" "FloorPlanSourceStorageProvider" NOT NULL DEFAULT 'database',
  "storageKey" TEXT NOT NULL,
  "bytes" BYTEA,
  "externalUrl" TEXT,
  CONSTRAINT "FloorPlanSourceAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanImportJob" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "status" "FloorPlanImportJobStatus" NOT NULL DEFAULT 'received',
  "adapterId" TEXT,
  "extractionVersion" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 5,
  "renderedPagesJson" JSONB NOT NULL DEFAULT '[]',
  "candidateJson" JSONB,
  "sourceManifestJson" JSONB,
  "reviewIssuesJson" JSONB NOT NULL DEFAULT '[]',
  "correctionLogJson" JSONB NOT NULL DEFAULT '[]',
  "candidateVersion" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "appliedDesignId" TEXT,
  CONSTRAINT "FloorPlanImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanDerivedAsset" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "jobId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "storageProvider" "FloorPlanSourceStorageProvider" NOT NULL DEFAULT 'database',
  "storageKey" TEXT NOT NULL,
  "bytes" BYTEA,
  "externalUrl" TEXT,
  CONSTRAINT "FloorPlanDerivedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanRevision" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceJobId" TEXT NOT NULL,
  "geometryHash" VARCHAR(64) NOT NULL,
  "documentJson" JSONB NOT NULL,
  "sourceManifestJson" JSONB NOT NULL,
  "constructionEvidenceJson" JSONB,
  "verificationTier" "FloorPlanVerificationTier" NOT NULL DEFAULT 'unverified',
  "publicationStatus" "FloorPlanPublicationStatus" NOT NULL DEFAULT 'draft',
  "approvedAt" TIMESTAMP(3),
  "approvedByEmail" TEXT,
  "publishedAt" TIMESTAMP(3),
  "publishedByEmail" TEXT,
  CONSTRAINT "FloorPlanRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanAddressBinding" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revisionId" TEXT NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "addressNormalized" TEXT NOT NULL,
  "block" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "postalCode" TEXT,
  "stack" TEXT,
  "floorMin" INTEGER,
  "floorMax" INTEGER,
  "transform" "FloorPlanAddressTransform" NOT NULL DEFAULT 'normal',
  "sourceEvidenceJson" JSONB,
  CONSTRAINT "FloorPlanAddressBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FloorPlanSourceAsset_dedupeKey_key" ON "FloorPlanSourceAsset"("dedupeKey");
CREATE INDEX "FloorPlanSourceAsset_sha256_idx" ON "FloorPlanSourceAsset"("sha256");
CREATE INDEX "FloorPlanSourceAsset_ownerScope_createdAt_idx" ON "FloorPlanSourceAsset"("ownerScope", "createdAt");
CREATE UNIQUE INDEX "FloorPlanSourceAsset_storageKey_key" ON "FloorPlanSourceAsset"("storageKey");
CREATE UNIQUE INDEX "FloorPlanImportJob_appliedDesignId_key" ON "FloorPlanImportJob"("appliedDesignId");
CREATE INDEX "FloorPlanImportJob_userId_createdAt_idx" ON "FloorPlanImportJob"("userId", "createdAt");
CREATE INDEX "FloorPlanImportJob_userId_status_idx" ON "FloorPlanImportJob"("userId", "status");
CREATE INDEX "FloorPlanImportJob_sourceAssetId_idx" ON "FloorPlanImportJob"("sourceAssetId");
CREATE INDEX "FloorPlanImportJob_status_updatedAt_idx" ON "FloorPlanImportJob"("status", "updatedAt");
CREATE UNIQUE INDEX "FloorPlanDerivedAsset_storageKey_key" ON "FloorPlanDerivedAsset"("storageKey");
CREATE INDEX "FloorPlanDerivedAsset_jobId_idx" ON "FloorPlanDerivedAsset"("jobId");
CREATE INDEX "FloorPlanDerivedAsset_sha256_idx" ON "FloorPlanDerivedAsset"("sha256");
CREATE UNIQUE INDEX "FloorPlanRevision_sourceJobId_key" ON "FloorPlanRevision"("sourceJobId");
CREATE INDEX "FloorPlanRevision_publicationStatus_publishedAt_idx" ON "FloorPlanRevision"("publicationStatus", "publishedAt");
CREATE INDEX "FloorPlanRevision_geometryHash_idx" ON "FloorPlanRevision"("geometryHash");
CREATE INDEX "FloorPlanAddressBinding_countryCode_addressNormalized_idx" ON "FloorPlanAddressBinding"("countryCode", "addressNormalized");
CREATE INDEX "FloorPlanAddressBinding_block_street_stack_idx" ON "FloorPlanAddressBinding"("block", "street", "stack");
CREATE INDEX "FloorPlanAddressBinding_revisionId_idx" ON "FloorPlanAddressBinding"("revisionId");

ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "FloorPlanSourceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloorPlanImportJob"
  ADD CONSTRAINT "FloorPlanImportJob_appliedDesignId_fkey"
  FOREIGN KEY ("appliedDesignId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FloorPlanDerivedAsset"
  ADD CONSTRAINT "FloorPlanDerivedAsset_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FloorPlanImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanRevision"
  ADD CONSTRAINT "FloorPlanRevision_sourceJobId_fkey"
  FOREIGN KEY ("sourceJobId") REFERENCES "FloorPlanImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FloorPlanAddressBinding"
  ADD CONSTRAINT "FloorPlanAddressBinding_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "FloorPlanRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approved revisions are immutable records. Publication may update lifecycle
-- metadata, but canonical geometry, evidence, provenance and source identity
-- must always produce the same stored revision.
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

CREATE TRIGGER "FloorPlanRevision_immutability_guard"
BEFORE UPDATE OR DELETE ON "FloorPlanRevision"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_revision_immutability"();

CREATE OR REPLACE FUNCTION "normalize_floor_plan_address_part"(value TEXT)
RETURNS TEXT AS $$
  SELECT lower(regexp_replace(replace(replace(trim(coalesce(value, '')), '.', ''), ',', ''), '[[:space:]]+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- The application performs the same check for a useful 409 response. This
-- trigger is the final authority and protects direct SQL and future code paths.
CREATE OR REPLACE FUNCTION "guard_floor_plan_address_binding_overlap"()
RETURNS TRIGGER AS $$
DECLARE
  target_status "FloorPlanPublicationStatus";
  normalized_country TEXT;
  normalized_address TEXT;
  normalized_block_street TEXT;
  address_lock_key BIGINT;
  block_lock_key BIGINT;
BEGIN
  SELECT "publicationStatus" INTO target_status
    FROM "FloorPlanRevision"
    WHERE "id" = NEW."revisionId";

  IF target_status NOT IN ('approved', 'published') THEN
    RETURN NEW;
  END IF;

  normalized_country := "normalize_floor_plan_address_part"(NEW."countryCode");
  normalized_address := "normalize_floor_plan_address_part"(NEW."addressNormalized");
  normalized_block_street := "normalize_floor_plan_address_part"(NEW."block" || ' ' || NEW."street");
  address_lock_key := hashtext(normalized_country || '|' || normalized_address)::BIGINT;
  block_lock_key := hashtext(normalized_country || '|' || normalized_block_street)::BIGINT;

  -- Serialize both exact-address and block/street aliases. Numeric ordering keeps
  -- two-key acquisition deterministic and prevents advisory-lock deadlocks.
  IF address_lock_key <= block_lock_key THEN
    PERFORM pg_advisory_xact_lock(address_lock_key);
    PERFORM pg_advisory_xact_lock(block_lock_key);
  ELSE
    PERFORM pg_advisory_xact_lock(block_lock_key);
    PERFORM pg_advisory_xact_lock(address_lock_key);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "FloorPlanAddressBinding" existing
      JOIN "FloorPlanRevision" revision ON revision."id" = existing."revisionId"
      WHERE existing."id" IS DISTINCT FROM NEW."id"
        AND revision."publicationStatus" IN ('approved', 'published')
        AND "normalize_floor_plan_address_part"(existing."countryCode") = normalized_country
        AND (
          "normalize_floor_plan_address_part"(existing."addressNormalized") = normalized_address
          OR (
            "normalize_floor_plan_address_part"(existing."block") = "normalize_floor_plan_address_part"(NEW."block")
            AND "normalize_floor_plan_address_part"(existing."street") = "normalize_floor_plan_address_part"(NEW."street")
            AND (
              "normalize_floor_plan_address_part"(existing."postalCode") = ''
              OR "normalize_floor_plan_address_part"(NEW."postalCode") = ''
              OR "normalize_floor_plan_address_part"(existing."postalCode") = "normalize_floor_plan_address_part"(NEW."postalCode")
            )
          )
        )
        AND (
          "normalize_floor_plan_address_part"(existing."stack") = ''
          OR "normalize_floor_plan_address_part"(NEW."stack") = ''
          OR "normalize_floor_plan_address_part"(existing."stack") = "normalize_floor_plan_address_part"(NEW."stack")
        )
        AND coalesce(existing."floorMin", -2147483648) <= coalesce(NEW."floorMax", 2147483647)
        AND coalesce(NEW."floorMin", -2147483648) <= coalesce(existing."floorMax", 2147483647)
  ) THEN
    RAISE EXCEPTION 'ADDRESS_BINDING_CONFLICT: published floor-plan address ranges cannot overlap';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FloorPlanAddressBinding_overlap_guard"
BEFORE INSERT OR UPDATE ON "FloorPlanAddressBinding"
FOR EACH ROW EXECUTE FUNCTION "guard_floor_plan_address_binding_overlap"();
