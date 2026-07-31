import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS,
  FLOOR_PLAN_TRAINING_BENCHMARK_CONSENT_VERSION,
  assessFloorPlanRetentionPurge,
  canUsePrivateFloorPlanForTrainingOrBenchmark,
  floorPlanImportPrivacyForUpload,
  floorPlanPrivateSourceRetentionDays,
  parseFloorPlanTrainingBenchmarkOptIn,
  type FloorPlanRetentionAsset,
  type FloorPlanRetentionJob,
} from "@/lib/floor-plan-imports/privacy";
import {
  PrismaFloorPlanRetentionService,
  floorPlanContentDeletionPatch,
  sanitizePrivateFloorPlanUnderlayForSave,
  scrubPrivateFloorPlanUnderlayFromSnapshot,
} from "@/lib/floor-plan-imports/retention";

const now = new Date("2030-01-01T00:00:00.000Z");
const expired = new Date("2029-12-31T00:00:00.000Z");
const future = new Date("2030-02-01T00:00:00.000Z");

function job(
  overrides: Partial<FloorPlanRetentionJob> = {}
): FloorPlanRetentionJob {
  return {
    id: "job-1",
    userId: "user-1",
    status: "ready",
    sourceRetentionExpiresAt: expired,
    sourceDeletionRequestedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    revision: null,
    ...overrides,
  };
}

function asset(
  jobs: FloorPlanRetentionJob[],
  overrides: Partial<FloorPlanRetentionAsset> = {}
): FloorPlanRetentionAsset {
  return {
    id: "source-1",
    ownerScope: "user-1",
    contentDeletedAt: null,
    jobs,
    ...overrides,
  };
}

assert.equal(parseFloorPlanTrainingBenchmarkOptIn(null), false);
assert.equal(parseFloorPlanTrainingBenchmarkOptIn("false"), false);
assert.equal(parseFloorPlanTrainingBenchmarkOptIn("true"), true);
assert.throws(() => parseFloorPlanTrainingBenchmarkOptIn("yes"));
assert.equal(
  floorPlanPrivateSourceRetentionDays({}),
  DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS
);
assert.equal(
  floorPlanPrivateSourceRetentionDays({
    FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS: "0",
  }),
  1
);
assert.equal(
  floorPlanPrivateSourceRetentionDays({
    FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS: "9999",
  }),
  365
);

const defaultPrivacy = floorPlanImportPrivacyForUpload({
  trainingBenchmarkOptIn: false,
  now,
});
assert.equal(defaultPrivacy.trainingBenchmarkOptIn, false);
assert.equal(defaultPrivacy.trainingBenchmarkOptInAt, null);
assert.equal(defaultPrivacy.trainingBenchmarkConsentVersion, null);
assert.equal(
  canUsePrivateFloorPlanForTrainingOrBenchmark(defaultPrivacy, now),
  false,
  "missing consent must never be inferred"
);

const optedInPrivacy = floorPlanImportPrivacyForUpload({
  trainingBenchmarkOptIn: true,
  now,
});
assert.equal(
  optedInPrivacy.trainingBenchmarkConsentVersion,
  FLOOR_PLAN_TRAINING_BENCHMARK_CONSENT_VERSION
);
assert.equal(
  canUsePrivateFloorPlanForTrainingOrBenchmark(optedInPrivacy, now),
  true
);
assert.equal(
  canUsePrivateFloorPlanForTrainingOrBenchmark(
    { ...optedInPrivacy, trainingBenchmarkRevokedAt: now },
    now
  ),
  false
);
assert.equal(
  canUsePrivateFloorPlanForTrainingOrBenchmark(
    { ...optedInPrivacy, sourceRetentionExpiresAt: expired },
    now
  ),
  false,
  "opt-in must not extend byte retention"
);

const approved = assessFloorPlanRetentionPurge({
  asset: asset([
    job({
      revision: {
        publicationStatus: "retired",
        approvedAt: new Date("2029-01-01T00:00:00.000Z"),
        publishedAt: null,
      },
    }),
  ]),
  targetJobId: "job-1",
  mode: "retention_expired",
  now,
});
assert.equal(
  approved.code,
  "protected_revision",
  "once-approved evidence remains protected even after retirement"
);

