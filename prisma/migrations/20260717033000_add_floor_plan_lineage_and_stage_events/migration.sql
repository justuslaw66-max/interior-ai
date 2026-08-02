CREATE TABLE "FloorPlanDesignReference" (
  "designId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revisionId" TEXT,
  "sourceJobId" TEXT,
  "sourceAssetSha256" CHAR(64),
  "geometryHash" CHAR(64),
  "addressBindingId" TEXT,
  "transform" "FloorPlanAddressTransform",

  CONSTRAINT "FloorPlanDesignReference_pkey" PRIMARY KEY ("designId"),
  CONSTRAINT "FloorPlanDesignReference_source_hash_check" CHECK (
    "sourceAssetSha256" IS NULL OR "sourceAssetSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "FloorPlanDesignReference_geometry_hash_check" CHECK (
    "geometryHash" IS NULL OR "geometryHash" ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX "FloorPlanDesignReference_revisionId_idx"
  ON "FloorPlanDesignReference"("revisionId");
CREATE INDEX "FloorPlanDesignReference_sourceJobId_idx"
  ON "FloorPlanDesignReference"("sourceJobId");
CREATE INDEX "FloorPlanDesignReference_sourceAssetSha256_idx"
  ON "FloorPlanDesignReference"("sourceAssetSha256");
CREATE INDEX "FloorPlanDesignReference_addressBindingId_idx"
  ON "FloorPlanDesignReference"("addressBindingId");
CREATE INDEX "FloorPlanDesignReference_geometryHash_idx"
  ON "FloorPlanDesignReference"("geometryHash");

ALTER TABLE "FloorPlanDesignReference"
  ADD CONSTRAINT "FloorPlanDesignReference_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanDesignReference"
  ADD CONSTRAINT "FloorPlanDesignReference_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "FloorPlanRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FloorPlanDesignReference"
  ADD CONSTRAINT "FloorPlanDesignReference_sourceJobId_fkey"
  FOREIGN KEY ("sourceJobId") REFERENCES "FloorPlanImportJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FloorPlanDesignReference"
  ADD CONSTRAINT "FloorPlanDesignReference_addressBindingId_fkey"
  FOREIGN KEY ("addressBindingId") REFERENCES "FloorPlanAddressBinding"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FloorPlanImportStageEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "jobId" TEXT NOT NULL,
  "adapterId" VARCHAR(160),
  "extractionVersion" VARCHAR(160),
  "fromStatus" "FloorPlanImportJobStatus" NOT NULL,
  "toStatus" "FloorPlanImportJobStatus" NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "issueCount" INTEGER NOT NULL,
  "criticalIssueCount" INTEGER NOT NULL,
  "warningIssueCount" INTEGER NOT NULL,
  "metricsJson" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "FloorPlanImportStageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FloorPlanImportStageEvent_duration_check" CHECK (
    "durationMs" >= 0
  ),
  CONSTRAINT "FloorPlanImportStageEvent_issue_counts_check" CHECK (
    "issueCount" >= 0 AND
    "criticalIssueCount" >= 0 AND
    "warningIssueCount" >= 0 AND
    "criticalIssueCount" + "warningIssueCount" <= "issueCount"
  ),
  CONSTRAINT "FloorPlanImportStageEvent_metrics_object_check" CHECK (
    jsonb_typeof("metricsJson") = 'object'
  )
);

CREATE INDEX "FloorPlanImportStageEvent_jobId_createdAt_idx"
  ON "FloorPlanImportStageEvent"("jobId", "createdAt");
CREATE INDEX "FloorPlanImportStageEvent_toStatus_createdAt_idx"
  ON "FloorPlanImportStageEvent"("toStatus", "createdAt");

ALTER TABLE "FloorPlanImportStageEvent"
  ADD CONSTRAINT "FloorPlanImportStageEvent_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FloorPlanImportJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Conservatively backfill existing designs. Rows are inserted only when every
-- supplied durable identifier resolves and cross-checks exactly. Synthetic
-- private document revision IDs are ignored when an owner-scoped import job is
-- the validated source. Ambiguous snapshots remain JSON-only until next save.
WITH "snapshotLineage" AS (
  SELECT
    design."id" AS "designId",
    design."userId" AS "ownerUserId",
    NULLIF(btrim(design."snapshot" #>> '{floorPlan,revisionId}'), '') AS "rawRevisionId",
    COALESCE(
      NULLIF(btrim(design."snapshot" #>> '{floorPlan,sourceJobId}'), ''),
      NULLIF(btrim(design."snapshot" #>> '{floorPlan,underlay,sourceJobId}'), '')
    ) AS "rawSourceJobId",
    COALESCE(
      NULLIF(lower(btrim(design."snapshot" #>> '{floorPlan,sourceAssetSha256}')), ''),
      NULLIF(lower(btrim(design."snapshot" #>> '{floorPlan,underlay,sourceAssetSha256}')), '')
    ) AS "rawSourceHash",
    COALESCE(
      NULLIF(lower(btrim(design."snapshot" #>> '{floorPlan,sourceRevisionGeometryHash}')), ''),
      NULLIF(lower(btrim(design."snapshot" #>> '{floorPlan,canonicalGeometryHash}')), '')
    ) AS "rawGeometryHash",
    NULLIF(btrim(design."snapshot" #>> '{floorPlan,addressBinding,bindingId}'), '') AS "rawBindingId",
    COALESCE(
      NULLIF(btrim(design."snapshot" #>> '{floorPlan,addressTransform}'), ''),
      NULLIF(btrim(design."snapshot" #>> '{floorPlan,addressBinding,transform}'), '')
    ) AS "rawTransform"
  FROM "Design" design
  WHERE design."userId" IS NOT NULL
    AND jsonb_typeof(design."snapshot") = 'object'
    AND jsonb_typeof(design."snapshot" -> 'floorPlan') = 'object'
),
"validatedLineage" AS (
  SELECT
    lineage.*,
    revision."id" AS "revisionId",
    revision."sourceJobId" AS "revisionSourceJobId",
    revision."geometryHash" AS "revisionGeometryHash",
    ownedJob."id" AS "ownedJobId",
    COALESCE(revision."sourceJobId", ownedJob."id") AS "resolvedJobId",
    sourceAsset."sha256" AS "resolvedSourceHash",
    binding."id" AS "bindingId"
  FROM "snapshotLineage" lineage
  LEFT JOIN "FloorPlanRevision" revision
    ON revision."id" = lineage."rawRevisionId"
  LEFT JOIN "FloorPlanImportJob" ownedJob
    ON ownedJob."id" = lineage."rawSourceJobId"
   AND ownedJob."userId" = lineage."ownerUserId"
  LEFT JOIN "FloorPlanImportJob" resolvedJob
    ON resolvedJob."id" = COALESCE(revision."sourceJobId", ownedJob."id")
  LEFT JOIN "FloorPlanSourceAsset" sourceAsset
    ON sourceAsset."id" = resolvedJob."sourceAssetId"
  LEFT JOIN "FloorPlanAddressBinding" binding
    ON binding."id" = lineage."rawBindingId"
   AND binding."revisionId" = revision."id"
)
INSERT INTO "FloorPlanDesignReference" (
  "designId",
  "createdAt",
  "updatedAt",
  "revisionId",
  "sourceJobId",
  "sourceAssetSha256",
  "geometryHash",
  "addressBindingId",
  "transform"
)
SELECT
  validated."designId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  validated."revisionId",
  validated."resolvedJobId",
  validated."resolvedSourceHash",
  CASE
    WHEN validated."revisionId" IS NOT NULL THEN validated."revisionGeometryHash"
    WHEN validated."rawGeometryHash" ~ '^[a-f0-9]{64}$' THEN validated."rawGeometryHash"
    ELSE NULL
  END,
  validated."bindingId",
  CASE
    WHEN validated."rawTransform" IN (
      'normal', 'mirror_x', 'mirror_z', 'rotate_90', 'rotate_180',
      'rotate_270', 'mirror_x_rotate_90', 'mirror_x_rotate_270'
    ) THEN validated."rawTransform"::"FloorPlanAddressTransform"
    ELSE NULL
  END
FROM "validatedLineage" validated
WHERE validated."resolvedJobId" IS NOT NULL
  AND (
    validated."rawSourceHash" IS NULL OR
    validated."rawSourceHash" = validated."resolvedSourceHash"
  )
  AND (
    validated."revisionId" IS NULL OR
    validated."rawGeometryHash" IS NULL OR
    validated."rawGeometryHash" = validated."revisionGeometryHash"
  )
  AND (
    (
      validated."revisionId" IS NOT NULL AND
      (
        validated."rawSourceJobId" IS NULL OR
        validated."rawSourceJobId" = validated."revisionSourceJobId"
      ) AND
      (
        validated."rawBindingId" IS NULL OR
        validated."bindingId" IS NOT NULL
      )
    ) OR (
      validated."revisionId" IS NULL AND
      validated."ownedJobId" IS NOT NULL AND
      validated."rawBindingId" IS NULL
    )
  );
