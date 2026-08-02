import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { retireFloorPlanRevisionWithoutReplacement } from "@/lib/floor-plan-imports/revision-retirement";

type Status = "draft" | "approved" | "published" | "retired";
type FakeRevision = {
  id: string;
  publicationStatus: Status;
  publishedAt: string | null;
};
type FakeAudit = {
  revisionId: string;
  eventType: string;
  sourceEvidenceJson: unknown;
  metadataJson: unknown;
};
type FakeState = { revision: FakeRevision; audits: FakeAudit[] };

function cloneState(state: FakeState): FakeState {
  return structuredClone(state);
}

class FakeAtomicDatabase {
  state: FakeState;
  failAudit = false;

  constructor(status: Status, publishedAt: string | null) {
    this.state = {
      revision: { id: "revision-1", publicationStatus: status, publishedAt },
      audits: [],
    };
  }

  async transaction<T>(operation: (tx: ReturnType<FakeAtomicDatabase["client"]>) => Promise<T>) {
    const working = cloneState(this.state);
    const result = await operation(this.client(working));
    this.state = working;
    return result;
  }

  private client(state: FakeState) {
    return {
      floorPlanRevision: {
        updateMany: async (args: {
          where: { id: string; publicationStatus: Status };
          data: { publicationStatus: "retired" };
        }) => {
          if (
            state.revision.id !== args.where.id ||
            state.revision.publicationStatus !== args.where.publicationStatus
          ) {
            return { count: 0 };
          }
          state.revision.publicationStatus = args.data.publicationStatus;
          return { count: 1 };
        },
      },
      floorPlanRevisionAuditEvent: {
        create: async (args: { data: FakeAudit }) => {
          if (this.failAudit) throw new Error("simulated audit failure");
          state.audits.push(structuredClone(args.data));
          return args.data;
        },
      },
    };
  }
}

const binding = {
  id: "binding-1",
  countryCode: "SG",
  addressNormalized: "810A Chai Chee St",
  block: "810A",
  street: "Chai Chee St",
  postalCode: null,
  stack: "509",
  floorMin: 2,
  floorMax: 15,
  transform: "normal",
  sourceEvidenceJson: { sourcePage: 7 },
};

function record(publicationStatus: Status) {
  return {
    id: "revision-1",
    sourceJobId: "job-1",
    publicationStatus,
    geometryHash: "a".repeat(64),
    sourceManifestJson: { sourceInventory: ["wall-1"] },
    constructionEvidenceJson: null,
    addressBindings: [binding],
    sourceJob: {
      candidateVersion: 5,
      sourceAsset: {
        id: "source-1",
        sha256: "b".repeat(64),
        mimeType: "application/pdf",
        fileName: "source.pdf",
      },
    },
  };
}

const actorEmail = "admin@example.com";
const occurredAt = new Date("2026-07-16T13:00:00.000Z");
const reason = "Source licence was withdrawn by the owner";

