import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {
  FloorPlanDesignReferenceSyncError,
  syncFloorPlanDesignReference,
} from "../lib/floor-plan-design-reference";

type Fixture = {
  ownerId?: string;
  revision?: { id: string; sourceJobId: string; geometryHash: string } | null;
  job?: { id: string; userId: string; sha256: string } | null;
  binding?: {
    id: string;
    revisionId: string;
    transform: "normal" | "mirror_x";
    revision: { id: string; sourceJobId: string; geometryHash: string };
  } | null;
};

function client(fixture: Fixture = {}) {
  const writes: Array<{ kind: string; args: unknown }> = [];
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
      deleteMany: async (args: unknown) => {
        writes.push({ kind: "delete", args });
        return { count: 1 };
      },
      upsert: async (args: unknown) => {
        writes.push({ kind: "upsert", args });
        return args;
      },
    },
  };
  return { client: value as unknown as Prisma.TransactionClient, writes };
}

function snapshot(input: {
  revisionId?: string;
  jobId?: string;
  sourceSha?: string;
  geometryHash?: string;
  bindingId?: string;
  transform?: string;
}) {
  return {
    floorPlan: {
      revisionId: input.revisionId,
      sourceJobId: input.jobId,
      sourceAssetSha256: input.sourceSha,
      sourceRevisionGeometryHash: input.geometryHash,
      addressTransform: input.transform,
      addressBinding: input.bindingId
        ? { bindingId: input.bindingId }
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
  const revision = { id: "revision-1", sourceJobId: "job-admin", geometryHash };
  const fixture = client({
    ownerId: "owner-1",
    revision,
    job: { id: "job-admin", userId: "admin", sha256: sha },
    binding: {
      id: "binding-1",
      revisionId: revision.id,
      transform: "mirror_x",
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
      transform: "normal",
    }),
  });
  const args = fixture.writes[0]?.args as { create: Record<string, unknown> };
  assert.equal(args.create.revisionId, revision.id);
  assert.equal(args.create.sourceJobId, "job-admin");
  assert.equal(args.create.addressBindingId, "binding-1");
  assert.equal(args.create.transform, "normal");
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

console.log("floor-plan design reference persistence tests passed");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
