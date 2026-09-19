import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {
  FloorPlanDesignReferenceSyncError,
  syncFloorPlanDesignReference,
} from "../lib/floor-plan-design-reference";

type RevisionFixture = {
  id: string;
  sourceJobId: string;
  geometryHash: string;
  publicationStatus: "published" | "draft" | "retired";
  publishedAt: string | null;
  verificationTier: "source_verified" | "draft";
};

type Fixture = {
  ownerId?: string;
  revision?: RevisionFixture | null;
  job?: { id: string; userId: string; sha256: string } | null;
  designReference?: Record<string, unknown> | null;
  binding?: {
    id: string;
    revisionId: string;
    transform: "normal" | "mirror_x";
    stack: string | null;
    floorMin: number | null;
    floorMax: number | null;
    revision: RevisionFixture;
  } | null;
};

function client(fixture: Fixture = {}) {
  const writes: Array<{ kind: string; args: unknown }> = [];
  let designReference = structuredClone(fixture.designReference ?? null);
  const value = {
    design: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        fixture.ownerId === where.userId ? { id: where.id } : null,
    },
    floorPlanRevision: {
      findUnique: async () => fixture.revision ?? null,
    },
    floorPlanImportJob: {
      findUnique: async () =>
        fixture.job
          ? {
              id: fixture.job.id,
              userId: fixture.job.userId,
              sourceAsset: { sha256: fixture.job.sha256 },
            }
          : null,
    },
    floorPlanAddressBinding: {
      findUnique: async () => fixture.binding ?? null,
    },
    floorPlanDesignReference: {
      findUnique: async () => designReference,
      deleteMany: async (args: unknown) => {
        writes.push({ kind: "delete", args });
        designReference = null;
        return { count: 1 };
      },
      upsert: async (args: unknown) => {
        writes.push({ kind: "upsert", args });
        const mutation = args as {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        };
        designReference = designReference
          ? { ...designReference, ...mutation.update }
          : structuredClone(mutation.create);
        return args;
      },
    },
  };
  return {
    client: value as unknown as Prisma.TransactionClient,
    writes,
    get designReference() { return designReference; },
  };
}

function snapshot(input: {
  revisionId?: string;
  jobId?: string;
  sourceSha?: string;
  geometryHash?: string;
  bindingId?: string;
  transform?: string;
  unitFloor?: number;
  unitStack?: string;
}) {
  return {
    floorPlan: {
      revisionId: input.revisionId,
      sourceJobId: input.jobId,
      sourceAssetSha256: input.sourceSha,
      sourceRevisionGeometryHash: input.geometryHash,
      addressTransform: input.transform,
      addressBinding: input.bindingId
        ? {
            bindingId: input.bindingId,
            unitFloor: input.unitFloor,
            unitStack: input.unitStack,
          }
        : undefined,
    },
  };
}

const sha = "a".repeat(64);
const geometryHash = "b".repeat(64);