const published = assessFloorPlanRetentionPurge({
  asset: asset([
    job({
      revision: {
        publicationStatus: "published",
        approvedAt: null,
        publishedAt: null,
      },
    }),
  ]),
  targetJobId: "job-1",
  mode: "owner_requested",
  ownerUserId: "user-1",
  now,
});
assert.equal(published.code, "protected_revision");

const leased = assessFloorPlanRetentionPurge({
  asset: asset([
    job({ leaseToken: "lease", leaseExpiresAt: future }),
  ]),
  targetJobId: "job-1",
  mode: "retention_expired",
  now,
});
assert.equal(leased.code, "active_lease");

const wrongOwner = assessFloorPlanRetentionPurge({
  asset: asset([job()]),
  targetJobId: "job-1",
  mode: "owner_requested",
  ownerUserId: "user-2",
  now,
});
assert.equal(wrongOwner.code, "owner_boundary");

const incomplete = assessFloorPlanRetentionPurge({
  asset: asset([job({ status: "needs_review" })]),
  targetJobId: "job-1",
  mode: "owner_requested",
  ownerUserId: "user-1",
  now,
});
assert.equal(incomplete.code, "processing_incomplete");

const sharedAsset = asset([
  job(),
  job({ id: "job-2", sourceRetentionExpiresAt: future }),
]);
const partialCleanup = assessFloorPlanRetentionPurge({
  asset: sharedAsset,
  targetJobId: "job-1",
  mode: "retention_expired",
  now,
});
assert.equal(partialCleanup.code, "purge");
assert.equal(partialCleanup.purgeSource, false);
assert.deepEqual(partialCleanup.purgeDerivedJobIds, ["job-1"]);

const allDue = assessFloorPlanRetentionPurge({
  asset: asset([
    job({ status: "needs_review" }),
    job({ id: "job-2", status: "ready" }),
  ]),
  targetJobId: "job-1",
  mode: "retention_expired",
  now,
});
assert.equal(allDue.purgeSource, true);
assert.deepEqual(allDue.failJobIds, ["job-1"]);

const earlyDeletion = assessFloorPlanRetentionPurge({
  asset: asset([job(), job({ id: "job-2", status: "applied" })]),
  targetJobId: "job-1",
  mode: "owner_requested",
  ownerUserId: "user-1",
  now,
});
assert.equal(earlyDeletion.code, "purge");
assert.equal(earlyDeletion.purgeSource, true);
assert.deepEqual(earlyDeletion.purgeDerivedJobIds, ["job-1", "job-2"]);

const idempotentDeletion = assessFloorPlanRetentionPurge({
  asset: asset([job({ sourceDeletionRequestedAt: expired })], {
    contentDeletedAt: expired,
  }),
  targetJobId: "job-1",
  mode: "owner_requested",
  ownerUserId: "user-1",
  now,
});
assert.equal(idempotentDeletion.code, "purge");

const deletionPatch = floorPlanContentDeletionPatch("retention_expired", now);
assert.deepEqual(Object.keys(deletionPatch).sort(), [
  "bytes",
  "contentDeletedAt",
  "contentDeletionReason",
  "externalUrl",
]);
assert.equal("sha256" in deletionPatch, false);
assert.equal("sourceManifestJson" in deletionPatch, false);
assert.equal("candidateJson" in deletionPatch, false);