async function run() {
  for (const previousStatus of ["approved", "published"] as const) {
    const publishedAt =
      previousStatus === "published" ? "2026-07-16T12:00:00.000Z" : null;
    const database = new FakeAtomicDatabase(previousStatus, publishedAt);
    await database.transaction(async (tx) => {
      await retireFloorPlanRevisionWithoutReplacement({
        tx: tx as never,
        revision: record(previousStatus),
        actorEmail,
        occurredAt,
        reason,
      });
    });
    assert.equal(database.state.revision.publicationStatus, "retired");
    assert.equal(
      database.state.revision.publishedAt,
      publishedAt,
      "retirement must preserve the original publication timestamp"
    );
    assert.equal(database.state.audits.length, 1);
    assert.equal(database.state.audits[0].eventType, "revision_retired");
    assert.deepEqual(database.state.audits[0].metadataJson, {
      previousStatus,
      nextStatus: "retired",
      geometryHash: "a".repeat(64),
      candidateVersion: 5,
      addressBindingCount: 1,
      lifecycleReason: reason,
    });
    const sourceSnapshot = database.state.audits[0].sourceEvidenceJson as {
      addressBindings: unknown[];
      sourceAsset: { sha256: string };
    };
    assert.equal(sourceSnapshot.addressBindings.length, 1);
    assert.equal(sourceSnapshot.sourceAsset.sha256, "b".repeat(64));
  }

  const rollback = new FakeAtomicDatabase("published", "2026-07-16T12:00:00.000Z");
  rollback.failAudit = true;
  await assert.rejects(
    rollback.transaction((tx) =>
      retireFloorPlanRevisionWithoutReplacement({
        tx: tx as never,
        revision: record("published"),
        actorEmail,
        occurredAt,
        reason,
      })
    ),
    /simulated audit failure/
  );
  assert.equal(rollback.state.revision.publicationStatus, "published");
  assert.equal(rollback.state.audits.length, 0, "audit failure must roll back status too");

  const concurrent = new FakeAtomicDatabase("retired", "2026-07-16T12:00:00.000Z");
  await assert.rejects(
    concurrent.transaction((tx) =>
      retireFloorPlanRevisionWithoutReplacement({
        tx: tx as never,
        revision: record("published"),
        actorEmail,
        occurredAt,
        reason,
      })
    ),
    /RETIRE_CONFLICT/
  );
  assert.equal(concurrent.state.audits.length, 0);

  await assert.rejects(
    retireFloorPlanRevisionWithoutReplacement({
      tx: {} as never,
      revision: record("draft"),
      actorEmail,
      occurredAt,
      reason,
    }),
    /RETIRE_TARGET_NOT_APPROVED_OR_PUBLISHED/
  );
  await assert.rejects(
    retireFloorPlanRevisionWithoutReplacement({
      tx: {} as never,
      revision: record("retired"),
      actorEmail,
      occurredAt,
      reason,
    }),
    /RETIRE_ALREADY_RETIRED/
  );
  await assert.rejects(
    retireFloorPlanRevisionWithoutReplacement({
      tx: {} as never,
      revision: record("approved"),
      actorEmail,
      occurredAt,
      reason: "short",
    }),
    /RETIRE_REASON_REQUIRED/
  );

  const routePath = path.join(
    process.cwd(),
    "app/api/admin/floor-plan-imports/[id]/retire/route.ts"
  );
  const route = fs.readFileSync(routePath, "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /const session = await auth\(\)/);
  assert.match(route, /if \(!canAccessAdmin\(session\?\.user\?\.email\)\) return error\("Forbidden", 403\)/);
  assert.match(route, /confirmation !== `RETIRE \$\{revisionId\}`/);
  assert.match(route, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route, /publicationStatus === "approved" \? "ready" : "published"/);
  assert.match(route, /publicationStatus === "approved"[\s\S]*publishedAt === null[\s\S]*publishedAt !== null/);
  assert.match(route, /retireFloorPlanRevisionWithoutReplacement/);
  assert.doesNotMatch(
    route,
    /data:\s*\{[^}]*publishedAt:/,
    "standalone retirement must not rewrite publication evidence"
  );

  const workspace = [
    "app/admin/floor-plans/[id]/ApprovedRevisionPanel.tsx",
    "app/admin/floor-plans/[id]/useFloorPlanReviewWorkspace.ts",
    "app/admin/floor-plans/[id]/floorPlanReviewRequests.ts",
  ].map((fileName) =>
    fs.readFileSync(path.join(process.cwd(), fileName), "utf8")
  ).join("\n");
  assert.match(workspace, /Withdraw without replacement/);
  assert.match(workspace, /`RETIRE \$\{job\.revision\.id\}`/);
  assert.match(workspace, /\/api\/admin\/floor-plan-imports\/\$\{input\.jobId\}\/retire/);

  const publicCatalog = fs.readFileSync(
    path.join(process.cwd(), "lib/floor-plan-catalog-prisma.ts"),
    "utf8"
  );
  assert.match(
    publicCatalog,
    /publicationStatus: "published"/,
    "retired revisions must remain excluded from public search"
  );

  const publicRevisionRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/floor-plans/revisions/[id]/route.ts"),
    "utf8"
  );
  assert.match(publicRevisionRoute, /export const dynamic = "force-dynamic"/);
  assert.match(publicRevisionRoute, /export const revalidate = 0/);
  assert.match(publicRevisionRoute, /SAFE_PUBLIC_REVISION_CACHE_CONTROL = "no-store, max-age=0"/);
  assert.doesNotMatch(publicRevisionRoute, /stale-while-revalidate|"Cache-Control": "public/);
  assert.match(
    publicRevisionRoute,
    /if \(!revision\) \{[\s\S]*?return notFound\(\)/,
    "A retired revision lookup must fail closed with the same non-cacheable response."
  );

  console.log("Floor-plan standalone retirement tests passed.");
}

run().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