async function main() {
{
  const fixture = client({
    ownerId: "owner-1",
    revision: null,
    job: { id: "job-1", userId: "owner-1", sha256: sha },
  });
  await syncFloorPlanDesignReference({
    client: fixture.client,
    designId: "design-1",
    ownerUserId: "owner-1",
    snapshot: snapshot({
      revisionId: "synthetic-private-revision",
      jobId: "job-1",
      sourceSha: sha,
      geometryHash,
    }),
  });
  assert.equal(fixture.writes.length, 1);
  const args = fixture.writes[0]?.args as {
    create: Record<string, unknown>;
  };
  assert.equal(args.create.revisionId, null);
  assert.equal(args.create.sourceJobId, "job-1");
  assert.equal(args.create.sourceAssetSha256, sha);
  assert.equal(args.create.geometryHash, geometryHash);
}

{
  const revision: RevisionFixture = {
    id: "revision-1",
    sourceJobId: "job-admin",
    geometryHash,
    publicationStatus: "published",
    publishedAt: "2026-07-16T00:00:00.000Z",
    verificationTier: "source_verified",
  };
  const fixture = client({
    ownerId: "owner-1",
    revision,
    job: { id: "job-admin", userId: "admin", sha256: sha },
    binding: {
      id: "binding-1",
      revisionId: revision.id,
      transform: "mirror_x",
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      revision,
    },
  });
  await syncFloorPlanDesignReference({
    client: fixture.client,
    designId: "design-1",
    ownerUserId: "owner-1",
    snapshot: snapshot({
      revisionId: revision.id,
      sourceSha: sha,
      geometryHash,
      bindingId: "binding-1",
      transform: "mirror_x",
      unitFloor: 12,
      unitStack: "509",
    }),
  });
  const args = fixture.writes[0]?.args as { create: Record<string, unknown> };
  assert.equal(args.create.revisionId, revision.id);
  assert.equal(args.create.sourceJobId, "job-admin");
  assert.equal(args.create.addressBindingId, "binding-1");
  assert.equal(args.create.transform, "mirror_x");
}

for (const tamper of [
  { unitFloor: 16, unitStack: "509", transform: "mirror_x", code: "ADDRESS_UNIT_MISMATCH" },
  { unitFloor: 12, unitStack: "527", transform: "mirror_x", code: "ADDRESS_UNIT_MISMATCH" },
  { unitFloor: 12, unitStack: "509", transform: "normal", code: "ADDRESS_TRANSFORM_MISMATCH" },
] as const) {
  const revision: RevisionFixture = {
    id: "revision-1",
    sourceJobId: "job-admin",
    geometryHash,
    publicationStatus: "published",
    publishedAt: "2026-07-16T00:00:00.000Z",
    verificationTier: "source_verified",
  };
  const fixture = client({
    ownerId: "owner-1",
    revision,
    job: { id: "job-admin", userId: "admin", sha256: sha },
    binding: {
      id: "binding-1",
      revisionId: revision.id,
      transform: "mirror_x",
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      revision,
    },
  });
  await assert.rejects(
    syncFloorPlanDesignReference({
      client: fixture.client,
      designId: "design-1",
      ownerUserId: "owner-1",
      snapshot: snapshot({
        revisionId: revision.id,
        sourceSha: sha,
        geometryHash,
        bindingId: "binding-1",
        ...tamper,
      }),
    }),
    (cause) => cause instanceof FloorPlanDesignReferenceSyncError && cause.code === tamper.code
  );
  assert.equal(fixture.writes.length, 0, "Rejected private lineage must not mutate the reference");
}

{
  const revision: RevisionFixture = {
    id: "revision-geometry-mismatch",
    sourceJobId: "job-admin",
    geometryHash,
    publicationStatus: "published",
    publishedAt: "2026-07-16T00:00:00.000Z",
    verificationTier: "source_verified",
  };
  const existingReference = {
    designId: "design-1",
    revisionId: "revision-existing-valid",
    sourceJobId: "job-existing-valid",
    geometryHash: "c".repeat(64),
    addressBindingId: "binding-existing-valid",
    transform: "normal",
  };
  const existingReferenceBefore = structuredClone(existingReference);
  const fixture = client({
    ownerId: "owner-1",
    revision,
    job: { id: "job-admin", userId: "admin", sha256: sha },
    designReference: existingReference,
  });
  await assert.rejects(
    syncFloorPlanDesignReference({
      client: fixture.client,
      designId: "design-1",
      ownerUserId: "owner-1",
      snapshot: snapshot({
        revisionId: revision.id,
        sourceSha: sha,
        geometryHash: "d".repeat(64),
      }),
    }),
    (cause) => cause instanceof FloorPlanDesignReferenceSyncError &&
      cause.code === "LINEAGE_GEOMETRY_HASH_MISMATCH"
  );
  assert.equal(
    fixture.writes.filter((write) => write.kind === "upsert").length,
    0,
    "Geometry mismatch must not insert or update a design reference"
  );
  assert.equal(
    fixture.writes.filter((write) => write.kind === "delete").length,
    0,
    "Geometry mismatch must not delete a design reference"
  );
  assert.deepEqual(
    fixture.designReference,
    existingReferenceBefore,
    "An existing valid reference must remain unchanged after transaction rejection"
  );
  assert.equal(fixture.writes.length, 0, "Geometry mismatch must have no partial write effect");
}

{
  const revision: RevisionFixture = {
    id: "revision-1",
    sourceJobId: "job-admin",
    geometryHash,
    publicationStatus: "published",
    publishedAt: "2026-07-16T00:00:00.000Z",
    verificationTier: "source_verified",
  };
  const otherRevision = { ...revision, id: "revision-2" };
  const fixture = client({
    ownerId: "owner-1",
    revision,
    binding: {
      id: "binding-other",
      revisionId: otherRevision.id,
      transform: "mirror_x",
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      revision: otherRevision,
    },
  });
  await assert.rejects(
    syncFloorPlanDesignReference({
      client: fixture.client,
      designId: "design-1",
      ownerUserId: "owner-1",
      snapshot: snapshot({
        revisionId: revision.id,
        bindingId: "binding-other",
        transform: "mirror_x",
        unitFloor: 12,
        unitStack: "509",
      }),
    }),
    (cause) => cause instanceof FloorPlanDesignReferenceSyncError &&
      cause.code === "LINEAGE_REVISION_MISMATCH"
  );
  assert.equal(fixture.writes.length, 0);
}

{
  const fixture = client({ ownerId: "someone-else" });
  await assert.rejects(
    syncFloorPlanDesignReference({
      client: fixture.client,
      designId: "design-1",
      ownerUserId: "owner-1",
      snapshot: {},
    }),
    (cause) =>
      cause instanceof FloorPlanDesignReferenceSyncError &&
      cause.code === "DESIGN_NOT_OWNED"
  );
}

{
  const fixture = client({
    ownerId: "owner-1",
    job: { id: "job-1", userId: "other-owner", sha256: sha },
  });
  await assert.rejects(
    syncFloorPlanDesignReference({
      client: fixture.client,
      designId: "design-1",
      ownerUserId: "owner-1",
      snapshot: snapshot({ jobId: "job-1", sourceSha: sha }),
    }),
    (cause) =>
      cause instanceof FloorPlanDesignReferenceSyncError &&
      cause.code === "SOURCE_JOB_NOT_OWNED"
  );
}

{
  const fixture = client({ ownerId: "owner-1" });
  await syncFloorPlanDesignReference({
    client: fixture.client,
    designId: "design-1",
    ownerUserId: "owner-1",
    snapshot: { version: 3 },
  });
  assert.equal(fixture.writes[0]?.kind, "delete");
}

{
  const fixture = client({ ownerId: "owner-1", revision: null });
  await syncFloorPlanDesignReference({
    client: fixture.client,
    designId: "design-1",
    ownerUserId: "owner-1",
    snapshot: snapshot({
      revisionId: "legacy-synthetic-revision",
      sourceSha: sha,
      geometryHash,
    }),
  });
  assert.equal(fixture.writes[0]?.kind, "delete");
}

for (const legacy of [false, true]) {
  const revision: RevisionFixture = { id: "revision-retained", sourceJobId: "job-admin", geometryHash,
    publicationStatus: "retired", publishedAt: "2026-07-16T00:00:00.000Z", verificationTier: "source_verified" };
  const saved = snapshot({ revisionId: revision.id, geometryHash, sourceSha: sha,
    bindingId: "binding-retained", transform: "mirror_x", ...(legacy ? {} : { unitFloor: 12, unitStack: "509" }) });
  const fixture = client({ ownerId: "owner-1", revision,
    job: { id: "job-admin", userId: "admin", sha256: sha },
    binding: { id: "binding-retained", revisionId: revision.id, transform: "mirror_x", stack: "509",
      floorMin: 2, floorMax: 15, revision },
    designReference: { designId: "design-1", revisionId: revision.id, sourceJobId: "job-admin",
      sourceAssetSha256: sha, geometryHash, addressBindingId: "binding-retained", transform: "mirror_x" },
  });
  const input = { client: fixture.client, designId: "design-1", ownerUserId: "owner-1", snapshot: saved };
  await assert.rejects(syncFloorPlanDesignReference(input), /REVISION_NOT_ELIGIBLE/,
    "A new retired selection cannot borrow existing lineage without the server-read previous snapshot");
  await syncFloorPlanDesignReference({ ...input, previousSnapshot: saved });
  assert.equal(fixture.writes.length, 1, "Unchanged owned lineage remains savable after retirement, including legacy selectors");
  await assert.rejects(syncFloorPlanDesignReference({ ...input, previousSnapshot: saved,
    snapshot: snapshot({ revisionId: revision.id, geometryHash, sourceSha: sha,
      bindingId: "binding-retained", transform: "mirror_x", unitFloor: 13, unitStack: "509" }) }), /REVISION_NOT_ELIGIBLE/);
}

console.log("floor-plan design reference persistence tests passed");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