const sourceSha256 = "a".repeat(64);
const linkedSnapshot = {
  version: 3,
  activeRoomId: "room-1",
  rooms: [{ id: "room-1", name: "Living", items: [{ id: "sofa-1" }] }],
  floorPlan: {
    underlay: {
      assetUrl: "data:image/png;base64,PRIVATE_SOURCE_BYTES",
      mimeType: "image/png",
      sourceAssetSha256: sourceSha256,
      opacity: 0.65,
    },
    openings: [{ id: "opening-1", canonicalWallId: "wall-1" }],
    fixedElements: [{ id: "column-1", canonicalKind: "column" }],
    canonicalDocument: { id: "canonical-document-1", walls: ["wall-1"] },
    canonicalGeometryHash: "geometry-hash-1",
    revisionId: "revision-1",
  },
};
const originalLinkedSnapshot = JSON.stringify(linkedSnapshot);
const scrubbedByHash = scrubPrivateFloorPlanUnderlayFromSnapshot({
  snapshot: linkedSnapshot,
  affectedJobIds: [],
  sourceAssetSha256: sourceSha256,
});
assert.equal(scrubbedByHash.scrubbed, true);
type ScrubbedLinkedSnapshot = Omit<typeof linkedSnapshot, "floorPlan"> & {
  floorPlan: Omit<typeof linkedSnapshot.floorPlan, "underlay"> & {
    underlay: null;
  };
};
const scrubbedSnapshot = scrubbedByHash.snapshot as ScrubbedLinkedSnapshot;
assert.equal(scrubbedSnapshot.floorPlan.underlay, null);
assert.deepEqual(scrubbedSnapshot.rooms, linkedSnapshot.rooms);
assert.deepEqual(
  scrubbedSnapshot.floorPlan.openings,
  linkedSnapshot.floorPlan.openings
);
assert.deepEqual(
  scrubbedSnapshot.floorPlan.fixedElements,
  linkedSnapshot.floorPlan.fixedElements
);
assert.deepEqual(
  scrubbedSnapshot.floorPlan.canonicalDocument,
  linkedSnapshot.floorPlan.canonicalDocument
);
assert.equal(
  scrubbedSnapshot.floorPlan.canonicalGeometryHash,
  linkedSnapshot.floorPlan.canonicalGeometryHash
);
assert.equal(
  JSON.stringify(linkedSnapshot),
  originalLinkedSnapshot,
  "scrubbing must not mutate an in-memory editor snapshot"
);

const jobLinkedSnapshot = {
  ...linkedSnapshot,
  floorPlan: {
    ...linkedSnapshot.floorPlan,
    underlay: {
      ...linkedSnapshot.floorPlan.underlay,
      sourceAssetSha256: undefined,
      sourceJobId: "job-1",
    },
  },
};
assert.equal(
  scrubPrivateFloorPlanUnderlayFromSnapshot({
    snapshot: jobLinkedSnapshot,
    affectedJobIds: ["job-1"],
    sourceAssetSha256: "b".repeat(64),
  }).scrubbed,
  true,
  "an exact import-job link must be sufficient"
);
const unrelatedSnapshot = {
  ...linkedSnapshot,
  floorPlan: {
    ...linkedSnapshot.floorPlan,
    underlay: {
      ...linkedSnapshot.floorPlan.underlay,
      sourceAssetSha256: "c".repeat(64),
      sourceJobId: "job-unrelated",
    },
  },
};
const unrelatedResult = scrubPrivateFloorPlanUnderlayFromSnapshot({
  snapshot: unrelatedSnapshot,
  affectedJobIds: ["job-1"],
  sourceAssetSha256: sourceSha256,
});
assert.equal(unrelatedResult.scrubbed, false);
assert.equal(
  unrelatedResult.snapshot,
  unrelatedSnapshot,
  "an unrelated owner design must not be rewritten"
);

const uploadPanelSource = fs.readFileSync(
  path.join(process.cwd(), "components/editor/FloorPlanUploadPanel.tsx"),
  "utf8"
);
const importAssistantSource = fs.readFileSync(
  path.join(process.cwd(), "components/editor/FloorPlanImportAssistant.tsx"),
  "utf8"
);
assert.doesNotMatch(
  uploadPanelSource,
  /onSourceContentDeleted=\{onClear\}/,
  "source deletion must not clear an unrelated underlay in the open design"
);
assert.doesNotMatch(
  importAssistantSource,
  /onSourceContentDeleted\?\.\(\)/,
  "the isolated import must rely on owner-scoped server scrubbing, not open-design mutation"
);

const createDesignRouteSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/designs/route.ts"),
  "utf8"
);
const updateDesignRouteSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/designs/[id]/route.ts"),
  "utf8"
);
const sourceDeletionRouteSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/floor-plan-imports/[id]/source/route.ts"
  ),
  "utf8"
);
assert.match(sourceDeletionRouteSource, /persistedUnderlayCleared:/);
for (const routeSource of [createDesignRouteSource, updateDesignRouteSource]) {
  assert.match(routeSource, /sanitizePrivateFloorPlanUnderlayForSave\(/);
  assert.match(
    routeSource,
    /prisma\.\$transaction\(/,
    "the tombstone check and save must share the source-row lock transaction"
  );
}

async function runPersistenceScrubRegressions() {
  const lockOrder: string[] = [];
  const saveSanitized = await sanitizePrivateFloorPlanUnderlayForSave({
    snapshot: linkedSnapshot,
    ownerUserId: "user-1",
    client: {
      $queryRaw: async () => {
        lockOrder.push("lock");
        return [];
      },
      floorPlanImportJob: {
        findFirst: async () => null,
      },
      floorPlanSourceAsset: {
        findMany: async () => {
          lockOrder.push("lookup");
          return [{ sha256: sourceSha256, contentDeletedAt: now }];
        },
      },
    },
  });
  assert.deepEqual(lockOrder, ["lock", "lookup"]);
  assert.equal(saveSanitized.scrubbed, true);
  assert.equal(
    (saveSanitized.snapshot as ScrubbedLinkedSnapshot).floorPlan.underlay,
    null,
    "a queued stale save must not restore tombstoned private bytes"
  );

  const retainedDuplicate = await sanitizePrivateFloorPlanUnderlayForSave({
    snapshot: linkedSnapshot,
    ownerUserId: "user-1",
    client: {
      $queryRaw: async () => [],
      floorPlanImportJob: { findFirst: async () => null },
      floorPlanSourceAsset: {
        findMany: async () => [
          { sha256: sourceSha256, contentDeletedAt: now },
          { sha256: sourceSha256, contentDeletedAt: null },
        ],
      },
    },
  });
  assert.equal(
    retainedDuplicate.scrubbed,
    false,
    "an actively re-uploaded identical source must remain usable"
  );

  const persistedSnapshots = new Map<string, unknown>([
    ["design-linked", linkedSnapshot],
    ["design-unrelated", unrelatedSnapshot],
  ]);
  const summaryJob = job();
  const siblingJob = job({ id: "job-2" });
  const deletedSourceIds: string[] = [];
  const deletedSourceFileNames: string[] = [];
  const retainedManifests = new Map<string, unknown>();
  const rawCadManifest = (label: string) => ({
    source: {
      fileName: `${label}.dxf`,
      mimeType: "application/dxf",
      sha256: "d".repeat(64),
    },
    cad: {
      kind: "floor_plan_cad_evidence_v1",
      format: "dxf",
      parserVersion: "test",
      units: { name: "mm", millimetresPerUnit: 1, basis: "source_declared" },
      entityCount: 1,
      paths: [{ points: [{ x: 1, y: 2 }] }],
      texts: [{ text: `PRIVATE ${label.toUpperCase()} LABEL` }],
      warnings: [`${label}.dxf`],
      parseFailure: null,
    },
  });
  const transaction = {
    $queryRaw: async () => [],
    floorPlanImportJob: {
      findUnique: async (args: { select?: Record<string, unknown> }) =>
        args.select && "sourceAsset" in args.select
          ? {
              ...summaryJob,
              sourceAssetId: "source-1",
              sourceManifestJson: rawCadManifest("private-home"),
              sourceAsset: {
                id: "source-1",
                sha256: sourceSha256,
                ownerScope: "user-1",
                storageProvider: "database",
                storageKey: "database:source:user-1:source-1",
                contentDeletedAt: null,
                importJobs: [summaryJob, siblingJob],
              },
              supplementarySources: [{
                sourceAsset: {
                  id: "supplementary-source-1",
                  storageProvider: "database",
                  storageKey: "database:source:supplementary-source-1",
                  contentDeletedAt: null,
                  supplementaryUses: [{ jobId: "job-1" }],
                  constructionUses: [],
                },
              }],
            }
          : {
              id: "job-1",
              userId: "user-1",
              sourceAssetId: "source-1",
              supplementarySources: [{ sourceAssetId: "supplementary-source-1" }],
            },
      findFirst: async () => null,
      findMany: async (args: { select?: { sourceManifestJson?: boolean } }) =>
        args.select?.sourceManifestJson
          ? [
              { id: "job-1", sourceManifestJson: rawCadManifest("private-home") },
              { id: "job-2", sourceManifestJson: rawCadManifest("private-sibling") },
            ]
          : [],
      updateMany: async (args: {
        where?: { id?: string };
        data?: { sourceManifestJson?: unknown };
      }) => {
        if (args.data && "sourceManifestJson" in args.data) {
          retainedManifests.set(args.where?.id ?? "unknown", args.data.sourceManifestJson);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    floorPlanDerivedAsset: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    floorPlanSupplementarySource: {
      findMany: async () => [
        {
          sourceAsset: {
            id: "supplementary-source-1",
            storageProvider: "database",
            storageKey: "database:source:supplementary-source-1",
            contentDeletedAt: null,
            supplementaryUses: [{ jobId: "job-1" }],
            constructionUses: [],
          },
        },
        {
          sourceAsset: {
            id: "supplementary-source-2",
            storageProvider: "database",
            storageKey: "database:source:supplementary-source-2",
            contentDeletedAt: null,
            supplementaryUses: [{ jobId: "job-2" }],
            constructionUses: [],
          },
        },
      ],
    },
    floorPlanConstructionSource: {
      findMany: async () => [
        {
          sourceAsset: {
            id: "construction-source-1",
            storageProvider: "database",
            storageKey: "database:source:construction-source-1",
            contentDeletedAt: null,
            supplementaryUses: [],
            constructionUses: [{ jobId: "job-1" }],
          },
        },
      ],
    },
    floorPlanSourceAsset: {
      findMany: async () => [],
      updateMany: async (args: {
        where?: { id?: string };
        data?: { fileName?: string };
      }) => {
        if (args.where?.id) deletedSourceIds.push(args.where.id);
        if (args.data?.fileName) deletedSourceFileNames.push(args.data.fileName);
        return { count: 1 };
      },
    },
    design: {
      findMany: async () =>
        Array.from(persistedSnapshots, ([id, snapshot]) => ({ id, snapshot })),
      updateMany: async (args: {
        where: { id: string; userId: string };
        data: { snapshot: unknown };
      }) => {
        assert.equal(args.where.userId, "user-1");
        if (!persistedSnapshots.has(args.where.id)) return { count: 0 };
        persistedSnapshots.set(args.where.id, args.data.snapshot);
        return { count: 1 };
      },
    },
  };
  const retentionClient = {
    ...transaction,
    $transaction: async <T>(
      callback: (client: typeof transaction) => Promise<T>
    ) => callback(transaction),
  };
  const purge = await new PrismaFloorPlanRetentionService(
    retentionClient
  ).requestOwnerDeletion({
    jobId: "job-1",
    ownerUserId: "user-1",
    now,
  });
  assert.equal(purge.designUnderlaysScrubbed, 1);
  assert.ok(deletedSourceIds.includes("source-1"));
  assert.ok(
    deletedSourceIds.includes("supplementary-source-1"),
    "unapproved supplementary bytes must follow the job retention boundary"
  );
  assert.ok(
    deletedSourceIds.includes("supplementary-source-2"),
    "a sibling job sharing the primary source must have its own supplementary bytes purged"
  );
  assert.ok(
    deletedSourceIds.includes("construction-source-1"),
    "unapproved construction evidence must follow the job retention boundary"
  );
  assert.ok(
    deletedSourceFileNames.every((name) => name === "deleted-floor-plan-source"),
    "source tombstones must not retain uploaded filenames"
  );
  assert.equal(retainedManifests.size, 2);
  assert.doesNotMatch(
    JSON.stringify([...retainedManifests.values()]),
    /PRIVATE (?:PRIVATE-HOME|PRIVATE-SIBLING) LABEL|private-(?:home|sibling)\.dxf/
  );
  assert.equal(
    (
      persistedSnapshots.get("design-linked") as typeof scrubbedSnapshot
    ).floorPlan.underlay,
    null,
    "DELETE must persist the scrubbed owner snapshot"
  );
  assert.equal(
    persistedSnapshots.get("design-unrelated"),
    unrelatedSnapshot,
    "DELETE must preserve an unrelated saved design"
  );
}

runPersistenceScrubRegressions()
  .then(() => console.log("Floor-plan private source retention tests passed"))
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  });
